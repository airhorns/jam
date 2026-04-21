# @jam/meta-agent

Browser-only support library for adding a malleable agent to Jam apps.

The package gives apps:

- a Jam-backed in-browser file system for editable extension programs,
- tools for inspecting Jam facts, VDOM, registered programs, and program files,
- a pluggable agent loop that can be backed by a browser-capable model adapter,
- a reusable `@jam/ui` panel that writes its state back into the Jam fact database.

Program files are stored as `jamProgramFile` facts through `@jam/core`, so the
files an agent reads and writes are the same files loaded into the running app
with the program-file loader. When an app uses Jam fact persistence, these file
facts are persisted by the existing browser OPFS path too. No server process is
required. Future ACP/server-backed agents can provide a custom driver while
keeping the same tools and UI.

```tsx
import { createMetaAgent, createLocalStorageJamFileSystem, MetaAgentPanel } from "@jam/meta-agent";

const fs = createLocalStorageJamFileSystem("my-app");
const agent = createMetaAgent({ id: "my-app-agent", fs });

export function App() {
  return <MetaAgentPanel agent={agent} />;
}
```
