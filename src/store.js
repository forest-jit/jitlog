const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function getDataFile()   { return path.join(app.getPath('userData'), 'data.json'); }
function getImagesDir()  { return path.join(app.getPath('userData'), 'images'); }

function ensureDirs() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.mkdirSync(getImagesDir(), { recursive: true });
}

function load() {
  ensureDirs();
  try {
    const raw = fs.readFileSync(getDataFile(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { tasks: [] };
  }
}

function save(data) {
  ensureDirs();
  fs.writeFileSync(getDataFile(), JSON.stringify(data, null, 2), 'utf8');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getElapsed(task) {
  let ms = 0;
  for (const seg of task.segments) {
    const start = new Date(seg.started_at).getTime();
    const end = seg.stopped_at ? new Date(seg.stopped_at).getTime() : Date.now();
    ms += end - start;
  }
  return Math.floor(ms / 1000);
}

function getTodayTasks() {
  const data = load();
  const t = today();
  return data.tasks.filter(task => task.date === t && !task.archived_at);
}

function getAllTasks() {
  return load().tasks;
}

function occupiedSlots(data) {
  const t = today();
  return new Set(
    data.tasks
      .filter(task => task.date === t && !task.archived_at && task.slot)
      .map(task => task.slot)
  );
}

function nextSlot(data) {
  const occ = occupiedSlots(data);
  for (let i = 1; i <= 10; i++) if (!occ.has(i)) return i;
  return null;
}

function createTask(name, client) {
  const data = load();
  const task = {
    id: uuidv4(),
    name,
    client: client || '',
    slot: nextSlot(data),
    date: today(),
    status: 'paused',
    segments: [],
    notes: '',
    link: '',
    images: [],
    archived_at: null,
    created_at: new Date().toISOString()
  };
  data.tasks.push(task);
  save(data);
  return task;
}

function createTaskInSlot(name, slot, client) {
  const data = load();
  const task = {
    id: uuidv4(),
    name,
    client: client || '',
    slot,
    date: today(),
    status: 'paused',
    segments: [],
    notes: '',
    link: '',
    images: [],
    archived_at: null,
    created_at: new Date().toISOString()
  };
  data.tasks.push(task);
  save(data);
  return task;
}

function reviveTask(id) {
  const data = load();
  const original = data.tasks.find(t => t.id === id);
  if (!original) return null;

  const todayActive = data.tasks.filter(t => t.date === today() && !t.archived_at);
  const occupied = new Set(todayActive.filter(t => t.slot).map(t => t.slot));
  let slot = null;
  for (let i = 1; i <= 10; i++) { if (!occupied.has(i)) { slot = i; break; } }

  const revived = {
    id: uuidv4(),
    name: original.name,
    client: original.client || '',
    slot,
    date: today(),
    status: 'paused',
    segments: [],
    notes: original.notes || '',
    link: original.link || '',
    images: original.images ? [...original.images] : [],
    archived_at: null,
    created_at: new Date().toISOString()
  };
  data.tasks.push(revived);
  save(data);
  return revived;
}

function updateTaskName(id, name) {
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;
  task.name = name;
  save(data);
  return task;
}

function archiveAllTasks() {
  const data = load();
  const now = new Date().toISOString();
  const t = today();
  for (const task of data.tasks) {
    if (task.date === t && !task.archived_at) {
      if (task.status === 'active') {
        const lastSeg = task.segments[task.segments.length - 1];
        if (lastSeg && !lastSeg.stopped_at) lastSeg.stopped_at = now;
      }
      task.status = 'done';
      task.archived_at = now;
    }
  }
  save(data);
}

function updateTaskClient(id, client) {
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;
  task.client = client;
  save(data);
  return task;
}

function updateTaskLink(id, link) {
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;
  task.link = link;
  save(data);
  return task;
}

function getSlots() {
  const data = load();
  const t = today();
  const todayActive = data.tasks.filter(task => task.date === t && !task.archived_at && task.name && task.name.trim());

  // Auto-migrate tasks without slots
  const occ = new Set(todayActive.filter(task => task.slot).map(task => task.slot));
  let changed = false;
  for (const task of todayActive) {
    if (!task.slot) {
      for (let i = 1; i <= 10; i++) {
        if (!occ.has(i)) { task.slot = i; occ.add(i); changed = true; break; }
      }
    }
  }
  if (changed) save(data);

  const result = new Array(10).fill(null);
  for (const task of todayActive) {
    if (task.slot >= 1 && task.slot <= 10) result[task.slot - 1] = task;
  }
  return result;
}

function startTask(id) {
  const data = load();
  const now = new Date().toISOString();

  // pause any currently active task first
  for (const t of data.tasks) {
    if (t.status === 'active' && t.id !== id) {
      const lastSeg = t.segments[t.segments.length - 1];
      if (lastSeg && !lastSeg.stopped_at) {
        lastSeg.stopped_at = now;
      }
      t.status = 'paused';
    }
  }

  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;

  // guard: already active, don't add another segment
  if (task.status === 'active') return task;

  task.status = 'active';
  task.segments.push({ started_at: now, stopped_at: null });
  save(data);
  return task;
}

function pauseTask(id) {
  const data = load();
  const now = new Date().toISOString();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;

  const lastSeg = task.segments[task.segments.length - 1];
  if (lastSeg && !lastSeg.stopped_at) {
    lastSeg.stopped_at = now;
  }
  task.status = 'paused';
  save(data);
  return task;
}

function getActiveTask() {
  const data = load();
  return data.tasks.find(t => t.status === 'active') || null;
}

function archiveTask(id) {
  const data = load();
  const now = new Date().toISOString();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;

  if (task.status === 'active') {
    const lastSeg = task.segments[task.segments.length - 1];
    if (lastSeg && !lastSeg.stopped_at) {
      lastSeg.stopped_at = now;
    }
  }
  task.status = 'done';
  task.archived_at = now;
  save(data);
  return task;
}

function updateTaskNotes(id, notes) {
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;
  task.notes = notes;
  save(data);
  return task;
}

function addImageToTask(id, imagePath) {
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;
  task.images.push(imagePath);
  save(data);
  return task;
}

function saveImage(buffer) {
  ensureDirs();
  const filename = uuidv4() + '.png';
  const fullPath = path.join(getImagesDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

function getTask(id) {
  const data = load();
  return data.tasks.find(t => t.id === id) || null;
}

function deleteTask(id) {
  const data = load();
  data.tasks = data.tasks.filter(t => t.id !== id);
  save(data);
}

function sortTasksByClient() {
  const data = load();
  const t = today();
  // Free slots held by unnamed tasks so they disappear from the grid
  for (const task of data.tasks) {
    if (task.date === t && !task.archived_at && (!task.name || !task.name.trim())) {
      task.slot = null;
    }
  }
  const named = data.tasks.filter(task =>
    task.date === t && !task.archived_at && task.name && task.name.trim()
  );
  named.sort((a, b) => {
    const ca = a.client || '';
    const cb = b.client || '';
    if (!ca && cb) return 1;
    if (ca && !cb) return -1;
    if (ca !== cb) return ca.localeCompare(cb);
    return (a.slot || 0) - (b.slot || 0);
  });
  named.forEach((task, i) => { task.slot = i + 1; });
  save(data);
  return getSlots();
}

function swapTaskSlots(id1, id2) {
  const data = load();
  const t1 = data.tasks.find(t => t.id === id1);
  const t2 = data.tasks.find(t => t.id === id2);
  if (!t1 || !t2) return false;
  const tmp = t1.slot;
  t1.slot = t2.slot;
  t2.slot = tmp;
  save(data);
  return true;
}

module.exports = {
  getTodayTasks,
  getAllTasks,
  createTask,
  createTaskInSlot,
  getSlots,
  startTask,
  pauseTask,
  getActiveTask,
  archiveTask,
  updateTaskNotes,
  updateTaskClient,
  updateTaskLink,
  addImageToTask,
  saveImage,
  getTask,
  deleteTask,
  reviveTask,
  swapTaskSlots,
  sortTasksByClient,
  updateTaskName,
  archiveAllTasks,
  getElapsed,
  get IMAGES_DIR() { return getImagesDir(); },
};
