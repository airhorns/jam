import { faker } from "@faker-js/faker";
import { generateNKeysBetween } from "fractional-indexing";
import type { PGliteInterface } from "@electric-sql/pglite";
import { PriorityValues, StatusValues } from "./types";

export interface SeedIssue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  created: string;
  modified: string;
  kanbanorder: string;
  username: string;
}

export interface SeedComment {
  id: string;
  body: string;
  username: string;
  issue_id: string;
  created: string;
  modified: string;
}

export function generateSeed(count: number, seed = 1): { issues: SeedIssue[]; comments: SeedComment[] } {
  faker.seed(seed);
  faker.setDefaultRefDate(new Date("2026-08-01T00:00:00Z"));
  const kanbanKeys = faker.helpers.shuffle(generateNKeysBetween(null, null, count));
  const issues: SeedIssue[] = [];
  const comments: SeedComment[] = [];
  for (let i = 0; i < count; i++) {
    const id = faker.string.uuid();
    const created = faker.date.past({ years: 1 });
    issues.push({
      id,
      title: faker.lorem.sentence({ min: 3, max: 8 }),
      description: faker.lorem.sentences({ min: 2, max: 6 }, "\n"),
      priority: faker.helpers.arrayElement(PriorityValues),
      status: faker.helpers.arrayElement(StatusValues),
      created: created.toISOString(),
      modified: faker.date.between({ from: created, to: faker.defaultRefDate() }).toISOString(),
      kanbanorder: kanbanKeys[i],
      username: faker.internet.username(),
    });
    const commentCount = faker.number.int({ min: 0, max: 2 });
    for (let c = 0; c < commentCount; c++) {
      const at = faker.date.between({ from: created, to: faker.defaultRefDate() }).toISOString();
      comments.push({
        id: faker.string.uuid(),
        body: faker.lorem.paragraph(),
        username: faker.internet.username(),
        issue_id: id,
        created: at,
        modified: at,
      });
    }
  }
  return { issues, comments };
}

/** Insert generated data straight into a PGlite instance (standalone mode, no Electric). */
export async function seedLocal(pg: PGliteInterface, count: number): Promise<void> {
  const { issues, comments } = generateSeed(count);
  await pg.transaction(async (tx) => {
    for (const batch of chunk(issues, 500)) {
      await tx.query(
        `INSERT INTO issue (id, title, description, priority, status, created, modified, kanbanorder, username)
         SELECT * FROM json_to_recordset($1) AS t(
           id UUID, title TEXT, description TEXT, priority TEXT, status TEXT,
           created TIMESTAMPTZ, modified TIMESTAMPTZ, kanbanorder TEXT, username TEXT)`,
        [JSON.stringify(batch)],
      );
    }
    for (const batch of chunk(comments, 500)) {
      await tx.query(
        `INSERT INTO comment (id, body, username, issue_id, created, modified)
         SELECT * FROM json_to_recordset($1) AS t(
           id UUID, body TEXT, username TEXT, issue_id UUID, created TIMESTAMPTZ, modified TIMESTAMPTZ)`,
        [JSON.stringify(batch)],
      );
    }
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
