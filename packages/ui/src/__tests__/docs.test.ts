import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { docNameFromPath, DOC_GROUPS, parseComponentDoc, parseDocPage, renderComponentIndex, spliceComponentIndex } from "../docs";

const skillDir = join(import.meta.dirname, "../../../../.agents/skills/jam-ui");
const componentsDir = join(skillDir, "components");
const files = readdirSync(componentsDir).filter((file) => file.endsWith(".md")).sort();
const read = (file: string) => readFileSync(join(componentsDir, file), "utf8");

/** Every relative `.md` link in a doc must point at a file in the skill (the catalog turns them into pages). */
function expectLinksResolve(markdown: string, fromDir: string, where: string) {
  for (const match of markdown.matchAll(/\]\(((?:\.\.?\/)[^)\s]+\.md)\)/g)) {
    expect(existsSync(join(fromDir, match[1])), `${where} links to ${match[1]}`).toBe(true);
  }
}

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
        expectLinksResolve(doc.body, componentsDir, file);
      });
    });
  }
});

describe("style-system.md", () => {
  const source = readFileSync(join(skillDir, "style-system.md"), "utf8");
  const guide = parseDocPage(source, "style-system.md");

  it("opens with a title and lead and links only to docs that exist", () => {
    expect(guide.title).toBe("@jam/ui style system");
    expect(guide.lead.length).toBeGreaterThan(40);
    expect(guide.body).toMatch(/^## Setup\n/m);
    expectLinksResolve(guide.body, skillDir, "style-system.md");
  });
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
