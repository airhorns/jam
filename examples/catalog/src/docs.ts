import { docNameFromPath, parseComponentDoc, type ComponentDoc } from "@jam/ui/docs";

// The reference docs are the jam-ui skill's markdown files, bundled as strings.
const sources = import.meta.glob("../../../.agents/skills/jam-ui/components/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const componentDocs: ComponentDoc[] = Object.entries(sources).map(([path, source]) => {
  const doc = parseComponentDoc(source, path);
  if (doc.name !== docNameFromPath(path)) throw new Error(`${path}: frontmatter name "${doc.name}" does not match the file name`);
  return doc;
});

export function findDoc(name: string): ComponentDoc | undefined {
  return componentDocs.find((doc) => doc.name === name);
}
