// Seed data as jam_facts rows: the same rows load a standalone PGlite and the
// Postgres behind Electric. Issues are spread evenly across a few projects so
// switching projects exercises selective sync.

import { faker } from "@faker-js/faker";
import { generateNKeysBetween } from "fractional-indexing";
import type { PGliteInterface } from "@electric-sql/pglite";
import { JAM_FACTS_TABLE, factKey } from "@jam/core/server";
import { PriorityValues, StatusValues, projectScope, type Comment, type Issue, type Project } from "./types";

export interface SeedFact {
  key: string;
  scope: string;
}

export const SEED_PROJECTS: Project[] = [
  { id: "web", name: "Web App", key: "WEB", created: "2025-01-06T09:00:00.000Z" },
  { id: "mobile", name: "Mobile", key: "MOB", created: "2025-02-03T09:00:00.000Z" },
  { id: "api", name: "Platform API", key: "API", created: "2025-03-03T09:00:00.000Z" },
  { id: "design", name: "Design System", key: "DES", created: "2025-04-07T09:00:00.000Z" },
];

export function generateSeed(count: number, seed = 1): { projects: Project[]; issues: Issue[]; comments: Comment[] } {
  faker.seed(seed);
  faker.setDefaultRefDate(new Date("2026-08-01T00:00:00Z"));
  const kanbanKeys = faker.helpers.shuffle(generateNKeysBetween(null, null, count));
  const issues: Issue[] = [];
  const comments: Comment[] = [];
  for (let i = 0; i < count; i++) {
    const id = faker.string.uuid();
    const created = faker.date.past({ years: 1 });
    issues.push({
      id,
      project: SEED_PROJECTS[i % SEED_PROJECTS.length].id,
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
        issue: id,
        body: faker.lorem.paragraph(),
        username: faker.internet.username(),
        created: at,
        modified: at,
      });
    }
  }
  return { projects: SEED_PROJECTS, issues, comments };
}

function entityFacts(entity: string, record: { id: string }, scope: string): SeedFact[] {
  return Object.entries(record)
    .filter(([column]) => column !== "id")
    .map(([column, value]) => ({ key: factKey([entity, record.id, column, value as string]), scope }));
}

/** Everything generateSeed() produces, as rows for jam_facts. */
export function seedFacts(count: number, seed = 1): SeedFact[] {
  const { projects, issues, comments } = generateSeed(count, seed);
  const issueProject = new Map(issues.map((issue) => [issue.id, issue.project]));
  return [
    ...projects.flatMap((project) => entityFacts("project", project, "")),
    ...issues.flatMap((issue) => entityFacts("issue", issue, projectScope(issue.project))),
    ...comments.flatMap((comment) => entityFacts("comment", comment, projectScope(issueProject.get(comment.issue)!))),
  ];
}

/** Insert facts straight into a PGlite or Postgres `jam_facts` table in batches. */
export async function insertSeedFacts(
  query: (sql: string, params: unknown[]) => Promise<unknown>,
  facts: SeedFact[],
  batchSize = 1000,
): Promise<void> {
  for (let i = 0; i < facts.length; i += batchSize) {
    await query(
      `INSERT INTO ${JAM_FACTS_TABLE} (key, scope)
       SELECT key, scope FROM json_to_recordset($1) AS t(key TEXT, scope TEXT)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(facts.slice(i, i + batchSize))],
    );
  }
}

/** Seed a standalone PGlite (no Electric) when it has no facts yet. */
export async function seedLocal(pg: PGliteInterface, count: number): Promise<boolean> {
  const existing = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${JAM_FACTS_TABLE}`);
  if (existing.rows[0].n > 0) return false;
  await pg.transaction((tx) => insertSeedFacts((sql, params) => tx.query(sql, params), seedFacts(count)));
  return true;
}
