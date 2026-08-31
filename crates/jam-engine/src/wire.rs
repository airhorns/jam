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
/// `QUERY qid nvars nrows (rowid flag [vals… order_hi order_lo])…` — `flag` 1 means the row
/// appeared (its values and 64-bit result-order key follow), 0 that it left.
pub const EV_QUERY: u32 = 2;
/// `FREE n id…` — term ids no fact or query uses any more; they may be reused from here on.
/// Always the first event of a drain.
pub const EV_FREE: u32 = 3;

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

/// Query specs cross as `n (kind len words…)…`; the kinds and their words:
/// `PATTERN t…` a positive pattern.
pub const CLAUSE_PATTERN: u32 = 0;
/// `NOT t…` — rows for which the pattern has a match are hidden.
pub const CLAUSE_NOT: u32 = 1;
/// `WHERE (lhs op rhs)…` — alternatives; `lhs` is a variable, `rhs` a variable or literal.
pub const CLAUSE_WHERE: u32 = 2;
/// `ORDER var descending` — one sort key; several compose most significant first.
pub const CLAUSE_ORDER: u32 = 3;
/// `OFFSET n`
pub const CLAUSE_OFFSET: u32 = 4;
/// `LIMIT n`
pub const CLAUSE_LIMIT: u32 = 5;
/// `AGGREGATE op input group…` — `input` is `WILD` for count.
pub const CLAUSE_AGGREGATE: u32 = 6;

pub const PRED_EQ: u32 = 0;
pub const PRED_NE: u32 = 1;
pub const PRED_LT: u32 = 2;
pub const PRED_LE: u32 = 3;
pub const PRED_GT: u32 = 4;
pub const PRED_GE: u32 = 5;
pub const PRED_CONTAINS: u32 = 6;
pub const PRED_STARTS_WITH: u32 = 7;
pub const PRED_CONTAINS_CI: u32 = 8;
pub const PRED_STARTS_WITH_CI: u32 = 9;

pub const AGG_COUNT: u32 = 0;
pub const AGG_SUM: u32 = 1;
pub const AGG_MIN: u32 = 2;
pub const AGG_MAX: u32 = 3;

/// Word positions of `Engine::stats()` when packed as one array.
pub const STAT_FACTS: usize = 0;
pub const STAT_FACT_SLOTS: usize = 1;
pub const STAT_TERMS: usize = 2;
pub const STAT_TERM_SLOTS: usize = 3;
pub const STAT_OWNERS: usize = 4;
pub const STAT_INDEXES: usize = 5;
pub const STAT_INDEX_BUCKETS: usize = 6;
pub const STAT_QUERIES: usize = 7;
pub const STAT_RESULT_ROWS: usize = 8;
pub const STAT_ROUTES: usize = 9;
pub const STAT_PENDING_EVENTS: usize = 10;
pub const STAT_LEN: usize = 11;

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

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn reads_words_slices_and_term_lists() {
        let data = [OP_ASSERT, 7, 2, 3, 10, 11, 12, 1, 5];
        let mut r = Reader::new(&data);
        assert!(!r.done());
        assert_eq!(r.u32(), Ok(OP_ASSERT));
        assert_eq!(r.slice(2), Ok(&[7, 2][..]));
        assert_eq!(r.terms(), Ok(&[10, 11, 12][..]));
        assert_eq!(r.terms(), Ok(&[5][..]));
        assert!(r.done());
        assert_eq!(r.u32(), Err("truncated at 9".to_string()));
        assert_eq!(r.slice(1), Err("truncated slice at 9 (len 1)".to_string()));
        assert_eq!(r.slice(0), Ok(&[][..]));
    }

    #[test]
    fn term_lists_must_have_a_sane_length() {
        assert_eq!(Reader::new(&[0]).terms(), Err("bad fact length 0".to_string()));
        assert_eq!(Reader::new(&[33]).terms(), Err("bad fact length 33".to_string()));
        assert_eq!(Reader::new(&[2, 1]).terms(), Err("truncated slice at 1 (len 2)".to_string()));
        assert_eq!(Reader::new(&[]).terms(), Err("truncated at 0".to_string()));
        let full: Vec<u32> = std::iter::once(32).chain(0..32).collect();
        assert_eq!(Reader::new(&full).terms().map(<[u32]>::len), Ok(32));
    }
}
