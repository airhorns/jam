//! Terms are the atoms facts are made of. Every distinct term gets one dense
//! `TermId`, so facts, index keys and query rows are plain `u32` slices and the
//! JS side can mirror the table and never ship strings across the boundary twice.

use hashbrown::HashMap;

pub type TermId = u32;

pub const FALSE: TermId = 0;
pub const TRUE: TermId = 1;
/// The empty string, which is also the global sync scope.
pub const EMPTY: TermId = 2;

/// Pattern positions at or above this value are variables (`VAR_BASE + index`).
pub const VAR_BASE: u32 = 0xF000_0000;
/// A pattern position that matches anything without binding.
pub const WILD: u32 = u32::MAX - 1;
/// Passed as a scope to mean "inherit".
pub const NONE: u32 = u32::MAX;

#[derive(Clone, Debug, PartialEq)]
pub enum Term {
    Str(Box<str>),
    Num(f64),
    Bool(bool),
}

#[derive(Default)]
pub struct Interner {
    terms: Vec<Term>,
    strings: HashMap<Box<str>, TermId>,
    numbers: HashMap<u64, TermId>,
}

impl Interner {
    pub fn new() -> Self {
        let mut interner = Interner::default();
        interner.terms.push(Term::Bool(false));
        interner.terms.push(Term::Bool(true));
        let empty = interner.intern_str("");
        debug_assert_eq!(empty, EMPTY);
        interner
    }

    pub fn intern_str(&mut self, s: &str) -> TermId {
        if let Some(&id) = self.strings.get(s) {
            return id;
        }
        let id = self.next_id();
        let boxed: Box<str> = s.into();
        self.strings.insert(boxed.clone(), id);
        self.terms.push(Term::Str(boxed));
        id
    }

    pub fn intern_num(&mut self, n: f64) -> TermId {
        let bits = if n == 0.0 { 0 } else { n.to_bits() };
        if let Some(&id) = self.numbers.get(&bits) {
            return id;
        }
        let id = self.next_id();
        self.numbers.insert(bits, id);
        self.terms.push(Term::Num(n));
        id
    }

    pub fn intern_bool(&self, b: bool) -> TermId {
        if b { TRUE } else { FALSE }
    }

    pub fn intern(&mut self, term: &Term) -> TermId {
        match term {
            Term::Str(s) => self.intern_str(s),
            Term::Num(n) => self.intern_num(*n),
            Term::Bool(b) => self.intern_bool(*b),
        }
    }

    pub fn get(&self, id: TermId) -> Option<&Term> {
        self.terms.get(id as usize)
    }

    pub fn resolve(&self, id: TermId) -> &Term {
        &self.terms[id as usize]
    }

    pub fn len(&self) -> usize {
        self.terms.len()
    }

    pub fn is_empty(&self) -> bool {
        self.terms.is_empty()
    }

    fn next_id(&self) -> TermId {
        let id = self.terms.len() as u32;
        assert!(id < VAR_BASE, "term table exhausted");
        id
    }
}

impl std::fmt::Display for Term {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Term::Str(s) => write!(f, "{s:?}"),
            Term::Num(n) => write!(f, "{n}"),
            Term::Bool(b) => write!(f, "{b}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn interns_stably() {
        let mut i = Interner::new();
        let a = i.intern_str("todo");
        let b = i.intern_str("todo");
        assert_eq!(a, b);
        assert_eq!(i.intern_num(1.0), i.intern_num(1.0));
        assert_ne!(i.intern_num(1.0), i.intern_str("1"));
        assert_eq!(i.intern_num(0.0), i.intern_num(-0.0));
        assert_eq!(i.intern_num(f64::NAN), i.intern_num(f64::NAN));
        assert_eq!(i.intern_bool(true), TRUE);
        assert_eq!(i.intern_bool(false), FALSE);
        assert_eq!(i.intern_str(""), EMPTY);
        assert_eq!(i.resolve(a), &Term::Str("todo".into()));
    }

    #[test]
    fn intern_dispatches_on_the_term_kind() {
        let mut i = Interner::new();
        let s = i.intern(&Term::Str("x".into()));
        let n = i.intern(&Term::Num(4.0));
        assert_eq!(s, i.intern_str("x"));
        assert_eq!(n, i.intern_num(4.0));
        assert_eq!(i.intern(&Term::Bool(true)), TRUE);
        assert_eq!(i.intern(&Term::Bool(false)), FALSE);
    }

    #[test]
    fn lookups_and_sizes() {
        let mut i = Interner::new();
        assert_eq!(i.len(), 3, "false, true and the empty string are preinterned");
        assert!(!i.is_empty());
        assert_eq!(i.get(FALSE), Some(&Term::Bool(false)));
        assert_eq!(i.get(TRUE), Some(&Term::Bool(true)));
        assert_eq!(i.get(EMPTY), Some(&Term::Str("".into())));
        assert_eq!(i.get(3), None);
        let n = i.intern_num(-2.5);
        assert_eq!(i.get(n), Some(&Term::Num(-2.5)));
        assert_eq!(i.len(), 4);
        assert!(Interner::default().is_empty(), "the bare default has no preinterned terms");
    }

    #[test]
    fn terms_display_like_json() {
        assert_eq!(Term::Str("a \"b\"".into()).to_string(), "\"a \\\"b\\\"\"");
        assert_eq!(Term::Num(1.5).to_string(), "1.5");
        assert_eq!(Term::Num(3.0).to_string(), "3");
        assert_eq!(Term::Bool(true).to_string(), "true");
        assert_eq!(Term::Bool(false).to_string(), "false");
    }
}
