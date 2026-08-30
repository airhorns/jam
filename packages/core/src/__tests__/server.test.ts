import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  ForbiddenScopeError,
  JAM_FACTS_SQL,
  applyFactChanges,
  isDataError,
  parseFactChanges,
  parseFactKey,
  factKey,
  shapeProxy,
  type ApplyOptions,
  type FactChangeRow,
} from "../server";

let pg: PGlite;

const apply = (changes: FactChangeRow[], options?: ApplyOptions) =>
  pg.transaction((tx) => applyFactChanges((sql, params) => tx.query(sql, params), changes, options));

async function rows() {
  const res = await pg.query<{ id: string; key: string; scope: string; attr: string; terms: unknown[]; t0: string; t1: string; t2: string }>(
    `SELECT id, key, scope, attr, terms, t0, t1, t2 FROM jam_facts ORDER BY key`,
  );
  return res.rows;
}

const keys = async () => (await rows()).map((r) => r.key);

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
  it("is idempotent and derives id, attr, terms and t0..t2 from the key", async () => {
    await pg.exec(JAM_FACTS_SQL);
    await pg.query(`INSERT INTO jam_facts (key, scope) VALUES ($1, $2), ($3, '')`, [
      factKey(["issue", 1, "title", "A"]),
      "project:p1",
      factKey(["flag"]),
    ]);
    const [flag, issue] = await rows();
    expect(flag).toMatchObject({ key: '["flag"]', scope: "", terms: ["flag"], t0: '"flag"', t1: null, t2: null });
    expect(issue).toMatchObject({
      key: '["issue",1,"title","A"]',
      scope: "project:p1",
      terms: ["issue", 1, "title", "A"],
      t0: '"issue"',
      t1: "1",
      t2: '"title"',
    });
    expect(issue.id).toMatch(/^[0-9a-f]{32}$/);
    const { rows: md5 } = await pg.query<{ id: string }>(`SELECT md5($1) AS id`, [issue.key]);
    expect(issue.id).toBe(md5[0].id);
    await pg.query(`INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(["issue", 1, "title", "B"]), "project:p1"]);
    const values = (await rows()).filter((r) => r.key.startsWith('["issue",1,"title"'));
    expect(values.map((r) => r.attr)).toEqual([values[0].attr, values[0].attr]);
    expect(flag.attr).not.toBe(values[0].attr);
  });

  it("stores facts far larger than a btree index entry", async () => {
    const big = "x".repeat(5000).replace(/x/g, () => String.fromCharCode(0x4e00 + Math.floor(Math.random() * 20000)));
    const key = factKey(["issue", 1, "description", big]);
    await apply([{ op: "upsert", key, scope: "p" }]);
    expect(await keys()).toEqual([key]);
    await apply([{ op: "replace", key: factKey(["issue", 1, "description", `${big}!`]), scope: "p" }]);
    expect(await keys()).toEqual([factKey(["issue", 1, "description", `${big}!`])]);
    await apply([{ op: "delete", key: factKey(["issue", 1, "description", `${big}!`]), scope: "p" }]);
    expect(await keys()).toEqual([]);
  });
});

describe("parseFactKey", () => {
  it("accepts arrays of primitive terms only", () => {
    expect(parseFactKey('["a",1,true]')).toEqual(["a", 1, true]);
    expect(parseFactKey("[]")).toBeNull();
    expect(parseFactKey('{"a":1}')).toBeNull();
    expect(parseFactKey('["a",null]')).toBeNull();
    expect(parseFactKey('["a",{"b":1}]')).toBeNull();
    expect(parseFactKey("nope")).toBeNull();
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

describe("isDataError", () => {
  it("recognises Postgres data, constraint and size errors", async () => {
    const error = await pg.query(`INSERT INTO jam_facts (key, scope) VALUES ('not json', '')`).catch((e) => e);
    expect(isDataError(error)).toBe(true);
    expect(isDataError(new Error("network"))).toBe(false);
    expect(isDataError({ code: "42P01" })).toBe(false);
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

  it("replace removes every other value of the attribute in the same scope but nothing else", async () => {
    await apply([
      { op: "upsert", key: factKey(["issue", "i1", "title", "A"]), scope: "p" },
      { op: "upsert", key: factKey(["issue", "i1", "title", "B"]), scope: "p" },
      { op: "upsert", key: factKey(["issue", "i1", "title", "Elsewhere"]), scope: "q" },
      { op: "upsert", key: factKey(["issue", "i1", "title", "A", "extra"]), scope: "p" },
      { op: "upsert", key: factKey(["issue", "i1", "titles", "X"]), scope: "p" },
      { op: "upsert", key: factKey(["issue", "i10", "title", "Y"]), scope: "p" },
    ]);
    await apply([{ op: "replace", key: factKey(["issue", "i1", "title", "C"]), scope: "p" }]);
    expect((await keys()).sort()).toEqual(
      [
        factKey(["issue", "i1", "title", "C"]),
        factKey(["issue", "i1", "title", "Elsewhere"]),
        factKey(["issue", "i1", "title", "A", "extra"]),
        factKey(["issue", "i1", "titles", "X"]),
        factKey(["issue", "i10", "title", "Y"]),
      ].sort(),
    );
  });

  it("applies a batch in order within the caller's transaction, coalescing runs of the same op", async () => {
    const key = factKey(["a", 1]);
    await apply([
      { op: "upsert", key, scope: "" },
      { op: "upsert", key, scope: "x" },
      { op: "delete", key, scope: "" },
      { op: "delete", key, scope: "" },
      { op: "upsert", key: factKey(["a", 2]), scope: "" },
      { op: "replace", key: factKey(["b", 1, "v", 1]), scope: "" },
      { op: "replace", key: factKey(["b", 1, "v", 2]), scope: "" },
    ]);
    expect(await keys()).toEqual([factKey(["a", 2]), factKey(["b", 1, "v", 2])]);
    await expect(
      apply([
        { op: "upsert", key: factKey(["a", 3]), scope: "" },
        { op: "upsert", key: "not json", scope: "" },
      ]),
    ).rejects.toThrow();
    expect(await keys()).toEqual([factKey(["a", 2]), factKey(["b", 1, "v", 2])]);
  });

  describe("with a scope policy", () => {
    const mine = { allow: (scope: string) => scope === "" || scope === "project:mine" };

    it("admits writes into allowed scopes", async () => {
      await apply(
        [
          { op: "upsert", key: factKey(["issue", 1, "title", "A"]), scope: "project:mine" },
          { op: "replace", key: factKey(["issue", 1, "title", "B"]), scope: "project:mine" },
          { op: "upsert", key: factKey(["project", "mine", "name", "Mine"]), scope: "" },
          { op: "delete", key: factKey(["project", "mine", "name", "Mine"]), scope: "" },
        ],
        mine,
      );
      expect(await keys()).toEqual([factKey(["issue", 1, "title", "B"])]);
    });

    it("rejects upserts and replaces into other scopes", async () => {
      await expect(apply([{ op: "upsert", key: factKey(["issue", 1, "title", "A"]), scope: "project:theirs" }], mine)).rejects.toThrow(
        ForbiddenScopeError,
      );
      await expect(apply([{ op: "replace", key: factKey(["issue", 1, "title", "A"]), scope: "project:theirs" }], mine)).rejects.toThrow(
        /project:theirs/,
      );
      expect(await keys()).toEqual([]);
    });

    it("rejects deleting or moving facts stored in other scopes, and nothing of the batch lands", async () => {
      const theirs = factKey(["issue", 2, "title", "Theirs"]);
      await apply([{ op: "upsert", key: theirs, scope: "project:theirs" }]);
      await expect(apply([{ op: "delete", key: theirs, scope: "" }], mine)).rejects.toThrow(ForbiddenScopeError);
      await expect(
        apply(
          [
            { op: "upsert", key: factKey(["issue", 1, "title", "A"]), scope: "project:mine" },
            { op: "upsert", key: theirs, scope: "project:mine" },
          ],
          mine,
        ),
      ).rejects.toThrow(ForbiddenScopeError);
      expect((await rows()).map((r) => [r.key, r.scope])).toEqual([[theirs, "project:theirs"]]);
    });
  });
});

describe("shapeProxy", () => {
  const upstream: string[] = [];
  const electric: typeof fetch = async (input) => {
    upstream.push(String(input));
    return new Response("[]", {
      status: 200,
      headers: {
        "electric-handle": "h1",
        "electric-offset": "0_0",
        "content-encoding": "gzip",
        "cache-control": "public, max-age=604800, s-maxage=3600, stale-while-revalidate=2629746",
      },
    });
  };
  const proxy = shapeProxy({
    electricUrl: "http://electric.internal:3000",
    params: { secret: "s3cret" },
    allow: (filter) => filter.scope === "" || filter.scope === "project:mine",
    fetch: electric,
  });
  const get = (query: string) => proxy(new Request(`http://app.test/jam/shape?${query}`));

  beforeEach(() => {
    upstream.length = 0;
  });

  it("forwards an allowed shape request with the server's params and Electric's headers", async () => {
    const response = await get(
      "table=jam_facts&columns=%22id%22%2C%22key%22%2C%22scope%22&where=scope+%3D+%241&params[1]=project:mine&offset=-1&live=true&cursor=7&log=full&handle=h0&expired_handle=hx",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("electric-handle")).toBe("h1");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, max-age=604800, stale-while-revalidate=2629746");
    const url = new URL(upstream[0]);
    expect(url.origin + url.pathname).toBe("http://electric.internal:3000/v1/shape");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      table: "jam_facts",
      columns: '"id","key","scope"',
      where: "scope = $1",
      "params[1]": "project:mine",
      offset: "-1",
      live: "true",
      cursor: "7",
      log: "full",
      handle: "h0",
      expired_handle: "hx",
      secret: "s3cret",
    });
  });

  it("accepts plain column names and drops params Electric does not define", async () => {
    await get("table=jam_facts&columns=id,key&where=scope+%3D+%241&params[1]=&offset=-1&source_id=evil&token=x");
    expect(Object.fromEntries(new URL(upstream[0]).searchParams)).toEqual({
      table: "jam_facts",
      columns: '"id","key"',
      where: "scope = $1",
      "params[1]": "",
      offset: "-1",
      secret: "s3cret",
    });
  });

  it("refuses other scopes, other tables, other columns and free-form where clauses", async () => {
    expect((await get("table=jam_facts&where=scope+%3D+%241&params[1]=project:theirs")).status).toBe(403);
    expect((await get("table=jam_facts")).status).toBe(403);
    expect((await get("table=users&where=scope+%3D+%241&params[1]=project:mine")).status).toBe(400);
    expect((await get("table=jam_facts&columns=id,terms&where=scope+%3D+%241&params[1]=project:mine")).status).toBe(400);
    expect((await get("table=jam_facts&where=scope+%3D+%241+OR+true&params[1]=project:mine")).status).toBe(400);
    expect((await get("table=jam_facts&where=scope+%3D+%241&params[1]=project:mine&params[2]=x")).status).toBe(400);
    expect((await proxy(new Request("http://app.test/jam/shape?table=jam_facts", { method: "POST" }))).status).toBe(405);
    expect(upstream).toEqual([]);
  });

  it("passes pattern literals through and hands the parsed filter to the policy", async () => {
    const seen: unknown[] = [];
    const inspect = shapeProxy({
      electricUrl: "http://electric.internal:3000",
      allow: (filter) => {
        seen.push(filter);
        return true;
      },
      fetch: electric,
    });
    const query = `table=jam_facts&where=${encodeURIComponent("scope = $1 AND t0 = $2 AND t2 = $3")}&params[1]=project:mine&params[2]=${encodeURIComponent('"issue"')}&params[3]=${encodeURIComponent('"title"')}`;
    expect((await inspect(new Request(`http://app.test/jam/shape?${query}`))).status).toBe(200);
    expect(seen).toEqual([{ scope: "project:mine", pattern: ["issue", expect.any(Symbol), "title"] }]);
    expect(new URL(upstream[0]).searchParams.get("where")).toBe("scope = $1 AND t0 = $2 AND t2 = $3");
  });
});
