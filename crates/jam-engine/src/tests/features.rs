//! Negation, predicates, aggregates and ordered windows through the public engine API.

use std::cmp::Ordering;
use std::collections::BTreeSet;

use pretty_assertions::assert_eq;

use super::{Event, Harness, Rng, decode, strs};
use crate::query::{Clause, QueryId};
use crate::spec::{AggOp, Aggregate, Op, Operand, Predicate, Sort, Spec, is_var, var_of};
use crate::store::ROOT_OWNER;
use crate::term::{NONE, Term, TermId, VAR_BASE, WILD};
use crate::wire::{FACT_EVENTS_NONE, OP_ASSERT, OP_CLEAR};

/// Builds a spec on top of the harness's `$name` variables; `out` names an aggregate's value.
struct Q<'h> {
    h: &'h mut Harness,
    spec: Spec,
    out: Option<String>,
}

impl Harness {
    fn q(&mut self, patterns: &[&[&str]]) -> Q<'_> {
        self.vars.clear();
        let patterns = patterns.iter().map(|c| self.pattern(c)).collect();
        Q { h: self, spec: Spec { patterns, ..Spec::default() }, out: None }
    }

    fn var(&mut self, name: &str) -> u32 {
        var_of(self.pattern(&[name])[0])
    }

    fn operand(&mut self, s: &str) -> Operand {
        if s.starts_with('$') { Operand::Var(self.var(s)) } else { Operand::Lit(self.lit(s)) }
    }

    /// Rows of a registered query sorted the way a client would: by the sort keys, then order.
    fn ranked(&mut self, qid: QueryId, keys: &[(usize, bool)]) -> Vec<Vec<String>> {
        let packed = self.e.rows(qid);
        let arity = packed[0] as usize;
        let mut rows = Vec::new();
        let mut i = 2;
        for _ in 0..packed[1] {
            let row = packed[i + 1..i + 1 + arity].to_vec();
            let order = (u64::from(packed[i + 1 + arity]) << 32) | u64::from(packed[i + 2 + arity]);
            rows.push((row, order));
            i += 3 + arity;
        }
        self.rank(rows, keys)
    }

    fn rank(&self, mut rows: Vec<(Vec<TermId>, u64)>, keys: &[(usize, bool)]) -> Vec<Vec<String>> {
        rows.sort_by(|(a, sa), (b, sb)| {
            for &(k, desc) in keys {
                let ordering = self.e.interner.resolve(a[k]).compare(self.e.interner.resolve(b[k]));
                let ordering = if desc { ordering.reverse() } else { ordering };
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            sa.cmp(sb).then_with(|| a.cmp(b))
        });
        rows.into_iter().map(|(row, _)| self.resolve(&row)).collect()
    }

    /// Added and removed row counts per query in one drain.
    fn deltas(&mut self) -> Vec<(QueryId, usize, usize)> {
        decode(&self.e.drain())
            .into_iter()
            .filter_map(|e| match e {
                Event::Query { qid, added, removed } => Some((qid, added.len(), removed.len())),
                _ => None,
            })
            .collect()
    }
}

fn op(s: &str) -> Op {
    match s {
        "=" => Op::Eq,
        "!=" => Op::Ne,
        "<" => Op::Lt,
        "<=" => Op::Le,
        ">" => Op::Gt,
        ">=" => Op::Ge,
        "contains" => Op::Contains,
        "startsWith" => Op::StartsWith,
        "icontains" => Op::ContainsCi,
        "istartsWith" => Op::StartsWithCi,
        other => panic!("unknown op {other}"),
    }
}

impl Q<'_> {
    fn not(mut self, pattern: &[&str]) -> Self {
        let clause = self.h.pattern(pattern);
        self.spec.negations.push(clause);
        self
    }

    fn filter(mut self, alternatives: &[(&str, &str, &str)]) -> Self {
        let filter = alternatives
            .iter()
            .map(|&(lhs, o, rhs)| Predicate { lhs: self.h.var(lhs), op: op(o), rhs: self.h.operand(rhs) })
            .collect();
        self.spec.filters.push(filter);
        self
    }

    fn aggregate(mut self, op: AggOp, input: Option<&str>, out: &str, group: &[&str]) -> Self {
        let input = input.map(|v| self.h.var(v));
        let group = group.iter().map(|g| self.h.var(g)).collect();
        self.spec.aggregate = Some(Aggregate { op, input, group });
        self.out = Some(out.to_string());
        self
    }

    fn count(self, out: &str, group: &[&str]) -> Self {
        self.aggregate(AggOp::Count, None, out, group)
    }

    fn sum(self, input: &str, out: &str, group: &[&str]) -> Self {
        self.aggregate(AggOp::Sum, Some(input), out, group)
    }

    fn min(self, input: &str, out: &str, group: &[&str]) -> Self {
        self.aggregate(AggOp::Min, Some(input), out, group)
    }

    fn max(self, input: &str, out: &str, group: &[&str]) -> Self {
        self.aggregate(AggOp::Max, Some(input), out, group)
    }

    /// The output-row position a name refers to.
    fn column(&mut self, name: &str) -> usize {
        match (&self.spec.aggregate, &self.out) {
            (Some(agg), Some(out)) if name == out => agg.group.len(),
            (Some(agg), _) => {
                let v = self.h.var(name);
                agg.group.iter().position(|&g| g == v).unwrap_or(usize::MAX)
            }
            _ => self.h.var(name) as usize,
        }
    }

    fn order(mut self, name: &str, descending: bool) -> Self {
        let var = self.column(name) as u32;
        self.spec.order.push(Sort { var, descending });
        self
    }

    fn offset(mut self, n: u32) -> Self {
        self.spec.offset = n;
        self
    }

    fn limit(mut self, n: u32) -> Self {
        self.spec.limit = Some(n);
        self
    }

    fn try_register(self) -> Result<QueryId, String> {
        self.h.e.register(self.spec)
    }

    fn register(self) -> QueryId {
        self.try_register().unwrap()
    }

    fn try_query(self) -> Result<Vec<Vec<String>>, String> {
        let keys = self.keys_of();
        let packed = self.h.e.query(self.spec)?;
        let arity = packed[0] as usize;
        let rows = (0..packed[1] as usize)
            .map(|r| (packed[2 + r * arity..2 + (r + 1) * arity].to_vec(), r as u64))
            .collect();
        Ok(self.h.rank(rows, &keys))
    }

    fn keys_of(&self) -> Vec<(usize, bool)> {
        self.spec.order.iter().map(|s| (s.var as usize, s.descending)).collect()
    }

    fn query(self) -> Vec<Vec<String>> {
        self.try_query().unwrap()
    }
}

fn set(rows: &[&[&str]]) -> BTreeSet<Vec<String>> {
    rows.iter().map(|r| strs(r)).collect()
}

fn list(rows: &[&[&str]]) -> Vec<Vec<String>> {
    rows.iter().map(|r| strs(r)).collect()
}

#[test]
fn negations_hide_rows_while_any_matching_fact_exists() {
    let mut h = Harness::new();
    h.assert(ROOT_OWNER, &["todo", "1", "title", "milk"]);
    h.assert(ROOT_OWNER, &["todo", "2", "title", "eggs"]);
    h.assert(ROOT_OWNER, &["todo", "2", "done", "true"]);
    let open = h.q(&[&["todo", "$id", "title", "$t"]]).not(&["todo", "$id", "done", "true"]).register();
    assert_eq!(h.rows_str(open), set(&[&["1", "milk"]]), "registration counts existing blockers");
    let untagged = h.q(&[&["todo", "$id", "title", "$t"]]).not(&["todo", "$id", "tag", "$any"]).register();
    assert_eq!(h.deltas(), vec![]);

    h.assert(ROOT_OWNER, &["todo", "2", "done", "false"]);
    h.drop(&["todo", "2", "done", "true"]);
    assert_eq!(h.deltas(), vec![(open, 1, 0)]);
    assert_eq!(h.rows_str(open), set(&[&["1", "milk"], &["2", "eggs"]]));

    h.assert(ROOT_OWNER, &["todo", "1", "tag", "urgent"]);
    h.assert(ROOT_OWNER, &["todo", "1", "tag", "home"]);
    assert_eq!(h.deltas(), vec![(untagged, 0, 1)]);
    h.drop(&["todo", "1", "tag", "urgent"]);
    assert_eq!(h.deltas(), vec![], "one blocker remains");
    h.drop(&["todo", "1", "tag", "home"]);
    assert_eq!(h.deltas(), vec![(untagged, 1, 0)]);
    assert_eq!(h.rows_str(untagged), set(&[&["1", "milk"], &["2", "eggs"]]));

    h.assert(ROOT_OWNER, &["todo", "3", "tag", "x"]);
    h.assert(ROOT_OWNER, &["todo", "3", "title", "bread"]);
    assert_eq!(h.deltas(), vec![(open, 1, 0)], "a row born blocked is never reported");
    h.drop(&["todo", "3", "title", "_"]);
    h.assert(ROOT_OWNER, &["todo", "3", "title", "bread"]);
    h.drop(&["todo", "3", "tag", "_"]);
    assert_eq!(h.deltas(), vec![(untagged, 1, 0)], "a row re-entering recounts its blockers");
    assert_eq!(h.rows(untagged).len(), 3);
    assert_eq!(
        h.q(&[&["todo", "$id", "title", "_"]]).not(&["todo", "$id", "done", "_"]).query(),
        list(&[&["1"], &["3"]])
    );
}

#[test]
fn a_fact_can_match_a_pattern_and_a_negation_of_the_same_query() {
    let mut h = Harness::new();
    let q = h.q(&[&["$e", "kind", "$k"]]).not(&["$e", "kind", "special"]).register();
    h.assert(ROOT_OWNER, &["a", "kind", "plain"]);
    h.assert(ROOT_OWNER, &["b", "kind", "plain"]);
    h.assert(ROOT_OWNER, &["b", "kind", "special"]);
    assert_eq!(h.deltas(), vec![(q, 1, 0)]);
    assert_eq!(h.rows_str(q), set(&[&["a", "plain"]]));
    h.drop(&["b", "kind", "special"]);
    assert_eq!(h.deltas(), vec![(q, 1, 0)]);
    assert_eq!(h.rows_str(q), set(&[&["a", "plain"], &["b", "plain"]]));
    h.assert(ROOT_OWNER, &["a", "kind", "special"]);
    assert_eq!(h.deltas(), vec![(q, 0, 1)]);
    h.e.apply(&[OP_CLEAR]).unwrap();
    assert_eq!(h.deltas(), vec![(q, 0, 1)]);
    assert!(h.rows(q).is_empty());
}

#[test]
fn negated_joins_bind_through_the_row() {
    let mut h = Harness::new();
    let q = h
        .q(&[&["issue", "$id", "project", "$p"]])
        .not(&["project", "$p", "archived", "true"])
        .not(&["issue", "$id", "hidden", "_"])
        .register();
    h.assert(ROOT_OWNER, &["issue", "1", "project", "p1"]);
    h.assert(ROOT_OWNER, &["issue", "2", "project", "p2"]);
    h.assert(ROOT_OWNER, &["project", "p2", "archived", "true"]);
    h.e.drain();
    assert_eq!(h.rows_str(q), set(&[&["1", "p1"]]));
    h.replace(&["project", "p2", "archived", "false"]);
    h.assert(ROOT_OWNER, &["issue", "1", "hidden", "yes"]);
    assert_eq!(h.deltas(), vec![(q, 1, 1)]);
    assert_eq!(h.rows_str(q), set(&[&["2", "p2"]]));
    let stats = h.e.stats();
    assert!(stats.indexes >= 1, "negations with wildcards need an index to count matches");
}

#[test]
fn filters_compare_terms_and_match_substrings() {
    let mut h = Harness::new();
    for (id, priority, title) in [("a", "#1", "Fix Login"), ("b", "#2", "login page"), ("c", "#3", "Signup")] {
        h.assert(ROOT_OWNER, &["issue", id, "priority", priority]);
        h.assert(ROOT_OWNER, &["issue", id, "title", title]);
    }
    fn priority(h: &mut Harness) -> Q<'_> {
        h.q(&[&["issue", "$id", "priority", "$p"]])
    }
    fn title(h: &mut Harness) -> Q<'_> {
        h.q(&[&["issue", "$id", "title", "$t"]])
    }
    let high = priority(&mut h).filter(&[("$p", ">=", "#2")]).register();
    let not_first = priority(&mut h).filter(&[("$p", "!=", "#1")]).register();
    let either = priority(&mut h).filter(&[("$p", "=", "#1"), ("$p", "=", "#3")]).register();
    let login = title(&mut h).filter(&[("$t", "icontains", "LOGIN")]).register();
    let exact = title(&mut h).filter(&[("$t", "contains", "Login")]).register();
    let fix = title(&mut h).filter(&[("$t", "startsWith", "Fix")]).register();
    let ifix = title(&mut h).filter(&[("$t", "istartsWith", "fIX")]).register();
    let numeric_text = priority(&mut h).filter(&[("$p", "contains", "1")]).register();
    let both = title(&mut h)
        .filter(&[("$t", "icontains", "login")])
        .filter(&[("$t", "startsWith", "Fix")])
        .register();
    let higher = h
        .q(&[&["issue", "$id", "priority", "$p"], &["issue", "$other", "priority", "$q"]])
        .filter(&[("$p", ">", "$q")])
        .register();

    assert_eq!(h.rows_str(high), set(&[&["b", "2"], &["c", "3"]]));
    assert_eq!(h.rows_str(not_first), set(&[&["b", "2"], &["c", "3"]]));
    assert_eq!(h.rows_str(either), set(&[&["a", "1"], &["c", "3"]]));
    assert_eq!(h.rows_str(login), set(&[&["a", "Fix Login"], &["b", "login page"]]));
    assert_eq!(h.rows_str(exact), set(&[&["a", "Fix Login"]]));
    assert_eq!(h.rows_str(fix), set(&[&["a", "Fix Login"]]));
    assert_eq!(h.rows_str(ifix), set(&[&["a", "Fix Login"]]));
    assert!(h.rows(numeric_text).is_empty(), "string operators never match numbers");
    assert_eq!(h.rows_str(both), set(&[&["a", "Fix Login"]]), "filters conjoin");
    assert_eq!(
        h.rows_str(higher),
        set(&[&["b", "2", "a", "1"], &["c", "3", "a", "1"], &["c", "3", "b", "2"]])
    );
    assert_eq!(h.deltas(), vec![]);

    h.replace(&["issue", "a", "priority", "#5"]);
    let mut deltas = h.deltas();
    deltas.sort_unstable();
    let mut expected = vec![(high, 1, 0), (not_first, 1, 0), (either, 0, 1), (higher, 2, 2)];
    expected.sort_unstable();
    assert_eq!(deltas, expected);
    assert_eq!(
        h.rows_str(higher),
        set(&[&["a", "5", "b", "2"], &["a", "5", "c", "3"], &["c", "3", "b", "2"]])
    );
    assert_eq!(
        h.q(&[&["issue", "$id", "priority", "$p"]]).filter(&[("$p", "<", "#3")]).query(),
        list(&[&["b", "2"]]),
        "one-off queries filter too"
    );
    assert_eq!(
        h.q(&[&["issue", "$id", "priority", "$p"]])
            .filter(&[("$p", "<=", "#3")])
            .filter(&[("$id", "!=", "b")])
            .query(),
        list(&[&["c", "3"]])
    );
}

#[test]
fn filter_literals_are_held_while_the_query_lives() {
    let mut h = Harness::new();
    h.e.set_fact_events(FACT_EVENTS_NONE);
    h.assert(ROOT_OWNER, &["issue", "1", "title", "hay"]);
    let q = h
        .q(&[&["issue", "$id", "title", "$t"]])
        .filter(&[("$t", "icontains", "needle")])
        .register();
    let needle = h.lit("needle");
    let patterns = vec![h.pattern(&["issue", "$id", "title", "$t"])];
    h.e.drain();
    assert_eq!(h.e.drain(), vec![], "the literal only a filter mentions stays interned");
    assert_eq!(h.e.interner.refcount(needle), 1);
    assert!(h.e.release(q));
    h.e.drain();
    assert!(super::freed(&h.e.drain()).contains(&needle));
    let stale = Spec {
        patterns,
        filters: vec![vec![Predicate { lhs: 1, op: Op::Eq, rhs: Operand::Lit(needle) }]],
        ..Spec::default()
    };
    assert_eq!(h.e.register(stale), Err(format!("unknown term id {needle}")));
}

#[test]
fn counts_follow_visible_rows_per_group() {
    let mut h = Harness::new();
    let by_status = h.q(&[&["issue", "$id", "status", "$s"]]).count("$n", &["$s"]).register();
    let total = h.q(&[&["issue", "$id", "status", "$s"]]).count("$n", &[]).register();
    let open = h
        .q(&[&["issue", "$id", "status", "$s"]])
        .not(&["issue", "$id", "archived", "true"])
        .count("$n", &["$s"])
        .register();
    assert!(h.rows(total).is_empty(), "no rows, no count");
    h.assert(ROOT_OWNER, &["issue", "1", "status", "todo"]);
    h.assert(ROOT_OWNER, &["issue", "2", "status", "todo"]);
    h.assert(ROOT_OWNER, &["issue", "3", "status", "done"]);
    let mut deltas = h.deltas();
    deltas.sort_unstable();
    assert_eq!(deltas, vec![(by_status, 2, 0), (total, 1, 0), (open, 2, 0)]);
    assert_eq!(h.rows_str(by_status), set(&[&["todo", "2"], &["done", "1"]]));
    assert_eq!(h.rows_str(total), set(&[&["3"]]));
    assert_eq!(
        h.ordered(by_status),
        list(&[&["todo", "2"], &["done", "1"]]),
        "groups keep first-appearance order"
    );

    h.replace(&["issue", "1", "status", "done"]);
    let mut deltas = h.deltas();
    deltas.sort_unstable();
    assert_eq!(deltas, vec![(by_status, 2, 2), (open, 2, 2)], "the total did not change, so it is silent");
    assert_eq!(h.rows_str(by_status), set(&[&["todo", "1"], &["done", "2"]]));
    assert_eq!(h.ordered(by_status), list(&[&["todo", "1"], &["done", "2"]]));

    h.assert(ROOT_OWNER, &["issue", "3", "archived", "true"]);
    assert_eq!(h.deltas(), vec![(open, 1, 1)]);
    assert_eq!(h.rows_str(open), set(&[&["todo", "1"], &["done", "1"]]));
    assert_eq!(h.rows_str(by_status), set(&[&["todo", "1"], &["done", "2"]]));

    h.drop(&["issue", "2", "status", "_"]);
    assert_eq!(h.rows_str(by_status), set(&[&["done", "2"]]), "empty groups disappear");
    assert_eq!(
        h.deltas(),
        vec![(by_status, 0, 1), (total, 1, 1), (open, 0, 1)],
        "reading rows early changes nothing"
    );
    h.drop(&["issue", "_", "status", "_"]);
    assert!(h.rows(by_status).is_empty() && h.rows(total).is_empty() && h.rows(open).is_empty());
    h.assert(ROOT_OWNER, &["issue", "9", "status", "todo"]);
    h.assert(ROOT_OWNER, &["issue", "9", "status", "todo"]);
    assert_eq!(h.rows_str(total), set(&[&["1"]]), "a count is over distinct rows");
    assert_eq!(
        h.q(&[&["issue", "$id", "status", "$s"]]).count("$n", &["$s"]).query(),
        list(&[&["todo", "1"]])
    );
}

#[test]
fn sums_and_extremes_track_updates() {
    let mut h = Harness::new();
    fn points(h: &mut Harness) -> Q<'_> {
        h.q(&[&["issue", "$id", "project", "$p"], &["issue", "$id", "points", "$n"]])
    }
    let sum = points(&mut h).sum("$n", "$total", &["$p"]).register();
    let min = points(&mut h).min("$n", "$least", &["$p"]).register();
    let max = points(&mut h).max("$n", "$most", &["$p"]).register();
    for (id, project, n) in [("a", "p1", "#3"), ("b", "p1", "#5"), ("c", "p2", "#5")] {
        h.assert(ROOT_OWNER, &["issue", id, "project", project]);
        h.assert(ROOT_OWNER, &["issue", id, "points", n]);
    }
    h.e.drain();
    assert_eq!(h.rows_str(sum), set(&[&["p1", "8"], &["p2", "5"]]));
    assert_eq!(h.rows_str(min), set(&[&["p1", "3"], &["p2", "5"]]));
    assert_eq!(h.rows_str(max), set(&[&["p1", "5"], &["p2", "5"]]));

    h.replace(&["issue", "b", "points", "#1"]);
    let mut deltas = h.deltas();
    deltas.sort_unstable();
    assert_eq!(deltas, vec![(sum, 1, 1), (min, 1, 1), (max, 1, 1)]);
    assert_eq!(h.rows_str(sum), set(&[&["p1", "4"], &["p2", "5"]]));
    assert_eq!(h.rows_str(min), set(&[&["p1", "1"], &["p2", "5"]]));
    assert_eq!(h.rows_str(max), set(&[&["p1", "3"], &["p2", "5"]]));

    h.assert(ROOT_OWNER, &["issue", "d", "project", "p1"]);
    h.assert(ROOT_OWNER, &["issue", "d", "points", "#3"]);
    h.assert(ROOT_OWNER, &["issue", "e", "project", "p1"]);
    h.assert(ROOT_OWNER, &["issue", "e", "points", "many"]);
    h.e.drain();
    assert_eq!(h.rows_str(sum), set(&[&["p1", "7"], &["p2", "5"]]), "non-numbers do not add");
    assert_eq!(h.rows_str(max), set(&[&["p1", "many"], &["p2", "5"]]), "but they do sort after numbers");
    h.drop(&["issue", "a", "points", "_"]);
    h.e.drain();
    assert_eq!(h.rows_str(sum), set(&[&["p1", "4"], &["p2", "5"]]));
    assert_eq!(h.rows_str(max), set(&[&["p1", "many"], &["p2", "5"]]));
    h.drop(&["issue", "e", "_", "_"]);
    h.e.drain();
    assert_eq!(
        h.rows_str(max),
        set(&[&["p1", "3"], &["p2", "5"]]),
        "a duplicate value survives one removal"
    );
    h.drop(&["issue", "c", "_", "_"]);
    h.e.drain();
    assert_eq!(h.rows_str(sum), set(&[&["p1", "4"]]));
    assert_eq!(h.rows_str(min), set(&[&["p1", "1"]]));
    assert_eq!(
        h.q(&[&["issue", "$id", "points", "$n"]]).sum("$n", "$total", &[]).query(),
        list(&[&["4"]])
    );
    assert_eq!(h.q(&[&["issue", "$id", "points", "$n"]]).max("$n", "$most", &[]).query(), list(&[&["3"]]));
}

#[test]
fn extremes_tell_apart_terms_that_compare_equal() {
    let mut h = Harness::new();
    let max = h.q(&[&["reading", "$id", "value", "$v"]]).max("$v", "$most", &[]).register();
    let quiet = h.e.interner.intern_num(f64::NAN);
    let payload = h.e.interner.intern_num(f64::from_bits(0x7ff8_0000_0000_0001));
    assert_ne!(quiet, payload, "NaNs with different payloads are different terms");
    h.assert(ROOT_OWNER, &["reading", "a", "value", "#5"]);
    for (id, nan) in [("b", quiet), ("c", payload)] {
        let ops = [OP_ASSERT, ROOT_OWNER, NONE, 4, h.lit("reading"), h.lit(id), h.lit("value"), nan];
        h.e.apply(&ops).unwrap();
    }
    h.e.drain();
    assert_eq!(h.rows_str(max), set(&[&["NaN"]]));
    h.drop(&["reading", "b", "_", "_"]);
    h.e.drain();
    assert_eq!(h.rows_str(max), set(&[&["NaN"]]), "the other NaN is still there");
    h.drop(&["reading", "c", "_", "_"]);
    h.e.drain();
    assert_eq!(h.rows_str(max), set(&[&["5"]]));
}

#[test]
fn aggregate_values_are_released_with_the_query() {
    let mut h = Harness::new();
    h.e.set_fact_events(FACT_EVENTS_NONE);
    let q = h.q(&[&["issue", "$id", "points", "$n"]]).sum("$n", "$total", &[]).register();
    h.assert(ROOT_OWNER, &["issue", "a", "points", "#3"]);
    h.assert(ROOT_OWNER, &["issue", "b", "points", "#4"]);
    h.e.drain();
    let seven = h.e.interner.intern_num(7.0);
    assert_eq!(h.e.interner.refcount(seven), 1, "the reported sum is held by the query");
    h.e.drain();
    assert_eq!(h.e.drain(), vec![]);
    h.drop(&["issue", "a", "points", "_"]);
    h.e.drain();
    h.e.drain();
    assert!(super::freed(&h.e.drain()).contains(&seven), "a superseded value is let go");
    let four = h.e.interner.intern_num(4.0);
    assert_eq!(h.e.interner.refcount(four), 2, "held by the fact and the query");
    assert!(h.e.release(q));
    assert_eq!(h.e.interner.refcount(four), 1);
    let plain = h.q(&[&["issue", "$id", "points", "$n"]]).sum("$n", "$total", &[]).query();
    assert_eq!(plain, list(&[&["4"]]));
    assert_eq!(h.e.interner.refcount(four), 1, "a one-off query leaves nothing behind");
}

#[test]
fn ordered_windows_page_through_results() {
    let mut h = Harness::new();
    for (id, p) in [("a", "#3"), ("b", "#1"), ("c", "#2"), ("d", "#1")] {
        h.assert(ROOT_OWNER, &["issue", id, "priority", p]);
    }
    fn issues(h: &mut Harness) -> Q<'_> {
        h.q(&[&["issue", "$id", "priority", "$p"]])
    }
    let top = issues(&mut h).order("$p", true).limit(2);
    let (top_keys, top) = (top.keys_of(), top.register());
    let page = issues(&mut h).order("$p", false).offset(1).limit(2);
    let (page_keys, page) = (page.keys_of(), page.register());
    let rest = issues(&mut h).order("$p", false).offset(3);
    let (rest_keys, rest) = (rest.keys_of(), rest.register());
    assert_eq!(h.ranked(top, &top_keys), list(&[&["a", "3"], &["c", "2"]]));
    assert_eq!(h.ranked(page, &page_keys), list(&[&["d", "1"], &["c", "2"]]), "ties keep assertion order");
    assert_eq!(h.ranked(rest, &rest_keys), list(&[&["a", "3"]]));
    assert_eq!(h.deltas(), vec![]);

    h.assert(ROOT_OWNER, &["issue", "e", "priority", "#5"]);
    let mut deltas = h.deltas();
    deltas.sort_unstable();
    assert_eq!(deltas, vec![(top, 1, 1), (rest, 1, 0)], "a row beyond the page is silent for it");
    assert_eq!(h.ranked(top, &top_keys), list(&[&["e", "5"], &["a", "3"]]));
    assert_eq!(h.ranked(rest, &rest_keys), list(&[&["a", "3"], &["e", "5"]]));

    h.drop(&["issue", "b", "priority", "_"]);
    let mut deltas = h.deltas();
    deltas.sort_unstable();
    assert_eq!(deltas, vec![(page, 1, 1), (rest, 0, 1)], "rows shift into the page from both sides");
    assert_eq!(h.ranked(page, &page_keys), list(&[&["c", "2"], &["a", "3"]]));
    assert_eq!(h.ranked(rest, &rest_keys), list(&[&["e", "5"]]));

    h.replace(&["issue", "d", "priority", "#4"]);
    h.e.drain();
    assert_eq!(h.ranked(page, &page_keys), list(&[&["a", "3"], &["d", "4"]]));
    assert_eq!(h.ranked(top, &top_keys), list(&[&["e", "5"], &["d", "4"]]));
    assert_eq!(
        issues(&mut h).order("$p", false).offset(1).limit(2).query(),
        list(&[&["a", "3"], &["d", "4"]]),
        "one-off windows match"
    );
    assert_eq!(issues(&mut h).order("$p", true).offset(10).query(), list(&[]));
    assert_eq!(
        issues(&mut h).order("$id", true).limit(1).query(),
        list(&[&["e", "5"]]),
        "strings order too"
    );
}

#[test]
fn windows_over_aggregates_and_multiple_keys() {
    let mut h = Harness::new();
    for (id, status, p) in [
        ("a", "todo", "#2"),
        ("b", "todo", "#1"),
        ("c", "done", "#2"),
        ("d", "done", "#1"),
        ("e", "todo", "#3"),
    ] {
        h.assert(ROOT_OWNER, &["issue", id, "status", status]);
        h.assert(ROOT_OWNER, &["issue", id, "priority", p]);
    }
    fn both(h: &mut Harness) -> Q<'_> {
        h.q(&[&["issue", "$id", "status", "$s"], &["issue", "$id", "priority", "$p"]])
    }
    let q = both(&mut h).order("$s", false).order("$p", true).limit(3);
    let (keys, q) = (q.keys_of(), q.register());
    assert_eq!(h.ranked(q, &keys), list(&[&["c", "done", "2"], &["d", "done", "1"], &["e", "todo", "3"]]));
    let biggest = both(&mut h).count("$n", &["$s"]).order("$n", true).limit(1);
    let (bkeys, biggest) = (biggest.keys_of(), biggest.register());
    assert_eq!(h.ranked(biggest, &bkeys), list(&[&["todo", "3"]]));
    h.e.drain();
    h.drop(&["issue", "e", "_", "_"]);
    h.drop(&["issue", "a", "_", "_"]);
    let mut deltas = h.deltas();
    deltas.sort_unstable();
    assert_eq!(deltas, vec![(q, 1, 1), (biggest, 1, 1)]);
    assert_eq!(h.ranked(q, &keys), list(&[&["c", "done", "2"], &["d", "done", "1"], &["b", "todo", "1"]]));
    assert_eq!(h.ranked(biggest, &bkeys), list(&[&["done", "2"]]));
    assert_eq!(
        both(&mut h).count("$n", &["$s"]).order("$s", true).query(),
        list(&[&["todo", "1"], &["done", "2"]]),
        "aggregate rows can be ordered by their group"
    );
}

#[test]
fn invalid_specs_are_rejected_before_anything_changes() {
    let mut h = Harness::new();
    let queries = h.e.query_count();
    let bad = [
        (
            h.q(&[&["issue", "$id", "priority", "$p"]])
                .filter(&[("$other", ">", "#1")])
                .try_register(),
            "predicate references unbound variable 2",
        ),
        (
            h.q(&[&["issue", "$id", "priority", "$p"]]).count("$n", &["$other"]).try_register(),
            "group key references unbound variable 2",
        ),
        (
            h.q(&[&["issue", "$id", "priority", "$p"]]).count("$n", &["$p", "$p"]).try_register(),
            "group key 1 repeats a grouped or aggregated variable",
        ),
        (
            h.q(&[&["issue", "$id", "priority", "$p"]]).sum("$p", "$n", &["$p"]).try_register(),
            "group key 1 repeats a grouped or aggregated variable",
        ),
        (
            h.q(&[&["issue", "$id", "priority", "$p"]])
                .aggregate(AggOp::Count, Some("$p"), "$n", &[])
                .try_register(),
            "count takes no input variable",
        ),
        (
            h.q(&[&["issue", "$id", "priority", "$p"]])
                .aggregate(AggOp::Sum, None, "$n", &[])
                .try_register(),
            "sum, min and max need an input variable",
        ),
        (
            h.q(&[&["issue", "$id", "priority", "$p"]])
                .count("$n", &["$id"])
                .order("$p", false)
                .try_register(),
            "order key 4294967295 is outside the output row",
        ),
        (
            h.q(&[&["issue", "$id", "priority", "$p"]])
                .aggregate(AggOp::Max, Some("$missing"), "$n", &[])
                .try_register(),
            "aggregate references unbound variable 2",
        ),
    ];
    for (result, message) in bad {
        assert_eq!(result, Err(message.to_string()));
    }
    let unbound = Spec { patterns: vec![vec![h.lit("k"), VAR_BASE + 1]], ..Spec::default() };
    assert_eq!(h.e.register(unbound.clone()), Err("variable 0 is never bound by a pattern".to_string()));
    assert_eq!(h.e.query(unbound), Err("variable 0 is never bound by a pattern".to_string()));
    assert_eq!(h.e.query_count(), queries);
    assert_eq!(
        h.q(&[&["issue", "$id", "priority", "$p"]])
            .filter(&[("$p", ">", "$zzz")])
            .try_query()
            .unwrap_err(),
        "predicate references unbound variable 2"
    );
}

// --- randomized comparison against a naive model ---

struct Facts(BTreeSet<Vec<TermId>>);

impl Facts {
    fn matching(&self, clause: &[u32], row: &[TermId]) -> bool {
        let bound: Vec<u32> = clause.iter().map(|&p| if is_var(p) { row[var_of(p) as usize] } else { p }).collect();
        self.0
            .iter()
            .any(|fact| fact.len() == bound.len() && bound.iter().zip(fact).all(|(&p, &t)| p == WILD || p == t))
    }

    fn rows(&self, patterns: &[Clause], nvars: usize) -> Vec<Vec<TermId>> {
        let mut out = BTreeSet::new();
        self.walk(patterns, 0, &mut vec![NONE; nvars], &mut out);
        out.into_iter().collect()
    }

    fn walk(&self, patterns: &[Clause], i: usize, row: &mut Vec<TermId>, out: &mut BTreeSet<Vec<TermId>>) {
        if i == patterns.len() {
            out.insert(row.clone());
            return;
        }
        for fact in &self.0 {
            let saved = row.clone();
            if super::bind(&patterns[i], fact, row) {
                self.walk(patterns, i + 1, row, out);
            }
            *row = saved;
        }
    }
}

fn holds(h: &Harness, p: &Predicate, row: &[TermId]) -> bool {
    let lhs = row[p.lhs as usize];
    let rhs = match p.rhs {
        Operand::Var(v) => row[v as usize],
        Operand::Lit(t) => t,
    };
    let (a, b) = (h.e.interner.resolve(lhs), h.e.interner.resolve(rhs));
    match p.op {
        Op::Eq => lhs == rhs,
        Op::Ne => lhs != rhs,
        Op::Lt => a.compare(b) == Ordering::Less,
        Op::Le => a.compare(b) != Ordering::Greater,
        Op::Gt => a.compare(b) == Ordering::Greater,
        Op::Ge => a.compare(b) != Ordering::Less,
        Op::Contains | Op::StartsWith | Op::ContainsCi | Op::StartsWithCi => match (a, b) {
            (Term::Str(x), Term::Str(y)) => match p.op {
                Op::Contains => x.contains(&**y),
                Op::StartsWith => x.starts_with(&**y),
                Op::ContainsCi => x.to_lowercase().contains(&y.to_lowercase()),
                _ => x.to_lowercase().starts_with(&y.to_lowercase()),
            },
            _ => false,
        },
    }
}

/// What a query should show, as resolved terms; windows report their key multiset instead of rows.
enum Expected {
    Rows(Vec<Vec<Term>>),
    Window { candidates: Vec<Vec<Term>>, keys: Vec<Vec<Term>> },
}

fn expected(h: &Harness, facts: &Facts, spec: &Spec) -> Expected {
    let nvars = spec.nvars();
    let rows: Vec<Vec<TermId>> = facts
        .rows(&spec.patterns, nvars)
        .into_iter()
        .filter(|row| !spec.negations.iter().any(|n| facts.matching(n, row)))
        .filter(|row| spec.filters.iter().all(|f| f.iter().any(|p| holds(h, p, row))))
        .collect();
    let resolve = |row: &[TermId]| -> Vec<Term> { row.iter().map(|&t| h.e.interner.resolve(t).clone()).collect() };
    let mut out: Vec<Vec<Term>> = match &spec.aggregate {
        None => rows.iter().map(|r| resolve(r)).collect(),
        Some(agg) => {
            let mut groups: Vec<(Vec<TermId>, Vec<TermId>)> = Vec::new();
            for row in &rows {
                let key: Vec<TermId> = agg.group.iter().map(|&g| row[g as usize]).collect();
                let value = agg.input.map_or(0, |v| row[v as usize]);
                match groups.iter_mut().find(|(k, _)| *k == key) {
                    Some((_, values)) => values.push(value),
                    None => groups.push((key, vec![value])),
                }
            }
            groups
                .into_iter()
                .map(|(key, values)| {
                    let mut row = resolve(&key);
                    let nums = || {
                        values.iter().filter_map(|&v| match h.e.interner.resolve(v) {
                            Term::Num(n) => Some(*n),
                            _ => None,
                        })
                    };
                    let cmp = |a: &&TermId, b: &&TermId| h.e.interner.resolve(**a).compare(h.e.interner.resolve(**b));
                    row.push(match agg.op {
                        AggOp::Count => Term::Num(values.len() as f64),
                        AggOp::Sum => Term::Num(nums().sum()),
                        AggOp::Min => h.e.interner.resolve(*values.iter().min_by(cmp).unwrap()).clone(),
                        AggOp::Max => h.e.interner.resolve(*values.iter().max_by(cmp).unwrap()).clone(),
                    });
                    row
                })
                .collect()
        }
    };
    if spec.order.is_empty() && spec.offset == 0 && spec.limit.is_none() {
        sort_terms(&mut out);
        return Expected::Rows(out);
    }
    let key_of = |row: &[Term]| -> Vec<Term> { spec.order.iter().map(|s| row[s.var as usize].clone()).collect() };
    let mut sorted = out.clone();
    sorted.sort_by(|a, b| compare_keys(spec, &key_of(a), &key_of(b)));
    let start = (spec.offset as usize).min(sorted.len());
    let end = spec.limit.map_or(sorted.len(), |l| (start + l as usize).min(sorted.len()));
    let mut keys: Vec<Vec<Term>> = sorted[start..end].iter().map(|r| key_of(r)).collect();
    sort_terms(&mut keys);
    sort_terms(&mut out);
    Expected::Window { candidates: out, keys }
}

fn compare_keys(spec: &Spec, a: &[Term], b: &[Term]) -> Ordering {
    for (i, sort) in spec.order.iter().enumerate() {
        let ordering = a[i].compare(&b[i]);
        let ordering = if sort.descending { ordering.reverse() } else { ordering };
        if ordering != Ordering::Equal {
            return ordering;
        }
    }
    Ordering::Equal
}

fn compare_rows(a: &[Term], b: &[Term]) -> Ordering {
    a.iter()
        .zip(b)
        .map(|(x, y)| x.compare(y))
        .find(|o| *o != Ordering::Equal)
        .unwrap_or(Ordering::Equal)
}

fn sort_terms(rows: &mut [Vec<Term>]) {
    rows.sort_by(|a, b| compare_rows(a, b));
}

fn actual(h: &mut Harness, qid: QueryId, spec: &Spec) -> Vec<(Vec<Term>, u64)> {
    let packed = h.e.rows(qid);
    let arity = packed[0] as usize;
    assert_eq!(arity, spec.arity());
    let mut rows = Vec::new();
    let mut i = 2;
    for _ in 0..packed[1] {
        let row: Vec<Term> = packed[i + 1..i + 1 + arity].iter().map(|&t| h.e.interner.resolve(t).clone()).collect();
        let order = (u64::from(packed[i + 1 + arity]) << 32) | u64::from(packed[i + 2 + arity]);
        rows.push((row, order));
        i += 3 + arity;
    }
    rows
}

fn check(h: &mut Harness, qid: QueryId, spec: &Spec, want: &Expected, context: &str) {
    let mut rows: Vec<Vec<Term>> = actual(h, qid, spec).into_iter().map(|(r, _)| r).collect();
    sort_terms(&mut rows);
    match want {
        Expected::Rows(expected) => assert_eq!(&rows, expected, "{context}"),
        Expected::Window { candidates, keys } => {
            for row in &rows {
                assert!(
                    candidates.iter().any(|c| compare_rows(c, row) == Ordering::Equal),
                    "{context}: {row:?} is not a candidate"
                );
            }
            let mut got_keys: Vec<Vec<Term>> = rows
                .iter()
                .map(|r| spec.order.iter().map(|s| r[s.var as usize].clone()).collect())
                .collect();
            sort_terms(&mut got_keys);
            assert_eq!(&got_keys, keys, "{context}: window keys");
        }
    }
}

#[test]
fn engine_agrees_with_a_naive_model_for_every_clause_kind() {
    let mut h = Harness::new();
    let entities = ["e1", "e2", "e3", "e4"];
    let kinds = ["a", "b", "c"];
    let scores = ["#1", "#2", "#3", "#4"];
    let labels = ["x", "xy", "y"];
    let specs: Vec<Spec> = vec![
        h.q(&[&["$e", "kind", "$k"]]).not(&["$e", "label", "_"]).spec,
        h.q(&[&["$e", "parent", "$p"]]).not(&["$p", "kind", "a"]).spec,
        h.q(&[&["$e", "parent", "$p"]]).not(&["$p", "kind", "$k"]).spec,
        h.q(&[&["$e", "score", "$s"]]).filter(&[("$s", ">=", "#2")]).spec,
        h.q(&[&["$e", "score", "$s"], &["$e", "parent", "$p"], &["$p", "score", "$t"]])
            .filter(&[("$s", ">", "$t")])
            .spec,
        h.q(&[&["$e", "kind", "$k"]]).filter(&[("$k", "=", "a"), ("$k", "=", "c")]).spec,
        h.q(&[&["$e", "label", "$l"]])
            .filter(&[("$l", "startsWith", "x")])
            .filter(&[("$l", "!=", "xy")])
            .spec,
        h.q(&[&["$e", "label", "$l"], &["$e", "kind", "$k"]])
            .filter(&[("$l", "icontains", "Y")])
            .not(&["$e", "score", "#4"])
            .spec,
        h.q(&[&["$e", "kind", "$k"]]).count("$n", &["$k"]).spec,
        h.q(&[&["$e", "score", "$s"], &["$e", "kind", "$k"]]).sum("$s", "$n", &["$k"]).spec,
        h.q(&[&["$e", "score", "$s"]]).not(&["$e", "label", "_"]).min("$s", "$n", &[]).spec,
        h.q(&[&["$e", "score", "$s"], &["$e", "kind", "$k"]]).max("$s", "$n", &["$k"]).spec,
        h.q(&[&["$e", "parent", "$p"], &["$p", "score", "$s"]]).count("$n", &["$p", "$s"]).spec,
        h.q(&[&["$e", "score", "$s"]]).order("$s", true).limit(2).spec,
        h.q(&[&["$e", "score", "$s"], &["$e", "kind", "$k"]])
            .order("$k", false)
            .order("$s", true)
            .offset(1)
            .limit(3)
            .spec,
        h.q(&[&["$e", "kind", "$k"]]).not(&["$e", "label", "y"]).order("$e", false).offset(1).spec,
        h.q(&[&["$e", "kind", "$k"]])
            .count("$n", &["$k"])
            .order("$n", true)
            .order("$k", false)
            .limit(1)
            .spec,
        h.q(&[&["$e", "score", "$s"], &["$e", "kind", "$k"]])
            .sum("$s", "$n", &["$k"])
            .order("$n", false)
            .limit(2)
            .spec,
    ];
    let specs: Vec<Spec> = specs.into_iter().map(|s| s.normalize().unwrap()).collect();
    let qids: Vec<QueryId> = specs.iter().map(|s| h.e.register(s.clone()).unwrap()).collect();
    let mut facts = Facts(BTreeSet::new());
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    for step in 0..400 {
        let e = entities[rng.below(entities.len())];
        let (a, v) = match rng.below(4) {
            0 => ("kind", kinds[rng.below(kinds.len())]),
            1 => ("score", scores[rng.below(scores.len())]),
            2 => ("parent", entities[rng.below(entities.len())]),
            _ => ("label", labels[rng.below(labels.len())]),
        };
        let terms = h.terms(&[e, a, v]);
        match rng.below(6) {
            0..=1 => {
                h.assert(ROOT_OWNER, &[e, a, v]);
                facts.0.insert(terms);
            }
            2..=3 => {
                h.replace(&[e, a, v]);
                facts.0.retain(|f| !(f.len() == 3 && f[0] == terms[0] && f[1] == terms[1]));
                facts.0.insert(terms);
            }
            4 => {
                h.drop(&[e, a, v]);
                facts.0.remove(&terms);
            }
            _ => {
                h.drop(&[e, a, "_"]);
                facts.0.retain(|f| !(f.len() == 3 && f[0] == terms[0] && f[1] == terms[1]));
            }
        }
        h.e.drain();
        for (i, (spec, &qid)) in specs.iter().zip(&qids).enumerate() {
            let want = expected(&h, &facts, spec);
            check(&mut h, qid, spec, &want, &format!("step {step}, query {i}"));
        }
    }
    for (i, (spec, &qid)) in specs.iter().zip(&qids).enumerate() {
        let want = expected(&h, &facts, spec);
        let fresh = h.e.register(spec.clone()).unwrap();
        assert_eq!(fresh, qid, "query {i} is shared");
        h.e.release(fresh);
        let mut one_off: Vec<Vec<Term>> = {
            let packed = h.e.query(spec.clone()).unwrap();
            let arity = packed[0] as usize;
            (0..packed[1] as usize)
                .map(|r| {
                    packed[2 + r * arity..2 + (r + 1) * arity]
                        .iter()
                        .map(|&t| h.e.interner.resolve(t).clone())
                        .collect()
                })
                .collect()
        };
        sort_terms(&mut one_off);
        let mut registered: Vec<Vec<Term>> = actual(&mut h, qid, spec).into_iter().map(|(r, _)| r).collect();
        sort_terms(&mut registered);
        assert_eq!(one_off, registered, "query {i}: one-off and maintained results agree");
        check(&mut h, qid, spec, &want, &format!("final, query {i}"));
    }
}
