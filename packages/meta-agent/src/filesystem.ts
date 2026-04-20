import {
  createJamProgramFileSystem,
  normalizeJamProgramPath,
  type JamProgramFileSystem,
} from "@jam/core";

export function createMemoryJamFileSystem(initialFiles: Record<string, string> = {}): JamProgramFileSystem {
  return createJamProgramFileSystem(initialFiles);
}

export function createLocalStorageJamFileSystem(
  namespace: string,
  initialFiles: Record<string, string> = {},
): JamProgramFileSystem {
  const storageKey = `jam:meta-agent:${namespace}:files`;
  const memory = createMemoryJamFileSystem();

  function load() {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [path, content] of Object.entries(parsed)) {
      memory.writeFile(normalizeJamProgramPath(path), content);
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
    if (!memory.readFile(normalizeJamProgramPath(path))) {
      memory.writeFile(normalizeJamProgramPath(path), content);
    }
  }
  save();

  return {
    listFiles: () => memory.listFiles(),
    readFile: (path) => memory.readFile(normalizeJamProgramPath(path)),
    writeFile(path, content) {
      const entry = memory.writeFile(normalizeJamProgramPath(path), content);
      save();
      return entry;
    },
    deleteFile(path) {
      const deleted = memory.deleteFile(normalizeJamProgramPath(path));
      save();
      return deleted;
    },
    loadProgramFile: (path, id) => memory.loadProgramFile(normalizeJamProgramPath(path), id),
  };
}
