import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const root = new URL("..", import.meta.url).pathname;
const srcDir = join(root, "src");
const intrinsicTags = new Set([
  "a",
  "article",
  "aside",
  "button",
  "div",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "img",
  "input",
  "label",
  "li",
  "main",
  "nav",
  "ol",
  "option",
  "p",
  "section",
  "select",
  "span",
  "textarea",
  "ul",
]);

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (name === "__tests__" || name === "testing") continue;
      entries.push(...walk(path));
      continue;
    }
    if (!/\.[tj]sx?$/.test(name)) continue;
    if (/\.test\.[tj]sx?$/.test(name)) continue;
    entries.push(path);
  }
  return entries;
}

function lineAndColumn(sourceFile, pos) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
  return `${line + 1}:${character + 1}`;
}

function isIntrinsicJsxTag(tagName) {
  return ts.isIdentifier(tagName) && intrinsicTags.has(tagName.text);
}

function inspect(file) {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const failures = [];

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (isIntrinsicJsxTag(node.tagName)) {
        failures.push({
          pos: node.tagName.getStart(sourceFile),
          message: `raw JSX tag <${node.tagName.text}>`,
        });
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "h" &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]) &&
      intrinsicTags.has(node.arguments[0].text)
    ) {
      failures.push({
        pos: node.arguments[0].getStart(sourceFile),
        message: `raw h("${node.arguments[0].text}") call`,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return failures.map((failure) => {
    const location = `${relative(root, file)}:${lineAndColumn(sourceFile, failure.pos)}`;
    return `${location} ${failure.message}`;
  });
}

const failures = walk(srcDir).flatMap(inspect);

if (failures.length > 0) {
  console.error("Raw intrinsic UI primitives are not allowed in the puddy app.");
  console.error("Use @jam/ui components so the same UI surface can run on web and native.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("No raw intrinsic JSX or h(\"tag\") calls found in puddy source.");
