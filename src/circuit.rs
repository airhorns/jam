use std::sync::Arc;

use dbsp::{DBSPHandle, OrdIndexedZSet, OrdZSet, OutputHandle, Runtime, ZSetHandle};

use crate::pattern::{Bindings, Pattern, PatternTerm};
use crate::rule::BodyFn;
use crate::term::{Statement, Term};

/// A compiled rule ready for circuit construction.
pub struct CompiledRule {
    pub patterns: Vec<Pattern>,
    pub body: BodyFn,
}

/// Handles for interacting with a compiled circuit.
pub struct CircuitHandles {
    pub facts_input: ZSetHandle<Statement>,
    pub hold_input: ZSetHandle<Statement>,
    pub all_facts_output: OutputHandle<OrdZSet<Statement>>,
}

/// Extract a prefix key from a pattern: the tuple of (length, leading exact terms).
/// This is used to index facts so that each rule only processes matching candidates.
/// For example, pattern [Exact("counter"), Exact("count"), Bind("v")] → key (3, ["counter", "count"]).
fn pattern_prefix_key(pattern: &Pattern) -> (usize, Vec<Term>) {
    let len = pattern.terms.len();
    let prefix: Vec<Term> = pattern
        .terms
        .iter()
        .take_while(|t| matches!(t, PatternTerm::Exact(_)))
        .map(|t| match t {
            PatternTerm::Exact(term) => term.clone(),
            _ => unreachable!(),
        })
        .collect();
    (len, prefix)
}

/// Extract the same prefix key from a statement, given a prefix length.
fn statement_prefix_key(stmt: &Statement, prefix_len: usize) -> Vec<Term> {
    stmt.terms.iter().take(prefix_len).cloned().collect()
}

/// The key type for the prefix index: (statement_length, prefix_terms).
/// Using a Vec<Term> is fine since Term derives all the DBSP traits.
type PrefixKey = (usize, Vec<Term>);

/// Build a DBSP circuit from a set of compiled rules.
pub fn compile_circuit(rules: Vec<CompiledRule>) -> (DBSPHandle, CircuitHandles) {
    // Separate rules by arity and wrap in Arc for Send
    let single_rules: Arc<Vec<(Pattern, BodyFn)>> = Arc::new(
        rules
            .iter()
            .filter(|r| r.patterns.len() == 1)
            .map(|r| (r.patterns[0].clone(), r.body.clone()))
            .collect(),
    );

    #[allow(clippy::type_complexity)]
    let join_rules: Arc<Vec<(Pattern, Pattern, Vec<String>, BodyFn)>> = Arc::new(
        rules
            .iter()
            .filter(|r| r.patterns.len() == 2)
            .map(|r| {
                let shared = find_shared_vars(&r.patterns[0], &r.patterns[1]);
                (
                    r.patterns[0].clone(),
                    r.patterns[1].clone(),
                    shared,
                    r.body.clone(),
                )
            })
            .collect(),
    );

    for r in &rules {
        assert!(
            r.patterns.len() <= 2,
            "Rules with {} patterns not yet supported (max 2)",
            r.patterns.len()
        );
        assert!(!r.patterns.is_empty(), "Rule must have at least one pattern");
    }

    let has_rules = !single_rules.is_empty() || !join_rules.is_empty();

    let (dbsp, handles) = Runtime::init_circuit(1, move |circuit| {
        let (base_facts_stream, facts_handle) = circuit.add_input_zset::<Statement>();
        let (hold_stream, hold_handle) = circuit.add_input_zset::<Statement>();

        let external_facts = base_facts_stream.plus(&hold_stream);

        if !has_rules {
            let output = external_facts.output();
            return Ok(CircuitHandles {
                facts_input: facts_handle,
                hold_input: hold_handle,
                all_facts_output: output,
            });
        }

        let single_rules = single_rules.clone();
        let join_rules = join_rules.clone();

        let derived = circuit
            .recursive(
                move |child, feedback: dbsp::Stream<_, OrdZSet<Statement>>| {
                    let base = external_facts.delta0(child);
                    let all_facts = base.plus(&feedback);

                    let mut combined: Option<dbsp::Stream<_, OrdZSet<Statement>>> = None;

                    // Single-pattern rules: index facts by prefix, then flat_map only matching ones.
                    // This avoids O(R×F) — each rule only processes facts matching its prefix.
                    for (pattern, body) in single_rules.iter() {
                        let pattern = pattern.clone();
                        let body = body.clone();
                        let (key_len, key_prefix) = pattern_prefix_key(&pattern);
                        let prefix_len = key_prefix.len();

                        // Index facts by (length, exact_prefix) → only matching values reach flat_map
                        let indexed: dbsp::Stream<_, OrdIndexedZSet<PrefixKey, Statement>> =
                            all_facts.map_index(move |stmt| {
                                let prefix = statement_prefix_key(stmt, prefix_len);
                                ((stmt.terms.len(), prefix), stmt.clone())
                            });

                        // flat_map on the indexed stream, filtering by prefix key.
                        // Note: flat_map doesn't expose weights, so is_insertion is always true.
                        // For callback correctness during decrements, fire_event does a targeted
                        // re-derive after stepping.
                        let key_for_filter = (key_len, key_prefix);
                        let derived = indexed.flat_map(move |(key, stmt)| {
                            if *key != key_for_filter {
                                return vec![];
                            }
                            if let Some(bindings) = pattern.match_statement(stmt) {
                                body(&bindings, true)
                            } else {
                                vec![]
                            }
                        });

                        combined = Some(match combined {
                            None => derived,
                            Some(existing) => existing.plus(&derived),
                        });
                    }

                    // Two-pattern join rules (unchanged — join doesn't have the callback issue)
                    for (p1, p2, shared, body) in join_rules.iter() {
                        let p1 = p1.clone();
                        let p2 = p2.clone();
                        let shared = shared.clone();
                        let body = body.clone();

                        let shared1 = shared.clone();
                        let p1c = p1.clone();
                        let matches1 = all_facts
                            .flat_map(move |stmt| {
                                p1c.match_statement(stmt)
                                    .map(|b| {
                                        let key = make_join_key(&shared1, &b);
                                        (key, b)
                                    })
                                    .into_iter()
                            })
                            .map_index(|(k, v)| (k.clone(), v.clone()));

                        let shared2 = shared.clone();
                        let p2c = p2.clone();
                        let matches2 = all_facts
                            .flat_map(move |stmt| {
                                p2c.match_statement(stmt)
                                    .map(|b| {
                                        let key = make_join_key(&shared2, &b);
                                        (key, b)
                                    })
                                    .into_iter()
                            })
                            .map_index(|(k, v)| (k.clone(), v.clone()));

                        let joined = matches1
                            .join(&matches2, move |_key, b1, b2| {
                                let mut merged = b1.clone();
                                merged.extend(b2.iter().map(|(k, v)| (k.clone(), v.clone())));
                                // join doesn't expose weights, treat as insertion
                                body(&merged, true)
                            })
                            .flat_map(|stmts| stmts.clone());

                        combined = Some(match combined {
                            None => joined,
                            Some(existing) => existing.plus(&joined),
                        });
                    }

                    Ok(combined.unwrap())
                },
            )
            .unwrap();

        let all_facts = base_facts_stream.plus(&hold_stream).plus(&derived);
        let output = all_facts.output();

        Ok(CircuitHandles {
            facts_input: facts_handle,
            hold_input: hold_handle,
            all_facts_output: output,
        })
    })
    .unwrap();

    (dbsp, handles)
}

fn make_join_key(shared_vars: &[String], bindings: &Bindings) -> Vec<Term> {
    shared_vars
        .iter()
        .map(|v| bindings.get(v).cloned().unwrap_or(Term::Nil))
        .collect()
}

fn find_shared_vars(p1: &Pattern, p2: &Pattern) -> Vec<String> {
    use std::collections::HashSet;

    let vars1: HashSet<&str> = p1
        .terms
        .iter()
        .filter_map(|t| match t {
            PatternTerm::Bind(v) => Some(v.as_str()),
            _ => None,
        })
        .collect();

    let vars2: HashSet<&str> = p2
        .terms
        .iter()
        .filter_map(|t| match t {
            PatternTerm::Bind(v) => Some(v.as_str()),
            _ => None,
        })
        .collect();

    let mut shared: Vec<String> = vars1
        .intersection(&vars2)
        .map(|s| s.to_string())
        .collect();
    shared.sort();
    shared
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::{bind, exact_sym};
    use crate::term::Term;
    use crate::{pat, stmt};
    use dbsp::ZSet;

    #[test]
    fn test_single_rule_derive_and_retract() {
        let rules = vec![CompiledRule {
            patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
            body: Arc::new(|bindings, _is_insertion| {
                let x = bindings.get("x").unwrap().clone();
                vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
            }),
        }];

        let (mut circuit, handles) = compile_circuit(rules);

        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            1,
        );
        circuit.transaction().unwrap();

        let output = handles.all_facts_output.consolidate();
        assert_eq!(output.weighted_count(), 2);

        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            -1,
        );
        circuit.transaction().unwrap();

        let output = handles.all_facts_output.consolidate();
        assert_eq!(output.weighted_count(), -2);

        circuit.kill().unwrap();
    }

    #[test]
    fn test_chained_rules_cascade_retraction() {
        let rules = vec![
            CompiledRule {
                patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
                body: Arc::new(|bindings, _is_insertion| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
                }),
            },
            CompiledRule {
                patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("awesome")]],
                body: Arc::new(|bindings, _is_insertion| {
                    let x = bindings.get("x").unwrap().clone();
                    vec![stmt![x, Term::sym("is"), Term::sym("legendary")]]
                }),
            },
        ];

        let (mut circuit, handles) = compile_circuit(rules);

        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            1,
        );
        circuit.transaction().unwrap();

        assert_eq!(
            handles.all_facts_output.consolidate().weighted_count(),
            3
        );

        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            -1,
        );
        circuit.transaction().unwrap();

        assert_eq!(
            handles.all_facts_output.consolidate().weighted_count(),
            -3
        );

        circuit.kill().unwrap();
    }

    #[test]
    fn test_two_pattern_join_rule() {
        let rules = vec![CompiledRule {
            patterns: vec![
                pat![bind("x"), exact_sym("is"), exact_sym("cool")],
                pat![bind("x"), exact_sym("is"), exact_sym("tall")],
            ],
            body: Arc::new(|bindings, _is_insertion| {
                let x = bindings.get("x").unwrap().clone();
                vec![stmt![x, Term::sym("is"), Term::sym("impressive")]]
            }),
        }];

        let (mut circuit, handles) = compile_circuit(rules);

        // Only cool — no join
        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            1,
        );
        circuit.transaction().unwrap();
        assert_eq!(handles.all_facts_output.consolidate().weighted_count(), 1);

        // Add tall — join fires
        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("tall")],
            1,
        );
        circuit.transaction().unwrap();
        assert_eq!(handles.all_facts_output.consolidate().weighted_count(), 2);

        // Retract cool — impressive disappears
        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            -1,
        );
        circuit.transaction().unwrap();
        assert_eq!(handles.all_facts_output.consolidate().weighted_count(), -2);

        circuit.kill().unwrap();
    }

    #[test]
    fn test_hold_input_triggers_rules() {
        let rules = vec![CompiledRule {
            patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
            body: Arc::new(|bindings, _is_insertion| {
                let x = bindings.get("x").unwrap().clone();
                vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
            }),
        }];

        let (mut circuit, handles) = compile_circuit(rules);

        handles.hold_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            1,
        );
        circuit.transaction().unwrap();

        assert_eq!(handles.all_facts_output.consolidate().weighted_count(), 2);

        circuit.kill().unwrap();
    }

    #[test]
    fn test_empty_ruleset() {
        let rules = vec![];
        let (mut circuit, handles) = compile_circuit(rules);

        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            1,
        );
        circuit.transaction().unwrap();

        assert_eq!(handles.all_facts_output.consolidate().weighted_count(), 1);

        circuit.kill().unwrap();
    }

    #[test]
    fn test_multiple_entities_independent() {
        let rules = vec![CompiledRule {
            patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
            body: Arc::new(|bindings, _is_insertion| {
                let x = bindings.get("x").unwrap().clone();
                vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
            }),
        }];

        let (mut circuit, handles) = compile_circuit(rules);

        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            1,
        );
        handles.facts_input.push(
            stmt![Term::sym("alice"), Term::sym("is"), Term::sym("cool")],
            1,
        );
        circuit.transaction().unwrap();

        assert_eq!(handles.all_facts_output.consolidate().weighted_count(), 4);

        handles.facts_input.push(
            stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")],
            -1,
        );
        circuit.transaction().unwrap();

        assert_eq!(handles.all_facts_output.consolidate().weighted_count(), -2);

        circuit.kill().unwrap();
    }
}
