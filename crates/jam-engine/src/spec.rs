//! What a query asks for: positive patterns joined on shared variables, plus
//! the optional negated patterns, predicates, aggregate and ordered window
//! layered over them. A `Spec` is the identity of a registered query.

use crate::query::{Clause, VarId};
use crate::term::{TermId, VAR_BASE, WILD};
use crate::wire::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Op {
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Contains,
    StartsWith,
    /// `Contains` ignoring case.
    ContainsCi,
    /// `StartsWith` ignoring case.
    StartsWithCi,
}

impl Op {
    fn from_wire(code: u32) -> Result<Op, String> {
        Ok(match code {
            PRED_EQ => Op::Eq,
            PRED_NE => Op::Ne,
            PRED_LT => Op::Lt,
            PRED_LE => Op::Le,
            PRED_GT => Op::Gt,
            PRED_GE => Op::Ge,
            PRED_CONTAINS => Op::Contains,
            PRED_STARTS_WITH => Op::StartsWith,
            PRED_CONTAINS_CI => Op::ContainsCi,
            PRED_STARTS_WITH_CI => Op::StartsWithCi,
            other => return Err(format!("unknown predicate op {other}")),
        })
    }

    pub fn ignores_case(self) -> bool {
        matches!(self, Op::ContainsCi | Op::StartsWithCi)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Operand {
    Var(VarId),
    Lit(TermId),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Predicate {
    pub lhs: VarId,
    pub op: Op,
    pub rhs: Operand,
}

/// Alternatives: a row passes when any predicate holds.
pub type Filter = Vec<Predicate>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum AggOp {
    Count,
    Sum,
    Min,
    Max,
}

/// Fold the rows sharing `group` values into one row of those values plus the aggregate.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Aggregate {
    pub op: AggOp,
    /// The variable folded; `None` for `Count`.
    pub input: Option<VarId>,
    pub group: Vec<VarId>,
}

/// One sort key over the output row.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Sort {
    pub var: VarId,
    pub descending: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct Spec {
    pub patterns: Vec<Clause>,
    /// Rows for which any of these has a match are hidden.
    pub negations: Vec<Clause>,
    pub filters: Vec<Filter>,
    pub aggregate: Option<Aggregate>,
    /// Sort keys over the output row, most significant first; ties keep assertion order.
    pub order: Vec<Sort>,
    pub offset: u32,
    pub limit: Option<u32>,
}

impl From<Vec<Clause>> for Spec {
    fn from(patterns: Vec<Clause>) -> Self {
        Spec { patterns, ..Spec::default() }
    }
}

#[inline]
pub fn is_var(t: u32) -> bool {
    (VAR_BASE..WILD).contains(&t)
}

#[inline]
pub fn var_of(t: u32) -> VarId {
    t - VAR_BASE
}

impl Spec {
    /// Decode `n (kind len words…)…`, the encoding `packages/engine` produces.
    pub fn unpack(packed: &[u32]) -> Result<Spec, String> {
        let mut r = Reader::new(packed);
        let mut spec = Spec::default();
        let n = r.u32()?;
        for _ in 0..n {
            let kind = r.u32()?;
            let len = r.u32()? as usize;
            let words = r.slice(len)?;
            match kind {
                CLAUSE_PATTERN => spec.patterns.push(check_clause(words)?),
                CLAUSE_NOT => spec.negations.push(check_clause(words)?),
                CLAUSE_WHERE => {
                    if len == 0 || !len.is_multiple_of(3) {
                        return Err(format!("bad predicate list length {len}"));
                    }
                    let filter = words
                        .chunks_exact(3)
                        .map(|p| {
                            if !is_var(p[0]) {
                                return Err(format!("predicate lhs {} is not a variable", p[0]));
                            }
                            let rhs = if is_var(p[2]) {
                                Operand::Var(var_of(p[2]))
                            } else if p[2] == WILD {
                                return Err("predicate rhs cannot be a wildcard".to_string());
                            } else {
                                Operand::Lit(p[2])
                            };
                            Ok(Predicate { lhs: var_of(p[0]), op: Op::from_wire(p[1])?, rhs })
                        })
                        .collect::<Result<Filter, String>>()?;
                    spec.filters.push(filter);
                }
                CLAUSE_ORDER => {
                    let [var, desc] = words else {
                        return Err(format!("bad order clause length {len}"));
                    };
                    if !is_var(*var) {
                        return Err(format!("order key {var} is not a variable"));
                    }
                    spec.order.push(Sort { var: var_of(*var), descending: *desc != 0 });
                }
                CLAUSE_OFFSET => {
                    let [n] = words else {
                        return Err(format!("bad offset clause length {len}"));
                    };
                    spec.offset = *n;
                }
                CLAUSE_LIMIT => {
                    let [n] = words else {
                        return Err(format!("bad limit clause length {len}"));
                    };
                    spec.limit = Some(*n);
                }
                CLAUSE_AGGREGATE => {
                    let [op, input, output_group @ ..] = words else {
                        return Err(format!("bad aggregate clause length {len}"));
                    };
                    if spec.aggregate.is_some() {
                        return Err("a query has at most one aggregate".to_string());
                    }
                    let op = match *op {
                        AGG_COUNT => AggOp::Count,
                        AGG_SUM => AggOp::Sum,
                        AGG_MIN => AggOp::Min,
                        AGG_MAX => AggOp::Max,
                        other => return Err(format!("unknown aggregate op {other}")),
                    };
                    let input = if *input == WILD {
                        None
                    } else if is_var(*input) {
                        Some(var_of(*input))
                    } else {
                        return Err(format!("aggregate input {input} is not a variable"));
                    };
                    let group =
                        output_group
                            .iter()
                            .map(|&g| {
                                if is_var(g) { Ok(var_of(g)) } else { Err(format!("group key {g} is not a variable")) }
                            })
                            .collect::<Result<Vec<_>, _>>()?;
                    spec.aggregate = Some(Aggregate { op, input, group });
                }
                other => return Err(format!("unknown clause kind {other}")),
            }
        }
        if !r.done() {
            return Err("trailing words after the last clause".to_string());
        }
        Ok(spec)
    }

    /// Variables the positive patterns bind: one past the highest index.
    pub fn nvars(&self) -> usize {
        self.patterns
            .iter()
            .flatten()
            .filter(|&&p| is_var(p))
            .map(|&p| var_of(p) as usize + 1)
            .max()
            .unwrap_or(0)
    }

    /// Width of the rows the query reports: the group values plus the aggregate, or every variable.
    pub fn arity(&self) -> usize {
        match &self.aggregate {
            Some(agg) => agg.group.len() + 1,
            None => self.nvars(),
        }
    }

    /// Check every reference resolves and turn variables only a negation mentions into
    /// wildcards, since nothing could ever bind them.
    pub fn normalize(mut self) -> Result<Spec, String> {
        let nvars = self.nvars();
        let mut bound = vec![false; nvars];
        for &p in self.patterns.iter().flatten() {
            if is_var(p) {
                bound[var_of(p) as usize] = true;
            }
        }
        if let Some(v) = bound.iter().position(|b| !b) {
            return Err(format!("variable {v} is never bound by a pattern"));
        }
        for p in self.negations.iter_mut().flatten() {
            if is_var(*p) && var_of(*p) as usize >= nvars {
                *p = WILD;
            }
        }
        let check = |v: VarId, what: &str| {
            if (v as usize) < nvars {
                Ok(())
            } else {
                Err(format!("{what} references unbound variable {v}"))
            }
        };
        for predicate in self.filters.iter().flatten() {
            check(predicate.lhs, "predicate")?;
            if let Operand::Var(v) = predicate.rhs {
                check(v, "predicate")?;
            }
        }
        if let Some(agg) = &self.aggregate {
            match (agg.op, agg.input) {
                (AggOp::Count, Some(_)) => return Err("count takes no input variable".to_string()),
                (AggOp::Count, None) => {}
                (_, None) => return Err("sum, min and max need an input variable".to_string()),
                (_, Some(v)) => check(v, "aggregate")?,
            }
            for (i, &g) in agg.group.iter().enumerate() {
                check(g, "group key")?;
                if agg.group[..i].contains(&g) || agg.input == Some(g) {
                    return Err(format!("group key {g} repeats a grouped or aggregated variable"));
                }
            }
        }
        let arity = self.arity();
        for sort in &self.order {
            if sort.var as usize >= arity {
                return Err(format!("order key {} is outside the output row", sort.var));
            }
        }
        Ok(self)
    }

    /// Every term id the spec mentions.
    pub fn literals(&self) -> impl Iterator<Item = TermId> + '_ {
        let in_clauses = self.patterns.iter().chain(&self.negations).flatten().copied().filter(|&t| t < VAR_BASE);
        let in_filters = self.filters.iter().flatten().filter_map(|p| match p.rhs {
            Operand::Lit(t) => Some(t),
            Operand::Var(_) => None,
        });
        in_clauses.chain(in_filters)
    }

    pub fn is_plain(&self) -> bool {
        self.aggregate.is_none() && self.order.is_empty() && self.offset == 0 && self.limit.is_none()
    }
}

fn check_clause(words: &[u32]) -> Result<Clause, String> {
    if words.is_empty() || words.len() > 32 {
        return Err(format!("bad pattern length {}", words.len()));
    }
    Ok(words.to_vec())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    fn v(i: u32) -> u32 {
        VAR_BASE + i
    }

    #[test]
    fn unpacks_every_clause_kind() {
        let packed = [
            7,
            CLAUSE_PATTERN,
            3,
            10,
            v(0),
            v(1),
            CLAUSE_NOT,
            2,
            11,
            v(0),
            CLAUSE_WHERE,
            6,
            v(1),
            PRED_GT,
            12,
            v(1),
            PRED_CONTAINS_CI,
            v(0),
            CLAUSE_ORDER,
            2,
            v(1),
            1,
            CLAUSE_OFFSET,
            1,
            5,
            CLAUSE_LIMIT,
            1,
            20,
            CLAUSE_AGGREGATE,
            3,
            AGG_MAX,
            v(1),
            v(0),
        ];
        let spec = Spec::unpack(&packed).unwrap();
        assert_eq!(
            spec,
            Spec {
                patterns: vec![vec![10, v(0), v(1)]],
                negations: vec![vec![11, v(0)]],
                filters: vec![vec![
                    Predicate { lhs: 1, op: Op::Gt, rhs: Operand::Lit(12) },
                    Predicate { lhs: 1, op: Op::ContainsCi, rhs: Operand::Var(0) },
                ]],
                aggregate: Some(Aggregate { op: AggOp::Max, input: Some(1), group: vec![0] }),
                order: vec![Sort { var: 1, descending: true }],
                offset: 5,
                limit: Some(20),
            }
        );
        assert_eq!((spec.nvars(), spec.arity()), (2, 2));
        assert_eq!(spec.literals().collect::<Vec<_>>(), vec![10, 11, 12]);
        assert!(!spec.is_plain());
        let count = Spec::unpack(&[2, CLAUSE_PATTERN, 2, 10, v(0), CLAUSE_AGGREGATE, 2, AGG_COUNT, WILD]).unwrap();
        assert_eq!(count.aggregate, Some(Aggregate { op: AggOp::Count, input: None, group: vec![] }));
        assert_eq!(count.arity(), 1);
        assert!(Spec::from(vec![vec![10, v(0)]]).is_plain());
        assert!(Op::ContainsCi.ignores_case() && !Op::Contains.ignores_case());
    }

    #[test]
    fn every_operator_code_has_an_operator() {
        let ops = [
            (PRED_EQ, Op::Eq),
            (PRED_NE, Op::Ne),
            (PRED_LT, Op::Lt),
            (PRED_LE, Op::Le),
            (PRED_GT, Op::Gt),
            (PRED_GE, Op::Ge),
            (PRED_CONTAINS, Op::Contains),
            (PRED_STARTS_WITH, Op::StartsWith),
            (PRED_CONTAINS_CI, Op::ContainsCi),
            (PRED_STARTS_WITH_CI, Op::StartsWithCi),
        ];
        for (code, op) in ops {
            let spec = Spec::unpack(&[2, CLAUSE_PATTERN, 2, 10, v(0), CLAUSE_WHERE, 3, v(0), code, 11]).unwrap();
            assert_eq!(spec.filters, vec![vec![Predicate { lhs: 0, op, rhs: Operand::Lit(11) }]]);
        }
        for (code, op) in [
            (AGG_COUNT, AggOp::Count),
            (AGG_SUM, AggOp::Sum),
            (AGG_MIN, AggOp::Min),
            (AGG_MAX, AggOp::Max),
        ] {
            let input = if op == AggOp::Count { WILD } else { v(1) };
            let spec = Spec::unpack(&[2, CLAUSE_PATTERN, 3, 10, v(0), v(1), CLAUSE_AGGREGATE, 2, code, input]).unwrap();
            assert_eq!(spec.aggregate.map(|a| a.op), Some(op));
        }
    }

    #[test]
    fn rejects_malformed_encodings() {
        let err = |packed: &[u32]| Spec::unpack(packed).unwrap_err();
        assert_eq!(err(&[]), "truncated at 0");
        assert_eq!(err(&[1, CLAUSE_PATTERN, 0]), "bad pattern length 0");
        assert_eq!(err(&[1, CLAUSE_NOT, 2, 10]), "truncated slice at 3 (len 2)");
        assert_eq!(err(&[1, CLAUSE_WHERE, 2, v(0), PRED_EQ]), "bad predicate list length 2");
        assert_eq!(err(&[1, CLAUSE_WHERE, 3, 10, PRED_EQ, 11]), "predicate lhs 10 is not a variable");
        assert_eq!(err(&[1, CLAUSE_WHERE, 3, v(0), PRED_EQ, WILD]), "predicate rhs cannot be a wildcard");
        assert_eq!(err(&[1, CLAUSE_WHERE, 3, v(0), 99, 11]), "unknown predicate op 99");
        assert_eq!(err(&[1, CLAUSE_ORDER, 1, v(0)]), "bad order clause length 1");
        assert_eq!(err(&[1, CLAUSE_ORDER, 2, 10, 0]), "order key 10 is not a variable");
        assert_eq!(err(&[1, CLAUSE_OFFSET, 2, 1, 2]), "bad offset clause length 2");
        assert_eq!(err(&[1, CLAUSE_LIMIT, 0]), "bad limit clause length 0");
        assert_eq!(err(&[1, CLAUSE_AGGREGATE, 1, AGG_COUNT]), "bad aggregate clause length 1");
        assert_eq!(err(&[1, CLAUSE_AGGREGATE, 2, 9, WILD]), "unknown aggregate op 9");
        assert_eq!(err(&[1, CLAUSE_AGGREGATE, 2, AGG_SUM, 10]), "aggregate input 10 is not a variable");
        assert_eq!(err(&[1, CLAUSE_AGGREGATE, 3, AGG_COUNT, WILD, 10]), "group key 10 is not a variable");
        assert_eq!(
            err(&[2, CLAUSE_AGGREGATE, 2, AGG_COUNT, WILD, CLAUSE_AGGREGATE, 2, AGG_COUNT, WILD]),
            "a query has at most one aggregate"
        );
        assert_eq!(err(&[1, 42, 0]), "unknown clause kind 42");
        assert_eq!(err(&[0, 7]), "trailing words after the last clause");
    }

    #[test]
    fn normalizes_and_validates_variable_references() {
        let spec = Spec { patterns: vec![vec![10, v(0)]], negations: vec![vec![11, v(0), v(1)]], ..Spec::default() }
            .normalize()
            .unwrap();
        assert_eq!(
            spec.negations,
            vec![vec![11, v(0), WILD]],
            "a variable only a negation mentions binds nothing"
        );

        let base = Spec { patterns: vec![vec![10, v(0), v(1)]], ..Spec::default() };
        let err = |spec: Spec| spec.normalize().unwrap_err();
        assert_eq!(
            err(Spec { patterns: vec![vec![10, v(1)]], ..Spec::default() }),
            "variable 0 is never bound by a pattern"
        );
        let pred = |lhs, rhs| Predicate { lhs, op: Op::Eq, rhs };
        assert_eq!(
            err(Spec { filters: vec![vec![pred(2, Operand::Lit(1))]], ..base.clone() }),
            "predicate references unbound variable 2"
        );
        assert_eq!(
            err(Spec { filters: vec![vec![pred(0, Operand::Var(3))]], ..base.clone() }),
            "predicate references unbound variable 3"
        );
        let agg = |op, input, group: Vec<VarId>| Some(Aggregate { op, input, group });
        assert_eq!(
            err(Spec { aggregate: agg(AggOp::Count, Some(0), vec![]), ..base.clone() }),
            "count takes no input variable"
        );
        assert_eq!(
            err(Spec { aggregate: agg(AggOp::Sum, None, vec![]), ..base.clone() }),
            "sum, min and max need an input variable"
        );
        assert_eq!(
            err(Spec { aggregate: agg(AggOp::Min, Some(5), vec![]), ..base.clone() }),
            "aggregate references unbound variable 5"
        );
        assert_eq!(
            err(Spec { aggregate: agg(AggOp::Count, None, vec![0, 4]), ..base.clone() }),
            "group key references unbound variable 4"
        );
        assert_eq!(
            err(Spec { aggregate: agg(AggOp::Count, None, vec![0, 0]), ..base.clone() }),
            "group key 0 repeats a grouped or aggregated variable"
        );
        assert_eq!(
            err(Spec { aggregate: agg(AggOp::Max, Some(1), vec![1]), ..base.clone() }),
            "group key 1 repeats a grouped or aggregated variable"
        );
        assert_eq!(
            err(Spec { order: vec![Sort { var: 2, descending: false }], ..base.clone() }),
            "order key 2 is outside the output row"
        );
        assert_eq!(
            err(Spec {
                aggregate: agg(AggOp::Max, Some(1), vec![0]),
                order: vec![Sort { var: 2, descending: false }],
                ..base.clone()
            }),
            "order key 2 is outside the output row",
            "after an aggregate the output row is the group plus the value"
        );
        assert!(
            Spec {
                aggregate: agg(AggOp::Max, Some(1), vec![0]),
                order: vec![Sort { var: 1, descending: true }],
                ..base
            }
            .normalize()
            .is_ok()
        );
    }
}
