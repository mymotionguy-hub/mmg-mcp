# Tool list (MVP)

Inputs in brackets; `?` = optional. Times in seconds. Every tool returns JSON.

## Shared
- `status` — which apps are connected (AE / Premiere), their versions, open project name.

## After Effects (~14) — prefix `ae_`
| Tool | Does | Inputs |
|---|---|---|
| `ae_getCompState` | Active or named comp: size, fps, duration, layers (name, index, type, in/out, parent, effects) | comp? |
| `ae_createComp` | New comp | name, width, height, fps, duration, bgColor? |
| `ae_duplicateComp` | Copy a comp before big changes (added in chunk 2) | comp?, name? |
| `ae_setProperty` | Static value on any property, e.g. effect params (added in chunk 2) | layer, property, value |
| `ae_addLayer` | Solid, shape (rect/ellipse), null, adjustment, or camera | comp?, kind, name?, color?, size? |
| `ae_addText` | Text layer | comp?, text, name?, font?, size?, color?, position?, align? |
| `ae_styleText` | Font, size, fill, stroke, tracking, leading | layer, props |
| `ae_animateText` | Preset text animation: fade, slide (dir), pop (overshoot), type-on, word-by-word | layer, preset, start, duration, options? |
| `ae_setTransform` | Static position, scale, rotation, opacity, anchor | layer, props |
| `ae_setKeyframes` | Keyframes on any transform/effect property with easing (linear, ease, easeIn, easeOut, custom influence) | layer, property, keys[{time, value, ease?}] |
| `ae_layerOrder` | Reorder, parent, rename, trim in/out, delete, duplicate | layer, action, args |
| `ae_precompose` | Precompose layers | layers[], name, moveAttributes? |
| `ae_addEffect` | Add effect by match name or display name, set its values | layer, effect, props? |
| `ae_setExpression` | Set/clear expression on a property (incl. presets: wiggle, loopOut, inertia bounce) | layer, property, expression |
| `ae_exportFrame` | Render frame to PNG, return image | comp?, time |
| `ae_batch` | Run a list of the above in one undo group | steps[{tool, args}] |

## Premiere Pro (~12) — prefix `pr_`
| Tool | Does | Inputs |
|---|---|---|
| `pr_getProjectState` | Bins and items (name, type, duration, path) | bin? |
| `pr_getSequenceState` | Active/named sequence: tracks, clips (index, name, start, end, in, out), markers | sequence? |
| `pr_import` | Import files/folders into a bin | paths[], bin? |
| `pr_organize` | Create bins, move items into bins, rename items, set label colors | actions[] |
| `pr_createSequence` | New sequence from preset or from a clip's settings | name, fromClip? |
| `pr_placeClip` | Insert or overwrite a project item at a time on a track | item, track, time, mode?, in?, out? |
| `pr_cut` | Razor at time(s); remove a range with ripple (close gap) | track?, times[] or range |
| `pr_trimMove` | Trim clip in/out, move clip, enable/disable, remove | clip, action, args |
| `pr_markers` | Add/remove sequence or clip markers (name, color, comment) | items[] |
| `pr_transition` | Add a transition at cuts (cross dissolve, dip to black, etc.) | track, cuts|all, name, duration |
| `pr_setClipProps` | Scale, position, rotation, opacity, volume (static) | clip, props |
| `pr_exportFrame` | Export frame to PNG, return image | time |
| `pr_batch` | Run a list of edits in order | steps[{tool, args}] |

## Footage scanner — prefix `ft_`
| Tool | Does | Inputs |
|---|---|---|
| `ft_scan` | Scan a folder: duration, resolution, fps, codec, audio, date for each clip | folder, recursive? |
| `ft_frames` | Contact sheet (e.g. 6 frames) per clip, returned as images for Claude to tag | files[], count? |
| `ft_sortToPremiere` | Import and sort clips into Premiere bins from Claude's tags; add markers | plan[{file, bin, markers?}] |
