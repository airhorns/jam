//! The packed `u32` encodings that cross the WASM boundary. A transaction is one
//! array of ops; the engine answers with one array of events. `packages/engine`
//! mirrors these constants.

/// `ASSERT owner scope len t…` — hold a fact under `owner` (scope `NONE` = inherit).
pub const OP_ASSERT: u32 = 1;
/// `REPLACE owner scope len t…` — drop every fact sharing the prefix `t[..len-1]`, then assert.
pub const OP_REPLACE: u32 = 2;
/// `DROP len t…` — remove matching facts regardless of owners; `t` may contain `WILD`.
pub const OP_DROP: u32 = 3;
/// `REVOKE owner` — revoke an owner subtree.
pub const OP_REVOKE: u32 = 4;
/// `SET_SCOPE scope len t…` — re-tag a fact's scope without notifying.
pub const OP_SET_SCOPE: u32 = 5;
/// `CLEAR` — remove every fact and non-root owner.
pub const OP_CLEAR: u32 = 6;

/// `FACT flags scope len t…`
pub const EV_FACT: u32 = 1;
/// `QUERY qid nvars nrows (rowid flag [vals…])…` — `flag` 1 means the row appeared (values follow), 0 that it left.
pub const EV_QUERY: u32 = 2;

pub const FACT_ADDED: u32 = 1;
pub const FACT_DURABLE: u32 = 2;
pub const FACT_REPLACE: u32 = 4;
/// The fact already existed and the root owner just attached to it.
pub const FACT_EXISTING: u32 = 8;

/// No fact events.
pub const FACT_EVENTS_NONE: u32 = 0;
/// Only events carrying `FACT_DURABLE`.
pub const FACT_EVENTS_DURABLE: u32 = 1;
pub const FACT_EVENTS_ALL: u32 = 2;

pub struct Reader<'a> {
    data: &'a [u32],
    pos: usize,
}

impl<'a> Reader<'a> {
    pub fn new(data: &'a [u32]) -> Self {
        Reader { data, pos: 0 }
    }

    pub fn done(&self) -> bool {
        self.pos >= self.data.len()
    }

    pub fn u32(&mut self) -> Result<u32, String> {
        let v = *self.data.get(self.pos).ok_or_else(|| format!("truncated at {}", self.pos))?;
        self.pos += 1;
        Ok(v)
    }

    pub fn slice(&mut self, len: usize) -> Result<&'a [u32], String> {
        let end = self.pos + len;
        if end > self.data.len() {
            return Err(format!("truncated slice at {} (len {len})", self.pos));
        }
        let s = &self.data[self.pos..end];
        self.pos = end;
        Ok(s)
    }

    /// A `len t…` sequence.
    pub fn terms(&mut self) -> Result<&'a [u32], String> {
        let len = self.u32()? as usize;
        if len == 0 || len > 32 {
            return Err(format!("bad fact length {len}"));
        }
        self.slice(len)
    }
}
