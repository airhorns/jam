use std::sync::Arc;

use crate::pattern::{Bindings, Pattern};
use crate::term::Statement;

/// Unique identifier for a rule.
pub type RuleId = u64;

/// Unique identifier for a program (a collection of rules + claims).
pub type ProgramId = u64;

/// The body function of a rule: takes bindings from pattern matching,
/// returns zero or more derived statements.
///
/// Must be deterministic — DBSP requires pure operators for correct
/// incremental computation.
pub type BodyFn = Arc<dyn Fn(&Bindings) -> Vec<Statement> + Send + Sync>;

/// A rule specification: patterns to match + body to execute.
pub struct RuleSpec {
    /// Patterns to match against facts. Multiple patterns = join on shared variables.
    pub patterns: Vec<Pattern>,
    /// The body function, called with merged bindings from all patterns.
    pub body: BodyFn,
    /// Nested Whens: sub-rules that only fire while this rule's patterns match.
    /// Flattened at compile time into join rules combining parent + child patterns.
    pub whens: Vec<RuleSpec>,
}

impl RuleSpec {
    /// Create a new rule with the given patterns and body. No nested whens.
    pub fn new(
        patterns: Vec<Pattern>,
        body: impl Fn(&Bindings) -> Vec<Statement> + Send + Sync + 'static,
    ) -> Self {
        RuleSpec {
            patterns,
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
}

impl Program {
    /// Create a new program with just a name. No claims or rules.
    pub fn new(name: &str) -> Self {
        Program {
            name: name.to_string(),
            claims: vec![],
            rules: vec![],
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
