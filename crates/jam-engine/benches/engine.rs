//! The main engine use cases over a linearlite-shaped world at 10k, 100k and 1M facts.
//! `cargo bench -p jam-engine`; CI runs `-- --sample-size 10 --measurement-time 1 --warm-up-time 1`.

use std::hint::black_box;
use std::time::{Duration, Instant};

use criterion::{BatchSize, BenchmarkId, Criterion, SamplingMode, Throughput, criterion_group, criterion_main};
use jam_engine::wire::*;
use jam_engine::{Clause, Engine, Interner, NONE, QueryId, ROOT_OWNER, TermId, VAR_BASE, WILD};

const SIZES: &[usize] = &[10_000, 100_000, 1_000_000];
const PROJECTS: usize = 16;
const FACTS_PER_ISSUE: usize = 5;

fn var(i: u32) -> u32 {
    VAR_BASE + i
}

struct Vocab {
    issue: TermId,
    project: TermId,
    title: TermId,
    status: TermId,
    priority: TermId,
    created: TermId,
    name: TermId,
    open: TermId,
    closed: TermId,
    renamed: TermId,
    projects: Vec<TermId>,
    scopes: Vec<TermId>,
}

impl Vocab {
    fn new(interner: &mut Interner) -> Vocab {
        Vocab {
            issue: interner.intern_str("issue"),
            project: interner.intern_str("project"),
            title: interner.intern_str("title"),
            status: interner.intern_str("status"),
            priority: interner.intern_str("priority"),
            created: interner.intern_str("created"),
            name: interner.intern_str("name"),
            open: interner.intern_str("open"),
            closed: interner.intern_str("closed"),
            renamed: interner.intern_str("renamed"),
            projects: (0..PROJECTS).map(|i| interner.intern_str(&format!("p{i}"))).collect(),
            scopes: (0..PROJECTS).map(|i| interner.intern_str(&format!("project:p{i}"))).collect(),
        }
    }
}

/// Issues spread over `PROJECTS` projects, each carrying project, title, status, priority and created facts.
/// The first fact of an issue is asserted with its project scope; the rest inherit it.
struct World {
    engine: Engine,
    v: Vocab,
    ids: Vec<TermId>,
    titles: Vec<TermId>,
    load_ops: Vec<u32>,
}

impl World {
    fn new(facts: usize) -> World {
        let mut engine = Engine::new();
        let v = Vocab::new(&mut engine.interner);
        let issues = facts / FACTS_PER_ISSUE;
        let ids: Vec<TermId> = (0..issues).map(|i| engine.interner.intern_str(&format!("i{i}"))).collect();
        let titles: Vec<TermId> = (0..issues).map(|i| engine.interner.intern_str(&format!("Issue {i}"))).collect();
        let mut load_ops = Vec::with_capacity(facts * 8);
        for (i, &p) in v.projects.iter().enumerate() {
            let n = engine.interner.intern_str(&format!("Project {i}"));
            load_ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.project, p, v.name, n]);
        }
        for (i, &id) in ids.iter().enumerate() {
            let p = i % PROJECTS;
            let status = if i.is_multiple_of(2) { v.open } else { v.closed };
            let priority = engine.interner.intern_num((i % 5) as f64);
            let created = engine.interner.intern_num(i as f64);
            load_ops.extend([OP_ASSERT, ROOT_OWNER, v.scopes[p], 4, v.issue, id, v.project, v.projects[p]]);
            load_ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, id, v.title, titles[i]]);
            load_ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, id, v.status, status]);
            load_ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, id, v.priority, priority]);
            load_ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, id, v.created, created]);
        }
        World { engine, v, ids, titles, load_ops }
    }

    fn loaded(facts: usize) -> World {
        let mut world = World::new(facts);
        world.load();
        world
    }

    fn load(&mut self) {
        self.engine.apply(&self.load_ops).unwrap();
        self.engine.drain();
    }

    fn reset(&mut self) {
        self.engine.clear();
        self.engine.drain();
    }

    fn issues(&self) -> usize {
        self.ids.len()
    }

    /// `[issue $id project $p] [issue $id title $t] [project $p name $n]`
    fn join3(&self) -> Vec<Clause> {
        let v = &self.v;
        vec![
            vec![v.issue, var(0), v.project, var(1)],
            vec![v.issue, var(0), v.title, var(2)],
            vec![v.project, var(1), v.name, var(3)],
        ]
    }

    /// `join3` restricted to open issues.
    fn join4(&self) -> Vec<Clause> {
        let mut clauses = self.join3();
        clauses.push(vec![self.v.issue, var(0), self.v.status, self.v.open]);
        clauses
    }

    /// What a linearlite client keeps registered: the list join, every title and one status list per project.
    fn register_standard_queries(&mut self) -> Vec<QueryId> {
        let join4 = self.join4();
        let v = &self.v;
        let mut queries = vec![
            self.engine.register(join4),
            self.engine.register(vec![vec![v.issue, var(0), v.title, var(1)]]),
        ];
        for &p in &v.projects {
            let clauses = vec![vec![v.issue, var(0), v.project, p], vec![v.issue, var(0), v.status, var(1)]];
            queries.push(self.engine.register(clauses));
        }
        self.engine.drain();
        queries
    }

    fn apply(&mut self, ops: &[u32]) -> Vec<u32> {
        self.engine.apply(ops).unwrap();
        self.engine.drain()
    }
}

/// Runs `setup` untimed and `routine` timed, `iters` times over the same state.
fn timed<S>(iters: u64, state: &mut S, mut setup: impl FnMut(&mut S), mut routine: impl FnMut(&mut S)) -> Duration {
    let mut total = Duration::ZERO;
    for _ in 0..iters {
        setup(state);
        let start = Instant::now();
        routine(state);
        total += start.elapsed();
    }
    total
}

fn load(c: &mut Criterion) {
    let mut group = c.benchmark_group("load");
    group.sampling_mode(SamplingMode::Flat);
    for &facts in SIZES {
        group.throughput(Throughput::Elements(facts as u64));
        let mut world = World::new(facts);
        group.bench_function(BenchmarkId::new("no-queries", facts), |b| {
            b.iter_custom(|iters| timed(iters, &mut world, World::reset, World::load));
        });
        world.register_standard_queries();
        group.bench_function(BenchmarkId::new("with-queries", facts), |b| {
            b.iter_custom(|iters| timed(iters, &mut world, World::reset, World::load));
        });
        group.bench_function(BenchmarkId::new("clear", facts), |b| {
            b.iter_custom(|iters| timed(iters, &mut world, World::load, World::reset));
        });
    }
    group.finish();
}

fn lookup(c: &mut Criterion) {
    let mut group = c.benchmark_group("lookup");
    for &facts in SIZES {
        let mut world = World::loaded(facts);
        let n = world.issues();
        let World { engine, v, ids, titles, .. } = &mut world;
        let mut i = 0;
        group.bench_function(BenchmarkId::new("has_fact/hit", facts), |b| {
            b.iter(|| {
                i = (i + 1) % n;
                black_box(engine.has_fact(&[v.issue, ids[i], v.title, titles[i]]))
            });
        });
        group.bench_function(BenchmarkId::new("has_fact/miss", facts), |b| {
            b.iter(|| {
                i = (i + 1) % n;
                black_box(engine.has_fact(&[v.issue, ids[i], v.title, titles[(i + 1) % n]]))
            });
        });
        group.bench_function(BenchmarkId::new("scope_of", facts), |b| {
            b.iter(|| {
                i = (i + 1) % n;
                black_box(engine.scope_of(&[v.issue, ids[i], v.project, v.projects[i % PROJECTS]]))
            });
        });
        let existing: Vec<String> = (0..1000).map(|i| format!("Issue {i}")).collect();
        group.bench_function(BenchmarkId::new("intern/existing", facts), |b| {
            b.iter(|| {
                i = (i + 1) % existing.len();
                black_box(engine.interner.intern_str(&existing[i]))
            });
        });
        let mut fresh = 0u64;
        group.bench_function(BenchmarkId::new("intern/new", facts), |b| {
            b.iter_batched(
                || {
                    fresh += 1;
                    format!("fresh {fresh}")
                },
                |s: String| engine.interner.intern_str(&s),
                BatchSize::SmallInput,
            );
        });
    }
    group.finish();
}

fn scan(c: &mut Criterion) {
    let mut group = c.benchmark_group("facts");
    group.sampling_mode(SamplingMode::Flat);
    for &facts in SIZES {
        let mut world = World::loaded(facts);
        let n = world.issues();
        let World { engine, v, ids, .. } = &mut world;
        let mut i = 0;
        group.throughput(Throughput::Elements(FACTS_PER_ISSUE as u64));
        group.bench_function(BenchmarkId::new("entity", facts), |b| {
            b.iter(|| {
                i = (i + 1) % n;
                black_box(engine.facts(NONE, &[v.issue, ids[i], WILD, WILD]))
            });
        });
        group.throughput(Throughput::Elements((n / 2) as u64));
        group.bench_function(BenchmarkId::new("attribute", facts), |b| {
            b.iter(|| black_box(engine.facts(NONE, &[v.issue, WILD, v.status, v.open])));
        });
        group.throughput(Throughput::Elements(facts as u64));
        group.bench_function(BenchmarkId::new("scope", facts), |b| {
            b.iter(|| black_box(engine.facts(v.scopes[0], &[])));
        });
        group.bench_function(BenchmarkId::new("all", facts), |b| {
            b.iter(|| black_box(engine.facts(NONE, &[])));
        });
    }
    group.finish();
}

fn query(c: &mut Criterion) {
    let mut group = c.benchmark_group("query");
    group.sampling_mode(SamplingMode::Flat);
    for &facts in SIZES {
        let mut world = World::loaded(facts);
        let n = world.issues();
        let (join3, join4) = (world.join3(), world.join4());
        let World { engine, v, ids, .. } = &mut world;
        let mut i = 0;
        group.throughput(Throughput::Elements(1));
        group.bench_function(BenchmarkId::new("entity", facts), |b| {
            b.iter(|| {
                i = (i + 1) % n;
                black_box(engine.query(vec![vec![v.issue, ids[i], v.title, var(0)]]))
            });
        });
        group.throughput(Throughput::Elements((n / PROJECTS / 2) as u64));
        group.bench_function(BenchmarkId::new("project-open", facts), |b| {
            b.iter(|| {
                let clauses =
                    vec![vec![v.issue, var(0), v.project, v.projects[0]], vec![v.issue, var(0), v.status, v.open]];
                black_box(engine.query(clauses))
            });
        });
        group.throughput(Throughput::Elements(n as u64));
        group.bench_function(BenchmarkId::new("join-3", facts), |b| {
            b.iter(|| black_box(engine.query(join3.clone())));
        });
        group.throughput(Throughput::Elements((n / 2) as u64));
        group.bench_function(BenchmarkId::new("join-4", facts), |b| {
            b.iter(|| black_box(engine.query(join4.clone())));
        });
    }
    group.finish();
}

fn register(c: &mut Criterion) {
    let mut group = c.benchmark_group("register");
    group.sampling_mode(SamplingMode::Flat);
    for &facts in SIZES {
        let mut world = World::loaded(facts);
        let n = world.issues();
        let join4 = world.join4();
        let titles = vec![vec![world.v.issue, var(0), world.v.title, var(1)]];
        group.throughput(Throughput::Elements(n as u64));
        group.bench_function(BenchmarkId::new("titles", facts), |b| {
            b.iter(|| {
                let q = world.engine.register(titles.clone());
                black_box(world.engine.drain());
                world.engine.release(q)
            });
        });
        group.throughput(Throughput::Elements((n / 2) as u64));
        group.bench_function(BenchmarkId::new("join-4", facts), |b| {
            b.iter(|| {
                let q = world.engine.register(join4.clone());
                black_box(world.engine.drain());
                world.engine.release(q)
            });
        });
        let q = world.engine.register(join4.clone());
        world.engine.drain();
        group.bench_function(BenchmarkId::new("rows/join-4", facts), |b| {
            b.iter(|| black_box(world.engine.rows(q)));
        });
    }
    group.finish();
}

fn churn(c: &mut Criterion) {
    let mut group = c.benchmark_group("churn");
    for &facts in SIZES {
        let mut world = World::loaded(facts);
        world.register_standard_queries();
        let n = world.issues();
        let mut i = 0;
        group.throughput(Throughput::Elements(1));
        group.bench_function(BenchmarkId::new("assert-existing", facts), |b| {
            b.iter(|| {
                i = (i + 1) % n;
                let v = &world.v;
                let ops = [OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, world.ids[i], v.title, world.titles[i]];
                black_box(world.apply(&ops))
            });
        });
        group.bench_function(BenchmarkId::new("replace-title", facts), |b| {
            b.iter(|| {
                i = (i + 1) % n;
                let v = &world.v;
                let title = if i.is_multiple_of(2) { v.renamed } else { world.titles[i] };
                let ops = [OP_REPLACE, ROOT_OWNER, NONE, 4, v.issue, world.ids[i], v.title, title];
                black_box(world.apply(&ops))
            });
        });
        group.bench_function(BenchmarkId::new("replace-status", facts), |b| {
            b.iter(|| {
                i = (i + 1) % n;
                let v = &world.v;
                let status = if i.is_multiple_of(2) { v.closed } else { v.open };
                let ops = [OP_REPLACE, ROOT_OWNER, NONE, 4, v.issue, world.ids[i], v.status, status];
                black_box(world.apply(&ops))
            });
        });
        let fresh = world.engine.interner.intern_str("fresh-issue");
        let fresh_title = world.engine.interner.intern_str("A fresh issue");
        group.throughput(Throughput::Elements(FACTS_PER_ISSUE as u64 * 2));
        group.bench_function(BenchmarkId::new("create+delete-issue", facts), |b| {
            b.iter(|| {
                let v = &world.v;
                let two = world.engine.interner.intern_num(2.0);
                let mut ops = vec![OP_ASSERT, ROOT_OWNER, v.scopes[3], 4, v.issue, fresh, v.project, v.projects[3]];
                ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, fresh, v.title, fresh_title]);
                ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, fresh, v.status, v.open]);
                ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, fresh, v.priority, two]);
                ops.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, v.issue, fresh, v.created, two]);
                let drop = [OP_DROP, 4, v.issue, fresh, WILD, WILD];
                let created = world.apply(&ops);
                let deleted = world.apply(&drop);
                black_box((created, deleted))
            });
        });
        group.throughput(Throughput::Elements(1000));
        group.bench_function(BenchmarkId::new("batch-1000-titles", facts), |b| {
            b.iter(|| {
                i = (i + 1000) % n;
                let v = &world.v;
                let mut ops = Vec::with_capacity(8000);
                for k in 0..1000 {
                    let j = (i + k) % n;
                    let title = if j.is_multiple_of(2) { v.renamed } else { world.titles[j] };
                    ops.extend([OP_REPLACE, ROOT_OWNER, NONE, 4, v.issue, world.ids[j], v.title, title]);
                }
                black_box(world.apply(&ops))
            });
        });
        let three = world.engine.interner.intern_num(3.0);
        let mut reassert = Vec::with_capacity(n / 5 * 8);
        for &id in world.ids.iter().skip(3).step_by(5) {
            reassert.extend([OP_ASSERT, ROOT_OWNER, NONE, 4, world.v.issue, id, world.v.priority, three]);
        }
        group.throughput(Throughput::Elements((n / 5 * 2) as u64));
        group.bench_function(BenchmarkId::new("drop-wildcard+reassert", facts), |b| {
            b.iter(|| {
                let drop = [OP_DROP, 4, world.v.issue, WILD, world.v.priority, three];
                let dropped = world.apply(&drop);
                let restored = world.apply(&reassert);
                black_box((dropped, restored))
            });
        });
    }
    group.finish();
}

fn revoke(c: &mut Criterion) {
    let mut group = c.benchmark_group("revoke");
    let mut world = World::loaded(100_000);
    world.register_standard_queries();
    let dom = world.engine.interner.intern_str("dom");
    let tag = world.engine.interner.intern_str("tag");
    let div = world.engine.interner.intern_str("div");
    let nodes: Vec<TermId> = (0..1000).map(|i| world.engine.interner.intern_str(&format!("n{i}"))).collect();
    world.engine.register(vec![vec![dom, var(0), tag, var(1)]]);
    world.engine.drain();

    let mut owner = world.engine.create_owner(ROOT_OWNER).unwrap();
    group.throughput(Throughput::Elements(2000));
    group.bench_function("reclaim-1000", |b| {
        b.iter(|| {
            let mut ops = vec![OP_REVOKE, owner];
            owner = world.engine.create_owner(ROOT_OWNER).unwrap();
            for &node in &nodes {
                ops.extend([OP_ASSERT, owner, NONE, 4, dom, node, tag, div]);
            }
            black_box(world.apply(&ops))
        });
    });

    let mut parent = world.engine.create_owner(ROOT_OWNER).unwrap();
    group.bench_function("tree-100x10", |b| {
        b.iter(|| {
            let mut ops = vec![OP_REVOKE, parent];
            parent = world.engine.create_owner(ROOT_OWNER).unwrap();
            for chunk in nodes.chunks(10) {
                let child = world.engine.create_owner(parent).unwrap();
                for &node in chunk {
                    ops.extend([OP_ASSERT, child, NONE, 4, dom, node, tag, div]);
                }
            }
            black_box(world.apply(&ops))
        });
    });
    group.finish();
}

criterion_group!(benches, load, lookup, scan, query, register, churn, revoke);
criterion_main!(benches);
