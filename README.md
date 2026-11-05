# MMG MCP

Lets Claude edit After Effects and Premiere Pro projects for the My Motion Guy team, and sort raw footage.

Status: After Effects, Premiere Pro and footage scanner tools built (34 tools, see `docs/TOOLS.md`). Team instructions: `docs/TEAM-GUIDE.md`.

## Install (needs Node.js 20+ from nodejs.org)
- Windows: in this folder run `powershell -ExecutionPolicy Bypass -File install.ps1`
- Mac: in this folder run `bash install.sh`

The installer prints the exact lines to add to Claude. Then restart After Effects and open Window > Extensions > MMG MCP.

## Developer test (no After Effects needed)
`cd server && npm test`

## Make a zip for the team
`node scripts/package.mjs` (creates `release/mmg-mcp-<version>.zip` from what is committed)
