---
name: Text
group: Typography
description: Text, SizableText, Paragraph, Anchor and the Heading family, sized from the font scale.
---

# Text

The typography primitives. `Text` is a bare inline `<span>` with text
wrapping behaviour; `SizableText` adds a `size` token that pulls font size,
line height, weight and letter spacing from the active font; `Paragraph` is
body copy in a `<p>`; `Heading` and `H1`–`H6` use the heading font at
descending sizes; `Anchor` is `SizableText` rendered as an `<a>`.

## Usage

```tsx
import { Anchor, Paragraph, SizableText, H2, Text, YStack } from "@jam/ui";

<YStack gap="$3">
  <H2>Release notes</H2>
  <Paragraph>Body copy at the default size, wrapping normally.</Paragraph>
  <Anchor href="/changelog" size="$3">Read the full changelog</Anchor>
  <SizableText size="$2" color="$color10">Small secondary text.</SizableText>
  <SizableText size="$6" fontFamily="$heading" fontWeight="700">Custom heading-ish text</SizableText>
  <Text ellipsis maxWidth={200}>A very long single line that truncates with an ellipsis…</Text>
  <Text numberOfLines={2}>Multi-line copy clamped to two lines with an ellipsis at the end.</Text>
</YStack>
```

## Components

| Component | Tag | Font | Default `size` | Notes |
| --- | --- | --- | --- | --- |
| `Text` | `span` | inherits | — | `display: inline`, `white-space: pre-wrap`, `word-wrap: break-word`, zero margin. Accepts every text style prop but applies no font or colour of its own. |
| `SizableText` | `span` | `$body` | `$true` (15px) | Adds the `size` variant and `$color`. `unstyled` drops both defaults. |
| `Paragraph` | `p` | `$body` | `$true` | `white-space: normal`, `user-select: auto`, `$color`. |
| `Heading` | `span` (`role="heading"`) | `$heading` | `$8` (26px) | Base for the numbered headings; use it when the semantic level is set elsewhere. |
| `H1` … `H6` | `h1` … `h6` | `$heading` | `$10`, `$9`, `$8`, `$7`, `$6`, `$5` | Real heading elements with zero margin. |
| `Anchor` | `a` | `$body` | `$true` | `SizableText` as a link: takes `href`, `target` and `rel`, keeps the browser underline (set `textDecorationLine="none"` to drop it) and the theme's `$color` rather than the browser link blue. |

## Props

All of them take the style props (`color`, `fontFamily`, `fontSize`,
`fontWeight`, `letterSpacing`, `lineHeight`, `textAlign`, `textTransform`,
spacing, layout…) plus:

| Prop | Type | Description |
| --- | --- | --- |
| `size` | font size token | (`SizableText` and descendants) Sets `fontSize`, `lineHeight`, `fontWeight` and `letterSpacing` from the font's tables for that step. Explicit `fontSize`/`fontWeight` props override individual values. |
| `fontFamily` | font token | `$body`, `$heading`, `$mono`, or any configured font. The font in effect decides what `size` resolves to. |
| `ellipsis` | `boolean` | Single line, `overflow: hidden`, `text-overflow: ellipsis`, `max-width: 100%`. |
| `numberOfLines` | `number` | `1` behaves like `ellipsis`; larger values clamp with `-webkit-line-clamp`. |
| `unstyled` | `boolean` | (`SizableText`) No default `size` or `color`. |

## Font sizes

The default `$body` font: `$1` 12px, `$2` 13px, `$3` 14px, `$4`/`$true`
15px, `$5` 16px, `$6` 18px, `$7` 22px, `$8` 26px, `$9` 30px, `$10` 40px,
`$11` 46px, `$12` 52px and up to `$16` 100px. Line heights taper from 150% at
small sizes to about 142% at 40px; the heading font uses tighter line
heights and heavier weights per step.

## Wrapping bare strings

Components that accept text children (`Button`, `ListItem`, `Card` parts…)
wrap bare strings and numbers in their own text part via
`wrapChildrenInText`, forwarding `color`, `fontFamily`, `fontSize`,
`fontWeight`, `fontStyle`, `letterSpacing`, `textAlign`, `size` and
`ellipsis` from the parent. Adjacent strings become one text element;
element children pass through untouched. Pass `noTextWrap` to opt out or
`textProps` to add props to the wrapper.

## Theming

`SizableText`, `Paragraph` and headings default to `$color`; secondary text
conventionally uses `$color10` or `$color11`. There are no component themes
for text.

## Accessibility

- Use `H1`–`H6` for document structure; `Heading` alone announces as a
  heading without a level.
- `Paragraph` renders a `<p>` so screen readers treat it as a block of copy;
  `Text` and `SizableText` are inline and semantically neutral.
- `Anchor` is a real `<a>`, so it needs an `href` to be focusable and to
  announce as a link. Its underline is the only colour-independent cue that
  the text is a link; if you remove it, make sure the surrounding context
  makes that clear.
