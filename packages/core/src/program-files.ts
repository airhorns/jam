import { db, $, _, type Term } from "./db";
import { forget, remember, transaction } from "./primitives";
import { loadProgramSource } from "./programs";

export const JAM_PROGRAM_FILE_FACT = "jamProgramFile";

export type JamProgramPath = `/${string}`;

export interface JamProgramFileEntry {
  path: JamProgramPath;
  content: string;
  updatedAt: number;
}

export interface LoadedJamProgramFile {
  id: string;
  entry: JamProgramFileEntry;
}

export interface JamProgramFileSystem {
  listFiles(): JamProgramFileEntry[];
  readFile(path: JamProgramPath): JamProgramFileEntry | undefined;
  writeFile(path: JamProgramPath, content: string): JamProgramFileEntry;
  deleteFile(path: JamProgramPath): boolean;
  loadProgramFile(path: JamProgramPath, id?: string): LoadedJamProgramFile | undefined;
}

export function normalizeJamProgramPath(path: string): JamProgramPath {
  if (!path.startsWith("/")) return `/${path}`;
  return path as JamProgramPath;
}

export function programIdFromPath(path: JamProgramPath): string {
  return path.replace(/^\//, "").replace(/[^\w/-]/g, "-");
}

export function writeJamProgramFile(path: JamProgramPath, content: string): JamProgramFileEntry {
  const entry = {
    path: normalizeJamProgramPath(path),
    content,
    updatedAt: Date.now(),
  };

  transaction(() => {
    forget(JAM_PROGRAM_FILE_FACT, entry.path, _, _);
    remember(JAM_PROGRAM_FILE_FACT, entry.path, "content", entry.content);
    remember(JAM_PROGRAM_FILE_FACT, entry.path, "updatedAt", entry.updatedAt);
    remember(JAM_PROGRAM_FILE_FACT, entry.path, "size", entry.content.length);
  });

  return entry;
}

export function readJamProgramFile(path: JamProgramPath): JamProgramFileEntry | undefined {
  const normalized = normalizeJamProgramPath(path);
  const content = db.query([JAM_PROGRAM_FILE_FACT, normalized, "content", $.content])[0]?.content;
  if (typeof content !== "string") return undefined;

  const updatedAt = db.query([JAM_PROGRAM_FILE_FACT, normalized, "updatedAt", $.updatedAt])[0]?.updatedAt;
  return {
    path: normalized,
    content,
    updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
  };
}

export function listJamProgramFiles(): JamProgramFileEntry[] {
  return db
    .query(
      [JAM_PROGRAM_FILE_FACT, $.path, "content", $.content],
      [JAM_PROGRAM_FILE_FACT, $.path, "updatedAt", $.updatedAt],
    )
    .filter((file): file is { path: Term; content: Term; updatedAt: Term } =>
      typeof file.path === "string" && typeof file.content === "string",
    )
    .map(({ path, content, updatedAt }) => ({
      path: normalizeJamProgramPath(path as string),
      content: content as string,
      updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function deleteJamProgramFile(path: JamProgramPath): boolean {
  const normalized = normalizeJamProgramPath(path);
  const existed = readJamProgramFile(normalized) !== undefined;
  if (existed) forget(JAM_PROGRAM_FILE_FACT, normalized, _, _);
  return existed;
}

export function loadJamProgramFile(path: JamProgramPath, id = programIdFromPath(path)): LoadedJamProgramFile | undefined {
  const normalized = normalizeJamProgramPath(path);
  const entry = readJamProgramFile(normalized);
  if (!entry) return undefined;

  loadProgramSource(id, entry.content);
  transaction(() => {
    remember(JAM_PROGRAM_FILE_FACT, entry.path, "programId", id);
    remember(JAM_PROGRAM_FILE_FACT, entry.path, "loadedAt", Date.now());
  });
  return { id, entry };
}

export function createJamProgramFileSystem(initialFiles: Record<string, string> = {}): JamProgramFileSystem {
  const fs: JamProgramFileSystem = {
    listFiles: listJamProgramFiles,
    readFile: (path) => readJamProgramFile(normalizeJamProgramPath(path)),
    writeFile: (path, content) => writeJamProgramFile(normalizeJamProgramPath(path), content),
    deleteFile: (path) => deleteJamProgramFile(normalizeJamProgramPath(path)),
    loadProgramFile: (path, id) => loadJamProgramFile(normalizeJamProgramPath(path), id),
  };

  for (const [path, content] of Object.entries(initialFiles)) {
    if (!fs.readFile(normalizeJamProgramPath(path))) {
      fs.writeFile(normalizeJamProgramPath(path), content);
    }
  }

  return fs;
}
