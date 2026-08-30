import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, DATABASE_URL } from "./connection";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations-server");

const sql = connect();
console.info(`Migrating ${DATABASE_URL}`);
try {
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    await sql.unsafe(await readFile(join(MIGRATIONS_DIR, file), "utf8"));
    console.info(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
