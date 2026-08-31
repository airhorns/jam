//! `cargo run --release -p jam-engine --example bench`
//! Rough per-operation costs with a linearlite-shaped dataset.

use std::time::Instant;

use jam_engine::wire::*;
use jam_engine::{Engine, ROOT_OWNER, NONE, VAR_BASE};

fn main() {
    let issues = 10_000;
    let mut e = Engine::new();
    e.set_fact_events(FACT_EVENTS_DURABLE);
    let issue = e.interner.intern_str("issue");
    let project = e.interner.intern_str("project");
    let title = e.interner.intern_str("title");
    let status = e.interner.intern_str("status");
    let name = e.interner.intern_str("name");
    let open = e.interner.intern_str("open");
    let projects: Vec<u32> = (0..4).map(|i| e.interner.intern_str(&format!("p{i}"))).collect();
    let ids: Vec<u32> = (0..issues).map(|i| e.interner.intern_str(&format!("i{i}"))).collect();
    let titles: Vec<u32> = (0..issues).map(|i| e.interner.intern_str(&format!("Issue {i}"))).collect();

    let v = |i: u32| VAR_BASE + i;
    // [issue $id project $p] [issue $id title $t] [issue $id status open] [project $p name $n]
    let q = e.register(vec![
        vec![issue, v(0), project, v(1)],
        vec![issue, v(0), title, v(2)],
        vec![issue, v(0), status, open],
        vec![project, v(1), name, v(3)],
    ]);
    let q_titles = e.register(vec![vec![issue, v(0), title, v(1)]]);
    let q_by_project: Vec<u32> =
        projects.iter().map(|&p| e.register(vec![vec![issue, v(0), project, p], vec![issue, v(0), status, v(1)]])).collect();

    let mut ops = Vec::new();
    for (i, &p) in projects.iter().enumerate() {
        let n = e.interner.intern_str(&format!("Project {i}"));
        ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, project, p, name, n]);
    }
    for i in 0..issues {
        let p = projects[i % projects.len()];
        ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, issue, ids[i], project, p]);
        ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, issue, ids[i], title, titles[i]]);
        ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, issue, ids[i], status, open]);
    }
    let t = Instant::now();
    e.apply(&ops).unwrap();
    let events = e.drain();
    println!(
        "load {} facts: {:?} ({} event words, {} rows in join)",
        issues * 3 + 4,
        t.elapsed(),
        events.len(),
        e.rows(q)[1]
    );

    let iterations = 10_000;
    let new_title = e.interner.intern_str("renamed");
    let t = Instant::now();
    for i in 0..iterations {
        let id = ids[i % issues];
        e.apply(&[OP_REPLACE, ROOT_OWNER, NONE, 4, issue, id, title, if i % 2 == 0 { new_title } else { titles[i % issues] }])
            .unwrap();
        let ev = e.drain();
        debug_assert!(ev.len() > 0);
    }
    let per = t.elapsed() / iterations as u32;
    println!("replace title (2 queries affected): {per:?} per op");

    let closed = e.interner.intern_str("closed");
    let t = Instant::now();
    for i in 0..iterations {
        let id = ids[i % issues];
        e.apply(&[OP_REPLACE, ROOT_OWNER, NONE, 4, issue, id, status, if i % 2 == 0 { closed } else { open }]).unwrap();
        e.drain();
    }
    println!("replace status (3 queries affected): {:?} per op", t.elapsed() / iterations as u32);

    let t = Instant::now();
    for _ in 0..100 {
        let rows = e.query(vec![
            vec![issue, v(0), project, v(1)],
            vec![issue, v(0), title, v(2)],
            vec![project, v(1), name, v(3)],
        ]);
        assert_eq!(rows[1] as usize, issues);
    }
    println!("adhoc 3-way join over {issues} issues: {:?}", t.elapsed() / 100);

    let t = Instant::now();
    let owner = e.create_owner(ROOT_OWNER).unwrap();
    let dom = e.interner.intern_str("dom");
    let tag = e.interner.intern_str("tag");
    let div = e.interner.intern_str("div");
    let q_dom = e.register(vec![vec![dom, v(0), tag, v(1)]]);
    let nodes: Vec<u32> = (0..1000).map(|i| e.interner.intern_str(&format!("n{i}"))).collect();
    for round in 0..100u32 {
        let mut ops = vec![OP_REVOKE, owner];
        let owner = e.create_owner(ROOT_OWNER).unwrap();
        for &n in &nodes {
            ops.extend([OP_ASSERT, owner, NONE, 4, dom, n, tag, div]);
        }
        let _ = round;
        e.apply(&ops).unwrap();
        e.drain();
    }
    println!("revoke+reclaim 1000 dom facts: {:?} per round", t.elapsed() / 100);
    let _ = (q_titles, q_by_project, q_dom);
    println!("indexes: {}, queries: {}, facts: {}", e.index_count(), e.query_count(), e.fact_count());
}
