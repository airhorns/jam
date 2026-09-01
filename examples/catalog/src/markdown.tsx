import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { lexer, type Token, type Tokens } from "marked";
import { Anchor, H3, H4, H5, Paragraph, Separator, YStack, styled } from "@jam/ui";

// Renders the reference docs' markdown through Jam components rather than
// innerHTML, so the docs are themed like the demos and legible to describeUI().

export type MarkdownOptions = {
  /** Called for links to other skill docs instead of navigating; the link still carries an `?c=<page>` href. */
  onNavigate?: (page: string) => void;
};

const Pre = styled("pre", {
  name: "DocPre",
  defaultProps: {
    margin: 0,
    padding: 14,
    fontFamily: "$mono",
    fontSize: 12.5,
    lineHeight: 19,
    color: "$color",
    backgroundColor: "$backgroundHover",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.3",
    overflowX: "auto",
    whiteSpace: "pre",
  },
});

const Code = styled("code", {
  name: "DocCode",
  defaultProps: {
    fontFamily: "$mono",
    fontSize: "0.9em",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: "$radius.2",
    backgroundColor: "$backgroundHover",
  },
});

const Table = styled("table", {
  name: "DocTable",
  defaultProps: {
    width: "100%",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "left",
    style: { borderCollapse: "collapse" },
  },
});

const Th = styled("th", {
  name: "DocTh",
  defaultProps: {
    padding: 8,
    paddingLeft: 0,
    fontWeight: "600",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "$borderColorHover",
    verticalAlign: "bottom",
  },
});

const Td = styled("td", {
  name: "DocTd",
  defaultProps: {
    padding: 8,
    paddingLeft: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "$borderColor",
    verticalAlign: "top",
  },
});

// Lists stay block-level so each `li` keeps its `::marker`; the items space themselves.
const List = styled("ul", {
  name: "DocList",
  defaultProps: {
    margin: 0,
    paddingLeft: 22,
  },
});

const ListItem = styled("li", {
  name: "DocListItem",
  defaultProps: {
    paddingVertical: 2,
  },
});

const Quote = styled("blockquote", {
  name: "DocQuote",
  defaultProps: {
    margin: 0,
    paddingLeft: 14,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: "$borderColorHover",
    opacity: 0.85,
  },
});

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// A relative link to another file in the skill: `./Dialog.md` or `../style-system.md`
// from a component doc, `./components/Slot.md` from a guide. Each is a catalog page.
const DOC_LINK = /^(?:\.\.?\/)+(?:components\/)?([A-Za-z][A-Za-z-]*)\.md$/;

/** The `?c=` page a skill-relative doc link points at, or null for any other href. */
export function docLinkTarget(href: string): string | null {
  return DOC_LINK.exec(href)?.[1] ?? null;
}

function renderInline(tokens: Token[] | undefined, options: MarkdownOptions): VChild[] {
  if (!tokens) return [];
  return tokens.map((token, i): VChild => {
    switch (token.type) {
      case "text":
        return (token as Tokens.Text).text;
      case "escape":
        return (token as Tokens.Escape).text;
      case "strong":
        return <strong key={i}>{renderInline((token as Tokens.Strong).tokens, options)}</strong>;
      case "em":
        return <em key={i}>{renderInline((token as Tokens.Em).tokens, options)}</em>;
      case "del":
        return <del key={i}>{renderInline((token as Tokens.Del).tokens, options)}</del>;
      case "codespan":
        return <Code key={i}>{(token as Tokens.Codespan).text}</Code>;
      case "br":
        return <br key={i} />;
      case "link": {
        const link = token as Tokens.Link;
        const page = docLinkTarget(link.href);
        if (page) {
          return (
            <Anchor
              key={i}
              href={`?c=${page}`}
              onClick={(event: Event) => {
                if (!options.onNavigate) return;
                event.preventDefault();
                options.onNavigate(page);
              }}
            >
              {renderInline(link.tokens, options)}
            </Anchor>
          );
        }
        const external = /^https?:/.test(link.href);
        return (
          <Anchor key={i} href={link.href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
            {renderInline(link.tokens, options)}
          </Anchor>
        );
      }
      case "image":
        return <img key={i} src={(token as Tokens.Image).href} alt={(token as Tokens.Image).text} style={{ maxWidth: "100%" }} />;
      case "html":
        return (token as Tokens.HTML).text;
      default:
        return (token as { raw?: string }).raw ?? "";
    }
  });
}

function renderBlock(token: Token, key: number, options: MarkdownOptions): VChild {
  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const heading = token as Tokens.Heading;
      const id = slugify(heading.text);
      const children = renderInline(heading.tokens, options);
      // The doc's H1 becomes the page title; its sections nest under that.
      if (heading.depth <= 2) return <H3 key={key} id={id} size="$7" marginTop="$space.3">{children}</H3>;
      if (heading.depth === 3) return <H4 key={key} id={id} size="$6" marginTop="$space.2">{children}</H4>;
      return <H5 key={key} id={id} size="$5">{children}</H5>;
    }
    case "paragraph":
      return <Paragraph key={key} margin={0}>{renderInline((token as Tokens.Paragraph).tokens, options)}</Paragraph>;
    case "code": {
      const code = token as Tokens.Code;
      return (
        <Pre key={key} data-lang={code.lang || undefined}>
          <code>{code.text}</code>
        </Pre>
      );
    }
    case "blockquote":
      return <Quote key={key}>{renderBlocks((token as Tokens.Blockquote).tokens, options)}</Quote>;
    case "list": {
      const list = token as Tokens.List;
      return (
        <List key={key} tag={list.ordered ? "ol" : "ul"} start={list.ordered && list.start !== "" && list.start !== 1 ? list.start : undefined}>
          {list.items.map((item, i) => <ListItem key={i}>{renderListItemChildren(item, options)}</ListItem>)}
        </List>
      );
    }
    case "table": {
      const table = token as Tokens.Table;
      return (
        <YStack key={key} overflowX="auto">
          <Table>
            <thead>
              <tr>
                {table.header.map((cell, i) => <Th key={i} textAlign={cell.align ?? "left"}>{renderInline(cell.tokens, options)}</Th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => <Td key={c} textAlign={cell.align ?? "left"}>{renderInline(cell.tokens, options)}</Td>)}
                </tr>
              ))}
            </tbody>
          </Table>
        </YStack>
      );
    }
    case "hr":
      return <Separator key={key} marginVertical="$space.2" />;
    case "html":
      return <Paragraph key={key} margin={0}>{(token as Tokens.HTML).text}</Paragraph>;
    case "text":
      return <Paragraph key={key} margin={0}>{renderInline((token as Tokens.Text).tokens ?? [token], options)}</Paragraph>;
    default:
      return <Paragraph key={key} margin={0}>{(token as { raw?: string }).raw ?? ""}</Paragraph>;
  }
}

function renderListItemChildren(item: Tokens.ListItem, options: MarkdownOptions): VChild[] {
  return item.tokens.map((token, i) =>
    token.type === "text" ? renderInline((token as Tokens.Text).tokens, options) : renderBlock(token, i, options),
  ).flat();
}

function renderBlocks(tokens: Token[], options: MarkdownOptions): VChild[] {
  return tokens.map((token, i) => renderBlock(token, i, options)).filter((node) => node != null);
}

/** Markdown as a column of Jam elements. */
export function renderMarkdown(markdown: string, options: MarkdownOptions = {}): VChild[] {
  return renderBlocks(lexer(markdown), options);
}

/** A single paragraph of markdown as inline children, for a lead or a description inside an existing element. */
export function renderInlineMarkdown(markdown: string, options: MarkdownOptions = {}): VChild[] {
  return lexer(markdown).flatMap((token) =>
    token.type === "paragraph" || token.type === "text" ? renderInline((token as Tokens.Paragraph).tokens, options) : [],
  );
}
