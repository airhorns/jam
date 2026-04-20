import { forget, remember, transaction, _ } from "@jam/core";
import type { JamFileEntry, JamFileSystem, JamProgramPath } from "./types";

function normalizePath(path: string): JamProgramPath {
  if (!path.startsWith("/")) return `/${path}`;
  return path as JamProgramPath;
}

function publishFileFact(entry: JamFileEntry): void {
  transaction(() => {
    forget("metaAgentFile", entry.path, _, _);
    remember("metaAgentFile", entry.path, "updatedAt", entry.updatedAt);
    remember("metaAgentFile", entry.path, "size", entry.content.length);
  });
}

function forgetFileFact(path: JamProgramPath): void {
  forget("metaAgentFile", path, _, _);
}

export function createMemoryJamFileSystem(initialFiles: Record<string, string> = {}): JamFileSystem {
  const files = new Map<JamProgramPath, JamFileEntry>();

  const fs: JamFileSystem = {
    listFiles() {
      return Array.from(files.values()).sort((a, b) => a.path.localeCompare(b.path));
    },
    readFile(path) {
      return files.get(normalizePath(path));
    },
    writeFile(path, content) {
      const entry = {
        path: normalizePath(path),
        content,
        updatedAt: Date.now(),
      };
      files.set(entry.path, entry);
      publishFileFact(entry);
      return entry;
    },
    deleteFile(path) {
      const normalized = normalizePath(path);
      const deleted = files.delete(normalized);
      if (deleted) forgetFileFact(normalized);
      return deleted;
    },
  };

  for (const [path, content] of Object.entries(initialFiles)) {
    fs.writeFile(normalizePath(path), content);
  }

  return fs;
}

export function createLocalStorageJamFileSystem(
  namespace: string,
  initialFiles: Record<string, string> = {},
): JamFileSystem {
  const storageKey = `jam:meta-agent:${namespace}:files`;
  const memory = createMemoryJamFileSystem();

  function load() {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [path, content] of Object.entries(parsed)) {
      memory.writeFile(normalizePath(path), content);
    }
  }

  function save() {
    if (typeof localStorage === "undefined") return;
    const snapshot = Object.fromEntries(
      memory.listFiles().map((entry) => [entry.path, entry.content]),
    );
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }

  load();
  for (const [path, content] of Object.entries(initialFiles)) {
    if (!memory.readFile(normalizePath(path))) {
      memory.writeFile(normalizePath(path), content);
    }
  }
  save();

  return {
    listFiles: () => memory.listFiles(),
    readFile: (path) => memory.readFile(normalizePath(path)),
    writeFile(path, content) {
      const entry = memory.writeFile(normalizePath(path), content);
      save();
      return entry;
    },
    deleteFile(path) {
      const deleted = memory.deleteFile(normalizePath(path));
      save();
      return deleted;
    },
  };
}
