use std::collections::HashMap;

use dbsp::DBSPHandle;
use dbsp::typed_batch::IndexedZSetReader;

use crate::circuit::{CircuitHandles, CompiledRule, compile_circuit};
use crate::rule::{Program, ProgramId};
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

    /// Install a program (claims + rules). Triggers circuit rebuild on next step.
    pub fn add_program(&mut self, program: Program) -> ProgramId {
        let id = self.next_program_id;
        self.next_program_id += 1;

        let installed = InstalledProgram {
            name: program.name,
            claims: program.claims,
            rules: program
                .rules
                .into_iter()
                .map(|r| CompiledRule {
                    patterns: r.patterns,
                    body: r.body,
                })
                .collect(),
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
    use crate::rule::RuleSpec;
    use crate::term::Term;
    use std::sync::Arc;
    use crate::{pat, stmt};

    fn cool_to_awesome_program() -> Program {
        Program {
            name: "cool_to_awesome".to_string(),
            claims: vec![],
            rules: vec![RuleSpec {
                patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
                body: Arc::new(|bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
                }),
            }],
        }
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

        // Program with a claim
        let program = Program {
            name: "claimer".to_string(),
            claims: vec![stmt![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("cool")
            ]],
            rules: vec![],
        };

        let pid = engine.add_program(program);
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
        let program = Program {
            name: "self_sufficient".to_string(),
            claims: vec![stmt![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("cool")
            ]],
            rules: vec![RuleSpec {
                patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
                body: Arc::new(|bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
                }),
            }],
        };

        let pid = engine.add_program(program);
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
        let p1 = engine.add_program(Program {
            name: "claimer".to_string(),
            claims: vec![stmt![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("cool")
            ]],
            rules: vec![],
        });

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
        engine.add_program(Program {
            name: "awesome_to_legendary".to_string(),
            claims: vec![],
            rules: vec![RuleSpec {
                patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("awesome")]],
                body: Arc::new(|bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("legendary")]]
                }),
            }],
        });

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
    fn test_join_rule_via_engine() {
        let mut engine = Engine::new();

        engine.add_program(Program {
            name: "join_test".to_string(),
            claims: vec![],
            rules: vec![RuleSpec {
                patterns: vec![
                    pat![bind("x"), exact_sym("is"), exact_sym("cool")],
                    pat![bind("x"), exact_sym("is"), exact_sym("tall")],
                ],
                body: Arc::new(|bindings| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("impressive")]]
                }),
            }],
        });

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
}
