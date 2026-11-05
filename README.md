# MMG MCP

Lets Claude edit After Effects and Premiere Pro projects for the My Motion Guy team, and sort raw footage.

Status: foundation built (tools: `status`, `ae_getCompState`, `ae_exportFrame`). Full team guide comes in `docs/TEAM-GUIDE.md`.

## Install (needs Node.js 20+ from nodejs.org)
- Windows: in this folder run `powershell -ExecutionPolicy Bypass -File install.ps1`
- Mac: in this folder run `bash install.sh`

The installer prints the exact lines to add to Claude. Then restart After Effects and open Window > Extensions > MMG MCP.

## Developer test (no After Effects needed)
`cd server && npm test`
