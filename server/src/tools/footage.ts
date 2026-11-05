// Footage scanner: runs on this computer with bundled ffmpeg/ffprobe. No editing app needed except for sorting.
import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, extname, join, resolve } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { imageResult, newFramePath } from '../frames.js';
import { jsonResult, ToolDef } from './types.js';

const require = createRequire(import.meta.url);
const FFMPEG: string = require('ffmpeg-static');
const FFPROBE: string = require('ffprobe-static').path;

const VIDEO = new Set(['.mp4', '.mov', '.mxf', '.avi', '.mkv', '.m4v', '.mts', '.m2ts', '.webm', '.wmv', '.mpg', '.mpeg', '.r3d', '.braw', '.3gp']);
const AUDIO = new Set(['.wav', '.mp3', '.aac', '.m4a', '.aif', '.aiff', '.flac', '.ogg']);
const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.psd', '.heic', '.webp']);
const MAX_FILES = 1000;

function run(cmd: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((ok, fail) => {
    execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024, timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) fail(new Error(String(stderr || err.message).trim().split('\n').slice(-3).join(' ')));
      else ok(stdout);
    });
  });
}

function kindOf(file: string): 'video' | 'audio' | 'image' | null {
  const e = extname(file).toLowerCase();
  return VIDEO.has(e) ? 'video' : AUDIO.has(e) ? 'audio' : IMAGE.has(e) ? 'image' : null;
}

function listFiles(folder: string, recursive: boolean, out: string[] = []): string[] {
  for (const name of readdirSync(folder)) {
    if (out.length >= MAX_FILES) break;
    if (name.startsWith('.')) continue;
    const p = join(folder, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (recursive) listFiles(p, true, out);
    } else if (kindOf(p)) out.push(p);
  }
  return out;
}

function fpsOf(rate?: string): number | null {
  if (!rate || rate === '0/0') return null;
  const [n, d] = rate.split('/').map(Number);
  return d ? Math.round((n / d) * 1000) / 1000 : n || null;
}

async function probe(file: string) {
  const st = statSync(file);
  const base = { file, name: basename(file), kind: kindOf(file), sizeMB: Math.round(st.size / 1e5) / 10 };
  try {
    const j = JSON.parse(await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
    const v = (j.streams || []).find((s: any) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
    const a = (j.streams || []).find((s: any) => s.codec_type === 'audio');
    const tags = { ...(j.format?.tags || {}), ...(v?.tags || {}) };
    const rotation = Number(tags.rotate || v?.side_data_list?.find((d: any) => d.rotation !== undefined)?.rotation || 0);
    return {
      ...base,
      duration: j.format?.duration ? Math.round(Number(j.format.duration) * 1000) / 1000 : null,
      width: v?.width ?? null,
      height: v?.height ?? null,
      rotation: rotation || undefined,
      fps: fpsOf(v?.avg_frame_rate || v?.r_frame_rate),
      codec: v?.codec_name ?? null,
      audio: a ? { codec: a.codec_name, channels: a.channels, sampleRate: Number(a.sample_rate) } : null,
      created: tags.creation_time || st.mtime.toISOString(),
    };
  } catch (e: any) {
    return { ...base, error: `Could not read this file: ${e.message}` };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** One JPEG contact sheet: `count` evenly spaced frames in a grid, each 320x180 (letterboxed). */
async function contactSheet(file: string, count: number): Promise<{ path: string; times: number[] }> {
  const info: any = await probe(file);
  if (info.error) throw new Error(info.error);
  if (!info.width) throw new Error('No video in this file.');
  const dur = info.kind === 'image' ? 0 : Math.max(0, Number(info.duration) || 0);
  const n = info.kind === 'image' || dur < 0.5 ? 1 : count;
  const times = Array.from({ length: n }, (_, i) => Math.round((dur * (i + 0.5)) / n * 100) / 100);
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const args: string[] = ['-v', 'error', '-y'];
  for (const t of times) args.push(...(n > 1 ? ['-ss', String(t)] : []), '-i', file);
  const cell = 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1';
  const parts = times.map((_, i) => `[${i}:v]trim=end_frame=1,${cell}[f${i}]`);
  const join_ = n > 1 ? `${times.map((_, i) => `[f${i}]`).join('')}concat=n=${n}:v=1:a=0[c];[c]tile=${cols}x${rows}[out]` : `[f0]null[out]`;
  const out = newFramePath('sheet', 'jpg');
  args.push('-filter_complex', parts.join(';') + ';' + join_, '-map', '[out]', '-frames:v', '1', '-q:v', '4', out);
  await run(FFMPEG, args, 120_000);
  return { path: out, times };
}

export const footageTools: ToolDef[] = [
  {
    name: 'ft_scan',
    description:
      'Scan a folder of footage on this computer: for each video/audio/image file, its duration, resolution, fps, codec, audio, size and date. No editing app needed. Then use ft_frames to look at clips.',
    input: {
      folder: z.string().describe('Full folder path.'),
      recursive: z.boolean().optional().describe('Include sub-folders. Default true.'),
    },
    run: async ({ folder, recursive }) => {
      const dir = resolve(folder);
      try {
        if (!statSync(dir).isDirectory()) throw new Error();
      } catch {
        throw new Error(`Folder not found: ${folder}`);
      }
      const files = listFiles(dir, recursive !== false);
      const clips = await mapLimit(files, 4, probe);
      const totalDuration = Math.round(clips.reduce((s, c: any) => s + (c.duration || 0), 0));
      return jsonResult({ folder: dir, count: clips.length, truncated: files.length >= MAX_FILES, totalDurationSeconds: totalDuration, clips });
    },
  },
  {
    name: 'ft_frames',
    description:
      'Look at clips: one contact sheet image per file with evenly spaced frames (default 6), so you can describe and tag each clip (shot type, subject, place, quality). Up to 12 files per call.',
    input: {
      files: z.array(z.string()).min(1).max(12).describe('Full file paths (from ft_scan).'),
      count: z.number().int().min(1).max(12).optional().describe('Frames per clip. Default 6.'),
    },
    run: async ({ files, count }): Promise<CallToolResult> => {
      const content: CallToolResult['content'] = [];
      const sheets = await mapLimit(files as string[], 3, async (file) => {
        try {
          return { file, ...(await contactSheet(file, count ?? 6)) };
        } catch (e: any) {
          return { file, error: e.message as string };
        }
      });
      for (const s of sheets) {
        if ('error' in s) {
          content.push({ type: 'text', text: JSON.stringify({ file: s.file, error: s.error }) });
          continue;
        }
        const img = imageResult(s.path, statSync(s.path).size, { file: s.file, frameTimes: s.times }, 'image/jpeg');
        content.push(...img.content);
      }
      return { content };
    },
  },
  {
    name: 'ft_sortToPremiere',
    description:
      'Import clips into Premiere and sort them into bins (created if missing) from your tags, with optional clip markers and a label color (0-15). Clips already in the project are moved, not imported twice. Nothing is deleted.',
    input: {
      plan: z
        .array(
          z.object({
            file: z.string(),
            bin: z.string().describe('Bin path like "Footage/Interviews".'),
            label: z.number().int().min(0).max(15).optional(),
            markers: z
              .array(
                z.object({
                  time: z.number().min(0).describe('Seconds into the clip.'),
                  name: z.string().optional(),
                  comment: z.string().optional(),
                  color: z.enum(['green', 'red', 'purple', 'orange', 'yellow', 'white', 'blue', 'cyan']).optional(),
                }),
              )
              .optional(),
          }),
        )
        .min(1)
        .max(500),
    },
    app: 'ppro',
    hostFn: 'pr_sortFootage',
    timeoutMs: 600_000,
  },
];
