//! The owner tree. A fact lives while at least one owner holds it; revoking an
//! owner revokes its whole subtree and releases everything they held. The root
//! owner is never revoked, so its facts are not tracked here.

use hashbrown::HashMap;
use indexmap::IndexSet;

use crate::store::{FactId, OwnerId, ROOT_OWNER};

struct OwnerRecord {
    parent: OwnerId,
    children: Vec<OwnerId>,
    facts: IndexSet<FactId>,
}

pub struct Owners {
    records: HashMap<OwnerId, OwnerRecord>,
    next: OwnerId,
}

impl Default for Owners {
    fn default() -> Self {
        Owners::new()
    }
}

impl Owners {
    pub fn new() -> Self {
        let mut records = HashMap::new();
        records.insert(ROOT_OWNER, OwnerRecord { parent: ROOT_OWNER, children: Vec::new(), facts: IndexSet::new() });
        Owners { records, next: ROOT_OWNER + 1 }
    }

    /// Ids are never reused, so a stale id from a revoked owner can't alias a live one.
    pub fn create(&mut self, parent: OwnerId) -> Option<OwnerId> {
        let parent_record = self.records.get_mut(&parent)?;
        let id = self.next;
        self.next += 1;
        parent_record.children.push(id);
        self.records.insert(id, OwnerRecord { parent, children: Vec::new(), facts: IndexSet::new() });
        Some(id)
    }

    pub fn exists(&self, id: OwnerId) -> bool {
        self.records.contains_key(&id)
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }

    pub fn attach(&mut self, owner: OwnerId, fid: FactId) {
        if owner == ROOT_OWNER {
            return;
        }
        if let Some(record) = self.records.get_mut(&owner) {
            record.facts.insert(fid);
        }
    }

    pub fn detach(&mut self, owner: OwnerId, fid: FactId) {
        if owner == ROOT_OWNER {
            return;
        }
        if let Some(record) = self.records.get_mut(&owner) {
            record.facts.swap_remove(&fid);
        }
    }

    /// Remove `owner` and every descendant, returning the (owner, fact) pairs they held.
    pub fn revoke(&mut self, owner: OwnerId) -> Vec<(OwnerId, FactId)> {
        let mut released = Vec::new();
        if owner == ROOT_OWNER || !self.records.contains_key(&owner) {
            return released;
        }
        let parent = self.records[&owner].parent;
        let mut stack = vec![owner];
        while let Some(id) = stack.pop() {
            let record = self.records.remove(&id).expect("owner in tree");
            stack.extend(record.children);
            released.extend(record.facts.into_iter().map(|fid| (id, fid)));
        }
        if let Some(parent) = self.records.get_mut(&parent) {
            parent.children.retain(|&c| c != owner);
        }
        released
    }

    pub fn parent(&self, owner: OwnerId) -> Option<OwnerId> {
        self.records.get(&owner).map(|r| r.parent)
    }

    /// Forget everything except the root; used by `clear`.
    pub fn reset(&mut self) {
        self.records.retain(|&id, _| id == ROOT_OWNER);
        self.records.get_mut(&ROOT_OWNER).unwrap().children.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revoke_cascades() {
        let mut owners = Owners::new();
        let a = owners.create(ROOT_OWNER).unwrap();
        let b = owners.create(a).unwrap();
        let c = owners.create(b).unwrap();
        owners.attach(a, 1);
        owners.attach(b, 2);
        owners.attach(c, 3);
        owners.attach(ROOT_OWNER, 4);
        let mut released = owners.revoke(a);
        released.sort();
        assert_eq!(released, vec![(a, 1), (b, 2), (c, 3)]);
        assert!(!owners.exists(a) && !owners.exists(b) && !owners.exists(c));
        assert!(owners.exists(ROOT_OWNER));
        assert!(owners.create(a).is_none());
        assert!(owners.revoke(ROOT_OWNER).is_empty());
    }

    #[test]
    fn detach_and_reuse() {
        let mut owners = Owners::new();
        let a = owners.create(ROOT_OWNER).unwrap();
        owners.attach(a, 7);
        owners.detach(a, 7);
        assert!(owners.revoke(a).is_empty());
        let b = owners.create(ROOT_OWNER).unwrap();
        assert_ne!(a, b);
    }
}
