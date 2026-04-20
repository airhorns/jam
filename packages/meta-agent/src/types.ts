import type { JamProgramFileSystem, Term } from "@jam/core";

export interface MetaAgentToolResult {
  title: string;
  content: string;
  data?: unknown;
}

export interface MetaAgentToolContext {
  agentId: string;
  fs: JamProgramFileSystem;
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
  fs?: JamProgramFileSystem;
  tools?: MetaAgentTool[];
  driver?: MetaAgentDriver;
}

export interface MetaAgent {
  id: string;
  fs: JamProgramFileSystem;
  tools: MetaAgentTool[];
  runPrompt(prompt: string): Promise<void>;
  addTool(tool: MetaAgentTool): void;
}

export type FactSnapshot = Term[][];
