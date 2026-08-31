// The component reference docs live in `.agents/skills/jam-ui/components/<Name>.md`
// as plain markdown with a small frontmatter block. This module parses that
// shape for the catalog site, the skill index generator and the docs test.

export const DOC_GROUPS = ["Layout", "Typography", "Forms", "Overlays", "Content", "Feedback", "Navigation", "Utilities"] as const;

export type DocGroup = (typeof DOC_GROUPS)[number];

export type ComponentDoc = {
  /** Component name as registered in the catalog; matches the file name. */
  name: string;
  group: DocGroup;
  /** One-line summary for indexes and sidebars. */
  description: string;
  /** The H1 text, e.g. "Square and Circle" for Shapes.md. */
  title: string;
  /** The paragraph under the H1. */
  lead: string;
  /** Markdown after the lead paragraph: usage, props, parts, theming, accessibility. */
  body: string;
};

/** A guide such as style-system.md: an H1, a lead paragraph and the rest. */
export type DocPage = Pick<ComponentDoc, "title" | "lead" | "body">;

export class DocParseError extends Error {}

function parseFrontmatter(source: string, where: string): { fields: Record<string, string>; rest: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  if (!match) throw new DocParseError(`${where}: missing frontmatter block`);
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon === -1) throw new DocParseError(`${where}: frontmatter line is not key: value: ${line}`);
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
    fields[key] = value;
  }
  return { fields, rest: source.slice(match[0].length) };
}

/** Split markdown that starts with an H1 into title, lead paragraph and body. */
export function parseDocPage(markdown: string, where = "doc"): DocPage {
  const heading = /^# (.+)\r?\n/.exec(markdown.trimStart());
  if (!heading) throw new DocParseError(`${where}: the markdown must start with an H1`);
  const afterHeading = markdown.trimStart().slice(heading[0].length).trimStart();
  const leadEnd = afterHeading.search(/\r?\n\s*\r?\n/);
  const lead = (leadEnd === -1 ? afterHeading : afterHeading.slice(0, leadEnd)).replace(/\s*\r?\n\s*/g, " ").trim();
  if (lead.startsWith("#") || lead.startsWith("```")) throw new DocParseError(`${where}: the H1 must be followed by a lead paragraph`);
  const body = leadEnd === -1 ? "" : afterHeading.slice(leadEnd).trim();
  return { title: heading[1].trim(), lead, body };
}

/** Parse one component doc. `where` names the file in error messages. */
export function parseComponentDoc(source: string, where = "doc"): ComponentDoc {
  const { fields, rest } = parseFrontmatter(source, where);
  for (const key of ["name", "group", "description"]) {
    if (!fields[key]) throw new DocParseError(`${where}: frontmatter needs a ${key}`);
  }
  if (!(DOC_GROUPS as readonly string[]).includes(fields.group)) {
    throw new DocParseError(`${where}: group "${fields.group}" is not one of ${DOC_GROUPS.join(", ")}`);
  }
  return {
    name: fields.name,
    group: fields.group as DocGroup,
    description: fields.description,
    ...parseDocPage(rest, where),
  };
}

/** The component name a doc file is expected to declare, from its path. */
export function docNameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop()!.replace(/\.md$/, "");
}

/** Group docs in `DOC_GROUPS` order, keeping the given order within a group. */
export function groupDocs<T extends { group: DocGroup }>(docs: T[]): Map<DocGroup, T[]> {
  const groups = new Map<DocGroup, T[]>();
  for (const group of DOC_GROUPS) {
    const members = docs.filter((doc) => doc.group === group);
    if (members.length > 0) groups.set(group, members);
  }
  return groups;
}

export const INDEX_START = "<!-- components:start -->";
export const INDEX_END = "<!-- components:end -->";

/** The markdown index of components that sits between the markers in SKILL.md. */
export function renderComponentIndex(docs: ComponentDoc[]): string {
  const lines: string[] = [];
  for (const [group, members] of groupDocs([...docs].sort((a, b) => a.name.localeCompare(b.name)))) {
    lines.push(`### ${group}`, "");
    for (const doc of members) {
      const title = doc.title === doc.name ? doc.name : `${doc.name} (${doc.title})`;
      lines.push(`- [${title}](./components/${doc.name}.md) — ${doc.description}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** SKILL.md with its component index replaced by `index`. */
export function spliceComponentIndex(skill: string, index: string): string {
  const start = skill.indexOf(INDEX_START);
  const end = skill.indexOf(INDEX_END);
  if (start === -1 || end === -1 || end < start) throw new DocParseError(`SKILL.md needs ${INDEX_START} … ${INDEX_END} markers`);
  return `${skill.slice(0, start + INDEX_START.length)}\n${index}\n${skill.slice(end)}`;
}
