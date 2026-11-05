# MMG MCP installer for Windows.
# Run from the MMG-MCP folder:  powershell -ExecutionPolicy Bypass -File install.ps1
# Safe to run again: it updates the panel and rebuilds the server.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Stop-Install($t) { Write-Host ""; Write-Host $t -ForegroundColor Red; exit 1 }

# 1. Node.js
Step "Checking Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Stop-Install "Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again." }
$major = [int]((& node -v).TrimStart('v').Split('.')[0])
if ($major -lt 20) { Stop-Install "Node.js $(& node -v) is too old. Install the LTS version (20 or newer) from https://nodejs.org." }
Write-Host "Node $(& node -v) found at $($node.Source)"

# 2. Build the server
Step "Building the MCP server"
Push-Location (Join-Path $Root 'server')
try {
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Stop-Install "npm install failed (see above)." }
    npm run build
    if ($LASTEXITCODE -ne 0) { Stop-Install "Build failed (see above)." }
} finally { Pop-Location }

# 3. Install the panel (After Effects + Premiere share it)
Step "Installing the MMG MCP panel"
$ext = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.mmg.mcp'
if (Test-Path $ext) { Remove-Item $ext -Recurse -Force }
New-Item -ItemType Directory -Path $ext -Force | Out-Null
Copy-Item -Path (Join-Path $Root 'panel\*') -Destination $ext -Recurse -Force
Copy-Item -Path (Join-Path $Root 'host') -Destination (Join-Path $ext 'host') -Recurse -Force
Write-Host "Panel copied to $ext"

# 4. Allow unsigned (dev) panels. CEP 11 = 2022-2024, 12+ = 2025 and later.
Step "Turning on Adobe debug mode for unsigned panels"
foreach ($v in 11..14) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key | Out-Null }
    Set-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -Type String
}
Write-Host "Done (CSXS.11 to CSXS.14)."

# 5. What to add to Claude
$entry = Join-Path $Root 'server\dist\index.js'
$block = [ordered]@{ command = $node.Source; args = @($entry) } | ConvertTo-Json -Depth 4

Step "Installed. Now connect Claude"
Write-Host ""
Write-Host "CLAUDE DESKTOP: Settings > Developer > Edit Config. In claude_desktop_config.json, add this" -ForegroundColor Yellow
Write-Host "inside ""mcpServers"" (if the file is empty, paste the whole thing):" -ForegroundColor Yellow
Write-Host ""
Write-Host "{"
Write-Host "  ""mcpServers"": {"
Write-Host "    ""mmg"": $(($block -split "`r?`n") -join "`n    ")"
Write-Host "  }"
Write-Host "}"
Write-Host ""
Write-Host "Then quit Claude Desktop fully (system tray > Quit) and open it again." -ForegroundColor Yellow
Write-Host ""
Write-Host "CLAUDE CODE: run this once in a terminal:" -ForegroundColor Yellow
Write-Host "claude mcp add mmg --scope user -- ""$($node.Source)"" ""$entry"""
Write-Host ""
Write-Host "AFTER EFFECTS / PREMIERE: restart the app, then open Window > Extensions > MMG MCP." -ForegroundColor Yellow
