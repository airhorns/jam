# @jam/meta-agent

Browser-only support library for adding a malleable agent to Jam apps.

The package gives apps:

- a small in-browser file system for Jam extension programs,
- tools for inspecting Jam facts, VDOM, registered programs, and program files,
- a pluggable agent loop that can be backed by a browser-capable model adapter,
- a reusable `@jam/ui` panel that writes its state back into the Jam fact database.

No server process is required. Future ACP/server-backed agents can provide a
custom driver while keeping the same tools and UI.

```tsx
import { createMetaAgent, createLocalStorageJamFileSystem, MetaAgentPanel } from "@jam/meta-agent";

const fs = createLocalStorageJamFileSystem("my-app");
const agent = createMetaAgent({ id: "my-app-agent", fs });

export function App() {
  return <MetaAgentPanel agent={agent} />;
}
```
