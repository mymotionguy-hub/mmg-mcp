import { z } from 'zod';
import { callHost } from '../bridge.js';
import { imageResult, newFramePath, waitForFile } from '../frames.js';
import { makeBatch } from './batch.js';
import { ToolDef } from './types.js';

const sequence = z
  .string()
  .optional()
  .describe('Sequence name. Leave out to use the sequence open in Premiere.');
const track = z.string().regex(/^[VAva]\d+$/).describe('Track like "V1" or "A2".');
const clip = z
  .union([z.object({ track, index: z.number().int().min(1) }), z.string()])
  .describe('{track, index} using the 1-based index from pr_getSequenceState, or the clip name.');
const item = z.string().describe('Project item: its path like "Footage/Interviews/A001.mp4", or its name if unique.');
const time = z.number().min(0).describe('Seconds on the timeline.');
const markerColor = z.enum(['green', 'red', 'purple', 'orange', 'yellow', 'white', 'blue', 'cyan']);

const EDIT_NOTE =
  ' Each edit is its own undo step in Premiere. Read pr_getSequenceState first and again before the next edit (clip indexes change).';

export const pproTools: ToolDef[] = [
  {
    name: 'pr_getProjectState',
    description: 'Read the Premiere project: bins and items (path, type, media file, duration), sequence names, the open sequence.',
    input: { bin: z.string().optional().describe('Only this bin, e.g. "Footage/Day 1".') },
    app: 'ppro',
    hostFn: 'pr_getProjectState',
  },
  {
    name: 'pr_getSequenceState',
    description:
      'Read a sequence: size, fps, duration, playhead, every track with its clips (index, name, start, end, source in/out, disabled) and markers. Always read this before editing the timeline.',
    input: { sequence },
    app: 'ppro',
    hostFn: 'pr_getSequenceState',
  },
  {
    name: 'pr_import',
    description: 'Import files or folders into a bin (created if missing). Returns what was added.',
    input: {
      paths: z.array(z.string()).min(1).describe('Full file or folder paths on this computer.'),
      bin: z.string().optional().describe('Bin path like "Footage/Day 1". Default: project root.'),
    },
    app: 'ppro',
    hostFn: 'pr_import',
    timeoutMs: 300_000,
  },
  {
    name: 'pr_organize',
    description:
      'Tidy the project: createBin {name: "A/B"}, move {item, bin}, rename {item, name}, label {item, color 0-15}. Never deletes anything. Each action reports ok or its error.',
    input: {
      actions: z
        .array(
          z.object({
            action: z.enum(['createBin', 'move', 'rename', 'label']),
            item: item.optional(),
            bin: z.string().optional(),
            name: z.string().optional(),
            color: z.number().int().min(0).max(15).optional(),
          }),
        )
        .min(1),
    },
    app: 'ppro',
    hostFn: 'pr_organize',
  },
  {
    name: 'pr_createSequence',
    description:
      'New sequence. With fromClip: settings from that clip, and the clip is placed in it. Otherwise: an empty copy of another sequence\'s settings (like, default the open one). Opens it.',
    input: {
      name: z.string().min(1),
      fromClip: item.optional(),
      like: z.string().optional().describe('Sequence whose settings to copy.'),
      bin: z.string().optional().describe('Bin for the new sequence (fromClip only).'),
    },
    app: 'ppro',
    hostFn: 'pr_createSequence',
  },
  {
    name: 'pr_duplicateSequence',
    description:
      'Copy a sequence (not opened). Do this before big or destructive edits unless the user says to edit in place, then pass the copy\'s name to later tools.',
    input: { sequence, name: z.string().optional().describe('Name for the copy. Default: "<name> copy".') },
    app: 'ppro',
    hostFn: 'pr_duplicateSequence',
  },
  {
    name: 'pr_placeClip',
    description:
      'Put a project item on a track at a time. mode "overwrite" (default) replaces what is there; "insert" pushes later clips right. inPoint/outPoint pick the part of the source to use.' +
      EDIT_NOTE,
    input: {
      sequence,
      item,
      track,
      time,
      mode: z.enum(['overwrite', 'insert']).optional(),
      inPoint: z.number().min(0).optional().describe('Source seconds.'),
      outPoint: z.number().min(0).optional().describe('Source seconds.'),
    },
    app: 'ppro',
    hostFn: 'pr_placeClip',
  },
  {
    name: 'pr_cut',
    description:
      'Razor cuts and section removal. times: cut at these seconds. range {start, end}: cut at both edges and remove everything between; the gap closes (ripple) unless ripple is false. Works on all unlocked tracks unless tracks is given, so audio stays in sync. Duplicate the sequence first for big edits.' +
      EDIT_NOTE,
    input: {
      sequence,
      tracks: z.array(track).optional().describe('Default: all tracks.'),
      times: z.array(time).optional(),
      range: z.object({ start: time, end: time }).optional(),
      ripple: z.boolean().optional().describe('Close the gap after removing a range. Default true.'),
    },
    app: 'ppro',
    hostFn: 'pr_cut',
  },
  {
    name: 'pr_trimMove',
    description:
      'One clip: trimStart (time = new start), trimEnd (time = new end), move (time = new start), enable, disable, rename (name), remove (ripple closes the gap on that track). Removing never deletes media.' +
      EDIT_NOTE,
    input: {
      sequence,
      clip,
      action: z.enum(['trimStart', 'trimEnd', 'move', 'enable', 'disable', 'rename', 'remove']),
      time: time.optional(),
      name: z.string().optional(),
      ripple: z.boolean().optional(),
    },
    app: 'ppro',
    hostFn: 'pr_trimMove',
  },
  {
    name: 'pr_markers',
    description:
      'Add or remove sequence markers. Add {time, end?, name?, comment?, color?}; remove {name or time}. Good for marking proposed cuts for the user to review before cutting.',
    input: {
      sequence,
      items: z
        .array(
          z.object({
            action: z.enum(['add', 'remove']).optional().describe('Default add.'),
            time: time.optional(),
            end: time.optional(),
            name: z.string().optional(),
            comment: z.string().optional(),
            color: markerColor.optional(),
          }),
        )
        .min(1),
    },
    app: 'ppro',
    hostFn: 'pr_markers',
  },
  {
    name: 'pr_transition',
    description:
      'Add transitions on one track: at every cut where clips touch (cuts "all", default), or at listed times (a clip start or end, e.g. 0 for a fade in). English names: "Cross Dissolve", "Dip to Black", "Dip to White"; audio: "Constant Power".' +
      EDIT_NOTE,
    input: {
      sequence,
      track: track.optional().describe('Default V1.'),
      cuts: z.union([z.literal('all'), z.array(time)]).optional(),
      name: z.string().optional(),
      duration: z.number().gt(0).max(30).optional().describe('Seconds. Default 0.5.'),
    },
    app: 'ppro',
    hostFn: 'pr_transition',
  },
  {
    name: 'pr_setClipProps',
    description:
      'Static scale (%), position ([x, y] px), rotation (degrees), opacity (0-100) on a video clip, or volume (dB, 0 = unchanged) on an audio clip. Properties with keyframes are left alone. Check pr_exportFrame after visual changes.',
    input: {
      sequence,
      clip,
      props: z.object({
        scale: z.number().min(0).optional(),
        position: z.array(z.number()).length(2).optional(),
        rotation: z.number().optional(),
        opacity: z.number().min(0).max(100).optional(),
        volume: z.number().min(-96).max(15).optional(),
      }),
    },
    app: 'ppro',
    hostFn: 'pr_setClipProps',
  },
  {
    name: 'pr_exportFrame',
    description: 'Export one frame of a sequence to PNG and show it. Use after visual changes to check the result.',
    input: { sequence, time: time.optional().describe('Default: the playhead.') },
    run: async ({ sequence, time }) => {
      const path = newFramePath('pr-frame');
      const data = await callHost('ppro', 'pr_exportFrame', { sequence, time, path }, 120_000);
      const got = await waitForFile([path, path + '.png'], 30_000, 'Premiere Pro');
      return imageResult(got.path, got.size, data);
    },
  },
];

pproTools.push(
  makeBatch(
    'ppro',
    'pr_batch',
    'pr_batch',
    pproTools,
    'Run many Premiere edits in order in one call. Each edit is still its own undo step. Re-read the sequence between steps that depend on clip indexes, or use clip names.',
  ),
);
