import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AppId } from '../bridge.js';

/**
 * One tool in the registry. Simple tools only need `app` + `hostFn`: the args are sent
 * to that ExtendScript function and its data comes back as JSON text.
 * Tools that need extra work on the server side (images, several apps) set `run`.
 */
export interface ToolDef {
  name: string;
  description: string;
  input: Record<string, z.ZodType>;
  app?: AppId;
  hostFn?: string;
  timeoutMs?: number;
  run?: (args: any) => Promise<CallToolResult>;
}

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data ?? null) }] };
}
