/* Clock Yard: the page. Engine (engine.js) decides what a timer does; this
   file draws the deck, the sheets and the purchase screens, rings alarms and
   hands upcoming alerts to the system. */
(function () {
  "use strict";
  const E = window.Engine;

  // ---------------------------------------------------------------- platform
  const TAURI = window.__TAURI__ || null;
  const invoke = TAURI ? TAURI.core.invoke : () => Promise.reject(new Error("Not running inside the app."));
  const root = document.documentElement;
  const isIOS = root.classList.contains("ios");
  const isMac = root.classList.contains("mac");
  const isApple = isIOS || isMac;
  // The website (eeriegoesd.com/clock-yard) opens only with a sync code from
  // the app, and works on the timers saved under it. "?web" tries it locally.
  const WEB = !TAURI && (/(^|\.)eeriegoesd\.com$/i.test(location.hostname) || /[?&]web\b/.test(location.search));
  const KEY = "clockyard.";
  const store = {
    get(k) { try { return localStorage.getItem(KEY + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(KEY + k, v); } catch {} },
  };
  const errText = (e) => String((e && e.message) || e || "").replace(/^Error:\s*/, "");
  let devBuild = false;

  // ----------------------------------------------------------------- helpers
  const $ = (s, r) => (r || document).querySelector(s);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v; // static icon markup only
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "value") el.value = v;
        else if (k === "checked") el.checked = !!v;
        else if (k === "disabled") el.disabled = !!v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const svg = (body, size, extra) =>
    `<svg width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra || ""}>${body}</svg>`;
  const I = {
    play: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z" fill="currentColor"/></svg>',
    pause: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/></svg>',
    reset: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/>', 20, ' stroke-width="2.2"'),
    lap: svg('<path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/>', 19),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 19, ' stroke-width="2.4"'),
    minus: svg('<path d="M5 12h14"/>', 19, ' stroke-width="2.4"'),
    edit: svg('<path d="M16.2 4.3a2.1 2.1 0 0 1 3 3L8.4 18.1 4 19.5l1.4-4.4z"/><path d="M14.3 6.2l3 3"/>', 20, ' stroke-width="1.9"'),
    trash: svg('<path d="M4.5 6.5h15"/><path d="M9.2 6.5V4.9c0-.8.6-1.4 1.4-1.4h2.8c.8 0 1.4.6 1.4 1.4v1.6"/><path d="M6.4 6.5l.9 12.2a1.9 1.9 0 0 0 1.9 1.8h5.6a1.9 1.9 0 0 0 1.9-1.8l.9-12.2"/><path d="M10.1 10.5v6M13.9 10.5v6"/>', 20, ' stroke-width="1.9"'),
    trashBig: svg('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>', 24),
    close: svg('<path d="M7 7l10 10M17 7L7 17"/>', 18, ' stroke-width="2.5"'),
    up: svg('<path d="M6 15l6-6 6 6"/>', 14),
    back: svg('<path d="M15 5l-7 7 7 7"/>', 20, ' stroke-width="2.4"'),
    chev: svg('<path d="M9 5l7 7-7 7"/>', 14, ' stroke-width="2.4"'),
    grip: svg('<path d="M5 8h14M5 12h14M5 16h14"/>', 18, ' stroke-width="2"'),
    repeat: svg('<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="M16 3l3 3-3 3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="M8 21l-3-3 3-3"/>', 16, ' stroke-width="2"'),
    down: svg('<path d="M6 9l6 6 6-6"/>', 14),
    tick: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 14, ' stroke-width="2.6"'),
    sound: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>', 15),
    sun: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.22 5.22l1.84 1.84M16.94 16.94l1.84 1.84M18.78 5.22l-1.84 1.84M7.06 16.94l-1.84 1.84"/></g></svg>',
    moon: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z" fill="currentColor"/></svg>',
    mark: svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5"/><path d="M10 2.5h4"/><path d="M12 2.5v3.5"/><path d="M18.5 6.5l1.5-1.5"/>', 46, ' stroke-width="1.8"'),
  };
  const TYPE_ICON = {
    countdown: svg('<path d="M7 3h10M7 21h10"/><path d="M8 3v3.2a4 4 0 0 0 1.6 3.2L12 11.2l2.4-1.8A4 4 0 0 0 16 6.2V3"/><path d="M8 21v-3.2a4 4 0 0 1 1.6-3.2l2.4-1.8 2.4 1.8a4 4 0 0 1 1.6 3.2V21"/>', 18),
    quick: svg('<path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12l1-8z"/>', 18),
    countup: svg('<path d="M4 18l5.5-5.5 4 4L20 10"/><path d="M14.5 10H20v5.5"/>', 18),
    pomodoro: svg('<circle cx="12" cy="14" r="7"/><path d="M12 7V4"/><path d="M8.5 5.5c2 1.2 5 1.2 7 0"/>', 18),
    interval: svg('<path d="M5 20v-8M10 20V5M15 20v-11M20 20v-5"/>', 18),
    stopwatch: svg('<circle cx="12" cy="14" r="7"/><path d="M12 14v-3.5"/><path d="M10 3h4M12 3v4"/>', 18),
    counter: svg('<path d="M4 12h6M7 9v6M14 12h6"/>', 18),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 18),
    container: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/>', 18),
    buttons: svg('<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>', 18),
  };

  const nameOf = (el) => (el && el.name.trim()) || (el ? E.TYPES[el.type].label : "");
  const TRIAL_DAYS = 7;

  // ------------------------------------------------------------------- theme
  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    store.set("theme", t);
    const b = document.getElementById("themeToggle");
    b.innerHTML = t === "dark" ? I.sun : I.moon;
    b.title = t === "dark" ? "Switch to light theme" : "Switch to dark theme";
    invoke("set_window_theme", { theme: t }).catch(() => {});
  }
  applyTheme(currentTheme());
  document.getElementById("themeToggle").addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));

  // ----------------------------------------- version | CPU | RAM | cache line
  let appVersionStr = "";
  let cpuStr = "";
  let ramStr = "";
  let cacheSizeStr = "";
  let metricsOn = store.get("metricsOn") !== "0";
  let usageTimer = null;

  function updateBrandSub() {
    const parts = [];
    if (appVersionStr) parts.push("v" + appVersionStr);
    if (metricsOn) {
      if (cpuStr && cpuStr !== "n/a") parts.push("CPU: " + cpuStr);
      if (ramStr && ramStr !== "n/a") parts.push("RAM: " + ramStr);
      if (cacheSizeStr) parts.push("Cache: " + cacheSizeStr);
    }
    $("#brandSub").textContent = parts.join(" | ");
  }
  function formatBytes(n) {
    if (!n) return "0 KB";
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }
  function refreshUsage() {
    invoke("usage").then(([cpu, ram]) => { cpuStr = cpu; ramStr = ram; updateBrandSub(); }).catch(() => {});
  }
  function refreshCacheSize() {
    invoke("cache_size").then((n) => { cacheSizeStr = formatBytes(n); updateBrandSub(); }).catch(() => {});
  }
  let cacheTimer = null;
  function scheduleCacheSize() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => { if (metricsOn) refreshCacheSize(); }, 50);
  }
  function applyMetrics(on) {
    metricsOn = on;
    store.set("metricsOn", on ? "1" : "0");
    clearInterval(usageTimer);
    usageTimer = null;
    if (!on) { cpuStr = ""; ramStr = ""; cacheSizeStr = ""; }
    updateBrandSub();
    if (on) {
      refreshUsage();
      refreshCacheSize();
      usageTimer = setInterval(refreshUsage, 2000);
    }
  }

  // ------------------------------------------------------------------ footer
  // Guideline 3.1.1: no outside-payment link in an App Store build. Runs
  // before the click handlers, so the removed link never gets one.
  if (isApple) document.getElementById("coffeeLink")?.remove();
  const LINKS = {
    report: "https://support.eeriegoesd.com/report-issue/clock-yard",
    discussions: "https://support.eeriegoesd.com/community/clock-yard",
    feature: "https://support.eeriegoesd.com/suggest-feature/clock-yard",
  };
  function openUrl(url) {
    if (TAURI) invoke("open_url", { url }).catch((e) => showError("Couldn't open the link. " + errText(e)));
    else window.open(url, "_blank", "noopener");
  }
  document.querySelectorAll(".flink").forEach((a) => {
    a.addEventListener("click", (e) => { e.preventDefault(); openUrl(a.dataset.url); });
  });

  // ------------------------------------------------------------ error strip
  function showError(text) {
    $("#errorText").textContent = text;
    $("#errorStrip").hidden = false;
  }
  $("#errorClose").addEventListener("click", () => { $("#errorStrip").hidden = true; });

  // ------------------------------------------------------------------ state
  let state = { boards: [], els: {}, active: "" };
  const board = () => state.boards.find((b) => b.id === state.active) || state.boards[0];
  const boardOf = (elId) => state.boards.find((b) => b.items.includes(elId));

  function newBoard(name) {
    return { id: E.uid(), name, view: "list", sort: "name", items: [] };
  }

  function sanitize(raw) {
    const out = { boards: [], els: {}, active: "" };
    if (raw && typeof raw === "object") {
      for (const [id, el] of Object.entries(raw.els || {})) {
        const n = E.normalize(el);
        if (n) { n.id = id; out.els[id] = n; }
      }
      for (const b of Array.isArray(raw.boards) ? raw.boards : []) {
        if (!b || !b.id) continue;
        out.boards.push({
          id: String(b.id),
          name: String(b.name || "Board"),
          view: b.view === "grid" ? "grid" : "list",
          sort: b.sort === "remaining" ? "remaining" : "name",
          items: (Array.isArray(b.items) ? b.items : []).filter((id) => out.els[id]),
        });
      }
      out.active = String(raw.active || "");
    }
    if (!out.boards.length) out.boards.push(newBoard("Main"));
    // An element that lost its board goes on the first one.
    const placed = new Set(out.boards.flatMap((b) => b.items));
    for (const id of Object.keys(out.els)) if (!placed.has(id)) out.boards[0].items.push(id);
    if (!out.boards.some((b) => b.id === out.active)) out.active = out.boards[0].id;
    return out;
  }

  async function loadState() {
    let text = "";
    if (TAURI) {
      try {
        text = await invoke("load_state");
      } catch (e) {
        showError("Couldn't read your saved timers. " + errText(e));
      }
    } else {
      text = store.get("state") || "";
    }
    let raw = null;
    if (text) {
      try {
        raw = JSON.parse(text);
      } catch {
        showError("Your saved timers could not be read, so Clock Yard started with an empty board.");
      }
    }
    savedSync = raw && raw.sync && typeof raw.sync === "object" ? raw.sync : null;
    state = sanitize(raw);
    return !text;
  }

  let saveTimer = null;
  // Which server copy this device's file was last in step with, and whether it
  // has changes not sent yet, read back at start so nothing is lost or
  // overwritten across a restart.
  let savedSync = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  // Saves on this device and resets the alerts. A change the user made here
  // also goes up to their other devices; what the timers do by themselves
  // (finishing, moving to the next interval) is worked out the same on every
  // device, so that stays local.
  function persist(localOnly) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
    syncAlerts();
    if (!localOnly) markDirty();
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const data = JSON.stringify({
      v: 1, boards: state.boards, els: state.els, active: state.active,
      sync: { code: cloud.code, stamp: cloud.stamp, dirty: cloud.dirty },
    });
    if (!TAURI) { store.set("state", data); return Promise.resolve(); }
    return invoke("save_state", { data })
      .then(scheduleCacheSize)
      .catch((e) => {
        const t = errText(e);
        if (/free trial has ended/i.test(t)) initLicensing();
        else showError("Couldn't save your timers. " + t);
      });
  }

  // ---------------------------------------- alerts for when the app is closed
  let syncTimer = null;
  function syncAlerts() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(doSync, 400);
  }
  function doSync() {
    const now = Date.now();
    let list = [];
    for (const el of Object.values(state.els)) list.push(...E.upcoming(el, now));
    list = list.filter((a) => a.at > now + 1000).sort((a, b) => a.at - b.at).slice(0, 60);
    if (!TAURI) return;
    invoke("sync_alerts", { alerts: list }).catch((e) =>
      showError("Alerts for when the app is closed could not be set. " + errText(e)));
  }

  // ------------------------------------------- sync with your other devices
  // app-related/tauri2/code_sync.txt. The whole file goes up 4 seconds after a
  // change made here, and comes down on start, on focus and every 30 seconds
  // while the app is on screen. Every upload carries the server's write time
  // this device last saw, so a stale one is refused instead of flattening a
  // newer copy. Last writer wins; this device's copy is parked on disk first
  // whenever it had changes not sent yet.
  const SYNC_URL = "https://eerie-apps-sync.eeriegoesd.workers.dev/data/clock-yard";
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const SYNC_UNREACHABLE = "Can't reach the sync service. Check your internet connection and try again.";
  const cloud = { code: "", stamp: 0, dirty: false, state: "off", busy: false, pushTimer: null, pending: null, note: "", noteBad: false, joining: false };

  // No 0/O or 1/I, since people read these out and type them in.
  function newSyncCode() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  }
  const prettyCode = (code) => code.replace(/(.{4})(?=.)/g, "$1-");
  function cleanCode(raw) {
    const code = String(raw || "").replace(/[\s-]/g, "").toUpperCase();
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(code) ? code : "";
  }
  async function loadSyncCode() {
    if (!TAURI) return cleanCode(store.get("syncCode"));
    try { return cleanCode(await invoke("sync_code")); } catch { return ""; }
  }
  async function saveSyncCode(code) {
    if (TAURI) await invoke("set_sync_code", { code });
    else store.set("syncCode", code);
  }
  // Which board is open is this device's own choice, so it never travels.
  const syncPayload = () => JSON.stringify({ v: 1, boards: state.boards, els: state.els });
  // Nothing syncs behind the start screen or an ended trial.
  const syncAllowed = () => !LIC.screen || LIC.screen === "offer";

  function setCloudState(st) {
    cloud.state = st;
    paintSyncPanel();
  }
  function syncNote(text, bad) {
    cloud.note = text;
    cloud.noteBad = !!bad;
    paintSyncPanel();
  }

  function markDirty() {
    if (!cloud.code) return;
    cloud.dirty = true;
    clearTimeout(cloud.pushTimer);
    cloud.pushTimer = setTimeout(() => pushNow(false), 4000);
  }

  async function pushNow(keepalive) {
    clearTimeout(cloud.pushTimer);
    cloud.pushTimer = null;
    if (!cloud.code || !cloud.dirty || !syncAllowed()) return;
    if (cloud.busy) {
      cloud.pushTimer = setTimeout(() => pushNow(false), 1000);
      return;
    }
    cloud.busy = true;
    setCloudState("busy");
    const sent = syncPayload();
    try {
      const res = await fetch(SYNC_URL, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: cloud.code, data: sent, base: cloud.stamp }),
        keepalive: !!keepalive,
      });
      if (res.status === 409) {
        // Another device wrote first: take its copy, keeping this one on disk.
        const body = await res.json();
        cloud.busy = false;
        await takeServer(body.data, body.updatedAt, true);
        showSnack("Your other device had newer changes, so that version was loaded.");
        setCloudState("idle");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      cloud.stamp = body.updatedAt;
      // Changed again while this was on its way: that goes up next.
      if (syncPayload() === sent) cloud.dirty = false;
      scheduleSave();
      setCloudState("idle");
    } catch {
      // Offline or the service is down. Everything is safe on this device
      // and goes up on the next change or the next check.
      setCloudState("failed");
    } finally {
      cloud.busy = false;
    }
  }

  async function pullNow() {
    if (!cloud.code || !syncAllowed() || cloud.busy) return;
    // Changes not sent yet go first; a refusal brings the newer copy down.
    if (cloud.dirty) return pushNow(false);
    cloud.busy = true;
    setCloudState("busy");
    let empty = false;
    try {
      const res = await fetch(`${SYNC_URL}?code=${cloud.code}`, { cache: "no-store" });
      if (res.status === 404) {
        empty = true;
      } else {
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        cloud.busy = false;
        if (body.updatedAt !== cloud.stamp) await takeServer(body.data, body.updatedAt, false);
        setCloudState("idle");
      }
    } catch {
      setCloudState("failed");
    } finally {
      cloud.busy = false;
    }
    // Nothing up there yet: this device's timers go online.
    if (empty) {
      cloud.stamp = 0;
      cloud.dirty = true;
      pushNow(false);
    }
  }

  // The boards sheet holds the boards themselves, so a copy arriving while it
  // is open waits until it closes.
  const syncWaits = () => sheetCtx && sheetCtx.kind === "boards";

  async function takeServer(text, stamp, refused) {
    let raw = null;
    try { raw = JSON.parse(text); } catch { return; }
    if (syncWaits()) { cloud.pending = { text, stamp, refused }; return; }
    if ((cloud.dirty || refused) && TAURI) {
      await invoke("park_conflict", { data: syncPayload() }).catch(() => {});
    }
    const active = state.active;
    state = sanitize({ ...raw, active });
    cloud.stamp = stamp;
    cloud.dirty = false;
    // Whatever already happened in that copy is caught up on quietly.
    const now = Date.now();
    for (const el of Object.values(state.els)) E.tick(el, now, () => {});
    for (const id of [...ringing.keys()]) if (!state.els[id]) dismissRing(id);
    const openId = detail ? detail.el.id : null;
    renderDeck();
    if (openId) {
      if (state.els[openId]) openDetail(openId);
      else closeSheet();
    }
    persist(true);
  }
  function applyPendingSync() {
    const p = cloud.pending;
    cloud.pending = null;
    if (p) takeServer(p.text, p.stamp, p.refused);
  }

  async function turnSyncOn() {
    const code = newSyncCode();
    try {
      await saveSyncCode(code);
    } catch (e) {
      return syncNote("Couldn't save the sync code. " + errText(e), true);
    }
    cloud.code = code;
    cloud.stamp = 0;
    cloud.dirty = true;
    syncNote("");
    await pushNow(false);
  }

  async function joinSync(raw) {
    const code = cleanCode(raw);
    if (!code) return syncNote("A sync code is 16 letters and numbers. Check it and try again.", true);
    syncNote("Looking for that code...");
    let body = null;
    try {
      const res = await fetch(`${SYNC_URL}?code=${code}`, { cache: "no-store" });
      if (res.status === 404) return syncNote("No timers are saved under that code. Check it and try again.", true);
      if (!res.ok) throw new Error(String(res.status));
      body = await res.json();
    } catch {
      return syncNote(SYNC_UNREACHABLE, true);
    }
    try {
      await saveSyncCode(code);
    } catch (e) {
      return syncNote("Couldn't save the sync code. " + errText(e), true);
    }
    cloud.code = code;
    cloud.stamp = 0;
    cloud.joining = false;
    // This device's own timers are parked on disk before they are replaced.
    cloud.dirty = Object.keys(state.els).length > 0;
    cloud.note = "";
    await takeServer(body.data, body.updatedAt, false);
    setCloudState("idle");
    showSnack("Synced. These are the timers from your other device.");
  }

  async function turnSyncOff() {
    const yes = await dialog({
      title: "Turn sync off?",
      text: "The copy on the server is deleted. Your timers stay on this device. Another device that still has the code puts its copy back the next time it syncs.",
      ok: "Turn Sync Off",
      danger: true,
    });
    if (!yes) return;
    try {
      const res = await fetch(`${SYNC_URL}?code=${cloud.code}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      return syncNote("Can't reach the sync service, so sync is still on. Check your internet connection and try again.", true);
    }
    await saveSyncCode("").catch(() => {});
    clearTimeout(cloud.pushTimer);
    Object.assign(cloud, { code: "", stamp: 0, dirty: false, pending: null, note: "" });
    scheduleSave();
    setCloudState("off");
    showSnack("Sync is off. Your timers stay on this device.");
  }

  // The website's first screen: the sync code opens the timers saved under it.
  function webGate() {
    const input = h("input", { class: "text-in sync-input", type: "text", placeholder: "XXXX-XXXX-XXXX-XXXX", maxlength: "24",
      autocomplete: "off", autocapitalize: "characters", spellcheck: "false", "aria-label": "Sync code" });
    const note = h("div", { class: "sync-note", role: "status" });
    const open = h("button", { class: "btn btn-accent", type: "button", text: "Open Timers" });
    const go = async () => {
      open.disabled = true;
      note.classList.remove("bad");
      note.textContent = "Looking for that code...";
      await joinSync(input.value);
      open.disabled = false;
      if (!cloud.code) {
        note.textContent = cloud.note;
        note.classList.toggle("bad", cloud.noteBad);
      }
    };
    open.addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    setTimeout(() => { if (!isIOS) input.focus(); }, 30);
    return h("div", { class: "web-gate" },
      h("div", { class: "buy-page-icon", style: "width:64px;height:64px;border-radius:32px;margin:0 auto", html: I.mark.replace(/width="46" height="46"/, 'width="34" height="34"') }),
      h("h1", { class: "web-gate-title", text: "Clock Yard" }),
      h("p", { class: "web-gate-text", text: "Open your timers with the sync code from the Clock Yard app. You find it in the app's Settings, under Sync with your other devices." }),
      input, open, note);
  }

  // The website forgets the code and its copy; the timers stay on the service.
  async function webSignOut() {
    const yes = await dialog({
      title: "Sign out?",
      text: "This browser forgets the code and its copy of your timers. They stay on your other devices.",
      ok: "Sign Out",
      danger: true,
    });
    if (!yes) return;
    if (cloud.dirty) await pushNow(false);
    await saveSyncCode("").catch(() => {});
    clearTimeout(cloud.pushTimer);
    Object.assign(cloud, { code: "", stamp: 0, dirty: false, pending: null, note: "", state: "off" });
    for (const id of [...ringing.keys()]) dismissRing(id);
    state = sanitize(null);
    closeSheet();
    renderDeck();
    persist(true);
  }

  async function copySyncCode() {
    try {
      await navigator.clipboard.writeText(prettyCode(cloud.code));
      showSnack("Code copied.");
    } catch {
      syncNote("Couldn't copy the code. Select it and copy it by hand.", true);
    }
  }

  // The Settings block, redrawn in place whenever the sync state changes.
  let syncPanel = null;
  function syncBlock() {
    syncPanel = h("div", { class: "group" });
    paintSyncPanel(true);
    return [h("div", { class: "group-title", text: "Sync with your other devices" }), syncPanel];
  }
  function paintSyncPanel(building) {
    if (!syncPanel || (!building && !syncPanel.isConnected)) return;
    const note = cloud.note ? h("div", { class: "sync-note" + (cloud.noteBad ? " bad" : ""), role: cloud.noteBad ? "alert" : "status", text: cloud.note }) : null;
    const btn = (text, onClick, cls) => h("button", { class: "btn" + (cls ? " " + cls : ""), type: "button", text, onclick: onClick });
    let body;
    if (cloud.code) {
      const line = cloud.state === "busy" ? "Syncing..."
        : cloud.state === "failed" ? "Cannot reach the service. Your timers are safe here and go up when you are back online."
        : "Up to date.";
      body = [
        h("div", { class: "sync-code", text: prettyCode(cloud.code) }),
        h("div", { class: "row-desc", text: "Type this code into Clock Yard on your other devices. Anyone with the code can see your timers, so treat it like a password." }),
        h("div", { class: "sync-btns three" },
          btn("Copy the Code", copySyncCode),
          btn("Sync Now", () => { syncNote(""); if (cloud.dirty) pushNow(false); else pullNow(); }),
          WEB ? btn("Sign Out", webSignOut, "btn-danger") : btn("Turn Sync Off", turnSyncOff, "btn-danger")),
        h("div", { class: "sync-status" + (cloud.state === "failed" ? " bad" : ""), text: line }),
        note,
      ];
    } else if (cloud.joining) {
      const input = h("input", { class: "text-in sync-input", type: "text", placeholder: "XXXX-XXXX-XXXX-XXXX", maxlength: "24",
        value: cloud.joinText || "", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", "aria-label": "Sync code" });
      input.addEventListener("input", () => { cloud.joinText = input.value; });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") joinSync(input.value); });
      body = [
        h("div", { class: "row-desc", text: "Type the code shown in Clock Yard's Settings on your other device. The timers on this device are replaced by the ones saved under that code." }),
        input,
        h("div", { class: "sync-btns" },
          btn("Cancel", () => { cloud.joining = false; cloud.note = ""; paintSyncPanel(); }),
          btn("Join", () => joinSync(input.value), "btn-accent")),
        note,
      ];
      if (cloud.focusJoin && !isIOS) setTimeout(() => input.focus(), 30);
      cloud.focusJoin = false;
    } else {
      body = [
        h("div", { class: "row-desc", text: "Keep the same timers on your phone, tablet and computers. Turn it on here, then type the code into Clock Yard on your other device." }),
        h("div", { class: "sync-btns" },
          btn("Turn Sync On", turnSyncOn, "btn-accent"),
          btn("I Have a Code", () => { cloud.joining = true; cloud.focusJoin = true; cloud.joinText = ""; cloud.note = ""; paintSyncPanel(); })),
        note,
      ];
    }
    syncPanel.replaceChildren(h("div", { class: "stack" }, body));
  }

  // ------------------------------------------------------------------ sounds
  const SOUNDS = [["chime", "Chime"], ["bell", "Bell"], ["beep", "Beep"], ["digital", "Digital"], ["soft", "Soft"], ["none", "None"]];
  const VOLUMES = [["0.25", "Quiet"], ["0.55", "Medium"], ["0.9", "Loud"]];
  let volume = Number(store.get("volume")) || 0.55;
  let actx = null;
  let soundUntil = 0;
  function setSession(type) {
    try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch {}
  }
  function audio(forSound) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    // A tap only wakes the audio, mixed with other apps, so their music keeps
    // playing. A sound itself plays as playback, as an alarm's must, so the
    // silent switch does not mute it; then it goes back to mixing.
    if (forSound) {
      setSession("playback");
      soundUntil = Date.now() + 2600;
      setTimeout(() => { if (Date.now() >= soundUntil) setSession("ambient"); }, 2700);
    } else if (Date.now() >= soundUntil) setSession("ambient");
    if (!actx) actx = new C();
    if (actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  }
  // The audio has to be woken by a tap before it may play by itself.
  document.addEventListener("pointerdown", () => audio(), { capture: true, passive: true });
  function tone(c, out, freq, at, len, type, peak) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak || 0.5, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + len + 0.05);
  }
  function playSound(name) {
    if (!name || name === "none") return;
    const c = audio(true);
    if (!c) return;
    // Still asleep: wake it first, then play, so the first tap is heard.
    if (c.state !== "running") {
      c.resume().then(() => playNow(c, name)).catch(() => playNow(c, name));
      return;
    }
    playNow(c, name);
  }
  function playNow(c, name) {
    const out = c.createGain();
    out.gain.value = volume;
    out.connect(c.destination);
    const t = c.currentTime + 0.02;
    switch (name) {
      case "bell":
        tone(c, out, 660, t, 2.2, "sine", 0.55);
        tone(c, out, 1320, t, 1.4, "sine", 0.22);
        tone(c, out, 1985, t, 0.8, "sine", 0.1);
        break;
      case "beep":
        for (let k = 0; k < 3; k++) tone(c, out, 880, t + k * 0.24, 0.14, "square", 0.16);
        break;
      case "digital":
        for (let k = 0; k < 4; k++) tone(c, out, k % 2 ? 1046 : 1318, t + k * 0.13, 0.1, "square", 0.14);
        break;
      case "soft":
        tone(c, out, 440, t, 1.6, "sine", 0.45);
        tone(c, out, 554, t + 0.3, 1.5, "sine", 0.35);
        break;
      default:
        tone(c, out, 880, t, 1.3, "sine", 0.5);
        tone(c, out, 1320, t + 0.18, 1.3, "sine", 0.38);
    }
  }

  // -------------------------------------------------------------- the deck
  const deck = $("#deck");
  const faces = new Map();
  let lastOrder = "";

  // Done, or an interval stopped between intervals: it is at zero and only
  // goes on when the user starts it.
  const needsInput = (el) => { const st = E.status(el); return st === "done" || st === "waiting"; };

  function orderedIds(b) {
    const ids = b.items.filter((id) => state.els[id]);
    const byName = (a, z) => nameOf(state.els[a]).localeCompare(nameOf(state.els[z]), undefined, { numeric: true, sensitivity: "base" });
    if (b.sort === "name") return ids.sort(byName);
    const now = Date.now();
    // Anything waiting for the user counts as no time left, so it goes on top.
    const left = new Map(ids.map((id) => [id, needsInput(state.els[id]) ? 0 : E.view(state.els[id], now).remaining]));
    return ids.sort((a, z) => {
      const x = left.get(a) == null ? Infinity : left.get(a);
      const y = left.get(z) == null ? Infinity : left.get(z);
      return x !== y ? x - y : byName(a, z);
    });
  }

  function renderToolbar() {
    const b = board();
    $("#boardName").textContent = b.name;
    $("#sortSelect").value = b.sort;
    $("#viewSeg").dataset.view = b.view;
    for (const btn of $("#viewSeg").querySelectorAll("button")) btn.classList.toggle("on", btn.dataset.view === b.view);
    renderBoardNav();
    paintMeta();
  }

  // The board sidebar: picking a board switches to it; the open board's
  // pencil renames or deletes it.
  function renderBoardNav() {
    const cur = board();
    const count = (x) => x.items.filter((id) => state.els[id]).length;
    $("#boardList").replaceChildren(...state.boards.map((x) => {
      const on = x.id === cur.id;
      return h("div", { class: "board-item" + (on ? " on" : "") },
        h("button", { class: "board-go", type: "button", "aria-current": on ? "true" : null, onclick: () => switchBoard(x.id) },
          h("span", { class: "board-item-name", text: x.name }), h("span", { class: "board-item-count", text: String(count(x)) })),
        on ? h("button", { class: "board-edit", type: "button", title: "Rename or delete", "aria-label": "Rename or delete " + x.name, html: I.edit, onclick: () => openBoardSheet(x) }) : null);
    }));
  }

  function switchBoard(id) {
    closeDrawer();
    if (id === state.active) return;
    state.active = id;
    $("#content").scrollTop = 0;
    renderDeck();
    persist(true);
  }

  // ------------------------------------------------------------ the sidebar
  // Wide windows: it sits beside the deck, and the sidebar button folds it
  // away (remembered). Narrow windows and iPhone: it slides in over the deck
  // as a drawer, opened by the sidebar button or a swipe right anywhere,
  // closed by a swipe left, a tap outside, or picking a board.
  const narrowMq = window.matchMedia("(max-width: 899px)");
  const isNarrow = () => narrowMq.matches;
  const sidebarEl = $("#sidebar");
  const scrim = $("#drawerScrim");
  if (store.get("sideCollapsed") === "1") root.classList.add("side-collapsed");
  function drawerOpen() { return root.classList.contains("drawer-open"); }
  function openDrawer() {
    sidebarEl.style.transform = "";
    scrim.style.opacity = "";
    scrim.hidden = false;
    root.classList.add("drawer-open");
  }
  function closeDrawer() {
    if (!drawerOpen() && scrim.hidden) return;
    sidebarEl.style.transform = "";
    scrim.style.opacity = "";
    root.classList.remove("drawer-open");
    setTimeout(() => { if (!drawerOpen()) scrim.hidden = true; }, 300);
  }
  function setCollapsed(on) {
    root.classList.toggle("side-collapsed", on);
    store.set("sideCollapsed", on ? "1" : "0");
  }
  function toggleSidebar() {
    if (isNarrow()) return drawerOpen() ? closeDrawer() : openDrawer();
    setCollapsed(!root.classList.contains("side-collapsed"));
  }
  $("#sideToggle").addEventListener("click", toggleSidebar);
  scrim.addEventListener("click", closeDrawer);
  narrowMq.addEventListener("change", () => { closeDrawer(); });

  // Swipes. The drawer follows the finger and settles open or shut on release.
  const EDGE = 40;
  let swipe = null;
  const drawerWidth = () => sidebarEl.getBoundingClientRect().width || 300;
  document.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || LIC.screen || !overlay.hidden || !dialogOverlay.hidden) return;
    const open = isNarrow() ? drawerOpen() : !root.classList.contains("side-collapsed");
    // A finger can start the swipe anywhere; a mouse only at the left edge.
    const fromHere = e.pointerType === "touch" ? !swipeOpen : e.clientX <= EDGE;
    if (!open && fromHere) swipe = { open: false, x: e.clientX, y: e.clientY, id: e.pointerId, moving: false };
    else if (open && isNarrow() && (sidebarEl.contains(e.target) || e.target === scrim)) swipe = { open: true, x: e.clientX, y: e.clientY, id: e.pointerId, moving: false };
    else if (open && !isNarrow() && e.pointerType === "touch" && sidebarEl.contains(e.target)) swipe = { open: true, x: e.clientX, y: e.clientY, id: e.pointerId, moving: false };
  }, true);
  document.addEventListener("pointermove", (e) => {
    const s = swipe;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moving) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) {
        if (Math.abs(dy) > 10) swipe = null;
        return;
      }
      if (s.open ? dx > 0 : dx < 0) { swipe = null; return; }
      s.moving = true;
      if (isNarrow()) {
        root.classList.add("drawer-dragging");
        scrim.hidden = false;
      }
    }
    s.dx = dx;
    if (!isNarrow()) return;
    const w = drawerWidth();
    const shown = s.open ? Math.max(0, Math.min(w, w + dx)) : Math.max(0, Math.min(w, dx));
    sidebarEl.style.transform = `translateX(${shown - w}px)`;
    scrim.style.opacity = String(shown / w);
  }, true);
  const endSwipe = (e) => {
    const s = swipe;
    if (!s || e.pointerId !== s.id) return;
    swipe = null;
    if (!s.moving) return;
    root.classList.remove("drawer-dragging");
    const far = Math.abs(s.dx || 0) > (isNarrow() ? drawerWidth() * 0.3 : 60);
    if (isNarrow()) {
      const toOpen = s.open ? !far : far;
      if (toOpen) openDrawer();
      else { sidebarEl.style.transform = ""; scrim.style.opacity = ""; root.classList.add("drawer-open"); closeDrawer(); }
    } else if (far) {
      setCollapsed(s.open);
    }
  };
  document.addEventListener("pointerup", endSwipe, true);
  document.addEventListener("pointercancel", endSwipe, true);

  // "9 timers · 5 running" under the board's name.
  function paintMeta() {
    const ids = board().items.filter((id) => state.els[id] && state.els[id].type !== "container" && state.els[id].type !== "buttons");
    const running = ids.filter((id) => ["running", "delay"].includes(E.status(state.els[id]))).length;
    const text = !ids.length ? "No timers yet"
      : (ids.length === 1 ? "1 timer" : ids.length + " timers") + (running ? ` · ${running} running` : "");
    const m = $("#boardMeta");
    if (m.textContent !== text) m.textContent = text;
  }

  // Cards ease in one after another when a board (or its view) first shows,
  // and a timer just added eases in on its own. Redraws in between stay still.
  let deckShown = "";
  const enterIds = new Set();
  function easeIn(node, k) {
    node.style.setProperty("--i", String(Math.min(k, 12)));
    node.classList.add("card-in");
    node.addEventListener("animationend", () => node.classList.remove("card-in"), { once: true });
  }

  function renderDeck() {
    const locked = WEB && !cloud.code;
    document.body.classList.toggle("web-locked", locked);
    if (locked) {
      faces.clear();
      deck.className = "deck";
      deck.replaceChildren(webGate());
      return;
    }
    const b = board();
    renderToolbar();
    faces.clear();
    if (swipeOpen) {
      const r = swipeOpen.querySelector(".rc");
      if (r) r.style.transform = "";
      swipeOpen.classList.remove("showing");
    }
    swipeOpen = null;
    for (const id of cardCache.keys()) if (!state.els[id]) cardCache.delete(id);
    deck.className = "deck " + b.view;
    let ids = orderedIds(b);
    lastOrder = ids.join(",");
    // In the grid, containers and button sets take whole rows, so they go
    // after the circles instead of breaking a row of them.
    if (b.view === "grid") {
      const wide = (id) => state.els[id].type === "container" || state.els[id].type === "buttons";
      ids = [...ids.filter((id) => !wide(id)), ...ids.filter(wide)];
    }
    if (!ids.length) {
      deck.replaceChildren(
        h("div", { class: "empty" },
          h("div", { class: "empty-icon", html: I.mark.replace(/width="46" height="46"/, 'width="30" height="30"') }),
          h("strong", { text: "No timers on this board yet" }),
          h("span", { text: isIOS ? "Tap + to add one." : "Add one here, or press " + (isMac ? "Cmd" : "Ctrl") + "+N." }),
          isIOS ? null : h("button", { class: "btn btn-accent", type: "button", text: "New Timer", onclick: openNew })));
      return;
    }
    const key = b.id + ":" + b.view;
    const fresh = deckShown !== key;
    // Where each card was, so a card that moves slides to its new place.
    const before = new Map();
    if (!fresh) for (const c of deck.children) if (c.dataset && c.dataset.id) before.set(c.dataset.id, c.getBoundingClientRect());
    deck.replaceChildren(...ids.map((id) => keptCard(state.els[id], b.view)));
    deckShown = key;
    [...deck.children].forEach((c, k) => {
      if (fresh) easeIn(c, k);
      else if (enterIds.has(c.dataset.id)) easeIn(c, 0);
      else slideFrom(c, before.get(c.dataset.id));
    });
    enterIds.clear();
    updateFaces(Date.now());
  }

  // A card is kept between redraws while nothing about it changed, so
  // pausing fades and a new order slides instead of everything jumping.
  const cardCache = new Map();
  function keptCard(el, view) {
    const wide = el.type === "container" || el.type === "buttons";
    const sig = view + "|" + el.type + "|" + el.name + "|" + JSON.stringify(el.cfg);
    const c = cardCache.get(el.id);
    if (!wide && c && c.el === el && c.sig === sig) { faces.set(el.id, c.face); return c.node; }
    const node = card(el, view);
    if (wide) cardCache.delete(el.id);
    else cardCache.set(el.id, { el, sig, node, face: faces.get(el.id) });
    return node;
  }
  function slideFrom(node, was) {
    if (!was || !node.animate) return;
    const now = node.getBoundingClientRect();
    const dx = was.left - now.left, dy = was.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: 480, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
  }

  function card(el, view) {
    if (el.type === "container") return containerCard(el);
    if (el.type === "buttons") return buttonsCard(el);
    return view === "grid" ? circleCard(el) : rowCard(el);
  }

  function ctlBtn(icon, label, onClick, cls) {
    return h("button", {
      class: "ctl" + (cls ? " " + cls : ""), type: "button", title: label, "aria-label": label, html: icon,
      onclick: (e) => { e.stopPropagation(); onClick(e); },
    });
  }

  // The small buttons a row or circle carries for its element.
  function controls(el, where) {
    const st = E.status(el);
    const out = [];
    if (el.type === "counter") {
      if (el.cfg.mode !== "inc") out.push(ctlBtn(I.minus, "Count down", () => act(el, "dec")));
      if (el.cfg.mode !== "dec") out.push(ctlBtn(I.plus, "Count up", () => act(el, "inc"), "main"));
      return out;
    }
    if (!E.runnable(el)) return out;
    const prim = E.primary(el);
    const primBtn = prim === "pause"
      ? ctlBtn(I.pause, "Pause", () => act(el, "toggle"), "main")
      : ctlBtn(I.play, prim === "resume" ? "Resume" : prim === "restart" ? "Start again" : "Start", () => act(el, "toggle"), "main");
    if (el.type === "stopwatch") {
      if (st === "running") out.push(ctlBtn(I.lap, "Lap", () => act(el, "lap")));
      else if (st === "paused") out.push(ctlBtn(I.reset, "Reset", () => askReset(el)));
    } else if (st !== "idle" && (where === "row" || st === "paused" || st === "done" || st === "waiting")) {
      out.push(ctlBtn(I.reset, "Reset", () => askReset(el)));
    }
    out.push(primBtn);
    return out;
  }

  // The reset beside a timer sits next to its main button, so a stray click
  // would lose the run; it asks first.
  const RESET_TEXT = {
    stopwatch: "The time and laps so far are cleared.",
    countup: "It starts counting again from the beginning.",
    pomodoro: "It goes back to the first work session.",
    interval: "It goes back to the first interval.",
    counter: "The count goes back to where it started.",
  };
  async function askReset(el) {
    const yes = await dialog({
      title: `Reset ${nameOf(el)}?`,
      text: RESET_TEXT[el.type] || "It goes back to its full time.",
      ok: "Reset",
      danger: true,
    });
    const cur = state.els[el.id];
    if (yes && cur) act(cur, "reset");
  }

  // As in Apple's Clock: the time large on the left, the name under it, and
  // the main button on the right with the progress ring around it.
  function rowCard(el) {
    const time = h("div", { class: "rc-time" });
    const name = h("span", { class: "rc-name" });
    const sub = h("span", { class: "rc-sub" });
    const acts = h("div", { class: "rc-acts" });
    const ring = ringSvg();
    ring.classList.add("rc-ring");
    // The time left fills the row in the timer's colour; the time gone is faded.
    const fill = h("div", { class: "rc-fill" });
    const track = h("div", { class: "rc-track", "aria-hidden": "true" }, fill);
    const hover = [
      ctlBtn(I.edit, "Change", () => openEditor(el.type, el.id), "ghost hover-act"),
      ctlBtn(I.trash, "Delete", () => askDelete(el.id), "ghost danger hover-act"),
    ];
    const row = h("div", { class: "rc" + colorClass(el), tabindex: "0", role: "button", "data-id": el.id,
      onclick: () => { if (!swipeSwallow()) openDetail(el.id); },
      onkeydown: (e) => { if (e.key === "Enter" && e.target === row) openDetail(el.id); } },
    track,
    h("div", { class: "rc-main" }, time, h("div", { class: "rc-label" }, name, sub)),
    h("div", { class: "rc-acts-wrap" }, hover, h("div", { class: "rc-acts-box" }, acts, ring)));
    faces.set(el.id, { el, kind: "row", root: row, time, name, sub, acts, fill, track, ring: ring.querySelector(".bar"), ringSvg: ring, st: null });
    if (!isIOS) return row;
    const wrap = h("div", { class: "swipe", "data-id": el.id },
      h("button", { class: "swipe-del", type: "button", tabindex: "-1", "aria-label": "Delete " + nameOf(el), html: I.trashBig,
        onclick: (e) => { e.stopPropagation(); askDelete(el.id); } }),
      row);
    return wrap;
  }

  const RING_C = 2 * Math.PI * 46;
  function ringSvg() {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 100 100");
    s.setAttribute("class", "ring");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = `<circle class="track" cx="50" cy="50" r="46"/><circle class="bar" cx="50" cy="50" r="46" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0"/>`;
    return s;
  }
  function dialSvg() {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 100 100");
    s.setAttribute("class", "dial");
    s.setAttribute("aria-hidden", "true");
    let ticks = "";
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      const r1 = k % 3 === 0 ? 38 : 41;
      ticks += `<line class="tick" x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 45}" y2="${50 - Math.cos(a) * 45}"/>`;
    }
    s.innerHTML = `<circle class="face" cx="50" cy="50" r="48"/>${ticks}<line class="hand h" x1="50" y1="50" x2="50" y2="27" stroke-width="4.5"/><line class="hand m" x1="50" y1="50" x2="50" y2="15" stroke-width="3"/><line class="hand s" x1="50" y1="56" x2="50" y2="12" stroke-width="1.5"/><circle class="hub" cx="50" cy="50" r="3"/>`;
    return s;
  }

  function circleCard(el) {
    const name = h("div", { class: "cc-name" });
    const time = h("div", { class: "cc-time" });
    const sub = h("div", { class: "cc-sub" });
    const acts = h("div", { class: "cc-acts" });
    const ring = el.type === "clock" ? null : ringSvg();
    const dial = el.type === "clock" && el.cfg.mode === "analog" ? dialSvg() : null;
    const inner = h("div", { class: "cc-inner" }, name, dial || time, sub, acts);
    const node = h("div", { class: "cc" + colorClass(el), tabindex: "0", role: "button", "data-id": el.id,
      onclick: () => openDetail(el.id),
      onkeydown: (e) => { if (e.key === "Enter" && e.target === node) openDetail(el.id); } },
    h("div", { class: "cc-disc" }), ring, inner);
    faces.set(el.id, { el, kind: "circle", root: node, time, name, sub, acts, ring: ring && ring.querySelector(".bar"), dial, st: null });
    return node;
  }

  function miniRow(owner, el) {
    const time = h("div", { class: "mini-time" });
    const name = h("div", { class: "mini-name" });
    const acts = h("div", { class: "rc-acts" });
    const row = h("div", { class: "mini", onclick: (e) => { e.stopPropagation(); openDetail(el.id); } }, time, name, acts);
    faces.set(owner.id + ":" + el.id, { el, kind: "mini", root: row, time, name, acts, st: null });
    return row;
  }

  function containerCard(el) {
    const target = state.boards.find((b) => b.id === el.cfg.board);
    const list = h("div", { class: "mini-list" });
    const items = target ? orderedIds(target).map((id) => state.els[id]).filter((x) => x.type !== "container" && x.type !== "buttons") : [];
    if (!target) list.append(h("div", { class: "mini-empty", text: "Pick a board for this container." }));
    else if (!items.length) list.append(h("div", { class: "mini-empty", text: `Nothing on ${target.name} yet.` }));
    else for (const x of items) list.append(miniRow(el, x));
    const node = h("div", { class: "wide", "data-id": el.id },
      h("div", { class: "wide-head", onclick: () => openEditor(el.type, el.id) },
        h("div", { class: "wide-title", text: nameOf(el) }),
        h("div", { class: "wide-sub", text: target ? target.name : "No board" })),
      list);
    faces.set(el.id, { el, kind: "wide", root: node, st: "static" });
    return node;
  }

  function buttonsCard(el) {
    const set = h("div", { class: "btn-set" },
      (el.cfg.buttons || []).map((bt) => h("button", { class: "btn", type: "button", text: bt.label || "Button",
        onclick: (e) => { e.stopPropagation(); runButton(el, bt); } })));
    const node = h("div", { class: "wide", "data-id": el.id },
      h("div", { class: "wide-head", onclick: () => openEditor(el.type, el.id) },
        h("div", { class: "wide-title", text: nameOf(el) }),
        h("div", { class: "wide-sub", text: (el.cfg.buttons || []).length ? "" : "No buttons yet" })),
      set);
    faces.set(el.id, { el, kind: "wide", root: node, st: "static" });
    return node;
  }

  function lenClass(text) {
    const n = text.length;
    return n <= 5 ? "" : n <= 8 ? "len-m" : n <= 11 ? "len-l" : "len-xl";
  }

  // The short line under a circle: the finish time whenever there is one.
  function circleSub(el, v, now) {
    if (v.eta && (el.run.st === "running" || el.run.st === "delay")) {
      const at = E.fmtTime(v.eta, now);
      if (el.type === "countup") return "Next alert " + at;
      const tag = el.type === "pomodoro" ? v.sub.split(" · ")[0].replace(" of ", "/") : el.type === "interval" && v.step ? v.step.name : "";
      return (tag ? tag + " · " : "") + "Ends " + at;
    }
    return v.sub || "";
  }

  function paintFace(f, now) {
    const el = f.el;
    if (f.kind === "wide") return;
    const v = E.view(el, now);
    const name = nameOf(el);
    if (f.name && f.name.textContent !== name) f.name.textContent = name;
    if (f.dial && v.hands) {
      const { h: hh, m, s } = v.hands;
      f.dial.querySelector(".h").setAttribute("transform", `rotate(${(hh % 12) * 30 + m * 0.5} 50 50)`);
      f.dial.querySelector(".m").setAttribute("transform", `rotate(${m * 6 + s * 0.1} 50 50)`);
      f.dial.querySelector(".s").setAttribute("transform", `rotate(${s * 6} 50 50)`);
    } else if (f.time && f.time.textContent !== v.main) {
      f.time.textContent = v.main;
      if (f.kind === "circle" || f.kind === "detail") f.time.className = "cc-time " + lenClass(v.main) + (v.dim ? " dim" : "");
      else if (f.kind === "row") f.time.className = "rc-time " + lenClass(v.main) + (v.dim ? " dim" : "");
    }
    if (f.sub) {
      const s = f.kind === "circle" ? circleSub(el, v, now) : v.sub || "";
      if (f.sub.textContent !== s) f.sub.textContent = s;
    }
    let p = v.ring == null ? 0 : v.ring;
    if (f.kind === "row") {
      // A row's ring only shows while the timer is under way; a waiting row
      // stays plain. Stopwatches and plain count-ups have no end to fill to.
      const st0 = E.status(el);
      const noEnd = el.type === "stopwatch" || el.type === "clock" || (el.type === "countup" && !(el.cfg.alerts || []).length);
      if (st0 === "idle" || noEnd) p = 0;
      const on = p > 0.0005;
      if (f.ringOn !== on) { f.ringSvg.classList.toggle("on", on); f.fill.classList.toggle("on", on); f.track.classList.toggle("on", on); f.ringOn = on; }
      const w = (p * 100).toFixed(2) + "%";
      if (f.fillW !== w) { f.fill.style.width = w; f.fillW = w; }
    }
    if (f.ring) {
      const off = (RING_C * (1 - p)).toFixed(2);
      if (f.off !== off) { f.ring.setAttribute("stroke-dashoffset", off); f.ring.classList.toggle("zero", p <= 0.0005); f.off = off; }
    }
    const st = E.status(el) + "|" + el.cfg.mode;
    if (f.root && f.stKey !== st) {
      f.stKey = st;
      f.root.dataset.st = E.status(el);
      // At zero and waiting for the user: grey with a blinking red outline,
      // in place of the timer's own colour, until it is started again.
      // Paused: the timer fades to grey until it runs again.
      f.root.classList.toggle("is-paused", E.status(el) === "paused");
      if (f.kind === "row" || f.kind === "circle") {
        const need = needsInput(el);
        f.root.classList.toggle("needs-input", need);
        if (colorClass(el)) f.root.classList.toggle("colored", !need);
      }
    }
    if (f.acts && f.st !== st) {
      const first = f.st == null;
      f.st = st;
      const old = new Map([...f.acts.children].map((b) => [b.getAttribute("aria-label"), b.innerHTML]));
      const oldMain = f.acts.querySelector(".main");
      const kids = controls(el, f.kind === "row" || f.kind === "mini" ? "row" : "circle");
      // Play and pause swap with a quick pop; a button that was not there grows in.
      if (!first) {
        for (const k of kids) {
          if (k.classList.contains("main")) { if (oldMain && oldMain.innerHTML !== k.innerHTML) k.classList.add("swap"); }
          else if (!old.has(k.getAttribute("aria-label"))) k.classList.add("pop");
        }
      }
      f.acts.replaceChildren(...kids);
    }
    if (f.root) f.root.classList.toggle("is-ringing", ringing.has(el.id));
  }

  function updateFaces(now) {
    paintMeta();
    for (const f of faces.values()) paintFace(f, now);
    if (detail) paintDetail(now);
  }

  // ---------------------------------------------------------------- actions
  function act(el, what, arg) {
    const now = Date.now();
    switch (what) {
      case "toggle": {
        const r = E.toggle(el, now);
        if (r === "needs-time") return openQuickStart(el);
        if (r === "start" || r === "restart" || r === "resume") dismissRing(el.id);
        break;
      }
      case "start":
        if (el.type === "quick") return openQuickStart(el);
        E.start(el, now);
        dismissRing(el.id);
        break;
      case "reset":
        E.reset(el, now);
        dismissRing(el.id);
        break;
      case "lap":
        E.lap(el, now);
        break;
      case "add":
        E.addTime(el, arg, now);
        if (arg > 0) dismissRing(el.id);
        break;
      case "inc":
      case "dec":
        E.count(el, what === "inc" ? 1 : -1, now, (ev) => handleEvent(ev, now));
        break;
    }
    afterChange();
  }

  function afterChange() {
    persist();
    reorderOrPaint(Date.now());
  }

  // A new order is shown with the cards sliding into place. While a sheet
  // covers the deck it waits, so the slide plays once the sheet is gone.
  let orderPending = false;
  function reorderOrPaint(now) {
    const b = board();
    if (b && b.sort === "remaining" && orderedIds(b).join(",") !== lastOrder) {
      if ($("#overlay").hidden) { orderPending = false; renderDeck(); return; }
      orderPending = true;
    }
    updateFaces(now);
  }

  function runButton(owner, bt) {
    const b = boardOf(owner.id);
    if (!b) return;
    const targets = bt.target === "*"
      ? b.items.map((id) => state.els[id]).filter((x) => x && (E.runnable(x) || x.type === "counter"))
      : [state.els[bt.target]].filter(Boolean);
    if (!targets.length) return showSnack("This button has no timer to control.");
    const now = Date.now();
    for (const el of targets) {
      const st = E.status(el);
      if (bt.action === "reset") { E.reset(el, now); dismissRing(el.id); continue; }
      if (!E.runnable(el)) continue;
      if (bt.action === "start") {
        if (st === "paused" || st === "waiting") { E.resume(el, now); dismissRing(el.id); }
        else if (st === "idle" || st === "done") {
          if (el.type === "quick") E.start(el, now, { dur: el.cfg.last });
          else E.start(el, now);
          dismissRing(el.id);
        }
      } else if (bt.action === "pause") {
        if (st === "running" || st === "delay") E.pause(el, now);
      } else if (bt.action === "toggle") {
        if (el.type === "quick" && (st === "idle" || st === "done")) E.start(el, now, { dur: el.cfg.last });
        else E.toggle(el, now);
        if (E.status(el) === "running" || E.status(el) === "delay") dismissRing(el.id);
      }
    }
    afterChange();
  }

  // --------------------------------------------------------------- alarms
  const ringing = new Map();
  const bootAt = Date.now();

  function handleEvent(ev, now) {
    // Only what happens while the app is open rings here; anything that
    // happened while it was closed was the system's alert to deliver.
    const live = ev.at >= bootAt - 1500 && now - ev.at < 15000;
    if (!live) return;
    const a = ev.alert || {};
    playSound(a.sound);
    const stays = ev.kind === "done";
    showRing(ev.el, ev.body, a, stays);
  }

  function showRing(el, body, a, stays) {
    dismissRing(el.id);
    const canSnooze = (el.type === "countdown" || el.type === "quick") && stays;
    const stop = () => dismissRing(el.id);
    const acts = h("div", { class: "ringer-acts" + (canSnooze ? "" : " one") },
      canSnooze ? h("button", { class: "btn", type: "button", text: "+1 min", onclick: () => {
        const cur = state.els[el.id];
        if (cur) act(cur, "add", 60000);
        else dismissRing(el.id);
      } }) : null,
      h("button", { class: "btn btn-accent", type: "button", text: "Stop", onclick: stop }));
    const node = h("div", { class: "ringer", role: "alert" },
      h("div", { style: "min-width:0" }, h("div", { class: "ringer-name", text: nameOf(el) }), h("div", { class: "ringer-body", text: body })),
      acts);
    $("#ringers").append(node);
    const entry = { node, loop: null, hide: null };
    if (a.ring && a.sound && a.sound !== "none") {
      const started = Date.now();
      entry.loop = setInterval(() => {
        if (Date.now() - started > 10 * 60000) return dismissRing(el.id);
        playSound(a.sound);
      }, 2600);
    }
    if (!stays && !a.ring) entry.hide = setTimeout(() => dismissRing(el.id), 6000);
    ringing.set(el.id, entry);
    updateFaces(Date.now());
  }

  function dismissRing(id) {
    const r = ringing.get(id);
    if (!r) return;
    clearInterval(r.loop);
    clearTimeout(r.hide);
    r.node.remove();
    ringing.delete(id);
    const f = faces.get(id);
    if (f && f.root) f.root.classList.remove("is-ringing");
  }

  // ------------------------------------------------------------------ tick
  function runKey(el) {
    const r = el.run;
    return `${r.st}|${r.i ?? ""}|${r.round ?? ""}|${r.fired ?? ""}`;
  }
  function tickAll() {
    const now = Date.now();
    let changed = false;
    for (const el of Object.values(state.els)) {
      const before = runKey(el);
      E.tick(el, now, (ev) => handleEvent(ev, now));
      if (runKey(el) !== before) changed = true;
    }
    if (changed) persist(true);
    reorderOrPaint(now);
  }

  // ---------------------------------------------------------- sheets
  const overlay = $("#overlay");
  const sheet = $("#sheet");
  let sheetCtx = null;
  let closeSeq = 0;

  function openSheet(nodes, ctx) {
    closeSeq++;
    detail = null;
    sheetCtx = ctx || {};
    sheet.replaceChildren(h("div", { class: "sheet-handle" }), ...nodes.flat().filter(Boolean));
    overlay.classList.remove("closing");
    overlay.hidden = false;
    sheet.scrollTop = 0;
  }
  function closeSheet() {
    if (overlay.hidden) return;
    const seq = ++closeSeq;
    detail = null;
    sheetCtx = null;
    overlay.classList.add("closing");
    overlay.hidden = true;
    setTimeout(() => { if (seq === closeSeq) overlay.classList.remove("closing"); }, 240);
    if (cloud.pending) setTimeout(applyPendingSync, 0);
    if (orderPending) setTimeout(() => { if (orderPending && overlay.hidden) reorderOrPaint(Date.now()); }, 200);
  }
  overlay.addEventListener("pointerdown", (e) => { overlay.downOnScrim = e.target === overlay; });
  overlay.addEventListener("click", (e) => { if (e.target === overlay && overlay.downOnScrim) closeSheet(); });

  // As in iOS 26 sheets: Close on the leading edge of the top bar, the
  // sheet's own buttons on the trailing edge, and the title large under them.
  function sheetHead(title, kind, extra) {
    return [
      h("div", { class: "sheet-head" },
        h("button", { class: "sheet-close", type: "button", title: "Close", "aria-label": "Close", html: I.close, onclick: closeSheet }),
        extra ? h("div", { class: "head-acts" }, extra) : null),
      h("div", { class: "sheet-titles" },
        h("div", { class: "sheet-title", text: title }), kind ? h("div", { class: "sheet-kind", text: kind }) : null),
    ];
  }

  // The red row that ends a sheet, as Delete Alarm ends one in Apple's Clock.
  function deleteRow(label, onClick) {
    return group(null, h("div", { class: "row tap danger center", role: "button", tabindex: "0", onclick: onClick,
      onkeydown: (e) => { if (e.key === "Enter") onClick(); } }, h("div", { class: "row-label", text: label })));
  }
  const nounOf = (el) => (el.type === "clock" ? "Clock" : el.type === "counter" ? "Counter" : "Timer");

  // A page pushed inside the open sheet, as in an iOS navigation stack: the
  // sheet's own content waits untouched underneath and slides back with Back.
  // Returns the function that goes back.
  function pushSheetPage(title, nodes, onBack) {
    const saved = [...sheet.childNodes];
    const top = sheet.scrollTop;
    const seq = closeSeq;
    let gone = false;
    const back = () => {
      if (gone || seq !== closeSeq || overlay.hidden) return;
      gone = true;
      if (onBack) onBack();
      sheet.replaceChildren(...saved);
      sheet.scrollTop = top;
      for (const n of saved) if (n.classList && !n.classList.contains("sheet-handle")) n.classList.add("page-return");
      setTimeout(() => { for (const n of saved) if (n.classList) n.classList.remove("page-return"); }, 420);
    };
    sheet.replaceChildren(h("div", { class: "sheet-handle" }),
      h("div", { class: "sheet-page" },
        h("div", { class: "sheet-head page-head" },
          h("button", { class: "sheet-close page-back", type: "button", title: "Back", "aria-label": "Back", html: I.back, onclick: back }),
          h("div", { class: "page-title", text: title }),
          h("div", { class: "page-head-end" })),
        ...nodes.flat().filter(Boolean)));
    sheet.scrollTop = 0;
    return back;
  }

  // A minus and plus pair around a number, as in the iOS stepper.
  function stepper(value, min, max, label, onChange) {
    let v = Math.max(min, Math.min(max, Number(value) || min));
    const out = h("span", { class: "stepper-val", "aria-live": "polite" });
    const minus = h("button", { class: "stepper-btn", type: "button", "aria-label": "Less", html: I.minus });
    const plus = h("button", { class: "stepper-btn", type: "button", "aria-label": "More", html: I.plus });
    const paint = () => { out.textContent = String(v); minus.disabled = v <= min; plus.disabled = v >= max; };
    const set = (n) => { v = Math.max(min, Math.min(max, n)); paint(); onChange(v); out.classList.remove("bump"); void out.offsetWidth; out.classList.add("bump"); };
    minus.addEventListener("click", () => set(v - 1));
    plus.addEventListener("click", () => set(v + 1));
    paint();
    return h("div", { class: "stepper", role: "group", "aria-label": label }, minus, out, plus);
  }

  // Small question on top of everything else.
  const dialogOverlay = $("#dialogOverlay");
  const dialogBox = $("#dialog");
  let dialogDone = null;
  function dialog({ title, text, ok, cancel, danger }) {
    return new Promise((resolve) => {
      if (dialogDone) dialogDone(false);
      dialogDone = (v) => {
        dialogDone = null;
        dialogOverlay.classList.add("closing");
        dialogOverlay.hidden = true;
        setTimeout(() => dialogOverlay.classList.remove("closing"), 220);
        resolve(v);
      };
      const okBtn = h("button", { class: "btn " + (danger ? "btn-danger" : "btn-accent"), type: "button", text: ok || "OK", onclick: () => dialogDone(true) });
      dialogBox.replaceChildren(
        h("div", { class: "sheet-title", text: title }),
        text ? h("div", { class: "sheet-text", text }) : null,
        h("div", { class: "sheet-actions" }, h("div", { class: "spacer" }),
          cancel === false ? null : h("button", { class: "btn", type: "button", text: cancel || "Cancel", onclick: () => dialogDone(false) }),
          okBtn));
      dialogOverlay.classList.remove("closing");
      dialogOverlay.hidden = false;
      // The destructive button is never the default.
      (danger ? dialogBox.querySelector(".btn:not(.btn-danger)") : okBtn).focus();
    });
  }
  const alertBox = (title, text) => dialog({ title, text, ok: "OK", cancel: false });
  dialogOverlay.addEventListener("click", (e) => { if (e.target === dialogOverlay && dialogDone) dialogDone(false); });

  // ------------------------------------------------------------ snackbar
  let snackTimer = null;
  function showSnack(text, undo) {
    const s = $("#snack");
    clearTimeout(snackTimer);
    s.replaceChildren(h("span", { text }), ...(undo ? [h("button", { type: "button", text: "Undo", onclick: () => { hideSnack(); undo(); } })] : []));
    s.classList.remove("closing");
    s.hidden = false;
    $("#fab").classList.add("lifted");
    snackTimer = setTimeout(hideSnack, undo ? 5000 : 3500);
  }
  function hideSnack() {
    const s = $("#snack");
    clearTimeout(snackTimer);
    if (s.hidden) return;
    s.classList.add("closing");
    s.hidden = true;
    $("#fab").classList.remove("lifted");
    setTimeout(() => s.classList.remove("closing"), 200);
  }

  // ------------------------------------------------------------ deleting
  function deleteEl(id) {
    const el = state.els[id];
    const b = boardOf(id);
    if (!el || !b) return;
    const index = b.items.indexOf(id);
    b.items.splice(index, 1);
    delete state.els[id];
    dismissRing(id);
    if (detail && detail.el.id === id) closeSheet();
    renderDeck();
    persist();
    showSnack("Deleted " + nameOf(el), () => {
      if (!state.boards.includes(b)) return;
      state.els[id] = el;
      b.items.splice(Math.min(index, b.items.length), 0, id);
      renderDeck();
      persist();
    });
  }
  async function askDelete(id) {
    const el = state.els[id];
    if (!el) return;
    const yes = await dialog({ title: `Delete ${nameOf(el)}?`, text: "Its settings and history go with it.", ok: "Delete", danger: true });
    closeSwipe();
    if (yes) deleteEl(id);
    return yes;
  }

  // Swipe a row left to show the bin (iPhone and iPad).
  let swipeOpen = null;
  let swipeJustEnded = false;
  function swipeSwallow() {
    if (swipeJustEnded) { swipeJustEnded = false; return true; }
    if (swipeOpen) { closeSwipe(); return true; }
    return false;
  }
  function closeSwipe() {
    const w = swipeOpen;
    swipeOpen = null;
    if (!w) return;
    const row = w.querySelector(".rc");
    row.style.transform = "";
    const done = () => w.classList.remove("showing");
    row.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 400);
  }
  if (isIOS) {
    let drag = null;
    deck.addEventListener("pointerdown", (e) => {
      const w = e.target.closest(".swipe");
      if (!w || e.target.closest(".ctl, .swipe-del")) return;
      if (isNarrow() && !drawerOpen() && e.clientX <= EDGE) return;
      if (swipeOpen && swipeOpen !== w) closeSwipe();
      drag = { w, x: e.clientX, y: e.clientY, id: e.pointerId, base: swipeOpen === w ? -80 : 0, moving: false };
    });
    deck.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moving) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) {
          if (Math.abs(dy) > 8) drag = null;
          return;
        }
        // A swipe right on a shut row opens the sidebar, not the row.
        if (dx > 0 && drag.base === 0) { drag = null; return; }
        drag.moving = true;
        drag.w.classList.add("showing", "dragging");
        drag.w.querySelector(".rc").setPointerCapture(e.pointerId);
      }
      let x = Math.min(0, drag.base + dx);
      if (x < -80) x = -80 + (x + 80) / 3;
      drag.w.querySelector(".rc").style.transform = `translateX(${x}px)`;
      drag.x2 = x;
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.moving) return;
      d.w.classList.remove("dragging");
      swipeJustEnded = true;
      setTimeout(() => { swipeJustEnded = false; }, 350);
      const row = d.w.querySelector(".rc");
      if ((d.x2 || 0) < -40) {
        row.style.transform = "translateX(-80px)";
        swipeOpen = d.w;
      } else {
        swipeOpen = d.w;
        closeSwipe();
      }
    };
    deck.addEventListener("pointerup", end);
    deck.addEventListener("pointercancel", end);
    $("#content").addEventListener("scroll", () => { if (swipeOpen) closeSwipe(); }, { passive: true });
  }

  // ------------------------------------------------------------ form parts
  const UNIT_LABEL = { mo: "Months", d: "Days", h: "Hours", m: "Min", s: "Sec" };
  function durInput(units, value, onChange) {
    const keys = E.UNIT_KEYS[units] || E.UNIT_KEYS.full;
    const wrap = h("div", { class: "dur", style: `grid-template-columns: repeat(${keys.length}, minmax(0, 1fr))` });
    const inputs = {};
    const get = () => {
      const o = {};
      for (const k of keys) o[k] = Number(inputs[k].value) || 0;
      return E.dur(o);
    };
    for (const k of keys) {
      const inp = h("input", { class: "num-in", type: "text", inputmode: "numeric", placeholder: "0", "aria-label": UNIT_LABEL[k], autocomplete: "off" });
      inp.addEventListener("input", () => {
        const clean = inp.value.replace(/[^0-9]/g, "").slice(0, 6);
        if (clean !== inp.value) inp.value = clean;
        onChange(get());
      });
      inp.addEventListener("focus", () => inp.select());
      inputs[k] = inp;
      wrap.append(h("label", { class: "dur-cell" }, inp, h("span", { text: UNIT_LABEL[k] })));
    }
    const set = (d) => {
      // Anything in a unit this box does not show is carried down.
      const ms = E.durMs(d, 0);
      const p = keys.includes("mo") ? E.dur(d) : E.fromMs(ms, units);
      for (const k of keys) inputs[k].value = p[k] ? String(p[k]) : "";
    };
    set(value);
    return { node: wrap, get, set };
  }

  function presetChips(list, onPick) {
    return h("div", { class: "chips" },
      list.map(([label, d]) => h("button", { class: "chip", type: "button", text: label, onclick: () => onPick(d) })));
  }
  const TIME_PRESETS = [
    ["1 min", { m: 1 }], ["5 min", { m: 5 }], ["10 min", { m: 10 }], ["25 min", { m: 25 }],
    ["1 hour", { h: 1 }], ["1 day", { d: 1 }], ["1 week", { d: 7 }], ["1 month", { mo: 1 }],
  ];
  const ADD_PRESETS = [
    [-60, "−1 min"], [30, "+30 s"], [60, "+1 min"], [300, "+5 min"],
    [600, "+10 min"], [900, "+15 min"], [1800, "+30 min"], [3600, "+1 hour"],
  ];
  const addLabel = (sec) => {
    const hit = ADD_PRESETS.find((p) => p[0] === sec);
    if (hit) return hit[1];
    const sign = sec < 0 ? "−" : "+";
    return sign + E.describe(E.fromMs(Math.abs(sec) * 1000, "dhms"));
  };

  function row(label, desc, control, opts) {
    return h("div", { class: "row" + (opts && opts.cls ? " " + opts.cls : "") },
      h("div", { class: "row-text" }, h("div", { class: "row-label", text: label }), desc ? h("div", { class: "row-desc", text: desc }) : null),
      control);
  }
  function switchRow(label, desc, value, onChange) {
    const sw = h("input", { class: "switch", type: "checkbox", role: "switch", checked: value, "aria-label": label });
    sw.addEventListener("change", () => onChange(sw.checked));
    const r = row(label, desc, sw);
    r.classList.add("tap");
    r.addEventListener("click", (e) => { if (e.target !== sw) { sw.checked = !sw.checked; onChange(sw.checked); } });
    return r;
  }
  function selectEl(options, value, onChange, label) {
    const s = h("select", { "aria-label": label || "" }, options.map(([v, t]) => h("option", { value: v, text: t })));
    s.value = value;
    s.addEventListener("change", () => onChange(s.value));
    return s;
  }
  function selectRow(label, desc, options, value, onChange) {
    return row(label, desc, selectEl(options, value, onChange, label));
  }
  function numberIn(value, onChange, opts) {
    const o = opts || {};
    const inp = h("input", { class: "num-in", type: "text", inputmode: o.decimal ? "decimal" : "numeric", value: value == null ? "" : String(value), placeholder: o.placeholder || "", "aria-label": o.label || "" });
    inp.addEventListener("input", () => {
      const re = o.decimal ? /[^0-9.\-]/g : /[^0-9]/g;
      const clean = inp.value.replace(re, "");
      if (clean !== inp.value) inp.value = clean;
      if (inp.value === "" || inp.value === "-") return onChange(o.allowEmpty ? null : o.min || 0);
      const n = Number(inp.value);
      if (Number.isFinite(n)) onChange(n);
    });
    inp.addEventListener("focus", () => inp.select());
    return inp;
  }
  function numberRow(label, desc, value, onChange, opts) {
    return row(label, desc, numberIn(value, onChange, Object.assign({ label }, opts)));
  }
  function group(title, ...rows) {
    return [title ? h("div", { class: "group-title", text: title }) : null, h("div", { class: "group" }, rows.flat().filter(Boolean))];
  }
  function soundSelect(value, onChange) {
    const s = selectEl(SOUNDS, value, (v) => { onChange(v); playSound(v); }, "Sound");
    return h("div", { style: "display:flex;gap:6px;align-items:center" }, s,
      h("button", { class: "ctl ghost", type: "button", title: "Play the sound", "aria-label": "Play the sound", html: I.sound, onclick: () => playSound(s.value) }));
  }
  function alertRows(title, a) {
    return group(title,
      row("Sound", null, soundSelect(a.sound, (v) => { a.sound = v; })),
      switchRow("Keep ringing", "Rings until you stop it.", a.ring, (v) => { a.ring = v; }),
      switchRow("Notification", "Also alerts you when Clock Yard is closed.", a.notify, (v) => { a.notify = v; }));
  }
  function addButtonsGroup(cfg) {
    const chips = h("div", { class: "chips" });
    const draw = () => {
      chips.replaceChildren(...ADD_PRESETS.map(([sec, label]) => h("button", {
        class: "chip" + (cfg.add.includes(sec) ? " on" : ""), type: "button", text: label, "aria-pressed": cfg.add.includes(sec) ? "true" : "false",
        onclick: () => {
          cfg.add = cfg.add.includes(sec) ? cfg.add.filter((x) => x !== sec) : [...cfg.add, sec].sort((a, b) => a - b);
          draw();
        },
      })));
    };
    draw();
    return group("Add time buttons", h("div", { class: "stack" }, h("div", { class: "row-desc", text: "Shown on the timer, to add or take off time while it runs." }), chips));
  }
  function noteGroup(cfg) {
    const t = h("textarea", { class: "text-in", placeholder: "Anything to remember. It shows on the timer and in its alert.", value: cfg.note || "" });
    t.addEventListener("input", () => { cfg.note = t.value; });
    return group("Note", h("div", { class: "stack" }, t));
  }
  const errLine = () => h("div", { class: "row-desc", style: "color:var(--danger);display:none" });
  const showErrLine = (line, text) => { line.textContent = text; line.style.display = text ? "block" : "none"; };

  // ------------------------------------------------------------ type picker
  function openNew() {
    if (!canUse()) return;
    const b = board();
    openSheet([
      sheetHead("New on " + b.name, "Pick what to add"),
      h("div", { class: "types" }, E.ORDER.map((t) => h("button", { class: "type-tile", type: "button", onclick: () => openEditor(t) },
        h("div", { class: "type-icon", html: TYPE_ICON[t] }),
        h("div", { style: "min-width:0" }, h("div", { class: "type-name", text: E.TYPES[t].label }), h("div", { class: "type-desc", text: E.TYPES[t].desc }))))),
    ], { kind: "new" });
  }

  // ------------------------------------------------------------ the editor
  const EXTRA = {
    countdown: [["none", "None"], ["overtime", "Overtime"], ["start", "Start time"], ["finish", "Finish time"]],
    countup: [["none", "None"], ["start", "Start time"], ["next", "Next alert"]],
    interval: [["none", "None"], ["overall", "Overall time"], ["start", "Start time"], ["finish", "Finish time"]],
    stopwatch: [["none", "None"], ["start", "Start time"], ["laps", "Laps"]],
  };
  EXTRA.quick = EXTRA.countdown;
  // The colour a timer's row and dial are painted in. Styles hold the shades.
  const COLORS = [
    ["", "No color"], ["red", "Red"], ["orange", "Orange"], ["yellow", "Yellow"], ["green", "Green"], ["mint", "Mint"], ["teal", "Teal"],
    ["cyan", "Cyan"], ["blue", "Blue"], ["indigo", "Indigo"], ["purple", "Purple"], ["pink", "Pink"], ["brown", "Brown"], ["gray", "Gray"],
  ];
  const colorClass = (el) => {
    const c = el.cfg && el.cfg.color;
    return c && COLORS.some((x) => x[0] === c) ? " colored c-" + c : "";
  };
  function colorGroup(draft) {
    const wrap = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Color" });
    const draw = () => wrap.replaceChildren(...COLORS.map(([key, label]) => {
      const on = (draft.color || "") === key;
      return h("button", {
        class: "swatch" + (key ? " c-" + key : " swatch-none") + (on ? " on" : ""), type: "button", role: "radio",
        "aria-checked": on ? "true" : "false", "aria-label": label, title: label,
        onclick: () => { draft.color = key; draw(); },
      });
    }));
    draw();
    return group("Color", h("div", { class: "stack" }, wrap));
  }
  const UNITS =[["dhms", "Days, hours, minutes, seconds"], ["hms", "Hours, minutes, seconds"], ["ms", "Minutes and seconds"], ["s", "Only seconds"]];

  function openEditor(type, id, preset) {
    if (!canUse()) return;
    const existing = id ? state.els[id] : null;
    const draft = existing ? JSON.parse(JSON.stringify(existing.cfg)) : E.defaults(type);
    let name = existing ? existing.name : (preset && preset.name) || "";
    const body = h("div", { style: "display:flex;flex-direction:column;gap:14px" });
    const nameIn = h("input", { class: "text-in", type: "text", value: name, placeholder: E.TYPES[type].label, maxlength: "80", "aria-label": "Name" });
    nameIn.addEventListener("input", () => { name = nameIn.value; });
    nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    const checks = [];
    // The time a countdown runs for goes first, on its own card, larger.
    let top = null;

    const sections = () => {
      const out = [];
      switch (type) {
        case "countdown": {
          const err = errLine();
          const d = durInput("full", draft.dur, (v) => { draft.dur = v; showErrLine(err, ""); });
          checks.push(() => (E.isZero(draft.dur) ? (showErrLine(err, "Set a time above zero."), false) : true));
          d.node.classList.add("big");
          top = h("div", { class: "time-hero" }, h("div", { class: "time-hero-label", text: "Time" }), d.node, err);
          const delay = durInput("hms", draft.delay, (v) => { draft.delay = v; });
          out.push(group("Start",
            switchRow("Repeat", "Starts again by itself every time it ends.", draft.loop, (v) => { draft.loop = v; }),
            h("div", { class: "stack" }, h("div", { class: "row-text" }, h("div", { class: "row-label", text: "Delayed start" }), h("div", { class: "row-desc", text: "Waits this long after you press start. Leave at zero to start at once." })), delay.node)));
          out.push(group("When it ends",
            switchRow("Autocompletion", "Resets to the full time by itself once it has rung.", draft.autoReset, (v) => { draft.autoReset = v; }),
            selectRow("Extra info", "Shown under the time.", EXTRA.countdown, draft.extra, (v) => { draft.extra = v; })));
          out.push(alertRows("Alert", draft.alert));
          out.push(addButtonsGroup(draft));
          out.push(noteGroup(draft));
          break;
        }
        case "quick":
          out.push(group(null, h("div", { class: "stack" }, h("div", { class: "row-desc", text: "You set the time each time you start it. The last time you used is offered first." }))));
          out.push(group("When it ends",
            switchRow("Autocompletion", "Goes back to waiting for a time once it has rung.", draft.autoReset, (v) => { draft.autoReset = v; }),
            selectRow("Extra info", "Shown under the time.", EXTRA.quick, draft.extra, (v) => { draft.extra = v; })));
          out.push(alertRows("Alert", draft.alert));
          out.push(addButtonsGroup(draft));
          break;
        case "countup": {
          const unitsSel = selectRow("Units of time", null, UNITS, draft.units, (v) => { draft.units = v; redraw(); });
          const pre = durInput(draft.units, draft.preset, (v) => { draft.preset = v; });
          out.push(group("Counting", unitsSel,
            h("div", { class: "stack" }, h("div", { class: "row-text" }, h("div", { class: "row-label", text: "Preset time" }), h("div", { class: "row-desc", text: "Where it starts counting from. Zero starts from nothing." })), pre.node),
            selectRow("Extra info", "Shown under the time.", EXTRA.countup, draft.extra, (v) => { draft.extra = v; })));
          const list = h("div", { class: "group" });
          const drawAlerts = () => {
            list.replaceChildren();
            draft.alerts.forEach((a, k) => {
              const d = durInput(draft.units, a, (v) => { draft.alerts[k] = v; });
              list.append(h("div", { class: "stack" },
                h("div", { class: "stack-head" }, h("div", { class: "row-label", text: "Alert " + (k + 1) }),
                  ctlBtn(I.trash, "Remove alert", () => { draft.alerts.splice(k, 1); drawAlerts(); }, "ghost danger")),
                d.node));
            });
            list.append(h("div", { class: "stack" }, h("div", { class: "add-row one" },
              h("button", { class: "btn", type: "button", text: "Add Alert", onclick: () => { draft.alerts.push(E.dur({ m: 10 * (draft.alerts.length + 1) })); drawAlerts(); } }))));
          };
          drawAlerts();
          out.push(h("div", { class: "group-title", text: "Alerts on the way" }), list);
          out.push(alertRows("Alert sound", draft.alert));
          out.push(addButtonsGroup(draft));
          break;
        }
        case "pomodoro": {
          const err = errLine();
          const w = durInput("hms", draft.work, (v) => { draft.work = v; showErrLine(err, ""); });
          const b = durInput("hms", draft.brk, (v) => { draft.brk = v; });
          const l = durInput("hms", draft.long, (v) => { draft.long = v; });
          checks.push(() => (E.isZero(draft.work) ? (showErrLine(err, "Set a work time above zero."), false) : true));
          const lab = (t, d) => h("div", { class: "stack" }, h("div", { class: "row-label", text: t }), d);
          out.push(group("Intervals",
            h("div", { class: "stack" }, h("div", { class: "row-label", text: "Work" }), w.node, err),
            lab("Break", b.node), lab("Long break", l.node),
            numberRow("Long break cycle", "Work sessions before a long break.", draft.cycle, (v) => { draft.cycle = Math.max(1, Math.min(20, v || 1)); })));
          out.push(alertRows("Work end alert", draft.workAlert));
          out.push(alertRows("Break end alert", draft.breakAlert));
          break;
        }
        case "interval": {
          // The intervals come first: they are what this timer is.
          const err = errLine();
          checks.push(() => (E.steps({ cfg: draft }).length ? true : (showErrLine(err, "Add at least one interval with a time above zero."), false)));
          out.push(intervalEditor(draft), err);
          out.push(group("Running",
            switchRow("Pause between intervals", "Waits for you to continue after each interval.", draft.pauseBetween, (v) => { draft.pauseBetween = v; }),
            switchRow("Autocompletion", "Resets by itself once the last interval ends.", draft.autoReset, (v) => { draft.autoReset = v; }),
            selectRow("Extra info", "Shown under the time.", EXTRA.interval, draft.extra, (v) => { draft.extra = v; }),
            selectRow("Units of time", null, UNITS, draft.units, (v) => { draft.units = v; redraw(); })));
          out.push(addButtonsGroup(draft));
          out.push(noteGroup(draft));
          break;
        }
        case "stopwatch":
          out.push(group("Measuring",
            selectRow("Mode", draft.mode === "multiple" ? "Each reset keeps the result in a list." : "One measurement at a time, with laps.",
              [["single", "Single measurement"], ["multiple", "Multiple measurements"]], draft.mode, (v) => { draft.mode = v; redraw(); }),
            selectRow("Extra info", "Shown under the time.", EXTRA.stopwatch, draft.extra, (v) => { draft.extra = v; })));
          break;
        case "counter": {
          const err = errLine();
          checks.push(() => {
            if (!(Math.abs(Number(draft.step)) > 0)) return showErrLine(err, "Set a step above zero."), false;
            return true;
          });
          out.push(group("Counting",
            selectRow("Mode", null, [["both", "Increase and decrease"], ["inc", "Increase"], ["dec", "Decrease"]], draft.mode, (v) => { draft.mode = v; }),
            numberRow("Initial value", null, draft.initial, (v) => { draft.initial = v || 0; }, { decimal: true }),
            numberRow("Step", null, draft.step, (v) => { draft.step = v; showErrLine(err, ""); }, { decimal: true }),
            numberRow("Final value", "Leave empty to count without an end.", draft.final, (v) => { draft.final = v; }, { decimal: true, allowEmpty: true, placeholder: "None" })), err);
          out.push(alertRows("When it reaches the final value", draft.alert));
          break;
        }
        case "clock": {
          const zones = [["", "Local time"], ...E.zones().map((z) => [z, z.replace(/_/g, " ")])];
          out.push(group("Clock",
            selectRow("Time zone", null, zones, draft.tz, (v) => { draft.tz = v; }),
            selectRow("Mode", null, [["digital", "Digital"], ["analog", "Dial"]], draft.mode, (v) => { draft.mode = v; }),
            selectRow("Format", null, [["24", "24-hour"], ["12", "12-hour"]], draft.fmt, (v) => { draft.fmt = v; })));
          break;
        }
        case "container": {
          const home = existing ? boardOf(existing.id) : board();
          const others = state.boards.filter((b) => b !== home);
          if (!others.length) {
            out.push(group("Board", h("div", { class: "stack" },
              h("div", { class: "row-desc", text: "A container shows another board's timers here. Add a second board first." }),
              h("div", { class: "add-row one" }, h("button", { class: "btn", type: "button", text: "Add a Board", onclick: () => openNewBoard() })))));
          } else {
            if (!others.some((b) => b.id === draft.board)) draft.board = others[0].id;
            out.push(group("Board", selectRow("Select board", "Its timers show and run inside this container.",
              others.map((b) => [b.id, b.name]), draft.board, (v) => { draft.board = v; })));
          }
          break;
        }
        case "buttons": {
          const home = existing ? boardOf(existing.id) : board();
          const targets = [["*", "All timers on this board"], ...home.items.map((i) => state.els[i])
            .filter((x) => x && (E.runnable(x) || x.type === "counter")).map((x) => [x.id, nameOf(x)])];
          const list = h("div", { class: "group" });
          const drawButtons = () => {
            list.replaceChildren();
            draft.buttons.forEach((bt, k) => {
              const label = h("input", { class: "text-in grow", type: "text", value: bt.label, placeholder: "Label", maxlength: "40", "aria-label": "Label" });
              label.addEventListener("input", () => { bt.label = label.value; });
              if (!targets.some((t) => t[0] === bt.target)) bt.target = "*";
              list.append(h("div", { class: "iv-item" },
                h("div", { class: "iv-line" }, label, h("div", { class: "iv-tools" },
                  ctlBtn(I.trash, "Remove button", () => { draft.buttons.splice(k, 1); drawButtons(); }, "ghost danger"))),
                h("div", { class: "iv-line" },
                  selectEl([["start", "Start"], ["pause", "Pause"], ["toggle", "Start or pause"], ["reset", "Reset"]], bt.action, (v) => { bt.action = v; }, "Action"),
                  h("div", { class: "grow" }, selectEl(targets, bt.target, (v) => { bt.target = v; }, "Timer")))));
              list.lastChild.querySelectorAll("select")[1].style.width = "100%";
            });
            list.append(h("div", { class: "stack" }, h("div", { class: "add-row one" },
              h("button", { class: "btn", type: "button", text: "Add Button", onclick: () => { draft.buttons.push({ id: E.uid(), label: "", action: "start", target: "*" }); drawButtons(); } }))));
          };
          drawButtons();
          out.push(h("div", { class: "group-title", text: "Buttons" }), list);
          break;
        }
      }
      return out;
    };

    const redraw = () => {
      checks.length = 0;
      top = null;
      const rest = sections().flat().filter(Boolean);
      body.replaceChildren(...(top ? [top] : []), h("div", { class: "field" }, h("div", { class: "field-label", text: "Name" }), nameIn),
        ...(type === "container" || type === "buttons" ? [] : colorGroup(draft)), ...rest);
    };

    function save() {
      for (const c of checks) if (!c()) return;
      if (type === "buttons") draft.buttons = draft.buttons.map((b) => ({ ...b, label: b.label.trim() || "Button" }));
      if (existing) {
        // Looked up again: a copy from another device may have replaced it.
        const cur = state.els[existing.id];
        if (!cur) {
          closeSheet();
          return showSnack("That timer was deleted on another device.");
        }
        cur.name = name.trim();
        cur.cfg = draft;
        closeSheet();
        renderDeck();
        persist();
        return;
      }
      const el = E.create(type, name.trim());
      el.cfg = draft;
      if (type === "counter") el.value = Number(draft.initial) || 0;
      state.els[el.id] = el;
      board().items.push(el.id);
      enterIds.add(el.id);
      // A new timer starts running as soon as it is added.
      const started = E.runnable(el) && E.start(el, Date.now(), type === "quick" ? { dur: el.cfg.last } : undefined);
      closeSheet();
      renderDeck();
      persist();
      // A quick timer has no time yet: ask for one straight away.
      if (type === "quick" && !started) openQuickStart(el);
    }

    redraw();
    // Close on the left cancels; Add or Save sits on the right of the same bar.
    const saveBtn = h("button", { class: "head-btn accent", type: "button", text: existing ? "Save" : "Add", onclick: save });
    openSheet([
      sheetHead(existing ? "Edit " + nameOf(existing) : "New " + E.TYPES[type].label.toLowerCase(), E.TYPES[type].desc, saveBtn),
      body,
      existing ? deleteRow("Delete " + nounOf(existing), async () => { if (await askDelete(existing.id)) closeSheet(); }) : null,
    ], { kind: "editor" });
    if (!existing && !isIOS) setTimeout(() => nameIn.focus(), 30);
  }

  // Intervals as a plain list, as in Apple's Workout builder and the popular
  // interval apps: a row shows the name and its time, and tapping it opens the
  // interval on a page of its own. Edit shows handles to drag rows into a new
  // order and buttons to remove them.
  function intervalEditor(draft) {
    let editing = false;
    let enterId = null;
    const box = h("div", { class: "iv" });
    const soundName = (v) => { const s = SOUNDS.find((x) => x[0] === v); return s ? s[1] : "Chime"; };
    const newInterval = (name, dur) => ({ kind: "interval", id: E.uid(), name: name || "", dur: dur || {}, sound: "beep", repeat: 1, note: "" });
    const timeText = (d) => (E.isZero(d) ? "No time" : E.describe(d));

    const removeBtn = (arr, it, node) => h("button", { class: "iv-remove", type: "button", "aria-label": "Remove " + (it.name || "interval"), html: I.minus,
      onclick: (e) => {
        e.stopPropagation();
        node.classList.add("iv-leave");
        setTimeout(() => { const k = arr.indexOf(it); if (k >= 0) arr.splice(k, 1); draw(); }, 180);
      } });
    const grip = (arr, node) => {
      const g = h("span", { class: "iv-grip", "aria-hidden": "true", html: I.grip });
      g.addEventListener("pointerdown", (e) => dragRow(e, g, node, arr));
      return g;
    };
    const tail = (arr, node) => (editing ? grip(arr, node) : h("span", { class: "iv-chev", "aria-hidden": "true", html: I.chev }));
    const tapRowOf = (node, open) => {
      node.addEventListener("click", () => { if (!editing) open(); });
      node.addEventListener("keydown", (e) => { if (e.key === "Enter" && !editing) open(); });
    };

    const intervalRow = (it, arr, child) => {
      const sub = [it.sound === "none" ? "No sound" : soundName(it.sound)];
      if ((it.repeat || 1) > 1) sub.push(it.repeat + " times");
      const node = h("div", { class: "iv-row" + (child ? " child" : "") + (it.id === enterId ? " iv-enter" : ""), role: "button", tabindex: editing ? "-1" : "0", "data-id": it.id });
      node.append(...[
        editing ? removeBtn(arr, it, node) : null,
        h("span", { class: "iv-dot", "aria-hidden": "true" }),
        h("div", { class: "iv-text" }, h("div", { class: "iv-name", text: it.name || "Interval" }), h("div", { class: "iv-sub", text: sub.join(" · ") })),
        h("div", { class: "iv-time", text: timeText(it.dur) }),
        tail(arr, node)].filter(Boolean));
      tapRowOf(node, () => openInterval(it, arr, false));
      return node;
    };
    const addRow = (label, onClick, child) => h("button", { class: "iv-add" + (child ? " child" : ""), type: "button", onclick: onClick },
      h("span", { class: "iv-add-icon", "aria-hidden": "true", html: I.plus }), h("span", { text: label }));

    const groupBlock = (g) => {
      const block = h("div", { class: "iv-groupbox" + (g.id === enterId ? " iv-enter" : ""), "data-id": g.id });
      const n = g.items.length;
      const head = h("div", { class: "iv-row iv-ghead", role: "button", tabindex: editing ? "-1" : "0" },
        editing ? removeBtn(draft.items, g, block) : null,
        h("span", { class: "iv-gicon", "aria-hidden": "true", html: I.repeat }),
        h("div", { class: "iv-text" }, h("div", { class: "iv-name", text: g.name || "Group" }), h("div", { class: "iv-sub", text: n === 1 ? "1 interval" : n + " intervals" })),
        h("div", { class: "iv-time", text: (g.repeat || 1) === 1 ? "Once" : (g.repeat || 1) + " times" }),
        tail(draft.items, block));
      tapRowOf(head, () => openGroup(g));
      block.append(head, ...g.items.map((c) => intervalRow(c, g.items, true)));
      if (!editing) block.append(addRow("Add Interval", () => addInterval(g.items), true));
      return block;
    };

    const summary = () => {
      const steps = E.steps({ cfg: draft });
      if (!steps.length) return "No interval has a time yet.";
      const total = steps.reduce((t, s) => t + s.ms, 0);
      return (steps.length === 1 ? "1 interval" : steps.length + " intervals") + " · " + E.describe(E.fromMs(total, "dhms")) + " in all";
    };

    function draw() {
      // With nothing left to edit, Edit ends by itself so the Add rows come back.
      if (!draft.items.length) editing = false;
      const editBtn = h("button", { class: "iv-edit", type: "button", text: editing ? "Done" : "Edit",
        onclick: () => { editing = !editing; draw(); } });
      const list = h("div", { class: "group iv-list" + (editing ? " editing" : "") },
        draft.items.map((it) => (it.kind === "group" ? groupBlock(it) : intervalRow(it, draft.items, false))),
        editing ? null : addRow("Add Interval", () => addInterval(draft.items)),
        editing ? null : addRow("Add Group", addGroup));
      box.replaceChildren(
        h("div", { class: "iv-title" }, h("div", { class: "group-title", text: "Intervals" }), draft.items.length ? editBtn : null),
        list,
        h("div", { class: "iv-summary", text: summary() }));
      enterId = null;
    }

    function addInterval(arr) {
      const it = newInterval("");
      arr.push(it);
      enterId = it.id;
      openInterval(it, arr, true);
    }
    function addGroup() {
      const g = { kind: "group", id: E.uid(), name: "Rounds", repeat: 3, items: [newInterval("Work", { s: 30 }), newInterval("Rest", { s: 10 })] };
      draft.items.push(g);
      enterId = g.id;
      draw();
    }

    // One interval on its own page: name, time, the sound at its end, repeats, note.
    function openInterval(it, arr, isNew) {
      const name = h("input", { class: "text-in", type: "text", value: it.name, placeholder: "Work, Rest, Morning...", maxlength: "40", "aria-label": "Interval name" });
      name.addEventListener("input", () => { it.name = name.value; });
      const d = durInput(draft.units, it.dur, (v) => { it.dur = v; });
      const note = h("input", { class: "text-in", type: "text", value: it.note, placeholder: "Shown while it runs", maxlength: "120", "aria-label": "Interval note" });
      note.addEventListener("input", () => { it.note = note.value; });
      const back = pushSheetPage(isNew ? "New Interval" : it.name || "Interval", [
        h("div", { class: "field" }, h("div", { class: "field-label", text: "Name" }), name),
        group("Time", h("div", { class: "stack" }, d.node)),
        group("At the end",
          row("Sound", null, soundSelect(it.sound, (v) => { it.sound = v; })),
          row("Repeat", "Runs this interval more than once in a row.", stepper(it.repeat || 1, 1, 99, "Repeat", (v) => { it.repeat = v; }))),
        h("div", { class: "field" }, h("div", { class: "field-label", text: "Note" }), note),
        group(null, h("div", { class: "row tap danger", role: "button", tabindex: "0",
          onclick: () => { const k = arr.indexOf(it); if (k >= 0) arr.splice(k, 1); back(); } },
        h("div", { class: "row-label", text: "Delete Interval" }))),
      ], draw);
      if (isNew && !isIOS) setTimeout(() => name.focus(), 60);
    }

    // A group: its name and how many times it runs. Its intervals stay in the list.
    function openGroup(g) {
      const name = h("input", { class: "text-in", type: "text", value: g.name, placeholder: "Rounds", maxlength: "40", "aria-label": "Group name" });
      name.addEventListener("input", () => { g.name = name.value; });
      const back = pushSheetPage(g.name || "Group", [
        h("div", { class: "field" }, h("div", { class: "field-label", text: "Name" }), name),
        group(null, row("Repeat", "How many times the whole group runs.", stepper(g.repeat || 1, 1, 99, "Repeat", (v) => { g.repeat = v; }))),
        group(null, h("div", { class: "row tap danger", role: "button", tabindex: "0",
          onclick: () => { const k = draft.items.indexOf(g); if (k >= 0) draft.items.splice(k, 1); back(); } },
        h("div", { class: "row-label", text: "Delete Group" }))),
      ], draw);
    }

    // Dragging a row by its handle: the others slide out of the way, and the
    // order is kept when the finger lifts.
    function dragRow(e, handle, node, arr) {
      e.preventDefault();
      e.stopPropagation();
      const parent = node.parentElement;
      const rows = [...parent.children].filter((c) => c.dataset.id);
      const from = rows.indexOf(node);
      if (from < 0) return;
      const rects = rows.map((r) => r.getBoundingClientRect());
      const hgt = rects[from].height;
      const startY = e.clientY;
      let to = from;
      node.classList.add("iv-dragging");
      try { handle.setPointerCapture(e.pointerId); } catch {}
      const move = (ev) => {
        const dy = Math.max(rects[0].top - rects[from].top - 8, Math.min(rects[rows.length - 1].bottom - rects[from].bottom + 8, ev.clientY - startY));
        node.style.transform = `translateY(${dy}px)`;
        // A row moves aside once the dragged row's edge passes its middle.
        const top = rects[from].top + dy;
        const bottom = rects[from].bottom + dy;
        to = from;
        rows.forEach((r, k) => {
          if (k === from) return;
          const c = rects[k].top + rects[k].height / 2;
          let shift = 0;
          if (k > from && bottom > c) { shift = -hgt; to = Math.max(to, k); }
          if (k < from && top < c) { shift = hgt; to = Math.min(to, k); }
          r.style.transform = shift ? `translateY(${shift}px)` : "";
        });
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        draw();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    }

    draw();
    return box;
  }

  // ------------------------------------------------ quick timer: set a time
  function openQuickStart(el) {
    let d = E.dur(el.cfg.last);
    const err = errLine();
    const input = durInput("full", d, (v) => { d = v; showErrLine(err, ""); });
    input.node.classList.add("big");
    const go = () => {
      if (E.isZero(d)) return showErrLine(err, "Set a time above zero.");
      const cur = state.els[el.id];
      if (!cur) { closeSheet(); return showSnack("That timer was deleted on another device."); }
      E.start(cur, Date.now(), { dur: d });
      dismissRing(el.id);
      closeSheet();
      afterChange();
    };
    openSheet([
      sheetHead("Start " + nameOf(el), "How long this time?"),
      h("div", { class: "time-hero" }, input.node, err),
      h("div", { class: "group" }, h("div", { class: "stack" }, presetChips(TIME_PRESETS, (v) => { d = E.dur(v); input.set(v); showErrLine(err, ""); }))),
      h("div", { class: "sheet-actions" }, h("div", { class: "spacer" }),
        h("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        h("button", { class: "btn btn-accent", type: "button", text: "Start", onclick: go })),
    ], { kind: "quick" });
    input.node.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    if (!isIOS) setTimeout(() => input.node.querySelector("input").focus(), 30);
  }

  // ------------------------------------------------------------ the detail
  let detail = null;

  function detailControls(el) {
    const st = E.status(el);
    const btn = (text, onClick, cls, disabled) => h("button", { class: "btn" + (cls ? " " + cls : ""), type: "button", text, disabled, onclick: onClick });
    if (el.type === "counter") {
      return h("div", { class: "counter-ctls" },
        h("button", { class: "btn", type: "button", html: I.minus, "aria-label": "Count down", disabled: el.cfg.mode === "inc", onclick: () => act(el, "dec") }),
        btn("Reset", () => askReset(el), "small"),
        h("button", { class: "btn btn-accent", type: "button", html: I.plus, "aria-label": "Count up", disabled: el.cfg.mode === "dec", onclick: () => act(el, "inc") }));
    }
    if (!E.runnable(el)) return null;
    const prim = E.primary(el);
    const label = { start: "Start", pause: "Pause", resume: st === "waiting" ? "Continue" : "Resume", restart: "Start Again" }[prim];
    const primary = h("button", { class: "btn btn-accent", type: "button", onclick: () => act(el, "toggle") }, h("span", { class: "lbl", text: label }));
    const reset = btn("Reset", () => askReset(el), "", st === "idle");
    if (el.type === "stopwatch") {
      return h("div", { class: "detail-ctls", style: "grid-template-columns:repeat(3,minmax(0,1fr))" },
        reset, btn("Lap", () => act(el, "lap"), "", st !== "running"), primary);
    }
    return h("div", { class: "detail-ctls", style: "grid-template-columns:repeat(2,minmax(0,1fr))" }, reset, primary);
  }

  function detailFacts(el, now) {
    const r = el.run;
    const v = E.view(el, now);
    const out = [];
    const t = (ms) => E.fmtTime(ms, now);
    switch (el.type) {
      case "countdown":
      case "quick": {
        const d = el.type === "quick" ? r.dur || el.cfg.last : el.cfg.dur;
        out.push(["Time", E.describe(d)]);
        if (r.startedAt) out.push(["Started", t(r.startedAt)]);
        if (r.st === "delay") out.push(["Starts", t(r.delayEnd)]);
        if (v.eta) out.push(["Ends", t(v.eta)]);
        if (r.st === "done") { out.push(["Finished", t(r.finishedAt)]); out.push(["Overtime", "+" + E.fmtElapsed(now - r.finishedAt)]); }
        if (el.type === "countdown" && el.cfg.loop && r.round) out.push(["Round", String(r.round)]);
        break;
      }
      case "countup":
        if (r.startedAt) out.push(["Started", t(r.startedAt)]);
        if (v.eta) out.push(["Next alert", t(v.eta)]);
        out.push(["Alerts", String((el.cfg.alerts || []).length)]);
        break;
      case "pomodoro":
        out.push(["Work", E.describe(el.cfg.work)], ["Break", E.describe(el.cfg.brk)], ["Long break", E.describe(el.cfg.long)]);
        if (r.startedAt) out.push(["Started", t(r.startedAt)], ["Work sessions done", String(Math.ceil((r.i || 0) / 2))]);
        break;
      case "interval": {
        const S = E.steps(el);
        out.push(["Intervals", String(S.length)]);
        if (r.st !== "idle" && r.st !== "done" && S[r.i]) out.push(["Now", `${E.intervalLabel(S[r.i])} (${r.i + 1} of ${S.length})`]);
        if (r.startedAt) out.push(["Started", t(r.startedAt)]);
        if (v.eta) out.push(["Ends", t(v.eta)]);
        if (r.st === "done") out.push(["Finished", t(r.finishedAt)]);
        if (v.step && v.step.note) out.push(["Note", v.step.note]);
        break;
      }
      case "stopwatch":
        if (r.startedAt) out.push(["Started", t(r.startedAt)]);
        if (el.laps.length) out.push(["Laps", String(el.laps.length)]);
        break;
      case "counter":
        out.push(["Initial value", String(el.cfg.initial)], ["Step", String(el.cfg.step)]);
        if (el.cfg.final !== null && el.cfg.final !== "") out.push(["Final value", String(el.cfg.final)]);
        break;
      case "clock":
        out.push(["Time zone", el.cfg.tz ? el.cfg.tz.replace(/_/g, " ") : "This device's own"]);
        break;
    }
    return out;
  }

  function openDetail(id) {
    const el = state.els[id];
    if (!el) return;
    if (el.type === "container" || el.type === "buttons") return openEditor(el.type, id);
    const time = h("div", { class: "cc-time" });
    const sub = h("div", { class: "cc-sub" });
    const ring = el.type === "clock" ? null : ringSvg();
    const dial = el.type === "clock" && el.cfg.mode === "analog" ? dialSvg() : null;
    // A timer with its own colour keeps it here: the dial and the main button.
    const color = colorClass(el);
    // Tapping the dial starts or pauses the timer, the same as its main button.
    const tap = E.runnable(el);
    const face = h("div", { class: "detail-face" + color + (tap ? " tap" : ""),
      role: tap ? "button" : null, tabindex: tap ? "0" : null, "aria-label": tap ? "Start or pause" : null,
      onclick: tap ? () => { const cur = state.els[el.id]; if (cur) act(cur, "toggle"); } : null,
      onkeydown: tap ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const cur = state.els[el.id]; if (cur) act(cur, "toggle"); } } : null },
    h("div", { class: "cc-disc" }), ring, h("div", { class: "cc-inner" }, dial || time, sub));
    const ctls = h("div", { class: color ? "tinted c-" + el.cfg.color : null });
    const adds = h("div");
    const facts = h("div", { class: "group facts" });
    const laps = h("div", { class: "sheet-part" });
    const hist = h("div", { class: "sheet-part" });
    const note = (el.cfg.note || "").trim();
    openSheet([
      // As in Apple's own apps: Close on the left, Edit on the right, and the
      // destructive action last, at the bottom of the sheet.
      sheetHead(nameOf(el), E.TYPES[el.type].label,
        h("button", { class: "head-btn", type: "button", text: "Edit", onclick: () => openEditor(el.type, el.id) })),
      face, ctls, adds, facts,
      note ? group("Note", h("div", { class: "note-box", text: note })) : null,
      laps, hist,
      deleteRow("Delete " + nounOf(el), () => askDelete(el.id)),
    ], { kind: "detail", id });
    detail = { el, kind: "detail", time, sub, name: null, ring: ring && ring.querySelector(".bar"), dial, ctls, adds, facts, laps, hist, root: face, st: null, acts: null, factKeys: "", lapsKey: "", histKey: "" };
    paintDetail(Date.now());
  }

  function paintDetail(now) {
    const d = detail;
    if (!d) return;
    const el = d.el;
    if (!state.els[el.id]) return closeSheet();
    paintFace(d, now);
    const st = E.status(el) + "|" + el.cfg.mode + "|" + el.laps.length;
    if (d.cst !== st) {
      const was = d.cst == null ? null : (d.ctls.querySelector(".lbl") || {}).textContent;
      d.cst = st;
      d.ctls.replaceChildren(detailControls(el) || "");
      const lbl = d.ctls.querySelector(".lbl");
      if (was != null && lbl && lbl.textContent !== was) lbl.classList.add("swap");
      const add = (el.cfg.add || []).filter(() => E.runnable(el));
      const live = ["running", "paused", "done", "delay"].includes(el.run.st);
      d.adds.replaceChildren(add.length && live
        ? h("div", { class: "chips", style: `grid-template-columns:repeat(${Math.min(add.length, 4)},minmax(0,1fr))` }, add.map((sec) => h("button", { class: "chip", type: "button", text: addLabel(sec), onclick: () => act(el, "add", sec * 1000) })))
        : "");
    }
    const f = detailFacts(el, now);
    const keys = f.map((x) => x[0]).join("|");
    if (d.factKeys !== keys) {
      d.factKeys = keys;
      d.factNodes = f.map(([k, v]) => { const val = h("span", { text: v }); return [h("div", { class: "fact" }, h("span", { text: k }), val), val]; });
      d.facts.replaceChildren(...d.factNodes.map((x) => x[0]));
      d.facts.hidden = !f.length;
    } else {
      f.forEach(([, v], k) => { if (d.factNodes[k][1].textContent !== v) d.factNodes[k][1].textContent = v; });
    }
    if (el.type === "stopwatch") {
      const key = el.laps.length + "|" + el.results.length;
      if (d.lapsKey !== key) {
        d.lapsKey = key;
        const out = [];
        if (el.laps.length) {
          const rows = [h("div", { class: "lap head" }, h("span", { text: "Lap" }), h("span", { text: "Lap time" }), h("span", { text: "Total" }))];
          for (let k = el.laps.length - 1; k >= 0; k--) {
            rows.push(h("div", { class: "lap" }, h("span", { text: String(k + 1) }),
              h("span", { text: E.fmtStopwatch(el.laps[k] - (el.laps[k - 1] || 0)) }), h("span", { text: E.fmtStopwatch(el.laps[k]) })));
          }
          out.push(group("Laps", rows));
        }
        if (el.cfg.mode === "multiple") {
          out.push(group("Measurements", el.results.length
            ? el.results.map((m, k) => h("div", { class: "lap" }, h("span", { text: String(el.results.length - k) }),
              h("span", { text: E.fmtStopwatch(m.ms) }), h("span", { text: m.laps.length ? m.laps.length + " laps" : E.fmtTime(m.at, now) })))
            : h("div", { class: "list-empty", text: "Each reset keeps the result here." })));
        }
        d.laps.replaceChildren(...out.flat());
      }
    }
    const hkey = el.hist.length + "|" + (el.hist[0] ? el.hist[0].end : "");
    if (E.runnable(el) && d.histKey !== hkey) {
      d.histKey = hkey;
      const fmt = el.type === "stopwatch" ? E.fmtStopwatch : E.fmtElapsed;
      const clear = el.hist.length ? deleteRow("Remove History", () => askClearHistory(el)) : [];
      d.hist.replaceChildren(...group("History", el.hist.length
        ? el.hist.slice(0, 12).map((x) => h("div", { class: "fact" }, h("span", { text: E.fmtTime(x.start, now) }), h("span", { text: `${fmt(x.ms)} · ${x.result}` })))
        : h("div", { class: "list-empty", text: "Every run shows up here once it ends." })), ...clear.filter(Boolean));
    }
  }

  async function askClearHistory(el) {
    const yes = await dialog({ title: `Remove the history of ${nameOf(el)}?`, text: "Its past runs are removed.", ok: "Remove", danger: true });
    const cur = state.els[el.id];
    if (!yes || !cur) return;
    cur.hist = [];
    persist();
    if (detail) paintDetail(Date.now());
  }

  // ------------------------------------------------------------ boards
  // A new board gets its name first; Cancel makes nothing.
  function openNewBoard() {
    closeDrawer();
    const fallback = "Board " + (state.boards.length + 1);
    const input = h("input", { class: "text-in", type: "text", placeholder: fallback, maxlength: "40", "aria-label": "Board name" });
    const add = () => {
      const b = newBoard(input.value.trim() || fallback);
      state.boards.push(b);
      state.active = b.id;
      closeSheet();
      $("#content").scrollTop = 0;
      renderDeck();
      persist();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    openSheet([
      sheetHead("New board", "Each board is its own set of timers."),
      h("div", { class: "field" }, h("div", { class: "field-label", text: "Name" }), input),
      h("div", { class: "sheet-actions" }, h("div", { class: "spacer" }),
        h("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        h("button", { class: "btn btn-accent", type: "button", text: "Add", onclick: add })),
    ], { kind: "boards" });
    if (!isIOS) setTimeout(() => input.focus(), 30);
  }

  // The open board: rename it as you type, or delete it.
  function openBoardSheet(b) {
    closeDrawer();
    const input = h("input", { class: "text-in", type: "text", value: b.name, maxlength: "40", "aria-label": "Board name" });
    input.addEventListener("input", () => { b.name = input.value.trim() || "Board"; renderToolbar(); persist(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") closeSheet(); });
    const n = b.items.filter((id) => state.els[id]).length;
    openSheet([
      sheetHead("Board", n === 1 ? "1 item on it" : n + " items on it"),
      h("div", { class: "field" }, h("div", { class: "field-label", text: "Name" }), input),
      h("div", { class: "sheet-actions" },
        h("button", { class: "btn btn-danger wide-btn", type: "button", text: "Delete Board", onclick: () => removeBoard(b, closeSheet) }),
        h("div", { class: "spacer" }),
        h("button", { class: "btn btn-accent", type: "button", text: "Done", onclick: closeSheet })),
    ], { kind: "boards" });
  }

  async function removeBoard(b, redraw) {
    if (state.boards.length === 1) return alertBox("This is the only board", "Clock Yard needs at least one board. Add another before deleting this one.");
    const n = b.items.length;
    const yes = await dialog({
      title: `Delete the board ${b.name}?`,
      text: n ? `Its ${n === 1 ? "1 item is" : n + " items are"} deleted with it. This can't be undone.` : "It has nothing on it.",
      ok: "Delete Board", danger: true,
    });
    if (!yes) return;
    const cur = state.boards.find((x) => x.id === b.id);
    if (!cur) return redraw();
    for (const id of cur.items) { dismissRing(id); delete state.els[id]; }
    state.boards = state.boards.filter((x) => x.id !== b.id);
    for (const el of Object.values(state.els)) if (el.type === "container" && el.cfg.board === b.id) el.cfg.board = "";
    if (state.active === b.id) state.active = state.boards[0].id;
    renderDeck();
    persist();
    redraw();
  }

  $("#sideAdd").addEventListener("click", openNewBoard);
  // The header's soft edge shows once the deck scrolls under it.
  $("#content").addEventListener("scroll", (e) => { $("#header").classList.toggle("scrolled", e.target.scrollTop > 2); }, { passive: true });
  $("#sortSelect").addEventListener("change", (e) => { board().sort = e.target.value; renderDeck(); persist(); });
  $("#viewSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    board().view = btn.dataset.view;
    renderDeck();
    persist();
  });
  $("#addBtn").addEventListener("click", openNew);
  $("#fab").addEventListener("click", openNew);

  // ------------------------------------------------------------ settings
  function openSettings() {
    const rows = [];
    rows.push(...syncBlock());
    rows.push(...group("Display",
      switchRow("Show app usage", "How much this app is using, shown at the bottom of the window.", metricsOn, applyMetrics)));
    rows.push(...group("Alerts",
      selectRow("Alert volume", "How loud alarms ring while Clock Yard is open.", VOLUMES, String(VOLUMES.reduce((b, v) => (Math.abs(Number(v[0]) - volume) < Math.abs(Number(b[0]) - volume) ? v : b))[0]),
        (v) => { volume = Number(v); store.set("volume", v); playSound("chime"); })));
    if (isIOS && LIC.store) {
      rows.push(...group("Purchase", tapRow("Restore Purchases", () => restoreUnlock(null))));
    }
    if (isIOS) {
      rows.push(...group("Support",
        tapRow("Report Issue", () => openUrl(LINKS.report), true),
        tapRow("Discussions", () => openUrl(LINKS.discussions), true),
        tapRow("Feature Request", () => openUrl(LINKS.feature), true)));
    }
    const actions = h("div", { class: "sheet-actions" },
      isMac && LIC.store ? h("button", { class: "btn wide-btn", type: "button", text: "Restore Purchases", onclick: () => restoreUnlock(null) }) : null,
      h("div", { class: "spacer" }),
      h("button", { class: "btn btn-accent", type: "button", text: "Done", onclick: closeSheet }));
    openSheet([sheetHead("Settings"), rows, actions], { kind: "settings" });
  }
  function tapRow(label, onClick, out) {
    const r = h("div", { class: "row tap", role: "button", tabindex: "0", onclick: onClick,
      onkeydown: (e) => { if (e.key === "Enter") onClick(); } },
    h("div", { class: "row-label", text: label }), out ? h("span", { class: "arrow-out" }) : null);
    return r;
  }
  $("#settingsBtn").addEventListener("click", openSettings);

  // ------------------------------------------------------------ welcome
  function openWelcome() {
    const input = h("input", { class: "text-in", type: "text", placeholder: "Your first timer", maxlength: "80", "aria-label": "Name of your first timer" });
    const add = () => {
      const name = input.value.trim();
      closeSheet();
      setTimeout(() => openEditor("countdown", null, { name }), 60);
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    openSheet([
      h("div", { class: "buy-page-icon", style: "width:64px;height:64px;border-radius:32px;margin:6px auto 0", html: I.mark.replace(/width="46" height="46"/, 'width="34" height="34"') }),
      h("div", { class: "sheet-title", style: "text-align:center;white-space:normal", text: "What do you want to time?" }),
      h("div", { class: "sheet-text", style: "text-align:center;margin-top:-8px", text: "Add your first timer!" }),
      input,
      h("div", { class: "sheet-actions even" }, h("div", { class: "spacer" }),
        h("button", { class: "btn", type: "button", text: "Not Now", onclick: closeSheet }),
        h("button", { class: "btn", type: "button", text: "Import Sync Code", onclick: openWelcomeImport }),
        h("button", { class: "btn btn-accent", type: "button", text: "Add", onclick: add })),
    ], { kind: "welcome" });
    if (!isIOS) setTimeout(() => input.focus(), 30);
  }

  // The welcome's code box: the timers saved under the code come down here.
  function openWelcomeImport() {
    const input = h("input", { class: "text-in sync-input", type: "text", placeholder: "XXXX-XXXX-XXXX-XXXX", maxlength: "24",
      autocomplete: "off", autocapitalize: "characters", spellcheck: "false", "aria-label": "Sync code" });
    const note = h("div", { class: "sync-note", role: "status" });
    const join = h("button", { class: "btn btn-accent", type: "button", text: "Join" });
    const go = async () => {
      join.disabled = true;
      note.classList.remove("bad");
      note.textContent = "Looking for that code...";
      await joinSync(input.value);
      join.disabled = false;
      if (cloud.code === cleanCode(input.value)) return closeSheet();
      note.textContent = cloud.note;
      note.classList.toggle("bad", cloud.noteBad);
    };
    join.addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    openSheet([
      h("div", { class: "buy-page-icon", style: "width:64px;height:64px;border-radius:32px;margin:6px auto 0", html: I.mark.replace(/width="46" height="46"/, 'width="34" height="34"') }),
      h("div", { class: "sheet-title", style: "text-align:center;white-space:normal", text: "Import Sync Code" }),
      h("div", { class: "sheet-text", style: "text-align:center;margin-top:-8px", text: "Type the code shown in Clock Yard's Settings on your other device." }),
      input,
      note,
      h("div", { class: "sheet-actions" }, h("div", { class: "spacer" }),
        h("button", { class: "btn", type: "button", text: "Back", onclick: openWelcome }),
        join),
    ], { kind: "welcome" });
    if (!isIOS) setTimeout(() => input.focus(), 30);
  }

  // ------------------------------------------------- trial and purchase
  const STORE_UNREACHABLE = "Can't connect to the App Store. Check your internet connection and try again.";
  const CANCEL_NOTE = "Purchase canceled.";
  const NOT_STORE = "Purchases only work in the App Store version of Clock Yard.";
  const LIC = {
    store: isApple && !!TAURI, live: false, owned: false, trialStartMs: 0, clockAhead: 0, price: "", screen: null, preview: false,
  };
  const isUserCancel = (e) => /cancel/i.test(String(e || ""));
  function friendlyStoreError(e) {
    const t = errText(e);
    if (t === NOT_STORE || /free trial has ended/i.test(t)) return t;
    return STORE_UNREACHABLE;
  }

  function applyStatus(s) {
    LIC.live = !!(s && s.storeReady);
    LIC.clockAhead = Math.max(0, Number(s && s.nowMs || 0) - Date.now());
    if (LIC.live) {
      LIC.owned = !!s.owned;
      LIC.trialStartMs = Number(s.trialStartMs) || 0;
    }
  }

  async function refreshStore() {
    try { applyStatus(await invoke("iap_status")); } catch { LIC.live = false; }
    try { LIC.price = (await invoke("iap_price")) || ""; } catch {}
  }

  async function initLicensing() {
    if (!LIC.store) { LIC.owned = true; computeAccessAndUI(); return; }
    if (devBuild) {
      let dev = null;
      try { dev = localStorage.getItem("clockyard_dev_license"); } catch {}
      if (dev) {
        LIC.preview = true;
        LIC.live = true;
        const [mode, flag] = dev.split(":");
        LIC.price = flag === "noprice" ? "" : "$4.99";
        LIC.owned = mode === "owned";
        LIC.trialStartMs = mode === "trial" ? Date.now() - 2 * 86400000 : mode === "expired" ? Date.now() - 8 * 86400000 : 0;
        if (mode === "silent") LIC.live = false;
        computeAccessAndUI();
        return;
      }
    }
    await refreshStore();
    computeAccessAndUI();
  }

  function trialLeftMs() {
    return LIC.trialStartMs + TRIAL_DAYS * 86400000 - (Date.now() + LIC.clockAhead);
  }

  // True when the deck may be used now. Anything that adds or starts a timer
  // asks first, so an ended trial opens the purchase page instead.
  function canUse() {
    if (!LIC.store || LIC.owned || !LIC.live) return true;
    if (LIC.trialStartMs > 0 && trialLeftMs() > 0) return true;
    computeAccessAndUI();
    return false;
  }

  function computeAccessAndUI() {
    const bar = $("#trialBar");
    const text = $("#trialText");
    const buy = $("#trialBuy");
    if (!LIC.store || LIC.owned) {
      bar.hidden = true;
      if (LIC.screen) closeBuyPage();
      return;
    }
    if (!LIC.live) {
      if (LIC.screen && LIC.screen !== "offer") closeBuyPage();
      text.textContent = "Clock Yard is a one-time purchase";
      buy.textContent = "Buy Clock Yard";
      buy.onclick = () => openOffer();
      bar.hidden = LIC.screen === "start" || LIC.screen === "paywall";
      return;
    }
    if (LIC.trialStartMs > 0) {
      const left = trialLeftMs();
      if (left > 0) {
        if (LIC.screen && LIC.screen !== "offer") closeBuyPage();
        const days = Math.max(1, Math.ceil(left / 86400000));
        text.textContent = days === 1 ? "1 day left in your free trial" : `${days} days left in your free trial`;
        buy.textContent = LIC.price ? "Buy for " + LIC.price : "Buy";
        buy.onclick = () => buyUnlock(null);
        bar.hidden = false;
        return;
      }
      bar.hidden = true;
      showBuyPage("paywall");
      return;
    }
    bar.hidden = true;
    showBuyPage("start");
  }

  async function openOffer() {
    showBuyPage("offer");
    if (LIC.preview) return;
    await refreshStore();
    if (LIC.screen === "offer") showBuyPage("offer");
    computeAccessAndUI();
  }

  const BENEFITS = [
    "Countdowns, intervals and Pomodoro",
    "Alerts even when the app is closed",
    "List and grid views on every board",
    "History of every run",
  ];
  const WHAT_STOPS = "running your timers";

  function buyMsg() { return $("#buyPage .buy-page-msg"); }
  function showLicenseNote(el, t) { if (!el) return alertBox("Clock Yard", t); el.textContent = t; el.classList.add("note"); }
  function showLicenseError(el, t) { if (!el) return alertBox("Clock Yard", t); el.textContent = t; el.classList.remove("note"); }

  function showBuyPage(kind) {
    const page = $("#buyPage");
    LIC.screen = kind;
    const price = LIC.price;
    const icon = h("div", { class: "buy-page-icon", html: I.mark });
    const title = kind === "start" ? "Clock Yard" : kind === "paywall" ? "Your free trial has ended" : "Buy Clock Yard";
    const line = kind === "start"
      ? "Every kind of timer on one deck, with alerts that ring while the app is closed." + (price ? "" : " You pay once.")
      : `Buy Clock Yard to keep ${WHAT_STOPS}.` + (price ? "" : " You pay once.");
    const intro = [icon, h("h2", { class: "buy-page-title", text: title }), h("p", { class: "buy-page-line", text: line })];
    const priceBox = price ? h("div", { class: "buy-page-price" },
      h("span", { class: "buy-page-plan", text: "Lifetime" }), h("strong", { text: price }), h("span", { class: "buy-page-paid", text: "Paid once. Not a subscription." })) : null;
    const steps = kind === "start" ? h("ol", { class: "buy-page-steps" },
      h("li", null, h("strong", { text: "Today" }), h("span", { text: `Every feature, free for ${TRIAL_DAYS} days.` })),
      h("li", null, h("strong", { text: `Day ${TRIAL_DAYS}` }), h("span", { text: "The free trial ends. Nothing is charged." })),
      h("li", null, h("strong", { text: "After that" }), h("span", { text: "Timers and alerts stop until you buy Clock Yard." }))) : null;
    const benefits = h("ul", { class: "buy-page-benefits" }, BENEFITS.map((b) => h("li", null, h("span", { class: "buy-page-tick", html: I.tick }), b)));
    const msg = h("p", { class: "buy-page-msg", "aria-live": "polite" });
    const mainLabel = kind === "start" ? "Start Free Trial" : price ? "Buy for " + price : "Buy Clock Yard";
    const main = h("button", { class: "buy-page-main", type: "button", text: mainLabel,
      onclick: () => (kind === "start" ? startTrial() : buyUnlock(buyMsg)) });
    const small = kind === "start" ? h("p", { class: "buy-page-small", text: "Nothing is charged automatically." }) : null;
    const restore = h("button", { class: "buy-page-restore", type: "button", text: "Restore Purchases", onclick: () => restoreUnlock(buyMsg) });
    const close = kind === "offer" ? h("button", { class: "buy-page-close", type: "button", "aria-label": "Not Now", html: I.close, onclick: closeBuyPage }) : null;

    page.classList.toggle("mac", isMac);
    if (isMac) {
      page.replaceChildren(close || "",
        h("div", { class: "buy-mac" },
          h("div", { class: "buy-mac-left" }, intro, benefits),
          h("div", { class: "buy-mac-right" }, priceBox, steps, main, small, restore, msg)));
    } else {
      page.replaceChildren(
        h("div", { class: "buy-page-top" + (close ? " with-close" : "") }, close),
        h("div", { class: "buy-page-scroll" }, h("div", { class: "buy-page-col" }, intro, priceBox, steps, benefits)),
        h("div", { class: "buy-page-bottom" }, h("div", { class: "buy-page-col" }, msg, main, small, restore)));
    }
    page.classList.remove("closing");
    page.hidden = false;
    $("#trialBar").hidden = true;
  }

  function closeBuyPage() {
    const page = $("#buyPage");
    if (page.hidden) { LIC.screen = null; return; }
    LIC.screen = null;
    page.classList.add("closing");
    page.hidden = true;
    setTimeout(() => page.classList.remove("closing"), 220);
    computeAccessAndUI();
  }

  async function startTrial() {
    const msg = buyMsg();
    const btn = $("#buyPage .buy-page-main");
    btn.disabled = true;
    try {
      if (LIC.preview) { LIC.trialStartMs = Date.now(); }
      else { await invoke("iap_start_trial"); await refreshStore(); }
      computeAccessAndUI();
    } catch (e) {
      if (isUserCancel(e)) showLicenseNote(msg, CANCEL_NOTE);
      else showLicenseError(msg, friendlyStoreError(e));
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  }

  async function buyUnlock(msgFn) {
    const msg = msgFn ? msgFn() : null;
    const btn = msgFn ? $("#buyPage .buy-page-main") : $("#trialBuy");
    if (btn) btn.disabled = true;
    try {
      if (LIC.preview) LIC.owned = true;
      else { await invoke("iap_buy"); await refreshStore(); }
      computeAccessAndUI();
    } catch (e) {
      if (isUserCancel(e)) showLicenseNote(msg, CANCEL_NOTE);
      else showLicenseError(msg, friendlyStoreError(e));
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  }

  async function restoreUnlock(msgFn) {
    const msg = msgFn ? msgFn() : null;
    try {
      if (!LIC.preview) {
        await invoke("iap_restore");
        const s = await invoke("iap_status");
        if (!s || !s.storeReady) return showLicenseError(msg, STORE_UNREACHABLE);
        applyStatus(s);
      }
      computeAccessAndUI();
      const after = LIC.screen ? buyMsg() : msg;
      if (LIC.owned) showLicenseNote(after, "Purchase restored.");
      else showLicenseNote(after, "No purchase found for this Apple ID.");
    } catch (e) {
      if (isUserCancel(e)) showLicenseNote(msg, CANCEL_NOTE);
      else showLicenseError(msg, friendlyStoreError(e));
    }
  }

  // ------------------------------------------------------------ search
  // Finds a timer on any board by its name; picking one opens it.
  function openSearch() {
    if (LIC.screen) return;
    closeDrawer();
    const input = h("input", { class: "text-in", type: "text", placeholder: "Search timers", maxlength: "80", "aria-label": "Search timers",
      autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search" });
    const list = h("div", { class: "sheet-part" });
    const pick = (id, boardId) => {
      closeSheet();
      if (state.active !== boardId) switchBoard(boardId);
      setTimeout(() => openDetail(id), 60);
    };
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const hits = [];
      for (const b of state.boards) {
        for (const id of b.items) {
          const el = state.els[id];
          if (el && (!q || nameOf(el).toLowerCase().includes(q))) hits.push([el, b]);
        }
      }
      hits.sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])));
      list.replaceChildren(...(hits.length
        ? group(null, hits.map(([el, b]) => h("div", { class: "row tap", role: "button", tabindex: "0",
            onclick: () => pick(el.id, b.id), onkeydown: (e) => { if (e.key === "Enter") pick(el.id, b.id); } },
          h("div", { class: "row-text" },
            h("div", { class: "row-label", text: nameOf(el) }),
            h("div", { class: "row-desc", text: b.name + " · " + E.TYPES[el.type].label })))))
        : [h("div", { class: "list-empty", text: q ? "No timer has that name." : "No timers yet." })]).filter(Boolean));
    };
    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const first = list.querySelector(".row");
      if (first) first.click();
    });
    draw();
    openSheet([sheetHead("Search"), input, list], { kind: "search" });
    if (!isIOS) setTimeout(() => input.focus(), 30);
  }
  $("#searchBtn").addEventListener("click", openSearch);

  // ------------------------------------------------------------ keyboard
  document.addEventListener("keydown", (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (e.key === "Escape") {
      if (dialogDone) { dialogDone(false); return; }
      if (!overlay.hidden) { closeSheet(); return; }
      if (LIC.screen === "offer") { closeBuyPage(); return; }
      if (drawerOpen()) { closeDrawer(); return; }
      if (swipeOpen) closeSwipe();
      return;
    }
    if (LIC.screen || (WEB && !cloud.code)) return;
    if (mod && e.key === ",") { e.preventDefault(); openSettings(); }
    else if (mod && (e.key === "n" || e.key === "N")) { e.preventDefault(); if (!isIOS) openNew(); }
    else if (mod && (e.key === "f" || e.key === "F")) { e.preventDefault(); openSearch(); }
  });

  // Entering full screen on a Mac can leave the new area unpainted until
  // something forces a redraw, so force one on every resize.
  let repaintQueued = false;
  window.addEventListener("resize", () => {
    if (repaintQueued) return;
    repaintQueued = true;
    requestAnimationFrame(() => {
      const app = document.getElementById("app");
      app.style.display = "none";
      void app.offsetHeight;
      app.style.display = "";
      repaintQueued = false;
    });
  });

  // Back from the background: catch up at once and fetch what the other
  // devices did. On the way out: save, and send anything not sent yet.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (saveTimer) saveNow();
      if (cloud.dirty) pushNow(true);
    } else {
      tickAll();
      pullNow();
    }
  });
  window.addEventListener("focus", () => pullNow());
  window.addEventListener("blur", () => { if (cloud.dirty) pushNow(false); });
  window.addEventListener("pagehide", () => {
    if (saveTimer) saveNow();
    if (cloud.dirty) pushNow(true);
  });

  // ------------------------------------------------------------ start
  async function boot() {
    try { devBuild = (await invoke("dev_build")) === true; } catch { devBuild = false; }
    invoke("app_version").then((v) => { appVersionStr = v; updateBrandSub(); }).catch(() => {});
    applyMetrics(metricsOn);
    const firstRun = await loadState();
    if (WEB) cloud.code = await loadSyncCode();
    // Catch up on everything that happened while the app was closed.
    const now = Date.now();
    for (const el of Object.values(state.els)) E.tick(el, now, () => {});
    renderDeck();
    doSync();
    setInterval(tickAll, 250);
    await initLicensing();
    cloud.code = await loadSyncCode();
    if (cloud.code) {
      if (savedSync && savedSync.code === cloud.code) {
        cloud.stamp = Number(savedSync.stamp) || 0;
        cloud.dirty = !!savedSync.dirty;
      }
      cloud.state = "idle";
      pullNow();
    }
    // While the app is on screen, the other devices' changes are fetched
    // every 30 seconds as well as on focus.
    setInterval(() => { if (!document.hidden) pullNow(); }, 30000);
    const b = board();
    if (!WEB && (firstRun || !Object.keys(state.els).length) && !b.items.length && !LIC.screen) openWelcome();
  }

  // The browser's own right-click menu stays where words can be typed or
  // selected; everywhere else it only offered Refresh, Save As and Print.
  // `tauri dev` keeps it everywhere, for Inspect.
  document.addEventListener("contextmenu", (e) => {
    if (devBuild) return;
    if (e.target.closest("input, textarea, [contenteditable='true']")) return;
    if (String(window.getSelection())) return;
    e.preventDefault();
  });

  boot();
})();
