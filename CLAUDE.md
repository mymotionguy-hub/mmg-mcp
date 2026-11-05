# MMG MCP — project brief for Claude

Private, open-ended tool for My Motion Guy (MMG): lets Claude edit **After Effects** and **Premiere Pro** projects through MCP, plus a footage scanner for sorting raw clips. Team uses Windows and macOS. Owner is non-technical: explain in plain words, keep setup to copy-paste steps.

Keep this file short: it is loaded every session. Tool details live in `docs/TOOLS.md` (read only when building or changing tools).

## Scope (MVP)
- AE: comps, layers, text + text animation presets, keyframes with easing, precompose, effects, expressions, frame render.
- Premiere: read project/sequence, import, bins + sorting, sequences, place/cut/trim/move clips, markers, transitions, transform, frame export.
- Footage scanner: scan a folder, extract a few frames per clip for Claude to look at, sort into Premiere bins.
- Out of scope for now: DaVinci Resolve, cloud server, logins, phone-only access (team uses Claude Remote Control instead).

## Architecture
```
Claude Desktop / Claude Code
  └─ stdio ─ server/  (Node 20+, TypeScript, @modelcontextprotocol/sdk)
                └─ HTTP 127.0.0.1 ─ panel/ (one CEP extension, loads in AE and Premiere)
                                       └─ evalScript ─ host/ (ExtendScript .jsx)
```
- **panel/** hosts a tiny HTTP server inside the app (CEP Node enabled). Ports: AE `47821`, Premiere `47822`. Any number of Claude processes can connect; the app is the single owner.
- **server/** is a client of the panel. Unreachable port = app closed or panel not open → say so in plain words.
- **host/lib/** shared ExtendScript (JSON polyfill, layer/clip finders, errors). **host/ae/**, **host/ppro/** per-app functions. Entry: `MMG.call(fnName, argsJson)` → returns JSON string `{ok:true,data}` or `{ok:false,error}`.
- Tools are a **registry** (`server/src/tools/ae.ts`, `ppro.ts`, `footage.ts`): each entry = name, description, zod input schema, target app, host function name. Adding a tool = one registry entry + one host function.
- Footage scanner runs in server/ with `ffmpeg-static` + `ffprobe-static`; no editing app needed for scanning.

## Rules
- ExtendScript is ES3: no let/const, arrow functions, template strings, or native JSON.
- Every editing host function wraps its work in one undo group (`app.beginUndoGroup` in AE; Premiere edits are single steps).
- Times are seconds. Layers/clips addressed by name or index; return enough state that Claude can re-read.
- Tool descriptions tell Claude: read state first, duplicate before big destructive changes, check a frame after visual changes.
- Each app has a batch tool so many edits cost one call.
- Supported: AE + Premiere **2022 (v22) through 2026**, Windows + macOS (Intel and Apple Silicon). CEP 11+.
- Never delete project media; removing clips from a timeline is fine when asked.

## Build chunks (one fresh session each)
- [x] 1 Foundation: repo layout, server, panel, bridge, 3 tools (`status`, `ae_getCompState`, `ae_exportFrame`), install scripts (Win `install.ps1`, Mac `install.sh`, dev-mode unsigned extension)
- [x] 2 After Effects tools (docs/TOOLS.md §AE)
- [x] 3 Premiere tools (docs/TOOLS.md §Premiere)
- [x] 4 Footage scanner + packaging + `docs/TEAM-GUIDE.md`
- [ ] 5 Fixes from `docs/BUGS.md` (team writes bugs there)

## Working cheaply
- Start each chunk in a new session; read this file, then only the files that chunk touches.
- Chunks 2–4 are routine: Sonnet is enough. Use Opus for chunk 1 and hard bugs.
- Write whole tool groups in one pass; don't re-read files you just wrote.
