//! `wasm-bindgen` surface over `jam_engine::Engine`. Everything crosses the
//! boundary as `u32` arrays in the encodings described in `jam_engine::wire`;
//! `packages/engine` owns the term mirror and the typed API.

use jam_engine::term::Term;
use jam_engine::{Clause, Engine, NONE};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct JamEngine {
    inner: Engine,
}

fn unpack_clauses(packed: &[u32]) -> Result<Vec<Clause>, JsError> {
    let mut clauses = Vec::new();
    let mut i = 0;
    let n = *packed.first().ok_or_else(|| JsError::new("empty clause list"))? as usize;
    i += 1;
    for _ in 0..n {
        let len = *packed.get(i).ok_or_else(|| JsError::new("truncated clause list"))? as usize;
        i += 1;
        let end = i + len;
        if end > packed.len() {
            return Err(JsError::new("truncated clause"));
        }
        clauses.push(packed[i..end].to_vec());
        i = end;
    }
    Ok(clauses)
}

#[wasm_bindgen]
impl JamEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> JamEngine {
        JamEngine { inner: Engine::new() }
    }

    // --- terms ---

    pub fn intern_str(&mut self, s: &str) -> u32 {
        self.inner.interner.intern_str(s)
    }

    pub fn intern_num(&mut self, n: f64) -> u32 {
        self.inner.interner.intern_num(n)
    }

    /// 0 string, 1 number, 2 boolean, 3 unknown id.
    pub fn term_kind(&self, id: u32) -> u32 {
        match self.inner.interner.get(id) {
            Some(Term::Str(_)) => 0,
            Some(Term::Num(_)) => 1,
            Some(Term::Bool(_)) => 2,
            None => 3,
        }
    }

    pub fn term_str(&self, id: u32) -> Option<String> {
        match self.inner.interner.get(id) {
            Some(Term::Str(s)) => Some(s.to_string()),
            _ => None,
        }
    }

    pub fn term_num(&self, id: u32) -> f64 {
        match self.inner.interner.get(id) {
            Some(Term::Num(n)) => *n,
            Some(Term::Bool(b)) => {
                if *b {
                    1.0
                } else {
                    0.0
                }
            }
            _ => f64::NAN,
        }
    }

    pub fn term_count(&self) -> u32 {
        self.inner.interner.len() as u32
    }

    // --- transactions ---

    pub fn set_fact_events(&mut self, level: u32) {
        self.inner.set_fact_events(level);
    }

    pub fn create_owner(&mut self, parent: u32) -> u32 {
        self.inner.create_owner(parent).unwrap_or(NONE)
    }

    pub fn owner_exists(&self, owner: u32) -> bool {
        self.inner.owner_exists(owner)
    }

    pub fn apply(&mut self, ops: &[u32]) -> Result<(), JsError> {
        self.inner.apply(ops).map_err(|e| JsError::new(&e))
    }

    pub fn drain(&mut self) -> Vec<u32> {
        self.inner.drain()
    }

    // --- queries ---

    pub fn register(&mut self, clauses: &[u32]) -> Result<u32, JsError> {
        Ok(self.inner.register(unpack_clauses(clauses)?))
    }

    pub fn release(&mut self, id: u32) -> bool {
        self.inner.release(id)
    }

    pub fn rows(&self, id: u32) -> Vec<u32> {
        self.inner.rows(id)
    }

    pub fn query(&mut self, clauses: &[u32]) -> Result<Vec<u32>, JsError> {
        Ok(self.inner.query(unpack_clauses(clauses)?))
    }

    pub fn facts(&mut self, scope: u32, pattern: &[u32]) -> Vec<u32> {
        self.inner.facts(scope, pattern)
    }

    pub fn scope_of(&self, terms: &[u32]) -> u32 {
        self.inner.scope_of(terms).unwrap_or(NONE)
    }

    pub fn has_fact(&self, terms: &[u32]) -> bool {
        self.inner.has_fact(terms)
    }

    pub fn fact_count(&self) -> u32 {
        self.inner.fact_count() as u32
    }

    pub fn index_count(&self) -> u32 {
        self.inner.index_count() as u32
    }

    pub fn query_count(&self) -> u32 {
        self.inner.query_count() as u32
    }
}

impl Default for JamEngine {
    fn default() -> Self {
        JamEngine::new()
    }
}
