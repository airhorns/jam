//! Terms are the atoms facts are made of. Every distinct term gets one dense
//! `TermId`, so facts, index keys and query rows are plain `u32` slices and the
//! JS side can mirror the table and never ship strings across the boundary twice.
//!
//! Ids are reference counted by the facts and registered queries that use them.
//! An id that nothing holds is freed by the second `collect` after it was last
//! used, so it stays resolvable through the drain that reports its last fact.

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

/// The id is in `dead`: it reached zero references since the last `collect`.
const DEAD: u32 = 1 << 31;
/// The id is in `condemned`: it was unreferenced at the last `collect`.
const CONDEMNED: u32 = 1 << 30;
const COUNT: u32 = CONDEMNED - 1;

#[derive(Clone, Debug, PartialEq)]
pub enum Term {
    Str(Box<str>),
    Num(f64),
    Bool(bool),
}

#[derive(Default)]
pub struct Interner {
    terms: Vec<Option<Term>>,
    /// Reference count in the low bits plus the `DEAD` and `CONDEMNED` flags.
    refs: Vec<u32>,
    strings: HashMap<Box<str>, TermId>,
    numbers: HashMap<u64, TermId>,
    free: Vec<TermId>,
    dead: Vec<TermId>,
    condemned: Vec<TermId>,
}

impl Interner {
    pub fn new() -> Self {
        let mut interner = Interner::default();
        interner.pin(Term::Bool(false));
        interner.pin(Term::Bool(true));
        let empty = interner.pin(Term::Str("".into()));
        interner.strings.insert("".into(), empty);
        debug_assert_eq!(empty, EMPTY);
        interner
    }

    /// Add a term that is never freed.
    fn pin(&mut self, term: Term) -> TermId {
        let id = self.terms.len() as TermId;
        self.terms.push(Some(term));
        self.refs.push(1);
        id
    }

    pub fn intern_str(&mut self, s: &str) -> TermId {
        if let Some(&id) = self.strings.get(s) {
            return id;
        }
        let boxed: Box<str> = s.into();
        let id = self.add(Term::Str(boxed.clone()));
        self.strings.insert(boxed, id);
        id
    }

    pub fn intern_num(&mut self, n: f64) -> TermId {
        if let Some(&id) = self.numbers.get(&num_key(n)) {
            return id;
        }
        let id = self.add(Term::Num(n));
        self.numbers.insert(num_key(n), id);
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

    /// A new term starts unreferenced, so it is collected unless something holds it.
    fn add(&mut self, term: Term) -> TermId {
        let id = match self.free.pop() {
            Some(id) => {
                self.terms[id as usize] = Some(term);
                id
            }
            None => {
                let id = self.terms.len() as u32;
                assert!(id < VAR_BASE, "term table exhausted");
                self.terms.push(Some(term));
                self.refs.push(0);
                id
            }
        };
        self.refs[id as usize] = DEAD;
        self.dead.push(id);
        id
    }

    #[inline]
    pub fn retain(&mut self, id: TermId) {
        self.refs[id as usize] += 1;
    }

    #[inline]
    pub fn release(&mut self, id: TermId) {
        let refs = &mut self.refs[id as usize];
        debug_assert!(*refs & COUNT > 0, "term {id} released below zero");
        *refs -= 1;
        if *refs & (COUNT | DEAD) == 0 {
            *refs |= DEAD;
            self.dead.push(id);
        }
    }

    /// Free the ids that were unreferenced at the previous `collect` and still are, and
    /// line up the ids that reached zero since for the next one. Returns what was freed.
    pub fn collect(&mut self) -> Vec<TermId> {
        let mut freed = Vec::new();
        for id in std::mem::take(&mut self.condemned) {
            let refs = &mut self.refs[id as usize];
            *refs &= !CONDEMNED;
            if *refs != 0 {
                continue;
            }
            match self.terms[id as usize].take() {
                Some(Term::Str(s)) => {
                    self.strings.remove(&s);
                }
                Some(Term::Num(n)) => {
                    self.numbers.remove(&num_key(n));
                }
                _ => {}
            }
            self.free.push(id);
            freed.push(id);
        }
        self.condemned = std::mem::take(&mut self.dead);
        for &id in &self.condemned {
            self.refs[id as usize] = (self.refs[id as usize] & !DEAD) | CONDEMNED;
        }
        freed
    }

    pub fn get(&self, id: TermId) -> Option<&Term> {
        self.terms.get(id as usize).and_then(Option::as_ref)
    }

    /// Whether `id` names a term; only the reference word is touched, not the term itself.
    #[inline]
    pub fn is_live(&self, id: TermId) -> bool {
        self.refs.get(id as usize).is_some_and(|&refs| refs != 0)
    }

    pub fn resolve(&self, id: TermId) -> &Term {
        self.terms[id as usize].as_ref().expect("live term")
    }

    pub fn refcount(&self, id: TermId) -> u32 {
        self.refs[id as usize] & COUNT
    }

    /// Live terms.
    pub fn len(&self) -> usize {
        self.terms.len() - self.free.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Ids handed out so far, including freed ones awaiting reuse.
    pub fn capacity(&self) -> usize {
        self.terms.len()
    }
}

/// Hash key for a number: both zeros share one term, and NaN is one term.
fn num_key(n: f64) -> u64 {
    if n == 0.0 { 0 } else { n.to_bits() }
}

impl Term {
    /// The total order predicates and sort keys use: booleans, then numbers
    /// (NaN last), then strings by their bytes.
    pub fn compare(&self, other: &Term) -> std::cmp::Ordering {
        match (self, other) {
            (Term::Bool(a), Term::Bool(b)) => a.cmp(b),
            (Term::Num(a), Term::Num(b)) => a.partial_cmp(b).unwrap_or_else(|| a.is_nan().cmp(&b.is_nan())),
            (Term::Str(a), Term::Str(b)) => a.cmp(b),
            _ => self.rank().cmp(&other.rank()),
        }
    }

    fn rank(&self) -> u8 {
        match self {
            Term::Bool(_) => 0,
            Term::Num(_) => 1,
            Term::Str(_) => 2,
        }
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
        assert_eq!((i.len(), i.capacity()), (4, 4));
        assert!(Interner::default().is_empty(), "the bare default has no preinterned terms");
    }

    #[test]
    fn unreferenced_terms_are_freed_by_the_second_collect() {
        let mut i = Interner::new();
        let a = i.intern_str("a");
        let n = i.intern_num(7.0);
        assert_eq!(i.collect(), vec![], "a fresh term survives the collect that first sees it");
        assert_eq!((i.get(a).is_some(), i.get(n).is_some()), (true, true));
        assert!(i.is_live(a) && i.is_live(n), "a condemned term is still live");
        assert_eq!(i.collect(), vec![a, n]);
        assert_eq!((i.get(a), i.get(n)), (None, None));
        assert!(!i.is_live(a) && !i.is_live(n) && !i.is_live(99));
        assert!(i.is_live(EMPTY));
        assert_eq!((i.len(), i.capacity()), (3, 5));
        assert_eq!(i.collect(), vec![], "nothing is freed twice");
        let b = i.intern_str("b");
        assert_eq!(b, n, "freed ids are reused, most recent first");
        assert_eq!(i.intern_str("a"), a, "and the old string gets a fresh id");
        assert_eq!(i.capacity(), 5);
    }

    #[test]
    fn retained_terms_survive_until_released() {
        let mut i = Interner::new();
        let a = i.intern_str("a");
        i.retain(a);
        i.retain(a);
        assert_eq!(i.refcount(a), 2);
        i.collect();
        i.collect();
        assert_eq!(i.get(a), Some(&Term::Str("a".into())));
        i.release(a);
        i.collect();
        i.collect();
        assert!(i.get(a).is_some(), "one reference remains");
        i.release(a);
        assert_eq!(i.refcount(a), 0);
        assert_eq!(i.collect(), vec![], "released this period: reported next time");
        assert_eq!(i.collect(), vec![a]);
    }

    #[test]
    fn a_term_released_and_reused_in_the_same_period_is_not_freed_early() {
        let mut i = Interner::new();
        let a = i.intern_str("a");
        i.retain(a);
        i.collect();
        i.release(a);
        i.collect();
        assert!(i.get(a).is_some(), "condemned but still resolvable for this drain");
        i.retain(a);
        i.release(a);
        assert_eq!(i.collect(), vec![], "it reached zero again this period, so it lives on");
        assert_eq!(i.collect(), vec![a]);
    }

    #[test]
    fn a_condemned_term_that_gets_referenced_is_spared() {
        let mut i = Interner::new();
        let a = i.intern_str("a");
        i.collect();
        i.retain(a);
        assert_eq!(i.collect(), vec![]);
        assert_eq!(i.collect(), vec![]);
        assert_eq!(i.refcount(a), 1);
        i.release(a);
        i.collect();
        assert_eq!(i.collect(), vec![a]);
    }

    #[test]
    fn pinned_terms_are_never_collected() {
        let mut i = Interner::new();
        i.retain(EMPTY);
        i.release(EMPTY);
        i.collect();
        i.collect();
        assert_eq!(i.intern_str(""), EMPTY);
        assert_eq!(i.get(TRUE), Some(&Term::Bool(true)));
        assert_eq!(i.len(), 3);
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
