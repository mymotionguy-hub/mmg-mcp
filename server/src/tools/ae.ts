import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { callHost } from '../bridge.js';
import { ToolDef } from './types.js';

const comp = z
  .string()
  .optional()
  .describe('Comp name. Leave out to use the comp that is open in After Effects.');

const FRAME_DIR = join(tmpdir(), 'mmg-mcp');
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Delete frames older than an hour so the temp folder doesn't grow forever. */
function cleanOldFrames() {
  try {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const f of readdirSync(FRAME_DIR)) {
      const p = join(FRAME_DIR, f);
      if (f.endsWith('.png') && statSync(p).mtimeMs < cutoff) unlinkSync(p);
    }
  } catch {
    /* ignore */
  }
}

/** AE may finish writing the PNG a moment after the script returns: wait until the size stops changing. */
async function waitForFile(path: string, timeoutMs: number): Promise<number> {
  const end = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < end) {
    try {
      const size = statSync(path).size;
      if (size > 0 && size === last) return size;
      last = size;
    } catch {
      /* not there yet */
    }
    await sleep(150);
  }
  if (last > 0) return last;
  throw new Error(`After Effects didn't save the frame (nothing at ${path}).`);
}

export const aeTools: ToolDef[] = [
  {
    name: 'ae_getCompState',
    description:
      'Read an After Effects comp: size, fps, duration, current time, work area, and every layer (index, name, type, in/out, parent, effects, text). Always read this before editing a comp, and again after edits, since layer indexes change.',
    input: { comp },
    app: 'ae',
    hostFn: 'ae_getCompState',
  },
  {
    name: 'ae_exportFrame',
    description:
      'Render one frame of an After Effects comp to PNG and show it. Use after visual changes to check the result.',
    input: {
      comp,
      time: z
        .number()
        .min(0)
        .optional()
        .describe('Time in seconds from the comp start. Leave out to use the current time indicator.'),
    },
    run: async ({ comp, time }) => {
      mkdirSync(FRAME_DIR, { recursive: true });
      cleanOldFrames();
      const path = join(FRAME_DIR, `ae-frame-${Date.now()}.png`);
      // ExtendScript is happy with forward slashes on both Windows and Mac.
      const data = await callHost('ae', 'ae_exportFrame', { comp, time, path: path.replace(/\\/g, '/') }, 120_000);
      const size = await waitForFile(path, 30_000);
      const info = { ...data, path, bytes: size };
      if (size > MAX_IMAGE_BYTES) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...info, note: 'Frame is too big to show here; it was saved to the path above.' }),
            },
          ],
        };
      }
      return {
        content: [
          { type: 'image', data: readFileSync(path).toString('base64'), mimeType: 'image/png' },
          { type: 'text', text: JSON.stringify(info) },
        ],
      };
    },
  },
];
