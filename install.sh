#!/bin/bash
# MMG MCP installer for macOS (Intel and Apple Silicon).
# Run from the MMG-MCP folder:  bash install.sh
# Safe to run again: it updates the panel and rebuilds the server.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

step() { printf "\n\033[36m== %s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n" "$1"; exit 1; }
note() { printf "\033[33m%s\033[0m\n" "$1"; }

# 1. Node.js
step "Checking Node.js"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || die "Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again."
MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
[ "$MAJOR" -ge 20 ] || die "Node.js $(node -v) is too old. Install the LTS version (20 or newer) from https://nodejs.org."
echo "Node $(node -v) found at $NODE"

# 2. Build the server
step "Building the MCP server"
cd "$ROOT/server"
npm install --no-audit --no-fund || die "npm install failed (see above)."
npm run build || die "Build failed (see above)."
cd "$ROOT"

# 3. Install the panel (After Effects + Premiere share it)
step "Installing the MMG MCP panel"
EXT="$HOME/Library/Application Support/Adobe/CEP/extensions/com.mmg.mcp"
rm -rf "$EXT"
mkdir -p "$EXT"
cp -R "$ROOT/panel/." "$EXT/"
cp -R "$ROOT/host" "$EXT/host"
echo "Panel copied to $EXT"

# 4. Allow unsigned (dev) panels. CEP 11 = 2022-2024, 12+ = 2025 and later.
step "Turning on Adobe debug mode for unsigned panels"
for v in 11 12 13 14; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
echo "Done (CSXS.11 to CSXS.14)."

# 5. What to add to Claude
ENTRY="$ROOT/server/dist/index.js"
step "Installed. Now connect Claude"
echo
note "CLAUDE DESKTOP: Settings > Developer > Edit Config. In claude_desktop_config.json, add this"
note "inside \"mcpServers\" (if the file is empty, paste the whole thing):"
echo
cat <<EOF
{
  "mcpServers": {
    "mmg": {
      "command": "$NODE",
      "args": ["$ENTRY"]
    }
  }
}
EOF
echo
note "Then quit Claude Desktop fully (Cmd+Q) and open it again."
echo
note "CLAUDE CODE: run this once in Terminal:"
echo "claude mcp add mmg --scope user -- \"$NODE\" \"$ENTRY\""
echo
note "AFTER EFFECTS / PREMIERE: restart the app (log out and back in if the panel doesn't show), then open Window > Extensions > MMG MCP."
