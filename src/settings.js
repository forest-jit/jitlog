const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const FONT_FAMILIES = [
  { key: 'system',   label: 'System',   stack: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" },
  { key: 'mono',     label: 'Mono',     stack: "'SF Mono', 'Menlo', 'Courier New', monospace" },
  { key: 'ioskeley', label: 'Ioskeley', stack: "'Ioskeley Mono', monospace" },
  { key: 'serif',    label: 'Serif',    stack: "Georgia, 'New York', serif" },
  { key: 'rounded',  label: 'Rounded',  stack: "'SF Pro Rounded', 'Trebuchet MS', sans-serif" },
];

const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24];

const PANEL_WIDTHS = { narrow: 260, normal: 320, wide: 400 };

const DEFAULT_SHORTCUTS = {
  openPanel:   "Control+Shift+\\",
  newTask:     "Control+Shift+N",
  pauseResume: "Control+Shift+P",
  archive:     "Control+Shift+A",
  docs:        "Control+Shift+Space",
  history:     "Control+Shift+H",
  copy:        "Control+Shift+C",
  grid:        "Control+Shift+Return",
};

const SHORTCUT_LABELS = {
  openPanel:   'Open panel',
  newTask:     'New task',
  pauseResume: 'Pause / Resume (active task)',
  archive:     'Archive (active task)',
  docs:        'Open notes (active task)',
  history:     'Show history',
  copy:        'Copy notes (active task)',
  grid:        'Open grid',
};

const BUILTIN_THEMES = {
  teal: {
    "--bg": "#071918",
    "--accent": "#2dd4bf",
    "--danger": "#b060c0",
    "--text": "#c8ede8",
  },
  emerald: {
    "--bg": "#0b1a0d",
    "--accent": "#52c87a",
    "--danger": "#e06060",
    "--text": "#cfe8d2",
  },
  slate: {
    "--bg": "#0d1117",
    "--accent": "#388bfd",
    "--danger": "#f85149",
    "--text": "#c9d1d9",
  },
  mono: {
    "--bg": "#0a0a0a",
    "--accent": "#e0e0e0",
    "--danger": "#cc6666",
    "--text": "#cccccc",
  },
};

const DEFAULTS = {
  clients: [],
  theme: "teal",
  themes: BUILTIN_THEMES,
  customThemes: {},
  font: { size: 13, family: "system" },
  panelWidth: 'normal',
};

function getFile() {
  return path.join(app.getPath("userData"), "settings.json");
}

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(getFile(), "utf8"));
    return {
      ...DEFAULTS,
      ...saved,
      themes: { ...DEFAULTS.themes, ...(saved.themes || {}) },
      customThemes: saved.customThemes || {},
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(data) {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getFile(), JSON.stringify(data, null, 2), "utf8");
}

function ensureFile() {
  if (!fs.existsSync(getFile())) save(DEFAULTS);
}

module.exports = {
  load,
  save,
  ensureFile,
  BUILTIN_THEMES,
  FONT_FAMILIES,
  FONT_SIZE_OPTIONS,
  PANEL_WIDTHS,
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  get SETTINGS_FILE() {
    return getFile();
  },
};
