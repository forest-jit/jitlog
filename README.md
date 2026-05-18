# JITlog

A lightweight macOS menu bar app for tracking time across tasks throughout the day. Lives entirely in the menu bar — no Dock icon, no clutter.

## Install

1. Download the latest `.dmg` from the [Releases](../../releases/latest) tab
2. Open the `.dmg` and drag **JITlog** to your Applications folder
3. On first launch, right-click the app → **Open** (macOS will warn about an unidentified developer — this is expected for unsigned builds)

JITlog will appear in your menu bar and launch automatically on login.

---

## How it works

### Menu bar

The menu bar icon shows a play/pause indicator and a running timer for your active task. Click it to open the panel.

### Panel

The panel is your main interface. It lists today's tasks in numbered slots (1–9, then 0), with the active task highlighted. From here you can:

- **Start/pause** a task by clicking the icon next to it
- **Open notes** for a task with the `open` button
- **Copy notes** to the clipboard with `copy`
- **Drag to reorder** tasks between slots
- Use number keys `1`–`9` / `0` to quickly switch to a task

At the bottom of the panel:

| Action | What it does |
|---|---|
| **new task** | Add a task to today's list |
| **sort by client** | Re-order tasks alphabetically by client |
| **grid** | Open the full-screen grid view |
| **history** | Browse and revive tasks from past days |
| **settings** | Themes, fonts, shortcuts, clients |
| **quit** | Exit the app |

### Grid

The grid shows all 10 task slots at once as cards. Click an empty slot to create a task — press **Enter** to start the timer or **Escape** to cancel. Click the play button on any card to switch to that task. Task names are editable directly in the card.

The app bar at the top of the grid has quick actions: new task, sort by client, copy day summary, archive all, and close (×).

### Notes

Each task has a notes doc. Open it from the panel (`open` button or `d` key) or from a grid card. Notes support plain text and pasted images.

### History

Past days' tasks are listed in the history view. You can revive any task (copies it to today) or delete it.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+\` | Open / close panel |
| `Ctrl+Shift+N` | New task |
| `Ctrl+Shift+P` | Pause / resume active task |
| `Ctrl+Shift+A` | Archive active task |
| `Ctrl+Shift+Space` | Open notes for active task |
| `Ctrl+Shift+H` | Show history |
| `Ctrl+Shift+C` | Copy notes for active task |
| `Ctrl+Shift+Return` | Open grid |

All shortcuts are rebindable in Settings.

---

## Settings

- **Theme** — choose from built-in themes or create a custom one with your own colors
- **Font** — size and family (includes system fonts)
- **Display** — panel width (Narrow / Normal / Wide)
- **Clients** — manage a list of client names for tagging tasks
- **Shortcuts** — click any shortcut to reassign it
