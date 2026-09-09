// Web build of Bear in Mind, served at eeriegoesd.com/bear-in-mind/. Same window
// as the desktop app and the extension; the list is kept in this browser's own
// local storage for this site, so it never leaves the machine and no server ever
// sees it.

// Bumped by hand when this page changes. There is no manifest to read it from.
const APP_VERSION = "1.0.1";

// One key per thing, all under the same prefix.
const NOTES_KEY = "bim.notes";
const SETTINGS_KEY = "bim.settings";

const $ = (id) => document.getElementById(id);

// Every stored thing is { id, text, details, done, at, doneAt }. Newest first.
let items = [];
let settings = { metricsOn: true, progressOn: true };

// Which rows are showing their whole description rather than nothing. Kept out
// of storage: it is how you are looking at the list right now, not part of it.
const opened = new Set();

let appVersionStr = "";
let storageStr = "";
let metricsOn = true;
let progressOn = true;

// ---------------------------------------------------------------------------
// How much of the list is ticked off
// ---------------------------------------------------------------------------
// 0% is red, 50% is amber, 100% is green: a straight hue ramp.
function progressHue(pct) {
  return Math.round(pct * 1.2);
}

function updateProgress() {
  const bar = $("brandProgress");
  if (!bar) return;
  bar.classList.toggle("hidden", !progressOn);
  if (!progressOn) return;

  const pct = items.length
    ? Math.round((items.filter((i) => i.done).length / items.length) * 100)
    : 0;
  const h = progressHue(pct);

  const fill = $("brandBarFill");
  fill.style.width = pct + "%";
  fill.style.background = `linear-gradient(90deg, hsl(${h} 72% 42%), hsl(${h} 80% 52%))`;

  const label = $("brandPct");
  label.textContent = pct + "%";
  label.style.color = `hsl(${h} 75% 55%)`;

  bar.title = items.length
    ? pct + "% of everything on your list is done"
    : "Nothing on your list yet";
}

// ---------------------------------------------------------------------------
// Theme. Applied before first paint so there is no flash of the wrong one.
// ---------------------------------------------------------------------------
let theme = localStorage.getItem("bim.theme") === "light" ? "light" : "dark";

// SVG shapes, not text glyphs. A sun or moon CHARACTER sits on the font
// baseline and looks off-centre in a round button whatever you do to the box.
const SUN_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="4.5" fill="currentColor"/>' +
  '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.22 5.22l1.84 1.84M16.94 16.94l1.84 1.84M18.78 5.22l-1.84 1.84M7.06 16.94l-1.84 1.84"/>' +
  "</g></svg>";
const MOON_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z" fill="currentColor"/>' +
  "</svg>";

function applyTheme() {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("bim.theme", theme);
  } catch {}
  const btn = $("themeToggle");
  if (btn) {
    btn.innerHTML = theme === "dark" ? SUN_ICON : MOON_ICON;
    btn.title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  }
}
applyTheme();

// ---------------------------------------------------------------------------
// The line under the title: version and how much room the list takes up
// ---------------------------------------------------------------------------
// There is no processor or memory figure here: a browser gives the page no way
// to measure what one extension costs, and a made-up number is worse than none.
function updateBrandSub() {
  const el = $("brandSub");
  if (!el) return;
  const parts = [];
  if (appVersionStr) parts.push("v" + appVersionStr);
  if (metricsOn && storageStr) parts.push("Storage: " + storageStr);
  el.textContent = parts.join(" | ");
}

function formatBytes(n) {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function refreshStorageSize() {
  try {
    const notes = localStorage.getItem(NOTES_KEY) || "";
    const settings = localStorage.getItem(SETTINGS_KEY) || "";
    storageStr = formatBytes(notes.length + settings.length);
    updateBrandSub();
  } catch {}
}

// Measuring is not free, so a burst of saves becomes one reading.
let sizeTimer = null;
function scheduleStorageSize() {
  clearTimeout(sizeTimer);
  sizeTimer = setTimeout(refreshStorageSize, 50);
}

// ---------------------------------------------------------------------------
// Saying so when something goes wrong, rather than showing an empty list
// ---------------------------------------------------------------------------
function showProblem(message) {
  const el = $("problem");
  el.classList.remove("ok");
  el.textContent = message;
  el.hidden = false;
}

// The same strip, for something that worked. A silent success looks the same as
// nothing happening.
function showNote(message) {
  const el = $("problem");
  el.classList.add("ok");
  el.textContent = message;
  el.hidden = false;
}

function clearProblem() {
  const el = $("problem");
  el.classList.remove("ok");
  el.textContent = "";
  el.hidden = true;
}

// ---------------------------------------------------------------------------
// Loading and saving
// ---------------------------------------------------------------------------
// A browser with storage switched off, or a private window that blocks it,
// throws on the first read. That is reported rather than swallowed, because a
// list that silently forgets everything is worse than one that says it cannot
// save.
function storageRead(key) {
  const raw = localStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

function storageWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function loadAll() {
  try {
    const notes = storageRead(NOTES_KEY);
    items = Array.isArray(notes) ? notes : [];
    const saved = storageRead(SETTINGS_KEY);
    if (saved && typeof saved === "object") {
      settings = { ...settings, ...saved };
    }
    clearProblem();
  } catch (e) {
    items = [];
    showProblem(
      "Your list could not be opened, so nothing is shown. Adding something now would write over it. " +
        String(e)
    );
  }

  // An unset value means a first run, and a first run comes out on.
  applyMetrics(settings.metricsOn !== false);
  applyProgress(settings.progressOn !== false);
  render();
  refreshStorageSize();
}

async function save() {
  try {
    storageWrite(NOTES_KEY, items);
    clearProblem();
  } catch (e) {
    showProblem(
      "That could not be saved, so it will be gone when you close this tab. Your browser may be blocking storage for this site. " +
        String(e)
    );
  }
  scheduleStorageSize();
}

async function saveSettings() {
  try {
    storageWrite(SETTINGS_KEY, settings);
  } catch (e) {
    showProblem("Your settings could not be saved. " + String(e));
  }
  scheduleStorageSize();
}

// ---------------------------------------------------------------------------
// Saving a copy out, and bringing one back in
// ---------------------------------------------------------------------------
// The same caps the boxes in the window enforce, applied again here.
const TEXT_CAP = 500;
const DETAILS_CAP = 2000;
// A list nobody would ever keep by hand, and a file no list would ever fill.
// Both are there so a wrong or hostile file cannot lock the window up.
const MAX_ITEMS = 5000;
const MAX_FILE_CHARS = 5000000;

function newId() {
  return String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
}

// Counts THAT something happened, never what it says. No entry text, no
// description, no counts of what is on the list: only the name of the action.
// Nothing is sent at all unless the visitor accepted the cookie banner, since
// without that the analytics library is never loaded and this goes nowhere.
function track(action) {
  try {
    if (typeof gtag === "function") gtag("event", action);
  } catch {}
}

function cleanDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// A file the app did not write is a stranger. Nothing in it is trusted:
// every row has to be a plain object, every field has to be the right type, the
// text is cut to the same length the boxes allow, the id is thrown away and made
// fresh, and anything that does not fit is dropped rather than patched up.
// Returns null when the file is not a list at all.
function cleanImported(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const entry of raw) {
    if (out.length >= MAX_ITEMS) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (typeof entry.text !== "string") continue;

    const text = entry.text.trim().slice(0, TEXT_CAP);
    if (!text) continue;

    const details =
      typeof entry.details === "string" ? entry.details.trim().slice(0, DETAILS_CAP) : "";
    const done = entry.done === true;
    const now = new Date().toISOString();

    out.push({
      id: newId(),
      text,
      details,
      done,
      at: cleanDate(entry.at) || now,
      doneAt: done ? cleanDate(entry.doneAt) || now : null,
    });
  }
  return out;
}

function exportList() {
  toggleMenu(false);
  try {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bear-in-mind.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    track("list_exported");
    showNote("Saved a copy of your list to your downloads.");
  } catch (e) {
    showProblem("That could not be saved. " + String(e));
  }
}

// The file box is a hidden input, since an extension popup cannot open one of
// its own.
function importList() {
  toggleMenu(false);
  const picker = $("importFile");
  picker.value = "";
  picker.click();
}

async function handleImportFile(file) {
  if (!file) return;

  let content;
  try {
    content = await file.text();
  } catch (e) {
    showProblem("That file could not be opened. " + String(e));
    return;
  }

  if (content.length > MAX_FILE_CHARS) {
    showProblem("That file is far too big to be a saved list.");
    return;
  }

  let raw;
  try {
    raw = JSON.parse(content);
  } catch {
    showProblem("That file is not a saved list.");
    return;
  }

  const clean = cleanImported(raw);
  if (clean === null) {
    showProblem("That file is not a saved list.");
    return;
  }
  if (!clean.length) {
    showProblem("There was nothing in that file the app could use.");
    return;
  }

  // Added to what is already there, never over the top of it.
  items = clean.concat(items);
  track("list_imported");
  render();
  await save();
  showNote("Brought in " + clean.length + (clean.length === 1 ? " thing." : " things."));
}

// ---------------------------------------------------------------------------
// Drawing the list
// ---------------------------------------------------------------------------
const TRASH_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 13h10l1-13" ' +
  'stroke="currentColor" stroke-width="1.9" fill="none" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CHEVRON_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" fill="none" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

const PENCIL_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 6.5l3 3" ' +
  'stroke="currentColor" stroke-width="1.9" fill="none" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Plain words, no timestamps: when it was written matters, the exact minute
// does not.
function whenText(iso) {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return days + " days ago";
  return new Date(then).toLocaleDateString();
}

// The row being changed right now, rebuilt as a small form in place. Only one
// at a time, so opening a second closes the first.
let editingId = null;

function makeEditRow(item) {
  const row = document.createElement("div");
  row.className = "item editing";
  row.dataset.id = item.id;

  const form = document.createElement("div");
  form.className = "item-edit";

  const title = document.createElement("input");
  title.type = "text";
  title.className = "edit-input";
  title.maxLength = 500;
  title.spellcheck = false;
  title.value = item.text;

  const note = document.createElement("textarea");
  note.className = "edit-details";
  note.rows = 4;
  note.maxLength = 2000;
  note.spellcheck = false;
  note.placeholder = "Anything else worth remembering about it (optional)";
  note.value = item.details || "";

  const commit = () => {
    const text = title.value.trim();
    if (!text) {
      title.focus();
      return;
    }
    item.text = text;
    item.details = note.value.trim();
    editingId = null;
    render();
    save();
  };

  const cancel = () => {
    editingId = null;
    render();
  };

  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") cancel();
  });

  // Enter starts a new line in the description. Ctrl+Enter saves.
  note.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") cancel();
  });

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  // Both buttons are the same box whatever their wording.
  const saveBtn = document.createElement("button");
  saveBtn.className = "edit-btn primary";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", commit);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "edit-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", cancel);

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  form.appendChild(title);
  form.appendChild(note);
  form.appendChild(actions);
  row.appendChild(form);
  return row;
}

function makeRow(item) {
  if (editingId === item.id) return makeEditRow(item);

  const details = (item.details || "").trim();
  const isOpen = opened.has(item.id);

  const row = document.createElement("div");
  row.className = "item" + (item.done ? " done" : "") + (isOpen ? " open" : "");
  row.dataset.id = item.id;

  const tick = document.createElement("input");
  tick.type = "checkbox";
  tick.className = "tick";
  tick.checked = !!item.done;
  tick.title = item.done ? "Put it back on the list" : "Mark it as done";
  tick.addEventListener("change", () => toggleItem(item.id));

  const middle = document.createElement("div");
  middle.style.flex = "1";
  middle.style.minWidth = "0";

  const text = document.createElement("div");
  text.className = "item-text";
  text.textContent = item.text;

  const when = document.createElement("div");
  when.className = "item-when";
  when.textContent = whenText(item.done ? item.doneAt || item.at : item.at);
  if (item.done && when.textContent) when.textContent = "done " + when.textContent;

  const titleRow = document.createElement("div");
  titleRow.className = "item-title-row";
  titleRow.appendChild(text);

  // The arrow sits right after the words it belongs to.
  if (details) {
    const more = document.createElement("button");
    more.className = "more-btn chev-btn";
    more.title = isOpen ? "Hide the description" : "Show the description";
    more.setAttribute("aria-label", more.title);
    more.innerHTML = CHEVRON_ICON;
    more.addEventListener("click", () => {
      if (opened.has(item.id)) opened.delete(item.id);
      else opened.add(item.id);
      render();
    });
    titleRow.appendChild(more);
  }

  middle.appendChild(titleRow);

  if (details) {
    const note = document.createElement("div");
    note.className = "item-details";
    note.textContent = details;
    middle.appendChild(note);
  }

  middle.appendChild(when);

  const buttons = document.createElement("div");
  buttons.className = "item-buttons";

  const edit = document.createElement("button");
  edit.className = "more-btn";
  edit.title = details ? "Change this" : "Change this, or add a description";
  edit.setAttribute("aria-label", edit.title);
  edit.innerHTML = PENCIL_ICON;
  edit.addEventListener("click", () => {
    editingId = item.id;
    render();
    const box = $("list").querySelector(".item.editing .edit-input");
    if (box) {
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    }
  });
  buttons.appendChild(edit);

  const del = document.createElement("button");
  del.className = "del-btn";
  del.title = "Delete";
  del.setAttribute("aria-label", "Delete");
  del.innerHTML = TRASH_ICON;
  del.addEventListener("click", () => deleteItem(item.id));
  buttons.appendChild(del);

  row.appendChild(tick);
  row.appendChild(middle);
  row.appendChild(buttons);
  return row;
}

function render() {
  updateProgress();

  const list = $("list");
  list.innerHTML = "";

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  if (!open.length && !done.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML =
      "<strong>Nothing on your mind yet</strong>" +
      "Type it in the box above and press Enter.<br>It stays here until you tick it off.";
    list.appendChild(empty);
    return;
  }

  open.forEach((i) => list.appendChild(makeRow(i)));

  if (done.length) {
    const divider = document.createElement("div");
    divider.className = "divider";
    divider.textContent = "Done (" + done.length + ")";
    list.appendChild(divider);
    done.forEach((i) => list.appendChild(makeRow(i)));
  }
}

// ---------------------------------------------------------------------------
// Adding, ticking, deleting
// ---------------------------------------------------------------------------
function addItem() {
  const input = $("captureInput");
  const notes = $("captureDetails");
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  items.unshift({
    id: newId(),
    text,
    details: notes.value.trim(),
    done: false,
    at: new Date().toISOString(),
    doneAt: null,
  });
  input.value = "";
  notes.value = "";
  input.focus();
  syncCaptureOpen();
  track("entry_added");
  render();
  save();
}

// The description box is only there while the top box is being used, so a
// one-line jot never has to look at it.
function syncCaptureOpen() {
  const open =
    document.activeElement === $("captureDetails") ||
    $("captureInput").value.trim().length > 0 ||
    $("captureDetails").value.trim().length > 0;
  $("capture").classList.toggle("open", open);
}

function toggleItem(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.done = !item.done;
  item.doneAt = item.done ? new Date().toISOString() : null;
  track(item.done ? "entry_done" : "entry_reopened");
  render();
  save();
}

function deleteItem(id) {
  items = items.filter((i) => i.id !== id);
  opened.delete(id);
  render();
  save();
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------
function applyMetrics(on) {
  metricsOn = on;
  settings.metricsOn = on;
  $("chkMetrics").checked = on;
  updateBrandSub();
  if (on) refreshStorageSize();
}

function applyProgress(on) {
  progressOn = on;
  settings.progressOn = on;
  $("chkProgress").checked = on;
  updateProgress();
}

function toggleMenu(show) {
  const panel = $("menuPanel");
  panel.hidden = show === undefined ? !panel.hidden : !show;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
$("themeToggle").onclick = () => {
  theme = theme === "dark" ? "light" : "dark";
  applyTheme();
};

$("addButton").onclick = addItem;

$("captureInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addItem();
  }
});

// Enter starts a new line in the description, since a description is usually
// more than one. Ctrl+Enter puts the whole thing on the list.
$("captureDetails").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    addItem();
  }
});

["captureInput", "captureDetails"].forEach((id) => {
  $(id).addEventListener("focus", syncCaptureOpen);
  $(id).addEventListener("blur", () => setTimeout(syncCaptureOpen, 0));
  $(id).addEventListener("input", syncCaptureOpen);
});

$("menuButton").onclick = (e) => {
  e.stopPropagation();
  toggleMenu();
};

$("chkMetrics").addEventListener("change", () => {
  applyMetrics($("chkMetrics").checked);
  saveSettings();
});

$("chkProgress").addEventListener("change", () => {
  applyProgress($("chkProgress").checked);
  saveSettings();
});

$("btnExport").onclick = exportList;
$("btnImport").onclick = importList;

$("importFile").addEventListener("change", (e) => {
  handleImportFile(e.target.files && e.target.files[0]);
});

$("btnClearDone").onclick = () => {
  items = items.filter((i) => !i.done);
  toggleMenu(false);
  render();
  save();
};

$("btnClearAll").onclick = () => {
  items = [];
  toggleMenu(false);
  render();
  save();
};

// Clicking anywhere else puts the panel away.
document.addEventListener("click", (e) => {
  if (!$("menuPanel").hidden && !e.target.closest("#menuPanel")) toggleMenu(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("menuPanel").hidden) toggleMenu(false);
});

const FOOTER_URLS = {
  linkCoffee: "https://buymeacoffee.com/eeriegoesd",
  linkEerie: "https://eeriegoesd.com",
  linkReport: "https://support.eeriegoesd.com/report-issue/bear-in-mind",
  linkFeedback: "https://support.eeriegoesd.com/community/bear-in-mind",
  linkFeature: "https://support.eeriegoesd.com/suggest-feature/bear-in-mind",
};

// Ordinary links on an ordinary page, opened in a new tab so a half-written
// entry is not lost by navigating away.
Object.entries(FOOTER_URLS).forEach(([id, url]) => {
  const a = $(id);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
});

appVersionStr = APP_VERSION;
updateBrandSub();

loadAll();
$("captureInput").focus();
