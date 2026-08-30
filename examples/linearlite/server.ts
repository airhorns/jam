// Sync server: the one origin the browser talks to. It applies each client's
// outbox to jam_facts and proxies shape requests to Electric, checking on both
// paths that the caller stays inside partitions it may use. LinearLite has no
// accounts, so the policy is "the global scope and any project"; an app with
// sessions would derive it from the caller's memberships instead.

import { serve } from "@hono/node-server";
import { ForbiddenScopeError, applyFactChanges, isDataError, parseFactChanges, shapeProxy } from "@jam/core/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { connect } from "./db/connection";

const PORT = Number(process.env.PORT ?? 3001);
const ELECTRIC_URL = process.env.ELECTRIC_URL ?? `http://localhost:${process.env.JAM_ELECTRIC_PORT ?? 3033}`;

const allowScope = (scope: string) => scope === "" || scope.startsWith("project:");

const sql = connect();
const app = new Hono();
app.use("/*", cors());

app.get("/", async (c) => {
  const [row] = await sql`SELECT 'ok' AS status, version() AS postgres_version, now() AS server_time`;
  return c.json(row);
});

app.post("/jam/changes", async (c) => {
  let changes;
  try {
    changes = parseFactChanges(await c.req.json());
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid changes" }, 400);
  }
  try {
    await sql.begin((tx) => applyFactChanges((query, params) => tx.unsafe(query, params as never[]), changes, { allow: allowScope }));
  } catch (error) {
    if (error instanceof ForbiddenScopeError) return c.json({ error: error.message }, 403);
    if (isDataError(error)) return c.json({ error: error instanceof Error ? error.message : "Invalid changes" }, 400);
    console.error(error);
    return c.json({ error: "Failed to apply changes" }, 500);
  }
  return c.json({ success: true, applied: changes.length });
});

const electricParams: Record<string, string> = {};
if (process.env.ELECTRIC_SOURCE_ID) electricParams.source_id = process.env.ELECTRIC_SOURCE_ID;
if (process.env.ELECTRIC_SOURCE_SECRET) electricParams.secret = process.env.ELECTRIC_SOURCE_SECRET;
const shape = shapeProxy({
  electricUrl: ELECTRIC_URL,
  allow: (filter) => filter.scope !== undefined && allowScope(filter.scope),
  params: electricParams,
});
app.get("/jam/shape", (c) => shape(c.req.raw));

serve({ fetch: app.fetch, port: PORT }, () => console.info(`Sync server listening on http://localhost:${PORT}, shapes from ${ELECTRIC_URL}`));
