// Shared helpers for tools that hand an image back to Claude.
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const FRAME_DIR = join(tmpdir(), 'mmg-mcp');
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fresh temp path (forward slashes, which ExtendScript accepts on Windows and Mac). Cleans old frames. */
export function newFramePath(prefix: string, ext = 'png'): string {
  mkdirSync(FRAME_DIR, { recursive: true });
  try {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const f of readdirSync(FRAME_DIR)) {
      const p = join(FRAME_DIR, f);
      if (/\.(png|jpg)$/.test(f) && statSync(p).mtimeMs < cutoff) unlinkSync(p);
    }
  } catch {
    /* ignore */
  }
  return join(FRAME_DIR, `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`).replace(/\\/g, '/');
}

/**
 * The app may finish writing a moment after its script returns, and some apps add their own extension:
 * wait for any of the candidate paths until its size stops changing.
 */
export async function waitForFile(candidates: string[], timeoutMs: number, appLabel: string): Promise<{ path: string; size: number }> {
  const end = Date.now() + timeoutMs;
  const last = new Map<string, number>();
  while (Date.now() < end) {
    for (const p of candidates) {
      try {
        const size = statSync(p).size;
        if (size > 0 && size === last.get(p)) return { path: p, size };
        last.set(p, size);
      } catch {
        /* not there yet */
      }
    }
    await sleep(150);
  }
  throw new Error(`${appLabel} didn't save the frame (nothing at ${candidates[0]}).`);
}

/** Image + info, or just info when the image is too big for the chat. */
export function imageResult(path: string, size: number, info: object, mimeType = 'image/png'): CallToolResult {
  const meta = { ...info, path, bytes: size };
  if (size > MAX_IMAGE_BYTES) {
    return { content: [{ type: 'text', text: JSON.stringify({ ...meta, note: 'Image is too big to show here; it was saved to the path above.' }) }] };
  }
  return {
    content: [
      { type: 'image', data: readFileSync(path).toString('base64'), mimeType },
      { type: 'text', text: JSON.stringify(meta) },
    ],
  };
}
