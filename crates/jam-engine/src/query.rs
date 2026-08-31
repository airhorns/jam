//! Conjunctive pattern queries, maintained incrementally.
//!
//! A query joins positive patterns on their shared variables; negated patterns
//! and predicates then decide which joined rows are visible, and an optional
//! aggregate or ordered window (see `stage`) shapes what is reported. Results
//! are Z-sets (rows with integer weights): registering a query evaluates it
//! once, and afterwards every fact added or removed only produces the rows it
//! contributes to. For a fact `f` matching pattern `i`, those are the joins
//! where patterns before `i` are satisfied by facts other than `f` and
//! patterns after `i` by any fact including `f` — the standard decomposition
//! of a multi-way join delta, so a fact matching several patterns is never
//! counted twice. A fact matching a negated pattern instead adjusts the
//! `blocked` count of every existing row it hides.

use std::hash::BuildHasher;

use hashbrown::{DefaultHashBuilder, HashMap, HashTable};
use smallvec::SmallVec;

use crate::filter::Compiled;
use crate::spec::{Operand, Spec, is_var, var_of};
use crate::stage::Stages;
use crate::store::{FactId, Mask, Store, scan_mask};
use crate::term::{Interner, NONE, TermId, WILD};

pub type QueryId = u32;
pub type RowId = u32;
pub type VarId = u32;

/// One position of a clause: a literal term id, `VAR_BASE + var`, or `WILD`.
pub type Clause = Vec<u32>;

/// A result row: one term per variable, inline for the common arities.
pub type Row = SmallVec<[TermId; 4]>;

#[derive(Clone, Copy)]
enum KeySource {
    Lit(TermId),
    Var(VarId),
}

struct Step {
    clause: usize,
    mask: Mask,
    key: SmallVec<[KeySource; 4]>,
    /// Every position is known before this step, so the lookup is a key probe.
    exact: bool,
    /// Skip the fact whose change we are propagating (clauses before the seed).
    exclude_seed: bool,
    /// Filters whose variables are all bound once this step has.
    checks: SmallVec<[u8; 2]>,
}

struct Plan {
    /// Filters the initial bindings already decide.
    checks: SmallVec<[u8; 2]>,
    steps: Vec<Step>,
}

pub struct Query {
    pub spec: Spec,
    /// Variables the patterns bind.
    pub nvars: usize,
    /// Width of the reported rows.
    pub arity: usize,
    /// One plan per pattern acting as the seed of a delta.
    delta_plans: Vec<Plan>,
    /// One plan per negation: every pattern, from the negation's bindings.
    negation_plans: Vec<Plan>,
    /// Plan for evaluating from scratch: `full_seed` scanned by its literals, then the rest.
    full_seed: usize,
    full_plan: Plan,
    filters: Vec<Compiled>,
    scratch: Bindings,
    /// The joined rows with their weights and how many negation matches hide each.
    pub results: ResultSet,
    pub stages: Option<Stages>,
    pub refcount: u32,
}

#[derive(Default)]
pub struct ResultSet {
    /// Row ids hashed by their rows, which live in `slots`.
    ids: HashTable<RowId>,
    hasher: DefaultHashBuilder,
    slots: Vec<Slot>,
    free: Vec<RowId>,
    /// Rows touched since the last drain, each once.
    touched: Vec<RowId>,
}

struct Slot {
    row: Row,
    weight: i32,
    /// Negation matches hiding the row; only meaningful while `weight > 0`.
    blocked: u32,
    /// Visible before this transaction, valid while `touched`.
    before: bool,
    touched: bool,
}

impl Slot {
    #[inline]
    fn visible(&self) -> bool {
        self.weight > 0 && self.blocked == 0
    }
}

impl ResultSet {
    #[inline]
    fn find(&self, row: &[TermId]) -> Option<RowId> {
        let hash = self.hasher.hash_one(row);
        self.ids.find(hash, |&id| self.slots[id as usize].row[..] == *row).copied()
    }

    #[inline]
    fn touch(&mut self, id: RowId) -> &mut Slot {
        let slot = &mut self.slots[id as usize];
        if !slot.touched {
            slot.touched = true;
            slot.before = slot.visible();
            self.touched.push(id);
        }
        slot
    }

    /// Add `delta` to the row's weight; a row gaining its first weight asks `blocked` how many
    /// negation matches hide it.
    #[inline]
    pub fn apply(&mut self, row: &[TermId], delta: i32, blocked: impl FnOnce() -> u32) {
        let hash = self.hasher.hash_one(row);
        let id = match self.ids.find(hash, |&id| self.slots[id as usize].row[..] == *row) {
            Some(&id) => id,
            None => {
                let id = match self.free.pop() {
                    Some(id) => {
                        self.slots[id as usize].row = row.into();
                        id
                    }
                    None => {
                        self.slots
                            .push(Slot { row: row.into(), weight: 0, blocked: 0, before: false, touched: false });
                        (self.slots.len() - 1) as RowId
                    }
                };
                let (slots, hasher) = (&self.slots, &self.hasher);
                self.ids.insert_unique(hash, id, |&id| hasher.hash_one(&slots[id as usize].row[..]));
                id
            }
        };
        let slot = self.touch(id);
        let entering = slot.weight <= 0 && delta > 0;
        slot.weight += delta;
        if entering {
            slot.blocked = blocked();
        }
    }

    /// Adjust how many negation matches hide a weighted row.
    fn block(&mut self, id: RowId, delta: i32) {
        let slot = self.touch(id);
        slot.blocked = slot.blocked.wrapping_add_signed(delta);
    }

    fn weight(&self, id: RowId) -> i32 {
        self.slots[id as usize].weight
    }

    pub fn is_dirty(&self) -> bool {
        !self.touched.is_empty()
    }

    fn release(&mut self, id: RowId) {
        let row = std::mem::take(&mut self.slots[id as usize].row);
        let hash = self.hasher.hash_one(&row[..]);
        if let Ok(entry) = self.ids.find_entry(hash, |&x| x == id) {
            entry.remove();
        }
        self.free.push(id);
    }

    /// Accept the current state as the baseline without reporting it.
    pub fn settle(&mut self) {
        for id in std::mem::take(&mut self.touched) {
            self.slots[id as usize].touched = false;
            if self.slots[id as usize].weight == 0 {
                self.release(id);
            }
        }
    }

    /// Rows whose visibility changed since the last drain, as (id, row, visible now); frees emptied slots.
    pub fn drain(&mut self, mut emit: impl FnMut(RowId, &[TermId], bool)) {
        let mut touched = std::mem::take(&mut self.touched);
        touched.sort_unstable();
        for id in touched {
            let slot = &mut self.slots[id as usize];
            slot.touched = false;
            let visible = slot.visible();
            if slot.before != visible {
                emit(id, &slot.row, visible);
            }
            if slot.weight == 0 {
                self.release(id);
            }
        }
    }

    /// Take every weight to zero, marking the rows for the next drain.
    pub fn clear(&mut self) -> bool {
        let weighted: Vec<RowId> =
            (0..self.slots.len() as RowId).filter(|&id| self.slots[id as usize].weight != 0).collect();
        for &id in &weighted {
            self.touch(id).weight = 0;
        }
        !weighted.is_empty()
    }

    /// The visible rows.
    pub fn rows(&self) -> impl Iterator<Item = (RowId, &[TermId])> {
        self.slots
            .iter()
            .enumerate()
            .filter(|(_, s)| s.visible())
            .map(|(i, s)| (i as RowId, &s.row[..]))
    }

    /// Rows with a slot, visible or not.
    pub fn len(&self) -> usize {
        self.ids.len()
    }

    pub fn is_empty(&self) -> bool {
        self.ids.is_empty()
    }
}

/// A clause a changed fact may match, with the literals to check before binding.
struct Route {
    query: QueryId,
    clause: u8,
    negated: bool,
    /// Literal positions of the clause, verified against the fact before the walk and skipped by it.
    literal_mask: Mask,
    /// Literals not covered by the route key.
    literals: SmallVec<[(u8, TermId); 2]>,
}

/// The fact positions a family of clauses is keyed on: their tuple length and first two literal positions.
#[derive(Clone, PartialEq, Eq, Hash)]
struct Shape {
    len: u8,
    positions: SmallVec<[u8; 2]>,
}

#[derive(PartialEq, Eq, Hash)]
struct RouteKey {
    shape: Shape,
    values: SmallVec<[TermId; 2]>,
}

/// Registered queries plus the routing table from fact shapes to the clauses they may match.
#[derive(Default)]
pub struct Queries {
    slots: Vec<Option<Query>>,
    free: Vec<QueryId>,
    by_spec: HashMap<Spec, QueryId>,
    /// Shapes in use with how many clauses use each; a changed fact is keyed once per shape of its length.
    shapes: Vec<(Shape, u32)>,
    routes: HashMap<RouteKey, Vec<Route>>,
    /// Queries touched since the last `take_dirty`, without duplicates.
    dirty: Vec<QueryId>,
}

pub struct Bindings {
    row: Vec<TermId>,
    undo: Vec<VarId>,
}

impl Bindings {
    fn new(nvars: usize) -> Self {
        Bindings { row: vec![NONE; nvars], undo: Vec::new() }
    }

    /// Bind the clause against `terms`, recording new bindings so they can be undone. Returns how many were bound.
    #[inline]
    fn bind(&mut self, clause: &[u32], terms: &[TermId], mask: Mask) -> Option<usize> {
        let mark = self.undo.len();
        for (pos, &p) in clause.iter().enumerate() {
            if mask & (1 << pos) != 0 || p == WILD {
                continue;
            }
            let t = terms[pos];
            if is_var(p) {
                let v = var_of(p);
                let current = self.row[v as usize];
                if current == NONE {
                    self.row[v as usize] = t;
                    self.undo.push(v);
                } else if current != t {
                    self.rollback(mark);
                    return None;
                }
            } else if p != t {
                self.rollback(mark);
                return None;
            }
        }
        Some(mark)
    }

    #[inline]
    fn rollback(&mut self, mark: usize) {
        for v in self.undo.drain(mark..) {
            self.row[v as usize] = NONE;
        }
    }
}

fn clause_vars(clause: &[u32], out: &mut Vec<VarId>) {
    for &p in clause {
        if is_var(p) && !out.contains(&var_of(p)) {
            out.push(var_of(p));
        }
    }
}

fn literal_mask(clause: &[u32]) -> Mask {
    clause
        .iter()
        .enumerate()
        .fold(0, |m, (i, &p)| if !is_var(p) && p != WILD { m | (1 << i) } else { m })
}

/// Every position that is known once the row is complete: everything but wildcards.
fn bound_mask(clause: &[u32]) -> Mask {
    clause.iter().enumerate().fold(0, |m, (i, &p)| if p != WILD { m | (1 << i) } else { m })
}

/// Where a row sits in result order: the assertion sequence of the fact matching the
/// first clause (the earliest one when that clause has wildcards). Results therefore
/// follow the order the first pattern's facts were asserted, however the row was joined.
pub fn row_order(store: &Store, clauses: &[Clause], row: &[TermId]) -> u64 {
    let Some(clause) = clauses.first() else {
        return 0;
    };
    let value = |p: u32| if is_var(p) { row[var_of(p) as usize] } else { p };
    let full = bound_mask(clause);
    if full.count_ones() as usize == clause.len() {
        let tuple: SmallVec<[TermId; 4]> = clause.iter().map(|&p| value(p)).collect();
        return store.find(&tuple).map_or(u64::MAX, |fid| store.get(fid).seq);
    }
    let mask = scan_mask(clause.len(), full);
    let tuple: SmallVec<[TermId; 4]> = clause
        .iter()
        .enumerate()
        .filter(|&(i, _)| mask & (1 << i) != 0)
        .map(|(_, &p)| value(p))
        .collect();
    store
        .lookup(clause.len(), mask, &tuple)
        .map(|fid| store.get(fid))
        .filter(|record| clause.iter().enumerate().all(|(i, &p)| p == WILD || record.terms[i] == value(p)))
        .map(|record| record.seq)
        .min()
        .unwrap_or(u64::MAX)
}

/// How many facts match a negation under `row`'s bindings.
fn negation_matches(store: &Store, negation: &[u32], row: &[TermId]) -> u32 {
    let value = |p: u32| if is_var(p) { row[var_of(p) as usize] } else { p };
    let mask = bound_mask(negation);
    if mask.count_ones() as usize == negation.len() {
        let tuple: SmallVec<[TermId; 4]> = negation.iter().map(|&p| value(p)).collect();
        return u32::from(store.find(&tuple).is_some());
    }
    let tuple: SmallVec<[TermId; 4]> = negation
        .iter()
        .enumerate()
        .filter(|&(i, _)| mask & (1 << i) != 0)
        .map(|(_, &p)| value(p))
        .collect();
    store.bucket_size(negation.len(), mask, &tuple) as u32
}

/// The variables each filter reads.
fn filter_vars(spec: &Spec) -> Vec<Vec<VarId>> {
    spec.filters
        .iter()
        .map(|filter| {
            let mut vars = Vec::new();
            for p in filter {
                if !vars.contains(&p.lhs) {
                    vars.push(p.lhs);
                }
                if let Operand::Var(v) = p.rhs
                    && !vars.contains(&v)
                {
                    vars.push(v);
                }
            }
            vars
        })
        .collect()
}

/// Order the patterns other than `seed` (all of them when there is none) greedily by how
/// much of each is already known, starting from `bound`, and attach every filter to the
/// earliest point its variables are all bound.
fn build_plan(
    spec: &Spec,
    filter_vars: &[Vec<VarId>],
    seed: Option<usize>,
    mut bound: Vec<VarId>,
    exclude_before_seed: bool,
) -> Plan {
    let clauses = &spec.patterns;
    let mut placed = vec![false; filter_vars.len()];
    let place = |bound: &[VarId], placed: &mut [bool]| -> SmallVec<[u8; 2]> {
        let mut checks = SmallVec::new();
        for (i, vars) in filter_vars.iter().enumerate() {
            if !placed[i] && vars.iter().all(|v| bound.contains(v)) {
                placed[i] = true;
                checks.push(i as u8);
            }
        }
        checks
    };
    let checks = place(&bound, &mut placed);
    let mut remaining: Vec<usize> = (0..clauses.len()).filter(|&i| Some(i) != seed).collect();
    let mut steps = Vec::with_capacity(remaining.len());
    while !remaining.is_empty() {
        let mut best = 0;
        let mut best_score = -1i32;
        for (i, &c) in remaining.iter().enumerate() {
            let score = clauses[c]
                .iter()
                .filter(|&&p| (!is_var(p) && p != WILD) || (is_var(p) && bound.contains(&var_of(p))))
                .count() as i32;
            if score > best_score {
                best_score = score;
                best = i;
            }
        }
        let c = remaining.remove(best);
        let clause = &clauses[c];
        let mut mask: Mask = 0;
        let mut key = SmallVec::new();
        for (pos, &p) in clause.iter().enumerate() {
            if p == WILD {
                continue;
            }
            if is_var(p) {
                if bound.contains(&var_of(p)) {
                    mask |= 1 << pos;
                    key.push(KeySource::Var(var_of(p)));
                }
            } else {
                mask |= 1 << pos;
                key.push(KeySource::Lit(p));
            }
        }
        let exact = mask.count_ones() as usize == clause.len();
        clause_vars(clause, &mut bound);
        let checks = place(&bound, &mut placed);
        steps.push(Step {
            clause: c,
            mask,
            key,
            exact,
            exclude_seed: exclude_before_seed && seed.is_some_and(|seed| c < seed),
            checks,
        });
    }
    Plan { checks, steps }
}

impl Query {
    fn new(spec: Spec, interner: &Interner) -> Query {
        let nvars = spec.nvars();
        let arity = spec.arity();
        let vars = filter_vars(&spec);
        let seed_vars = |clause: &Clause| {
            let mut bound = Vec::new();
            clause_vars(clause, &mut bound);
            bound
        };
        let delta_plans = spec
            .patterns
            .iter()
            .enumerate()
            .map(|(i, c)| build_plan(&spec, &vars, Some(i), seed_vars(c), true))
            .collect();
        let negation_plans = spec
            .negations
            .iter()
            .map(|n| build_plan(&spec, &vars, None, seed_vars(n), false))
            .collect();
        let full_seed = (0..spec.patterns.len())
            .max_by_key(|&i| (literal_mask(&spec.patterns[i]).count_ones(), usize::MAX - i))
            .unwrap_or(0);
        let full_plan = match spec.patterns.get(full_seed) {
            Some(seed) => build_plan(&spec, &vars, Some(full_seed), seed_vars(seed), false),
            None => Plan { checks: SmallVec::new(), steps: Vec::new() },
        };
        let filters = spec.filters.iter().map(|f| Compiled::new(f, interner)).collect();
        let stages = Stages::new(&spec);
        Query {
            spec,
            nvars,
            arity,
            delta_plans,
            negation_plans,
            full_seed,
            full_plan,
            filters,
            scratch: Bindings::new(nvars),
            results: ResultSet::default(),
            stages,
            refcount: 1,
        }
    }

    /// Every (len, mask) the plans probe, so the store can index them.
    fn index_needs(&self) -> Vec<(usize, Mask)> {
        let mut needs = Vec::new();
        let mut push = |len: usize, mask: Mask| {
            if !needs.contains(&(len, mask)) {
                needs.push((len, mask));
            }
        };
        let clauses = &self.spec.patterns;
        if let Some(first) = clauses.first() {
            let seed = &clauses[self.full_seed];
            push(seed.len(), scan_mask(seed.len(), literal_mask(seed)));
            let order_mask = bound_mask(first);
            if order_mask.count_ones() as usize != first.len() {
                push(first.len(), scan_mask(first.len(), order_mask));
            }
        }
        for negation in &self.spec.negations {
            let mask = bound_mask(negation);
            if mask.count_ones() as usize != negation.len() {
                push(negation.len(), mask);
            }
        }
        let plans = self
            .delta_plans
            .iter()
            .chain(&self.negation_plans)
            .chain(std::iter::once(&self.full_plan));
        for plan in plans {
            for step in &plan.steps {
                if !step.exact {
                    push(clauses[step.clause].len(), step.mask);
                }
            }
        }
        needs
    }

    /// Evaluate from scratch into `results`, leaving every row marked as changed.
    pub fn seed_results(&mut self, store: &Store, interner: &Interner) {
        let Query { spec, full_seed, full_plan, filters, scratch, results, .. } = self;
        let walk = Walk { store, interner, spec, filters, plan: full_plan, exclude: NONE, count_blocked: true };
        evaluate_with(&walk, *full_seed, scratch, &mut |row, blocked| results.apply(row, 1, || blocked));
    }

    /// Whether a drain would have anything to report.
    pub fn is_dirty(&self) -> bool {
        self.results.is_dirty() || self.stages.as_ref().is_some_and(|stages| stages.output.is_dirty())
    }

    /// Feed the base rows' pending visibility changes through the stages, if there are any.
    pub fn advance(&mut self, store: &Store, interner: &mut Interner) {
        let Query { spec, results, stages, .. } = self;
        let Some(stages) = stages else {
            return;
        };
        let mut changes = Vec::new();
        results.drain(|_, row, visible| {
            let seq = if visible { row_order(store, &spec.patterns, row) } else { 0 };
            changes.push((Row::from(row), seq, visible));
        });
        stages.apply(changes, interner);
    }

    /// The rows the query reports and where each sits in result order.
    pub fn output(&self, store: &Store) -> Vec<(RowId, &[TermId], u64)> {
        match &self.stages {
            Some(stages) => stages.output.rows().map(|(id, row)| (id, row, stages.order_of(row))).collect(),
            None => self
                .results
                .rows()
                .map(|(id, row)| (id, row, row_order(store, &self.spec.patterns, row)))
                .collect(),
        }
    }
}

/// One traversal of a plan: the store to probe, the seed fact to skip where a step says so,
/// and whether complete rows should count the negation matches hiding them.
struct Walk<'a> {
    store: &'a Store,
    interner: &'a Interner,
    spec: &'a Spec,
    filters: &'a [Compiled],
    plan: &'a Plan,
    exclude: FactId,
    count_blocked: bool,
}

impl Walk<'_> {
    #[inline]
    fn passes(&self, checks: &[u8], row: &[TermId]) -> bool {
        checks.iter().all(|&i| self.filters[i as usize].passes(row, self.interner))
    }

    /// Walk the remaining steps, calling `emit` with each complete row and its blocked count.
    fn extend(&self, step_index: usize, bindings: &mut Bindings, emit: &mut dyn FnMut(&[TermId], u32)) {
        if step_index == 0 && !self.passes(&self.plan.checks, &bindings.row) {
            return;
        }
        if step_index == self.plan.steps.len() {
            let blocked = if self.count_blocked {
                self.spec.negations.iter().map(|n| negation_matches(self.store, n, &bindings.row)).sum()
            } else {
                0
            };
            emit(&bindings.row, blocked);
            return;
        }
        let step = &self.plan.steps[step_index];
        let clause = &self.spec.patterns[step.clause];
        let tuple: SmallVec<[TermId; 4]> = step
            .key
            .iter()
            .map(|source| match *source {
                KeySource::Lit(t) => t,
                KeySource::Var(v) => bindings.row[v as usize],
            })
            .collect();
        if step.exact {
            if let Some(fid) = self.store.find(&tuple)
                && !(step.exclude_seed && fid == self.exclude)
                && self.passes(&step.checks, &bindings.row)
            {
                self.extend(step_index + 1, bindings, emit);
            }
            return;
        }
        for fid in self.store.lookup(clause.len(), step.mask, &tuple) {
            if step.exclude_seed && fid == self.exclude {
                continue;
            }
            let terms = &self.store.get(fid).terms;
            if let Some(mark) = bindings.bind(clause, terms, step.mask) {
                if self.passes(&step.checks, &bindings.row) {
                    self.extend(step_index + 1, bindings, emit);
                }
                bindings.rollback(mark);
            }
        }
    }
}

/// Evaluate the query against the store from scratch, calling `emit` once per result row
/// (with multiplicity) along with how many negation matches hide it.
pub fn evaluate(store: &Store, interner: &Interner, query: &mut Query, emit: &mut dyn FnMut(&[TermId], u32)) {
    let Query { spec, full_seed, full_plan, filters, scratch, .. } = query;
    let walk = Walk { store, interner, spec, filters, plan: full_plan, exclude: NONE, count_blocked: true };
    evaluate_with(&walk, *full_seed, scratch, emit);
}

/// Scan the seed pattern by its literals and walk the rest of the plan from each match.
fn evaluate_with(walk: &Walk<'_>, full_seed: usize, bindings: &mut Bindings, emit: &mut dyn FnMut(&[TermId], u32)) {
    let Some(seed) = walk.spec.patterns.get(full_seed) else {
        return;
    };
    let mask = scan_mask(seed.len(), literal_mask(seed));
    let tuple: SmallVec<[TermId; 4]> =
        seed.iter().enumerate().filter(|&(i, _)| mask & (1 << i) != 0).map(|(_, &p)| p).collect();
    for fid in walk.store.lookup(seed.len(), mask, &tuple) {
        let terms = &walk.store.get(fid).terms;
        if let Some(mark) = bindings.bind(seed, terms, mask) {
            walk.extend(0, bindings, emit);
            bindings.rollback(mark);
        }
    }
}

/// A clause's route: its key plus the literals the key leaves unchecked.
fn route_of(clause: &[u32]) -> (RouteKey, SmallVec<[(u8, TermId); 2]>) {
    let mut key = RouteKey {
        shape: Shape { len: clause.len() as u8, positions: SmallVec::new() },
        values: SmallVec::new(),
    };
    let mut rest = SmallVec::new();
    for (pos, &p) in clause.iter().enumerate() {
        if is_var(p) || p == WILD {
            continue;
        }
        if key.values.len() < 2 {
            key.shape.positions.push(pos as u8);
            key.values.push(p);
        } else {
            rest.push((pos as u8, p));
        }
    }
    (key, rest)
}

impl Queries {
    pub fn new() -> Self {
        Queries::default()
    }

    pub fn get(&self, id: QueryId) -> Option<&Query> {
        self.slots.get(id as usize).and_then(Option::as_ref)
    }

    pub fn get_mut(&mut self, id: QueryId) -> Option<&mut Query> {
        self.slots.get_mut(id as usize).and_then(Option::as_mut)
    }

    /// Positive patterns and negations, each tagged.
    fn clauses(spec: &Spec) -> impl Iterator<Item = (bool, usize, &Clause)> {
        let positive = spec.patterns.iter().enumerate().map(|(i, c)| (false, i, c));
        let negated = spec.negations.iter().enumerate().map(|(i, c)| (true, i, c));
        positive.chain(negated)
    }

    /// Register (or re-reference) a normalized spec, evaluating it against the store when new;
    /// the flag says whether it was.
    pub fn register(&mut self, store: &mut Store, interner: &mut Interner, spec: Spec) -> (QueryId, bool) {
        if let Some(&id) = self.by_spec.get(&spec) {
            self.get_mut(id).unwrap().refcount += 1;
            return (id, false);
        }
        let query = Query::new(spec.clone(), interner);
        for (len, mask) in query.index_needs() {
            store.ensure_index(len, mask);
        }
        let id = match self.free.pop() {
            Some(id) => id,
            None => {
                self.slots.push(None);
                (self.slots.len() - 1) as QueryId
            }
        };
        for (negated, ci, clause) in Queries::clauses(&query.spec) {
            let (key, literals) = route_of(clause);
            match self.shapes.iter_mut().find(|(shape, _)| *shape == key.shape) {
                Some((_, count)) => *count += 1,
                None => self.shapes.push((key.shape.clone(), 1)),
            }
            let route = Route { query: id, clause: ci as u8, negated, literal_mask: literal_mask(clause), literals };
            self.routes.entry(key).or_default().push(route);
        }
        self.by_spec.insert(spec, id);
        self.slots[id as usize] = Some(query);
        self.reevaluate(store, interner, id);
        (id, true)
    }

    /// Evaluate from scratch; the initial rows are not reported as a delta.
    fn reevaluate(&mut self, store: &Store, interner: &mut Interner, id: QueryId) {
        let query = self.slots[id as usize].as_mut().unwrap();
        query.seed_results(store, interner);
        query.advance(store, interner);
        match &mut query.stages {
            Some(stages) => stages.output.settle(),
            None => query.results.settle(),
        }
    }

    /// Drop one reference; when the last one goes the query is removed and returned.
    pub fn release(&mut self, id: QueryId) -> Option<Query> {
        let query = self.get_mut(id)?;
        query.refcount -= 1;
        if query.refcount > 0 {
            return None;
        }
        let query = self.slots[id as usize].take().unwrap();
        self.by_spec.remove(&query.spec);
        for (negated, ci, clause) in Queries::clauses(&query.spec) {
            let (key, _) = route_of(clause);
            if let Some(list) = self.routes.get_mut(&key) {
                list.retain(|route| !(route.query == id && route.negated == negated && route.clause as usize == ci));
                if list.is_empty() {
                    self.routes.remove(&key);
                }
            }
            if let Some(i) = self.shapes.iter().position(|(shape, _)| *shape == key.shape) {
                self.shapes[i].1 -= 1;
                if self.shapes[i].1 == 0 {
                    self.shapes.swap_remove(i);
                }
            }
        }
        self.free.push(id);
        Some(query)
    }

    /// Propagate a fact change. For additions the store must already contain
    /// the fact; for removals it must still contain it.
    pub fn propagate(&mut self, store: &Store, interner: &Interner, fid: FactId, terms: &[TermId], delta: i32) {
        let mut targets: SmallVec<[(QueryId, bool, u8, Mask); 8]> = SmallVec::new();
        for (shape, _) in &self.shapes {
            if shape.len as usize != terms.len() {
                continue;
            }
            let values = shape.positions.iter().map(|&pos| terms[pos as usize]).collect();
            let Some(routes) = self.routes.get(&RouteKey { shape: shape.clone(), values }) else {
                continue;
            };
            for route in routes {
                if route.literals.iter().all(|&(pos, t)| terms[pos as usize] == t) {
                    targets.push((route.query, route.negated, route.clause, route.literal_mask));
                }
            }
        }
        // Negations first: a fact that also joins new rows must not hide them twice.
        targets.sort_unstable_by_key(|&(qid, negated, ..)| (!negated, qid));
        for (qid, negated, ci, literal_mask) in targets {
            let Query { spec, delta_plans, negation_plans, filters, scratch, results, .. } =
                self.slots[qid as usize].as_mut().unwrap();
            let was_dirty = results.is_dirty();
            if negated {
                let Some(mark) = scratch.bind(&spec.negations[ci as usize], terms, literal_mask) else {
                    continue;
                };
                let plan = &negation_plans[ci as usize];
                let walk = Walk { store, interner, spec, filters, plan, exclude: NONE, count_blocked: false };
                let mut hidden: Vec<RowId> = Vec::new();
                walk.extend(0, scratch, &mut |row, _| {
                    if let Some(id) = results.find(row)
                        && results.weight(id) > 0
                    {
                        hidden.push(id);
                    }
                });
                scratch.rollback(mark);
                hidden.sort_unstable();
                hidden.dedup();
                for id in hidden {
                    results.block(id, delta);
                }
            } else {
                let Some(mark) = scratch.bind(&spec.patterns[ci as usize], terms, literal_mask) else {
                    continue;
                };
                let plan = &delta_plans[ci as usize];
                let walk = Walk { store, interner, spec, filters, plan, exclude: fid, count_blocked: true };
                walk.extend(0, scratch, &mut |row, blocked| results.apply(row, delta, || blocked));
                scratch.rollback(mark);
            }
            if !was_dirty && results.is_dirty() {
                self.dirty.push(qid);
            }
        }
    }

    /// Queries with unreported changes, in the order they were first touched.
    pub fn take_dirty(&mut self) -> Vec<QueryId> {
        std::mem::take(&mut self.dirty)
    }

    pub fn clear_results(&mut self) {
        for (i, query) in self.slots.iter_mut().enumerate() {
            let Some(query) = query else { continue };
            let was_dirty = query.results.is_dirty();
            if query.results.clear() && !was_dirty {
                self.dirty.push(i as QueryId);
            }
        }
    }

    pub fn len(&self) -> usize {
        self.by_spec.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_spec.is_empty()
    }

    /// Result rows with a slot across every registered query, base and reported.
    pub fn result_rows(&self) -> usize {
        self.slots
            .iter()
            .flatten()
            .map(|query| query.results.len() + query.stages.as_ref().map_or(0, |s| s.output.len()))
            .sum()
    }

    /// Clauses a changed fact may be checked against, over every route key.
    pub fn route_count(&self) -> usize {
        self.routes.values().map(Vec::len).sum()
    }
}

/// Build a query object without registering it, for one-off evaluation.
pub fn adhoc(store: &mut Store, interner: &Interner, spec: Spec) -> Query {
    let query = Query::new(spec, interner);
    for (len, mask) in query.index_needs() {
        store.ensure_index(len, mask);
    }
    query
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;
    use crate::spec::{Op, Predicate};
    use crate::store::ROOT_OWNER;
    use crate::term::VAR_BASE;

    fn v(i: u32) -> u32 {
        VAR_BASE + i
    }

    fn drained(results: &mut ResultSet) -> Vec<(RowId, Vec<TermId>, bool)> {
        let mut out = Vec::new();
        results.drain(|id, row, visible| out.push((id, row.to_vec(), visible)));
        out
    }

    fn plain(patterns: Vec<Clause>) -> Query {
        Query::new(Spec::from(patterns).normalize().unwrap(), &Interner::new())
    }

    #[test]
    fn result_sets_track_weights_and_reuse_slots() {
        let mut results = ResultSet::default();
        assert!(results.is_empty() && !results.is_dirty());
        results.apply(&[1, 2], 1, || 0);
        results.apply(&[1, 2], 1, || 0);
        results.apply(&[3, 4], 1, || 0);
        assert!(results.is_dirty());
        assert_eq!(results.len(), 2);
        assert_eq!(drained(&mut results), vec![(0, vec![1, 2], true), (1, vec![3, 4], true)]);
        assert!(!results.is_dirty());

        results.apply(&[1, 2], -1, || 0);
        assert_eq!(drained(&mut results), vec![], "still present, so it is not reported as a change");
        results.apply(&[3, 4], -1, || 0);
        results.apply(&[5, 6], 1, || 0);
        results.apply(&[5, 6], -1, || 0);
        assert_eq!(drained(&mut results), vec![(1, vec![3, 4], false)], "a row that came and went is silent");
        assert_eq!(results.len(), 1);
        let rows: Vec<_> = results.rows().map(|(id, row)| (id, row.to_vec())).collect();
        assert_eq!(rows, vec![(0, vec![1, 2])]);

        results.apply(&[7, 8], 1, || 0);
        let rows: Vec<_> = results.rows().map(|(id, _)| id).collect();
        assert_eq!(rows, vec![0, 2], "the most recently freed slot is reused");
        assert_eq!(drained(&mut results), vec![(2, vec![7, 8], true)]);
        assert!(results.clear());
        assert_eq!(drained(&mut results), vec![(0, vec![1, 2], false), (2, vec![7, 8], false)]);
        assert!(!results.clear(), "nothing left to clear");
    }

    #[test]
    fn blocked_rows_are_weighted_but_invisible() {
        let mut results = ResultSet::default();
        results.apply(&[1], 1, || 2);
        results.apply(&[2], 1, || 0);
        assert_eq!(drained(&mut results), vec![(1, vec![2], true)], "a blocked row never appears");
        assert_eq!(results.len(), 2);
        results.block(0, -1);
        assert_eq!(drained(&mut results), vec![]);
        results.block(0, -1);
        assert_eq!(drained(&mut results), vec![(0, vec![1], true)]);
        results.block(1, 1);
        assert_eq!(drained(&mut results), vec![(1, vec![2], false)]);
        assert_eq!(results.weight(1), 1);
        results.apply(&[2], -1, || 99);
        results.apply(&[2], 1, || 0);
        assert_eq!(drained(&mut results), vec![(1, vec![2], true)], "a row re-entering recounts its blockers");
        results.apply(&[2], 1, || 5);
        assert_eq!(drained(&mut results), vec![], "gaining weight while present does not");
        assert_eq!(results.find(&[2]), Some(1));
        assert_eq!(results.find(&[3]), None);
    }

    #[test]
    fn settle_accepts_weights_silently_and_frees_zero_rows() {
        let mut results = ResultSet::default();
        results.apply(&[1], 1, || 0);
        results.apply(&[2], 1, || 0);
        results.apply(&[2], -1, || 0);
        results.settle();
        assert!(!results.is_dirty());
        assert_eq!(results.len(), 1);
        assert!(drained(&mut results).is_empty());
        results.apply(&[3], 1, || 0);
        assert_eq!(drained(&mut results), vec![(1, vec![3], true)], "the settled zero row's slot is reused");
    }

    #[test]
    fn bindings_enforce_repeated_variables_and_literals() {
        let clause = vec![v(0), 5, v(0), WILD];
        let mut b = Bindings::new(1);
        assert_eq!(b.bind(&clause, &[1, 5, 1, 9], 0), Some(0));
        assert_eq!(b.row, vec![1]);
        b.rollback(0);
        assert_eq!(b.row, vec![NONE]);
        assert_eq!(b.bind(&clause, &[1, 5, 2, 9], 0), None, "the same variable cannot bind two values");
        assert_eq!(b.row, vec![NONE], "a failed bind leaves nothing behind");
        assert_eq!(b.bind(&clause, &[1, 6, 1, 9], 0), None, "literals must match");
        assert_eq!(b.bind(&clause, &[1, 6, 1, 9], 0b0010), Some(0), "masked positions are trusted");
        b.rollback(0);
        b.row[0] = 7;
        assert_eq!(b.bind(&clause, &[7, 5, 7, 0], 0), Some(0));
        assert!(b.undo.is_empty(), "already-bound variables record nothing to undo");
        assert_eq!(b.bind(&clause, &[8, 5, 8, 0], 0), None);
    }

    #[test]
    fn plans_probe_literals_and_bound_variables_first() {
        let spec = Spec::from(vec![vec![v(0), 10, v(1)], vec![v(1), 11, v(2)], vec![v(2), 12, 13]]);
        let plan = build_plan(&spec, &[], Some(0), vec![0, 1], true);
        assert_eq!(
            plan.steps.iter().map(|s| s.clause).collect::<Vec<_>>(),
            vec![1, 2],
            "a tie goes to the earlier clause"
        );
        assert_eq!(plan.steps[0].mask, 0b011, "the bound variable and the literal");
        assert!(!plan.steps[0].exact && !plan.steps[0].exclude_seed);
        assert_eq!(plan.steps[1].mask, 0b111, "everything is known by the time clause 2 runs");
        assert!(plan.steps[1].exact);
        let unbound = build_plan(&Spec::from(vec![vec![v(0), 10], vec![v(1), 11, v(2)]]), &[], Some(0), vec![0], false);
        assert_eq!(unbound.steps[0].mask, 0b010, "a clause sharing nothing is scanned by its literals");
        let from_last = build_plan(&spec, &[], Some(2), vec![2], true);
        assert!(from_last.steps.iter().all(|s| s.exclude_seed), "earlier clauses skip the seed fact");
        let full = build_plan(&spec, &[], Some(2), vec![2], false);
        assert!(full.steps.iter().all(|s| !s.exclude_seed));
        let everything = build_plan(&spec, &[], None, vec![1], false);
        assert_eq!(
            everything.steps.iter().map(|s| s.clause).collect::<Vec<_>>(),
            vec![0, 1, 2],
            "every clause knows two positions, so ties fall back to clause order"
        );
        assert!(everything.steps.iter().all(|s| !s.exclude_seed), "a plan without a seed excludes nothing");
    }

    #[test]
    fn plans_check_filters_as_soon_as_their_variables_are_bound() {
        let pred = |lhs, rhs| Predicate { lhs, op: Op::Eq, rhs };
        let spec = Spec {
            patterns: vec![vec![v(0), 10, v(1)], vec![v(1), 11, v(2)]],
            filters: vec![
                vec![pred(0, Operand::Lit(1))],
                vec![pred(2, Operand::Var(0))],
                vec![pred(1, Operand::Lit(2))],
            ],
            ..Spec::default()
        };
        let vars = filter_vars(&spec);
        assert_eq!(vars, vec![vec![0], vec![2, 0], vec![1]]);
        let plan = build_plan(&spec, &vars, Some(0), vec![0, 1], true);
        assert_eq!(plan.checks.to_vec(), vec![0, 2], "filters over the seed's variables run before any step");
        assert_eq!(plan.steps[0].checks.to_vec(), vec![1]);
        let from_last = build_plan(&spec, &vars, Some(1), vec![1, 2], true);
        assert_eq!(from_last.checks.to_vec(), vec![2]);
        assert_eq!(from_last.steps[0].checks.to_vec(), vec![0, 1]);
    }

    #[test]
    fn queries_choose_the_most_literal_seed_and_request_indexes() {
        let q = plain(vec![vec![v(0), 10, v(1)], vec![v(1), 11, 12]]);
        assert_eq!((q.nvars, q.arity), (2, 2));
        assert_eq!(q.full_seed, 1);
        assert_eq!(
            q.index_needs(),
            vec![(3, 0b110)],
            "the seed scan and clause 0 probed from clause 1 share one index; clause 1 from clause 0 is a key probe"
        );

        let wild = plain(vec![vec![v(0), WILD, v(1)]]);
        assert!(
            wild.index_needs().contains(&(3, 0b101)),
            "ordering a wildcard clause needs its bound positions"
        );

        let negated = Query::new(
            Spec {
                patterns: vec![vec![10, v(0)]],
                negations: vec![vec![11, v(0), WILD], vec![12, v(0)]],
                ..Spec::default()
            }
            .normalize()
            .unwrap(),
            &Interner::new(),
        );
        let needs = negated.index_needs();
        assert!(needs.contains(&(3, 0b011)), "counting a wildcard negation needs its bound positions");
        assert!(!needs.contains(&(2, 0b11)), "a fully bound negation is a key probe");
        assert_eq!(negated.negation_plans.len(), 2);

        let mut empty = plain(vec![]);
        assert_eq!((empty.nvars, empty.full_seed), (0, 0));
        assert!(empty.index_needs().is_empty());
        let mut rows = 0;
        evaluate(&Store::new(), &Interner::new(), &mut empty, &mut |_, _| rows += 1);
        assert_eq!(rows, 0);
        assert_eq!(row_order(&Store::new(), &[], &[]), 0);
        assert!(empty.output(&Store::new()).is_empty());
    }

    #[test]
    fn registry_reuses_slots_and_prunes_routes() {
        let mut store = Store::new();
        let mut interner = Interner::new();
        let mut queries = Queries::new();
        assert!(queries.is_empty());
        let spec = |patterns: Vec<Clause>| Spec::from(patterns).normalize().unwrap();
        let (a, created) = queries.register(&mut store, &mut interner, spec(vec![vec![10, v(0)]]));
        assert!(created);
        let (b, _) = queries.register(&mut store, &mut interner, spec(vec![vec![v(0), 11]]));
        assert_eq!(
            queries.register(&mut store, &mut interner, spec(vec![vec![10, v(0)]])),
            (a, false),
            "identical queries are shared"
        );
        assert_eq!(queries.len(), 2);
        assert!(queries.get(a).is_some() && queries.get(b).is_some());
        assert!(queries.get(7).is_none());
        assert!(queries.release(7).is_none(), "unknown ids are not released");
        assert!(queries.release(a).is_none(), "one reference remains");
        assert_eq!(queries.release(a).map(|q| q.spec.patterns), Some(vec![vec![10, v(0)]]));
        assert!(queries.get(a).is_none());
        let negated = Spec { patterns: vec![vec![10, v(0), v(1)]], negations: vec![vec![13, v(0)]], ..Spec::default() };
        let (c, _) = queries.register(&mut store, &mut interner, negated.normalize().unwrap());
        assert_eq!(c, a, "freed ids are reused");
        assert!(queries.routes.contains_key(&route_of(&[10, v(0), v(1)]).0));
        assert!(queries.routes.contains_key(&route_of(&[13, v(0)]).0), "negations are routed too");
        assert!(
            !queries.routes.contains_key(&route_of(&[10, v(0)]).0),
            "the released query's route is gone"
        );
        assert!(queries.routes.contains_key(&route_of(&[v(0), 11]).0));
        assert_eq!(queries.shapes.len(), 3, "one shape per length and literal layout");
        assert_eq!(queries.route_count(), 3);
        assert!(queries.release(b).is_some() && queries.release(c).is_some());
        assert!(queries.routes.is_empty() && queries.shapes.is_empty());
        assert!(queries.is_empty());
    }

    #[test]
    fn propagation_ignores_unrouted_facts_and_settles_registered_rows() {
        let mut store = Store::new();
        let mut interner = Interner::new();
        let mut queries = Queries::new();
        let f = store.insert(&[10, 1], 2, ROOT_OWNER);
        let (q, _) = queries.register(&mut store, &mut interner, Spec::from(vec![vec![10, v(0)]]));
        assert_eq!(queries.get(q).unwrap().results.len(), 1, "registration sees existing facts");
        assert!(queries.take_dirty().is_empty(), "without reporting them");
        let g = store.insert(&[11, 1], 2, ROOT_OWNER);
        queries.propagate(&store, &interner, g, &[11, 1], 1);
        assert!(queries.take_dirty().is_empty(), "no clause can match a fact starting with 11");
        let h = store.insert(&[10, 1, 2], 2, ROOT_OWNER);
        queries.propagate(&store, &interner, h, &[10, 1, 2], 1);
        assert!(queries.take_dirty().is_empty(), "nor one of another length");
        queries.propagate(&store, &interner, f, &[10, 1], -1);
        assert_eq!(queries.take_dirty(), vec![q]);
        queries.clear_results();
        assert!(queries.take_dirty().is_empty(), "the only row is already on its way out");
    }

    #[test]
    fn negations_count_matches_under_a_row() {
        let mut store = Store::new();
        store.insert(&[10, 1, 5], 2, ROOT_OWNER);
        store.insert(&[10, 1, 6], 2, ROOT_OWNER);
        store.insert(&[10, 2, 7], 2, ROOT_OWNER);
        store.ensure_index(3, 0b011);
        assert_eq!(negation_matches(&store, &[10, v(0), WILD], &[1]), 2);
        assert_eq!(negation_matches(&store, &[10, v(0), WILD], &[3]), 0);
        assert_eq!(negation_matches(&store, &[10, v(0), 7], &[2]), 1);
        assert_eq!(negation_matches(&store, &[10, v(0), 7], &[1]), 0);
    }
}
