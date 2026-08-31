//! Output stages layered over a query's base rows: an aggregate folding rows
//! into groups, then an ordered window over whatever precedes it. Each stage
//! turns a batch of row transitions into the transitions of its own rows; the
//! last stage's rows are what the query reports.

use std::cmp::Ordering;

use hashbrown::HashMap;
use smallvec::SmallVec;

use crate::query::{ResultSet, Row};
use crate::spec::{AggOp, Aggregate, Sort, Spec};
use crate::term::{Interner, Term, TermId};

/// A row appearing (`true`) or disappearing, with the sequence that orders it among equals.
pub type Change = (Row, u64, bool);

pub struct Stages {
    aggregate: Option<AggState>,
    window: Option<WindowState>,
    /// The rows the query reports.
    pub output: ResultSet,
}

impl Stages {
    pub fn new(spec: &Spec) -> Option<Stages> {
        if spec.is_plain() {
            return None;
        }
        let aggregate = spec.aggregate.as_ref().map(AggState::new);
        let window = (!spec.order.is_empty() || spec.offset > 0 || spec.limit.is_some())
            .then(|| WindowState::new(&spec.order, spec.offset, spec.limit));
        Some(Stages { aggregate, window, output: ResultSet::default() })
    }

    /// Push base-row transitions through the stages into `output`.
    pub fn apply(&mut self, mut changes: Vec<Change>, interner: &mut Interner) {
        if let Some(agg) = &mut self.aggregate {
            let mut out = Vec::new();
            agg.apply(&changes, interner, &mut out);
            changes = out;
        }
        if let Some(window) = &mut self.window {
            let mut out = Vec::new();
            window.apply(&changes, interner, &mut out);
            changes = out;
        }
        for (row, _, visible) in changes {
            self.output.apply(&row, if visible { 1 } else { -1 }, || 0);
        }
    }

    /// Where an output row sits among its peers.
    pub fn order_of(&self, row: &[TermId]) -> u64 {
        seq_of(self.window.as_ref(), self.aggregate.as_ref(), row)
    }

    /// The output set and its ordering, borrowed apart so the set can be drained.
    pub fn parts(&mut self) -> (&mut ResultSet, impl Fn(&[TermId]) -> u64) {
        let (window, aggregate) = (self.window.as_ref(), self.aggregate.as_ref());
        (&mut self.output, move |row: &[TermId]| seq_of(window, aggregate, row))
    }

    /// Let go of the terms the aggregate holds for its reported values.
    pub fn release(&mut self, interner: &mut Interner) {
        if let Some(agg) = &mut self.aggregate {
            for group in agg.groups.values_mut() {
                if let Some(value) = group.output.take() {
                    interner.release(value);
                }
            }
        }
    }
}

/// The last stage's order for a row: the window's if there is one, else the group's.
fn seq_of(window: Option<&WindowState>, aggregate: Option<&AggState>, row: &[TermId]) -> u64 {
    match (window, aggregate) {
        (Some(window), _) => window.seq_of(row),
        (None, Some(agg)) => agg.seq_of(row),
        (None, None) => 0,
    }
}

struct Group {
    count: u32,
    sum: f64,
    /// Present values in term order with their multiplicities, for min and max.
    values: Vec<(TermId, u32)>,
    seq: u64,
    /// The value reported for this group, held in the interner while it is.
    output: Option<TermId>,
    touched: bool,
}

struct AggState {
    op: AggOp,
    input: Option<u32>,
    group: Vec<u32>,
    groups: HashMap<Row, Group>,
    touched: Vec<Row>,
    next_seq: u64,
}

fn compare_terms(interner: &Interner, a: TermId, b: TermId) -> Ordering {
    match (interner.get(a), interner.get(b)) {
        (Some(x), Some(y)) => x.compare(y),
        _ => a.cmp(&b),
    }
}

impl AggState {
    fn new(agg: &Aggregate) -> AggState {
        AggState {
            op: agg.op,
            input: agg.input,
            group: agg.group.clone(),
            groups: HashMap::new(),
            touched: Vec::new(),
            next_seq: 0,
        }
    }

    fn apply(&mut self, changes: &[Change], interner: &mut Interner, out: &mut Vec<Change>) {
        for (row, _, visible) in changes {
            let key: Row = self.group.iter().map(|&v| row[v as usize]).collect();
            let next_seq = &mut self.next_seq;
            let group = self.groups.entry(key.clone()).or_insert_with(|| {
                *next_seq += 1;
                Group { count: 0, sum: 0.0, values: Vec::new(), seq: *next_seq - 1, output: None, touched: false }
            });
            if !group.touched {
                group.touched = true;
                self.touched.push(key.clone());
            }
            let value = self.input.map(|v| row[v as usize]);
            if *visible {
                group.count += 1;
            } else {
                group.count -= 1;
            }
            match (self.op, value) {
                (AggOp::Sum, Some(value)) => {
                    if let Some(Term::Num(n)) = interner.get(value) {
                        group.sum += if *visible { *n } else { -*n };
                    }
                }
                (AggOp::Min | AggOp::Max, Some(value)) => {
                    let values = &mut group.values;
                    let mut at = values.partition_point(|&(t, _)| compare_terms(interner, t, value) == Ordering::Less);
                    // Distinct terms can compare equal (NaN payloads), so look through that run for this one.
                    while at < values.len()
                        && values[at].0 != value
                        && compare_terms(interner, values[at].0, value) == Ordering::Equal
                    {
                        at += 1;
                    }
                    match values.get_mut(at) {
                        Some(entry) if entry.0 == value => {
                            if *visible {
                                entry.1 += 1;
                            } else {
                                entry.1 -= 1;
                                if entry.1 == 0 {
                                    values.remove(at);
                                }
                            }
                        }
                        _ if *visible => values.insert(at, (value, 1)),
                        _ => {}
                    }
                }
                _ => {}
            }
        }
        for key in std::mem::take(&mut self.touched) {
            let group = self.groups.get_mut(&key).expect("touched groups exist");
            group.touched = false;
            let next = if group.count == 0 {
                None
            } else {
                match self.op {
                    AggOp::Count => Some(interner.intern_num(f64::from(group.count))),
                    AggOp::Sum => Some(interner.intern_num(group.sum)),
                    AggOp::Min => group.values.first().map(|&(t, _)| t),
                    AggOp::Max => group.values.last().map(|&(t, _)| t),
                }
            };
            if next != group.output {
                let mut row = key.clone();
                if let Some(old) = group.output {
                    row.push(old);
                    out.push((row.clone(), group.seq, false));
                    row.pop();
                    interner.release(old);
                }
                if let Some(new) = next {
                    interner.retain(new);
                    row.push(new);
                    out.push((row, group.seq, true));
                }
                group.output = next;
            }
            if group.count == 0 {
                self.groups.remove(&key);
            }
        }
    }

    fn seq_of(&self, row: &[TermId]) -> u64 {
        self.groups.get(&row[..row.len() - 1]).map_or(0, |g| g.seq)
    }
}

struct Entry {
    key: SmallVec<[TermId; 2]>,
    seq: u64,
    row: Row,
}

struct WindowState {
    order: Vec<Sort>,
    offset: usize,
    /// One past the last rank in the window.
    end: usize,
    entries: Vec<Entry>,
    /// Every row present, with its sequence, so it can be found again when it leaves.
    seqs: HashMap<Row, u64>,
}

impl WindowState {
    fn new(order: &[Sort], offset: u32, limit: Option<u32>) -> WindowState {
        let offset = offset as usize;
        let end = limit.map_or(usize::MAX, |limit| offset.saturating_add(limit as usize));
        WindowState { order: order.to_vec(), offset, end, entries: Vec::new(), seqs: HashMap::new() }
    }

    fn entry(&self, row: &Row, seq: u64) -> Entry {
        Entry { key: self.order.iter().map(|sort| row[sort.var as usize]).collect(), seq, row: row.clone() }
    }

    fn compare(&self, interner: &Interner, a: &Entry, b: &Entry) -> Ordering {
        for (i, sort) in self.order.iter().enumerate() {
            let ordering = compare_terms(interner, a.key[i], b.key[i]);
            let ordering = if sort.descending { ordering.reverse() } else { ordering };
            if ordering != Ordering::Equal {
                return ordering;
            }
        }
        a.seq.cmp(&b.seq).then_with(|| a.row.cmp(&b.row))
    }

    fn change_of(&self, rank: usize, visible: bool) -> Change {
        let entry = &self.entries[rank];
        (entry.row.clone(), entry.seq, visible)
    }

    fn apply(&mut self, changes: &[Change], interner: &Interner, out: &mut Vec<Change>) {
        for (row, seq, visible) in changes {
            if *visible {
                if self.seqs.contains_key(row) {
                    continue;
                }
                let entry = self.entry(row, *seq);
                let rank = self.entries.partition_point(|e| self.compare(interner, e, &entry) == Ordering::Less);
                self.entries.insert(rank, entry);
                self.seqs.insert(row.clone(), *seq);
                let n = self.entries.len();
                if rank < self.end {
                    if rank >= self.offset {
                        out.push((row.clone(), *seq, true));
                    } else if self.offset < n {
                        out.push(self.change_of(self.offset, true));
                    }
                    if self.end < n {
                        out.push(self.change_of(self.end, false));
                    }
                }
            } else {
                let Some(seq) = self.seqs.remove(row) else {
                    continue;
                };
                let entry = self.entry(row, seq);
                let at = self.entries.partition_point(|e| self.compare(interner, e, &entry) == Ordering::Less);
                let rank = (at..self.entries.len())
                    .find(|&i| self.entries[i].row == *row)
                    .expect("present rows are ranked");
                let n = self.entries.len();
                if rank < self.end {
                    if rank >= self.offset {
                        out.push((row.clone(), seq, false));
                    } else if self.offset < n {
                        out.push(self.change_of(self.offset, false));
                    }
                    if self.end < n {
                        out.push(self.change_of(self.end, true));
                    }
                }
                self.entries.remove(rank);
            }
        }
    }

    fn seq_of(&self, row: &[TermId]) -> u64 {
        self.seqs.get(row).copied().unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;
    use crate::spec::Sort;

    fn row(terms: &[TermId]) -> Row {
        terms.into()
    }

    fn visible(set: &ResultSet) -> Vec<Vec<TermId>> {
        let mut rows: Vec<Vec<TermId>> = set.rows().map(|(_, r)| r.to_vec()).collect();
        rows.sort();
        rows
    }

    fn drained(set: &mut ResultSet) -> Vec<(Vec<TermId>, bool)> {
        let mut out = Vec::new();
        set.drain(|_, row, visible| out.push((row.to_vec(), visible)));
        out.sort();
        out
    }

    #[test]
    fn plain_specs_have_no_stages() {
        assert!(Stages::new(&Spec::from(vec![vec![1]])).is_none());
        let mut stages = Stages::new(&Spec { limit: Some(1), ..Spec::from(vec![vec![1]]) }).unwrap();
        assert_eq!(stages.order_of(&[7]), 0, "unknown rows have no order");
        assert_eq!(stages.parts().1(&[7]), 0);
        stages.release(&mut Interner::new());
    }

    #[test]
    fn counts_and_sums_per_group() {
        let mut interner = Interner::new();
        let (a, b) = (interner.intern_str("a"), interner.intern_str("b"));
        let nums: Vec<TermId> = (1..=4).map(|n| interner.intern_num(f64::from(n))).collect();
        for &t in nums.iter().chain([&a, &b]) {
            interner.retain(t);
        }
        let spec = Spec {
            patterns: vec![vec![1, crate::term::VAR_BASE, crate::term::VAR_BASE + 1]],
            aggregate: Some(Aggregate { op: AggOp::Sum, input: Some(1), group: vec![0] }),
            ..Spec::default()
        };
        let mut stages = Stages::new(&spec).unwrap();
        stages.apply(
            vec![
                (row(&[a, nums[0]]), 1, true),
                (row(&[a, nums[1]]), 2, true),
                (row(&[b, nums[2]]), 3, true),
            ],
            &mut interner,
        );
        let three = interner.intern_num(3.0);
        assert_eq!(visible(&stages.output), vec![vec![a, three], vec![b, three]]);
        assert_eq!(interner.refcount(three), 3, "one per fact-like retain here, one per group reporting it");
        assert_eq!(stages.order_of(&[a, three]), 0);
        assert_eq!(stages.order_of(&[b, three]), 1, "groups are ordered by first appearance");
        stages.output.settle();

        stages.apply(vec![(row(&[a, nums[0]]), 1, false), (row(&[b, nums[3]]), 4, true)], &mut interner);
        let (two, seven) = (interner.intern_num(2.0), interner.intern_num(7.0));
        assert_eq!(
            drained(&mut stages.output),
            vec![
                (vec![a, two], true),
                (vec![a, three], false),
                (vec![b, three], false),
                (vec![b, seven], true)
            ]
        );
        assert_eq!(interner.refcount(three), 1, "both groups let go of 3");
        stages.apply(vec![(row(&[a, nums[1]]), 2, false)], &mut interner);
        assert_eq!(drained(&mut stages.output), vec![(vec![a, two], false)], "an emptied group disappears");
        assert_eq!(stages.order_of(&[a, two]), 0);
        stages.apply(vec![(row(&[a, nums[0]]), 1, true)], &mut interner);
        assert_eq!(stages.order_of(&[a, nums[0]]), 2, "a group that comes back is new");
        assert_eq!(interner.refcount(nums[0]), 2, "the new group holds its value");
        stages.release(&mut interner);
        assert_eq!(interner.refcount(seven), 0);
        assert_eq!(interner.refcount(nums[0]), 1);

        let mut count = Stages::new(&Spec {
            aggregate: Some(Aggregate { op: AggOp::Count, input: None, group: vec![] }),
            ..spec.clone()
        })
        .unwrap();
        count.apply(vec![(row(&[a, nums[0]]), 1, true), (row(&[a, nums[1]]), 2, true)], &mut interner);
        assert_eq!(visible(&count.output), vec![vec![two]]);
        count.apply(vec![(row(&[a, nums[0]]), 1, false), (row(&[b, nums[0]]), 3, true)], &mut interner);
        count.output.settle();
        assert_eq!(visible(&count.output), vec![vec![two]], "a swap leaves the count alone");
        assert!(drained(&mut count.output).is_empty());
        let mut sum_of_strings =
            Stages::new(&Spec { aggregate: Some(Aggregate { op: AggOp::Sum, input: Some(0), group: vec![] }), ..spec })
                .unwrap();
        sum_of_strings.apply(vec![(row(&[a, nums[0]]), 1, true)], &mut interner);
        let zero = interner.intern_num(0.0);
        assert_eq!(visible(&sum_of_strings.output), vec![vec![zero]], "non-numbers add nothing");
    }

    #[test]
    fn tracks_min_and_max_with_multiplicity() {
        let mut interner = Interner::new();
        let nums: Vec<TermId> = (1..=3).map(|n| interner.intern_num(f64::from(n))).collect();
        let s = interner.intern_str("z");
        let spec = |op| Spec {
            patterns: vec![vec![crate::term::VAR_BASE]],
            aggregate: Some(Aggregate { op, input: Some(0), group: vec![] }),
            ..Spec::default()
        };
        let mut max = Stages::new(&spec(AggOp::Max)).unwrap();
        let mut min = Stages::new(&spec(AggOp::Min)).unwrap();
        let changes =
            |rows: &[(TermId, bool)]| -> Vec<Change> { rows.iter().map(|&(t, v)| (row(&[t]), 0, v)).collect() };
        for stage in [&mut max, &mut min] {
            stage.apply(
                changes(&[(nums[1], true), (nums[0], true), (nums[2], true), (nums[2], true)]),
                &mut interner,
            );
        }
        assert_eq!((visible(&max.output), visible(&min.output)), (vec![vec![nums[2]]], vec![vec![nums[0]]]));
        for stage in [&mut max, &mut min] {
            stage.output.settle();
            stage.apply(changes(&[(nums[2], false), (nums[0], false)]), &mut interner);
        }
        assert_eq!(drained(&mut max.output), vec![], "3 is still present once");
        assert_eq!(drained(&mut min.output), vec![(vec![nums[0]], false), (vec![nums[1]], true)]);
        max.apply(changes(&[(nums[2], false), (s, true)]), &mut interner);
        assert_eq!(
            drained(&mut max.output),
            vec![(vec![nums[2]], false), (vec![s], true)],
            "strings sort after numbers"
        );
        assert_eq!(interner.refcount(s), 1);
        max.release(&mut interner);
        assert_eq!(interner.refcount(s), 0);
    }

    #[test]
    fn windows_report_rows_crossing_their_edges() {
        let mut interner = Interner::new();
        let nums: Vec<TermId> = (0..10).map(|n| interner.intern_num(f64::from(n))).collect();
        let spec = Spec {
            patterns: vec![vec![crate::term::VAR_BASE, crate::term::VAR_BASE + 1]],
            order: vec![Sort { var: 1, descending: false }],
            offset: 1,
            limit: Some(2),
            ..Spec::default()
        };
        let mut stages = Stages::new(&spec).unwrap();
        let change =
            |id: usize, value: usize, visible: bool| -> Change { (row(&[nums[id], nums[value]]), id as u64, visible) };
        stages.apply(vec![change(1, 5, true)], &mut interner);
        assert!(visible(&stages.output).is_empty(), "rank 0 is before the window");
        stages.apply(vec![change(2, 7, true), change(3, 9, true), change(4, 8, true)], &mut interner);
        assert_eq!(
            visible(&stages.output),
            vec![vec![nums[2], nums[7]], vec![nums[4], nums[8]]],
            "ranks 1 and 2 of 5,7,8,9"
        );
        assert_eq!(stages.order_of(&[nums[2], nums[7]]), 2);
        stages.output.settle();

        stages.apply(vec![change(5, 1, true)], &mut interner);
        assert_eq!(
            drained(&mut stages.output),
            vec![(vec![nums[1], nums[5]], true), (vec![nums[4], nums[8]], false)],
            "inserting before the window shifts it"
        );
        stages.apply(vec![change(5, 1, false)], &mut interner);
        assert_eq!(
            drained(&mut stages.output),
            vec![(vec![nums[1], nums[5]], false), (vec![nums[4], nums[8]], true)],
            "removing before the window shifts it back"
        );
        stages.apply(vec![change(2, 7, false)], &mut interner);
        assert_eq!(
            drained(&mut stages.output),
            vec![(vec![nums[2], nums[7]], false), (vec![nums[3], nums[9]], true)],
            "removing inside the window pulls the next row in"
        );
        stages.apply(vec![change(6, 9, true)], &mut interner);
        assert!(drained(&mut stages.output).is_empty(), "after the window nothing changes");
        stages.apply(vec![change(6, 9, false), change(6, 9, false)], &mut interner);
        assert!(drained(&mut stages.output).is_empty(), "removing an unknown row is ignored");
        stages.apply(vec![change(3, 9, true)], &mut interner);
        assert!(drained(&mut stages.output).is_empty(), "adding a present row again is ignored");
        assert_eq!(stages.order_of(&[nums[3], nums[9]]), 3);
    }

    #[test]
    fn orders_descending_and_breaks_ties_by_sequence() {
        let mut interner = Interner::new();
        let (a, b) = (interner.intern_str("a"), interner.intern_str("b"));
        let one = interner.intern_num(1.0);
        let spec = Spec {
            patterns: vec![vec![crate::term::VAR_BASE, crate::term::VAR_BASE + 1]],
            order: vec![Sort { var: 1, descending: true }, Sort { var: 0, descending: false }],
            limit: Some(1),
            ..Spec::default()
        };
        let mut stages = Stages::new(&spec).unwrap();
        stages.apply(
            vec![(row(&[a, one]), 5, true), (row(&[b, one]), 4, true), (row(&[a, a]), 1, true)],
            &mut interner,
        );
        assert_eq!(
            visible(&stages.output),
            vec![vec![a, a]],
            "strings sort above numbers, so descending puts them first"
        );
        stages.output.settle();
        stages.apply(vec![(row(&[a, a]), 1, false)], &mut interner);
        assert_eq!(
            drained(&mut stages.output),
            vec![(vec![a, a], false), (vec![a, one], true)],
            "then by the second key"
        );
        stages.apply(vec![(row(&[a, one]), 5, false), (row(&[b, one]), 4, false)], &mut interner);
        assert_eq!(
            drained(&mut stages.output),
            vec![(vec![a, one], false)],
            "a row that entered and left within the batch is silent"
        );

        let mut by_seq = Stages::new(&Spec { order: vec![], offset: 1, limit: None, ..spec }).unwrap();
        by_seq.apply(vec![(row(&[a, one]), 9, true), (row(&[b, one]), 3, true)], &mut interner);
        assert_eq!(visible(&by_seq.output), vec![vec![a, one]], "with no keys the window follows sequence");
        assert_eq!(compare_terms(&interner, 999, 998), Ordering::Greater, "unknown terms compare by id");
    }
}
