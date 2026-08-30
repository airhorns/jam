import postgres from "postgres";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:54321/linearlite";

export function connect(): postgres.Sql {
  return postgres(DATABASE_URL, { onnotice: () => {} });
}
