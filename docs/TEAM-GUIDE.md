# MMG MCP — team guide

MMG MCP lets Claude work inside **After Effects** and **Premiere Pro** on your computer, and look through raw footage for you. You ask in plain words; Claude does the clicks.

Works with After Effects and Premiere Pro **2022 to 2026**, on **Windows and Mac**.

---

## 1. Install (once, about 10 minutes)

**You need:** Node.js (free). Get the **LTS** version from https://nodejs.org and install it with the default options.

1. Close After Effects and Premiere Pro.
2. Unzip `mmg-mcp-x.x.x.zip` somewhere permanent, like your Documents folder. **Don't move the folder later** — Claude points to it.
3. Run the installer:
   - **Windows:** open the `mmg-mcp` folder, click the address bar, type `powershell` and press Enter. In the blue window, paste:
     ```
     powershell -ExecutionPolicy Bypass -File install.ps1
     ```
   - **Mac:** open Terminal, type `cd ` (with a space), drag the `mmg-mcp` folder onto the Terminal window, press Enter, then paste:
     ```
     bash install.sh
     ```
4. At the end, the installer prints a block of text starting with `{`. Keep that window open for step 2.

## 2. Connect Claude

**Claude Desktop:** Settings → Developer → Edit Config. This opens a file called `claude_desktop_config.json`.
- If the file is empty or only has `{}`, replace everything with the block the installer printed.
- If it already has `"mcpServers"`, add only the `"mmg": { ... }` part inside it (mind the commas).
- Save, then **fully quit** Claude Desktop (Windows: right-click the Claude icon near the clock → Quit; Mac: Cmd+Q) and open it again.

**Claude Code:** run the `claude mcp add mmg ...` line the installer printed, once.

## 3. Open the panel

Open After Effects or Premiere Pro, then **Window → Extensions → MMG MCP**. The panel should say **Connected** in green. Dock it anywhere and **leave it open** while Claude works — Claude talks to the app through it.

Ask Claude: **"Run status"**. It should name your open project.

---

## 4. What to ask

Be specific: name the comp, sequence, layer or clip when you can, and give times in seconds.

**Premiere Pro — cutting and trimming**
- "Read my sequence and tell me what's on each track."
- "Duplicate the sequence, then cut out 0:12 to 0:18 and close the gap."
- "Razor all tracks at 5s, 9.5s and 14s."
- "Trim the end of clip 3 on V1 to 22 seconds."
- "Put markers where you'd cut the ums and pauses — don't cut yet." (Then review and say "OK, make those cuts.")
- "Add 0.5s cross dissolves at every cut on V1, and a fade from black at the start."
- "Set the music on A2 to -12 dB."
- "Import everything in D:\Shoot\Day1 into a bin called Footage/Day 1."

**After Effects — motion**
- "Make a 1920×1080, 25 fps, 10 s comp called Promo with a dark blue background."
- "Add the title 'Summer Sale' in Montserrat Bold, white, and pop it in at 1 s."
- "Add a rounded orange rectangle behind it that slides up."
- "Add a drop shadow to the title and make the logo wiggle slightly."
- "Show me the frame at 2 seconds."

**Footage sorting**
- "Scan D:\Shoot\Day1 and tell me what's there."
- "Look at the clips and sort them into Premiere bins by shot type: Interviews, B-roll, Drone. Add a marker on the best moment of each."

## 5. Safety

- **Undo:** in After Effects one Ctrl+Z (Cmd+Z) undoes a whole request. In Premiere each change is its own step, so you may need several — Claude tells you what it changed.
- Claude **duplicates** your sequence or comp before big changes unless you say "edit in place".
- Claude **never deletes your media files**. Removing a clip from a timeline only takes it off the timeline.
- Save your project before big jobs, like you would anyway.

## 6. If something goes wrong

| What you see | What to do |
|---|---|
| Claude says it **can't reach** the app | Is the app open, and the **MMG MCP panel** open in it? Open it via Window → Extensions. |
| **MMG MCP** is not in Window → Extensions | Run the installer again, restart the app. On Mac, log out and back in. |
| Panel says **port is busy** | Another copy of the app is open. Close it, then close and reopen the panel. |
| Claude says the app **didn't answer in time** | A dialog box may be open in the app, or it's rendering. Close the dialog and ask again. |
| Claude doesn't list the MMG tools at all | Check the config text in step 2, then fully quit and reopen Claude. |

**Report a problem:** add one line to `docs/BUGS.md` (or send it to whoever maintains MMG MCP):
`- [ ] Your name · App + version · Win/Mac · What you asked Claude · What happened`

## 7. Updating

When you get a new zip: unzip it over the old folder (same place), run the installer again, restart Claude and the Adobe apps.

## Phone / away from the desk

Use **Remote Control** in the Claude app to steer a session running on your computer. Your computer must stay on, with the Adobe app and the MMG MCP panel open.
