use feldera_macros::IsNone;
use rkyv::{Archive, Serialize};
use size_of::SizeOf;
use std::fmt;

/// A single term in a statement. Terms are the atoms of the system.
#[derive(
    Clone,
    Default,
    Debug,
    Eq,
    PartialEq,
    Ord,
    PartialOrd,
    Hash,
    SizeOf,
    Archive,
    Serialize,
    rkyv::Deserialize,
    serde::Serialize,
    serde::Deserialize,
    IsNone,
)]
#[archive_attr(derive(Ord, Eq, PartialEq, PartialOrd))]
pub enum Term {
    #[default]
    Nil,
    Symbol(String),
    Int(i64),
    Str(String),
    Bool(bool),
}

impl Term {
    pub fn sym(s: &str) -> Self {
        Term::Symbol(s.to_string())
    }

    pub fn int(n: i64) -> Self {
        Term::Int(n)
    }

    pub fn string(s: &str) -> Self {
        Term::Str(s.to_string())
    }
}

impl fmt::Display for Term {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Term::Nil => write!(f, "nil"),
            Term::Symbol(s) => write!(f, "{s}"),
            Term::Int(n) => write!(f, "{n}"),
            Term::Str(s) => write!(f, "\"{s}\""),
            Term::Bool(b) => write!(f, "{b}"),
        }
    }
}

/// A statement is an ordered sequence of terms — the fundamental unit of data.
/// Examples: ["omar", "is", "cool"], ["the", "fps", "is", 60]
#[derive(
    Clone,
    Default,
    Debug,
    Eq,
    PartialEq,
    Ord,
    PartialOrd,
    Hash,
    SizeOf,
    Archive,
    Serialize,
    rkyv::Deserialize,
    serde::Serialize,
    serde::Deserialize,
    IsNone,
)]
#[archive_attr(derive(Ord, Eq, PartialEq, PartialOrd))]
pub struct Statement {
    pub terms: Vec<Term>,
}

impl Statement {
    pub fn new(terms: Vec<Term>) -> Self {
        Statement { terms }
    }

    pub fn len(&self) -> usize {
        self.terms.len()
    }

    pub fn is_empty(&self) -> bool {
        self.terms.is_empty()
    }
}

impl fmt::Display for Statement {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let parts: Vec<String> = self.terms.iter().map(|t| t.to_string()).collect();
        write!(f, "({})", parts.join(" "))
    }
}

/// Convenience macro for creating statements from mixed term types.
#[macro_export]
macro_rules! stmt {
    ($($term:expr),* $(,)?) => {
        $crate::term::Statement::new(vec![$($term),*])
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_term_display() {
        assert_eq!(Term::sym("cool").to_string(), "cool");
        assert_eq!(Term::int(42).to_string(), "42");
        assert_eq!(Term::string("hello").to_string(), "\"hello\"");
    }

    #[test]
    fn test_statement_display() {
        let s = Statement::new(vec![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
        assert_eq!(s.to_string(), "(omar is cool)");
    }

    #[test]
    fn test_stmt_macro() {
        let s = stmt![Term::sym("omar"), Term::sym("is"), Term::int(42)];
        assert_eq!(s.terms.len(), 3);
        assert_eq!(s.terms[2], Term::Int(42));
    }
}
