import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, Card, Tabs, TextArea, Paragraph, Button, Tooltip, Separator, Avatar, useStableId } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { BoldIcon, ImageIcon, ItalicIcon, LinkIcon, SendIcon } from "./icons";

const tools: { label: string; icon: VChild }[] = [
  { label: "Bold", icon: <BoldIcon size={16} /> },
  { label: "Italic", icon: <ItalicIcon size={16} /> },
  { label: "Link", icon: <LinkIcon size={16} /> },
  { label: "Image", icon: <ImageIcon size={16} /> },
];

function ToolButton({ label, icon }: { label: string; icon: VChild }) {
  return (
    <Tooltip placement="top">
      <Tooltip.Trigger asChild>
        <Button size="$2" chromeless circular icon={icon} aria-label={label} color="$color10" hoverStyle={{ color: "$color" }} />
      </Tooltip.Trigger>
      <Tooltip.Content>
        <Tooltip.Arrow />
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}

function textFrom(event: Event): string {
  return (event.target as HTMLTextAreaElement).value;
}

const sample = [
  "Looks great overall. Two thoughts:",
  "",
  "1. The preview tab could remember its scroll position.",
  "2. Let's move the image button next to the link button so the toolbar groups by intent.",
].join("\n");

function Composer({ name, initial = "" }: { name: string; initial?: string }) {
  const id = useStableId();
  const [tab, setTab] = useDemoState(`composer.${name}.tab`, "write");
  const [text, setText] = useDemoState(`composer.${name}.text`, initial);
  const empty = text.trim().length === 0;

  return (
    <Card bordered width="100%" maxWidth={520} overflow="hidden">
      <Tabs value={tab} onValueChange={setTab} size="$3">
        <Tabs.List aria-label="Comment editor" paddingHorizontal="$space.2">
          <Tabs.Tab value="write" data-testid="composer-write">Write</Tabs.Tab>
          <Tabs.Tab value="preview" data-testid="composer-preview">Preview</Tabs.Tab>
        </Tabs.List>
        <Tabs.Content value="write" padding="$space.3">
          <TextArea
            id={`${id}-body`}
            rows={6}
            value={text}
            placeholder="Leave a comment…"
            aria-label="Comment"
            resize="vertical"
            onInput={(event) => setText(textFrom(event))}
            data-testid="composer-textarea"
          />
        </Tabs.Content>
        <Tabs.Content value="preview" padding="$space.3">
          <YStack minHeight={160} paddingHorizontal="$space.3" paddingVertical="$space.2">
            {empty ? (
              <Paragraph margin={0} color="$placeholderColor">Nothing to preview</Paragraph>
            ) : (
              <Paragraph margin={0} whiteSpace="pre-wrap">{text}</Paragraph>
            )}
          </YStack>
        </Tabs.Content>
      </Tabs>
      <Separator />
      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$space.3" paddingVertical="$space.2" gap="$space.3">
        <XStack gap="$space.1" role="toolbar" aria-label="Formatting">
          {tools.map((tool) => <ToolButton key={tool.label} label={tool.label} icon={tool.icon} />)}
        </XStack>
        <Button theme="accent" size="$3" disabled={empty} data-testid="composer-submit">
          Comment
        </Button>
      </XStack>
    </Card>
  );
}

function CompactReply() {
  const [text, setText] = useDemoState("composer.reply", "");
  const empty = text.trim().length === 0;
  const lines = Math.min(5, text.split("\n").length);
  return (
    <XStack width="100%" maxWidth={520} gap="$space.3" alignItems="flex-end">
      <Avatar size="$4" circular theme="accent">
        <Avatar.Fallback>AL</Avatar.Fallback>
      </Avatar>
      <TextArea
        flexGrow={1}
        flexShrink={1}
        rows={lines}
        size="$4"
        value={text}
        placeholder="Write a reply…"
        aria-label="Reply"
        resize="none"
        onInput={(event) => setText(textFrom(event))}
        data-testid="composer-reply"
      />
      <Button theme="accent" circular size="$4" icon={<SendIcon size={18} />} aria-label="Send" disabled={empty} />
    </XStack>
  );
}

export const WritePreviewExample: ComponentDemos = {
  name: "Composer",
  group: "Examples",
  description: "Comment composers: a write/preview card with a formatting toolbar, and a single-row reply box.",
  demos: [
    {
      title: "Write and preview",
      description: "Tabs switch between the TextArea and a rendered preview; the Comment button enables once there is text.",
      render: () => <Composer name="draft" />,
    },
    {
      title: "Preview tab",
      description: "The preview keeps the comment's line breaks.",
      render: () => <Composer name="review" initial={sample} />,
      shot: { click: "composer-preview", wait: 200 },
    },
    {
      title: "Compact reply",
      description: "Avatar, a single-row TextArea that grows with its content, and a send button.",
      render: () => <CompactReply />,
    },
  ],
};
