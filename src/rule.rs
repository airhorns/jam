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
}

/// A program is a named collection of rules and initial claims.
pub struct Program {
    pub name: String,
    /// Facts this program asserts unconditionally when installed.
    pub claims: Vec<Statement>,
    /// Rules this program defines.
    pub rules: Vec<RuleSpec>,
}
