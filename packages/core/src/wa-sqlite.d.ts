declare module "wa-sqlite/dist/wa-sqlite-async.mjs" {
  export default function (): Promise<any>;
}

declare module "wa-sqlite/src/sqlite-api.js" {
  export function Factory(module: any): any;
  export * from "wa-sqlite/src/sqlite-constants.js";
}

declare module "wa-sqlite/src/sqlite-constants.js" {
  export const SQLITE_ROW: number;
  export const SQLITE_DONE: number;
  export const SQLITE_OK: number;
}

declare module "wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js" {
  export class OriginPrivateFileSystemVFS {
    isReady: Promise<void>;
  }
}
