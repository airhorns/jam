# Jam JavaScript API Reference

Jam is a reactive rule engine. Programs define **facts** (via `claim`) and **rules** (via `when`) that react to facts and derive new ones. When a fact is retracted, all facts derived from it are automatically retracted too. The UI is rendered as JSX that maps to SwiftUI components via an entity-attribute-value claim system.

## Core Primitives

### `claim(...terms)`

Assert a fact — an ordered tuple of terms (strings, numbers, booleans).

```ts
claim("omar", "is", "cool");
claim("counter", "count", 42);
claim("item", itemId, "title", "Buy groceries");
```

**Where it can be called:**
- **Top level** — asserted as an initial fact when the program loads
- **Inside `when()` body** — produces derived facts managed by DBSP (automatically retracted when input facts change)
- **Inside `hold()` callback** — accumulated and managed by the hold's lifecycle
- **Inside event callbacks (onPress, etc.) without hold()** — **throws an error**. Wrap in `hold()` instead.

Facts are tuples of any length. Terms can be strings, numbers, or booleans.

### `when(pattern, body)` / `when(pattern1, pattern2, body)`

Define a reactive rule. When facts matching the pattern(s) exist, the body fires. When those facts are retracted, all claims produced by the body are automatically retracted too.

```ts
// Single pattern
when(["counter", "count", $.value], ({ value }) => {
    claim("display", "text", `Count: ${value}`);
});

// Two-pattern join (shared variable $.x creates an equi-join)
when(
    [$.x, "is", "cool"],
    [$.x, "has", "mood", $.mood],
    ({ x, mood }) => {
        claim(x, "should", mood === "happy" ? "smile" : "frown");
    }
);
```

**Patterns** use `$` for variable binding and `_` for wildcards:
- `$.name` — captures the value at this position into `name`
- `_` — matches anything without capturing
- Literal values — must match exactly

**In JSX**, `when()` returns an element that `render()` processes:

```tsx
render(
    <VStack key="app">
        {when(["counter", "count", $.value], ({ value }) =>
            <Text key="display">{`Count: ${value}`}</Text>
        )}
    </VStack>
);
```

**Nested whens** are supported — the inner when's pattern is joined with the outer's. Use `$.binding` names (not closure variables) in inner patterns so the join works correctly:

```tsx
{when(["ui", "selected", $.id], ({ id }) =>
    <VStack key="detail">
        {when(["item", $.id, "title", $.title], ({ title }) =>
            <Text key="title">{title}</Text>
        )}
    </VStack>
)}
```

### `hold(fn)` / `hold(key, fn)`

Persistent mutable state. Creates a scope where `claim()` calls accumulate facts. When `hold()` is called again with the same key, all previous facts are retracted and the new ones are asserted.

```ts
// With explicit key
hold("counter", () => {
    claim("counter", "count", 0);
});

// Auto-key (derived from $this context)
hold(() => {
    claim("greeting", "hello");
});

// Multiple claims managed as a unit
hold("session", () => {
    claim("session", "s1", "agent", "claude");
    claim("session", "s1", "status", "active");
    if (hasStreaming) {
        claim("session", "s1", "streamingText", text);
    }
});

// Empty callback retracts all facts under that key
hold("session", () => {});
```

`hold()` is the **only** way to mutate state from event callbacks (onPress, onSubmit, etc.). This is by design — `claim()` inside callbacks would produce facts with no lifecycle management.

```tsx
<Button label="+" onPress={() => {
    hold("counter", () => {
        claim("counter", "count", value + 1);
    });
}} />
```

### `wish(...terms)`

Alias for `claim()`. Convention: use `wish()` for desired states that another system should fulfill, `claim()` for facts about the world.

```ts
wish("render", "circle", "at", 100, 200);
```

## Variables and Wildcards

### `$` — Binding Proxy

Creates pattern variables. Access any property to create a named binding:

```ts
$.value    // Binding<"value">
$.x        // Binding<"x">
$.entity   // Binding<"entity">
```

### `_` — Wildcard

Matches any value without capturing:

```ts
when([_, "is", "cool"], () => {
    // matches any 3-term fact where terms 1-2 are "is" and "cool"
});
```

### `or(...values)`

Match any of the given values at a pattern position:

```ts
when([$.x, "is", or("cool", "awesome", "rad")], ({ x }) => {
    claim(x, "is", "great");
});
```

## JSX Rendering

### `render(element)`

Render a JSX element tree into entity-attribute-value claims. This is the entry point for UI programs.

```tsx
render(
    <VStack key="app" spacing={12}>
        <Text key="title" font="title">Hello</Text>
        <Button key="btn" label="Press me" onPress={() => { ... }} />
    </VStack>
);
```

Each JSX element produces claims:
- `(entityId, "isa", "VStack")` — component type
- `(entityId, "spacing", 12)` — properties
- `(parentId, "child", key, entityId)` — parent-child relationship
- `(entityId, "text", "Hello")` — text content

Entity IDs are derived from the tree structure: `root/app/title`, `root/app/btn`, etc.

### `h(type, props, ...children)`

JSX factory function. Normally you don't call this directly — the JSX transpiler converts `<Text>Hello</Text>` to `h(Text, null, "Hello")`.

### `Fragment`

Groups multiple elements without a wrapper entity. Used via `<>...</>` syntax.

### `$this`

The current entity identity. Scoped by `child()` and `render()`. Defaults to `"root"`.

```ts
claim($this, "isa", "VStack");  // claims about the current entity
```

### `child(name, fn)`

Create a nested entity scope. Derives a child entity ID, auto-claims the parent-child relationship, and sets `$this` to the child for the duration of `fn`.

```ts
child("title", () => {
    claim($this, "isa", "Text");
    claim($this, "text", "Hello");
});
// produces: ("root/title", "isa", "Text"), ("root/title", "text", "Hello"),
//           ("root", "child", "title", "root/title")
```

## Built-in Components

Components are typed functions that produce JSX elements mapping to SwiftUI views.

| Component | Key Props | Description |
|-----------|-----------|-------------|
| `VStack` | `spacing`, `alignment`, `padding` | Vertical stack |
| `HStack` | `spacing`, `alignment`, `padding` | Horizontal stack |
| `ZStack` | `padding` | Depth stack |
| `Text` | `font`, `foregroundColor`, `padding` | Text display (children = content) |
| `Button` | `label`, `font`, `foregroundColor`, `onPress` | Interactive button |
| `TextField` | `placeholder`, `font`, `onSubmit`, `onChange` | Text input |
| `ScrollView` | `axis`, `padding` | Scrollable container |
| `NavigationSplitView` | — | Two-column layout (sidebar + detail) |
| `ProgressView` | `label` | Loading indicator |
| `Divider` | — | Visual separator |
| `Circle` | `foregroundColor`, `frame` | Circle shape |
| `Spacer` | — | Flexible space |
| `Image` | `systemName`, `foregroundColor`, `font` | SF Symbol image |

**Font values:** `"largeTitle"`, `"title"`, `"title2"`, `"title3"`, `"headline"`, `"subheadline"`, `"body"`, `"callout"`, `"footnote"`, `"caption"`, `"caption2"`

**Color values:** `"red"`, `"blue"`, `"green"`, `"orange"`, `"purple"`, `"gray"`, `"white"`, `"black"`, `"yellow"`, `"pink"`, `"primary"`, `"secondary"`

## Event Handling

Any function prop on a component is a callback. When the user interacts with the component, the callback fires.

```tsx
<Button label="Save" onPress={() => {
    hold("data", () => {
        claim("saved", true);
    });
}} />

<TextField placeholder="Name" onSubmit={(text) => {
    hold("name", () => {
        claim("user", "name", text);
    });
}} />
```

**Rules:**
- Callbacks can call `hold()` to update state
- Callbacks **cannot** call `claim()` directly (use `hold()` instead)
- `hold()` inside a callback triggers reactive re-rendering via `when()` rules
- Any function prop name works (`onPress`, `onSubmit`, `activate`, etc.)
- `onSubmit` receives the submitted text as an argument

## Globals

These are available on `globalThis` without import:

```ts
$, _, or, when, claim, wish, hold, child,
h, render, Fragment,
VStack, HStack, ZStack, Text, Button, TextField,
ScrollView, NavigationSplitView, ProgressView,
Divider, Circle, Spacer, Image,
console, fetch
```

`console.log()` prints to the host's stderr. `fetch()` is the standard Fetch API backed by LLRT/hyper for HTTP requests with Promise support.

## TypeScript Support

### `KnownSkeletons`

Define known fact shapes in a `skeletons.d.ts` file for type-safe pattern matching:

```ts
// skeletons.d.ts
import { KnownSkeletons } from "./jam";

declare module "./jam" {
    interface KnownSkeletons {
        100: [string, "is", string];
        101: ["counter", "count", number];
    }
}
```

This enables compile-time checks: `when(["counter", "count", $.value], ...)` verifies that the pattern matches at least one known skeleton, and infers `value: number`.

### JSX Configuration

```json
{
    "compilerOptions": {
        "jsx": "react",
        "jsxFactory": "h",
        "jsxFragmentFactory": "Fragment"
    }
}
```

Use `.tsx` file extension. OXC transpiles JSX to `h()` calls automatically.
