import { insertSeedFacts, seedFacts } from "../src/seed";
import { connect, DATABASE_URL } from "./connection";

const ISSUES_TO_LOAD = Number(process.env.ISSUES_TO_LOAD ?? 5000);

const facts = seedFacts(ISSUES_TO_LOAD);
const sql = connect();
console.info(`Loading ${facts.length} facts (${ISSUES_TO_LOAD} issues) into ${DATABASE_URL}`);
try {
  await sql.begin((tx) => insertSeedFacts((query, params) => tx.unsafe(query, params as never[]), facts));
  console.info("Done");
} finally {
  await sql.end();
}
