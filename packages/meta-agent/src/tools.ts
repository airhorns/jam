import { db, listPrograms, programIdFromPath, select } from "@jam/core";
import type { MetaAgentTool, MetaAgentToolContext, MetaAgentToolResult } from "./types";

interface InspectFactsInput {
  prefix?: string;
  limit?: number;
}

interface InspectVdomInput {
  selector?: string;
  limit?: number;
}

interface FilePathInput {
  path: `/${string}`;
}

interface WriteFileInput extends FilePathInput {
  content: string;
}

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function summarizeResult(title: string, data: unknown): MetaAgentToolResult {
  return {
    title,
    content: formatJson(data),
    data,
  };
}

export function createInspectFactsTool(): MetaAgentTool<InspectFactsInput> {
  return {
    name: "inspectFacts",
    description: "Inspect facts currently stored in the Jam fact database.",
    run(input = {}) {
      const limit = Math.max(1, Math.min(input.limit ?? 40, 200));
      const prefix = input.prefix;
      const facts = Array.from(db.facts.values())
        .filter((fact) => (prefix ? String(fact[0]).startsWith(prefix) : true))
        .slice(0, limit);

      return summarizeResult("Jam facts", {
        count: db.facts.size,
        returned: facts.length,
        facts,
      });
    },
  };
}

export function createInspectVdomTool(): MetaAgentTool<InspectVdomInput> {
  return {
    name: "inspectVdom",
    description: "Inspect rendered VDOM elements through Jam selector queries.",
    run(input = {}) {
      const selector = input.selector ?? "div";
      const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
      const elements = select(selector).slice(0, limit);

      return summarizeResult("Jam VDOM", {
        selector,
        returned: elements.length,
        elements,
      });
    },
  };
}

export function createListProgramsTool(): MetaAgentTool {
  return {
    name: "listPrograms",
    description: "List currently registered Jam programs and editable program files.",
    run(_input, context) {
      return summarizeResult("Jam programs", {
        registered: listPrograms(),
        files: context.fs.listFiles().map(({ path, updatedAt, content }) => ({
          path,
          updatedAt,
          size: content.length,
        })),
      });
    },
  };
}

export function createReadFileTool(): MetaAgentTool<FilePathInput> {
  return {
    name: "readFile",
    description: "Read a Jam program file from the browser file system.",
    run(input, context) {
      const entry = context.fs.readFile(input.path);
      return summarizeResult("Read program file", entry ?? { path: input.path, missing: true });
    },
  };
}

export function createWriteFileTool(): MetaAgentTool<WriteFileInput> {
  return {
    name: "writeFile",
    description: "Write a Jam program file into the browser file system.",
    run(input, context) {
      const entry = context.fs.writeFile(input.path, input.content);
      return summarizeResult("Wrote program file", {
        path: entry.path,
        updatedAt: entry.updatedAt,
        size: entry.content.length,
      });
    },
  };
}

export function createLoadProgramTool(): MetaAgentTool<FilePathInput & { id?: string }> {
  return {
    name: "loadProgram",
    description: "Load a Jam program from a browser file into the running app.",
    run(input, context) {
      const entry = context.fs.readFile(input.path);
      if (!entry) {
        return summarizeResult("Program load failed", {
          path: input.path,
          error: "File not found",
        });
      }

      const id = input.id ?? programIdFromPath(entry.path);
      const loaded = context.fs.loadProgramFile(entry.path, id);
      if (!loaded) {
        return summarizeResult("Program load failed", {
          path: input.path,
          error: "File not found",
        });
      }
      return summarizeResult("Loaded program", {
        id,
        path: loaded.entry.path,
      });
    },
  };
}

export function createAppSummaryTool(): MetaAgentTool {
  return {
    name: "appSummary",
    description: "Summarize app state useful for orienting an in-app agent.",
    run(_input, context) {
      const facts = Array.from(db.facts.values());
      const domFacts = facts.filter((fact) => String(fact[0]) === "dom" || String(fact[0]).startsWith("dom:"));
      const vdomFacts = facts.filter((fact) =>
        fact[1] === "tag" || fact[1] === "prop" || fact[1] === "class" || fact[1] === "child"
      );

      return summarizeResult("Jam app summary", {
        totalFacts: facts.length,
        vdomFacts: vdomFacts.length,
        domFacts: domFacts.length,
        registeredPrograms: listPrograms(),
        editableFiles: context.fs.listFiles().map((entry) => entry.path),
      });
    },
  };
}

export function createDefaultMetaAgentTools(): MetaAgentTool[] {
  return [
    createAppSummaryTool(),
    createInspectFactsTool(),
    createInspectVdomTool(),
    createListProgramsTool(),
    createReadFileTool(),
    createWriteFileTool(),
    createLoadProgramTool(),
  ];
}
