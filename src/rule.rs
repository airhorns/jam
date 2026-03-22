use std::sync::Arc;

use crate::pattern::{Bindings, Pattern};
use crate::term::Statement;

/// A hold operation: key-based persistent state update.
#[derive(Clone, Debug)]
pub struct HoldOp {
    pub key: String,
    pub stmts: Vec<Statement>,
}

/// Unique identifier for a rule.
pub type RuleId = u64;

/// Unique identifier for a program (a collection of rules + claims).
pub type ProgramId = u64;

/// The body function of a rule: takes bindings from pattern matching
/// and a flag indicating whether this is an insertion (true) or retraction (false).
/// Returns zero or more derived statements.
///
/// The claims produced must be the same regardless of is_insertion — DBSP requires
/// deterministic operators. The flag exists so side effects like callback registration
/// can be skipped during retractions (where DBSP's sort-order-dependent iteration
/// would overwrite fresh callbacks with stale closures).
pub type BodyFn = Arc<dyn Fn(&Bindings, bool) -> Vec<Statement> + Send + Sync>;

/// A boolean expression over patterns, supporting AND, OR, and arbitrary nesting.
///
/// At compile time, this is converted to disjunctive normal form (DNF):
/// each OR branch becomes a separate compiled rule, and AND branches become
/// multi-pattern joins. This is purely a frontend convenience — the circuit
/// and engine only see flat conjunctive rules.
#[derive(Clone)]
pub enum PatternExpr {
    /// A single pattern to match against facts.
    Single(Pattern),
    /// All sub-expressions must match (conjunction). Compiles to a multi-pattern join.
    And(Vec<PatternExpr>),
    /// At least one sub-expression must match (disjunction). Compiles to multiple
    /// separate rules with the same body.
    Or(Vec<PatternExpr>),
}

impl PatternExpr {
    /// Convert this expression to disjunctive normal form: a list of conjunctions,
    /// where each conjunction is a list of patterns.
    ///
    /// Each element of the outer Vec becomes a separate CompiledRule.
    pub fn to_dnf(&self) -> Vec<Vec<Pattern>> {
        match self {
            PatternExpr::Single(p) => vec![vec![p.clone()]],
            PatternExpr::And(exprs) => {
                // Cross-product of all sub-DNFs
                let mut result: Vec<Vec<Pattern>> = vec![vec![]];
                for sub in exprs {
                    let sub_dnf = sub.to_dnf();
                    let mut new_result = Vec::new();
                    for existing in &result {
                        for new_conj in &sub_dnf {
                            let mut combined = existing.clone();
                            combined.extend(new_conj.clone());
                            new_result.push(combined);
                        }
                    }
                    result = new_result;
                }
                result
            }
            PatternExpr::Or(exprs) => {
                // Union of all sub-DNFs
                exprs.iter().flat_map(|e| e.to_dnf()).collect()
            }
        }
    }
}

/// Convenience: a single Pattern converts to a Single expression.
impl From<Pattern> for PatternExpr {
    fn from(p: Pattern) -> Self {
        PatternExpr::Single(p)
    }
}

/// Convenience: a Vec<Pattern> converts to an And expression (backward compat
/// with the old `patterns: Vec<Pattern>` field).
impl From<Vec<Pattern>> for PatternExpr {
    fn from(ps: Vec<Pattern>) -> Self {
        match ps.len() {
            0 => panic!("PatternExpr requires at least one pattern"),
            1 => PatternExpr::Single(ps.into_iter().next().unwrap()),
            _ => PatternExpr::And(ps.into_iter().map(PatternExpr::Single).collect()),
        }
    }
}

/// Create an AND expression from items convertible to PatternExpr.
pub fn all(exprs: impl IntoIterator<Item = impl Into<PatternExpr>>) -> PatternExpr {
    PatternExpr::And(exprs.into_iter().map(|e| e.into()).collect())
}

/// Create an OR expression from items convertible to PatternExpr.
pub fn any(exprs: impl IntoIterator<Item = impl Into<PatternExpr>>) -> PatternExpr {
    PatternExpr::Or(exprs.into_iter().map(|e| e.into()).collect())
}

/// A rule specification: pattern expression to match + body to execute.
pub struct RuleSpec {
    /// Boolean expression over patterns. Converted to DNF at compile time.
    pub pattern: PatternExpr,
    /// The body function, called with merged bindings from all matched patterns.
    pub body: BodyFn,
    /// Nested Whens: sub-rules that only fire while this rule's patterns match.
    /// Flattened at compile time into join rules combining parent + child patterns.
    pub whens: Vec<RuleSpec>,
}

impl RuleSpec {
    /// Create a new rule. Accepts a single Pattern, Vec<Pattern>, or PatternExpr.
    pub fn new(
        pattern: impl Into<PatternExpr>,
        body: impl Fn(&Bindings, bool) -> Vec<Statement> + Send + Sync + 'static,
    ) -> Self {
        RuleSpec {
            pattern: pattern.into(),
            body: Arc::new(body),
            whens: vec![],
        }
    }

    /// Add nested When rules that only fire while this rule's patterns match.
    pub fn with_whens(mut self, whens: Vec<RuleSpec>) -> Self {
        self.whens = whens;
        self
    }
}

/// A program is a named collection of rules and initial claims.
pub struct Program {
    pub name: String,
    /// Facts this program asserts unconditionally when installed.
    pub claims: Vec<Statement>,
    /// Rules this program defines.
    pub rules: Vec<RuleSpec>,
    /// Hold operations from top-level evaluation (initial state).
    pub hold_ops: Vec<HoldOp>,
}

impl Program {
    /// Create a new program with just a name. No claims or rules.
    pub fn new(name: &str) -> Self {
        Program {
            name: name.to_string(),
            claims: vec![],
            rules: vec![],
            hold_ops: vec![],
        }
    }

    /// Add claims to this program.
    pub fn with_claims(mut self, claims: Vec<Statement>) -> Self {
        self.claims = claims;
        self
    }

    /// Add rules to this program.
    pub fn with_rules(mut self, rules: Vec<RuleSpec>) -> Self {
        self.rules = rules;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::{bind, exact_sym};
    use crate::pat;

    #[test]
    fn test_single_pattern_dnf() {
        let expr = PatternExpr::Single(pat![bind("x"), exact_sym("is"), exact_sym("cool")]);
        let dnf = expr.to_dnf();
        assert_eq!(dnf.len(), 1);
        assert_eq!(dnf[0].len(), 1);
    }

    #[test]
    fn test_and_dnf() {
        let expr = all([
            pat![bind("x"), exact_sym("is"), exact_sym("cool")],
            pat![bind("x"), exact_sym("is"), exact_sym("tall")],
        ]);
        let dnf = expr.to_dnf();
        // AND of two singles = one conjunction with two patterns
        assert_eq!(dnf.len(), 1);
        assert_eq!(dnf[0].len(), 2);
    }

    #[test]
    fn test_or_dnf() {
        let expr = any([
            pat![bind("x"), exact_sym("is"), exact_sym("cool")],
            pat![bind("x"), exact_sym("is"), exact_sym("awesome")],
        ]);
        let dnf = expr.to_dnf();
        // OR of two singles = two conjunctions, each with one pattern
        assert_eq!(dnf.len(), 2);
        assert_eq!(dnf[0].len(), 1);
        assert_eq!(dnf[1].len(), 1);
    }

    #[test]
    fn test_and_or_distributes_to_dnf() {
        // (A OR B) AND C → (A AND C) OR (B AND C)
        let expr = all([
            any([
                pat![bind("x"), exact_sym("is"), exact_sym("cool")],
                pat![bind("x"), exact_sym("is"), exact_sym("awesome")],
            ]),
            PatternExpr::Single(pat![bind("x"), exact_sym("is"), exact_sym("tall")]),
        ]);
        let dnf = expr.to_dnf();
        assert_eq!(dnf.len(), 2);
        assert_eq!(dnf[0].len(), 2); // A AND C
        assert_eq!(dnf[1].len(), 2); // B AND C
    }

    #[test]
    fn test_complex_nested_dnf() {
        // (A OR B) AND (C OR D) → AC, AD, BC, BD
        let expr = all([
            any([
                pat![bind("x"), exact_sym("a")],
                pat![bind("x"), exact_sym("b")],
            ]),
            any([
                pat![bind("x"), exact_sym("c")],
                pat![bind("x"), exact_sym("d")],
            ]),
        ]);
        let dnf = expr.to_dnf();
        assert_eq!(dnf.len(), 4);
        for conj in &dnf {
            assert_eq!(conj.len(), 2);
        }
    }

    #[test]
    fn test_vec_pattern_backward_compat() {
        // Vec<Pattern> converts to And
        let patterns = vec![
            pat![bind("x"), exact_sym("is"), exact_sym("cool")],
            pat![bind("x"), exact_sym("is"), exact_sym("tall")],
        ];
        let expr: PatternExpr = patterns.into();
        let dnf = expr.to_dnf();
        assert_eq!(dnf.len(), 1);
        assert_eq!(dnf[0].len(), 2);
    }

    #[test]
    fn test_single_pattern_from() {
        let p = pat![bind("x"), exact_sym("is"), exact_sym("cool")];
        let expr: PatternExpr = p.into();
        let dnf = expr.to_dnf();
        assert_eq!(dnf.len(), 1);
        assert_eq!(dnf[0].len(), 1);
    }
}
