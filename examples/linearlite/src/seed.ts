// Seed data as facts: the same facts fill a standalone browser database and
// the sync server. Issues are spread evenly across a few projects so switching
// projects exercises selective sync.

import { faker } from "@faker-js/faker";
import { generateNKeysBetween } from "fractional-indexing";
import type { FactStorage, StoredFact } from "@jam/core";
import type { SyncServer } from "@jam/core/server";
import { PriorityValues, StatusValues, projectScope, type Comment, type Issue, type Project } from "./types";

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

/** One `[entity, id, column, value]` fact per column of a record. */
export function entityFacts(entity: string, record: { id: string }, scope: string): StoredFact[] {
  return Object.entries(record)
    .filter(([column]) => column !== "id")
    .map(([column, value]) => ({ terms: [entity, record.id, column, value as string], scope }));
}

/** Everything generateSeed() produces, as stored facts. */
export function seedFacts(count: number, seed = 1): StoredFact[] {
  const { projects, issues, comments } = generateSeed(count, seed);
  const issueProject = new Map(issues.map((issue) => [issue.id, issue.project]));
  return [
    ...projects.flatMap((project) => entityFacts("project", project, "")),
    ...issues.flatMap((issue) => entityFacts("issue", issue, projectScope(issue.project))),
    ...comments.flatMap((comment) => entityFacts("comment", comment, projectScope(issueProject.get(comment.issue)!))),
  ];
}

/** Fill a standalone browser database when it has no facts yet. */
export async function seedLocal(storage: FactStorage, count: number): Promise<boolean> {
  if ((await storage.load()).length > 0) return false;
  await storage.write({ upserts: seedFacts(count), deletes: [] });
  return true;
}

/** Commit the seed to a sync server in batches, each one transaction in its log. */
export async function seedServer(server: SyncServer, count: number, batchSize = 2000): Promise<number> {
  const facts = seedFacts(count);
  for (let i = 0; i < facts.length; i += batchSize) {
    await server.apply(facts.slice(i, i + batchSize).map((fact) => ({ op: "upsert" as const, terms: fact.terms, scope: fact.scope })));
  }
  return facts.length;
}
