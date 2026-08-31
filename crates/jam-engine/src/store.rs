//! The fact table plus its self-tuning indexes. Facts are tuples of `TermId`;
//! an index is keyed by (tuple length, bitmask of positions) and created the
//! first time something needs to look facts up by that combination, so the set
//! of indexes tracks the access patterns the registered queries actually use.

use hashbrown::HashMap;
use indexmap::IndexSet;
use smallvec::SmallVec;

use crate::term::TermId;

pub type FactId = u32;
pub type OwnerId = u32;
pub const ROOT_OWNER: OwnerId = 0;

/// Bitmask over tuple positions; bit i set means position i is part of the key.
pub type Mask = u32;

pub struct FactRecord {
    pub terms: Box<[TermId]>,
    pub scope: TermId,
    pub owners: SmallVec<[OwnerId; 2]>,
    /// Assertion order across the engine's lifetime; never reused, so it orders query results.
    pub seq: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct IndexKey {
    pub len: u8,
    pub mask: Mask,
}

pub type IndexTuple = SmallVec<[TermId; 4]>;

enum Bucket {
    Small(SmallVec<[FactId; 4]>),
    Large(IndexSet<FactId>),
}

const PROMOTE_AT: usize = 16;

impl Bucket {
    fn insert(&mut self, id: FactId) {
        match self {
            Bucket::Small(v) => {
                if v.len() < PROMOTE_AT {
                    v.push(id);
                } else {
                    let mut set: IndexSet<FactId> = v.drain(..).collect();
                    set.insert(id);
                    *self = Bucket::Large(set);
                }
            }
            Bucket::Large(s) => {
                s.insert(id);
            }
        }
    }

    fn remove(&mut self, id: FactId) -> bool {
        match self {
            Bucket::Small(v) => {
                if let Some(i) = v.iter().position(|&x| x == id) {
                    v.swap_remove(i);
                }
                v.is_empty()
            }
            Bucket::Large(s) => {
                s.swap_remove(&id);
                s.is_empty()
            }
        }
    }

    fn iter(&self) -> BucketIter<'_> {
        match self {
            Bucket::Small(v) => BucketIter::Small(v.iter()),
            Bucket::Large(s) => BucketIter::Large(s.iter()),
        }
    }

    fn len(&self) -> usize {
        match self {
            Bucket::Small(v) => v.len(),
            Bucket::Large(s) => s.len(),
        }
    }
}

pub enum BucketIter<'a> {
    Empty,
    Small(std::slice::Iter<'a, FactId>),
    Large(indexmap::set::Iter<'a, FactId>),
}

impl Iterator for BucketIter<'_> {
    type Item = FactId;
    #[inline]
    fn next(&mut self) -> Option<FactId> {
        match self {
            BucketIter::Empty => None,
            BucketIter::Small(i) => i.next().copied(),
            BucketIter::Large(i) => i.next().copied(),
        }
    }
}

struct Index {
    positions: SmallVec<[u8; 8]>,
    buckets: HashMap<IndexTuple, Bucket>,
}

impl Index {
    fn tuple(&self, terms: &[TermId]) -> IndexTuple {
        self.positions.iter().map(|&p| terms[p as usize]).collect()
    }
}

pub fn positions_of(mask: Mask) -> SmallVec<[u8; 8]> {
    (0..32u8).filter(|p| mask & (1 << p) != 0).collect()
}

#[derive(Default)]
pub struct Store {
    slots: Vec<Option<FactRecord>>,
    free: Vec<FactId>,
    by_key: HashMap<Box<[TermId]>, FactId>,
    indexes: HashMap<IndexKey, Index>,
    /// Indexes grouped by tuple length so inserts only touch the relevant ones.
    by_len: Vec<Vec<IndexKey>>,
    next_seq: u64,
}

impl Store {
    pub fn new() -> Self {
        Store::default()
    }

    pub fn len(&self) -> usize {
        self.by_key.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_key.is_empty()
    }

    #[inline]
    pub fn get(&self, id: FactId) -> &FactRecord {
        self.slots[id as usize].as_ref().expect("live fact")
    }

    #[inline]
    pub fn get_mut(&mut self, id: FactId) -> &mut FactRecord {
        self.slots[id as usize].as_mut().expect("live fact")
    }

    pub fn find(&self, terms: &[TermId]) -> Option<FactId> {
        self.by_key.get(terms).copied()
    }

    #[inline]
    pub fn is_live(&self, id: FactId) -> bool {
        self.slots.get(id as usize).is_some_and(Option::is_some)
    }

    pub fn iter(&self) -> impl Iterator<Item = (FactId, &FactRecord)> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(i, slot)| slot.as_ref().map(|r| (i as FactId, r)))
    }

    /// Store a fact that is not present yet and index it.
    pub fn insert(&mut self, terms: Box<[TermId]>, scope: TermId, owner: OwnerId) -> FactId {
        debug_assert!(self.find(&terms).is_none());
        let id = match self.free.pop() {
            Some(id) => id,
            None => {
                self.slots.push(None);
                (self.slots.len() - 1) as FactId
            }
        };
        self.ensure_len_index(terms.len());
        for key in &self.by_len[terms.len()] {
            let index = self.indexes.get_mut(key).unwrap();
            let tuple = index.tuple(&terms);
            index.buckets.entry(tuple).or_insert_with(|| Bucket::Small(SmallVec::new())).insert(id);
        }
        self.by_key.insert(terms.clone(), id);
        let mut owners = SmallVec::new();
        owners.push(owner);
        let seq = self.next_seq;
        self.next_seq += 1;
        self.slots[id as usize] = Some(FactRecord { terms, scope, owners, seq });
        id
    }

    pub fn remove(&mut self, id: FactId) -> FactRecord {
        let record = self.slots[id as usize].take().expect("live fact");
        self.by_key.remove(&record.terms);
        for key in &self.by_len[record.terms.len()] {
            let index = self.indexes.get_mut(key).unwrap();
            let tuple = index.tuple(&record.terms);
            if let Some(bucket) = index.buckets.get_mut(&tuple)
                && bucket.remove(id)
            {
                index.buckets.remove(&tuple);
            }
        }
        self.free.push(id);
        record
    }

    fn ensure_len_index(&mut self, len: usize) {
        while self.by_len.len() <= len {
            self.by_len.push(Vec::new());
        }
        if self.by_len[len].is_empty() {
            self.create_index(IndexKey { len: len as u8, mask: 0 });
        }
    }

    /// Make sure facts of length `len` can be looked up by the positions in `mask`.
    pub fn ensure_index(&mut self, len: usize, mask: Mask) {
        let key = IndexKey { len: len as u8, mask };
        self.ensure_len_index(len);
        if !self.indexes.contains_key(&key) {
            self.create_index(key);
        }
    }

    fn create_index(&mut self, key: IndexKey) {
        let mut index = Index { positions: positions_of(key.mask), buckets: HashMap::new() };
        for (id, record) in self.iter() {
            if record.terms.len() == key.len as usize {
                let tuple = index.tuple(&record.terms);
                index.buckets.entry(tuple).or_insert_with(|| Bucket::Small(SmallVec::new())).insert(id);
            }
        }
        self.indexes.insert(key, index);
        self.by_len[key.len as usize].push(key);
    }

    /// Facts of length `len` whose `mask` positions equal `tuple`; the index must exist.
    #[inline]
    pub fn lookup(&self, len: usize, mask: Mask, tuple: &[TermId]) -> BucketIter<'_> {
        let index = match self.indexes.get(&IndexKey { len: len as u8, mask }) {
            Some(index) => index,
            None => return BucketIter::Empty,
        };
        match index.buckets.get(tuple) {
            Some(bucket) => bucket.iter(),
            None => BucketIter::Empty,
        }
    }

    pub fn bucket_size(&self, len: usize, mask: Mask, tuple: &[TermId]) -> usize {
        self.indexes
            .get(&IndexKey { len: len as u8, mask })
            .and_then(|index| index.buckets.get(tuple))
            .map_or(0, Bucket::len)
    }

    pub fn has_index(&self, len: usize, mask: Mask) -> bool {
        self.indexes.contains_key(&IndexKey { len: len as u8, mask })
    }

    pub fn index_count(&self) -> usize {
        self.indexes.len()
    }

    pub fn clear(&mut self) {
        self.slots.clear();
        self.free.clear();
        self.by_key.clear();
        for index in self.indexes.values_mut() {
            index.buckets.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(terms: &[TermId]) -> Box<[TermId]> {
        terms.into()
    }

    #[test]
    fn indexes_follow_lookups() {
        let mut store = Store::new();
        let a = store.insert(fact(&[10, 20, 30]), 2, ROOT_OWNER);
        let b = store.insert(fact(&[10, 21, 30]), 2, ROOT_OWNER);
        let _c = store.insert(fact(&[10, 20]), 2, ROOT_OWNER);
        assert_eq!(store.len(), 3);
        store.ensure_index(3, 0b001);
        let mut hits: Vec<_> = store.lookup(3, 0b001, &[10]).collect();
        hits.sort();
        assert_eq!(hits, vec![a, b]);
        store.ensure_index(3, 0b101);
        assert_eq!(store.lookup(3, 0b101, &[10, 30]).count(), 2);
        assert_eq!(store.lookup(3, 0b101, &[10, 31]).count(), 0);
        store.remove(a);
        assert_eq!(store.lookup(3, 0b101, &[10, 30]).collect::<Vec<_>>(), vec![b]);
        assert_eq!(store.find(&[10, 20, 30]), None);
        assert_eq!(store.find(&[10, 21, 30]), Some(b));
        // Full scan of a length uses the always-present empty mask.
        assert_eq!(store.lookup(2, 0, &[]).count(), 1);
    }

    #[test]
    fn buckets_promote_and_shrink() {
        let mut store = Store::new();
        store.ensure_index(2, 0b01);
        let ids: Vec<_> = (0..40).map(|i| store.insert(fact(&[7, 100 + i]), 2, ROOT_OWNER)).collect();
        assert_eq!(store.lookup(2, 0b01, &[7]).count(), 40);
        for id in &ids[..39] {
            store.remove(*id);
        }
        assert_eq!(store.lookup(2, 0b01, &[7]).collect::<Vec<_>>(), vec![ids[39]]);
        store.remove(ids[39]);
        assert_eq!(store.lookup(2, 0b01, &[7]).count(), 0);
        let reused = store.insert(fact(&[7, 1]), 2, ROOT_OWNER);
        assert!(ids.contains(&reused));
    }
}
