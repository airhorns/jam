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

use hashbrown::HashMap;
use smallvec::SmallVec;

use crate::store::{FactId, Mask, Store};
use crate::term::{TermId, NONE, VAR_BASE, WILD};

pub type QueryId = u32;
pub type RowId = u32;
pub type VarId = u32;

/// One position of a clause: a literal term id, `VAR_BASE + var`, or `WILD`.
pub type Clause = Vec<u32>;

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
    pub results: ResultSet,
    pub refcount: u32,
}

#[derive(Default)]
pub struct ResultSet {
    ids: HashMap<Box<[TermId]>, RowId>,
    slots: Vec<Slot>,
    free: Vec<RowId>,
    /// Row weight before this transaction touched it, for rows touched so far.
    pending: HashMap<RowId, i32>,
}

struct Slot {
    row: Box<[TermId]>,
    weight: i32,
}

impl ResultSet {
    #[inline]
    fn apply(&mut self, row: &[TermId], delta: i32) {
        let id = match self.ids.get(row) {
            Some(&id) => id,
            None => {
                let id = match self.free.pop() {
                    Some(id) => {
                        self.slots[id as usize].row = row.into();
                        id
                    }
                    None => {
                        self.slots.push(Slot { row: row.into(), weight: 0 });
                        (self.slots.len() - 1) as RowId
                    }
                };
                self.ids.insert(row.into(), id);
                id
            }
        };
        let slot = &mut self.slots[id as usize];
        self.pending.entry(id).or_insert(slot.weight);
        slot.weight += delta;
    }

    pub fn is_dirty(&self) -> bool {
        !self.pending.is_empty()
    }

    /// Accept the current weights as the baseline without reporting them.
    pub fn settle(&mut self) {
        let touched: Vec<RowId> = self.pending.drain().map(|(id, _)| id).collect();
        for id in touched {
            if self.slots[id as usize].weight == 0 {
                let row = std::mem::take(&mut self.slots[id as usize].row);
                self.ids.remove(&row);
                self.free.push(id);
            }
        }
    }

    /// Rows whose weight changed since the last drain, as (id, row, before, after); frees emptied slots.
    pub fn drain(&mut self, mut emit: impl FnMut(RowId, &[TermId], i32, i32)) {
        let mut touched: Vec<(RowId, i32)> = self.pending.drain().collect();
        touched.sort_unstable();
        for (id, before) in touched {
            let after = self.slots[id as usize].weight;
            if before != after {
                emit(id, &self.slots[id as usize].row, before, after);
            }
            if after == 0 {
                let row = std::mem::take(&mut self.slots[id as usize].row);
                self.ids.remove(&row);
                self.free.push(id);
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

/// Registered queries plus the routing table from fact shapes to the clauses they may match.
#[derive(Default)]
pub struct Queries {
    slots: Vec<Option<Query>>,
    free: Vec<QueryId>,
    by_pattern: HashMap<Vec<Clause>, QueryId>,
    /// (length, literal first term or NONE) → clauses to test against a changed fact.
    routes: HashMap<(u8, u32), Vec<(QueryId, u8)>>,
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
    clause.iter().enumerate().fold(0, |m, (i, &p)| if !is_var(p) && p != WILD { m | (1 << i) } else { m })
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
        let full_plan = if clauses.is_empty() { Plan { steps: Vec::new() } } else { build_plan(&clauses, full_seed, false) };
        Query { clauses, nvars, delta_plans, full_seed, full_plan, results: ResultSet::default(), refcount: 1 }
    }

    /// Every (len, mask) the plans probe, so the store can index them.
    fn index_needs(&self) -> Vec<(usize, Mask)> {
        let mut needs = Vec::new();
        let mut push = |len: usize, mask: Mask| {
            if !needs.contains(&(len, mask)) {
                needs.push((len, mask));
            }
        };
        if !self.clauses.is_empty() {
            let seed = &self.clauses[self.full_seed];
            push(seed.len(), literal_mask(seed));
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
    query: &'a Query,
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
        let clause = &self.query.clauses[step.clause];
        let tuple: SmallVec<[TermId; 4]> = step
            .key
            .iter()
            .map(|source| match *source {
                KeySource::Lit(t) => t,
                KeySource::Var(v) => bindings.row[v as usize],
            })
            .collect();
        if step.exact {
            if let Some(fid) = self.store.find(&tuple) {
                if !(step.exclude_seed && fid == self.exclude) {
                    self.extend(step_index + 1, bindings, emit);
                }
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
pub fn evaluate(store: &Store, query: &Query, emit: &mut dyn FnMut(&[TermId])) {
    if query.clauses.is_empty() {
        return;
    }
    let seed = &query.clauses[query.full_seed];
    let mask = literal_mask(seed);
    let tuple: SmallVec<[TermId; 4]> = seed.iter().filter(|&&p| !is_var(p) && p != WILD).copied().collect();
    let mut bindings = Bindings::new(query.nvars);
    let walk = Walk { store, query, plan: &query.full_plan, exclude: NONE };
    for fid in store.lookup(seed.len(), mask, &tuple) {
        let terms = &store.get(fid).terms;
        if let Some(mark) = bindings.bind(seed, terms, mask) {
            walk.extend(0, &mut bindings, emit);
            bindings.rollback(mark);
        }
    }
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

    /// Register (or re-reference) a query, evaluating it against the store when new.
    pub fn register(&mut self, store: &mut Store, clauses: Vec<Clause>) -> QueryId {
        if let Some(&id) = self.by_pattern.get(&clauses) {
            self.get_mut(id).unwrap().refcount += 1;
            return id;
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
            let first = clause.first().copied().unwrap_or(NONE);
            let key = (clause.len() as u8, if is_var(first) || first == WILD { NONE } else { first });
            self.routes.entry(key).or_default().push((id, ci as u8));
        }
        self.by_pattern.insert(clauses, id);
        self.slots[id as usize] = Some(query);
        self.reevaluate(store, id);
        id
    }

    /// Evaluate from scratch; the initial rows are not reported as a delta.
    fn reevaluate(&mut self, store: &Store, id: QueryId) {
        let mut query = self.slots[id as usize].take().unwrap();
        let mut rows: Vec<Box<[TermId]>> = Vec::new();
        evaluate(store, &query, &mut |row| rows.push(row.into()));
        for row in rows {
            query.results.apply(&row, 1);
        }
        query.results.settle();
        self.slots[id as usize] = Some(query);
    }

    /// Drop one reference; the query is removed when the last one goes.
    pub fn release(&mut self, id: QueryId) -> bool {
        let Some(query) = self.get_mut(id) else { return false };
        query.refcount -= 1;
        if query.refcount > 0 {
            return false;
        }
        let query = self.slots[id as usize].take().unwrap();
        self.by_pattern.remove(&query.clauses);
        for (ci, clause) in query.clauses.iter().enumerate() {
            let first = clause.first().copied().unwrap_or(NONE);
            let key = (clause.len() as u8, if is_var(first) || first == WILD { NONE } else { first });
            if let Some(list) = self.routes.get_mut(&key) {
                list.retain(|&(q, c)| !(q == id && c as usize == ci));
                if list.is_empty() {
                    self.routes.remove(&key);
                }
            }
        }
        self.free.push(id);
        true
    }

    /// Propagate a fact change. For additions the store must already contain
    /// the fact; for removals it must still contain it.
    pub fn propagate(&mut self, store: &Store, fid: FactId, terms: &[TermId], delta: i32) {
        let len = terms.len() as u8;
        let exact = self.routes.get(&(len, terms[0])).map(Vec::as_slice).unwrap_or(&[]);
        let wild = self.routes.get(&(len, NONE)).map(Vec::as_slice).unwrap_or(&[]);
        if exact.is_empty() && wild.is_empty() {
            return;
        }
        let targets: SmallVec<[(QueryId, u8); 8]> = exact.iter().chain(wild.iter()).copied().collect();
        let mut rows: Vec<Box<[TermId]>> = Vec::new();
        for (qid, ci) in targets {
            let query = self.slots[qid as usize].as_mut().unwrap();
            let clause = &query.clauses[ci as usize];
            let mut bindings = Bindings::new(query.nvars);
            let Some(mark) = bindings.bind(clause, terms, 0) else { continue };
            rows.clear();
            let walk = Walk { store, query, plan: &query.delta_plans[ci as usize], exclude: fid };
            walk.extend(0, &mut bindings, &mut |row| rows.push(row.into()));
            bindings.rollback(mark);
            if rows.is_empty() {
                continue;
            }
            if !query.results.is_dirty() {
                self.dirty.push(qid);
            }
            for row in &rows {
                query.results.apply(row, delta);
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
            let live: Vec<(Box<[TermId]>, i32)> = query.results.rows().map(|(_, row, w)| (row.into(), w)).collect();
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
