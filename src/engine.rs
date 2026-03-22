use std::collections::HashMap;

use dbsp::DBSPHandle;
use dbsp::typed_batch::IndexedZSetReader;

use crate::circuit::{CircuitHandles, CompiledRule, compile_circuit};
use crate::pattern::Pattern;
use crate::rule::{Program, ProgramId, RuleSpec};
use crate::term::Statement;

/// A unique key for Hold! state.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct HoldKey {
    pub program_id: ProgramId,
    pub name: Option<String>,
}

/// The result of a single engine step — what changed.
pub struct StepResult {
    /// Fact deltas: (statement, weight). +1 = appeared, -1 = disappeared.
    pub deltas: Vec<(Statement, i64)>,
}

/// The main engine: manages programs, facts, and the DBSP circuit lifecycle.
pub struct Engine {
    /// Installed programs
    programs: HashMap<ProgramId, InstalledProgram>,
    /// Base facts asserted directly (not from programs)
    base_facts: Vec<Statement>,
    /// Hold! state: persists across program removal
    hold_state: HashMap<HoldKey, Vec<Statement>>,
    /// The compiled DBSP circuit + handles
    circuit: Option<DBSPHandle>,
    handles: Option<CircuitHandles>,
    /// Next program ID
    next_program_id: ProgramId,
    /// Pending fact deltas to push on next step
    pending_fact_deltas: Vec<(Statement, i64)>,
    /// Pending hold deltas to push on next step
    pending_hold_deltas: Vec<(Statement, i64)>,
    /// Whether the circuit needs to be rebuilt (rules changed)
    needs_rebuild: bool,
    /// Track all facts currently known to be alive (for computing deltas across rebuilds)
    current_facts: HashMap<Statement, i64>,
}

struct InstalledProgram {
    #[allow(dead_code)]
    name: String,
    claims: Vec<Statement>,
    rules: Vec<CompiledRule>,
}

/// Recursively flatten a RuleSpec (with PatternExpr and nested whens) into
/// a flat list of CompiledRules.
///
/// The PatternExpr is converted to DNF (disjunctive normal form): each OR branch
/// becomes a separate CompiledRule with the same body, and AND branches become
/// multi-pattern joins. Parent patterns from enclosing Whens are prepended to
/// each conjunction.
fn flatten_rule_spec(
    rule: RuleSpec,
    parent_patterns: &[Pattern],
    out: &mut Vec<CompiledRule>,
) {
    // Convert the pattern expression to DNF: Vec of conjunctions (Vec<Pattern>).
    // Each conjunction becomes a separate CompiledRule.
    let disjuncts = rule.pattern.to_dnf();

    for conjunction in &disjuncts {
        let mut full_patterns: Vec<Pattern> = parent_patterns.to_vec();
        full_patterns.extend(conjunction.clone());

        // Emit one CompiledRule per disjunct
        out.push(CompiledRule {
            patterns: full_patterns.clone(),
            body: rule.body.clone(),
        });

        // Recursively flatten nested whens under each disjunct.
        // Each nested when inherits the full pattern context of its parent branch.
        for nested in &rule.whens {
            flatten_nested_when(nested, &full_patterns, out);
        }
    }
}

/// Helper: flatten a borrowed nested RuleSpec (needs clone since we may emit it
/// multiple times for parent OR branches).
fn flatten_nested_when(
    rule: &RuleSpec,
    parent_patterns: &[Pattern],
    out: &mut Vec<CompiledRule>,
) {
    let disjuncts = rule.pattern.to_dnf();

    for conjunction in &disjuncts {
        let mut full_patterns: Vec<Pattern> = parent_patterns.to_vec();
        full_patterns.extend(conjunction.clone());

        out.push(CompiledRule {
            patterns: full_patterns.clone(),
            body: rule.body.clone(),
        });

        for nested in &rule.whens {
            flatten_nested_when(nested, &full_patterns, out);
        }
    }
}

impl Engine {
    /// Create a new engine with no programs and no facts.
    pub fn new() -> Self {
        Engine {
            programs: HashMap::new(),
            base_facts: Vec::new(),
            hold_state: HashMap::new(),
            circuit: None,
            handles: None,
            next_program_id: 1,
            pending_fact_deltas: Vec::new(),
            pending_hold_deltas: Vec::new(),
            needs_rebuild: true,
            current_facts: HashMap::new(),
        }
    }

    /// Get all currently-live facts (weight > 0).
    pub fn current_facts(&self) -> impl Iterator<Item = &Statement> {
        self.current_facts
            .iter()
            .filter(|(_, w)| **w > 0)
            .map(|(stmt, _)| stmt)
    }

    /// Install a program (claims + rules). Triggers circuit rebuild on next step.
    pub fn add_program(&mut self, program: Program) -> ProgramId {
        let id = self.next_program_id;
        self.next_program_id += 1;

        let mut compiled_rules = Vec::new();
        for rule in program.rules {
            flatten_rule_spec(rule, &[], &mut compiled_rules);
        }

        let installed = InstalledProgram {
            name: program.name,
            claims: program.claims,
            rules: compiled_rules,
        };

        self.programs.insert(id, installed);
        self.needs_rebuild = true;
        id
    }

    /// Remove a program. Its claims are retracted, its rules are removed.
    /// Hold! facts from this program are NOT retracted.
    /// Triggers circuit rebuild on next step.
    pub fn remove_program(&mut self, id: ProgramId) {
        self.programs.remove(&id);
        self.needs_rebuild = true;
    }

    /// Assert a base fact. Takes effect on next step().
    pub fn assert_fact(&mut self, stmt: Statement) {
        self.base_facts.push(stmt.clone());
        self.pending_fact_deltas.push((stmt, 1));
    }

    /// Retract a base fact. Takes effect on next step().
    pub fn retract_fact(&mut self, stmt: Statement) {
        self.base_facts.retain(|s| s != &stmt);
        self.pending_fact_deltas.push((stmt, -1));
    }

    /// Hold!: persistent fact with key-based overwrite.
    /// Previous hold for this key is retracted, new facts are asserted.
    pub fn hold(&mut self, key: HoldKey, stmts: Vec<Statement>) {
        // Retract old hold state for this key
        if let Some(old_stmts) = self.hold_state.get(&key) {
            for s in old_stmts {
                self.pending_hold_deltas.push((s.clone(), -1));
            }
        }

        // Assert new hold state
        for s in &stmts {
            self.pending_hold_deltas.push((s.clone(), 1));
        }

        self.hold_state.insert(key, stmts);
    }

    /// Run one step of the engine. Rebuilds circuit if needed, processes pending
    /// deltas, returns what changed.
    pub fn step(&mut self) -> StepResult {
        if self.needs_rebuild {
            // Save previous state before rebuild
            let old_facts = self.current_facts.clone();
            self.rebuild_circuit();
            self.needs_rebuild = false;

            // Step the rebuilt circuit to get the new full state
            self.circuit
                .as_mut()
                .expect("circuit must be built")
                .transaction()
                .unwrap();

            let handles = self.handles.as_ref().expect("circuit must be built");
            let output = handles.all_facts_output.consolidate();

            // The rebuilt circuit outputs +1 for everything in its initial state
            let mut new_facts: HashMap<Statement, i64> = HashMap::new();
            for (s, (), w) in output.iter() {
                *new_facts.entry(s.clone()).or_insert(0) += w;
            }
            new_facts.retain(|_, v| *v != 0);

            // Compute delta: what appeared and what disappeared
            let mut deltas = Vec::new();

            // Facts that are new or were not present before
            for (stmt, &new_w) in &new_facts {
                let old_w = old_facts.get(stmt).copied().unwrap_or(0);
                if old_w == 0 && new_w > 0 {
                    deltas.push((stmt.clone(), 1));
                }
            }

            // Facts that disappeared
            for (stmt, &old_w) in &old_facts {
                if old_w > 0 && new_facts.get(stmt).copied().unwrap_or(0) == 0 {
                    deltas.push((stmt.clone(), -1));
                }
            }

            self.current_facts = new_facts;
            return StepResult { deltas };
        }

        let handles = self.handles.as_ref().expect("circuit must be built");

        // Push pending fact deltas
        for (stmt, weight) in self.pending_fact_deltas.drain(..) {
            handles.facts_input.push(stmt, weight);
        }

        // Push pending hold deltas
        for (stmt, weight) in self.pending_hold_deltas.drain(..) {
            handles.hold_input.push(stmt, weight);
        }

        // Execute one step
        self.circuit
            .as_mut()
            .expect("circuit must be built")
            .transaction()
            .unwrap();

        // Collect output deltas from DBSP
        let output = handles.all_facts_output.consolidate();
        let raw_deltas: Vec<(Statement, i64)> =
            output.iter().map(|(s, (), w)| (s.clone(), w)).collect();

        // Update current_facts tracking
        let mut deltas = Vec::new();
        for (stmt, weight) in raw_deltas {
            let entry = self.current_facts.entry(stmt.clone()).or_insert(0);
            let was_present = *entry > 0;
            *entry += weight;
            let is_present = *entry > 0;

            if !was_present && is_present {
                deltas.push((stmt, 1));
            } else if was_present && !is_present {
                deltas.push((stmt, -1));
            }
        }

        // Clean up zero entries
        self.current_facts.retain(|_, v| *v != 0);

        StepResult { deltas }
    }

    /// Rebuild the circuit from current rule set.
    /// Re-injects all current facts (base + hold).
    fn rebuild_circuit(&mut self) {
        // Kill old circuit if any
        if let Some(old) = self.circuit.take() {
            let _ = old.kill();
        }
        self.handles = None;

        // Collect all rules from all programs
        let rules: Vec<CompiledRule> = self
            .programs
            .values()
            .flat_map(|p| {
                p.rules.iter().map(|r| CompiledRule {
                    patterns: r.patterns.clone(),
                    body: r.body.clone(),
                })
            })
            .collect();

        let (dbsp, handles) = compile_circuit(rules);

        // Re-inject all current base facts
        let mut all_base_facts: Vec<Statement> = self.base_facts.clone();
        // Also include program claims
        for p in self.programs.values() {
            all_base_facts.extend(p.claims.iter().cloned());
        }
        for stmt in &all_base_facts {
            handles.facts_input.push(stmt.clone(), 1);
        }

        // Re-inject all hold state
        for stmts in self.hold_state.values() {
            for stmt in stmts {
                handles.hold_input.push(stmt.clone(), 1);
            }
        }

        // Clear pending deltas since we just re-injected everything
        self.pending_fact_deltas.clear();
        self.pending_hold_deltas.clear();

        self.circuit = Some(dbsp);
        self.handles = Some(handles);
    }
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        if let Some(circuit) = self.circuit.take() {
            let _ = circuit.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::{bind, exact_sym};
    use crate::rule::{all, any, RuleSpec};
    use crate::term::Term;
    use crate::{pat, stmt};

    fn cool_to_awesome_program() -> Program {
        Program::new("cool_to_awesome").with_rules(vec![RuleSpec::new(
            vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
            |bindings| {
                let x = bindings.get("x").unwrap().clone();
                vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
            },
        )])
    }

    #[test]
    fn test_basic_engine_lifecycle() {
        let mut engine = Engine::new();

        let pid = engine.add_program(cool_to_awesome_program());
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);

        let result = engine.step();

        // Should have: omar is cool (+1), omar is awesome (+1)
        assert_eq!(result.deltas.len(), 2);
        assert!(result.deltas.iter().all(|(_, w)| *w == 1));

        // Retract the fact
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        let result = engine.step();

        // Both should be retracted
        assert_eq!(result.deltas.len(), 2);
        assert!(result.deltas.iter().all(|(_, w)| *w == -1));

        // Remove program (no-op since no facts)
        engine.remove_program(pid);
        let result = engine.step();
        // Rebuild happened but no facts to process
        assert!(result.deltas.is_empty());
    }

    #[test]
    fn test_program_claims() {
        let mut engine = Engine::new();

        let pid = engine.add_program(
            Program::new("claimer").with_claims(vec![stmt![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("cool")
            ]]),
        );
        let result = engine.step();

        // Claim should appear
        assert_eq!(result.deltas.len(), 1);
        assert_eq!(
            result.deltas[0].0,
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]
        );

        // Remove program — claim should be retracted
        engine.remove_program(pid);
        let result = engine.step();

        assert_eq!(result.deltas.len(), 1);
        assert_eq!(result.deltas[0].1, -1);
    }

    #[test]
    fn test_program_with_claims_and_rules() {
        let mut engine = Engine::new();

        // Program claims "omar is cool" AND has rule cool -> awesome
        let pid = engine.add_program(
            Program::new("self_sufficient")
                .with_claims(vec![stmt![
                    Term::sym("omar"),
                    Term::sym("is"),
                    Term::sym("cool")
                ]])
                .with_rules(vec![RuleSpec::new(
                    vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
                    |bindings| {
                        let x = bindings.get("x").unwrap().clone();
                        vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
                    },
                )]),
        );
        let result = engine.step();

        // cool (claim) + awesome (derived) = 2
        assert_eq!(result.deltas.len(), 2);

        // Remove program — everything should retract
        engine.remove_program(pid);
        let result = engine.step();

        assert_eq!(result.deltas.len(), 2);
        assert!(result.deltas.iter().all(|(_, w)| *w == -1));
    }

    #[test]
    fn test_hold_persists_after_program_removal() {
        let mut engine = Engine::new();

        let pid = engine.add_program(cool_to_awesome_program());

        // Hold a fact
        engine.hold(
            HoldKey {
                program_id: pid,
                name: None,
            },
            vec![stmt![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("cool")
            ]],
        );

        let result = engine.step();
        // cool (hold) + awesome (derived) = 2
        assert_eq!(result.deltas.len(), 2);

        // Remove the program (rule goes away, but hold fact stays)
        engine.remove_program(pid);
        let result = engine.step();

        // The rule is gone, so "awesome" should be retracted (-1).
        // But "cool" stays because it's held — no delta for cool.
        let awesome_retracted = result.deltas.iter().any(|(s, w)| {
            *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("awesome")] && *w == -1
        });
        assert!(awesome_retracted, "awesome should be retracted after rule removed");

        let cool_changed = result
            .deltas
            .iter()
            .any(|(s, _)| *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        assert!(!cool_changed, "hold fact should persist (no delta)");

        // Verify the hold fact is still tracked
        assert!(
            engine.current_facts.contains_key(&stmt![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("cool")
            ]),
            "hold fact should still be in current_facts"
        );
    }

    #[test]
    fn test_hold_overwrite() {
        let mut engine = Engine::new();

        engine.add_program(cool_to_awesome_program());

        let key = HoldKey {
            program_id: 0,
            name: Some("counter".to_string()),
        };

        // Hold first value
        engine.hold(key.clone(), vec![stmt![Term::sym("count"), Term::int(1)]]);
        let result = engine.step();
        assert!(result
            .deltas
            .iter()
            .any(|(s, w)| *s == stmt![Term::sym("count"), Term::int(1)] && *w == 1));

        // Overwrite with second value
        engine.hold(key.clone(), vec![stmt![Term::sym("count"), Term::int(2)]]);
        let result = engine.step();
        // Old value retracted, new value asserted
        assert!(result
            .deltas
            .iter()
            .any(|(s, w)| *s == stmt![Term::sym("count"), Term::int(1)] && *w == -1));
        assert!(result
            .deltas
            .iter()
            .any(|(s, w)| *s == stmt![Term::sym("count"), Term::int(2)] && *w == 1));
    }

    #[test]
    fn test_multiple_programs_interact() {
        let mut engine = Engine::new();

        // Program 1: claims omar is cool
        let p1 = engine.add_program(
            Program::new("claimer").with_claims(vec![stmt![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("cool")
            ]]),
        );

        // Program 2: cool -> awesome rule
        let _p2 = engine.add_program(cool_to_awesome_program());

        let result = engine.step();
        // cool (from p1 claim) + awesome (from p2 rule) = 2
        assert_eq!(result.deltas.len(), 2);

        // Remove p1 — its claim goes away, so p2's derived fact also goes
        engine.remove_program(p1);
        let result = engine.step();

        // After rebuild: only p2's rule exists, no facts -> no output
        // Old cool + awesome are gone (retracted via rebuild delta)
        assert!(result.deltas.is_empty() || result.deltas.iter().all(|(_, w)| *w == -1));
    }

    #[test]
    fn test_chained_rules_across_programs() {
        let mut engine = Engine::new();

        // Program 1: cool -> awesome
        engine.add_program(cool_to_awesome_program());

        // Program 2: awesome -> legendary
        engine.add_program(
            Program::new("awesome_to_legendary").with_rules(vec![RuleSpec::new(
                vec![pat![bind("x"), exact_sym("is"), exact_sym("awesome")]],
                |bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("legendary")]]
                },
            )]),
        );

        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        let result = engine.step();

        // cool + awesome + legendary = 3
        assert_eq!(result.deltas.len(), 3);

        // Retract cool -> all cascade away
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        let result = engine.step();

        assert_eq!(result.deltas.len(), 3);
        assert!(result.deltas.iter().all(|(_, w)| *w == -1));
    }

    #[test]
    fn test_nested_when_conditional_branching() {
        // A single outer When matches [x] has-mood [mood], and declares nested
        // Whens that fire only while the parent matches.
        //
        // When [x] is cool:
        //   When [x] has-mood happy:  → claim [x] should smile
        //   When [x] has-mood sad:    → claim [x] should cry
        //
        // Changing mood retracts the old nested when's output and claims the new one.
        let mut engine = Engine::new();

        engine.add_program(
            Program::new("mood_reactions").with_rules(vec![
                // Outer when: [x] is cool
                RuleSpec::new(
                    vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
                    |_| vec![], // outer body claims nothing on its own
                )
                .with_whens(vec![
                    // Nested: when [x] has-mood happy → smile
                    RuleSpec::new(
                        vec![pat![bind("x"), exact_sym("has-mood"), exact_sym("happy")]],
                        |bindings| {
                            let x = bindings.get("x").unwrap().clone();
                            vec![stmt![x, Term::sym("should"), Term::sym("smile")]]
                        },
                    ),
                    // Nested: when [x] has-mood sad → cry
                    RuleSpec::new(
                        vec![pat![bind("x"), exact_sym("has-mood"), exact_sym("sad")]],
                        |bindings| {
                            let x = bindings.get("x").unwrap().clone();
                            vec![stmt![x, Term::sym("should"), Term::sym("cry")]]
                        },
                    ),
                ]),
            ]),
        );

        // omar is cool AND happy
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("has-mood"),
            Term::sym("happy")
        ]);
        let result = engine.step();

        // is cool, has-mood happy, should smile = 3
        assert_eq!(result.deltas.len(), 3);
        assert!(result.deltas.iter().all(|(_, w)| *w == 1));
        assert!(result.deltas.iter().any(|(s, _)| *s
            == stmt![Term::sym("omar"), Term::sym("should"), Term::sym("smile")]));

        // Change mood: retract happy, assert sad
        engine.retract_fact(stmt![
            Term::sym("omar"),
            Term::sym("has-mood"),
            Term::sym("happy")
        ]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("has-mood"),
            Term::sym("sad")
        ]);
        let result = engine.step();

        let appeared: Vec<_> = result
            .deltas
            .iter()
            .filter(|(_, w)| *w == 1)
            .map(|(s, _)| s.clone())
            .collect();
        let disappeared: Vec<_> = result
            .deltas
            .iter()
            .filter(|(_, w)| *w == -1)
            .map(|(s, _)| s.clone())
            .collect();

        // Old: has-mood happy (-1), should smile (-1)
        // New: has-mood sad (+1), should cry (+1)
        assert_eq!(appeared.len(), 2, "2 facts should appear: {:?}", appeared);
        assert_eq!(
            disappeared.len(),
            2,
            "2 facts should disappear: {:?}",
            disappeared
        );
        assert!(disappeared
            .contains(&stmt![Term::sym("omar"), Term::sym("should"), Term::sym("smile")]));
        assert!(
            appeared.contains(&stmt![Term::sym("omar"), Term::sym("should"), Term::sym("cry")])
        );

        // Retract "is cool" entirely — nested when output should also retract
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        let result = engine.step();

        let disappeared: Vec<_> = result
            .deltas
            .iter()
            .filter(|(_, w)| *w == -1)
            .map(|(s, _)| s.clone())
            .collect();
        // "is cool" and "should cry" both retract (has-mood sad stays as a base fact)
        assert!(disappeared
            .contains(&stmt![Term::sym("omar"), Term::sym("should"), Term::sym("cry")]));
        assert!(disappeared.contains(&stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("cool")
        ]));
    }

    #[test]
    fn test_nested_when_parent_body_plus_child() {
        // The outer When both claims its own facts AND has nested Whens.
        // When the outer match disappears, both the parent's claims and
        // the nested when's claims retract.
        //
        // When [x] is cool:
        //   Claim [x] is awesome          (parent body)
        //   When [x] is tall:
        //     Claim [x] is impressive     (nested when)
        let mut engine = Engine::new();

        engine.add_program(
            Program::new("cool_with_nested").with_rules(vec![RuleSpec::new(
                vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
                |bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
                },
            )
            .with_whens(vec![RuleSpec::new(
                vec![pat![bind("x"), exact_sym("is"), exact_sym("tall")]],
                |bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("impressive")]]
                },
            )])]),
        );

        // Assert cool and tall
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("tall")]);
        let result = engine.step();

        // cool, tall, awesome (parent body), impressive (nested) = 4
        assert_eq!(result.deltas.len(), 4);
        assert!(result.deltas.iter().all(|(_, w)| *w == 1));
        assert!(result.deltas.iter().any(|(s, _)| *s
            == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("impressive")]));

        // Retract "cool" — parent body output AND nested when output should retract
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        let result = engine.step();

        let disappeared: Vec<_> = result
            .deltas
            .iter()
            .filter(|(_, w)| *w == -1)
            .map(|(s, _)| s.clone())
            .collect();

        // cool, awesome, and impressive all retract (tall stays as base fact)
        assert_eq!(disappeared.len(), 3, "3 should retract: {:?}", disappeared);
        assert!(disappeared.contains(&stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("awesome")
        ]));
        assert!(disappeared.contains(&stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("impressive")
        ]));
    }

    #[test]
    fn test_nested_whens_multiple_entities_independent() {
        // Two entities with nested whens — changing one shouldn't affect the other.
        //
        // When [x] is cool:
        //   When [x] has-mood happy: claim [x] should smile
        //   When [x] has-mood sad:   claim [x] should cry
        let mut engine = Engine::new();

        engine.add_program(
            Program::new("mood_reactions").with_rules(vec![RuleSpec::new(
                vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
                |_| vec![],
            )
            .with_whens(vec![
                RuleSpec::new(
                    vec![pat![bind("x"), exact_sym("has-mood"), exact_sym("happy")]],
                    |bindings| {
                        let x = bindings.get("x").unwrap().clone();
                        vec![stmt![x, Term::sym("should"), Term::sym("smile")]]
                    },
                ),
                RuleSpec::new(
                    vec![pat![bind("x"), exact_sym("has-mood"), exact_sym("sad")]],
                    |bindings| {
                        let x = bindings.get("x").unwrap().clone();
                        vec![stmt![x, Term::sym("should"), Term::sym("cry")]]
                    },
                ),
            ])]),
        );

        // omar is cool+happy, alice is cool+sad
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("has-mood"),
            Term::sym("happy")
        ]);
        engine.assert_fact(stmt![Term::sym("alice"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![
            Term::sym("alice"),
            Term::sym("has-mood"),
            Term::sym("sad")
        ]);
        let result = engine.step();

        // omar: is cool, has-mood happy, should smile = 3
        // alice: is cool, has-mood sad, should cry = 3
        assert_eq!(result.deltas.len(), 6);

        // Change only omar to sad — alice should be unaffected
        engine.retract_fact(stmt![
            Term::sym("omar"),
            Term::sym("has-mood"),
            Term::sym("happy")
        ]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("has-mood"),
            Term::sym("sad")
        ]);
        let result = engine.step();

        let appeared: Vec<_> = result
            .deltas
            .iter()
            .filter(|(_, w)| *w == 1)
            .map(|(s, _)| s.clone())
            .collect();
        let disappeared: Vec<_> = result
            .deltas
            .iter()
            .filter(|(_, w)| *w == -1)
            .map(|(s, _)| s.clone())
            .collect();

        // omar: smile retracts, cry appears (+ mood change)
        assert_eq!(disappeared.len(), 2);
        assert_eq!(appeared.len(), 2);

        // No alice facts should change
        assert!(!appeared
            .iter()
            .any(|s| s.terms[0] == Term::sym("alice")));
        assert!(!disappeared
            .iter()
            .any(|s| s.terms[0] == Term::sym("alice")));
    }

    #[test]
    fn test_join_rule_via_engine() {
        let mut engine = Engine::new();

        engine.add_program(
            Program::new("join_test").with_rules(vec![RuleSpec::new(
                vec![
                    pat![bind("x"), exact_sym("is"), exact_sym("cool")],
                    pat![bind("x"), exact_sym("is"), exact_sym("tall")],
                ],
                |bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("impressive")]]
                },
            )]),
        );

        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("tall")]);
        let result = engine.step();

        // cool + tall + impressive = 3
        assert_eq!(result.deltas.len(), 3);

        // Retract one side of join
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("tall")]);
        let result = engine.step();

        // tall (-1) + impressive (-1) = -2
        assert_eq!(result.deltas.len(), 2);
        assert!(result.deltas.iter().all(|(_, w)| *w == -1));
    }

    #[test]
    fn test_or_pattern_fires_on_either_branch() {
        // When [x] is cool OR [x] is awesome → claim [x] is notable
        let mut engine = Engine::new();

        engine.add_program(
            Program::new("or_test").with_rules(vec![RuleSpec::new(
                any([
                    pat![bind("x"), exact_sym("is"), exact_sym("cool")],
                    pat![bind("x"), exact_sym("is"), exact_sym("awesome")],
                ]),
                |bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("notable")]]
                },
            )]),
        );

        // Assert cool — should fire
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        let result = engine.step();

        assert!(result
            .deltas
            .iter()
            .any(|(s, w)| *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("notable")]
                && *w == 1));

        // Retract cool, assert awesome — should still be notable (different branch)
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("awesome")
        ]);
        let result = engine.step();

        // cool retracts, awesome appears — but notable stays (OR semantics)
        let notable_retracted = result
            .deltas
            .iter()
            .any(|(s, w)| *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("notable")]
                && *w == -1);
        assert!(
            !notable_retracted,
            "notable should NOT retract when switching OR branches"
        );
    }

    #[test]
    fn test_or_pattern_retracts_when_all_branches_gone() {
        // When [x] is cool OR [x] is awesome → claim [x] is notable
        let mut engine = Engine::new();

        engine.add_program(
            Program::new("or_test").with_rules(vec![RuleSpec::new(
                any([
                    pat![bind("x"), exact_sym("is"), exact_sym("cool")],
                    pat![bind("x"), exact_sym("is"), exact_sym("awesome")],
                ]),
                |bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("notable")]]
                },
            )]),
        );

        // Both branches match
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("awesome")
        ]);
        let result = engine.step();

        assert!(result
            .deltas
            .iter()
            .any(|(s, w)| *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("notable")]
                && *w == 1));

        // Retract one — notable persists
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        let result = engine.step();

        let notable_changed = result.deltas.iter().any(|(s, _)| {
            *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("notable")]
        });
        assert!(!notable_changed, "notable should persist with one branch");

        // Retract the other — now notable retracts
        engine.retract_fact(stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("awesome")
        ]);
        let result = engine.step();

        assert!(result
            .deltas
            .iter()
            .any(|(s, w)| *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("notable")]
                && *w == -1));
    }

    #[test]
    fn test_and_or_nested_expression() {
        // (cool OR awesome) AND tall → impressive
        // This should fire when (cool AND tall) or (awesome AND tall).
        let mut engine = Engine::new();

        engine.add_program(
            Program::new("complex_bool").with_rules(vec![RuleSpec::new(
                all([
                    any([
                        pat![bind("x"), exact_sym("is"), exact_sym("cool")],
                        pat![bind("x"), exact_sym("is"), exact_sym("awesome")],
                    ]),
                    pat![bind("x"), exact_sym("is"), exact_sym("tall")].into(),
                ]),
                |bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("impressive")]]
                },
            )]),
        );

        // Just tall — no match (need cool or awesome too)
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("tall")]);
        let result = engine.step();

        let has_impressive = result.deltas.iter().any(|(s, _)| {
            *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("impressive")]
        });
        assert!(!has_impressive, "tall alone shouldn't produce impressive");

        // Add cool — now cool AND tall fires
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        let result = engine.step();

        assert!(result.deltas.iter().any(|(s, w)| *s
            == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("impressive")]
            && *w == 1));

        // Switch cool → awesome — impressive should persist (awesome AND tall)
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("awesome")
        ]);
        let result = engine.step();

        let impressive_retracted = result.deltas.iter().any(|(s, w)| {
            *s == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("impressive")] && *w == -1
        });
        assert!(
            !impressive_retracted,
            "impressive should persist when switching OR branches"
        );

        // Retract tall — now neither branch has tall, impressive retracts
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("tall")]);
        let result = engine.step();

        assert!(result.deltas.iter().any(|(s, w)| *s
            == stmt![Term::sym("omar"), Term::sym("is"), Term::sym("impressive")]
            && *w == -1));
    }

    #[test]
    fn test_or_with_nested_whens() {
        // Outer when uses OR, and has nested whens inside:
        //
        // When [x] is cool OR [x] is awesome:
        //   When [x] has-mood happy:
        //     Claim [x] should celebrate
        let mut engine = Engine::new();

        engine.add_program(
            Program::new("or_with_nested").with_rules(vec![RuleSpec::new(
                any([
                    pat![bind("x"), exact_sym("is"), exact_sym("cool")],
                    pat![bind("x"), exact_sym("is"), exact_sym("awesome")],
                ]),
                |_| vec![],
            )
            .with_whens(vec![RuleSpec::new(
                vec![pat![bind("x"), exact_sym("has-mood"), exact_sym("happy")]],
                |bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("should"), Term::sym("celebrate")]]
                },
            )])]),
        );

        // cool + happy → should celebrate
        engine.assert_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("has-mood"),
            Term::sym("happy")
        ]);
        let result = engine.step();

        assert!(result.deltas.iter().any(|(s, w)| *s
            == stmt![Term::sym("omar"), Term::sym("should"), Term::sym("celebrate")]
            && *w == 1));

        // Switch cool → awesome — nested when should still fire (parent OR still matches)
        engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        engine.assert_fact(stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("awesome")
        ]);
        let result = engine.step();

        let celebrate_retracted = result.deltas.iter().any(|(s, w)| {
            *s == stmt![Term::sym("omar"), Term::sym("should"), Term::sym("celebrate")]
                && *w == -1
        });
        assert!(
            !celebrate_retracted,
            "celebrate should persist when switching parent OR branches"
        );

        // Retract awesome — no parent match, nested when output retracts
        engine.retract_fact(stmt![
            Term::sym("omar"),
            Term::sym("is"),
            Term::sym("awesome")
        ]);
        let result = engine.step();

        assert!(result.deltas.iter().any(|(s, w)| *s
            == stmt![Term::sym("omar"), Term::sym("should"), Term::sym("celebrate")]
            && *w == -1));
    }
}
