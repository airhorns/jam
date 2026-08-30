import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { JAM_FACTS_SQL, applyFactChanges, parseFactChanges, parseFactKey, replacePrefix, factKey } from "../server";

let pg: PGlite;

const apply = (changes: Parameters<typeof applyFactChanges>[1]) =>
  pg.transaction((tx) => applyFactChanges((sql, params) => tx.query(sql, params), changes));

async function rows() {
  const res = await pg.query<{ key: string; scope: string; terms: unknown[]; t0: string; t1: string; t2: string }>(
    `SELECT key, scope, terms, t0, t1, t2 FROM jam_facts ORDER BY key`,
  );
  return res.rows;
}

beforeAll(async () => {
  pg = await PGlite.create({ dataDir: "memory://" });
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`DROP TABLE IF EXISTS jam_facts`);
  await pg.exec(JAM_FACTS_SQL);
});

describe("JAM_FACTS_SQL", () => {
  it("is idempotent and derives terms and t0..t2 from the key", async () => {
    await pg.exec(JAM_FACTS_SQL);
    await pg.query(`INSERT INTO jam_facts (key, scope) VALUES ($1, $2), ($3, '')`, [
      factKey(["issue", 1, "title", "A"]),
      "project:p1",
      factKey(["flag"]),
    ]);
    expect(await rows()).toEqual([
      { key: '["flag"]', scope: "", terms: ["flag"], t0: '"flag"', t1: null, t2: null },
      { key: '["issue",1,"title","A"]', scope: "project:p1", terms: ["issue", 1, "title", "A"], t0: '"issue"', t1: "1", t2: '"title"' },
    ]);
  });
});

describe("parseFactKey / replacePrefix", () => {
  it("accepts arrays of primitive terms only", () => {
    expect(parseFactKey('["a",1,true]')).toEqual(["a", 1, true]);
    expect(parseFactKey("[]")).toBeNull();
    expect(parseFactKey('{"a":1}')).toBeNull();
    expect(parseFactKey('["a",null]')).toBeNull();
    expect(parseFactKey('["a",{"b":1}]')).toBeNull();
    expect(parseFactKey("nope")).toBeNull();
  });

  it("builds the shared-prefix of a fact minus its last term", () => {
    expect(replacePrefix(["issue", "i1", "title", "A"])).toBe('["issue","i1","title",');
    expect(replacePrefix(["a", 1])).toBe('["a",');
  });
});

describe("parseFactChanges", () => {
  it("rejects malformed bodies", () => {
    expect(() => parseFactChanges(null)).toThrow("expected");
    expect(() => parseFactChanges({ changes: "x" })).toThrow("expected");
    expect(() => parseFactChanges({ changes: [{ op: "nope", key: '["a"]' }] })).toThrow("unknown op");
    expect(() => parseFactChanges({ changes: [{ op: "upsert", key: "a" }] })).toThrow("not a fact");
    expect(() => parseFactChanges({ changes: [{ op: "upsert", key: '["a"]', scope: 1 }] })).toThrow("scope");
    expect(() => parseFactChanges({ changes: [{ op: "replace", key: '["a"]' }] })).toThrow("2+ terms");
  });

  it("defaults scope to global", () => {
    expect(parseFactChanges({ changes: [{ op: "delete", key: '["a"]' }] })).toEqual([{ op: "delete", key: '["a"]', scope: "" }]);
  });
});

describe("applyFactChanges", () => {
  it("upserts, rescopes and deletes", async () => {
    const key = factKey(["issue", "i1", "title", "A"]);
    await apply([{ op: "upsert", key, scope: "a" }]);
    await apply([{ op: "upsert", key, scope: "b" }]);
    expect((await rows()).map((r) => [r.key, r.scope])).toEqual([[key, "b"]]);
    await apply([{ op: "delete", key, scope: "" }]);
    expect(await rows()).toEqual([]);
  });

  it("replace removes every other value of the attribute but nothing else", async () => {
    await apply([
      { op: "upsert", key: factKey(["issue", "i1", "title", "A"]), scope: "p" },
      { op: "upsert", key: factKey(["issue", "i1", "title", "B"]), scope: "p" },
      { op: "upsert", key: factKey(["issue", "i1", "title", "A", "extra"]), scope: "p" },
      { op: "upsert", key: factKey(["issue", "i1", "titles", "X"]), scope: "p" },
      { op: "upsert", key: factKey(["issue", "i10", "title", "Y"]), scope: "p" },
    ]);
    await apply([{ op: "replace", key: factKey(["issue", "i1", "title", "C"]), scope: "p" }]);
    expect((await rows()).map((r) => r.key).sort()).toEqual(
      [
        factKey(["issue", "i1", "title", "C"]),
        factKey(["issue", "i1", "title", "A", "extra"]),
        factKey(["issue", "i1", "titles", "X"]),
        factKey(["issue", "i10", "title", "Y"]),
      ].sort(),
    );
  });

  it("applies a batch in order within the caller's transaction", async () => {
    const key = factKey(["a", 1]);
    await apply([
      { op: "upsert", key, scope: "" },
      { op: "delete", key, scope: "" },
      { op: "upsert", key: factKey(["a", 2]), scope: "" },
    ]);
    expect((await rows()).map((r) => r.key)).toEqual([factKey(["a", 2])]);
    await expect(
      apply([
        { op: "upsert", key: factKey(["a", 3]), scope: "" },
        { op: "upsert", key: "not json", scope: "" },
      ]),
    ).rejects.toThrow();
    expect((await rows()).map((r) => r.key)).toEqual([factKey(["a", 2])]);
  });
});
