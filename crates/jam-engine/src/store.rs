//! The fact table plus its self-tuning indexes. Facts are tuples of `TermId`
//! grouped by every term but their last, which is the shape joins probe by. Other
//! indexes are keyed by (tuple length, bitmask of positions) and created the first
//! time something needs to look facts up by that combination, so the set of indexes
//! tracks the access patterns the registered queries actually use.

use std::hash::{BuildHasher, Hasher};

use hashbrown::{DefaultHashBuilder, HashMap, HashTable};
use indexmap::IndexMap;
use smallvec::SmallVec;

use crate::term::{NONE, TermId};

pub type FactId = u32;
pub type OwnerId = u32;
pub const ROOT_OWNER: OwnerId = 0;

/// Bitmask over tuple positions; bit i set means position i is part of the key.
pub type Mask = u32;

/// A fact's terms, inline for the common lengths.
pub type Terms = SmallVec<[TermId; 4]>;

pub struct FactRecord {
    pub terms: Terms,
    pub scope: TermId,
    pub owners: SmallVec<[OwnerId; 2]>,
    /// Assertion order across the engine's lifetime; never reused, so it orders query results.
    pub seq: u64,
    /// Where this fact sits in each bucket of its length's indexes, in `by_len` order, so removal is O(1).
    positions: SmallVec<[u32; 4]>,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct IndexKey {
    pub len: u8,
    pub mask: Mask,
}

type Slots = [Option<FactRecord>];

fn hash_key(hasher: &DefaultHashBuilder, key: impl IntoIterator<Item = TermId>) -> u64 {
    let mut h = hasher.build_hasher();
    for t in key {
        h.write_u32(t);
    }
    h.finish()
}

/// The primary table's entry: the first fact of a prefix with its last term inline, so probes
/// never touch the records. Further facts with the same prefix live in `Store::rest`, keyed by
/// `fid` and flagged by the low bit of `tag`. Insertion order, except that removal moves the
/// last fact into the hole.
#[derive(Clone, Copy)]
struct Primary {
    /// The top 31 bits of the prefix hash, then the `rest` flag.
    tag: u32,
    fid: FactId,
    last: TermId,
}

const HAS_REST: u32 = 1;

/// Fold a prefix hash to the 31 bits an entry keeps.
fn tag_of(hash: u64) -> u32 {
    (hash >> 32) as u32 & !HAS_REST
}

/// Spread a tag back over 64 bits so hashbrown sees entropy in both the index and control bits.
fn widen(tag: u32) -> u64 {
    u64::from(tag & !HAS_REST).wrapping_mul(0x9E37_79B9_7F4A_7C15)
}

enum Rest {
    Small(Vec<(FactId, TermId)>),
    Large(Box<IndexMap<TermId, FactId>>),
}

const PROMOTE_AT: usize = 8;

impl Rest {
    fn get(&self, last: TermId) -> Option<FactId> {
        match self {
            Rest::Small(v) => v.iter().find(|&&(_, t)| t == last).map(|&(id, _)| id),
            Rest::Large(m) => m.get(&last).copied(),
        }
    }

    fn insert(&mut self, id: FactId, last: TermId) {
        match self {
            Rest::Small(v) if v.len() < PROMOTE_AT => v.push((id, last)),
            Rest::Small(v) => {
                let mut map: IndexMap<TermId, FactId> = v.drain(..).map(|(id, t)| (t, id)).collect();
                map.insert(last, id);
                *self = Rest::Large(Box::new(map));
            }
            Rest::Large(m) => {
                m.insert(last, id);
            }
        }
    }

    fn remove(&mut self, last: TermId) {
        match self {
            Rest::Small(v) => {
                if let Some(i) = v.iter().position(|&(_, t)| t == last) {
                    v.swap_remove(i);
                }
            }
            Rest::Large(m) => {
                m.swap_remove(&last);
            }
        }
    }

    fn pop(&mut self) -> Option<(FactId, TermId)> {
        match self {
            Rest::Small(v) => v.pop(),
            Rest::Large(m) => m.pop().map(|(t, id)| (id, t)),
        }
    }

    fn is_empty(&self) -> bool {
        match self {
            Rest::Small(v) => v.is_empty(),
            Rest::Large(m) => m.is_empty(),
        }
    }

    fn iter(&self) -> RestIter<'_> {
        match self {
            Rest::Small(v) => RestIter::Pairs(v.iter()),
            Rest::Large(m) => RestIter::Map(m.values()),
        }
    }
}

/// Fact ids in insertion order, except that removal moves the last id into the hole. The
/// key is not stored: it is read off the first fact, which the walk is about to visit anyway.
struct Bucket {
    hash: u64,
    ids: SmallVec<[FactId; 4]>,
}

pub struct BucketIter<'a> {
    first: Option<FactId>,
    rest: RestIter<'a>,
}

enum RestIter<'a> {
    Ids(std::slice::Iter<'a, FactId>),
    Pairs(std::slice::Iter<'a, (FactId, TermId)>),
    Map(indexmap::map::Values<'a, TermId, FactId>),
}

impl<'a> BucketIter<'a> {
    fn ids(ids: &'a [FactId]) -> Self {
        BucketIter { first: None, rest: RestIter::Ids(ids.iter()) }
    }
}

impl Iterator for BucketIter<'_> {
    type Item = FactId;

    #[inline]
    fn next(&mut self) -> Option<FactId> {
        if let Some(first) = self.first.take() {
            return Some(first);
        }
        match &mut self.rest {
            RestIter::Ids(i) => i.next().copied(),
            RestIter::Pairs(i) => i.next().map(|&(id, _)| id),
            RestIter::Map(i) => i.next().copied(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let rest = match &self.rest {
            RestIter::Ids(i) => i.len(),
            RestIter::Pairs(i) => i.len(),
            RestIter::Map(i) => i.len(),
        };
        let n = rest + usize::from(self.first.is_some());
        (n, Some(n))
    }
}

impl ExactSizeIterator for BucketIter<'_> {}

struct Index {
    positions: SmallVec<[u8; 8]>,
    buckets: HashTable<Bucket>,
}

impl Index {
    fn hash(&self, hasher: &DefaultHashBuilder, terms: &[TermId]) -> u64 {
        hash_key(hasher, self.positions.iter().map(|&p| terms[p as usize]))
    }

    /// Add `id` to its bucket and return its position there.
    fn insert(&mut self, slots: &Slots, hasher: &DefaultHashBuilder, terms: &[TermId], id: FactId) -> u32 {
        let hash = self.hash(hasher, terms);
        let positions = &self.positions;
        let bucket = self
            .buckets
            .entry(
                hash,
                |b| matches(positions, slots, b.hash, b.ids[0], hash, |_, p| terms[p as usize]),
                |b| b.hash,
            )
            .or_insert_with(|| Bucket { hash, ids: SmallVec::new() })
            .into_mut();
        bucket.ids.push(id);
        (bucket.ids.len() - 1) as u32
    }

    /// The ids whose positions equal `key`, given in position order.
    fn get(&self, slots: &Slots, hasher: &DefaultHashBuilder, key: &[TermId]) -> &[FactId] {
        let hash = hash_key(hasher, key.iter().copied());
        self.buckets
            .find(hash, |b| matches(&self.positions, slots, b.hash, b.ids[0], hash, |n, _| key[n]))
            .map_or(&[], |b| &b.ids[..])
    }
}

/// Whether a bucket holding `first` under `bucket_hash` is the one for the key given as `key(nth, position)`.
fn matches(
    positions: &[u8],
    slots: &Slots,
    bucket_hash: u64,
    first: FactId,
    hash: u64,
    key: impl Fn(usize, u8) -> TermId,
) -> bool {
    bucket_hash == hash && {
        let terms = &slots[first as usize].as_ref().expect("live fact").terms;
        positions.iter().enumerate().all(|(n, &p)| terms[p as usize] == key(n, p))
    }
}

/// Whether `entry` heads the facts whose terms before the last are `prefix`.
fn prefix_matches(slots: &Slots, entry: &Primary, tag: u32, prefix: &[TermId]) -> bool {
    entry.tag & !HAS_REST == tag && {
        let terms = &slots[entry.fid as usize].as_ref().expect("live fact").terms;
        split(terms).0 == prefix
    }
}

pub fn positions_of(mask: Mask) -> SmallVec<[u8; 8]> {
    (0..32u8).filter(|p| mask & (1 << p) != 0).collect()
}

/// Every position but the last: the key the primary table groups facts of length `len` by.
fn prefix_mask(len: usize) -> Mask {
    (1u64 << len.saturating_sub(1)) as Mask - 1
}

/// The positions a scan over `mask` is indexed by: its first two, the rest being checked per fact,
/// unless the primary table already serves it. Keeps the set of indexes small, since every index
/// costs each insert a hash table write.
pub fn scan_mask(len: usize, mask: Mask) -> Mask {
    if mask == prefix_mask(len) {
        return mask;
    }
    let mut kept: Mask = 0;
    for p in 0..32 {
        if kept.count_ones() == 2 {
            break;
        }
        kept |= mask & (1 << p);
    }
    kept
}

#[derive(Default)]
pub struct Store {
    slots: Vec<Option<FactRecord>>,
    free: Vec<FactId>,
    count: usize,
    /// Every fact, grouped by all terms but the last.
    primary: HashTable<Primary>,
    /// The facts after the first of each prefix that has more than one, keyed by that first fact.
    rest: HashMap<FactId, Rest>,
    hasher: DefaultHashBuilder,
    indexes: Vec<Index>,
    index_ids: HashMap<IndexKey, usize>,
    /// Indexes grouped by tuple length so inserts only touch the relevant ones.
    by_len: Vec<Vec<usize>>,
    next_seq: u64,
}

fn split(terms: &[TermId]) -> (&[TermId], TermId) {
    terms.split_last().map_or((&[], NONE), |(&last, prefix)| (prefix, last))
}

impl Store {
    pub fn new() -> Self {
        Store::default()
    }

    pub fn len(&self) -> usize {
        self.count
    }

    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    #[inline]
    pub fn get(&self, id: FactId) -> &FactRecord {
        self.slots[id as usize].as_ref().expect("live fact")
    }

    #[inline]
    pub fn get_mut(&mut self, id: FactId) -> &mut FactRecord {
        self.slots[id as usize].as_mut().expect("live fact")
    }

    fn prefix_entry(&self, prefix: &[TermId]) -> Option<&Primary> {
        let tag = tag_of(hash_key(&self.hasher, prefix.iter().copied()));
        self.primary.find(widen(tag), |e| prefix_matches(&self.slots, e, tag, prefix))
    }

    /// The fact ending in `last` among those headed by `entry`.
    fn in_prefix(&self, entry: &Primary, last: TermId) -> Option<FactId> {
        if entry.last == last {
            Some(entry.fid)
        } else if entry.tag & HAS_REST != 0 {
            self.rest[&entry.fid].get(last)
        } else {
            None
        }
    }

    #[inline]
    pub fn find(&self, terms: &[TermId]) -> Option<FactId> {
        let (prefix, last) = split(terms);
        self.in_prefix(self.prefix_entry(prefix)?, last)
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

    /// The id of `terms`, storing and indexing them first when new; the flag says whether they were new.
    pub fn intern(&mut self, terms: &[TermId], scope: TermId, owner: OwnerId) -> (FactId, bool) {
        self.ensure_len(terms.len());
        let (prefix, last) = split(terms);
        let tag = tag_of(hash_key(&self.hasher, prefix.iter().copied()));
        let (slots, rest) = (&self.slots, &self.rest);
        let entry = self
            .primary
            .entry(widen(tag), |e| prefix_matches(slots, e, tag, prefix), |e| widen(e.tag));
        if let hashbrown::hash_table::Entry::Occupied(entry) = &entry {
            let head = entry.get();
            if head.last == last {
                return (head.fid, false);
            }
            if head.tag & HAS_REST != 0
                && let Some(id) = rest[&head.fid].get(last)
            {
                return (id, false);
            }
        }
        let id = match self.free.pop() {
            Some(id) => id,
            None => {
                self.slots.push(None);
                (self.slots.len() - 1) as FactId
            }
        };
        let (slots, hasher) = (&self.slots, &self.hasher);
        let positions = self.by_len[terms.len()]
            .iter()
            .map(|&index| self.indexes[index].insert(slots, hasher, terms, id))
            .collect();
        let mut owners = SmallVec::new();
        owners.push(owner);
        let seq = self.next_seq;
        self.next_seq += 1;
        self.slots[id as usize] = Some(FactRecord { terms: terms.into(), scope, owners, seq, positions });
        self.count += 1;
        match entry {
            hashbrown::hash_table::Entry::Occupied(mut entry) => {
                let head = entry.get_mut();
                if head.tag & HAS_REST != 0 {
                    self.rest.get_mut(&head.fid).expect("rest").insert(id, last);
                } else {
                    head.tag |= HAS_REST;
                    self.rest.insert(head.fid, Rest::Small(vec![(id, last)]));
                }
            }
            hashbrown::hash_table::Entry::Vacant(entry) => {
                entry.insert(Primary { tag, fid: id, last });
            }
        }
        (id, true)
    }

    /// Store a fact that is not present yet and index it.
    pub fn insert(&mut self, terms: &[TermId], scope: TermId, owner: OwnerId) -> FactId {
        let (id, inserted) = self.intern(terms, scope, owner);
        debug_assert!(inserted);
        id
    }

    pub fn remove(&mut self, id: FactId) -> FactRecord {
        let record = self.slots[id as usize].take().expect("live fact");
        let (prefix, last) = split(&record.terms);
        let tag = tag_of(hash_key(&self.hasher, prefix.iter().copied()));
        let rest = &self.rest;
        let heads = |e: &Primary| {
            e.tag & !HAS_REST == tag && (e.fid == id || (e.tag & HAS_REST != 0 && rest[&e.fid].get(last) == Some(id)))
        };
        let Ok(mut entry) = self.primary.find_entry(widen(tag), heads) else {
            unreachable!("stored fact");
        };
        let head = entry.get_mut();
        if head.tag & HAS_REST == 0 {
            entry.remove();
        } else {
            let mut others = self.rest.remove(&head.fid).expect("rest");
            if head.fid == id {
                (head.fid, head.last) = others.pop().expect("non-empty rest");
            } else {
                others.remove(last);
            }
            if others.is_empty() {
                head.tag &= !HAS_REST;
            } else {
                self.rest.insert(head.fid, others);
            }
        }
        for (k, &index) in self.by_len[record.terms.len()].iter().enumerate() {
            let index = &mut self.indexes[index];
            let hash = index.hash(&self.hasher, &record.terms);
            let pos = record.positions[k] as usize;
            let Ok(mut entry) = index.buckets.find_entry(hash, |b| b.ids.get(pos) == Some(&id)) else {
                unreachable!("indexed fact");
            };
            let ids = &mut entry.get_mut().ids;
            ids.swap_remove(pos);
            match ids.get(pos) {
                Some(&moved) => self.slots[moved as usize].as_mut().expect("live fact").positions[k] = pos as u32,
                None if ids.is_empty() => {
                    entry.remove();
                }
                None => {}
            }
        }
        self.free.push(id);
        self.count -= 1;
        record
    }

    fn ensure_len(&mut self, len: usize) {
        while self.by_len.len() <= len {
            self.by_len.push(Vec::new());
        }
    }

    /// Make sure facts of length `len` can be looked up by the positions in `mask`.
    pub fn ensure_index(&mut self, len: usize, mask: Mask) {
        let key = IndexKey { len: len as u8, mask };
        self.ensure_len(len);
        if mask == prefix_mask(len) || self.index_ids.contains_key(&key) {
            return;
        }
        let mut index = Index { positions: positions_of(mask), buckets: HashTable::new() };
        let placed: Vec<(FactId, u32)> = self
            .iter()
            .filter(|(_, record)| record.terms.len() == len)
            .map(|(id, record)| (id, index.insert(&self.slots, &self.hasher, &record.terms, id)))
            .collect();
        for (id, pos) in placed {
            self.slots[id as usize].as_mut().expect("live fact").positions.push(pos);
        }
        self.index_ids.insert(key, self.indexes.len());
        self.by_len[len].push(self.indexes.len());
        self.indexes.push(index);
    }

    /// Facts of length `len` whose `mask` positions equal `tuple`; the index must exist.
    #[inline]
    pub fn lookup(&self, len: usize, mask: Mask, tuple: &[TermId]) -> BucketIter<'_> {
        if mask == prefix_mask(len) {
            return match self.prefix_entry(tuple) {
                Some(head) if head.tag & HAS_REST != 0 => {
                    BucketIter { first: Some(head.fid), rest: self.rest[&head.fid].iter() }
                }
                Some(head) => BucketIter { first: Some(head.fid), rest: RestIter::Ids([].iter()) },
                None => BucketIter::ids(&[]),
            };
        }
        BucketIter::ids(
            self.index_ids
                .get(&IndexKey { len: len as u8, mask })
                .map_or(&[], |&index| self.indexes[index].get(&self.slots, &self.hasher, tuple)),
        )
    }

    pub fn bucket_size(&self, len: usize, mask: Mask, tuple: &[TermId]) -> usize {
        self.lookup(len, mask, tuple).len()
    }

    pub fn has_index(&self, len: usize, mask: Mask) -> bool {
        mask == prefix_mask(len) || self.index_ids.contains_key(&IndexKey { len: len as u8, mask })
    }

    pub fn index_count(&self) -> usize {
        self.indexes.len()
    }

    pub fn clear(&mut self) {
        self.slots.clear();
        self.free.clear();
        self.count = 0;
        self.primary.clear();
        self.rest.clear();
        for index in &mut self.indexes {
            index.buckets.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn indexes_follow_lookups() {
        let mut store = Store::new();
        assert!(store.is_empty());
        let a = store.insert(&[10, 20, 30], 2, ROOT_OWNER);
        let b = store.insert(&[10, 21, 30], 2, ROOT_OWNER);
        let _c = store.insert(&[10, 20], 2, ROOT_OWNER);
        assert_eq!(store.len(), 3);
        assert!(!store.is_empty());
        assert!(!store.has_index(3, 0b001));
        store.ensure_index(3, 0b001);
        assert!(store.has_index(3, 0b001));
        let mut hits: Vec<_> = store.lookup(3, 0b001, &[10]).collect();
        hits.sort();
        assert_eq!(hits, vec![a, b]);
        store.ensure_index(3, 0b101);
        store.ensure_index(3, 0b101);
        assert_eq!(store.index_count(), 2);
        assert_eq!(store.lookup(3, 0b101, &[10, 30]).count(), 2);
        assert_eq!(store.lookup(3, 0b101, &[10, 31]).count(), 0);
        assert!(store.has_index(3, 0b011) && !store.has_index(3, 0b110));
        assert_eq!(store.lookup(3, 0b011, &[10, 20]).count(), 1, "the prefix is always indexed");
        assert_eq!(store.lookup(3, 0b011, &[10, 22]).count(), 0);
        assert_eq!(store.lookup(3, 0b110, &[20, 30]).count(), 0, "a missing index matches nothing");
        assert_eq!(store.lookup(5, 0, &[]).count(), 0, "so does a length nothing was stored at");
        assert_eq!(store.lookup(2, 0, &[]).count(), 0, "a full scan of a length needs its index too");
        store.remove(a);
        assert_eq!(store.lookup(3, 0b101, &[10, 30]).collect::<Vec<_>>(), vec![b]);
        assert_eq!(store.find(&[10, 20, 30]), None);
        assert_eq!(store.find(&[10, 21, 30]), Some(b));
        assert!(!store.is_live(a) && store.is_live(b) && !store.is_live(1000));
        store.ensure_index(2, 0);
        assert_eq!(store.lookup(2, 0, &[]).count(), 1);
    }

    #[test]
    fn buckets_promote_and_shrink() {
        let mut store = Store::new();
        store.ensure_index(2, 0b01);
        let ids: Vec<_> = (0..40).map(|i| store.insert(&[7, 100 + i], 2, ROOT_OWNER)).collect();
        assert_eq!(store.lookup(2, 0b01, &[7]).count(), 40);
        assert_eq!(store.bucket_size(2, 0b01, &[7]), 40);
        for id in &ids[..39] {
            store.remove(*id);
        }
        assert_eq!(store.lookup(2, 0b01, &[7]).collect::<Vec<_>>(), vec![ids[39]]);
        assert_eq!(store.bucket_size(2, 0b01, &[7]), 1);
        store.remove(ids[39]);
        assert_eq!(store.lookup(2, 0b01, &[7]).count(), 0);
        assert_eq!(store.bucket_size(2, 0b01, &[7]), 0);
        assert_eq!(store.bucket_size(2, 0b10, &[7]), 0, "no index, no bucket");
        let reused = store.insert(&[7, 1], 2, ROOT_OWNER);
        assert!(ids.contains(&reused));
        assert_eq!(store.bucket_size(2, 0b01, &[7]), 1);
    }

    #[test]
    fn index_buckets_track_positions_through_removals() {
        let mut store = Store::new();
        store.ensure_index(2, 0b10);
        let ids: Vec<_> = (0..40).map(|i| store.insert(&[100 + i, 7], 2, ROOT_OWNER)).collect();
        assert_eq!(store.bucket_size(2, 0b10, &[7]), 40);
        for id in &ids[..20] {
            store.remove(*id);
        }
        let mut left: Vec<_> = store.lookup(2, 0b10, &[7]).collect();
        left.sort();
        assert_eq!(left, ids[20..].to_vec());
        for id in &ids[20..] {
            store.remove(*id);
        }
        assert_eq!(store.bucket_size(2, 0b10, &[7]), 0);
        let again = store.insert(&[1, 7], 2, ROOT_OWNER);
        assert_eq!(store.lookup(2, 0b10, &[7]).collect::<Vec<_>>(), vec![again]);
    }

    #[test]
    fn shared_prefixes_keep_every_fact_reachable() {
        let mut store = Store::new();
        let head = store.insert(&[1, 2, 10], 2, ROOT_OWNER);
        let second = store.insert(&[1, 2, 11], 2, ROOT_OWNER);
        assert_eq!(
            (store.find(&[1, 2, 10]), store.find(&[1, 2, 11]), store.find(&[1, 2, 12])),
            (Some(head), Some(second), None)
        );
        assert_eq!(store.lookup(3, 0b011, &[1, 2]).collect::<Vec<_>>(), vec![head, second]);
        store.remove(head);
        assert_eq!(
            store.lookup(3, 0b011, &[1, 2]).collect::<Vec<_>>(),
            vec![second],
            "the next fact heads the prefix"
        );
        assert_eq!(store.find(&[1, 2, 11]), Some(second));
        let more: Vec<_> = (12..30).map(|t| store.insert(&[1, 2, t], 2, ROOT_OWNER)).collect();
        assert_eq!(store.lookup(3, 0b011, &[1, 2]).len(), 19, "a big prefix promotes to a map");
        assert_eq!(store.find(&[1, 2, 29]), Some(more[17]));
        store.remove(second);
        store.remove(more[5]);
        assert_eq!(store.find(&[1, 2, 17]), None);
        assert_eq!(store.lookup(3, 0b011, &[1, 2]).len(), 17);
        for &id in &more {
            if store.is_live(id) {
                store.remove(id);
            }
        }
        assert_eq!(store.lookup(3, 0b011, &[1, 2]).count(), 0);
        assert!(store.is_empty());
        let empty = store.insert(&[], 2, ROOT_OWNER);
        assert_eq!(store.find(&[]), Some(empty));
    }

    #[test]
    fn scan_masks_keep_two_positions_unless_the_prefix_serves() {
        assert_eq!(scan_mask(4, 0b1101), 0b0101);
        assert_eq!(scan_mask(4, 0b0111), 0b0111);
        assert_eq!(scan_mask(4, 0b1110), 0b0110);
        assert_eq!(scan_mask(2, 0b01), 0b01);
        assert_eq!(scan_mask(1, 0), 0);
    }

    #[test]
    fn small_buckets_tolerate_removing_a_stranger() {
        let mut store = Store::new();
        store.ensure_index(2, 0b01);
        let a = store.insert(&[7, 1], 2, ROOT_OWNER);
        let b = store.insert(&[8, 1], 2, ROOT_OWNER);
        store.remove(b);
        assert_eq!(store.lookup(2, 0b01, &[7]).collect::<Vec<_>>(), vec![a]);
        assert_eq!(store.bucket_size(2, 0b01, &[8]), 0);
    }

    #[test]
    fn late_indexes_cover_existing_facts_of_that_length_only() {
        let mut store = Store::new();
        store.insert(&[1, 2, 3], 2, ROOT_OWNER);
        store.insert(&[1, 2], 2, ROOT_OWNER);
        store.insert(&[1, 9, 3], 2, ROOT_OWNER);
        store.ensure_index(3, 0b100);
        assert_eq!(store.lookup(3, 0b100, &[3]).count(), 2);
        store.ensure_index(2, 0b10);
        assert_eq!(store.lookup(2, 0b10, &[2]).count(), 1);
    }

    #[test]
    fn records_carry_scope_owner_and_a_monotonic_seq() {
        let mut store = Store::new();
        let a = store.insert(&[1, 2], 5, 3);
        let b = store.insert(&[1, 3], 6, ROOT_OWNER);
        assert_eq!((store.get(a).scope, store.get(b).scope), (5, 6));
        assert_eq!(&store.get(a).owners[..], &[3]);
        assert!(store.get(a).seq < store.get(b).seq);
        let removed = store.remove(a);
        assert_eq!(&removed.terms[..], &[1, 2]);
        let c = store.insert(&[1, 4], 6, ROOT_OWNER);
        assert_eq!(c, a, "slots are reused");
        assert!(store.get(c).seq > store.get(b).seq, "sequence numbers are not");
        store.get_mut(c).scope = 9;
        assert_eq!(store.get(c).scope, 9);
        let live: Vec<FactId> = store.iter().map(|(id, _)| id).collect();
        assert_eq!(live, vec![c, b], "iteration is in slot order");
    }

    #[test]
    fn clear_keeps_indexes_but_empties_them() {
        let mut store = Store::new();
        store.ensure_index(2, 0b01);
        let a = store.insert(&[7, 1], 2, ROOT_OWNER);
        store.clear();
        assert!(store.is_empty());
        assert!(store.has_index(2, 0b01));
        assert_eq!(store.lookup(2, 0b01, &[7]).count(), 0);
        assert!(!store.is_live(a));
        let b = store.insert(&[7, 2], 2, ROOT_OWNER);
        assert_eq!(store.lookup(2, 0b01, &[7]).collect::<Vec<_>>(), vec![b]);
    }

    #[test]
    fn positions_follow_the_mask() {
        assert_eq!(positions_of(0).as_slice(), &[]);
        assert_eq!(positions_of(0b1011).as_slice(), &[0, 1, 3]);
        assert_eq!(positions_of(1 << 31).as_slice(), &[31]);
    }

    #[test]
    #[should_panic(expected = "live fact")]
    fn reading_a_dead_fact_panics() {
        let mut store = Store::new();
        let a = store.insert(&[1], 2, ROOT_OWNER);
        store.remove(a);
        let _ = store.get(a);
    }
}
