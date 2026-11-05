import { z } from 'zod';
import { callHost } from '../bridge.js';
import { imageResult, newFramePath, waitForFile } from '../frames.js';
import { makeBatch } from './batch.js';
import { ToolDef } from './types.js';

// ---------- shared input pieces ----------

const comp = z
  .string()
  .optional()
  .describe('Comp name. Leave out to use the comp that is open in After Effects.');
const layer = z
  .union([z.string(), z.number().int().min(1)])
  .describe('Layer name, or its 1-based index from ae_getCompState.');
const color = z
  .union([z.string().regex(/^#?[0-9a-fA-F]{6}$/), z.array(z.number().min(0).max(1)).min(3).max(4)])
  .describe('"#RRGGBB" or [r, g, b] from 0 to 1.');
const vec = z.array(z.number()).min(2).max(3);
const value = z.union([z.number(), z.boolean(), z.array(z.number()), color]);
const property = z
  .string()
  .describe(
    'Property: position, x position, y position, scale, rotation, opacity, anchor, or a path like "Effects/Gaussian Blur/Blurriness" or "Contents/Rectangle/Contents/Fill 1/Color" (display or match names).',
  );
const ease = z
  .union([
    z.enum(['linear', 'ease', 'easeIn', 'easeOut', 'hold']),
    z.object({ influenceIn: z.number().min(0.1).max(100), influenceOut: z.number().min(0.1).max(100) }),
  ])
  .describe(
    '"ease" = Easy Ease both sides; "easeIn" = slows down arriving at this key; "easeOut" = starts slowly leaving it; or custom influence in %.',
  );

const EDIT_NOTE = ' Returns the new state. Read ae_getCompState first; check ae_exportFrame after visual changes.';

// ---------- tools ----------

export const aeTools: ToolDef[] = [
  {
    name: 'ae_getCompState',
    description:
      'Read an After Effects comp: size, fps, duration, current time, work area, and every layer (index, name, type, in/out, parent, transform values, effects, text). Always read this before editing a comp, and again after edits, since layer indexes change.',
    input: { comp },
    app: 'ae',
    hostFn: 'ae_getCompState',
  },
  {
    name: 'ae_createComp',
    description: 'Create a new comp and open it.' + EDIT_NOTE,
    input: {
      name: z.string().min(1),
      width: z.number().int().min(4).max(30000),
      height: z.number().int().min(4).max(30000),
      fps: z.number().min(1).max(999),
      duration: z.number().gt(0).max(10800).describe('Seconds.'),
      bgColor: color.optional(),
    },
    app: 'ae',
    hostFn: 'ae_createComp',
  },
  {
    name: 'ae_duplicateComp',
    description:
      'Duplicate a comp (the copy is not opened). Do this before big destructive changes unless the user says to edit in place, then pass the copy\'s name to later tools.',
    input: { comp, name: z.string().optional().describe('Name for the copy. Default: "<name> copy".') },
    app: 'ae',
    hostFn: 'ae_duplicateComp',
  },
  {
    name: 'ae_addLayer',
    description:
      'Add a solid, rectangle or ellipse shape, null, adjustment layer, or camera. Shapes are centered and filled.' + EDIT_NOTE,
    input: {
      comp,
      kind: z.enum(['solid', 'rectangle', 'ellipse', 'null', 'adjustment', 'camera']),
      name: z.string().optional(),
      color: color.optional().describe('Fill color for solids and shapes.'),
      size: z.array(z.number().positive()).length(2).optional().describe('[width, height] px. Solids default to comp size, shapes to 400x400.'),
      roundness: z.number().min(0).optional().describe('Corner roundness for rectangles, px.'),
    },
    app: 'ae',
    hostFn: 'ae_addLayer',
  },
  {
    name: 'ae_addText',
    description:
      'Add a text layer (anchor centered on the text). Defaults: 72 px, white, centered in the comp.' + EDIT_NOTE,
    input: {
      comp,
      text: z.string(),
      name: z.string().optional(),
      font: z.string().optional().describe('PostScript font name, e.g. "Montserrat-Bold".'),
      size: z.number().positive().optional(),
      color: color.optional(),
      position: vec.optional().describe('[x, y] px.'),
      align: z.enum(['left', 'center', 'right']).optional(),
    },
    app: 'ae',
    hostFn: 'ae_addText',
  },
  {
    name: 'ae_styleText',
    description: 'Change a text layer\'s text, font, size, fill, stroke, tracking, leading, alignment or caps.' + EDIT_NOTE,
    input: {
      comp,
      layer,
      props: z.object({
        text: z.string().optional(),
        font: z.string().optional().describe('PostScript name.'),
        size: z.number().positive().optional(),
        color: color.optional(),
        strokeColor: color.optional(),
        strokeWidth: z.number().min(0).optional().describe('0 removes the stroke.'),
        tracking: z.number().optional(),
        leading: z.number().positive().optional(),
        align: z.enum(['left', 'center', 'right']).optional(),
        allCaps: z.boolean().optional(),
      }),
    },
    app: 'ae',
    hostFn: 'ae_styleText',
  },
  {
    name: 'ae_animateText',
    description:
      'Add a ready-made animation to a layer: fade, slide (with direction), pop (scale with overshoot), typeOn (letters appear), wordByWord (words rise in). Set options.out to animate out instead of in.' +
      EDIT_NOTE,
    input: {
      comp,
      layer,
      preset: z.enum(['fade', 'slide', 'pop', 'typeOn', 'wordByWord']),
      start: z.number().min(0).optional().describe('Seconds (comp time). Default: layer in point.'),
      duration: z.number().gt(0).optional().describe('Seconds. Default 0.6.'),
      options: z
        .object({
          out: z.boolean().optional(),
          direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('slide: direction of travel. Default up.'),
          distance: z.number().optional().describe('slide / wordByWord: px. Defaults 100 / 30.'),
          overshoot: z.number().min(1).max(2).optional().describe('pop: peak scale factor. Default 1.1.'),
        })
        .optional(),
    },
    app: 'ae',
    hostFn: 'ae_animateText',
  },
  {
    name: 'ae_setTransform',
    description:
      'Set static position, scale, rotation, opacity or anchor point. If a property already has keyframes, the value is set at the current time instead.' +
      EDIT_NOTE,
    input: {
      comp,
      layer,
      props: z.object({
        position: vec.optional(),
        anchor: vec.optional(),
        scale: z.union([z.number(), vec]).optional().describe('Percent; one number sets all axes.'),
        rotation: z.number().optional().describe('Degrees.'),
        opacity: z.number().min(0).max(100).optional(),
      }),
    },
    app: 'ae',
    hostFn: 'ae_setTransform',
  },
  {
    name: 'ae_setProperty',
    description:
      'Set one static value on any layer property, e.g. an effect parameter or shape color. Use ae_setKeyframes to animate instead.' + EDIT_NOTE,
    input: { comp, layer, property, value },
    app: 'ae',
    hostFn: 'ae_setProperty',
  },
  {
    name: 'ae_setKeyframes',
    description:
      'Add keyframes to any property (transform, effect, shape...) with easing. Times are comp seconds. Use clear to replace existing keys.' +
      EDIT_NOTE,
    input: {
      comp,
      layer,
      property,
      keys: z
        .array(z.object({ time: z.number().min(0), value, ease: ease.optional() }))
        .min(1)
        .max(500),
      ease: ease.optional().describe('Default ease for keys that don\'t set their own.'),
      clear: z.boolean().optional().describe('Remove existing keyframes on this property first.'),
    },
    app: 'ae',
    hostFn: 'ae_setKeyframes',
  },
  {
    name: 'ae_layerOrder',
    description:
      'Layer housekeeping: moveTo (index), moveBefore/moveAfter (target), toTop, toBottom, parent (target), unparent, rename (name), trim (inPoint/outPoint), shift (startTime), duplicate (name?), delete. Deleting a layer never deletes footage from the project. Returns the new layer list.',
    input: {
      comp,
      layer,
      action: z.enum(['moveTo', 'moveBefore', 'moveAfter', 'toTop', 'toBottom', 'parent', 'unparent', 'rename', 'trim', 'shift', 'duplicate', 'delete']),
      target: layer.optional().describe('Other layer, for moveBefore/moveAfter/parent.'),
      index: z.number().int().min(1).optional(),
      name: z.string().optional(),
      inPoint: z.number().optional(),
      outPoint: z.number().optional(),
      startTime: z.number().optional(),
    },
    app: 'ae',
    hostFn: 'ae_layerOrder',
  },
  {
    name: 'ae_precompose',
    description: 'Precompose layers into a new comp.' + EDIT_NOTE,
    input: {
      comp,
      layers: z.array(layer).min(1),
      name: z.string().min(1),
      moveAttributes: z.boolean().optional().describe('Move effects/transforms into the new comp. Default true; must be true for several layers.'),
    },
    app: 'ae',
    hostFn: 'ae_precompose',
  },
  {
    name: 'ae_addEffect',
    description:
      'Add an effect by match name (safest, e.g. "ADBE Gaussian Blur 2", "ADBE Drop Shadow", "ADBE Fill") or English name, and optionally set its parameters by name. Returns the effect\'s parameter names and values.' +
      EDIT_NOTE,
    input: {
      comp,
      layer,
      effect: z.string().min(1),
      name: z.string().optional().describe('Rename the effect.'),
      props: z.record(z.string(), value).optional().describe('Parameter name -> value, e.g. {"Blurriness": 20}.'),
    },
    app: 'ae',
    hostFn: 'ae_addEffect',
  },
  {
    name: 'ae_setExpression',
    description:
      'Set or clear an expression on a property. Give your own expression text ("" clears it), or a preset: wiggle {freq, amp}, loopOut / loopIn {type: cycle|pingpong|offset|continue}, inertiaBounce {amp, freq, decay}. Returns any expression error.',
    input: {
      comp,
      layer,
      property,
      expression: z.string().optional(),
      preset: z.enum(['wiggle', 'loopOut', 'loopIn', 'inertiaBounce']).optional(),
      options: z
        .object({
          freq: z.number().optional(),
          amp: z.number().optional(),
          decay: z.number().optional(),
          type: z.enum(['cycle', 'pingpong', 'offset', 'continue']).optional(),
        })
        .optional(),
    },
    app: 'ae',
    hostFn: 'ae_setExpression',
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
      const path = newFramePath('ae-frame');
      const data = await callHost('ae', 'ae_exportFrame', { comp, time, path }, 120_000);
      const got = await waitForFile([path], 30_000, 'After Effects');
      return imageResult(got.path, got.size, data);
    },
  },
];

aeTools.push(
  makeBatch(
    'ae',
    'ae_batch',
    'ae_batch',
    aeTools,
    'Run many After Effects edits in one call and one undo step (Ctrl+Z undoes the whole batch).',
  ),
);
