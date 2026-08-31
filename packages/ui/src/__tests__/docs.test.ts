import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { docNameFromPath, DOC_GROUPS, parseComponentDoc, renderComponentIndex, spliceComponentIndex } from "../docs";

const skillDir = join(import.meta.dirname, "../../../../.agents/skills/jam-ui");
const componentsDir = join(skillDir, "components");
const files = readdirSync(componentsDir).filter((file) => file.endsWith(".md")).sort();
const read = (file: string) => readFileSync(join(componentsDir, file), "utf8");

describe("component docs", () => {
  it("exist for the library", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  for (const file of files) {
    describe(file, () => {
      const doc = parseComponentDoc(read(file), file);

      it("declares its name, group and description in frontmatter", () => {
        expect(doc.name).toBe(docNameFromPath(file));
        expect(DOC_GROUPS).toContain(doc.group);
        expect(doc.description.length).toBeGreaterThan(20);
        expect(doc.description.endsWith(".")).toBe(true);
      });

      it("opens with a title and a lead paragraph, then a Usage section", () => {
        expect(doc.title.length).toBeGreaterThan(0);
        expect(doc.lead.length).toBeGreaterThan(40);
        expect(doc.body).toMatch(/^## Usage\n/m);
        expect(doc.body).toMatch(/```tsx/);
      });

      it("only links to docs that exist", () => {
        for (const match of doc.body.matchAll(/\]\(\.\/([A-Za-z]+)\.md\)/g)) {
          expect(files, `${file} links to ${match[1]}.md`).toContain(`${match[1]}.md`);
        }
      });
    });
  }
});

describe("parseComponentDoc", () => {
  const good = `---\nname: Thing\ngroup: Forms\ndescription: "Does: a thing."\n---\n\n# Thing\n\nLead line one\nline two.\n\n## Usage\n\nBody.`;

  it("splits frontmatter, title, lead and body", () => {
    const doc = parseComponentDoc(good);
    expect(doc).toEqual({
      name: "Thing",
      group: "Forms",
      description: "Does: a thing.",
      title: "Thing",
      lead: "Lead line one line two.",
      body: "## Usage\n\nBody.",
    });
  });

  it("rejects missing frontmatter, unknown groups and a missing lead", () => {
    expect(() => parseComponentDoc("# Thing\n\nLead.")).toThrow(/frontmatter/);
    expect(() => parseComponentDoc(good.replace("group: Forms", "group: Widgets"))).toThrow(/group "Widgets"/);
    expect(() => parseComponentDoc(good.replace("Lead line one\nline two.\n\n", ""))).toThrow(/lead paragraph/);
  });
});

describe("SKILL.md", () => {
  const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");

  it("has skill frontmatter", () => {
    expect(skill).toMatch(/^---\nname: jam-ui\ndescription: .+\n---\n/);
  });

  it("carries the generated component index (run `pnpm skill-index` in packages/ui to refresh it)", () => {
    const docs = files.map((file) => parseComponentDoc(read(file), file));
    expect(skill).toBe(spliceComponentIndex(skill, renderComponentIndex(docs)));
  });
});
