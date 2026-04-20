import { mkdir, writeFile } from "node:fs/promises";

import {
  catalogMountSource,
  catalogSetupSource,
} from "../dist/catalog-program.js";

const outputUrl = new URL(
  "../JamUICatalogNative/Resources/catalog-program.json",
  import.meta.url,
);

await mkdir(new URL(".", outputUrl), { recursive: true });
await writeFile(
  outputUrl,
  `${JSON.stringify({ setup: catalogSetupSource, mount: catalogMountSource }, null, 2)}\n`,
);
