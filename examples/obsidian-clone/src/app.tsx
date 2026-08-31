import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import {
  Button,
  Card,
  H2,
  H3,
  Input,
  Label,
  ListItem,
  Paragraph,
  ScrollView,
  Separator,
  SizableText,
  TextArea,
  Tooltip,
  VisuallyHidden,
  XStack,
  YStack,
  getActiveThemeName,
  setTheme,
} from "@jam/ui";
import { createNote, ensureSeedNotes, getBacklinks, getNoteOutline, getNoteStats, getOutgoingLinks, getSelectedNote, listNotes, selectNote, updateNoteBody, updateNoteTitle } from "./model";

ensureSeedNotes();

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Eyebrow({ children }: { children?: string }) {
  return (
    <SizableText size="$1" fontWeight="600" color="$color10" textTransform="uppercase" letterSpacing={1}>
      {children}
    </SizableText>
  );
}

function ThemeToggle() {
  const dark = (getActiveThemeName() ?? "light").startsWith("dark");
  return (
    <Tooltip placement="bottom">
      <Tooltip.Trigger asChild>
        <Button
          size="$3"
          variant="outlined"
          circular
          aria-label="Toggle theme"
          data-testid="theme-toggle"
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          {dark ? "☾" : "☀"}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <Tooltip.Arrow />
        {dark ? "Switch to light" : "Switch to dark"}
      </Tooltip.Content>
    </Tooltip>
  );
}

function Sidebar({
  notes,
  selectedNoteId,
}: {
  notes: ReturnType<typeof listNotes>;
  selectedNoteId: string | null;
}) {
  return (
    <YStack
      tag="aside"
      width={290}
      flexShrink={0}
      $max-lg={{ width: 240 }}
      $max-md={{ width: "100%", flexBasis: "100%" }}
      bordered
      borderRadius="$6"
      backgroundColor="$color1"
      padding="$4"
      gap="$3"
      minHeight={0}
      data-testid="notes-sidebar"
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$3" flexWrap="wrap">
        <YStack gap="$1">
          <Eyebrow>Jam vault</Eyebrow>
          <H2 margin={0}>Notes</H2>
        </YStack>
        <XStack gap="$2" alignItems="center">
          <ThemeToggle />
          <Button size="$3" theme="accent" id="create-note" data-testid="create-note" onClick={() => createNote()}>
            + New note
          </Button>
        </XStack>
      </XStack>

      <Separator />

      <ScrollView flex={1} gap="$2" role="list" aria-label="Notes" data-testid="note-list">
        {notes.map((note) => {
          const isSelected = selectedNoteId === note.id;
          return (
            <ListItem.Frame
              key={note.id}
              tag="button"
              id={`note-list-item-${note.id}`}
              data-testid="note-list-item"
              data-note-id={note.id}
              aria-current={isSelected ? "true" : undefined}
              theme={isSelected ? "blue" : undefined}
              variant="outlined"
              pressTheme
              backgroundColor={isSelected ? "$color4" : "transparent"}
              borderColor={isSelected ? "$color7" : "$borderColor"}
              hoverStyle={{ backgroundColor: isSelected ? "$color4" : "$backgroundHover" }}
              borderRadius="$4"
              paddingVertical="$3"
              paddingHorizontal="$3.5"
              alignItems="stretch"
              flexShrink={0}
              onClick={() => selectNote(note.id)}
            >
              <YStack flexGrow={1} flexShrink={1} minWidth={0} gap="$1" alignItems="stretch">
                <ListItem.Title fontWeight="700">{note.title}</ListItem.Title>
                <ListItem.Subtitle numberOfLines={2} lineHeight={20}>
                  {note.body || "Empty note"}
                </ListItem.Subtitle>
                <SizableText size="$1" color="$color10" textTransform="uppercase" letterSpacing={0.5}>
                  Edited {formatDate(note.updatedAt)}
                </SizableText>
              </YStack>
            </ListItem.Frame>
          );
        })}
      </ScrollView>
    </YStack>
  );
}

function Editor({ note }: { note: ReturnType<typeof getSelectedNote> }) {
  const frameProps = {
    tag: "section",
    flex: 1,
    minWidth: 0,
    flexBasis: 420,
    "$max-md": { flexBasis: "100%" },
    bordered: true,
    borderRadius: "$6",
    backgroundColor: "$color1",
    minHeight: 0,
    "data-testid": "editor-panel",
  };

  if (!note) {
    return (
      <YStack {...frameProps} alignItems="center" justifyContent="center" padding="$6">
        <H3 margin={0} color="$color10">No note selected</H3>
      </YStack>
    );
  }

  return (
    <YStack {...frameProps} padding="$6" gap="$4">
      <VisuallyHidden tag="label" htmlFor="note-title-input">Note title</VisuallyHidden>
      <Input
        unstyled
        id="note-title-input"
        data-testid="note-title-input"
        value={note.title}
        fontFamily="$heading"
        fontSize="$10"
        lineHeight="$10"
        fontWeight="800"
        color="$color12"
        width="100%"
        padding={0}
        onChangeText={(text) => updateNoteTitle(note.id, text)}
      />
      <Separator />
      <Label htmlFor="note-body-input" size="$2" color="$color10" unstyled>
        Body
      </Label>
      <TextArea
        unstyled
        id="note-body-input"
        data-testid="note-body-input"
        value={note.body}
        placeholder="Write in markdown, add headings, and link notes with [[Title]]."
        flex={1}
        width="100%"
        minHeight={200}
        padding={0}
        resize="none"
        fontFamily="$mono"
        fontSize="$5"
        lineHeight={27}
        color="$color"
        placeholderStyle={{ color: "$placeholderColor" }}
        onChangeText={(text) => updateNoteBody(note.id, text)}
      />
    </YStack>
  );
}

function InspectorCard({ label, testId, children }: { label: string; testId: string; children?: VChild }) {
  return (
    <Card bordered padding="$4" gap="$3" backgroundColor="$color1" flexShrink={0} data-testid={testId}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <YStack flexGrow={1} flexBasis="40%" gap="$1">
      <Eyebrow>{label}</Eyebrow>
      <SizableText size="$3">{value}</SizableText>
    </YStack>
  );
}

function EmptyHint({ children }: { children?: string }) {
  return (
    <Paragraph margin={0} size="$3" color="$color9">
      {children}
    </Paragraph>
  );
}

function Inspector({
  note,
  outgoingLinks,
  backlinks,
  outline,
  stats,
}: {
  note: ReturnType<typeof getSelectedNote>;
  outgoingLinks: ReturnType<typeof getOutgoingLinks>;
  backlinks: ReturnType<typeof getBacklinks>;
  outline: ReturnType<typeof getNoteOutline>;
  stats: ReturnType<typeof getNoteStats>;
}) {
  if (!note) {
    return null;
  }

  return (
    <ScrollView
      tag="aside"
      width={320}
      flexShrink={0}
      $max-lg={{ width: 280 }}
      $max-md={{ width: "100%", flexBasis: "100%" }}
      gap="$3"
      minHeight={0}
      data-testid="inspector-panel"
    >
      <InspectorCard label="Metadata" testId="note-metadata-panel">
        <XStack flexWrap="wrap" gap="$3">
          <Stat label="Created" value={formatDate(note.createdAt)} />
          <Stat label="Updated" value={formatDate(note.updatedAt)} />
          <Stat label="Words" value={String(stats.wordCount)} />
          <Stat label="Links" value={String(stats.linkCount)} />
        </XStack>
      </InspectorCard>

      <InspectorCard label="Outgoing links" testId="outgoing-links-panel">
        {outgoingLinks.length > 0 ? (
          <XStack flexWrap="wrap" gap="$2">
            {outgoingLinks.map((link) => (
              <Button
                key={`${note.id}-${link.title}`}
                size="$2"
                variant="outlined"
                borderRadius={999}
                theme={link.targetId ? "blue" : undefined}
                color={link.targetId ? "$color11" : "$color10"}
                disabled={!link.targetId}
                aria-disabled={link.targetId ? undefined : "true"}
                data-testid="outgoing-link"
                onClick={() => {
                  if (link.targetId) selectNote(link.targetId);
                }}
              >
                [[{link.title}]]
              </Button>
            ))}
          </XStack>
        ) : (
          <EmptyHint>No wikilinks yet.</EmptyHint>
        )}
      </InspectorCard>

      <InspectorCard label="Backlinks" testId="backlinks-panel">
        {backlinks.length > 0 ? (
          <YStack role="list" gap="$2">
            {backlinks.map((backlink) => (
              <ListItem
                key={backlink.id}
                tag="button"
                size="$3"
                variant="outlined"
                hoverTheme
                pressTheme
                borderRadius="$3"
                paddingVertical="$2"
                title={backlink.title}
                subTitle={backlink.body}
                data-testid="backlink-item"
                onClick={() => selectNote(backlink.id)}
              />
            ))}
          </YStack>
        ) : (
          <EmptyHint>No backlinks yet.</EmptyHint>
        )}
      </InspectorCard>

      <InspectorCard label="Outline" testId="outline-panel">
        {outline.length > 0 ? (
          <YStack tag="ul" role="list" margin={0} paddingLeft="$4" gap="$1.5">
            {outline.map((heading) => (
              <SizableText key={heading} tag="li" display="list-item" size="$3" color="$color11">
                {heading}
              </SizableText>
            ))}
          </YStack>
        ) : (
          <EmptyHint>Add markdown headings to build an outline.</EmptyHint>
        )}
      </InspectorCard>
    </ScrollView>
  );
}

export function ObsidianCloneApp() {
  const notes = listNotes();
  const selectedNote = getSelectedNote();
  const selectedNoteId = selectedNote?.id ?? null;
  const outgoingLinks = selectedNote ? getOutgoingLinks(selectedNote.id) : [];
  const backlinks = selectedNote ? getBacklinks(selectedNote.id) : [];
  const outline = selectedNote ? getNoteOutline(selectedNote.id) : [];
  const stats = selectedNote ? getNoteStats(selectedNote.id) : { wordCount: 0, linkCount: 0 };

  return (
    <XStack
      height="100vh"
      $max-md={{ height: "auto", minHeight: "100vh", flexWrap: "wrap" }}
      padding="$4"
      gap="$4"
      alignItems="stretch"
      backgroundColor="$background"
      fontFamily="$body"
      data-testid="notes-app"
    >
      <Sidebar notes={notes} selectedNoteId={selectedNoteId} />
      <Editor note={selectedNote} />
      <Inspector
        note={selectedNote}
        outgoingLinks={outgoingLinks}
        backlinks={backlinks}
        outline={outline}
        stats={stats}
      />
    </XStack>
  );
}
