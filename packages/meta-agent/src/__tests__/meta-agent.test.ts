import { beforeEach, describe, expect, it } from "vitest";
import { $, db, listPrograms, removeProgram, when } from "@jam/core";
import {
  createMemoryJamFileSystem,
  createMetaAgent,
} from "..";

describe("@jam/meta-agent", () => {
  beforeEach(() => {
    for (const id of listPrograms()) {
      removeProgram(id);
    }
    db.clear();
  });

  it("runs browser tools and records the transcript in facts", async () => {
    const agent = createMetaAgent({
      id: "test-agent",
      fs: createMemoryJamFileSystem(),
    });

    await agent.runPrompt("inspect facts and write a Jam program");

    const messages = when(
      ["metaAgentMessage", "test-agent", $.messageId, "role", $.role],
      ["metaAgentMessage", "test-agent", $.messageId, "text", $.text],
    );
    const text = messages.map((message) => String(message.text)).join("\n");

    expect(text).toContain("appSummary");
    expect(text).toContain("inspectFacts");
    expect(text).toContain("writeFile");
    expect(text).toContain("Loaded program");
    expect(when(["meta-agent-demo", "status", $.status])).toEqual([{ status: "loaded" }]);
    expect(agent.fs.readFile("/programs/meta-agent-demo.js")).toBeDefined();
  });

  it("publishes browser file metadata as Jam facts", () => {
    const fs = createMemoryJamFileSystem();

    fs.writeFile("/programs/hello.js", "claim('hello', 'status', 'loaded')");

    expect(when(["metaAgentFile", "/programs/hello.js", "size", $.size])).toEqual([
      { size: "claim('hello', 'status', 'loaded')".length },
    ]);

    fs.deleteFile("/programs/hello.js");

    expect(when(["metaAgentFile", "/programs/hello.js", "size", $.size])).toEqual([]);
  });
});
