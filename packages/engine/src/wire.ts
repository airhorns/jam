// Mirrors crates/jam-engine/src/wire.rs and term.rs.

export const OP_ASSERT = 1;
export const OP_REPLACE = 2;
export const OP_DROP = 3;
export const OP_REVOKE = 4;
export const OP_SET_SCOPE = 5;
export const OP_CLEAR = 6;

export const EV_FACT = 1;
export const EV_QUERY = 2;
export const EV_FREE = 3;

export const FACT_ADDED = 1;
export const FACT_DURABLE = 2;
export const FACT_REPLACE = 4;
export const FACT_EXISTING = 8;

export const FACT_EVENTS_NONE = 0;
export const FACT_EVENTS_DURABLE = 1;
export const FACT_EVENTS_ALL = 2;

export const STAT_FACTS = 0;
export const STAT_FACT_SLOTS = 1;
export const STAT_TERMS = 2;
export const STAT_TERM_SLOTS = 3;
export const STAT_OWNERS = 4;
export const STAT_INDEXES = 5;
export const STAT_INDEX_BUCKETS = 6;
export const STAT_QUERIES = 7;
export const STAT_RESULT_ROWS = 8;
export const STAT_ROUTES = 9;
export const STAT_PENDING_EVENTS = 10;
export const STAT_LEN = 11;

export const FALSE_ID = 0;
export const TRUE_ID = 1;
export const GLOBAL_SCOPE_ID = 2;
export const VAR_BASE = 0xf0000000;
export const WILD = 0xfffffffe;
export const NONE = 0xffffffff;
export const ROOT_OWNER = 0;
