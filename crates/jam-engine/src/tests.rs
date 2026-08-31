use std::collections::{BTreeMap, BTreeSet};

use crate::engine::Engine;
use crate::query::{Clause, QueryId};
use crate::store::{OwnerId, ROOT_OWNER};
use crate::term::{Term, TermId, EMPTY, NONE, VAR_BASE, WILD};
use crate::wire::*;

/// Terms written as strings: `$x` is a variable, `_` a wildcard, anything else a literal.
struct Harness {
    e: Engine,
    vars: Vec<String>,
}

impl Harness {
    fn new() -> Self {
        let mut e = Engine::new();
        e.set_fact_events(FACT_EVENTS_ALL);
        Harness {
            e,
            vars: Vec::new(),
        }
    }

    fn lit(&mut self, s: &str) -> TermId {
        self.e.interner.intern_str(s)
    }

    fn terms(&mut self, terms: &[&str]) -> Vec<TermId> {
        terms.iter().map(|t| self.lit(t)).collect()
    }

    fn pattern(&mut self, terms: &[&str]) -> Clause {
        terms
            .iter()
            .map(|t| {
                if *t == "_" {
                    WILD
                } else if let Some(name) = t.strip_prefix('$') {
                    let i = match self.vars.iter().position(|v| v == name) {
                        Some(i) => i,
                        None => {
                            self.vars.push(name.to_string());
                            self.vars.len() - 1
                        }
                    };
                    VAR_BASE + i as u32
                } else {
                    self.lit(t)
                }
            })
            .collect()
    }

    fn register(&mut self, clauses: &[&[&str]]) -> QueryId {
        self.vars.clear();
        let clauses: Vec<Clause> = clauses.iter().map(|c| self.pattern(c)).collect();
        self.e.register(clauses)
    }

    fn assert(&mut self, owner: OwnerId, terms: &[&str]) {
        let t = self.terms(terms);
        let mut ops = vec![OP_ASSERT, owner, NONE, t.len() as u32];
        ops.extend(t);
        self.e.apply(&ops).unwrap();
    }

    fn assert_scoped(&mut self, owner: OwnerId, scope: &str, terms: &[&str]) {
        let scope = self.lit(scope);
        let t = self.terms(terms);
        let mut ops = vec![OP_ASSERT, owner, scope, t.len() as u32];
        ops.extend(t);
        self.e.apply(&ops).unwrap();
    }

    fn replace(&mut self, terms: &[&str]) {
        let t = self.terms(terms);
        let mut ops = vec![OP_REPLACE, ROOT_OWNER, NONE, t.len() as u32];
        ops.extend(t);
        self.e.apply(&ops).unwrap();
    }

    fn drop(&mut self, pattern: &[&str]) {
        self.vars.clear();
        let p = self.pattern(pattern);
        let mut ops = vec![OP_DROP, p.len() as u32];
        ops.extend(p);
        self.e.apply(&ops).unwrap();
    }

    fn revoke(&mut self, owner: OwnerId) {
        self.e.apply(&[OP_REVOKE, owner]).unwrap();
    }

    fn rows(&self, qid: QueryId) -> BTreeSet<Vec<TermId>> {
        let packed = self.e.rows(qid);
        let nvars = packed[0] as usize;
        let n = packed[1] as usize;
        let mut out = BTreeSet::new();
        let mut i = 2;
        for _ in 0..n {
            out.insert(packed[i + 1..i + 1 + nvars].to_vec());
            i += 3 + nvars;
        }
        assert_eq!(out.len(), n, "duplicate rows reported");
        out
    }

    /// Rows of a registered query in result order.
    fn ordered(&self, qid: QueryId) -> Vec<Vec<String>> {
        let packed = self.e.rows(qid);
        let nvars = packed[0] as usize;
        let n = packed[1] as usize;
        let mut rows: Vec<(u64, Vec<TermId>)> = Vec::new();
        let mut i = 2;
        for _ in 0..n {
            let row = packed[i + 1..i + 1 + nvars].to_vec();
            let order = (u64::from(packed[i + 1 + nvars]) << 32) | u64::from(packed[i + 2 + nvars]);
            rows.push((order, row));
            i += 3 + nvars;
        }
        rows.sort();
        rows.into_iter()
            .map(|(_, row)| self.resolve(&row))
            .collect()
    }

    fn resolve(&self, row: &[TermId]) -> Vec<String> {
        row.iter()
            .map(|&t| match self.e.interner.resolve(t) {
                Term::Str(s) => s.to_string(),
                other => other.to_string(),
            })
            .collect()
    }

    /// One-off evaluation in result order.
    fn fresh_ordered(&mut self, clauses: &[&[&str]]) -> Vec<Vec<String>> {
        self.vars.clear();
        let clauses: Vec<Clause> = clauses.iter().map(|c| self.pattern(c)).collect();
        let packed = self.e.query(clauses);
        let nvars = packed[0] as usize;
        let n = packed[1] as usize;
        (0..n)
            .map(|r| self.resolve(&packed[2 + r * nvars..2 + (r + 1) * nvars]))
            .collect()
    }

    fn rows_str(&self, qid: QueryId) -> BTreeSet<Vec<String>> {
        self.rows(qid)
            .into_iter()
            .map(|row| self.resolve(&row))
            .collect()
    }

    fn fresh(&mut self, clauses: &[&[&str]]) -> BTreeSet<Vec<TermId>> {
        self.vars.clear();
        let clauses: Vec<Clause> = clauses.iter().map(|c| self.pattern(c)).collect();
        let packed = self.e.query(clauses);
        let nvars = packed[0] as usize;
        let n = packed[1] as usize;
        let mut out = BTreeSet::new();
        for r in 0..n {
            out.insert(packed[2 + r * nvars..2 + (r + 1) * nvars].to_vec());
        }
        out
    }
}

#[derive(Debug, PartialEq)]
enum Event {
    Fact {
        flags: u32,
        scope: TermId,
        terms: Vec<TermId>,
    },
    Query {
        qid: QueryId,
        added: Vec<(u32, Vec<TermId>)>,
        removed: Vec<u32>,
    },
}

fn decode(events: &[u32]) -> Vec<Event> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < events.len() {
        match events[i] {
            EV_FACT => {
                let flags = events[i + 1];
                let scope = events[i + 2];
                let len = events[i + 3] as usize;
                let terms = events[i + 4..i + 4 + len].to_vec();
                out.push(Event::Fact {
                    flags,
                    scope,
                    terms,
                });
                i += 4 + len;
            }
            EV_QUERY => {
                let qid = events[i + 1];
                let nvars = events[i + 2] as usize;
                let n = events[i + 3] as usize;
                i += 4;
                let mut added = Vec::new();
                let mut removed = Vec::new();
                for _ in 0..n {
                    let rid = events[i];
                    if events[i + 1] == 1 {
                        added.push((rid, events[i + 2..i + 2 + nvars].to_vec()));
                        i += 4 + nvars;
                    } else {
                        removed.push(rid);
                        i += 2;
                    }
                }
                out.push(Event::Query {
                    qid,
                    added,
                    removed,
                });
            }
            other => panic!("bad event code {other} at {i}"),
        }
    }
    out
}

fn strs(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

#[test]
fn single_clause_tracks_facts() {
    let mut h = Harness::new();
    let q = h.register(&[&["todo", "$id", "title", "$t"]]);
    assert!(h.rows(q).is_empty());
    h.assert(ROOT_OWNER, &["todo", "1", "title", "milk"]);
    h.assert(ROOT_OWNER, &["todo", "2", "title", "eggs"]);
    h.assert(ROOT_OWNER, &["todo", "1", "done", "true"]);
    let events = decode(&h.e.drain());
    let queries: Vec<_> = events
        .iter()
        .filter(|e| matches!(e, Event::Query { .. }))
        .collect();
    assert_eq!(queries.len(), 1);
    match queries[0] {
        Event::Query { added, removed, .. } => {
            assert_eq!(added.len(), 2);
            assert!(removed.is_empty());
        }
        _ => unreachable!(),
    }
    assert_eq!(
        h.rows_str(q),
        BTreeSet::from([strs(&["1", "milk"]), strs(&["2", "eggs"])])
    );
    h.drop(&["todo", "1", "_", "_"]);
    let events = decode(&h.e.drain());
    let removed: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            Event::Query { removed, .. } => Some(removed.len()),
            _ => None,
        })
        .collect();
    assert_eq!(removed, vec![1]);
    assert_eq!(h.rows_str(q), BTreeSet::from([strs(&["2", "eggs"])]));
}

#[test]
fn joins_update_incrementally() {
    let mut h = Harness::new();
    let q = h.register(&[
        &["issue", "$id", "project", "$p"],
        &["issue", "$id", "title", "$t"],
        &["project", "$p", "name", "$n"],
    ]);
    h.assert(ROOT_OWNER, &["issue", "i1", "title", "Bug"]);
    h.assert(ROOT_OWNER, &["project", "p1", "name", "Core"]);
    assert!(h.rows(q).is_empty());
    h.assert(ROOT_OWNER, &["issue", "i1", "project", "p1"]);
    assert_eq!(
        h.rows_str(q),
        BTreeSet::from([strs(&["i1", "p1", "Bug", "Core"])])
    );
    h.replace(&["issue", "i1", "title", "Feature"]);
    assert_eq!(
        h.rows_str(q),
        BTreeSet::from([strs(&["i1", "p1", "Feature", "Core"])])
    );
    h.drop(&["project", "p1", "name", "Core"]);
    assert!(h.rows(q).is_empty());
    h.assert(ROOT_OWNER, &["project", "p1", "name", "Core"]);
    assert_eq!(h.rows(q).len(), 1);
    assert_eq!(
        h.rows(q),
        h.fresh(&[
            &["issue", "$id", "project", "$p"],
            &["issue", "$id", "title", "$t"],
            &["project", "$p", "name", "$n"]
        ])
    );
}

#[test]
fn fact_matching_two_clauses_counts_once() {
    let mut h = Harness::new();
    let q = h.register(&[&["$a", "knows", "$b"], &["$b", "knows", "$c"]]);
    h.assert(ROOT_OWNER, &["x", "knows", "x"]);
    assert_eq!(h.rows_str(q), BTreeSet::from([strs(&["x", "x", "x"])]));
    h.assert(ROOT_OWNER, &["x", "knows", "y"]);
    h.assert(ROOT_OWNER, &["y", "knows", "x"]);
    let expected = h.fresh(&[&["$a", "knows", "$b"], &["$b", "knows", "$c"]]);
    assert_eq!(h.rows(q), expected);
    assert_eq!(expected.len(), 5);
    h.drop(&["x", "knows", "x"]);
    let expected = h.fresh(&[&["$a", "knows", "$b"], &["$b", "knows", "$c"]]);
    assert_eq!(h.rows(q), expected);
    h.drop(&["_", "knows", "_"]);
    assert!(h.rows(q).is_empty());
    h.e.drain();
}

#[test]
fn ownership_cascades_and_shares() {
    let mut h = Harness::new();
    let q = h.register(&[&["dom", "$n", "tag", "$t"]]);
    let a = h.e.create_owner(ROOT_OWNER).unwrap();
    let b = h.e.create_owner(a).unwrap();
    h.assert(a, &["dom", "1", "tag", "div"]);
    h.assert(b, &["dom", "2", "tag", "span"]);
    h.assert(b, &["dom", "1", "tag", "div"]);
    h.assert(ROOT_OWNER, &["dom", "3", "tag", "p"]);
    h.assert(a, &["dom", "3", "tag", "p"]);
    assert_eq!(h.rows(q).len(), 3);
    h.e.drain();
    h.revoke(b);
    assert_eq!(h.rows(q).len(), 2, "fact 1 is still held by a");
    h.revoke(a);
    assert_eq!(h.rows(q).len(), 1, "fact 3 is still held by root");
    let events = decode(&h.e.drain());
    let removed: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            Event::Fact { flags, .. } if flags & FACT_ADDED == 0 => Some(*flags),
            _ => None,
        })
        .collect();
    assert_eq!(removed, vec![0, 0], "owner revocations are never durable");
    assert!(!h.e.owner_exists(a) && !h.e.owner_exists(b));
    h.assert(a, &["dom", "9", "tag", "x"]);
    assert_eq!(
        h.rows(q).len(),
        1,
        "claims under a revoked owner are ignored"
    );
}

#[test]
fn durable_flags_follow_root_ownership() {
    let mut h = Harness::new();
    let a = h.e.create_owner(ROOT_OWNER).unwrap();
    h.assert(a, &["k", "1"]);
    h.assert(ROOT_OWNER, &["k", "1"]);
    h.assert(ROOT_OWNER, &["k", "2"]);
    h.replace(&["k", "3"]);
    h.drop(&["k", "3"]);
    let events = decode(&h.e.drain());
    let flags: Vec<u32> = events
        .iter()
        .map(|e| match e {
            Event::Fact { flags, .. } => *flags,
            _ => unreachable!(),
        })
        .collect();
    assert_eq!(
        flags,
        vec![
            FACT_ADDED,
            FACT_ADDED | FACT_DURABLE | FACT_EXISTING,
            FACT_ADDED | FACT_DURABLE,
            FACT_DURABLE,
            FACT_DURABLE,
            FACT_ADDED | FACT_DURABLE | FACT_REPLACE,
            FACT_DURABLE,
        ]
    );
    h.e.set_fact_events(FACT_EVENTS_DURABLE);
    let b = h.e.create_owner(ROOT_OWNER).unwrap();
    h.assert(b, &["k", "4"]);
    h.revoke(b);
    assert!(h.e.drain().is_empty());
}

#[test]
fn scopes_are_explicit_inherited_or_by_entity() {
    let mut h = Harness::new();
    h.assert_scoped(ROOT_OWNER, "project:p1", &["issue", "i1", "title", "a"]);
    h.assert(ROOT_OWNER, &["issue", "i1", "status", "open"]);
    h.assert(ROOT_OWNER, &["issue", "i2", "status", "open"]);
    let p1 = h.lit("project:p1");
    let i1s = h.terms(&["issue", "i1", "status", "open"]);
    let i2s = h.terms(&["issue", "i2", "status", "open"]);
    assert_eq!(h.e.scope_of(&i1s), Some(p1));
    assert_eq!(h.e.scope_of(&i2s), Some(EMPTY));
    h.replace(&["issue", "i1", "title", "b"]);
    let i1t = h.terms(&["issue", "i1", "title", "b"]);
    assert_eq!(h.e.scope_of(&i1t), Some(p1));
    h.drop(&["issue", "i1", "_", "_"]);
    h.assert(ROOT_OWNER, &["issue", "i1", "title", "c"]);
    let i1c = h.terms(&["issue", "i1", "title", "c"]);
    assert_eq!(
        h.e.scope_of(&i1c),
        Some(EMPTY),
        "entity scope is forgotten with its last fact"
    );
    let scope = h.lit("project:p2");
    let mut ops = vec![OP_SET_SCOPE, scope, i1c.len() as u32];
    ops.extend(i1c.iter());
    h.e.apply(&ops).unwrap();
    assert_eq!(h.e.scope_of(&i1c), Some(scope));
    h.assert(ROOT_OWNER, &["issue", "i1", "status", "open"]);
    assert_eq!(h.e.scope_of(&i1s), Some(scope));
    let events = decode(&h.e.drain());
    assert!(events
        .iter()
        .any(|e| matches!(e, Event::Fact { scope: s, .. } if *s == scope)));
}

#[test]
fn facts_view_filters_by_scope_and_pattern() {
    let mut h = Harness::new();
    h.assert_scoped(ROOT_OWNER, "s1", &["a", "1", "x"]);
    h.assert_scoped(ROOT_OWNER, "s2", &["a", "2", "x"]);
    h.assert(ROOT_OWNER, &["b", "1"]);
    let s1 = h.lit("s1");
    let a = h.lit("a");
    let all = h.e.facts(NONE, &[]);
    assert_eq!(all[0], 3);
    let scoped = h.e.facts(s1, &[]);
    assert_eq!(scoped[0], 1);
    let patterned = h.e.facts(NONE, &[a, WILD, WILD]);
    assert_eq!(patterned[0], 2);
    let both = h.e.facts(s1, &[a, WILD, WILD]);
    assert_eq!(both[0], 1);
}

#[test]
fn clear_resets_everything_and_reports() {
    let mut h = Harness::new();
    let q = h.register(&[&["a", "$x"]]);
    h.assert(ROOT_OWNER, &["a", "1"]);
    let o = h.e.create_owner(ROOT_OWNER).unwrap();
    h.assert(o, &["a", "2"]);
    h.e.drain();
    h.e.apply(&[OP_CLEAR]).unwrap();
    assert_eq!(h.e.fact_count(), 0);
    assert!(h.rows(q).is_empty());
    let events = decode(&h.e.drain());
    let removed_rows: usize = events
        .iter()
        .map(|e| match e {
            Event::Query { removed, .. } => removed.len(),
            _ => 0,
        })
        .sum();
    assert_eq!(removed_rows, 2);
    assert!(!h.e.owner_exists(o));
    h.assert(ROOT_OWNER, &["a", "3"]);
    assert_eq!(h.rows(q).len(), 1);
}

#[test]
fn malformed_ops_are_rejected() {
    let mut e = Engine::new();
    assert!(e.apply(&[OP_ASSERT, 0]).is_err());
    assert!(e.apply(&[99]).is_err());
    assert!(e.apply(&[OP_ASSERT, 0, NONE, 0]).is_err());
    assert!(e.apply(&[]).is_ok());
}

#[test]
fn release_refcounts_shared_queries() {
    let mut h = Harness::new();
    let a = h.register(&[&["a", "$x"]]);
    let b = h.register(&[&["a", "$x"]]);
    assert_eq!(a, b);
    assert_eq!(h.e.query_count(), 1);
    assert!(!h.e.release(a));
    assert!(h.e.release(a));
    assert_eq!(h.e.query_count(), 0);
    h.assert(ROOT_OWNER, &["a", "1"]);
    assert!(decode(&h.e.drain())
        .iter()
        .all(|e| matches!(e, Event::Fact { .. })));
}

/// A deterministic xorshift so the randomised check needs no dependency.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

/// Mirror what the JS side would hold: rows per query, driven only by drained deltas.
fn apply_events(mirror: &mut BTreeMap<QueryId, BTreeMap<u32, Vec<TermId>>>, events: &[u32]) {
    for event in decode(events) {
        if let Event::Query {
            qid,
            added,
            removed,
        } = event
        {
            let rows = mirror.entry(qid).or_default();
            for rid in removed {
                assert!(
                    rows.remove(&rid).is_some(),
                    "removed unknown row {rid} from {qid}"
                );
            }
            for (rid, row) in added {
                assert!(
                    rows.insert(rid, row).is_none(),
                    "added duplicate row {rid} to {qid}"
                );
            }
        }
    }
}

#[test]
fn incremental_matches_from_scratch_under_random_ops() {
    let mut h = Harness::new();
    let entities = ["e1", "e2", "e3", "e4"];
    let attrs = ["kind", "parent", "label"];
    let values = ["e1", "e2", "e3", "e4", "a", "b"];
    let specs: Vec<Vec<Vec<&str>>> = vec![
        vec![vec!["$e", "kind", "$k"]],
        vec![vec!["$e", "parent", "$p"], vec!["$p", "kind", "$k"]],
        vec![
            vec!["$e", "parent", "$p"],
            vec!["$p", "parent", "$g"],
            vec!["$g", "label", "$l"],
        ],
        vec![vec!["$e", "kind", "a"], vec!["$e", "label", "$l"]],
        vec![vec!["$a", "parent", "$b"], vec!["$b", "parent", "$a"]],
        vec![vec!["$e", "_", "$v"], vec!["$v", "kind", "$k"]],
    ];
    let spec_refs: Vec<Vec<&[&str]>> = specs
        .iter()
        .map(|q| q.iter().map(|c| c.as_slice()).collect())
        .collect();
    let qids: Vec<QueryId> = spec_refs.iter().map(|q| h.register(q)).collect();
    let mut mirror: BTreeMap<QueryId, BTreeMap<u32, Vec<TermId>>> = BTreeMap::new();
    for &q in &qids {
        let packed = h.e.rows(q);
        let nvars = packed[0] as usize;
        let mut i = 2;
        let rows = mirror.entry(q).or_default();
        for _ in 0..packed[1] {
            rows.insert(packed[i], packed[i + 1..i + 1 + nvars].to_vec());
            i += 3 + nvars;
        }
    }
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut owners = vec![ROOT_OWNER];
    for step in 0..600 {
        let e = entities[rng.below(entities.len())];
        let a = attrs[rng.below(attrs.len())];
        let v = values[rng.below(values.len())];
        match rng.below(10) {
            0..=3 => {
                let owner = owners[rng.below(owners.len())];
                h.assert(owner, &[e, a, v]);
            }
            4 => h.replace(&[e, a, v]),
            5 => h.drop(&[e, a, v]),
            6 => h.drop(&[e, a, "_"]),
            7 => {
                let parent = owners[rng.below(owners.len())];
                if let Some(o) = h.e.create_owner(parent) {
                    owners.push(o);
                }
            }
            8 if owners.len() > 1 => {
                let idx = 1 + rng.below(owners.len() - 1);
                let o = owners.remove(idx);
                h.revoke(o);
                owners.retain(|&x| h.e.owner_exists(x));
            }
            _ => {
                let owner = owners[rng.below(owners.len())];
                let mut ops = Vec::new();
                for _ in 0..3 {
                    let t = h.terms(&[
                        entities[rng.below(4)],
                        attrs[rng.below(3)],
                        values[rng.below(6)],
                    ]);
                    ops.extend([OP_ASSERT, owner, NONE, 3]);
                    ops.extend(t);
                }
                h.e.apply(&ops).unwrap();
            }
        }
        let events = h.e.drain();
        apply_events(&mut mirror, &events);
        for (spec, &q) in spec_refs.iter().zip(&qids) {
            let expected = h.fresh(spec);
            let incremental = h.rows(q);
            assert_eq!(
                incremental, expected,
                "step {step}: query {spec:?} diverged"
            );
            let mirrored: BTreeSet<Vec<TermId>> = mirror[&q].values().cloned().collect();
            assert_eq!(
                mirrored, expected,
                "step {step}: mirror of {spec:?} diverged"
            );
        }
    }
    assert!(h.e.index_count() > 3);
}

#[test]
fn rows_follow_the_first_clauses_assertion_order() {
    let mut h = Harness::new();
    let q = h.register(&[
        &["todo", "$id", "title", "$t"],
        &["todo", "$id", "done", "$d"],
    ]);
    for id in ["b", "a", "c"] {
        h.assert(ROOT_OWNER, &["todo", id, "title", &format!("{id} title")]);
        h.assert(ROOT_OWNER, &["todo", id, "done", "no"]);
    }
    h.e.drain();
    let ids = |rows: Vec<Vec<String>>| rows.into_iter().map(|r| r[0].clone()).collect::<Vec<_>>();
    assert_eq!(ids(h.ordered(q)), strs(&["b", "a", "c"]));

    // Replacing a joined attribute keeps the entity where it was.
    h.replace(&["todo", "a", "done", "yes"]);
    h.e.drain();
    assert_eq!(ids(h.ordered(q)), strs(&["b", "a", "c"]));
    assert_eq!(
        ids(h.fresh_ordered(&[
            &["todo", "$id", "title", "$t"],
            &["todo", "$id", "done", "$d"]
        ])),
        strs(&["b", "a", "c"])
    );

    // Replacing the first clause's attribute is a new fact, so the entity moves to the end.
    h.replace(&["todo", "b", "title", "renamed"]);
    h.e.drain();
    assert_eq!(ids(h.ordered(q)), strs(&["a", "c", "b"]));

    // A single-clause query is plain assertion order, so the latest value of a
    // multi-valued attribute comes last.
    let w = h.register(&[&["session", "s", "workspace", "$w"]]);
    h.assert(ROOT_OWNER, &["session", "s", "workspace", "ws-2"]);
    h.assert(ROOT_OWNER, &["session", "s", "workspace", "ws-1"]);
    h.e.drain();
    assert_eq!(h.ordered(w), vec![strs(&["ws-2"]), strs(&["ws-1"])]);
    assert_eq!(
        h.fresh_ordered(&[&["session", "s", "workspace", "$w"]]),
        vec![strs(&["ws-2"]), strs(&["ws-1"])]
    );
}

#[test]
fn wildcards_in_the_first_clause_order_by_the_earliest_match() {
    let mut h = Harness::new();
    h.assert(ROOT_OWNER, &["e2", "label", "x"]);
    h.assert(ROOT_OWNER, &["e1", "label", "y"]);
    h.assert(ROOT_OWNER, &["e1", "kind", "k"]);
    h.assert(ROOT_OWNER, &["e2", "kind", "k"]);
    let q = h.register(&[&["$e", "_", "_"], &["$e", "kind", "$k"]]);
    let ids = |rows: Vec<Vec<String>>| rows.into_iter().map(|r| r[0].clone()).collect::<Vec<_>>();
    assert_eq!(ids(h.ordered(q)), strs(&["e2", "e1"]));
    h.drop(&["e2", "label", "x"]);
    h.e.drain();
    assert_eq!(ids(h.ordered(q)), strs(&["e1", "e2"]));
    assert_eq!(
        ids(h.fresh_ordered(&[&["$e", "_", "_"], &["$e", "kind", "$k"]])),
        strs(&["e1", "e2"])
    );
}
