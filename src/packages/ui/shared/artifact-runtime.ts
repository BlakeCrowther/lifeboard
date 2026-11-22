/* The claude.ai artifact runtime the page asks for capabilities: `db` (the store's DbAdapter), `mcp` (connectors:
   Google Calendar, Claude Code Remote) and `sample` (Claude in the page). Outside claude.ai it is absent, unless
   dist/fake-db.js stands in for `db`. Only the parts the page uses are typed. */
import type { DbAdapter } from '../../db/index.ts';

/** A capability call that failed; `code` says why (e.g. not_granted, rate_limited). */
export interface RuntimeError {
  code?: string;
}
export const errorCode = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;

export interface McpToolResult {
  payload?: unknown;
  cache?: { storedAt?: number };
}
export type McpWatchEvent = { type: 'data'; result?: McpToolResult } | { type: 'error'; error?: RuntimeError };
export interface McpCapability {
  /** Calls the tool now and every refetchInterval ms; returns the unsubscribe. */
  watchTool(server: string, tool: string, input: object, onEvent: (event: McpWatchEvent) => void, options: { refetchInterval: number }): () => void;
  callTool(server: string, tool: string, input: object, options?: { cache?: boolean }): Promise<McpToolResult>;
}

export interface SampleMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface SampleCapability {
  (messages: SampleMessage[], options: { cache?: boolean; onText?: (partial: { text: string }) => void }): Promise<{ text: string }>;
  json(prompt: string, options: { modelTier?: string }): Promise<unknown>;
}

interface ArtifactRuntime {
  use(capability: string): Promise<unknown>;
}

declare global {
  interface Window {
    claude?: ArtifactRuntime;
  }
}

function use(capability: string): Promise<unknown> | null {
  return window.claude?.use ? window.claude.use(capability) : null;
}
export const useDb = (): Promise<DbAdapter | null> | null => use('db') as Promise<DbAdapter | null> | null;
export const useMcp = (): Promise<McpCapability | null> | null => use('mcp') as Promise<McpCapability | null> | null;
export const useSample = (): Promise<SampleCapability | null> | null => use('sample') as Promise<SampleCapability | null> | null;
