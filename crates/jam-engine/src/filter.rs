//! Predicate evaluation over bound rows.

use std::cmp::Ordering;

use crate::spec::{Filter, Op, Operand, Predicate};
use crate::term::{Interner, Term, TermId};

/// A filter with its case-insensitive literal needles lowercased once.
pub struct Compiled {
    predicates: Vec<(Predicate, Option<Box<str>>)>,
}

impl Compiled {
    pub fn new(filter: &Filter, interner: &Interner) -> Compiled {
        let predicates = filter
            .iter()
            .map(|&p| {
                let needle = match (p.op.ignores_case(), p.rhs) {
                    (true, Operand::Lit(t)) => match interner.get(t) {
                        Some(Term::Str(s)) => Some(s.to_lowercase().into_boxed_str()),
                        _ => None,
                    },
                    _ => None,
                };
                (p, needle)
            })
            .collect();
        Compiled { predicates }
    }

    /// Whether any alternative holds for `row`.
    pub fn passes(&self, row: &[TermId], interner: &Interner) -> bool {
        self.predicates.iter().any(|(p, needle)| {
            let rhs = match p.rhs {
                Operand::Var(v) => row[v as usize],
                Operand::Lit(t) => t,
            };
            holds(p.op, row[p.lhs as usize], rhs, needle.as_deref(), interner)
        })
    }
}

fn holds(op: Op, lhs: TermId, rhs: TermId, needle: Option<&str>, interner: &Interner) -> bool {
    let (Some(a), Some(b)) = (interner.get(lhs), interner.get(rhs)) else {
        return matches!(op, Op::Ne) && lhs != rhs;
    };
    match op {
        Op::Eq => lhs == rhs,
        Op::Ne => lhs != rhs,
        Op::Lt => a.compare(b) == Ordering::Less,
        Op::Le => a.compare(b) != Ordering::Greater,
        Op::Gt => a.compare(b) == Ordering::Greater,
        Op::Ge => a.compare(b) != Ordering::Less,
        Op::Contains | Op::StartsWith | Op::ContainsCi | Op::StartsWithCi => {
            let (Term::Str(hay), Term::Str(pat)) = (a, b) else {
                return false;
            };
            match op {
                Op::Contains => hay.contains(&**pat),
                Op::StartsWith => hay.starts_with(&**pat),
                _ => {
                    let lowered;
                    let needle = match needle {
                        Some(needle) => needle,
                        None => {
                            lowered = pat.to_lowercase();
                            &lowered
                        }
                    };
                    if matches!(op, Op::ContainsCi) {
                        contains_ci(hay, needle)
                    } else {
                        starts_with_ci(hay, needle)
                    }
                }
            }
        }
    }
}

/// `needle` is already lowercase.
fn contains_ci(hay: &str, needle: &str) -> bool {
    if hay.is_ascii() && needle.is_ascii() {
        needle.is_empty()
            || hay
                .as_bytes()
                .windows(needle.len())
                .any(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
    } else {
        hay.to_lowercase().contains(needle)
    }
}

/// `needle` is already lowercase.
fn starts_with_ci(hay: &str, needle: &str) -> bool {
    if hay.is_ascii() && needle.is_ascii() {
        hay.len() >= needle.len() && hay.as_bytes()[..needle.len()].eq_ignore_ascii_case(needle.as_bytes())
    } else {
        hay.to_lowercase().starts_with(needle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::term::{FALSE, TRUE};

    fn check(interner: &Interner, filter: Filter, row: &[TermId]) -> bool {
        Compiled::new(&filter, interner).passes(row, interner)
    }

    fn pred(lhs: u32, op: Op, rhs: Operand) -> Predicate {
        Predicate { lhs, op, rhs }
    }

    #[test]
    fn compares_by_identity_and_total_order() {
        let mut i = Interner::new();
        let (one, two, s) = (i.intern_num(1.0), i.intern_num(2.0), i.intern_str("a"));
        let row = [one, two, s, TRUE];
        let lit = Operand::Lit;
        assert!(check(&i, vec![pred(0, Op::Eq, lit(one))], &row));
        assert!(!check(&i, vec![pred(0, Op::Eq, lit(two))], &row));
        assert!(check(&i, vec![pred(0, Op::Ne, Operand::Var(1))], &row));
        assert!(check(&i, vec![pred(0, Op::Lt, Operand::Var(1))], &row));
        assert!(check(&i, vec![pred(0, Op::Le, lit(one))], &row));
        assert!(check(&i, vec![pred(1, Op::Gt, lit(one))], &row));
        assert!(check(&i, vec![pred(1, Op::Ge, lit(two))], &row));
        assert!(!check(&i, vec![pred(1, Op::Gt, lit(two))], &row));
        assert!(check(&i, vec![pred(3, Op::Lt, lit(one))], &row), "booleans sort before numbers");
        assert!(check(&i, vec![pred(0, Op::Lt, lit(s))], &row), "numbers sort before strings");
        assert!(check(&i, vec![pred(0, Op::Gt, lit(FALSE))], &row));
        assert!(
            check(&i, vec![pred(0, Op::Eq, lit(two)), pred(0, Op::Eq, lit(one))], &row),
            "alternatives are a disjunction"
        );
        assert!(!check(&i, vec![], &row), "no alternative can hold");
        assert!(!check(&i, vec![pred(0, Op::Lt, lit(9999))], &row), "an unknown term never compares");
    }

    #[test]
    fn orders_numbers_with_nan_last() {
        let mut i = Interner::new();
        let (nan, one) = (i.intern_num(f64::NAN), i.intern_num(1.0));
        assert!(check(&i, vec![pred(0, Op::Gt, Operand::Lit(one))], &[nan]));
        assert!(
            check(&i, vec![pred(0, Op::Le, Operand::Var(0))], &[nan]),
            "NaN equals itself in this order"
        );
    }

    #[test]
    fn matches_substrings_with_and_without_case() {
        let mut i = Interner::new();
        let hay = i.intern_str("Hello World");
        let (lo, up, start, tail, uni) = (
            i.intern_str("world"),
            i.intern_str("World"),
            i.intern_str("hello"),
            i.intern_str("orld"),
            i.intern_str("wörld"),
        );
        let lit = Operand::Lit;
        assert!(check(&i, vec![pred(0, Op::Contains, lit(up))], &[hay]));
        assert!(!check(&i, vec![pred(0, Op::Contains, lit(lo))], &[hay]));
        assert!(check(&i, vec![pred(0, Op::ContainsCi, lit(lo))], &[hay]));
        assert!(
            check(&i, vec![pred(0, Op::ContainsCi, Operand::Var(1))], &[hay, lo]),
            "variable needles lowercase per row"
        );
        assert!(check(&i, vec![pred(0, Op::StartsWith, lit(hay))], &[hay]));
        assert!(!check(&i, vec![pred(0, Op::StartsWith, lit(start))], &[hay]));
        assert!(check(&i, vec![pred(0, Op::StartsWithCi, lit(start))], &[hay]));
        assert!(check(&i, vec![pred(0, Op::StartsWithCi, Operand::Var(1))], &[hay, start]));
        assert!(!check(&i, vec![pred(0, Op::StartsWithCi, lit(tail))], &[hay]));
        assert!(
            !check(&i, vec![pred(0, Op::StartsWithCi, lit(hay))], &[start]),
            "a needle longer than the text"
        );
        assert!(
            !check(&i, vec![pred(0, Op::Contains, lit(hay))], &[TRUE]),
            "string operators need strings"
        );
        assert!(!check(&i, vec![pred(0, Op::ContainsCi, lit(TRUE))], &[hay]));
        let empty = i.intern_str("");
        assert!(check(&i, vec![pred(0, Op::ContainsCi, lit(empty))], &[hay]));

        let hello_uni = i.intern_str("HELLO WÖRLD");
        assert!(
            check(&i, vec![pred(0, Op::ContainsCi, lit(uni))], &[hello_uni]),
            "non-ASCII text lowercases fully"
        );
        let (full, cut) = (i.intern_str("WÖRLD!"), i.intern_str("WÖRL"));
        assert!(check(&i, vec![pred(0, Op::StartsWithCi, lit(uni))], &[full]));
        assert!(!check(&i, vec![pred(0, Op::StartsWithCi, lit(uni))], &[cut]));
    }
}
