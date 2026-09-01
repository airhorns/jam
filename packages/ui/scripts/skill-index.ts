// Regenerates the component index in .agents/skills/jam-ui/SKILL.md from the
// docs' frontmatter. Run with `pnpm skill-index` in packages/ui; the docs test
// fails when the committed index is stale.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { docNameFromPath, parseComponentDoc, renderComponentIndex, spliceComponentIndex } from "../src/docs.ts";

const skillDir = join(import.meta.dirname, "../../../.agents/skills/jam-ui");
const skillPath = join(skillDir, "SKILL.md");

const docs = readdirSync(join(skillDir, "components"))
  .filter((file) => file.endsWith(".md"))
  .map((file) => {
    const doc = parseComponentDoc(readFileSync(join(skillDir, "components", file), "utf8"), file);
    if (doc.name !== docNameFromPath(file)) throw new Error(`${file}: frontmatter name "${doc.name}" does not match the file name`);
    return doc;
  });

const before = readFileSync(skillPath, "utf8");
const after = spliceComponentIndex(before, renderComponentIndex(docs));
if (after !== before) {
  writeFileSync(skillPath, after);
  console.log(`Updated ${skillPath} with ${docs.length} components`);
} else {
  console.log(`${skillPath} is up to date (${docs.length} components)`);
}
