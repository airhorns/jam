// The sync server: one `createSyncServer` over a SQLite file, exposed on a
// WebSocket port. Every fact of every jam program lands here, so there is
// nothing app-specific beyond seeding an empty database.
//
//   pnpm server                       # ws://localhost:3001, data in ./data/linearlite.db
//   ISSUES_TO_LOAD=0 pnpm server      # start empty

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { WebSocketServer } from "ws";
import { createSyncServer, sqliteStorage } from "@jam/core/server";
import { seedServer } from "./src/seed";

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.JAM_DB_PATH ?? "./data/linearlite.db";
const ISSUES_TO_LOAD = Number(process.env.ISSUES_TO_LOAD ?? 5000);

mkdirSync(dirname(DB_PATH), { recursive: true });
const server = await createSyncServer({ storage: sqliteStorage(DB_PATH) });
if (server.facts().length === 0 && ISSUES_TO_LOAD > 0) {
  console.info(`Seeding ${ISSUES_TO_LOAD} issues into ${DB_PATH}…`);
  console.info(`Seeded ${await seedServer(server, ISSUES_TO_LOAD)} facts`);
}

const wss = new WebSocketServer({ port: PORT });
wss.on("connection", (socket) => server.handle(socket));
console.info(`Sync server listening on ws://localhost:${PORT} (${server.facts().length} facts, seq ${server.seq})`);
