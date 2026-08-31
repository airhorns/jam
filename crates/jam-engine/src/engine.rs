//! The engine ties the pieces together: it applies a transaction of packed ops
//! to the store, keeps owners and scopes consistent, propagates every change
//! through the registered queries and reports what changed as packed events.

use hashbrown::HashMap;

use crate::owner::Owners;
use crate::query::{Clause, Queries, QueryId, Row, adhoc, evaluate, row_order};
use crate::store::{FactId, Mask, OwnerId, ROOT_OWNER, Store, Terms, scan_mask};
use crate::term::{EMPTY, Interner, NONE, TermId, VAR_BASE, WILD};
use crate::wire::*;

struct EntityScope {
    scope: TermId,
    count: u32,
}

/// The engine's size at one moment, for devtools and tests.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Stats {
    /// Live facts.
    pub facts: usize,
    /// Fact slots allocated so far, live or free.
    pub fact_slots: usize,
    /// Terms some fact or query uses, plus any interned since the last two drains.
    pub terms: usize,
    /// Term ids handed out so far, including freed ones awaiting reuse.
    pub term_slots: usize,
    /// Live owners, the root included.
    pub owners: usize,
    /// Secondary indexes built for query clauses.
    pub indexes: usize,
    /// Distinct prefixes in the primary table plus the buckets of every index.
    pub index_buckets: usize,
    /// Registered queries.
    pub queries: usize,
    /// Live result rows across every registered query.
    pub result_rows: usize,
    /// Clauses a changed fact may be checked against, over every route key.
    pub routes: usize,
    /// Event words waiting for the next drain.
    pub pending_events: usize,
}

impl Stats {
    /// The stats as one array, laid out by the `STAT_*` positions.
    pub fn pack(&self) -> [u32; STAT_LEN] {
        let mut words = [0; STAT_LEN];
        words[STAT_FACTS] = self.facts as u32;
        words[STAT_FACT_SLOTS] = self.fact_slots as u32;
        words[STAT_TERMS] = self.terms as u32;
        words[STAT_TERM_SLOTS] = self.term_slots as u32;
        words[STAT_OWNERS] = self.owners as u32;
        words[STAT_INDEXES] = self.indexes as u32;
        words[STAT_INDEX_BUCKETS] = self.index_buckets as u32;
        words[STAT_QUERIES] = self.queries as u32;
        words[STAT_RESULT_ROWS] = self.result_rows as u32;
        words[STAT_ROUTES] = self.routes as u32;
        words[STAT_PENDING_EVENTS] = self.pending_events as u32;
        words
    }
}

pub struct Engine {
    pub interner: Interner,
    store: Store,
    queries: Queries,
    owners: Owners,
    /// Scope of the first non-global fact per `(t0, t1)`, with the count of that entity's non-global facts.
    entity_scopes: HashMap<(TermId, TermId), EntityScope>,
    fact_events: u32,
    events: Vec<u32>,
}

impl Default for Engine {
    fn default() -> Self {
        Engine::new()
    }
}

impl Engine {
    pub fn new() -> Self {
        Engine {
            interner: Interner::new(),
            store: Store::new(),
            queries: Queries::new(),
            owners: Owners::new(),
            entity_scopes: HashMap::new(),
            fact_events: FACT_EVENTS_DURABLE,
            events: Vec::new(),
        }
    }

    pub fn set_fact_events(&mut self, level: u32) {
        self.fact_events = level;
    }

    pub fn fact_count(&self) -> usize {
        self.store.len()
    }

    pub fn index_count(&self) -> usize {
        self.store.index_count()
    }

    pub fn query_count(&self) -> usize {
        self.queries.len()
    }

    pub fn stats(&self) -> Stats {
        Stats {
            facts: self.store.len(),
            fact_slots: self.store.slot_count(),
            terms: self.interner.len(),
            term_slots: self.interner.capacity(),
            owners: self.owners.len(),
            indexes: self.store.index_count(),
            index_buckets: self.store.bucket_count(),
            queries: self.queries.len(),
            result_rows: self.queries.result_rows(),
            routes: self.queries.route_count(),
            pending_events: self.events.len(),
        }
    }

    pub fn create_owner(&mut self, parent: OwnerId) -> Option<OwnerId> {
        self.owners.create(parent)
    }

    pub fn owner_exists(&self, owner: OwnerId) -> bool {
        self.owners.exists(owner)
    }

    // --- transactions ---

    /// Run a packed transaction. Fact events accumulate until `drain`.
    pub fn apply(&mut self, ops: &[u32]) -> Result<(), String> {
        let mut r = Reader::new(ops);
        while !r.done() {
            match r.u32()? {
                OP_ASSERT => {
                    let owner = r.u32()?;
                    let scope = self.check_scope(r.u32()?)?;
                    let terms = self.check_terms(r.terms()?)?;
                    self.assert(owner, scope, terms, None, false);
                }
                OP_REPLACE => {
                    let owner = r.u32()?;
                    let scope = self.check_scope(r.u32()?)?;
                    let terms = self.check_terms(r.terms()?)?;
                    self.replace(owner, scope, terms);
                }
                OP_DROP => {
                    let terms = self.check_terms(r.terms()?)?;
                    self.drop(terms);
                }
                OP_REVOKE => {
                    let owner = r.u32()?;
                    self.revoke(owner);
                }
                OP_SET_SCOPE => {
                    let scope = self.check_scope(r.u32()?)?;
                    let terms = self.check_terms(r.terms()?)?;
                    self.set_scope(scope, terms);
                }
                OP_CLEAR => self.clear(),
                op => return Err(format!("unknown op {op}")),
            }
        }
        Ok(())
    }

    /// The term ids freed since the previous drain, then the fact events since the last drain and
    /// the delta of every query that changed. Freed ids come first because a listener handling a
    /// later event may intern a term and be handed one of them back.
    pub fn drain(&mut self) -> Vec<u32> {
        let freed = self.interner.collect();
        let mut out = if freed.is_empty() {
            std::mem::take(&mut self.events)
        } else {
            let mut out = Vec::with_capacity(freed.len() + 2 + self.events.len());
            out.push(EV_FREE);
            out.push(freed.len() as u32);
            out.extend_from_slice(&freed);
            out.append(&mut self.events);
            out
        };
        let store = &self.store;
        for qid in self.queries.take_dirty() {
            let Some(query) = self.queries.get_mut(qid) else {
                continue;
            };
            if !query.results.is_dirty() {
                continue;
            }
            let header = out.len();
            out.extend_from_slice(&[EV_QUERY, qid, query.nvars as u32, 0]);
            let mut n = 0u32;
            let clauses = &query.clauses;
            query.results.drain(|id, row, before, after| {
                let (was, is) = (before > 0, after > 0);
                if was == is {
                    return;
                }
                n += 1;
                out.push(id);
                if is {
                    out.push(1);
                    out.extend_from_slice(row);
                    push_order(&mut out, row_order(store, clauses, row));
                } else {
                    out.push(0);
                }
            });
            if n == 0 {
                out.truncate(header);
            } else {
                out[header + 3] = n;
            }
        }
        out
    }

    pub fn assert(
        &mut self,
        owner: OwnerId,
        scope: TermId,
        terms: &[TermId],
        inherited: Option<TermId>,
        replace: bool,
    ) {
        if !self.owners.exists(owner) {
            return;
        }
        let replace_flag = if replace { FACT_REPLACE } else { 0 };
        let scope = self.resolve_scope(terms, scope, inherited);
        let (fid, inserted) = self.store.intern(terms, scope, owner);
        if !inserted {
            let record = self.store.get_mut(fid);
            let had_root = record.owners.contains(&ROOT_OWNER);
            if !record.owners.contains(&owner) {
                record.owners.push(owner);
                self.owners.attach(owner, fid);
            }
            if owner == ROOT_OWNER && !had_root {
                let scope = record.scope;
                self.emit_fact(FACT_ADDED | FACT_DURABLE | FACT_EXISTING | replace_flag, scope, terms);
            }
            return;
        }
        self.owners.attach(owner, fid);
        self.retain_terms(terms, scope);
        self.record_entity_scope(terms, scope);
        self.queries.propagate(&self.store, fid, terms, 1);
        let durable = if owner == ROOT_OWNER { FACT_DURABLE } else { 0 };
        self.emit_fact(FACT_ADDED | durable | replace_flag, scope, terms);
    }

    fn remove_fact(&mut self, fid: FactId) {
        self.queries.propagate(&self.store, fid, &self.store.get(fid).terms, -1);
        let record = self.store.remove(fid);
        for &owner in &record.owners {
            self.owners.detach(owner, fid);
        }
        self.release_terms(&record.terms, record.scope);
        self.forget_entity_scope(&record.terms, record.scope);
        let flag = if record.owners.contains(&ROOT_OWNER) { FACT_DURABLE } else { 0 };
        self.emit_fact(flag, record.scope, &record.terms);
    }

    /// Fact ids matching a pattern of literals and `WILD`s, via the scan index over its literals.
    fn matching(&mut self, pattern: &[u32]) -> Vec<FactId> {
        let mask = scan_mask(pattern.len(), literal_mask(pattern));
        let tuple: Vec<TermId> = pattern
            .iter()
            .enumerate()
            .filter(|&(i, _)| mask & (1 << i) != 0)
            .map(|(_, &p)| p)
            .collect();
        self.store.ensure_index(pattern.len(), mask);
        let store = &self.store;
        store
            .lookup(pattern.len(), mask, &tuple)
            .filter(|&fid| {
                let terms = &store.get(fid).terms;
                pattern.iter().enumerate().all(|(i, &p)| p == WILD || is_var(p) || terms[i] == p)
            })
            .collect()
    }

    pub fn drop(&mut self, pattern: &[u32]) {
        if !pattern.iter().any(|&p| p == WILD || is_var(p)) {
            if let Some(fid) = self.store.find(pattern) {
                self.remove_fact(fid);
            }
            return;
        }
        for fid in self.matching(pattern) {
            self.remove_fact(fid);
        }
    }

    pub fn replace(&mut self, owner: OwnerId, scope: TermId, terms: &[TermId]) {
        if terms.len() < 2 {
            self.assert(owner, scope, terms, None, true);
            return;
        }
        let mut pattern: Vec<u32> = terms.to_vec();
        *pattern.last_mut().unwrap() = WILD;
        let mut inherited = None;
        for fid in self.matching(&pattern) {
            let record = self.store.get(fid);
            if &record.terms[..] == terms {
                continue;
            }
            inherited.get_or_insert(record.scope);
            self.remove_fact(fid);
        }
        self.assert(owner, scope, terms, inherited, true);
    }

    pub fn revoke(&mut self, owner: OwnerId) {
        for (owner, fid) in self.owners.revoke(owner) {
            let record = self.store.get_mut(fid);
            record.owners.retain(|o| *o != owner);
            if record.owners.is_empty() {
                self.remove_fact(fid);
            }
        }
    }

    pub fn set_scope(&mut self, scope: TermId, terms: &[TermId]) {
        let Some(fid) = self.store.find(terms) else {
            return;
        };
        let previous = self.store.get(fid).scope;
        if previous == scope {
            return;
        }
        self.forget_entity_scope(terms, previous);
        self.store.get_mut(fid).scope = scope;
        self.interner.retain(scope);
        self.interner.release(previous);
        self.record_entity_scope(terms, scope);
    }

    pub fn clear(&mut self) {
        if self.fact_events == FACT_EVENTS_ALL {
            let all: Vec<(TermId, Terms)> = self.store.iter().map(|(_, r)| (r.scope, r.terms.clone())).collect();
            for (scope, terms) in all {
                self.emit_fact(0, scope, &terms);
            }
        }
        for (_, record) in self.store.iter() {
            for &t in &record.terms {
                self.interner.release(t);
            }
            self.interner.release(record.scope);
        }
        self.store.clear();
        self.owners.reset();
        self.entity_scopes.clear();
        self.queries.clear_results();
    }

    // --- terms ---

    /// Every literal position must name a live term; variables and `WILD` pass through.
    fn check_terms<'t>(&self, terms: &'t [u32]) -> Result<&'t [u32], String> {
        match terms.iter().find(|&&t| t < VAR_BASE && !self.interner.is_live(t)) {
            Some(t) => Err(format!("unknown term id {t}")),
            None => Ok(terms),
        }
    }

    fn check_scope(&self, scope: u32) -> Result<TermId, String> {
        if scope == NONE || self.interner.is_live(scope) {
            Ok(scope)
        } else {
            Err(format!("unknown scope id {scope}"))
        }
    }

    fn retain_terms(&mut self, terms: &[TermId], scope: TermId) {
        for &t in terms {
            self.interner.retain(t);
        }
        self.interner.retain(scope);
    }

    fn release_terms(&mut self, terms: &[TermId], scope: TermId) {
        for &t in terms {
            self.interner.release(t);
        }
        self.interner.release(scope);
    }

    // --- scopes ---

    fn resolve_scope(&self, terms: &[TermId], explicit: TermId, inherited: Option<TermId>) -> TermId {
        if explicit != NONE {
            return explicit;
        }
        if let Some(scope) = inherited {
            return scope;
        }
        if terms.len() >= 2 && !self.entity_scopes.is_empty() {
            return self.entity_scopes.get(&(terms[0], terms[1])).map_or(EMPTY, |e| e.scope);
        }
        EMPTY
    }

    fn record_entity_scope(&mut self, terms: &[TermId], scope: TermId) {
        if scope == EMPTY || terms.len() < 2 {
            return;
        }
        self.entity_scopes
            .entry((terms[0], terms[1]))
            .and_modify(|e| e.count += 1)
            .or_insert(EntityScope { scope, count: 1 });
    }

    fn forget_entity_scope(&mut self, terms: &[TermId], scope: TermId) {
        if scope == EMPTY || terms.len() < 2 {
            return;
        }
        if let Some(entry) = self.entity_scopes.get_mut(&(terms[0], terms[1])) {
            entry.count -= 1;
            if entry.count == 0 {
                self.entity_scopes.remove(&(terms[0], terms[1]));
            }
        }
    }

    pub fn scope_of(&self, terms: &[TermId]) -> Option<TermId> {
        self.store.find(terms).map(|fid| self.store.get(fid).scope)
    }

    pub fn has_fact(&self, terms: &[TermId]) -> bool {
        self.store.find(terms).is_some()
    }

    fn emit_fact(&mut self, flags: u32, scope: TermId, terms: &[TermId]) {
        match self.fact_events {
            FACT_EVENTS_NONE => return,
            FACT_EVENTS_DURABLE if flags & FACT_DURABLE == 0 => return,
            _ => {}
        }
        self.events.push(EV_FACT);
        self.events.push(flags);
        self.events.push(scope);
        self.events.push(terms.len() as u32);
        self.events.extend_from_slice(terms);
    }

    // --- queries ---

    /// Register (or share) a maintained query; its literal terms stay interned while it lives.
    pub fn register(&mut self, clauses: Vec<Clause>) -> QueryId {
        let (id, created) = self.queries.register(&mut self.store, clauses);
        if created {
            for t in self.queries.get(id).expect("just registered").clauses.iter().flatten() {
                if *t < VAR_BASE {
                    self.interner.retain(*t);
                }
            }
        }
        id
    }

    /// Drop one reference to a query; true when that removed it.
    pub fn release(&mut self, id: QueryId) -> bool {
        let Some(clauses) = self.queries.release(id) else {
            return false;
        };
        for t in clauses.iter().flatten() {
            if *t < VAR_BASE {
                self.interner.release(*t);
            }
        }
        true
    }

    /// Current rows of a registered query: `nvars nrows (rowid vals… order_hi order_lo)…`.
    pub fn rows(&self, id: QueryId) -> Vec<u32> {
        let Some(query) = self.queries.get(id) else {
            return vec![0, 0];
        };
        let mut out = vec![query.nvars as u32, 0];
        let mut n = 0u32;
        for (rid, row, _) in query.results.rows() {
            n += 1;
            out.push(rid);
            out.extend_from_slice(row);
            push_order(&mut out, row_order(&self.store, &query.clauses, row));
        }
        out[1] = n;
        out
    }

    /// One-off evaluation: `nvars nrows (vals…)…`, each distinct binding tuple once, in result order.
    pub fn query(&mut self, clauses: Vec<Clause>) -> Vec<u32> {
        let mut query = adhoc(&mut self.store, clauses);
        let mut rows: Vec<(u64, Row)> = Vec::new();
        let (store, clauses) = (&self.store, query.clauses.clone());
        evaluate(store, &mut query, &mut |row| rows.push((row_order(store, &clauses, row), row.into())));
        rows.sort_unstable();
        rows.dedup();
        let mut out = vec![query.nvars as u32, rows.len() as u32];
        for (_, row) in &rows {
            out.extend_from_slice(row);
        }
        out
    }

    /// Facts, optionally restricted to a scope and/or a pattern of literals and wildcards: `n (scope len t…)…`.
    pub fn facts(&mut self, scope: TermId, pattern: &[u32]) -> Vec<u32> {
        let ids: Vec<FactId> = if pattern.is_empty() {
            self.store.iter().map(|(id, _)| id).collect()
        } else {
            self.matching(pattern)
        };
        let mut out = vec![0u32];
        let mut n = 0u32;
        for fid in ids {
            let record = self.store.get(fid);
            if scope != NONE && record.scope != scope {
                continue;
            }
            n += 1;
            out.push(record.scope);
            out.push(record.terms.len() as u32);
            out.extend_from_slice(&record.terms);
        }
        out[0] = n;
        out
    }
}

#[inline]
fn is_var(t: u32) -> bool {
    (VAR_BASE..WILD).contains(&t)
}

fn push_order(out: &mut Vec<u32>, order: u64) {
    out.push((order >> 32) as u32);
    out.push(order as u32);
}

fn literal_mask(pattern: &[u32]) -> Mask {
    pattern
        .iter()
        .enumerate()
        .fold(0, |m, (i, &p)| if p != WILD && !is_var(p) { m | (1 << i) } else { m })
}
