import { JAM_FACTS_SQL } from "@jam/core/server";
import { connect, DATABASE_URL } from "./connection";

const sql = connect();
console.info(`Migrating ${DATABASE_URL}`);
try {
  await sql.unsafe(JAM_FACTS_SQL);
  console.info("Applied jam_facts");
} finally {
  await sql.end();
}
