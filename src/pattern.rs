use std::collections::BTreeMap;

use crate::term::{Statement, Term};

/// Unique identifier for a variable in a pattern.
pub type VarId = String;

/// Bindings produced by a successful pattern match.
pub type Bindings = BTreeMap<VarId, Term>;

/// A single term in a pattern — either an exact match or a variable capture.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PatternTerm {
    /// Must match this exact term.
    Exact(Term),
    /// Captures the value at this position into a named variable.
    Bind(VarId),
    /// Matches any value without capturing.
    Wildcard,
}

/// A pattern is a sequence of pattern terms that can be matched against statements.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pattern {
    pub terms: Vec<PatternTerm>,
}

impl Pattern {
    pub fn new(terms: Vec<PatternTerm>) -> Self {
        Pattern { terms }
    }

    /// Try to match this pattern against a statement.
    /// Returns Some(bindings) if the match succeeds, None otherwise.
    pub fn match_statement(&self, stmt: &Statement) -> Option<Bindings> {
        if self.terms.len() != stmt.terms.len() {
            return None;
        }

        let mut bindings = Bindings::new();

        for (pat_term, stmt_term) in self.terms.iter().zip(stmt.terms.iter()) {
            match pat_term {
                PatternTerm::Exact(expected) => {
                    if expected != stmt_term {
                        return None;
                    }
                }
                PatternTerm::Bind(var_id) => {
                    if let Some(existing) = bindings.get(var_id) {
                        // Same variable used twice — must match same value
                        if existing != stmt_term {
                            return None;
                        }
                    } else {
                        bindings.insert(var_id.clone(), stmt_term.clone());
                    }
                }
                PatternTerm::Wildcard => {}
            }
        }

        Some(bindings)
    }

    /// Check if a statement could potentially match this pattern (fast pre-filter).
    /// Only checks length and exact terms, skips variable binding.
    pub fn could_match(&self, stmt: &Statement) -> bool {
        if self.terms.len() != stmt.terms.len() {
            return false;
        }

        for (pat_term, stmt_term) in self.terms.iter().zip(stmt.terms.iter()) {
            if let PatternTerm::Exact(expected) = pat_term
                && expected != stmt_term
            {
                return false;
            }
        }

        true
    }
}

/// Convenience macro for building patterns tersely.
///
/// Usage: `pat![var("x"), ex("is"), ex("cool")]`
/// Or use the helper functions: `bind("x")`, `exact(term)`, `wild()`
#[macro_export]
macro_rules! pat {
    ($($term:expr),* $(,)?) => {
        $crate::pattern::Pattern::new(vec![$($term),*])
    };
}

/// Create a binding pattern term.
pub fn bind(var: &str) -> PatternTerm {
    PatternTerm::Bind(var.to_string())
}

/// Create an exact-match pattern term from a term.
pub fn exact(term: Term) -> PatternTerm {
    PatternTerm::Exact(term)
}

/// Create a wildcard pattern term.
pub fn wild() -> PatternTerm {
    PatternTerm::Wildcard
}

/// Create an exact-match pattern term for a symbol.
pub fn exact_sym(s: &str) -> PatternTerm {
    PatternTerm::Exact(Term::Symbol(s.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stmt;
    use crate::term::Term;

    #[test]
    fn test_exact_match() {
        let pattern = pat![exact_sym("omar"), exact_sym("is"), exact_sym("cool")];
        let stmt = stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")];
        let bindings = pattern.match_statement(&stmt).unwrap();
        assert!(bindings.is_empty());
    }

    #[test]
    fn test_exact_mismatch() {
        let pattern = pat![exact_sym("omar"), exact_sym("is"), exact_sym("cool")];
        let stmt = stmt![Term::sym("omar"), Term::sym("is"), Term::sym("lame")];
        assert!(pattern.match_statement(&stmt).is_none());
    }

    #[test]
    fn test_length_mismatch() {
        let pattern = pat![exact_sym("omar"), exact_sym("is")];
        let stmt = stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")];
        assert!(pattern.match_statement(&stmt).is_none());
    }

    #[test]
    fn test_variable_binding() {
        let pattern = pat![bind("x"), exact_sym("is"), exact_sym("cool")];
        let stmt = stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")];
        let bindings = pattern.match_statement(&stmt).unwrap();
        assert_eq!(bindings.get("x"), Some(&Term::sym("omar")));
    }

    #[test]
    fn test_multiple_bindings() {
        let pattern = pat![bind("x"), exact_sym("is"), bind("y")];
        let stmt = stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")];
        let bindings = pattern.match_statement(&stmt).unwrap();
        assert_eq!(bindings.get("x"), Some(&Term::sym("omar")));
        assert_eq!(bindings.get("y"), Some(&Term::sym("cool")));
    }

    #[test]
    fn test_repeated_variable_matches() {
        // /x/ likes /x/ — x must be the same in both positions
        let pattern = pat![bind("x"), exact_sym("likes"), bind("x")];
        let stmt = stmt![Term::sym("omar"), Term::sym("likes"), Term::sym("omar")];
        let bindings = pattern.match_statement(&stmt).unwrap();
        assert_eq!(bindings.get("x"), Some(&Term::sym("omar")));
    }

    #[test]
    fn test_repeated_variable_fails() {
        let pattern = pat![bind("x"), exact_sym("likes"), bind("x")];
        let stmt = stmt![Term::sym("omar"), Term::sym("likes"), Term::sym("alice")];
        assert!(pattern.match_statement(&stmt).is_none());
    }

    #[test]
    fn test_wildcard() {
        let pattern = pat![wild(), exact_sym("is"), exact_sym("cool")];
        let stmt = stmt![Term::sym("anyone"), Term::sym("is"), Term::sym("cool")];
        let bindings = pattern.match_statement(&stmt).unwrap();
        assert!(bindings.is_empty());
    }

    #[test]
    fn test_could_match() {
        let pattern = pat![bind("x"), exact_sym("is"), exact_sym("cool")];
        let yes = stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")];
        let no = stmt![Term::sym("omar"), Term::sym("is"), Term::sym("lame")];
        let wrong_len = stmt![Term::sym("omar"), Term::sym("is")];

        assert!(pattern.could_match(&yes));
        assert!(!pattern.could_match(&no));
        assert!(!pattern.could_match(&wrong_len));
    }

    #[test]
    fn test_int_binding() {
        let pattern = pat![exact_sym("fps"), exact_sym("is"), bind("n")];
        let stmt = stmt![Term::sym("fps"), Term::sym("is"), Term::int(60)];
        let bindings = pattern.match_statement(&stmt).unwrap();
        assert_eq!(bindings.get("n"), Some(&Term::int(60)));
    }
}
