//! An incremental fact store for jam. See `docs/rust-engine-spec.md`.

pub mod engine;
pub mod owner;
pub mod query;
pub mod store;
pub mod term;
pub mod wire;

pub use engine::Engine;
pub use query::{Clause, QueryId, RowId};
pub use store::{FactId, OwnerId, ROOT_OWNER};
pub use term::{Interner, Term, TermId, EMPTY, FALSE, NONE, TRUE, VAR_BASE, WILD};

#[cfg(test)]
mod tests;
