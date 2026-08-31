import { docNameFromPath, parseComponentDoc, parseDocPage, type ComponentDoc, type DocPage } from "@jam/ui/docs";
import styleSystem from "../../../.agents/skills/jam-ui/style-system.md?raw";

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

/** A skill guide that is not about one component; `slug` is its `?c=` value and file name. */
export type Guide = DocPage & { slug: string; path: string };

export const guides: Guide[] = [
  { slug: "style-system", path: ".agents/skills/jam-ui/style-system.md", ...parseDocPage(styleSystem, "style-system.md") },
];

export function findGuide(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug.toLowerCase());
}
