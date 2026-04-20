import type { Term } from "@jam/core";

export type JamProgramPath = `/${string}`;

export interface JamFileEntry {
  path: JamProgramPath;
  content: string;
  updatedAt: number;
}

export interface JamFileSystem {
  listFiles(): JamFileEntry[];
  readFile(path: JamProgramPath): JamFileEntry | undefined;
  writeFile(path: JamProgramPath, content: string): JamFileEntry;
  deleteFile(path: JamProgramPath): boolean;
}

export interface MetaAgentToolResult {
  title: string;
  content: string;
  data?: unknown;
}

export interface MetaAgentToolContext {
  agentId: string;
  fs: JamFileSystem;
}

export interface MetaAgentTool<Input = unknown> {
  name: string;
  description: string;
  run(input: Input, context: MetaAgentToolContext): MetaAgentToolResult | Promise<MetaAgentToolResult>;
}

export interface MetaAgentToolCall {
  toolName: string;
  input?: unknown;
}

export interface MetaAgentDriverInput {
  prompt: string;
  tools: MetaAgentTool[];
  context: MetaAgentToolContext;
}

export interface MetaAgentDriverPlan {
  toolCalls: MetaAgentToolCall[];
  response: string;
}

export interface MetaAgentDriver {
  plan(input: MetaAgentDriverInput): MetaAgentDriverPlan | Promise<MetaAgentDriverPlan>;
}

export interface MetaAgentOptions {
  id?: string;
  fs?: JamFileSystem;
  tools?: MetaAgentTool[];
  driver?: MetaAgentDriver;
}

export interface MetaAgent {
  id: string;
  fs: JamFileSystem;
  tools: MetaAgentTool[];
  runPrompt(prompt: string): Promise<void>;
  addTool(tool: MetaAgentTool): void;
}

export type FactSnapshot = Term[][];
