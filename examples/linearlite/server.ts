// Write server: the one endpoint clients push their outbox to. Every fact of
// every jam program lands in jam_facts, so there is nothing app-specific here.

import { serve } from "@hono/node-server";
import { applyFactChanges, parseFactChanges } from "@jam/core/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { connect } from "./db/connection";

const PORT = Number(process.env.PORT ?? 3001);

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
    await sql.begin((tx) => applyFactChanges((query, params) => tx.unsafe(query, params as never[]), changes));
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to apply changes" }, 500);
  }
  return c.json({ success: true, applied: changes.length });
});

serve({ fetch: app.fetch, port: PORT }, () => console.info(`Write server listening on http://localhost:${PORT}`));
