import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type postgres from "postgres";
import { connect } from "./db/connection";
import { changeSetSchema, type ChangeSet, type CommentChange, type IssueChange } from "./src/changes";

const PORT = Number(process.env.PORT ?? 3001);

const sql = connect();
const app = new Hono();
app.use("/*", cors());

app.get("/", async (c) => {
  const [row] = await sql`SELECT 'ok' AS status, version() AS postgres_version, now() AS server_time`;
  return c.json(row);
});

app.post("/apply-changes", async (c) => {
  const parsed = changeSetSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    console.error(parsed.error);
    return c.json({ error: "Invalid changes" }, 400);
  }
  try {
    await applyChanges(parsed.data);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to apply changes" }, 500);
  }
  return c.json({ success: true });
});

async function applyChanges({ issues, comments }: ChangeSet): Promise<void> {
  await sql.begin(async (tx) => {
    for (const issue of issues) await applyTableChange("issue", issue, tx);
    for (const comment of comments) await applyTableChange("comment", comment, tx);
  });
}

async function applyTableChange(
  table: "issue" | "comment",
  change: IssueChange | CommentChange,
  tx: postgres.TransactionSql,
): Promise<void> {
  const { id, modified_columns, new: isNew, deleted } = change;
  const columns = (modified_columns ?? []) as (keyof typeof change)[];
  if (deleted) {
    await tx`DELETE FROM ${tx(table)} WHERE id = ${id}`;
  } else if (isNew) {
    await tx`INSERT INTO ${tx(table)} ${tx(change, "id", ...columns)}`;
  } else if (columns.length > 0) {
    await tx`UPDATE ${tx(table)} SET ${tx(change, ...columns)} WHERE id = ${id}`;
  }
}

serve({ fetch: app.fetch, port: PORT }, () => console.info(`Write server listening on http://localhost:${PORT}`));
