//! The engine ties the pieces together: it applies a transaction of packed ops
//! to the store, keeps owners and scopes consistent, propagates every change
//! through the registered queries and reports what changed as packed events.

use hashbrown::HashMap;

use crate::owner::Owners;
use crate::query::{adhoc, evaluate, Clause, Queries, QueryId};
use crate::store::{FactId, Mask, OwnerId, Store, ROOT_OWNER};
use crate::term::{Interner, TermId, EMPTY, NONE, VAR_BASE, WILD};
use crate::wire::*;

struct EntityScope {
    scope: TermId,
    count: u32,
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
                    let scope = r.u32()?;
                    let terms = r.terms()?;
                    self.assert(owner, scope, terms, None, false);
                }
                OP_REPLACE => {
                    let owner = r.u32()?;
                    let scope = r.u32()?;
                    let terms = r.terms()?;
                    self.replace(owner, scope, terms);
                }
                OP_DROP => {
                    let terms = r.terms()?;
                    self.drop(terms);
                }
                OP_REVOKE => {
                    let owner = r.u32()?;
                    self.revoke(owner);
                }
                OP_SET_SCOPE => {
                    let scope = r.u32()?;
                    let terms = r.terms()?;
                    self.set_scope(scope, terms);
                }
                OP_CLEAR => self.clear(),
                op => return Err(format!("unknown op {op}")),
            }
        }
        Ok(())
    }

    /// Fact events since the last drain followed by the delta of every query that changed.
    pub fn drain(&mut self) -> Vec<u32> {
        let mut out = std::mem::take(&mut self.events);
        for qid in self.queries.take_dirty() {
            let Some(query) = self.queries.get_mut(qid) else { continue };
            if !query.results.is_dirty() {
                continue;
            }
            let header = out.len();
            out.extend_from_slice(&[EV_QUERY, qid, query.nvars as u32, 0]);
            let mut n = 0u32;
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

    pub fn assert(&mut self, owner: OwnerId, scope: TermId, terms: &[TermId], inherited: Option<TermId>, replace: bool) {
        if !self.owners.exists(owner) {
            return;
        }
        let replace_flag = if replace { FACT_REPLACE } else { 0 };
        if let Some(fid) = self.store.find(terms) {
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
        let scope = self.resolve_scope(terms, scope, inherited);
        let fid = self.store.insert(terms.into(), scope, owner);
        self.owners.attach(owner, fid);
        self.record_entity_scope(terms, scope);
        self.queries.propagate(&self.store, fid, terms, 1);
        let durable = if owner == ROOT_OWNER { FACT_DURABLE } else { 0 };
        self.emit_fact(FACT_ADDED | durable | replace_flag, scope, terms);
    }

    fn remove_fact(&mut self, fid: FactId) {
        let (terms, durable) = {
            let record = self.store.get(fid);
            (record.terms.clone(), record.owners.contains(&ROOT_OWNER))
        };
        self.queries.propagate(&self.store, fid, &terms, -1);
        let record = self.store.remove(fid);
        for &owner in &record.owners {
            self.owners.detach(owner, fid);
        }
        self.forget_entity_scope(&terms, record.scope);
        let flag = if durable { FACT_DURABLE } else { 0 };
        self.emit_fact(flag, record.scope, &terms);
    }

    /// Fact ids matching a pattern of literals and `WILD`s, via the index over the literal positions.
    fn matching(&mut self, pattern: &[u32]) -> Vec<FactId> {
        let mask = literal_mask(pattern);
        let tuple: Vec<TermId> = pattern.iter().filter(|&&p| p != WILD && !is_var(p)).copied().collect();
        self.store.ensure_index(pattern.len(), mask);
        self.store.lookup(pattern.len(), mask, &tuple).collect()
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
            if !self.store.is_live(fid) {
                continue;
            }
            let record = self.store.get_mut(fid);
            record.owners.retain(|o| *o != owner);
            if record.owners.is_empty() {
                self.remove_fact(fid);
            }
        }
    }

    pub fn set_scope(&mut self, scope: TermId, terms: &[TermId]) {
        let Some(fid) = self.store.find(terms) else { return };
        let previous = self.store.get(fid).scope;
        if previous == scope {
            return;
        }
        self.forget_entity_scope(terms, previous);
        self.store.get_mut(fid).scope = scope;
        self.record_entity_scope(terms, scope);
    }

    pub fn clear(&mut self) {
        if self.fact_events == FACT_EVENTS_ALL {
            let all: Vec<(TermId, Box<[TermId]>)> =
                self.store.iter().map(|(_, r)| (r.scope, r.terms.clone())).collect();
            for (scope, terms) in all {
                self.emit_fact(0, scope, &terms);
            }
        }
        self.store.clear();
        self.owners.reset();
        self.entity_scopes.clear();
        self.queries.clear_results();
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

    pub fn register(&mut self, clauses: Vec<Clause>) -> QueryId {
        self.queries.register(&mut self.store, clauses)
    }

    pub fn release(&mut self, id: QueryId) -> bool {
        self.queries.release(id)
    }

    /// Current rows of a registered query: `nvars nrows (rowid vals…)…`.
    pub fn rows(&self, id: QueryId) -> Vec<u32> {
        let Some(query) = self.queries.get(id) else { return vec![0, 0] };
        let mut out = vec![query.nvars as u32, 0];
        let mut n = 0u32;
        for (rid, row, _) in query.results.rows() {
            n += 1;
            out.push(rid);
            out.extend_from_slice(row);
        }
        out[1] = n;
        out
    }

    /// One-off evaluation: `nvars nrows (vals…)…`, rows with multiplicity.
    pub fn query(&mut self, clauses: Vec<Clause>) -> Vec<u32> {
        let query = adhoc(&mut self.store, clauses);
        let mut out = vec![query.nvars as u32, 0];
        let mut n = 0u32;
        evaluate(&self.store, &query, &mut |row| {
            n += 1;
            out.extend_from_slice(row);
        });
        out[1] = n;
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

fn literal_mask(pattern: &[u32]) -> Mask {
    pattern.iter().enumerate().fold(0, |m, (i, &p)| if p != WILD && !is_var(p) { m | (1 << i) } else { m })
}
