#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { callHost } from './bridge.js';
import { aeTools } from './tools/ae.js';
import { sharedTools } from './tools/shared.js';
import { jsonResult, ToolDef } from './tools/types.js';

export const VERSION = '0.1.0';

const tools: ToolDef[] = [...sharedTools, ...aeTools];

const INSTRUCTIONS = `MMG MCP edits the user's real After Effects and Premiere Pro projects.
- Start with \`status\` to see which apps are connected.
- Read state before editing (ae_getCompState). Indexes change after edits, so re-read.
- Duplicate a comp or sequence before big destructive changes, unless the user says to edit in place.
- After visual changes, check a frame (ae_exportFrame).
- Never delete project media. Times are in seconds.`;

async function runTool(t: ToolDef, args: any): Promise<CallToolResult> {
  try {
    if (t.run) return await t.run(args ?? {});
    if (!t.app || !t.hostFn) throw new Error(`Tool ${t.name} is not wired to an app.`);
    return jsonResult(await callHost(t.app, t.hostFn, args ?? {}, t.timeoutMs));
  } catch (e: any) {
    return { isError: true, content: [{ type: 'text', text: e?.message ?? String(e) }] };
  }
}

const server = new McpServer({ name: 'mmg-mcp', version: VERSION }, { instructions: INSTRUCTIONS });

for (const t of tools) {
  server.registerTool(
    t.name,
    { description: t.description, inputSchema: t.input as any },
    ((args: any) => runTool(t, args)) as any,
  );
}

await server.connect(new StdioServerTransport());
