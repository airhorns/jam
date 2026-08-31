//! Conjunctive pattern queries, maintained incrementally.
//!
//! A query is a list of clauses over one fact relation; variables shared
//! between clauses are join conditions. Results are Z-sets (rows with integer
//! weights): registering a query evaluates it once, and afterwards every fact
//! added or removed only produces the rows it contributes to. For a fact `f`
//! matching clause `i`, those are the joins where clauses before `i` are
//! satisfied by facts other than `f` and clauses after `i` by any fact
//! including `f` — the standard decomposition of a multi-way join delta, so
//! a fact matching several clauses is never counted twice.

use std::hash::BuildHasher;

use hashbrown::{DefaultHashBuilder, HashMap, HashTable};
use smallvec::SmallVec;

use crate::store::{FactId, Mask, Store, scan_mask};
use crate::term::{NONE, TermId, VAR_BASE, WILD};

pub type QueryId = u32;
pub type RowId = u32;
pub type VarId = u32;

/// One position of a clause: a literal term id, `VAR_BASE + var`, or `WILD`.
pub type Clause = Vec<u32>;

/// A result row: one term per variable, inline for the common arities.
pub type Row = SmallVec<[TermId; 4]>;

#[inline]
fn is_var(t: u32) -> bool {
    (VAR_BASE..WILD).contains(&t)
}

#[inline]
fn var_of(t: u32) -> VarId {
    t - VAR_BASE
}

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
}

struct Plan {
    steps: Vec<Step>,
}

pub struct Query {
    pub clauses: Vec<Clause>,
    pub nvars: usize,
    /// One plan per clause acting as the seed of a delta.
    delta_plans: Vec<Plan>,
    /// Plan for evaluating from scratch: `full_seed` scanned by its literals, then the rest.
    full_seed: usize,
    full_plan: Plan,
    scratch: Bindings,
    pub results: ResultSet,
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
    /// Weight before this transaction, valid while `touched`.
    before: i32,
    touched: bool,
}

impl ResultSet {
    #[inline]
    fn apply(&mut self, row: &[TermId], delta: i32) {
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
                        self.slots.push(Slot { row: row.into(), weight: 0, before: 0, touched: false });
                        (self.slots.len() - 1) as RowId
                    }
                };
                let (slots, hasher) = (&self.slots, &self.hasher);
                self.ids.insert_unique(hash, id, |&id| hasher.hash_one(&slots[id as usize].row[..]));
                id
            }
        };
        let slot = &mut self.slots[id as usize];
        if !slot.touched {
            slot.touched = true;
            slot.before = slot.weight;
            self.touched.push(id);
        }
        slot.weight += delta;
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

    /// Accept the current weights as the baseline without reporting them.
    pub fn settle(&mut self) {
        for id in std::mem::take(&mut self.touched) {
            self.slots[id as usize].touched = false;
            if self.slots[id as usize].weight == 0 {
                self.release(id);
            }
        }
    }

    /// Rows whose weight changed since the last drain, as (id, row, before, after); frees emptied slots.
    pub fn drain(&mut self, mut emit: impl FnMut(RowId, &[TermId], i32, i32)) {
        let mut touched = std::mem::take(&mut self.touched);
        touched.sort_unstable();
        for id in touched {
            let slot = &mut self.slots[id as usize];
            slot.touched = false;
            let (before, after) = (slot.before, slot.weight);
            if before != after {
                emit(id, &slot.row, before, after);
            }
            if after == 0 {
                self.release(id);
            }
        }
    }

    pub fn rows(&self) -> impl Iterator<Item = (RowId, &[TermId], i32)> {
        self.slots
            .iter()
            .enumerate()
            .filter(|(_, s)| s.weight != 0)
            .map(|(i, s)| (i as RowId, &s.row[..], s.weight))
    }

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
    by_pattern: HashMap<Vec<Clause>, QueryId>,
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

fn build_plan(clauses: &[Clause], seed: usize, exclude_before_seed: bool) -> Plan {
    let mut bound: Vec<VarId> = Vec::new();
    clause_vars(&clauses[seed], &mut bound);
    let mut remaining: Vec<usize> = (0..clauses.len()).filter(|&i| i != seed).collect();
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
        steps.push(Step { clause: c, mask, key, exact, exclude_seed: exclude_before_seed && c < seed });
        clause_vars(clause, &mut bound);
    }
    Plan { steps }
}

impl Query {
    fn new(clauses: Vec<Clause>) -> Query {
        let mut vars = Vec::new();
        for clause in &clauses {
            clause_vars(clause, &mut vars);
        }
        let nvars = vars.iter().map(|&v| v as usize + 1).max().unwrap_or(0);
        let delta_plans = (0..clauses.len()).map(|seed| build_plan(&clauses, seed, true)).collect();
        let full_seed = (0..clauses.len())
            .max_by_key(|&i| (literal_mask(&clauses[i]).count_ones(), usize::MAX - i))
            .unwrap_or(0);
        let full_plan = if clauses.is_empty() {
            Plan { steps: Vec::new() }
        } else {
            build_plan(&clauses, full_seed, false)
        };
        Query {
            clauses,
            nvars,
            delta_plans,
            full_seed,
            full_plan,
            scratch: Bindings::new(nvars),
            results: ResultSet::default(),
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
        if let Some(first) = self.clauses.first() {
            let seed = &self.clauses[self.full_seed];
            push(seed.len(), scan_mask(seed.len(), literal_mask(seed)));
            let order_mask = bound_mask(first);
            if order_mask.count_ones() as usize != first.len() {
                push(first.len(), scan_mask(first.len(), order_mask));
            }
        }
        for plan in self.delta_plans.iter().chain(std::iter::once(&self.full_plan)) {
            for step in &plan.steps {
                if !step.exact {
                    push(self.clauses[step.clause].len(), step.mask);
                }
            }
        }
        needs
    }
}

/// One traversal of a plan: the store to probe and the seed fact to skip where a step says so.
struct Walk<'a> {
    store: &'a Store,
    clauses: &'a [Clause],
    plan: &'a Plan,
    exclude: FactId,
}

impl Walk<'_> {
    /// Walk the remaining steps, calling `emit` with each complete row.
    fn extend(&self, step_index: usize, bindings: &mut Bindings, emit: &mut dyn FnMut(&[TermId])) {
        if step_index == self.plan.steps.len() {
            emit(&bindings.row);
            return;
        }
        let step = &self.plan.steps[step_index];
        let clause = &self.clauses[step.clause];
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
                self.extend(step_index + 1, bindings, emit);
                bindings.rollback(mark);
            }
        }
    }
}

/// Evaluate `clauses` against the store from scratch, calling `emit` once per result row (with multiplicity).
pub fn evaluate(store: &Store, query: &mut Query, emit: &mut dyn FnMut(&[TermId])) {
    evaluate_with(store, &query.clauses, query.full_seed, &query.full_plan, &mut query.scratch, emit);
}

fn evaluate_with(
    store: &Store,
    clauses: &[Clause],
    full_seed: usize,
    full_plan: &Plan,
    bindings: &mut Bindings,
    emit: &mut dyn FnMut(&[TermId]),
) {
    if clauses.is_empty() {
        return;
    }
    let seed = &clauses[full_seed];
    let mask = scan_mask(seed.len(), literal_mask(seed));
    let tuple: SmallVec<[TermId; 4]> =
        seed.iter().enumerate().filter(|&(i, _)| mask & (1 << i) != 0).map(|(_, &p)| p).collect();
    let walk = Walk { store, clauses, plan: full_plan, exclude: NONE };
    for fid in store.lookup(seed.len(), mask, &tuple) {
        let terms = &store.get(fid).terms;
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

    /// Register (or re-reference) a query, evaluating it against the store when new;
    /// the flag says whether it was.
    pub fn register(&mut self, store: &mut Store, clauses: Vec<Clause>) -> (QueryId, bool) {
        if let Some(&id) = self.by_pattern.get(&clauses) {
            self.get_mut(id).unwrap().refcount += 1;
            return (id, false);
        }
        let query = Query::new(clauses.clone());
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
        for (ci, clause) in query.clauses.iter().enumerate() {
            let (key, literals) = route_of(clause);
            match self.shapes.iter_mut().find(|(shape, _)| *shape == key.shape) {
                Some((_, count)) => *count += 1,
                None => self.shapes.push((key.shape.clone(), 1)),
            }
            let route = Route { query: id, clause: ci as u8, literal_mask: literal_mask(clause), literals };
            self.routes.entry(key).or_default().push(route);
        }
        self.by_pattern.insert(clauses, id);
        self.slots[id as usize] = Some(query);
        self.reevaluate(store, id);
        (id, true)
    }

    /// Evaluate from scratch; the initial rows are not reported as a delta.
    fn reevaluate(&mut self, store: &Store, id: QueryId) {
        let query = self.slots[id as usize].as_mut().unwrap();
        let Query { clauses, full_seed, full_plan, scratch, results, .. } = query;
        evaluate_with(store, clauses, *full_seed, full_plan, scratch, &mut |row| results.apply(row, 1));
        results.settle();
    }

    /// Drop one reference; when the last one goes the query is removed and its clauses returned.
    pub fn release(&mut self, id: QueryId) -> Option<Vec<Clause>> {
        let query = self.get_mut(id)?;
        query.refcount -= 1;
        if query.refcount > 0 {
            return None;
        }
        let query = self.slots[id as usize].take().unwrap();
        self.by_pattern.remove(&query.clauses);
        for (ci, clause) in query.clauses.iter().enumerate() {
            let (key, _) = route_of(clause);
            if let Some(list) = self.routes.get_mut(&key) {
                list.retain(|route| !(route.query == id && route.clause as usize == ci));
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
        Some(query.clauses)
    }

    /// Propagate a fact change. For additions the store must already contain
    /// the fact; for removals it must still contain it.
    pub fn propagate(&mut self, store: &Store, fid: FactId, terms: &[TermId], delta: i32) {
        let mut targets: SmallVec<[(QueryId, u8, Mask); 8]> = SmallVec::new();
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
                    targets.push((route.query, route.clause, route.literal_mask));
                }
            }
        }
        for (qid, ci, literal_mask) in targets {
            let Query { clauses, delta_plans, scratch, results, .. } = self.slots[qid as usize].as_mut().unwrap();
            let Some(mark) = scratch.bind(&clauses[ci as usize], terms, literal_mask) else {
                continue;
            };
            let was_dirty = results.is_dirty();
            let walk = Walk { store, clauses, plan: &delta_plans[ci as usize], exclude: fid };
            walk.extend(0, scratch, &mut |row| results.apply(row, delta));
            scratch.rollback(mark);
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
            let live: Vec<(Row, i32)> = query.results.rows().map(|(_, row, w)| (row.into(), w)).collect();
            if live.is_empty() {
                continue;
            }
            if !query.results.is_dirty() {
                self.dirty.push(i as QueryId);
            }
            for (row, weight) in &live {
                query.results.apply(row, -weight);
            }
        }
    }

    pub fn len(&self) -> usize {
        self.by_pattern.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_pattern.is_empty()
    }
}

/// Build a query object without registering it, for one-off evaluation.
pub fn adhoc(store: &mut Store, clauses: Vec<Clause>) -> Query {
    let query = Query::new(clauses);
    for (len, mask) in query.index_needs() {
        store.ensure_index(len, mask);
    }
    query
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;
    use crate::store::ROOT_OWNER;

    fn v(i: u32) -> u32 {
        VAR_BASE + i
    }

    fn drained(results: &mut ResultSet) -> Vec<(RowId, Vec<TermId>, i32, i32)> {
        let mut out = Vec::new();
        results.drain(|id, row, before, after| out.push((id, row.to_vec(), before, after)));
        out
    }

    #[test]
    fn result_sets_track_weights_and_reuse_slots() {
        let mut results = ResultSet::default();
        assert!(results.is_empty() && !results.is_dirty());
        results.apply(&[1, 2], 1);
        results.apply(&[1, 2], 1);
        results.apply(&[3, 4], 1);
        assert!(results.is_dirty());
        assert_eq!(results.len(), 2);
        assert_eq!(drained(&mut results), vec![(0, vec![1, 2], 0, 2), (1, vec![3, 4], 0, 1)]);
        assert!(!results.is_dirty());

        results.apply(&[1, 2], -1);
        assert_eq!(
            drained(&mut results),
            vec![(0, vec![1, 2], 2, 1)],
            "still present, so it is not reported as a change"
        );
        results.apply(&[3, 4], -1);
        results.apply(&[5, 6], 1);
        results.apply(&[5, 6], -1);
        assert_eq!(drained(&mut results), vec![(1, vec![3, 4], 1, 0)], "a row that came and went is silent");
        assert_eq!(results.len(), 1);
        let rows: Vec<_> = results.rows().map(|(id, row, w)| (id, row.to_vec(), w)).collect();
        assert_eq!(rows, vec![(0, vec![1, 2], 1)]);

        results.apply(&[7, 8], 1);
        let rows: Vec<_> = results.rows().map(|(id, _, _)| id).collect();
        assert_eq!(rows, vec![0, 2], "the most recently freed slot is reused");
    }

    #[test]
    fn settle_accepts_weights_silently_and_frees_zero_rows() {
        let mut results = ResultSet::default();
        results.apply(&[1], 1);
        results.apply(&[2], 1);
        results.apply(&[2], -1);
        results.settle();
        assert!(!results.is_dirty());
        assert_eq!(results.len(), 1);
        assert!(drained(&mut results).is_empty());
        results.apply(&[3], 1);
        assert_eq!(drained(&mut results), vec![(1, vec![3], 0, 1)], "the settled zero row's slot is reused");
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
        let clauses = vec![vec![v(0), 10, v(1)], vec![v(1), 11, v(2)], vec![v(2), 12, 13]];
        let plan = build_plan(&clauses, 0, true);
        assert_eq!(
            plan.steps.iter().map(|s| s.clause).collect::<Vec<_>>(),
            vec![1, 2],
            "a tie goes to the earlier clause"
        );
        assert_eq!(plan.steps[0].mask, 0b011, "the bound variable and the literal");
        assert!(!plan.steps[0].exact && !plan.steps[0].exclude_seed);
        assert_eq!(plan.steps[1].mask, 0b111, "everything is known by the time clause 2 runs");
        assert!(plan.steps[1].exact);
        let unbound = build_plan(&[vec![v(0), 10], vec![v(1), 11, v(2)]], 0, false);
        assert_eq!(unbound.steps[0].mask, 0b010, "a clause sharing nothing is scanned by its literals");
        let from_last = build_plan(&clauses, 2, true);
        assert!(from_last.steps.iter().all(|s| s.exclude_seed), "earlier clauses skip the seed fact");
        let full = build_plan(&clauses, 2, false);
        assert!(full.steps.iter().all(|s| !s.exclude_seed));
    }

    #[test]
    fn queries_choose_the_most_literal_seed_and_request_indexes() {
        let q = Query::new(vec![vec![v(0), 10, v(1)], vec![v(1), 11, 12]]);
        assert_eq!(q.nvars, 2);
        assert_eq!(q.full_seed, 1);
        assert_eq!(
            q.index_needs(),
            vec![(3, 0b110)],
            "the seed scan and clause 0 probed from clause 1 share one index; clause 1 from clause 0 is a key probe"
        );

        let wild = Query::new(vec![vec![v(0), WILD, v(1)]]);
        assert!(
            wild.index_needs().contains(&(3, 0b101)),
            "ordering a wildcard clause needs its bound positions"
        );

        let mut empty = Query::new(vec![]);
        assert_eq!((empty.nvars, empty.full_seed), (0, 0));
        assert!(empty.index_needs().is_empty());
        let mut rows = 0;
        evaluate(&Store::new(), &mut empty, &mut |_| rows += 1);
        assert_eq!(rows, 0);
        assert_eq!(row_order(&Store::new(), &[], &[]), 0);
    }

    #[test]
    fn registry_reuses_slots_and_prunes_routes() {
        let mut store = Store::new();
        let mut queries = Queries::new();
        assert!(queries.is_empty());
        let (a, created) = queries.register(&mut store, vec![vec![10, v(0)]]);
        assert!(created);
        let (b, _) = queries.register(&mut store, vec![vec![v(0), 11]]);
        assert_eq!(
            queries.register(&mut store, vec![vec![10, v(0)]]),
            (a, false),
            "identical queries are shared"
        );
        assert_eq!(queries.len(), 2);
        assert!(queries.get(a).is_some() && queries.get(b).is_some());
        assert!(queries.get(7).is_none());
        assert_eq!(queries.release(7), None, "unknown ids are not released");
        assert_eq!(queries.release(a), None, "one reference remains");
        assert_eq!(queries.release(a), Some(vec![vec![10, v(0)]]));
        assert!(queries.get(a).is_none());
        let (c, _) = queries.register(&mut store, vec![vec![10, v(0), v(1)]]);
        assert_eq!(c, a, "freed ids are reused");
        assert!(queries.routes.contains_key(&route_of(&[10, v(0), v(1)]).0));
        assert!(
            !queries.routes.contains_key(&route_of(&[10, v(0)]).0),
            "the released query's route is gone"
        );
        assert!(queries.routes.contains_key(&route_of(&[v(0), 11]).0));
        assert_eq!(queries.shapes.len(), 2, "one shape per length and literal layout");
        assert!(queries.release(b).is_some() && queries.release(c).is_some());
        assert!(queries.routes.is_empty() && queries.shapes.is_empty());
        assert!(queries.is_empty());
    }

    #[test]
    fn propagation_ignores_unrouted_facts_and_settles_registered_rows() {
        let mut store = Store::new();
        let mut queries = Queries::new();
        let f = store.insert(&[10, 1], 2, ROOT_OWNER);
        let (q, _) = queries.register(&mut store, vec![vec![10, v(0)]]);
        assert_eq!(queries.get(q).unwrap().results.len(), 1, "registration sees existing facts");
        assert!(queries.take_dirty().is_empty(), "without reporting them");
        let g = store.insert(&[11, 1], 2, ROOT_OWNER);
        queries.propagate(&store, g, &[11, 1], 1);
        assert!(queries.take_dirty().is_empty(), "no clause can match a fact starting with 11");
        let h = store.insert(&[10, 1, 2], 2, ROOT_OWNER);
        queries.propagate(&store, h, &[10, 1, 2], 1);
        assert!(queries.take_dirty().is_empty(), "nor one of another length");
        queries.propagate(&store, f, &[10, 1], -1);
        assert_eq!(queries.take_dirty(), vec![q]);
        queries.clear_results();
        assert!(queries.take_dirty().is_empty(), "the only row is already on its way out");
    }
}
