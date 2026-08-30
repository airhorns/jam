import { generateSeed } from "../src/seed";
import { connect, DATABASE_URL } from "./connection";

const ISSUES_TO_LOAD = Number(process.env.ISSUES_TO_LOAD ?? 5000);
const BATCH_SIZE = 1000;

const { issues, comments } = generateSeed(ISSUES_TO_LOAD);
const sql = connect();
console.info(`Loading ${issues.length} issues and ${comments.length} comments into ${DATABASE_URL}`);
try {
  await sql.begin(async (tx) => {
    for (let i = 0; i < issues.length; i += BATCH_SIZE) {
      await tx`INSERT INTO issue ${tx(issues.slice(i, i + BATCH_SIZE))} ON CONFLICT (id) DO NOTHING`;
    }
    for (let i = 0; i < comments.length; i += BATCH_SIZE) {
      await tx`INSERT INTO comment ${tx(comments.slice(i, i + BATCH_SIZE))} ON CONFLICT (id) DO NOTHING`;
    }
  });
  console.info("Done");
} finally {
  await sql.end();
}
