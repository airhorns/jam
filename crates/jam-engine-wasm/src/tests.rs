//! The wrapper is plain Rust apart from `JsError`, so everything but the error
//! conversion runs natively; `packages/engine` covers the boundary itself.

use jam_engine::wire::*;
use jam_engine::{NONE, ROOT_OWNER, VAR_BASE, WILD};
use pretty_assertions::assert_eq;

use super::{JamEngine, unpack_clauses};

fn v(i: u32) -> u32 {
    VAR_BASE + i
}

#[test]
fn unpacks_clause_lists() {
    assert_eq!(unpack_clauses(&[0]), Ok(vec![]));
    assert_eq!(unpack_clauses(&[2, 2, 7, 8, 1, 9]), Ok(vec![vec![7, 8], vec![9]]));
    assert_eq!(unpack_clauses(&[]), Err("empty clause list".to_string()));
    assert_eq!(unpack_clauses(&[2, 1, 7]), Err("truncated clause list".to_string()));
    assert_eq!(unpack_clauses(&[1, 3, 7, 8]), Err("truncated clause".to_string()));
}

#[test]
fn terms_round_trip_through_the_interner() {
    let mut e = JamEngine::default();
    let base = e.term_count();
    let s = e.intern_str("todo");
    let n = e.intern_num(2.5);
    assert_eq!(e.intern_str("todo"), s);
    assert_eq!(e.term_count(), base + 2);
    assert_eq!((e.term_kind(s), e.term_kind(n)), (0, 1));
    assert_eq!(e.term_kind(1), 2, "the true term is preinterned");
    assert_eq!(e.term_kind(u32::MAX - 5), 3);
    assert_eq!(e.term_str(s), Some("todo".to_string()));
    assert_eq!(e.term_str(n), None);
    assert_eq!(e.term_num(n), 2.5);
    assert_eq!(e.term_num(1), 1.0);
    assert_eq!(e.term_num(0), 0.0);
    assert!(e.term_num(s).is_nan());
}

#[test]
fn transactions_queries_and_views_pass_through() {
    let mut e = JamEngine::new();
    e.set_fact_events(FACT_EVENTS_ALL);
    let (todo, title, milk, eggs) =
        (e.intern_str("todo"), e.intern_str("title"), e.intern_str("milk"), e.intern_str("eggs"));
    let (one, two) = (e.intern_num(1.0), e.intern_num(2.0));
    let owner = e.create_owner(ROOT_OWNER);
    assert!(e.owner_exists(owner));
    assert_eq!(e.create_owner(9999), NONE, "unknown parents yield NONE");

    let q = e.register(&[1, 4, todo, v(0), title, v(1)]).unwrap();
    e.apply(&[OP_ASSERT, ROOT_OWNER, NONE, 4, todo, one, title, milk]).unwrap();
    e.apply(&[OP_ASSERT, owner, NONE, 4, todo, two, title, eggs]).unwrap();
    let events = e.drain();
    assert_eq!(events[0], EV_FACT);
    assert!(events.contains(&EV_QUERY));

    assert_eq!(e.rows(q)[..2], [2, 2]);
    assert_eq!(e.query(&[1, 4, todo, v(0), title, v(1)]).unwrap()[..2], [2, 2]);
    assert_eq!(e.facts(NONE, &[])[0], 2);
    assert_eq!(e.facts(NONE, &[todo, one, WILD, WILD])[0], 1);
    assert!(e.has_fact(&[todo, one, title, milk]));
    assert!(!e.has_fact(&[todo, one, title, eggs]));
    assert_eq!(e.scope_of(&[todo, one, title, milk]), 2, "the default scope is the empty string");
    assert_eq!(e.scope_of(&[todo, one, title, eggs]), NONE);
    assert_eq!((e.fact_count(), e.query_count()), (2, 1));
    assert!(e.index_count() > 0);

    e.apply(&[OP_REVOKE, owner]).unwrap();
    assert!(!e.owner_exists(owner));
    assert_eq!(e.fact_count(), 1);
    assert!(e.release(q));
    assert_eq!(e.query_count(), 0);
}
