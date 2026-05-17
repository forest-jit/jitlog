const {
  app,
  Tray,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  screen,
  nativeImage,
  shell,
  session,
} = require("electron");
const path = require("path");
const fs = require("fs");
const store = require("./store");
const icons = require("./icons");
const settings = require("./settings");


function resolvedThemeVars(s) {
  const allThemes = {
    ...(s.themes || settings.BUILTIN_THEMES),
    ...(s.customThemes || {}),
  };
  const base = allThemes[s.theme] || settings.BUILTIN_THEMES.teal;
  return {
    ...base,
    "--font-size": (s.font?.size || 13) + "px",
    "--font-family": (() => {
      const family = s.font?.family || 'system';
      const pre = settings.FONT_FAMILIES.find(f => f.key === family);
      return pre ? pre.stack : `"${family}", sans-serif`;
    })(),
  };
}

function broadcastRefresh() {
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('refresh');
  if (gridWin && !gridWin.isDestroyed()) gridWin.webContents.send('refresh');
}

function broadcastTheme(vars) {
  if (vars['--accent']) cachedAccent = vars['--accent'];
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("apply-theme", vars);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.setLoginItemSettings({ openAtLogin: true });
app.dock && app.dock.hide();

let tray = null;
let trayRendererWin = null;
let trayRendererReady = false;
let panelWin = null;
let gridWin = null;
let tickInterval = null;
let fallbackIcons = { play: null, pause: null };
let cachedAccent = '#2dd4bf';

// ─── Tray canvas renderer ─────────────────────────────────────────────────────

function initTrayRenderer() {
  trayRendererWin = new BrowserWindow({
    width: 140,
    height: 44,
    show: false,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  trayRendererWin.loadFile(path.join(__dirname, "tray-renderer.html"));
  trayRendererWin.webContents.once("did-finish-load", () => {
    trayRendererReady = true;
    tray && tray.setTitle("");
    updateTray();
  });
  trayRendererWin.on("closed", () => {
    trayRendererWin = null;
    trayRendererReady = false;
  });
}

ipcMain.on("tray-image", (_, dataUrl, isTemplate = true) => {
  if (!tray) return;
  const img = nativeImage.createEmpty();
  img.addRepresentation({ scaleFactor: 2.0, dataURL: dataUrl });
  img.setTemplateImage(isTemplate);
  tray.setImage(img);
});

function updateTray() {
  if (!tray) return;
  const active = store.getActiveTask();
  const paused = getLastPausedToday();

  if (!trayRendererReady || !trayRendererWin || trayRendererWin.isDestroyed()) {
    tray.setImage(active ? fallbackIcons.pause : fallbackIcons.play);
    const elapsed = active
      ? store.getElapsed(active)
      : paused
        ? store.getElapsed(paused)
        : -1;
    tray.setTitle(elapsed >= 0 ? " " + fmtFallback(elapsed) : " -:--");
    return;
  }

  trayRendererWin.webContents.send("render-tray", {
    isActive: !!active,
    isIdle: !active && !paused,
    timeSecs: active
      ? store.getElapsed(active)
      : paused
        ? store.getElapsed(paused)
        : -1,
    accentColor: active ? cachedAccent : null,
  });
}

function fmtFallback(secs) {
  const m = Math.floor(secs / 60),
    s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getLastPausedToday() {
  return (
    store
      .getTodayTasks()
      .filter((t) => t.status === "paused" && t.segments.length > 0)
      .sort((a, b) => {
        const al = a.segments[a.segments.length - 1].stopped_at;
        const bl = b.segments[b.segments.length - 1].stopped_at;
        return new Date(bl) - new Date(al);
      })[0] || null
  );
}

function startTick() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    updateTray();
    if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send("tick");
  }, 1000);
}

// ─── Panel ────────────────────────────────────────────────────────────────────

const WP = {
  nodeIntegration: false,
  contextIsolation: true,
  preload: path.join(__dirname, "preload.js"),
};

function getDropdownPos(width) {
  const tb = tray.getBounds();
  const disp = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y });
  let x = Math.round(tb.x + tb.width / 2 - width / 2);
  const y = Math.round(tb.y + tb.height + 4);
  const wa = disp.workArea;
  if (x + width > wa.x + wa.width) x = wa.x + wa.width - width - 4;
  if (x < wa.x) x = wa.x + 4;
  return { x, y };
}

function panelWidth() {
  const s = settings.load();
  return settings.PANEL_WIDTHS[s.panelWidth || 'normal'] || 320;
}

function openPanel() {
  if (panelWin && !panelWin.isDestroyed()) {
    panelWin.focus();
    return;
  }
  const w = panelWidth();
  const { x, y } = getDropdownPos(w);
  panelWin = new BrowserWindow({
    x,
    y,
    width: w,
    height: 50,
    type: "panel",
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: WP,
  });
  panelWin.loadFile(path.join(__dirname, "panel.html"));
  panelWin.on("blur", () => {
    setTimeout(() => {
      if (!panelWin || panelWin.isDestroyed()) return;
      if (!BrowserWindow.getFocusedWindow()) panelWin.close();
    }, 300);
  });
  panelWin.on("closed", () => {
    panelWin = null;
  });
}

// Open panel (if needed) then send a view-switch message.
function openPanelAndSend(channel, data) {
  if (panelWin && !panelWin.isDestroyed()) {
    panelWin.webContents.send(channel, data);
    panelWin.focus();
  } else {
    openPanel();
    setTimeout(() => {
      if (panelWin && !panelWin.isDestroyed())
        panelWin.webContents.send(channel, data);
    }, 300);
  }
}

// ─── Grid overlay ─────────────────────────────────────────────────────────────

function createGridWin(onReady) {
  const tb = tray.getBounds();
  const { workArea } = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y });
  const win = new BrowserWindow({
    x: workArea.x, y: workArea.y,
    width: workArea.width, height: workArea.height,
    transparent: true, frame: false, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: WP,
  });
  win.loadFile(path.join(__dirname, "grid.html"));
  win.once("ready-to-show", () => { win.show(); if (onReady) onReady(); });
  win.on("closed", () => { gridWin = null; });
  return win;
}

function openGrid() {
  if (gridWin && !gridWin.isDestroyed()) { gridWin.close(); return; }
  if (panelWin && !panelWin.isDestroyed()) panelWin.close();
  gridWin = createGridWin();
}

ipcMain.on("open-grid", () => {
  if (gridWin && !gridWin.isDestroyed()) { gridWin.focus(); return; }
  gridWin = createGridWin(() => {
    if (panelWin && !panelWin.isDestroyed()) panelWin.close();
  });
});

ipcMain.on("close-grid", () => {
  if (gridWin && !gridWin.isDestroyed()) gridWin.close();
  updateTray();
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send("refresh");
});

ipcMain.on("cycle-grid-display", () => {
  if (!gridWin || gridWin.isDestroyed()) return;
  const displays = screen.getAllDisplays();
  if (displays.length < 2) return;
  const current = screen.getDisplayNearestPoint(gridWin.getBounds());
  const idx = displays.findIndex((d) => d.id === current.id);
  const next = displays[(idx + 1) % displays.length];
  const { workArea } = next;
  gridWin.setBounds({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
  });
});

// ─── Shortcuts ────────────────────────────────────────────────────────────────

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const s = settings.load();
  const sc = { ...settings.DEFAULT_SHORTCUTS, ...(s.shortcuts || {}) };

  const actions = {
    openPanel: () => openPanel(),
    newTask: () => {
      openPanel();
      setTimeout(() => {
        if (panelWin && !panelWin.isDestroyed())
          panelWin.webContents.send("focus-new-task");
      }, 220);
    },
    pauseResume: () => {
      const active = store.getActiveTask();
      if (active) {
        store.pauseTask(active.id);
      } else {
        const p = getLastPausedToday();
        if (p) store.startTask(p.id);
      }
      updateTray();
      broadcastRefresh();
    },
    archive: () => {
      const active = store.getActiveTask();
      if (active) {
        store.archiveTask(active.id);
        updateTray();
        broadcastRefresh();
      }
    },
    docs: () => {
      const t = store.getActiveTask() || getLastPausedToday();
      if (t) openPanelAndSend("show-docs", t.id);
      else openPanel();
    },
    history: () => openPanelAndSend("show-history", null),
    copy: () => {
      const t = store.getActiveTask() || getLastPausedToday();
      if (t) copyTaskContent(t.id);
    },
    grid: () => openGrid(),
  };

  for (const [name, fn] of Object.entries(actions)) {
    const accel = sc[name];
    if (!accel) continue;
    const ok = globalShortcut.register(accel, fn);
    if (!ok) console.error("shortcut failed to register (conflict?):", accel);
  }
}

// ─── App ready ────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    if (permission === 'local-fonts') { cb(true); return; }
    cb(false);
  });

  fallbackIcons.play = icons.createPlayIcon();
  fallbackIcons.pause = icons.createPauseIcon();
  cachedAccent = resolvedThemeVars(settings.load())['--accent'] || cachedAccent;

  tray = new Tray(fallbackIcons.play);
  tray.setIgnoreDoubleClickEvents(true);
  tray.setTitle(" -:--");
  tray.on("click", openPanel);

  initTrayRenderer();
  startTick();
  updateTray();

  registerShortcuts();

  app.on("second-instance", () => openPanel());
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (tickInterval) clearInterval(tickInterval);
});

app.on("window-all-closed", () => {});

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle("get-today-tasks", () => store.getTodayTasks());
ipcMain.handle("get-all-tasks", () => store.getAllTasks());
ipcMain.handle("get-task", (_, id) => store.getTask(id));
ipcMain.handle("get-elapsed", (_, task) => store.getElapsed(task));
ipcMain.handle("get-slots", () => store.getSlots());
ipcMain.handle("create-task-in-slot", (_, name, slot, client) => {
  const t = store.createTaskInSlot(name, slot, client);
  updateTray();
  return t;
});
ipcMain.handle("revive-task", (_, id) => {
  const t = store.reviveTask(id);
  updateTray();
  return t;
});
ipcMain.handle("get-settings", () => fullSettings(settings.load()));
ipcMain.handle("save-settings", (event, newSettings) => {
  const { themeVars: _tv, fontFamilies: _ff, fontSizeOptions: _fso, shortcutLabels: _sl, ...toSave } = newSettings;
  settings.save(toSave);
  broadcastTheme(resolvedThemeVars(toSave));
  registerShortcuts();
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const w = settings.PANEL_WIDTHS[toSave.panelWidth || 'normal'] || 320;
    const [, h] = win.getSize();
    const { x, y } = getDropdownPos(w);
    win.setBounds({ x, y, width: w, height: h });
  }
  return fullSettings(toSave);
});

ipcMain.handle("get-themes", () => {
  const s = settings.load();
  return {
    builtin: s.themes || settings.BUILTIN_THEMES,
    custom: s.customThemes || {},
  };
});

function fullSettings(s) {
  return {
    ...s,
    shortcuts:       { ...settings.DEFAULT_SHORTCUTS, ...(s.shortcuts || {}) },
    fontFamilies:    settings.FONT_FAMILIES,
    fontSizeOptions: settings.FONT_SIZE_OPTIONS,
    shortcutLabels:  settings.SHORTCUT_LABELS,
    themeVars:       resolvedThemeVars(s),
  };
}

ipcMain.handle("save-custom-theme", (_, name, vars) => {
  const s = settings.load();
  s.customThemes = { ...(s.customThemes || {}), [name]: vars };
  settings.save(s);
  return fullSettings(s);
});

ipcMain.handle("delete-custom-theme", (_, name) => {
  const s = settings.load();
  if (s.customThemes) delete s.customThemes[name];
  if (s.theme === name) s.theme = "teal";
  settings.save(s);
  broadcastTheme(resolvedThemeVars(s));
  return fullSettings(s);
});
ipcMain.on("open-settings-file", () => {
  settings.ensureFile();
  shell.openPath(settings.SETTINGS_FILE);
});
ipcMain.on("reload-settings", () => {
  const s = settings.load();
  broadcastTheme(resolvedThemeVars(s));
});

ipcMain.handle("create-task", (_, name, client) => {
  const t = store.createTask(name, client);
  updateTray();
  return t;
});
ipcMain.handle("start-task", (_, id) => {
  const t = store.startTask(id);
  updateTray();
  broadcastRefresh();
  return t;
});
ipcMain.handle("pause-task", (_, id) => {
  const t = store.pauseTask(id);
  updateTray();
  broadcastRefresh();
  return t;
});
ipcMain.handle("archive-task", (_, id) => {
  const t = store.archiveTask(id);
  updateTray();
  broadcastRefresh();
  return t;
});

ipcMain.handle("update-notes", (_, id, notes) =>
  store.updateTaskNotes(id, notes),
);
ipcMain.handle("update-link",   (_, id, link)   => store.updateTaskLink(id, link));
ipcMain.handle("update-client", (_, id, client) => store.updateTaskClient(id, client));
ipcMain.handle("delete-task", (_, id) => {
  store.deleteTask(id);
  updateTray();
  broadcastRefresh();
});
ipcMain.handle("swap-task-slots", (_, id1, id2) =>
  store.swapTaskSlots(id1, id2),
);
ipcMain.handle("sort-tasks-by-client", () => store.sortTasksByClient());
ipcMain.handle("update-task-name", (_, id, name) => store.updateTaskName(id, name));
ipcMain.handle("archive-all-tasks", () => {
  store.archiveAllTasks();
  updateTray();
  broadcastRefresh();
});
ipcMain.handle("copy-day-summary", () => {
  const tasks = store.getTodayTasks().sort((a, b) => (a.slot || 0) - (b.slot || 0));
  if (!tasks.length) return;
  let totalSecs = 0;
  const lines = tasks.map(t => {
    const secs = store.getElapsed(t);
    totalSecs += secs;
    const m = Math.floor(secs / 60), s = secs % 60;
    const time = `${m}:${String(s).padStart(2, '0')}`;
    const client = t.client ? ` (${t.client})` : '';
    return `• ${t.name || '(untitled)'}${client} — ${time}`;
  });
  const tm = Math.floor(totalSecs / 60), ts = totalSecs % 60;
  lines.push('', `Total: ${tm}:${String(ts).padStart(2, '0')}`);
  clipboard.writeText(lines.join('\n'));
});

ipcMain.handle("save-image", (_, buffer) =>
  store.saveImage(Buffer.from(buffer)),
);
ipcMain.handle("add-image", (_, id, p) => store.addImageToTask(id, p));

function copyTaskContent(id) {
  const task = store.getTask(id);
  if (!task) return;

  const notes = task.notes || "";
  const escHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const unescHtml = (s) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ");

  let text = "";
  let html = '<meta charset="UTF-8">';
  let imgIdx = 1;

  const isHtml =
    notes.includes("<img") ||
    notes.includes("<br") ||
    notes.includes("<div") ||
    notes.includes("<p");

  if (isHtml) {
    // Walk HTML in source order, extracting text segments and img tags
    const tokenRe = /(<img[^>]*>|<br\s*\/?>|<\/?(div|p)[^>]*>)/gi;
    let last = 0,
      m;
    while ((m = tokenRe.exec(notes)) !== null) {
      // Text segment before this token
      const raw = notes.slice(last, m.index);
      if (raw) {
        const t = unescHtml(raw.replace(/<[^>]+>/g, ""));
        text += t;
        html += escHtml(t).replace(/\n/g, "<br>");
      }
      const tok = m[0].toLowerCase();
      if (tok.startsWith("<img")) {
        const srcM = m[0].match(/src="file:\/\/([^"]+)"/i);
        const imgPath = srcM ? srcM[1] : null;
        try {
          const b64 = imgPath
            ? fs.readFileSync(imgPath).toString("base64")
            : null;
          text += `[image ${imgIdx}]\n`;
          html += b64
            ? `<img src="data:image/png;base64,${b64}" style="max-width:100%;display:block;margin:4px 0"><br>`
            : `[image ${imgIdx} - missing]<br>`;
        } catch {
          text += `[image ${imgIdx} - missing]\n`;
        }
        imgIdx++;
      } else {
        // br / div / p → newline in plain text
        text += "\n";
        html += "<br>";
      }
      last = m.index + m[0].length;
    }
    // Remaining text after last token
    const tail = notes.slice(last);
    if (tail) {
      const t = unescHtml(tail.replace(/<[^>]+>/g, ""));
      text += t;
      html += escHtml(t).replace(/\n/g, "<br>");
    }
  } else {
    // Old plain-text format
    text = notes;
    html += escHtml(notes).replace(/\n/g, "<br>");
    if (task.images && task.images.length) {
      text += "\n\n";
      html += "<br><br>";
      for (const imgPath of task.images) {
        try {
          const b64 = fs.readFileSync(imgPath).toString("base64");
          text += `[image ${imgIdx}]\n`;
          html += `<img src="data:image/png;base64,${b64}" style="max-width:100%;display:block;margin:4px 0"><br>`;
        } catch {
          text += `[image ${imgIdx} - missing]\n`;
        }
        imgIdx++;
      }
    }
  }

  clipboard.write({ text: text.trim(), html });
}

ipcMain.handle("copy-task-content", (_, id) => copyTaskContent(id));

ipcMain.on("quit-app", () => app.quit());
ipcMain.on("close-window", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.on("refresh-panel", () => {
  broadcastRefresh();
  updateTray();
});

ipcMain.on("resize-panel", (event, h) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const clamped = Math.max(96, Math.min(700, h));
  const [w] = win.getSize();
  const { x, y } = getDropdownPos(w);
  win.setBounds({ x, y, width: w, height: clamped });
  if (!win.isVisible()) win.show();
});
