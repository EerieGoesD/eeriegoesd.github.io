// Web copy of the desktop app's script (bear-in-mind/src/main.js).
// platform.js answers its invoke() calls from the browser. The only changes
// from the original: never Android, never a store build, the size line says
// Storage, and the empty list points at the Windows app.

// Opened straight in a browser (the dev preview) there is no Tauri; every call
// then fails quietly instead of the whole script stopping on this line.
const TAURI = window.__TAURI__ || null;
const invoke = TAURI
  ? TAURI.core.invoke
  : () => Promise.reject(new Error("Not running inside the app."));

const $ = (id) => document.getElementById(id);

// Android's WebView always names Android in its user agent. theme.js has
// already tagged the page before the first paint; this is the same test.
const isAndroid = false;
document.documentElement.classList.toggle("android", isAndroid);

// The website's copy of this script sets this to true (eeriegoesd.com).
const inBrowser = true;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// A phone has a screen, not a window.
if (isAndroid) {
  $("usageDesc").textContent = "How much this app is using, shown at the bottom of the screen.";
}

// A small element maker for the rows and the search results. Text always goes
// in as text, never as markup.
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid);
  }
  return el;
}

// A window going away plays its way out before it is gone. The hidden flag is
// set at once, so everything that asks "is it open?" gets the right answer.
function openWithMotion(el) {
  el._seq = (el._seq || 0) + 1;
  el.classList.remove("closing");
  el.hidden = false;
}

function closeWithMotion(el, ms) {
  if (el.hidden) return;
  const seq = (el._seq = (el._seq || 0) + 1);
  el.classList.add("closing");
  el.hidden = true;
  setTimeout(() => {
    if (el._seq === seq) el.classList.remove("closing");
  }, ms || 240);
}

// A control whose icon or word just changed pops, so the change is seen.
function pop(el, cls) {
  if (!el || reduceMotion.matches) return;
  const c = cls || "swap";
  el.classList.remove(c);
  void el.offsetWidth;
  el.classList.add(c);
  setTimeout(() => el.classList.remove(c), 600);
}

// A name in a question or a note, cut short when it is long.
function shortName(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 48 ? t.slice(0, 47).trimEnd() + "…" : t;
}

// Every stored thing is { id, text, details, done, at, doneAt }, plus on
// Android { remindAt, nid } when it has a reminder: the time as an ISO string
// and the notification's number. Newest first.
let items = [];
let settings = { metricsOn: true, progressOn: true, doneCollapsed: false };

// Reminders ring through Android's notifications (src-tauri/src/reminders.rs).
// The desktop has no reminders.
const REMINDERS = isAndroid;

// The list has been read. The welcome sheet waits for it, so it never shows
// over a list that simply has not arrived yet.
let loaded = false;
// The welcome sheet shows once per launch, when the list is empty.
let firstRunShown = false;

// Which rows are showing their whole description rather than the first few
// lines. Kept out of the saved file: it is how you are looking at the list
// right now, not part of the list.
const opened = new Set();

let appVersionStr = "";
let cpuStr = "";
let ramStr = "";
let cacheSizeStr = "";
let metricsOn = true;
let progressOn = true;

// ---------------------------------------------------------------------------
// How much of the list is ticked off
// ---------------------------------------------------------------------------
// 0% is red, 50% is amber, 100% is green: a straight hue ramp.
function progressHue(pct) {
  return Math.round(pct * 1.2);
}

// The line under the title says what is on the list.
function updateMeta() {
  const doneCount = items.filter((i) => i.done).length;
  $("boardMeta").textContent = items.length
    ? items.length - doneCount + " to do · " + doneCount + " done"
    : "Nothing on your list yet";
}

function updateProgress() {
  updateMeta();
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

  const doneCount = items.filter((i) => i.done).length;
  $("brandCount").textContent = items.length
    ? doneCount + " of " + items.length + " done"
    : "Nothing on your list yet";
  bar.classList.toggle("no-items", !items.length);

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
  '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="4.5" fill="currentColor"/>' +
  '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.22 5.22l1.84 1.84M16.94 16.94l1.84 1.84M18.78 5.22l-1.84 1.84M7.06 16.94l-1.84 1.84"/>' +
  "</g></svg>";
const MOON_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z" fill="currentColor"/>' +
  "</svg>";

function applyTheme(changed) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("bim.theme", theme);
  } catch {}
  const btn = $("themeToggle");
  if (btn) {
    btn.innerHTML = theme === "dark" ? SUN_ICON : MOON_ICON;
    btn.title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    if (changed) pop(btn);
  }
  // Syncs the native title bar, which otherwise stays dark around a light app.
  invoke("set_window_theme", { theme }).catch(() => {});
}
applyTheme();

// ---------------------------------------------------------------------------
// The usage line in the footer's left corner: version, CPU, memory, cache size
// ---------------------------------------------------------------------------
function updateBrandSub() {
  const el = $("brandSub");
  if (!el) return;
  const parts = [];
  if (appVersionStr) parts.push("v" + appVersionStr);
  // The three figures show and hide together, on the one tickbox.
  if (metricsOn) {
    if (cpuStr) parts.push("CPU: " + cpuStr);
    if (ramStr) parts.push("RAM: " + ramStr);
    if (cacheSizeStr) parts.push("Storage: " + cacheSizeStr);
  }
  el.textContent = parts.join(" | ");
}

function formatBytes(n) {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function refreshCacheSize() {
  invoke("cache_size")
    .then((n) => {
      cacheSizeStr = formatBytes(n);
      updateBrandSub();
    })
    .catch(() => {});
}

// Walking the folder is not free, so a burst of saves becomes one recount.
let cacheTimer = null;
function scheduleCacheSize() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(refreshCacheSize, 50);
}

function refreshUsage() {
  invoke("usage")
    .then(([cpu, ram]) => {
      cpuStr = cpu;
      ramStr = ram;
      updateBrandSub();
    })
    .catch(() => {});
}

// Two seconds: faster makes the numbers jitter and adds cost to the very thing
// being measured, slower feels dead. Nothing is measured while it is hidden.
setInterval(() => {
  if (metricsOn) {
    refreshUsage();
    refreshCacheSize();
  }
}, 2000);

// ---------------------------------------------------------------------------
// Saying so when something goes wrong, rather than showing an empty list. An
// error stays in the strip until the next thing works; it never goes away by
// itself.
// ---------------------------------------------------------------------------
function showProblem(message) {
  const el = $("problem");
  el.textContent = message;
  el.hidden = false;
}

// Something that worked. A silent success looks the same as nothing
// happening, so it gets a note at the bottom that goes by itself.
function showNote(message) {
  snack(message);
}

function clearProblem() {
  const el = $("problem");
  el.textContent = "";
  el.hidden = true;
}

// ---------------------------------------------------------------------------
// The note at the bottom. One line, gone by itself, with at most one action
// (Undo after a delete). On Android the add button lifts out of its way.
// ---------------------------------------------------------------------------
let snackTimer = null;
let snackFn = null;

function snack(text, actionLabel, action) {
  clearTimeout(snackTimer);
  const s = $("snack");
  $("snackText").textContent = text;
  const btn = $("snackAction");
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel || "";
  snackFn = action || null;
  // A note that replaces another comes in again, so the change is seen.
  if (!s.hidden) {
    s.style.animation = "none";
    void s.offsetWidth;
    s.style.animation = "";
  }
  openWithMotion(s);
  document.documentElement.classList.add("snack-on");
  snackTimer = setTimeout(hideSnack, action ? 5000 : 3500);
}

function hideSnack() {
  clearTimeout(snackTimer);
  snackFn = null;
  document.documentElement.classList.remove("snack-on");
  closeWithMotion($("snack"), 200);
}

// ---------------------------------------------------------------------------
// A small question over everything: "Delete Tea?" with Cancel and the action.
// The destructive button is never the default; Cancel has the focus, and Esc,
// Back and a click outside all answer Cancel.
// ---------------------------------------------------------------------------
let dialogDone = null;

// `paras` (paragraphs) instead of `text` for a longer message, `cancel` for a
// word other than Cancel, `accent` when the action loses nothing, and
// `welcome` for the wider first-launch window.
function dialog({ title, text, ok, paras, cancel, accent, welcome }) {
  return new Promise((resolve) => {
    if (dialogDone) dialogDone(false);
    dialogDone = (yes) => {
      dialogDone = null;
      closeWithMotion($("dialogOverlay"), 220);
      syncBack();
      resolve(yes);
    };
    $("dialogTitle").textContent = title;
    const body = $("dialogText");
    body.textContent = "";
    if (paras) body.append(...paras.map((p) => h("p", {}, p)));
    else body.textContent = text || "";
    body.hidden = !text && !paras;
    $("dialog").classList.toggle("welcome", !!welcome);
    $("dialogCancel").textContent = cancel || "Cancel";
    $("dialogOk").className = "btn " + (accent ? "btn-accent" : "btn-danger");
    $("dialogOk").textContent = ok;
    openWithMotion($("dialogOverlay"));
    syncBack();
    $("dialogCancel").focus();
  });
}

// ---------------------------------------------------------------------------
// Android: 15 days free, then one purchase on Google Play for lifetime use.
// The App Store recipe (app_related/apple/free_trial_model.txt), wording and
// layout included, with one difference: Play has no $0 product, so the trial
// start lives on the EERIE Worker, keyed by a hash of the phone's Android ID
// (licensing.rs says how). Windows is a paid app and none of this runs there.
// ---------------------------------------------------------------------------
// 15, not 7: Google's closed test runs 14 days, and a 7-day trial would lock the
// testers out halfway through it.
const TRIAL_DAYS = 15; // MUST match TRIAL_MS in licensing.rs
const DAY_MS = 86400000;
const APP_NAME = "Bear in Mind";
// What stops when the trial ends, in the user's words: exactly what the
// backend gate (licensing::has_access) refuses, which is saving the list,
// export and import.
const STOPS = "adding, ticking and changing items";

// The same strings are defined in licensing.rs; keep the two identical.
const STORE_UNREACHABLE =
  "Can't connect to Google Play. Check your internet connection and try again.";
const NOT_STORE_BUILD = "Purchases only work in the Google Play version of Bear in Mind.";
const TRIAL_ENDED = "Your free trial has ended. Buy Bear in Mind to keep using it.";
const CANCEL_NOTE = "Purchase canceled.";
const PENDING_TEXT = "Your purchase is waiting for Google Play";

// Shows the screens without Play, e.g. on Windows. In the console:
//   localStorage.setItem("bim_dev_license", "start")   (or "trial", "expired",
//   "owned", "setup"), then reload. Never the real gate.
let devLicense = "";
try {
  devLicense = localStorage.getItem("bim_dev_license") || "";
} catch {}
const storeBuild = false;

let owned = !storeBuild;
let pending = false;
let trialStartMs = 0;
// Nothing is drawn until the first answer is in, so the start screen never
// flashes up for someone who has already bought the app.
let known = !storeBuild;
// Play answered that the product does not exist yet (before it is created in
// Play Console). The one state that leaves the app open, and only in a test
// build: the Play build judges that answer like offline, since a re-signed copy
// gets it too (licensing.rs, evaluate). Offline is NOT this: offline, the last
// answers kept on the phone are judged exactly as fresh ones.
let setupPhase = false;
// True once Play (and the Worker) have answered this launch, so the start-up
// retries can stop.
let playAnswered = false;
// The Worker's clock minus the phone's, from the last answer (offline: the
// latest time ever seen). The days left count on that, so setting the phone's
// clock back buys nothing.
let clockOffset = 0;
let unlockPrice = "";
let busy = false;
let offerOpen = false;
// The buy popup opens by itself once per launch, until the app is bought.
let launchOfferShown = false;
let card = ""; // "", "start", "paywall" or "offer"

function applyDevLicense() {
  setupPhase = devLicense === "setup";
  owned = devLicense === "owned";
  pending = false;
  trialStartMs =
    devLicense === "trial"
      ? Date.now() - 2 * DAY_MS
      : devLicense === "expired"
        ? Date.now() - (TRIAL_DAYS + 1) * DAY_MS
        : 0;
  unlockPrice = setupPhase ? "" : "€1.99";
  known = true;
}

function isUserCancel(e) {
  return /cancel/i.test(String(e || ""));
}

// Play's own messages are not written for people. Only the app's own strings
// are shown as they are.
function friendlyStoreError(e) {
  const s = String(e || "").replace(/^Error:\s*/, "");
  if ([STORE_UNREACHABLE, NOT_STORE_BUILD, TRIAL_ENDED].includes(s)) return s;
  if (/not ready|connect|network|unavailable|product not found/i.test(s)) return STORE_UNREACHABLE;
  return "The purchase did not go through. Try again.";
}

// The message line hangs under the card, outside it, so a message never
// changes the card's height or moves its buttons.
function setLicMsg(text, isNote) {
  const el = $("licMsg");
  el.textContent = text;
  el.classList.toggle("note", !!isNote);
}

// Answers on the card when one is up, otherwise in the strip under the box.
function say(text, isNote) {
  if (card) setLicMsg(text, isNote);
  else if (isNote) showNote(text);
  else showProblem(text);
}

function trialEndsAt() {
  return trialStartMs + TRIAL_DAYS * DAY_MS;
}

function trialNow() {
  return Date.now() + clockOffset;
}

function computeAccessAndUI() {
  const was = card;
  card = "";

  if (storeBuild && known && !owned) {
    if (setupPhase) {
      // Open: the product does not exist yet.
    } else if (trialStartMs === 0) {
      card = "start";
    } else if (trialNow() >= trialEndsAt()) {
      card = "paywall";
    }
    if (!card && offerOpen) card = "offer";
  }
  if (card !== "offer") offerOpen = false;
  if (card !== was) setLicMsg("", false);
  // A purchase screen wins over Search.
  if (card) closeSearch();

  renderCard();
  renderSettingsBuy();
  if (pending && (card === "paywall" || card === "offer")) setLicMsg(PENDING_TEXT + ".", true);
  syncBack();
  // The welcome sheet waits for the purchase screens: it comes up once the
  // start screen or the buy popup is out of the way.
  maybeFirstRun();
  maybeWelcome();
}

// Until the app is bought, Settings opens with a highlighted line saying where
// the trial stands and the blue Buy button beside it. Gone once bought.
function renderSettingsBuy() {
  const show = storeBuild && known && !owned;
  $("menuBuy").hidden = !show;
  if (!show) return;
  let text = APP_NAME + " is a one-time purchase";
  if (pending) {
    text = PENDING_TEXT;
  } else if (!setupPhase && trialStartMs > 0 && trialNow() < trialEndsAt()) {
    const n = Math.max(1, Math.ceil((trialEndsAt() - trialNow()) / DAY_MS));
    text = n + (n === 1 ? " day" : " days") + " left in your free trial";
  }
  $("menuBuyText").textContent = text;
  $("btnBuy").disabled = busy;
}

// One full-screen page for all three. The start screen leads with "free" and
// shows how the trial runs; the price there is one line of small print, since
// nothing is being bought yet. Where something IS being bought (the ended
// trial and the offer) the price is the plan, large. Left out entirely when
// Play gave no price, never a placeholder.
function renderCard() {
  $("licenseOverlay").hidden = !card;
  if (!card) return;

  const start = card === "start";
  let daysLeft = 0;
  if (card === "offer" && !setupPhase && trialStartMs > 0) {
    daysLeft = Math.max(1, Math.ceil((trialEndsAt() - trialNow()) / DAY_MS));
  }

  $("licTitle").textContent = start
    ? "Try " + APP_NAME + " free for " + TRIAL_DAYS + " days"
    : card === "paywall"
      ? "Your free trial has ended"
      : daysLeft
        ? daysLeft + (daysLeft === 1 ? " day" : " days") + " left in your free trial"
        : "Buy " + APP_NAME;

  $("licText").textContent = start
    ? "Every feature included. No account, no card, no ads."
    : card === "paywall"
      ? "Unlock " + APP_NAME + " to keep " + STOPS + ". Your list is right where you left it."
      : "Unlock it now and keep " + STOPS + " for good.";

  // How the free trial runs, on the start screen only.
  $("licTimeline").hidden = !start;
  $("licTrialEnd").textContent = "Day " + TRIAL_DAYS;
  $("licAfter").textContent =
    (unlockPrice ? unlockPrice + " once" : "One payment") +
    " to keep " +
    STOPS +
    ". Not a subscription.";

  $("licPrice").hidden = start || !unlockPrice;
  $("licPriceAmount").textContent = unlockPrice;

  const main = $("licMain");
  main.textContent = start
    ? "Start Free Trial"
    : unlockPrice
      ? "Unlock for " + unlockPrice
      : "Buy " + APP_NAME;
  main.disabled = busy;

  // The start screen's timeline already says what it costs after the trial.
  $("licFine").textContent = start
    ? "Nothing is charged automatically."
    : "One payment through Google Play. No subscription.";

  $("licRestore").disabled = busy;
  // Only the offer has a way out. The start screen and the ended trial do not.
  $("licClose").hidden = card !== "offer";
  $("licenseOverlay").classList.toggle("has-close", card === "offer");
}

async function refreshLicense() {
  if (!storeBuild) return;
  if (devLicense) {
    computeAccessAndUI();
    return;
  }
  try {
    const s = await invoke("iap_status");
    playAnswered = !!s.storeReady || !!s.setup;
    setupPhase = !!s.setup;
    // Offline these are the last answers kept on the phone, judged the same
    // way as fresh ones.
    owned = !setupPhase && !!s.owned;
    pending = !!s.pending;
    trialStartMs = s.trialStartMs || 0;
    if (s.nowMs) clockOffset = s.nowMs - Date.now();
    known = true;
    if (s.storeReady && !unlockPrice) {
      unlockPrice = await invoke("iap_price").catch(() => "");
    }
  } catch {
    // Keep what was known; the next look tries again.
  }
  // Once per launch, the first time the answer is in: the buy popup, unless
  // the app is bought or a screen that cannot be closed is already up.
  if (known && !launchOfferShown) {
    launchOfferShown = true;
    if (!owned) offerOpen = true;
  }
  computeAccessAndUI();
}

async function startTrial() {
  if (busy) return;
  busy = true;
  computeAccessAndUI();
  let err = "";
  try {
    if (devLicense) {
      devLicense = "trial";
      trialStartMs = Date.now();
    } else {
      trialStartMs = await invoke("iap_start_trial");
    }
  } catch (e) {
    err = friendlyStoreError(e);
  }
  busy = false;
  computeAccessAndUI();
  if (err) say(err, false);
}

async function buyUnlock() {
  if (busy) return;
  busy = true;
  computeAccessAndUI();
  let msg = null;
  try {
    if (devLicense) {
      devLicense = "owned";
      owned = true;
    } else {
      owned = await invoke("iap_buy");
    }
  } catch (e) {
    msg = isUserCancel(e) ? [CANCEL_NOTE, true] : [friendlyStoreError(e), false];
  }
  busy = false;
  // Redraw first, message second: a redraw onto another card clears the line.
  computeAccessAndUI();
  if (msg) say(msg[0], msg[1]);
}

async function restoreUnlock() {
  if (busy) return;
  if (!card) toggleMenu(false);
  busy = true;
  computeAccessAndUI();
  let msg;
  try {
    if (devLicense) {
      owned = devLicense === "owned";
    } else {
      // An error unless Play answered, so "owned" here is Play's word, never
      // the cache's.
      owned = await invoke("iap_restore");
    }
    msg = owned ? ["Purchase restored.", true] : ["No purchase found for this Google account.", true];
  } catch (e) {
    msg = isUserCancel(e) ? [CANCEL_NOTE, true] : [STORE_UNREACHABLE, false];
  }
  busy = false;
  computeAccessAndUI();
  say(msg[0], msg[1]);
}

// Settings' "Buy Bear in Mind": straight to Play's purchase sheet.
function buyFromSettings() {
  toggleMenu(false);
  buyUnlock();
}

function closeOffer() {
  offerOpen = false;
  computeAccessAndUI();
}

// ---------------------------------------------------------------------------
// Loading and saving
// ---------------------------------------------------------------------------
async function loadAll() {
  try {
    const raw = await invoke("get_notes");
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : [];
    clearProblem();
    loaded = true;
  } catch (e) {
    items = [];
    showProblem(
      "Your list could not be opened, so nothing is shown. Adding something now would write over it. " +
        String(e)
    );
  }

  try {
    const raw = await invoke("get_settings");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") settings = { ...settings, ...parsed };
  } catch {
    // A settings file that will not read is not worth stopping for: the
    // defaults are fine and the next save writes a clean one.
  }

  // An unset value means a first run, and a first run comes out on.
  applyMetrics(settings.metricsOn !== false);
  applyProgress(settings.progressOn !== false);
  render();

  // Every reminder still to come is handed to Android again. The same number
  // replaces the same alarm, so this only fills in what is missing, such as
  // after the list came back from a phone backup.
  items.forEach(scheduleReminder);

  // Signed in: start by taking whatever the other devices have done.
  syncCode = (await invoke("sync_code").catch(() => "")) || "";
  syncEmail = (await invoke("sync_email").catch(() => "")) || "";
  if (loaded && syncCode) pullList(false);

  maybeFirstRun();
  maybeWelcome();
}

// True when the list reached the disk. Reminders are only set after that, so a
// save the trial gate refused never leaves an alarm behind for it.
async function save() {
  let ok = true;
  try {
    await invoke("set_notes", { data: JSON.stringify(items) });
    clearProblem();
  } catch (e) {
    ok = false;
    showProblem("That could not be saved to disk, so it will be gone when you close. " + String(e));
  }
  scheduleCacheSize();
  // Signed in: the change goes up to your other devices a moment later.
  if (ok && syncCode) {
    setDirty(true);
    schedulePush();
  }
  return ok;
}

async function saveSettings() {
  try {
    await invoke("set_settings", { data: JSON.stringify(settings) });
  } catch (e) {
    showProblem("Your settings could not be saved. " + String(e));
  }
  scheduleCacheSize();
}

// ---------------------------------------------------------------------------
// The account: the same list on every device you sign in on. Taskyard's
// recipe (app_related/tauri2/account_sync_database.txt), unchanged.
//
// The list is copied to and from the little service every EERIE app shares
// (the eerie-cloud-sync repo). The name on the end of the address keeps this
// app's lists apart from every other app's. An account is only a way to
// remember a sync code: signing in hands the code back, and the sync below
// does the rest. Nothing under the account knows it exists.
// ---------------------------------------------------------------------------
const SYNC_APP = "bear-in-mind";
const SYNC_HOST = "https://eerie-apps-sync.eeriegoesd.workers.dev";
const SYNC_URL = SYNC_HOST + "/data/" + SYNC_APP;
const ACCOUNT_URL = SYNC_HOST + "/account";
const UNREACHABLE = "Could not reach the sync service";

// Where the list lives on this device, for the wording.
const HERE = isAndroid ? "on this phone" : inBrowser ? "in this browser" : "on this computer";

let syncCode = "";
let syncEmail = "";

// The server's write time for the copy this device last saw, sent back with
// every save so a change made on the phone cannot be flattened by the
// computer. And whether this device has changes it has not sent yet. Both are
// kept between launches, so a change made just before the app closed still
// goes up next time instead of being replaced by the older copy up there.
let serverStamp = 0;
let syncDirty = false;
// Set from signing in until this device's notes are on the account's list.
// Kept between launches, so a sign-in that could not reach the service still
// adds them the next time it can.
let syncMerge = false;
try {
  serverStamp = Number(localStorage.getItem("bim.syncStamp")) || 0;
  syncDirty = localStorage.getItem("bim.syncDirty") === "1";
  syncMerge = localStorage.getItem("bim.syncMerge") === "1";
} catch {}

function setMerge(on) {
  syncMerge = on;
  try {
    localStorage.setItem("bim.syncMerge", on ? "1" : "0");
  } catch {}
}

function setStamp(n) {
  serverStamp = n;
  try {
    localStorage.setItem("bim.syncStamp", String(n));
  } catch {}
}

function setDirty(on) {
  syncDirty = on;
  try {
    localStorage.setItem("bim.syncDirty", on ? "1" : "0");
  } catch {}
}

// Turns the password into the key that actually travels. THE PASSWORD ITSELF
// NEVER LEAVES THIS DEVICE. Slow on purpose: this is the whole defence for a
// password someone could guess, and the service cannot do it (it gets a
// fraction of a second per request). The address is the salt, trimmed and
// lower-cased exactly as the service does.
async function passwordKey(email, password) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode("eerie-account|" + email.trim().toLowerCase()),
      iterations: 600000,
    },
    material,
    256
  );
  let raw = "";
  for (const b of new Uint8Array(bits)) raw += String.fromCharCode(b);
  return btoa(raw);
}

// One call to an account route. The app's name goes in here, never at the
// call sites, so no route can be sent without it. A refusal carries the
// service's own words, and whether the address still needs confirming.
async function accountCall(action, body) {
  const res = await fetch(ACCOUNT_URL + "/" + action, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app: SYNC_APP, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || UNREACHABLE);
    if (data.needsVerify) err.needsVerify = true;
    throw err;
  }
  return data;
}

// The list as it came from the server: only rows the app can draw.
function parseServerList(text) {
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  return list.filter(
    (i) => i && typeof i === "object" && typeof i.id === "string" && typeof i.text === "string"
  );
}

// Signing in adds this device's notes to the account's list, in front of it,
// the way Import does. A note already on the account (the same one, or the
// same words and description, as after an export and import) is not added
// twice.
function mergeLists(server, local) {
  const ids = new Set(server.map((i) => i.id));
  const key = (i) => String(i.text || "").trim() + "\u0000" + String(i.details || "").trim();
  const words = new Set(server.map(key));
  const extra = local.filter((i) => !ids.has(i.id) && !words.has(key(i)));
  return extra.concat(server);
}

// Takes whatever the server has. Changes this device had not sent yet are put
// aside in a file next to the list first, so nothing is ever thrown away.
// Right after signing in (`merge`), this device's notes are added to it
// instead, and the combined list goes up.
async function takeServerList(text, stamp, merge) {
  const fromServer = parseServerList(text);
  if (!fromServer) return false;
  const next = merge ? mergeLists(fromServer, items) : fromServer;
  if (syncDirty && !merge) {
    await invoke("park_conflict", { data: JSON.stringify(items) }).catch(() => {});
  }
  const before = items;
  items = next;
  setStamp(stamp);
  setDirty(false);
  const added = next.length - fromServer.length;

  // Android: alarms for rows that are gone or ticked off on the other device
  // go; every one still to come is set. The same number replaces the same
  // alarm, so a reminder that did not change is simply set again.
  const now = new Map(next.map((i) => [i.id, i]));
  before.forEach((old) => {
    const fresh = now.get(old.id);
    if (!fresh || fresh.done || !fresh.remindAt || fresh.nid !== old.nid) cancelReminder(old);
  });
  next.forEach(scheduleReminder);

  for (const id of [...opened]) if (!now.has(id)) opened.delete(id);
  if (editingId && !now.has(editingId)) editingId = null;
  render();
  if (!$("searchOverlay").hidden) drawSearch();

  // `synced` tells the web build this change came from another device.
  try {
    await invoke("set_notes", { data: JSON.stringify(items), synced: true });
  } catch {}
  scheduleCacheSize();

  // The notes added from this device go up to the account at once.
  if (merge) {
    if (added > 0) {
      setDirty(true);
      pushList();
    } else {
      setMerge(false);
    }
  }
  return true;
}

// Fetches the list and uses it when the server has moved on since this device
// last looked. `announce` says so with a note.
let pulling = false;
async function pullList(announce) {
  const code = syncCode;
  if (!code || pulling) return;
  pulling = true;
  try {
    const res = await fetch(SYNC_URL + "?code=" + encodeURIComponent(code), { cache: "no-store" });
    if (code !== syncCode) return;
    if (res.status === 404) {
      // Nothing up there yet: this device's list goes up.
      setStamp(0);
      pushList();
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    if (code !== syncCode) return;
    if (body.updatedAt === serverStamp) {
      // Nothing new up there. Anything changed here while away goes up.
      if (syncDirty) pushList();
      return;
    }
    const merge = syncMerge;
    const before = items.length;
    if (!(await takeServerList(body.data, body.updatedAt, merge))) return;
    if (merge && items.length > before) {
      showNote("Your list now has the notes from your other devices too.");
    } else if (announce) {
      showNote("Updated from your other device.");
    }
  } catch {
    // Offline, or the service is down. The list is safe here, and the next
    // look catches up.
  } finally {
    pulling = false;
  }
}

// Sends the list up, one save at a time. A refusal means another device got
// there first: its list is loaded, and this one's put aside.
let pushTimer = null;
let pushChain = Promise.resolve();

function pushList() {
  clearTimeout(pushTimer);
  pushTimer = null;
  const run = async () => {
    const code = syncCode;
    if (!code) return;
    const data = JSON.stringify(items);
    try {
      const res = await fetch(SYNC_URL, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, data, base: serverStamp }),
      });
      if (code !== syncCode) return;
      if (res.status === 409) {
        const body = await res.json();
        // Still adding this device's notes after signing in: add them to the
        // newer list too, rather than putting them aside.
        const merge = syncMerge;
        if ((await takeServerList(body.data, body.updatedAt, merge)) && !merge) {
          showNote("Your other device had newer changes, so its list was loaded.");
        }
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      setStamp(body.updatedAt);
      // This device's notes are on the account now.
      setMerge(false);
      // Clean only if nothing changed while this was on its way.
      if (JSON.stringify(items) === data) setDirty(false);
    } catch {
      // Offline, or the service is down. The list is safe here and goes up
      // with the next change, or the next time the app is opened.
    }
  };
  pushChain = pushChain.then(run, run);
  return pushChain;
}

// Sending waits a few seconds after saving to disk, so a burst of changes is
// one upload rather than one each.
function schedulePush() {
  if (!syncCode) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushList, 4000);
}

// Leaving the window sends what is still owed; coming back looks for what the
// other devices did meanwhile.
function syncAway() {
  if (syncCode && (syncDirty || pushTimer)) pushList();
}

function syncBackHere() {
  if (syncCode) pullList(true);
}

// --- The account panel in Settings -----------------------------------------
let accountBusy = false;
// login, signup, verify, forgot or reset while signed out; "", "delete" or
// "change" while signed in.
let acctMode = "login";
let acctView = "";
let acctEmail = "";
// Set when the confirm screen is opened from Verify Email with no address
// typed, so that screen asks for the address as well as the code.
let acctNeedEmail = false;
// Stays put until the next step, unlike the passing status message.
let acctNotice = "";
let acctStatusTimer = null;

const EYE_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M2 12s3.7-6.5 10-6.5c1.6 0 3 .4 4.2 1M22 12s-3.7 6.5-10 6.5c-1.6 0-3-.4-4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M4 4l16 16"/></svg>';

// The account's own message, inside Settings where the note at the bottom is
// hidden behind it. A failure is red with a cross and stays up longer, since
// it is the one worth reading.
function acctSay(text, bad) {
  clearTimeout(acctStatusTimer);
  const el = $("acctStatus");
  if (!el) return;
  const t = String(text || "");
  el.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  el.className = "account-status" + (bad ? " bad" : "");
  el.setAttribute("role", bad ? "alert" : "status");
  el.hidden = !t;
  if (t) acctStatusTimer = setTimeout(() => (el.hidden = true), bad ? 6000 : 2200);
}

function setAccountBusy(on) {
  accountBusy = on;
  const panel = $("accountPanel");
  panel.querySelectorAll("button").forEach((b) => {
    if (!b.classList.contains("password-eye")) b.disabled = on || b.dataset.off === "1";
  });
  const main = $("acctMain");
  if (main) main.textContent = on ? "Working…" : main.dataset.label;
}

function failure(e) {
  return e instanceof Error ? e.message : UNREACHABLE;
}

// Signed in: keep the code and the address, and let the sync take over.
// Whatever is on this device is added to the account's list, so nothing is
// lost on the way in.
async function startSync(code, address) {
  await invoke("set_sync_code", { code });
  await invoke("set_sync_email", { email: address });
  syncCode = code;
  syncEmail = address;
  setStamp(0);
  setDirty(items.length > 0);
  setMerge(items.length > 0);
  pullList(false);
}

function looksLikeEmail(address) {
  return address.includes("@") && address.includes(".");
}

// Sign in or create an account. Returns true, false, or "verify" when the
// address still has to be confirmed.
async function useAccount(action, email, password) {
  const address = email.trim().toLowerCase();
  if (!looksLikeEmail(address)) {
    acctSay("That email address does not look right", true);
    return false;
  }
  if (password.length < 8) {
    acctSay("Use at least 8 characters for the password", true);
    return false;
  }
  setAccountBusy(true);
  try {
    const { code } = await accountCall(action, {
      email: address,
      key: await passwordKey(address, password),
    });
    if (action === "signup") return "verify";
    if (!code) throw new Error("The service sent nothing back");
    await startSync(code, address);
    acctMode = "login";
    renderAccount();
    acctSay("Signed in, fetching your list");
    return true;
  } catch (e) {
    if (e.needsVerify) {
      acctSay(failure(e), true);
      return "verify";
    }
    acctSay(failure(e), true);
    return false;
  } finally {
    setAccountBusy(false);
  }
}

// Takes the emailed code and finishes signing up, or an unconfirmed sign-in.
async function verifyAccount(email, token) {
  const address = email.trim().toLowerCase();
  if (!/^[0-9]{6}$/.test(token.trim())) {
    acctSay("The code from the email is six digits", true);
    return false;
  }
  setAccountBusy(true);
  try {
    const { code } = await accountCall("verify", { email: address, token: token.trim() });
    if (!code) throw new Error("The service sent nothing back");
    await startSync(code, address);
    acctMode = "login";
    acctNotice = "";
    renderAccount();
    acctSay("Address confirmed, sync on");
    return true;
  } catch (e) {
    acctSay(failure(e), true);
    return false;
  } finally {
    setAccountBusy(false);
  }
}

// Another confirmation code. The service answers the same whether the address
// is waiting, already confirmed or unknown, so the wording on screen does too.
async function resendCode(email) {
  const address = email.trim().toLowerCase();
  if (!looksLikeEmail(address)) {
    acctSay("That email address does not look right", true);
    return false;
  }
  setAccountBusy(true);
  try {
    await accountCall("resend", { email: address });
    return true;
  } catch (e) {
    acctSay(failure(e), true);
    return false;
  } finally {
    setAccountBusy(false);
  }
}

// Emails a six digit code to whoever owns the address.
async function forgotPassword(email) {
  const address = email.trim().toLowerCase();
  if (!address.includes("@")) {
    acctSay("That email address does not look right", true);
    return false;
  }
  setAccountBusy(true);
  try {
    await accountCall("forgot", { email: address });
    return true;
  } catch (e) {
    acctSay(failure(e), true);
    return false;
  } finally {
    setAccountBusy(false);
  }
}

// Takes the emailed code and a new password, and signs in with it.
async function resetPassword(email, token, password) {
  const address = email.trim().toLowerCase();
  if (!/^[0-9]{6}$/.test(token.trim())) {
    acctSay("The code from the email is six digits", true);
    return false;
  }
  if (password.length < 8) {
    acctSay("Use at least 8 characters for the password", true);
    return false;
  }
  setAccountBusy(true);
  try {
    const { code } = await accountCall("reset", {
      email: address,
      token: token.trim(),
      key: await passwordKey(address, password),
    });
    if (!code) throw new Error("The service sent nothing back");
    const already = code === syncCode && address === syncEmail;
    if (!already) await startSync(code, address);
    acctMode = "login";
    acctView = "";
    acctNotice = "";
    renderAccount();
    acctSay(already ? "Password changed" : "Password changed, signed in");
    return true;
  } catch (e) {
    acctSay(failure(e), true);
    return false;
  } finally {
    setAccountBusy(false);
  }
}

// Clears the account from this device only.
async function forgetAccount() {
  await invoke("set_sync_code", { code: "" });
  await invoke("set_sync_email", { email: "" });
  clearTimeout(pushTimer);
  pushTimer = null;
  syncCode = "";
  syncEmail = "";
  setStamp(0);
  setDirty(false);
  setMerge(false);
}

// Leaves the account alone and stops this device keeping in step with it.
async function signOut() {
  const yes = await dialog({
    title: "Sign out on this device?",
    text:
      "Your list stays here, and the copy on the server is left alone so your other devices keep working. Sign in again to pick it back up.",
    ok: "Sign Out",
    accent: true,
  });
  if (!yes) return;
  // Anything not sent yet goes up first, so the other devices get it.
  if (syncDirty || pushTimer) await pushList();
  try {
    await forgetAccount();
  } catch {
    acctSay("Could not sign out", true);
    return;
  }
  acctView = "";
  renderAccount();
  acctSay("Signed out on this device");
}

// Deletes the account and the copy of the list kept for it. The password is
// asked for again, since it is never kept, and it is what proves the person
// doing this owns the account. The list on this device is left alone.
async function deleteAccount(password) {
  if (!syncEmail) return;
  if (password.length < 8) {
    acctSay("Type your password to confirm", true);
    return;
  }
  const address = syncEmail;
  const yes = await dialog({
    title: "Delete the account for " + address + "?",
    text:
      "The copy of your list kept for it is deleted from the server, and your other devices stop syncing. Your list stays " +
      HERE +
      ". This cannot be undone.",
    ok: "Delete Account",
  });
  if (!yes) return;
  setAccountBusy(true);
  try {
    await accountCall("delete", { email: address, key: await passwordKey(address, password) });
    await forgetAccount();
    acctView = "";
    renderAccount();
    acctSay("Account deleted");
  } catch (e) {
    acctSay(failure(e), true);
  } finally {
    setAccountBusy(false);
  }
}

// A password box with the eye that shows what was typed.
function passwordBox(id, placeholder, onEnter) {
  const input = h("input", {
    class: "account-input",
    id,
    type: "password",
    placeholder,
    autocomplete: "off",
    spellcheck: "false",
  });
  if (onEnter) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !accountBusy) {
        e.preventDefault();
        onEnter();
      }
    });
  }
  const eye = h("button", {
    class: "password-eye",
    type: "button",
    title: "Show the password",
    "aria-label": "Show the password",
    html: EYE_ICON,
  });
  eye.onclick = () => {
    const shown = input.type === "password";
    input.type = shown ? "text" : "password";
    const label = shown ? "Hide the password" : "Show the password";
    eye.title = label;
    eye.setAttribute("aria-label", label);
    eye.innerHTML = shown ? EYE_OFF_ICON : EYE_ICON;
  };
  return h("div", { class: "password-field" }, input, eye);
}

function textBox(id, props, onEnter) {
  const input = h("input", { class: "account-input", id, spellcheck: "false", ...props });
  if (onEnter) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !accountBusy) {
        e.preventDefault();
        onEnter();
      }
    });
  }
  return input;
}

const val = (id) => ($(id) ? $(id).value : "");

// The status line, kept in the panel and filled by acctSay.
function statusLine() {
  return h("p", { class: "account-status", id: "acctStatus", role: "status", hidden: true });
}

function noticeLine() {
  return acctNotice ? h("p", { class: "account-status", role: "status", text: acctNotice }) : null;
}

// Retyped passwords: the button waits until both boxes match, and a line says
// so once something is in the second box.
function watchMatch(a, b, button) {
  const check = () => {
    const typed = val(b).length > 0;
    const same = val(a) === val(b);
    $("acctMismatch").hidden = !typed || same;
    button.dataset.off = same ? "0" : "1";
    button.disabled = accountBusy || !same;
  };
  [a, b].forEach((id) => $(id).addEventListener("input", check));
  check();
}

function go(mode, notice) {
  acctMode = mode;
  acctNotice = notice || "";
  acctNeedEmail = false;
  renderAccount();
}

function rememberEmail() {
  if ($("acctEmail")) acctEmail = $("acctEmail").value;
}

async function submitAccount() {
  rememberEmail();
  const email = acctEmail;
  if (acctMode === "forgot") {
    if (await forgotPassword(email)) {
      go(
        "reset",
        "If " +
          email.trim().toLowerCase() +
          " has an account, a six digit code is on its way. Enter it below with a new password. The code lasts 15 minutes."
      );
    }
    return;
  }
  if (acctMode === "reset") {
    await resetPassword(email, val("acctCode"), val("acctPassword"));
    return;
  }
  if (acctMode === "verify") {
    await verifyAccount(email, val("acctCode"));
    return;
  }
  if (acctMode === "signup" && val("acctPassword") !== val("acctPassword2")) return;
  const wasSignup = acctMode === "signup";
  const result = await useAccount(acctMode, email, val("acctPassword"));
  if (result === "verify") {
    const address = email.trim().toLowerCase();
    go(
      "verify",
      wasSignup
        ? "Account created. A six digit code has been emailed to " +
            address +
            ". Enter it below to confirm the address. Check your spam folder if it does not arrive within a minute."
        : "This address is not confirmed yet, so a fresh six digit code has been emailed to " +
            address +
            ". Enter it below."
    );
  }
}

function renderAccount() {
  const panel = $("accountPanel");
  panel.textContent = "";
  clearTimeout(acctStatusTimer);

  if (syncEmail) {
    const who = h("strong", { text: syncEmail });

    if (acctView === "delete") {
      const del = h("button", { class: "btn btn-danger", type: "button", text: "Delete My Account" });
      del.onclick = () => deleteAccount(val("acctPassword"));
      const cancel = h("button", { class: "btn", type: "button", text: "Cancel" });
      cancel.onclick = () => {
        acctView = "";
        renderAccount();
      };
      panel.append(
        h(
          "div",
          { class: "account-card" },
          h("p", { class: "account-hint" }, "Type your password to delete the account for ", who, ". Your list stays " + HERE + "."),
          passwordBox("acctPassword", "Your password", () => deleteAccount(val("acctPassword"))),
          statusLine(),
          h("div", { class: "account-actions" }, del, cancel)
        )
      );
      $("acctPassword").focus();
      return;
    }

    if (acctView === "change") {
      const change = h("button", { class: "btn btn-accent", id: "acctMain", type: "button", text: "Change Password" });
      change.dataset.label = "Change Password";
      const doChange = () => {
        if (val("acctPassword") !== val("acctPassword2")) return;
        resetPassword(syncEmail, val("acctCode"), val("acctPassword"));
      };
      change.onclick = doChange;
      const cancel = h("button", { class: "btn", type: "button", text: "Cancel" });
      cancel.onclick = () => {
        acctView = "";
        renderAccount();
      };
      panel.append(
        h(
          "div",
          { class: "account-card" },
          h("p", { class: "account-hint" }, "Enter the six digit code emailed to ", who, ", and pick a new password. The code lasts 15 minutes."),
          textBox("acctCode", { placeholder: "Six digit code", inputmode: "numeric", autocomplete: "one-time-code" }),
          passwordBox("acctPassword", "New password"),
          passwordBox("acctPassword2", "Retype the new password", doChange),
          h("p", { class: "account-hint", id: "acctMismatch", text: "The passwords do not match.", hidden: true }),
          statusLine(),
          h("div", { class: "account-actions" }, change, cancel)
        )
      );
      watchMatch("acctPassword", "acctPassword2", change);
      $("acctCode").focus();
      return;
    }

    const changeRow = h("button", { class: "menu-action", type: "button", text: "Change Password" });
    changeRow.onclick = async () => {
      if (await forgotPassword(syncEmail)) {
        acctView = "change";
        renderAccount();
      }
    };
    const outRow = h("button", { class: "menu-action", type: "button", text: "Sign Out" });
    outRow.onclick = signOut;
    const delRow = h("button", { class: "menu-action danger", type: "button", text: "Delete Account" });
    delRow.onclick = () => {
      acctView = "delete";
      renderAccount();
    };
    panel.append(
      h(
        "div",
        { class: "account-card" },
        h("p", { class: "account-hint" }, "Signed in as ", who, ". Your list is kept in step across your devices."),
        statusLine()
      ),
      h("div", { class: "menu-list" }, changeRow, outRow, delRow)
    );
    return;
  }

  // Signed out: one form, a step at a time.
  const mode = acctMode;
  const hint =
    mode === "verify"
      ? acctNeedEmail
        ? h("p", { class: "account-hint", text: "Type the address you signed up with and the six digit code from the email. A code lasts 15 minutes." })
        : h("p", { class: "account-hint" }, "Enter the six digit code emailed to ", h("strong", { text: acctEmail.trim().toLowerCase() }), " to confirm the address. The code lasts 15 minutes.")
      : mode === "forgot"
        ? h("p", { class: "account-hint", text: "We will email you a six digit code to set a new password." })
        : mode === "reset"
          ? h("p", { class: "account-hint", text: "Enter the code from the email and pick a new password." })
          : h("p", { class: "account-hint", text: "An account keeps your list in step across your devices. Your password never leaves this device." });

  const label =
    mode === "signup"
      ? "Create Account"
      : mode === "verify"
        ? "Confirm the Address"
        : mode === "forgot"
          ? "Email Me a Code"
          : mode === "reset"
            ? "Set the Password"
            : "Sign In";
  const main = h("button", { class: "btn btn-accent", id: "acctMain", type: "button", text: label });
  main.dataset.label = label;
  main.onclick = submitAccount;

  // Enter in the first password box does nothing while signing up, or the
  // second box would be skipped.
  const enter = () => submitAccount();
  const parts = [hint];
  if (mode !== "verify" || acctNeedEmail) {
    const email = textBox(
      "acctEmail",
      { type: "email", placeholder: "Email address", autocomplete: "email", value: acctEmail },
      mode === "signup" ? null : enter
    );
    email.addEventListener("input", rememberEmail);
    parts.push(email);
  }
  if (mode === "verify" || mode === "reset") {
    parts.push(textBox("acctCode", { placeholder: "Six digit code", inputmode: "numeric", autocomplete: "one-time-code" }, enter));
  }
  if (mode === "login" || mode === "signup" || mode === "reset") {
    parts.push(passwordBox("acctPassword", mode === "reset" ? "New password" : "Password", mode === "signup" ? null : enter));
  }
  if (mode === "signup") {
    parts.push(passwordBox("acctPassword2", "Retype the password", enter));
    parts.push(h("p", { class: "account-hint", id: "acctMismatch", text: "The passwords do not match.", hidden: true }));
  }
  parts.push(main, noticeLine(), statusLine());

  const link = (text, fn) => {
    const b = h("button", { class: "account-link", type: "button", text });
    b.onclick = fn;
    return b;
  };
  const sep = () => h("span", { class: "account-sep", "aria-hidden": "true", text: "|" });
  const links = h("div", { class: "account-links" });
  if (mode === "login") {
    links.append(
      link("Create Account", () => {
        rememberEmail();
        go("signup");
      }),
      sep(),
      link("Forgot Password", () => {
        rememberEmail();
        go("forgot");
      }),
      sep(),
      // Opens the confirm screen with no call to the service, so a code
      // already sitting in the inbox still works.
      link("Verify Email", () => {
        rememberEmail();
        go("verify");
        acctNeedEmail = !acctEmail.trim();
        renderAccount();
      })
    );
  } else {
    if (mode === "verify") {
      links.append(
        link("Resend Verification Code", async () => {
          rememberEmail();
          if (!(await resendCode(acctEmail))) return;
          acctNotice =
            "If that address is waiting to be confirmed, a new six digit code is on its way. It lasts 15 minutes, and any earlier code stops working.";
          renderAccount();
        }),
        sep()
      );
    }
    links.append(
      link("Back to Sign In", () => {
        rememberEmail();
        go("login");
      })
    );
  }
  parts.push(links);

  panel.append(h("div", { class: "account-card" }, ...parts));
  if (mode === "signup") watchMatch("acctPassword", "acctPassword2", main);
}

// Settings opens on the account as it stands now, and closing it puts any
// half-finished step away.
function resetAccountPanel() {
  acctView = "";
  if (acctMode !== "verify" && acctMode !== "reset") acctMode = "login";
}

// Shown once, the first time the app is opened with something on the list,
// so nobody puts a month in believing it follows them to their other devices.
let welcomeDone = false;

async function maybeWelcome() {
  if (welcomeDone || !loaded) return;
  if (storeBuild && !known) return;
  if (card || dialogDone || !$("menuPanel").hidden || !$("sheet").hidden) return;
  if (!$("searchOverlay").hidden) return;
  welcomeDone = true;
  let seen = true;
  try {
    seen = localStorage.getItem("bim.seenWelcome") === "1";
  } catch {}
  // A first launch that opened on the welcome sheet, or an empty list, has
  // its own welcome; this one waits for the next launch.
  if (seen || syncEmail || !items.length || firstRunShown) return;
  try {
    localStorage.setItem("bim.seenWelcome", "1");
  } catch {}
  const yes = await dialog({
    title: "Welcome to " + APP_NAME,
    paras: [
      APP_NAME + " works straight away, with no account. Everything you add is saved " + HERE + " and stays there.",
      ["That also means it stays ", h("strong", { text: "only" }), " there. Your list will not appear on your other devices on its own."],
      "To have the same list everywhere, create an account in Settings. Sign in on another device and everything you have is waiting for you, kept in step from then on. Just an email address and a password, and you can start one whenever you like.",
    ],
    cancel: "Not Now",
    ok: "Create an Account",
    accent: true,
    welcome: true,
  });
  if (!yes) return;
  acctMode = "signup";
  toggleMenu(true);
  const section = document.querySelector(".menu-account");
  if (section) section.scrollIntoView({ block: "start", behavior: reduceMotion.matches ? "auto" : "smooth" });
  setTimeout(() => $("acctEmail") && $("acctEmail").focus(), 300);
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

function cleanDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// A file the app did not write is a stranger. Nothing in it is trusted: every
// row has to be a plain object, every field has to be the right type, the text
// is cut to the same length the boxes allow, the id is thrown away and made
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

    const row = {
      id: newId(),
      text,
      details,
      done,
      at: cleanDate(entry.at) || now,
      doneAt: done ? cleanDate(entry.doneAt) || now : null,
    };
    // A reminder comes along when its time reads as a date. Its number is
    // made fresh like the id, so it cannot replace an alarm already set.
    const remindAt = cleanDate(entry.remindAt);
    if (remindAt) {
      row.remindAt = remindAt;
      row.nid = newNid();
    }
    out.push(row);
  }
  return out;
}

async function exportList() {
  toggleMenu(false);
  try {
    const saved = await invoke("export_to_file", { data: JSON.stringify(items, null, 2) });
    if (saved) showNote("Saved a copy of your list.");
  } catch (e) {
    showProblem("That could not be saved. " + String(e));
  }
}

async function importList() {
  toggleMenu(false);

  let content;
  try {
    content = await invoke("import_from_file");
  } catch (e) {
    showProblem("That file could not be opened. " + String(e));
    return;
  }
  // Nothing came back because the box was closed without picking anything.
  if (typeof content !== "string") return;

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
  render();
  if (await save()) clean.forEach(scheduleReminder);
  showNote("Brought in " + clean.length + (clean.length === 1 ? " thing." : " things."));
}

// ---------------------------------------------------------------------------
// Reminders (Android): set, cancel, and how a reminder's time reads
// ---------------------------------------------------------------------------
// The notification's number. Android wants a positive 32-bit integer.
function newNid() {
  return 1 + Math.floor(Math.random() * 2147483646);
}

function scheduleReminder(item) {
  if (!REMINDERS || !item || item.done || !item.remindAt || !item.nid) return;
  const at = Date.parse(item.remindAt);
  if (!(at > Date.now())) return;
  invoke("reminder_set", {
    id: item.nid,
    title: item.text,
    body: item.details || "",
    atMs: at,
  }).catch(() => {});
}

function cancelReminder(item) {
  if (!REMINDERS || !item || !item.nid) return;
  invoke("reminder_cancel", { ids: [item.nid] }).catch(() => {});
}

// "Today, 09:00", "Tomorrow, 18:30", "Friday, 08:00", "14 Nov, 09:00".
function remindLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  // The phone's own clock style: "9:00 AM" or "09:00".
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86400000);
  let day;
  if (days === 0) day = "Today";
  else if (days === 1) day = "Tomorrow";
  else if (days === -1) day = "Yesterday";
  else if (days > 1 && days < 7) day = d.toLocaleDateString([], { weekday: "long" });
  else
    day = d.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
  return day + ", " + time;
}

// The value a datetime-local box takes: local time, to the minute.
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    "T" + p(d.getHours()) + ":" + p(d.getMinutes())
  );
}

// ---------------------------------------------------------------------------
// Android: the sheet. Adding, changing, and the welcome when the list is empty
// all use it. Slides up from the bottom, over a dimmed list.
// ---------------------------------------------------------------------------
let sheetMode = ""; // "", "new", "edit" or "first"
let sheetItemId = null;
let sheetRemindAt = null;

function openSheet(mode, item, focus) {
  sheetMode = mode;
  sheetItemId = item ? item.id : null;
  $("sheetHero").hidden = mode !== "first";
  $("sheetTitle").hidden = mode === "first";
  $("sheetTitle").textContent = mode === "edit" ? "Edit reminder" : "New reminder";
  $("sheet").setAttribute("aria-labelledby", mode === "first" ? "sheetHeroTitle" : "sheetTitle");
  $("sheetText").value = item ? item.text : "";
  // The welcome already asks the question, so its box does not repeat it.
  $("sheetText").placeholder =
    mode === "first" ? "Your first reminder" : "What do you need to bear in mind?";
  $("sheetDetails").value = item ? item.details || "" : "";
  sheetRemindAt = item && item.remindAt ? item.remindAt : null;
  renderRemindChip();
  setSheetNote("", false);
  $("sheetDelete").hidden = mode !== "edit";
  $("sheetCancel").textContent = mode === "first" ? "Not now" : "Cancel";
  $("sheetSave").textContent = mode === "edit" ? "Save" : "Add";
  openWithMotion($("sheet"));
  openWithMotion($("sheetScrim"));
  $("sheet").scrollTop = 0;
  hideSnack();
  syncBack();
  // Focusing inside the tap that opened the sheet is what brings the
  // keyboard up. The welcome opens on its own, so it waits for a tap.
  if (focus) $("sheetText").focus();
}

function closeSheet() {
  if ($("sheet").hidden) return;
  if (document.activeElement && $("sheet").contains(document.activeElement)) {
    document.activeElement.blur();
  }
  closeWithMotion($("sheet"), 220);
  closeWithMotion($("sheetScrim"), 220);
  sheetMode = "";
  sheetItemId = null;
  syncBack();
}

function renderRemindChip() {
  const set = !!sheetRemindAt;
  $("sheetRemindLabel").textContent = set ? remindLabel(sheetRemindAt) : "Remind me";
  $("sheetRemindChip").classList.toggle("set", set);
  $("sheetRemindClear").hidden = !set;
}

function setSheetNote(text, withLink) {
  $("sheetNote").hidden = !text;
  $("sheetNoteText").textContent = text;
  $("sheetNoteLink").hidden = !withLink;
}

// After a time is picked: notifications have to be allowed for the reminder
// to show, and "Alarms & reminders" for it to show on the minute. Asks for the
// first only when told to (a tap), and only says so for the second.
async function checkReminderReady(ask) {
  if (!TAURI || !sheetRemindAt) return;
  let state = await invoke("reminder_permission").catch(() => "granted");
  if (state === "prompt" && ask) {
    state = await invoke("reminder_request_permission").catch(() => "denied");
  }
  if (state !== "granted") {
    setSheetNote(
      "Notifications are off for Bear in Mind, so this reminder will not show. Turn them on in your phone's settings.",
      false
    );
    return;
  }
  const exact = await invoke("exact_alarms_allowed").catch(() => true);
  if (exact) setSheetNote("", false);
  else setSheetNote("Reminders may arrive a few minutes late.", true);
}

function pickReminder() {
  const box = $("sheetRemindInput");
  // Opens on the time already set, or on the next full hour.
  let start = sheetRemindAt ? new Date(sheetRemindAt) : new Date();
  if (!sheetRemindAt) {
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
  }
  box.min = toLocalInput(new Date());
  box.value = toLocalInput(start);
  try {
    box.showPicker();
  } catch {
    box.focus();
    box.click();
  }
}

function onReminderPicked() {
  const value = $("sheetRemindInput").value;
  if (!value) return;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return;
  if (d.getTime() <= Date.now()) {
    setSheetNote("That time has already passed. Pick a later one.", false);
    return;
  }
  sheetRemindAt = d.toISOString();
  renderRemindChip();
  checkReminderReady(true);
}

async function sheetSave() {
  const text = $("sheetText").value.trim();
  if (!text) {
    $("sheetText").focus();
    return;
  }
  const details = $("sheetDetails").value.trim();
  let item;
  if (sheetMode === "edit") {
    item = items.find((i) => i.id === sheetItemId);
    if (!item) {
      closeSheet();
      return;
    }
    // The old alarm goes whatever changed; the new one is set after the save.
    cancelReminder(item);
    item.text = text;
    item.details = details;
  } else {
    item = {
      id: newId(),
      text,
      details,
      done: false,
      at: new Date().toISOString(),
      doneAt: null,
    };
    items.unshift(item);
  }
  if (sheetRemindAt) {
    item.remindAt = sheetRemindAt;
    if (!item.nid) item.nid = newNid();
  } else {
    delete item.remindAt;
    delete item.nid;
  }
  closeSheet();
  render();
  if (await save()) scheduleReminder(item);
}

// Once per launch, when the list is empty and nothing else is up: the sheet,
// as a welcome with the box to write the first one in.
function maybeFirstRun() {
  if (!isAndroid || firstRunShown || !loaded) return;
  if (storeBuild && !known) return;
  if (items.length || card || !$("menuPanel").hidden || !$("sheet").hidden) return;
  if (!$("searchOverlay").hidden || dialogDone) return;
  firstRunShown = true;
  openSheet("first", null, false);
}

// ---------------------------------------------------------------------------
// Drawing the list
// ---------------------------------------------------------------------------
// Icons drawn to Apple's shapes (tauri_ui.txt section 7), never a web set.
const TRASH_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4.5 6.5h15"/>' +
  '<path d="M9.2 6.5V4.9c0-.8.6-1.4 1.4-1.4h2.8c.8 0 1.4.6 1.4 1.4v1.6"/>' +
  '<path d="M6.4 6.5l.9 12.2a1.9 1.9 0 0 0 1.9 1.8h5.6a1.9 1.9 0 0 0 1.9-1.8l.9-12.2"/>' +
  '<path d="M10.1 10.5v6M13.9 10.5v6"/></svg>';

// The bin under a row swiped left (Android).
const TRASH_BIG =
  '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/>' +
  '<path d="M9 7V4h6v3"/></svg>';

const EDIT_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M16.2 4.3a2.1 2.1 0 0 1 3 3L8.4 18.1 4 19.5l1.4-4.4z"/>' +
  '<path d="M14.3 6.2l3 3"/></svg>';

const CHEVRON_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" fill="none" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

const BELL_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" ' +
  'stroke="currentColor" stroke-width="2.2" fill="none" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

const BEAR_MARK =
  '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="5.6" cy="6.2" r="3" fill="currentColor"/>' +
  '<circle cx="18.4" cy="6.2" r="3" fill="currentColor"/>' +
  '<circle cx="12" cy="13.4" r="8" fill="currentColor"/>' +
  '<ellipse cx="12" cy="16.6" rx="3.6" ry="2.8" fill="var(--hero-cut)"/>' +
  '<ellipse cx="12" cy="15.2" rx="1.5" ry="1.1" fill="currentColor"/>' +
  '<circle cx="8.9" cy="11.4" r="1.15" fill="var(--hero-cut)"/>' +
  '<circle cx="15.1" cy="11.4" r="1.15" fill="var(--hero-cut)"/></svg>';

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

function whenLine(item) {
  const when = whenText(item.done ? item.doneAt || item.at : item.at);
  return item.done && when ? "done " + when : when;
}

// The row being changed right now (desktop), rebuilt as a small form in
// place. Only one at a time, so opening a second closes the first.
let editingId = null;

// Android: the row swiped open to show its bin, if any.
let swipeOpen = null;
let swipeJustEnded = false;

// Rows are kept between redraws, so a row that moves can slide from where it
// was and a new one can rise in. A row is only filled again when something it
// shows has changed.
const rowEls = new Map();
const rowSigs = new Map();
let firstPaint = true;

function rowSig(item) {
  return JSON.stringify([
    item.text,
    item.details || "",
    !!item.done,
    item.remindAt || "",
    item.remindAt ? Date.parse(item.remindAt) > Date.now() : false,
    opened.has(item.id),
    editingId === item.id,
    whenLine(item),
  ]);
}

// Desktop: the row itself. Android: a wrapper holding the red bin and, over
// it, the row that slides.
function getRow(item) {
  const id = item.id;
  let el = rowEls.get(id);
  if (!el) {
    if (isAndroid) {
      const row = h("div", { class: "item" });
      row.addEventListener("click", (e) => {
        if (e.target.closest(".tick")) return;
        if (swipeSwallow()) return;
        const it = items.find((i) => i.id === id);
        if (it) openSheet("edit", it, false);
      });
      el = h(
        "div",
        { class: "swipe", "data-id": id },
        h("button", {
          class: "swipe-del",
          type: "button",
          tabindex: "-1",
          "aria-label": "Delete",
          html: TRASH_BIG,
          onclick: () => askDelete(id),
        }),
        row
      );
    } else {
      el = h("div", { class: "item", "data-id": id });
      // A click anywhere on a row with a description opens it; the buttons,
      // the tick and a text selection keep their own jobs.
      el.addEventListener("click", (e) => {
        if (editingId === id) return;
        if (e.target.closest("button, input, textarea")) return;
        if (String(window.getSelection())) return;
        const it = items.find((i) => i.id === id);
        if (it && (it.details || "").trim()) toggleOpen(id);
      });
    }
    rowEls.set(id, el);
  }
  const sig = rowSig(item);
  if (rowSigs.get(id) !== sig) {
    fillRow(el, item);
    rowSigs.set(id, sig);
  }
  return el;
}

function fillRow(el, item) {
  const id = item.id;
  const row = isAndroid ? el.querySelector(".item") : el;

  if (!isAndroid && editingId === id) {
    row.className = "item editing";
    row.replaceChildren(editForm(item));
    return;
  }

  const details = (item.details || "").trim();
  const isOpen = opened.has(id);
  row.className =
    "item" + (item.done ? " done" : "") + (isOpen ? " open" : "") + (details ? " has-details" : "");

  const tickTitle = item.done ? "Put it back on the list" : "Mark it as done";
  const tick = h("input", { type: "checkbox", class: "tick", title: tickTitle, "aria-label": tickTitle });
  tick.checked = !!item.done;
  tick.addEventListener("change", () => toggleItem(id));

  // The arrow sits right after the words it belongs to.
  const titleRow = h("div", { class: "item-title-row" }, h("div", { class: "item-text", text: item.text }));
  if (details && !isAndroid) {
    const label = isOpen ? "Hide the description" : "Show the description";
    titleRow.append(
      h("button", {
        class: "chev-btn",
        type: "button",
        title: label,
        "aria-label": label,
        "aria-expanded": String(isOpen),
        html: CHEVRON_ICON,
        onclick: () => toggleOpen(id),
      })
    );
  }

  const middle = h("div", { class: "middle" }, titleRow);
  if (details) middle.append(h("div", { class: "item-details", text: details }));

  const when = h("div", { class: "item-when", text: whenLine(item) });
  if (isAndroid) {
    // The reminder, when there is one, leads the line under the text: in the
    // accent while it is still to come, plain once it has rung.
    const meta = h("div", { class: "item-meta" });
    if (item.remindAt && !item.done) {
      const future = Date.parse(item.remindAt) > Date.now();
      meta.append(
        h(
          "span",
          { class: "item-remind" + (future ? " future" : ""), html: BELL_ICON },
          h("span", { text: remindLabel(item.remindAt) })
        )
      );
    }
    meta.append(when);
    middle.append(meta);
    row.replaceChildren(tick, middle);
    return;
  }
  middle.append(when);

  // Change and Delete: the same 44px round button.
  const buttons = h(
    "div",
    { class: "item-buttons" },
    h("button", {
      class: "row-btn",
      type: "button",
      title: details ? "Change this" : "Change this, or add a description",
      "aria-label": "Change",
      html: EDIT_ICON,
      onclick: () => startEdit(id),
    }),
    h("button", {
      class: "row-btn del",
      type: "button",
      title: "Delete",
      "aria-label": "Delete",
      html: TRASH_ICON,
      onclick: () => askDelete(id),
    })
  );
  row.replaceChildren(tick, middle, buttons);
}

// Opens or closes a row's description in place, so the arrow turns and the
// words drop in instead of the row being drawn again.
function toggleOpen(id) {
  if (opened.has(id)) opened.delete(id);
  else opened.add(id);
  const item = items.find((i) => i.id === id);
  const el = rowEls.get(id);
  if (!item || !el || !el.isConnected) {
    render();
    return;
  }
  const isOpen = opened.has(id);
  el.classList.toggle("open", isOpen);
  const chev = el.querySelector(".chev-btn");
  if (chev) {
    chev.title = isOpen ? "Hide the description" : "Show the description";
    chev.setAttribute("aria-label", chev.title);
    chev.setAttribute("aria-expanded", String(isOpen));
  }
  if (isOpen) pop(el.querySelector(".item-details"), "grow");
  rowSigs.set(id, rowSig(item));
}

function editForm(item) {
  const id = item.id;
  const title = h("input", {
    type: "text",
    class: "edit-input",
    maxlength: "500",
    spellcheck: "false",
    "aria-label": "What you need to bear in mind",
  });
  title.value = item.text;

  const note = h("textarea", {
    class: "edit-details",
    rows: "4",
    maxlength: "2000",
    spellcheck: "false",
    placeholder: "Anything else worth remembering about it (optional)",
    "aria-label": "Description",
  });
  note.value = item.details || "";

  const commit = () => {
    const text = title.value.trim();
    if (!text) {
      title.focus();
      return;
    }
    const it = items.find((i) => i.id === id);
    if (it) {
      it.text = text;
      it.details = note.value.trim();
    }
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
    if (e.key === "Escape") {
      e.stopPropagation();
      cancel();
    }
  });

  // Enter starts a new line in the description. Ctrl+Enter saves.
  note.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      cancel();
    }
  });

  // Both buttons are the same box whatever their wording.
  return h(
    "div",
    { class: "item-edit" },
    title,
    note,
    h(
      "div",
      { class: "edit-actions" },
      h("button", { class: "btn", type: "button", text: "Cancel", onclick: cancel }),
      h("button", { class: "btn btn-accent", type: "button", text: "Save", onclick: commit })
    )
  );
}

function startEdit(id) {
  editingId = id;
  render();
  const box = $("list").querySelector(".item.editing .edit-input");
  if (box) {
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
}

function riseIn(el, i) {
  el.style.setProperty("--i", String(i));
  el.classList.remove("card-in");
  void el.offsetWidth;
  el.classList.add("card-in");
  el.addEventListener("animationend", function done(e) {
    if (e.target !== el) return;
    el.classList.remove("card-in");
    el.removeEventListener("animationend", done);
  });
}

function render() {
  updateProgress();

  const list = $("list");
  const animate = !firstPaint && !reduceMotion.matches;

  // Where every row is now, so a row that moves can slide from there.
  const before = new Map();
  if (animate) {
    for (const [id, el] of rowEls) if (el.isConnected) before.set(id, el.getBoundingClientRect());
  }

  const live = new Set(items.map((i) => i.id));
  for (const id of [...rowEls.keys()]) {
    if (!live.has(id)) {
      rowEls.delete(id);
      rowSigs.delete(id);
    }
  }
  if (editingId !== null && !live.has(editingId)) editingId = null;
  if (swipeOpen && !swipeOpen.isConnected) swipeOpen = null;

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const kids = [];

  if (!items.length) {
    kids.push(
      isAndroid
        ? h(
            "div",
            { class: "empty" },
            h("div", { class: "empty-mark", html: BEAR_MARK }),
            h("strong", { text: "Nothing to bear in mind" }),
            h("span", { text: "Tap + to add your first reminder." })
          )
        : h(
            "div",
            { class: "empty" },
            h("strong", { text: "Nothing on your mind yet" }),
            h("span", { text: "Type it in the box above and press Enter." }),
            h("span", { text: "It stays here until you tick it off, and it is still here when you come back." }),
            h("span", { class: "empty-also", html: 'Also as a <a href="https://apps.microsoft.com/detail/9N27CH9CM76V" target="_blank" rel="noopener">Windows app</a>' })
          )
    );
  }

  // Each part of the list in a group. On a desktop a group is no box at all
  // (display: contents); on Android it is one rounded list, like Settings.
  if (open.length) kids.push(h("div", { class: "group" }, open.map(getRow)));

  if (done.length) {
    // Android: the finished ones fold away under their heading, and stay
    // folded between launches.
    const folded = isAndroid && settings.doneCollapsed;
    const divider = h("div", {
      class: "divider" + (folded ? " folded" : ""),
      text: (isAndroid ? "Completed (" : "Done (") + done.length + ")",
    });
    if (isAndroid) {
      divider.setAttribute("role", "button");
      divider.setAttribute("aria-expanded", String(!folded));
      divider.addEventListener("click", () => {
        settings.doneCollapsed = !settings.doneCollapsed;
        render();
        saveSettings();
      });
    }
    kids.push(divider);
    if (!folded) kids.push(h("div", { class: "group" }, done.map(getRow)));
  }

  list.replaceChildren(...kids);

  // A new row rises in (one after another on the first paint); a row that
  // moved, such as one just ticked off, slides to its new place.
  if (!reduceMotion.matches) {
    let i = 0;
    for (const el of list.querySelectorAll("[data-id]")) {
      const was = before.get(el.dataset.id);
      if (!was) {
        riseIn(el, firstPaint ? Math.min(i++, 12) : 0);
        continue;
      }
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 480,
        easing: "cubic-bezier(0.32, 0.72, 0, 1)",
      });
    }
  }
  firstPaint = false;
  syncBack();
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

// Ticking off silences the reminder; unticking sets it again if it is still
// to come.
async function toggleItem(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.done = !item.done;
  item.doneAt = item.done ? new Date().toISOString() : null;
  if (item.done) cancelReminder(item);
  render();
  const el = rowEls.get(id);
  if (el && item.done) pop(el.querySelector(".tick"), "pop");
  if ((await save()) && !item.done) scheduleReminder(item);
}

// Every delete asks first, wherever it starts (the row's bin, the swipe, the
// sheet), and can still be taken back for a few seconds after.
async function askDelete(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const yes = await dialog({
    title: "Delete “" + shortName(item.text) + "”?",
    text: "It comes off your list. You can undo it straight after.",
    ok: "Delete",
  });
  closeSwipe();
  if (yes) deleteItem(id);
}

function deleteItem(id) {
  const index = items.findIndex((i) => i.id === id);
  if (index < 0) return;
  const [gone] = items.splice(index, 1);
  opened.delete(id);
  if (editingId === id) editingId = null;
  cancelReminder(gone);
  render();
  save();
  snack("Deleted “" + shortName(gone.text) + "”", "Undo", async () => {
    items.splice(Math.min(index, items.length), 0, gone);
    render();
    if (await save()) scheduleReminder(gone);
  });
}

async function clearDone() {
  toggleMenu(false);
  const n = items.filter((i) => i.done).length;
  if (!n) {
    showNote("Nothing finished to clear.");
    return;
  }
  const yes = await dialog({
    title: n === 1 ? "Clear 1 finished item?" : "Clear " + n + " finished items?",
    text: "They come off your list. You can undo it straight after.",
    ok: "Clear Items",
  });
  if (!yes) return;
  const removed = [];
  items = items.filter((item, index) => {
    if (!item.done) return true;
    removed.push([index, item]);
    return false;
  });
  render();
  save();
  snack(n === 1 ? "Cleared 1 finished item" : "Cleared " + n + " finished items", "Undo", () => {
    for (const [index, item] of removed) items.splice(Math.min(index, items.length), 0, item);
    render();
    save();
  });
}

async function clearAll() {
  toggleMenu(false);
  const n = items.length;
  if (!n) {
    showNote("Your list is already empty.");
    return;
  }
  const yes = await dialog({
    title: "Clear everything?",
    text:
      (n === 1 ? "The one item on your list comes off it" : "All " + n + " items come off your list") +
      ", finished or not. You can undo it straight after.",
    ok: "Clear All",
  });
  if (!yes) return;
  const gone = items;
  gone.forEach(cancelReminder);
  items = [];
  opened.clear();
  editingId = null;
  render();
  save();
  snack(n === 1 ? "Cleared 1 item" : "Cleared " + n + " items", "Undo", async () => {
    items = items.concat(gone);
    render();
    if (await save()) gone.forEach(scheduleReminder);
  });
}

// ---------------------------------------------------------------------------
// Android: a row swiped left shows a red bin. The bin asks first.
// ---------------------------------------------------------------------------
// True when a tap only closed an open swipe, or a swipe just ended, so the
// row underneath must not open as well.
function swipeSwallow() {
  if (swipeJustEnded) {
    swipeJustEnded = false;
    return true;
  }
  if (swipeOpen) {
    closeSwipe();
    return true;
  }
  return false;
}

function closeSwipe() {
  const w = swipeOpen;
  swipeOpen = null;
  syncBack();
  if (!w) return;
  const row = w.querySelector(".item");
  row.style.transform = "";
  const done = () => w.classList.remove("showing");
  row.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 400);
}

if (isAndroid) {
  const list = $("list");
  // A swipe that starts at either edge of the screen is Android's Back.
  const EDGE = 24;
  let drag = null;

  list.addEventListener("pointerdown", (e) => {
    const w = e.target.closest(".swipe");
    if (!w || e.target.closest(".tick, .swipe-del")) return;
    if (e.clientX <= EDGE || e.clientX >= window.innerWidth - EDGE) return;
    if (swipeOpen && swipeOpen !== w) closeSwipe();
    drag = {
      w,
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      base: swipeOpen === w ? -80 : 0,
      moving: false,
    };
  });

  list.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moving) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) {
        if (Math.abs(dy) > 8) drag = null;
        return;
      }
      if (dx > 0 && drag.base === 0) {
        drag = null;
        return;
      }
      drag.moving = true;
      drag.w.classList.add("showing", "dragging");
      try {
        drag.w.querySelector(".item").setPointerCapture(e.pointerId);
      } catch {}
    }
    let x = Math.min(0, drag.base + dx);
    if (x < -80) x = -80 + (x + 80) / 3;
    drag.w.querySelector(".item").style.transform = `translateX(${x}px)`;
    drag.x2 = x;
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moving) return;
    d.w.classList.remove("dragging");
    swipeJustEnded = true;
    setTimeout(() => {
      swipeJustEnded = false;
    }, 350);
    const row = d.w.querySelector(".item");
    swipeOpen = d.w;
    if ((d.x2 || 0) < -40) {
      row.style.transform = "translateX(-80px)";
      syncBack();
    } else {
      closeSwipe();
    }
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);

  // A tap anywhere else puts an open swipe away.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (swipeOpen && !swipeOpen.contains(e.target) && !e.target.closest("#dialogOverlay")) closeSwipe();
    },
    true
  );
}

// ---------------------------------------------------------------------------
// Search. Finds anything on the list by its words or its description, with or
// without accents; picking one shows it.
// ---------------------------------------------------------------------------
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// The folded text and, for each of its characters, where it came from.
function foldMap(s) {
  let out = "";
  const map = [];
  for (let i = 0; i < s.length; i++) {
    for (const ch of fold(s[i])) {
      out += ch;
      map.push(i);
    }
  }
  return { out, map };
}

// The parts of s that match any of the words, as [start, end) pairs.
function matchRanges(s, words) {
  if (!words.length) return [];
  const { out, map } = foldMap(s);
  const ranges = [];
  for (const w of words) {
    let from = 0;
    let at;
    while ((at = out.indexOf(w, from)) !== -1) {
      ranges.push([map[at], map[at + w.length - 1] + 1]);
      from = at + w.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

// s from start to end as text, with the matching parts marked.
function marked(s, ranges, start, end) {
  const frag = document.createDocumentFragment();
  let pos = start;
  for (const [a0, b0] of ranges) {
    const a = Math.max(a0, start);
    const b = Math.min(b0, end);
    if (b <= a) continue;
    if (a > pos) frag.append(s.slice(pos, a));
    frag.append(h("mark", { text: s.slice(a, b) }));
    pos = b;
  }
  if (pos < end) frag.append(s.slice(pos, end));
  return frag;
}

function searchWords() {
  return fold($("searchInput").value.trim()).split(/\s+/).filter(Boolean);
}

function matches(item, words) {
  const hay = fold(item.text + "\n" + (item.details || ""));
  return words.every((w) => hay.includes(w));
}

// One result: the words on the first line, then the part of the description
// that matched, or when it was written.
function resultRow(item, words) {
  const text = item.text.replace(/\s+/g, " ").trim();
  const label = h("span", { class: "s-label" }, marked(text, matchRanges(text, words), 0, text.length));

  const details = (item.details || "").replace(/\s+/g, " ").trim();
  let desc;
  if (details) {
    const ranges = matchRanges(details, words);
    let start = 0;
    if (ranges.length && ranges[0][0] > 40) {
      const space = details.lastIndexOf(" ", ranges[0][0] - 30);
      start = space < 0 ? ranges[0][0] - 30 : space + 1;
    }
    const end = Math.min(details.length, start + 160);
    desc = h("span", { class: "s-desc" }, start > 0 ? "…" : "", marked(details, ranges, start, end));
  } else {
    const when = whenLine(item);
    desc = h("span", { class: "s-desc", text: when ? when.charAt(0).toUpperCase() + when.slice(1) : "" });
  }

  return h(
    "button",
    { class: "s-row" + (item.done ? " done" : ""), type: "button", "data-id": item.id, onclick: () => pickResult(item.id) },
    h("span", { class: "s-line" }, label),
    desc
  );
}

function drawSearch() {
  const raw = $("searchInput").value.trim();
  const words = searchWords();
  $("searchClear").hidden = !raw;
  const box = $("searchResults");
  const count = $("searchCount");

  if (!items.length) {
    count.textContent = "";
    box.replaceChildren(
      h(
        "div",
        { class: "s-empty" },
        h("strong", { text: "Nothing on your list yet" }),
        h("span", { text: "Whatever you add can be found here." })
      )
    );
    return;
  }

  const hits = items.filter((i) => matches(i, words));
  if (!hits.length) {
    count.textContent = "";
    box.replaceChildren(
      h(
        "div",
        { class: "s-empty" },
        h("strong", { text: "No matches" }),
        h("span", { text: "Nothing on your list has “" + shortName(raw) + "” in it." })
      )
    );
    return;
  }

  const total = items.length + (items.length === 1 ? " item" : " items");
  count.textContent = words.length ? hits.length + " of " + total : total + " on your list";

  const open = hits.filter((i) => !i.done);
  const done = hits.filter((i) => i.done);
  const parts = [];
  if (open.length) {
    parts.push(
      h("div", { class: "s-title", text: "To do (" + open.length + ")" }),
      h("div", { class: "s-group" }, open.map((i) => resultRow(i, words)))
    );
  }
  if (done.length) {
    parts.push(
      h("div", { class: "s-title", text: (isAndroid ? "Completed (" : "Done (") + done.length + ")" }),
      h("div", { class: "s-group" }, done.map((i) => resultRow(i, words)))
    );
  }
  box.replaceChildren(...parts);
  box.scrollTop = 0;
}

function openSearch() {
  if (card) return;
  const ov = $("searchOverlay");
  if (!ov.hidden) {
    $("searchInput").focus();
    return;
  }
  toggleMenu(false);
  closeSheet();
  closeSwipe();
  $("searchInput").value = "";
  drawSearch();
  openWithMotion(ov);
  syncBack();
  // Focusing inside the tap that opened it is what brings a phone's keyboard
  // up.
  $("searchInput").focus();
}

function closeSearch() {
  const ov = $("searchOverlay");
  if (ov.hidden) return;
  if (ov.contains(document.activeElement)) document.activeElement.blur();
  closeWithMotion(ov, 240);
  syncBack();
}

// Desktop: the row opens its description, scrolls into view and lights up for
// a moment. Android: it opens in the sheet, as a tap on the row does.
function pickResult(id) {
  closeSearch();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (isAndroid) {
    openSheet("edit", item, false);
    return;
  }
  if ((item.details || "").trim()) opened.add(id);
  render();
  const el = rowEls.get(id);
  if (!el || !el.isConnected) return;
  el.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1900);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function applyMetrics(on) {
  metricsOn = on;
  settings.metricsOn = on;
  $("chkMetrics").checked = on;
  updateBrandSub();
  if (on) {
    refreshUsage();
    refreshCacheSize();
  }
}

function applyProgress(on) {
  progressOn = on;
  settings.progressOn = on;
  $("chkProgress").checked = on;
  updateProgress();
}

function toggleMenu(show) {
  const panel = $("menuPanel");
  const open = show === undefined ? panel.hidden : !!show;
  if (open === !panel.hidden) return;
  if (open) {
    renderAccount();
    openWithMotion(panel);
    openWithMotion($("menuBackdrop"));
    // Opens at the top, however far it was scrolled last time.
    panel.scrollTop = 0;
  } else {
    closeWithMotion(panel, 200);
    closeWithMotion($("menuBackdrop"), 200);
    resetAccountPanel();
  }
  syncBack();
}

// Android's Back closes what is open, the way Escape does on a desktop: the
// question first, then the purchase offer, Search, the sheet, Settings and an
// open swipe. Tauri hands Back to the page only while a listener is
// registered, so one is registered only while something is open. The rest of
// the time Back is Android's own and sends the app to the background; that
// includes the start screen and the ended trial, which have no way out by
// design.
let backListener = null;

function syncBack() {
  if (!isAndroid || !TAURI) return;
  const open =
    card === "offer" ||
    !!dialogDone ||
    !$("searchOverlay").hidden ||
    !$("sheet").hidden ||
    !$("menuPanel").hidden ||
    !!swipeOpen;
  if (open && !backListener) {
    backListener = TAURI.app.onBackButtonPress(closeTopmost).catch(() => null);
  } else if (!open && backListener) {
    const listener = backListener;
    backListener = null;
    listener.then((l) => l && l.unregister()).catch(() => {});
  }
}

function closeTopmost() {
  if (dialogDone) {
    dialogDone(false);
  } else if (card === "offer") {
    closeOffer();
  } else if (!$("searchOverlay").hidden) {
    closeSearch();
  } else if (!$("sheet").hidden) {
    closeSheet();
  } else if (!$("menuPanel").hidden) {
    toggleMenu(false);
  } else if (swipeOpen) {
    closeSwipe();
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
$("themeToggle").onclick = () => {
  theme = theme === "dark" ? "light" : "dark";
  applyTheme(true);
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

$("searchBtn").onclick = openSearch;
$("menuButton").onclick = () => toggleMenu();
$("menuClose").onclick = () => toggleMenu(false);
$("menuDone").onclick = () => toggleMenu(false);
// The dimmed page takes the click that closes Settings, so that click can
// never also tick something underneath.
$("menuBackdrop").onclick = () => toggleMenu(false);

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
$("btnClearDone").onclick = clearDone;
$("btnClearAll").onclick = clearAll;

// Search.
$("searchClose").onclick = closeSearch;
$("searchInput").addEventListener("input", drawSearch);
$("searchInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const first = $("searchResults").querySelector(".s-row");
  if (first) first.click();
});
$("searchClear").onclick = () => {
  $("searchInput").value = "";
  drawSearch();
  $("searchInput").focus();
};
$("searchOverlay").addEventListener("pointerdown", (e) => {
  $("searchOverlay").downOnScrim = e.target === e.currentTarget;
});
$("searchOverlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget && $("searchOverlay").downOnScrim) closeSearch();
});

// The question.
$("dialogCancel").onclick = () => dialogDone && dialogDone(false);
$("dialogOk").onclick = () => dialogDone && dialogDone(true);
$("dialogOverlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget && dialogDone) dialogDone(false);
});

// Android: the add button, the sheet's buttons and its reminder chip.
$("fab").onclick = () => openSheet("new", null, true);
$("sheetScrim").onclick = closeSheet;
$("sheetCancel").onclick = closeSheet;
$("sheetSave").onclick = sheetSave;
$("sheetDelete").onclick = () => {
  const id = sheetItemId;
  closeSheet();
  askDelete(id);
};
$("sheetRemind").onclick = pickReminder;
$("sheetRemindInput").addEventListener("change", onReminderPicked);
$("sheetRemindClear").onclick = () => {
  sheetRemindAt = null;
  renderRemindChip();
  setSheetNote("", false);
};
$("sheetNoteLink").onclick = () => invoke("open_exact_alarm_settings").catch(() => {});
$("sheetText").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sheetSave();
  }
});
$("snackAction").onclick = () => {
  const fn = snackFn;
  hideSnack();
  if (fn) fn();
};

// Back from the phone's "Alarms & reminders" page: look again, so the note
// goes once exact times are allowed.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !$("sheet").hidden && sheetRemindAt) {
    checkReminderReady(false);
  }
});

// Signed in: leaving the window sends what is still owed, and coming back
// looks for what the other devices did meanwhile. A phone mostly hides and
// shows rather than losing focus, so both are watched.
window.addEventListener("blur", syncAway);
window.addEventListener("focus", syncBackHere);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") syncAway();
  else syncBackHere();
});

// Desktop: closing the window waits for the last change to go up, a few
// seconds at most, so it is on the other devices straight away.
if (TAURI && TAURI.window && !isAndroid) {
  try {
    const win = TAURI.window.getCurrentWindow();
    let closing = false;
    win
      .onCloseRequested(async (event) => {
        if (closing || !syncCode || (!syncDirty && !pushTimer)) return;
        closing = true;
        event.preventDefault();
        await Promise.race([pushList(), new Promise((r) => setTimeout(r, 4000))]);
        await win.destroy();
      })
      .catch(() => {});
  } catch {}
}

// The list slides under the header; the header grows its soft edge once it
// does. A scroll also puts an open swipe away.
$("content").addEventListener(
  "scroll",
  (e) => {
    $("header").classList.toggle("scrolled", e.target.scrollTop > 2);
    if (swipeOpen) closeSwipe();
  },
  { passive: true }
);

// Esc closes what is open, topmost first. Ctrl+F searches, Ctrl+, opens
// Settings.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (dialogDone) dialogDone(false);
    else if (!$("searchOverlay").hidden) closeSearch();
    else if (!$("menuPanel").hidden) toggleMenu(false);
    else if (!$("sheet").hidden) closeSheet();
    else if (card === "offer") closeOffer();
    return;
  }
  if (card || dialogDone) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && (e.key === "f" || e.key === "F")) {
    e.preventDefault();
    openSearch();
  } else if (mod && e.key === ",") {
    e.preventDefault();
    toggleMenu(true);
  }
});

const FOOTER_URLS = {
  linkCoffee: "https://buymeacoffee.com/eeriegoesd",
  linkEerie: "https://eeriegoesd.com",
  linkReport: "https://support.eeriegoesd.com/report-issue/bear-in-mind",
  linkFeedback: "https://support.eeriegoesd.com/community/bear-in-mind",
  linkFeature: "https://support.eeriegoesd.com/suggest-feature/bear-in-mind",
  linkPrivacy: "https://eeriegoesd.com/privacy-policy/bear-in-mind/",
};

// On Android the footer is the usage line and "Made by EERIE". The support
// links are the Support section of Settings instead, and Support This Project
// sits under it, with the same addresses as above.
const SUPPORT_BUTTONS = {
  btnReport: FOOTER_URLS.linkReport,
  btnDiscussions: FOOTER_URLS.linkFeedback,
  btnFeature: FOOTER_URLS.linkFeature,
  btnPrivacy: FOOTER_URLS.linkPrivacy,
  btnCoffee: FOOTER_URLS.linkCoffee,
};

Object.entries({ ...FOOTER_URLS, ...SUPPORT_BUTTONS }).forEach(([id, url]) => {
  $(id).addEventListener("click", (e) => {
    e.preventDefault();
    invoke("open_url", { url }).catch(() => {});
  });
});

$("btnRestore").onclick = restoreUnlock;
$("btnBuy").onclick = buyFromSettings;
$("licMain").onclick = () => (card === "start" ? startTrial() : buyUnlock());
$("licRestore").onclick = restoreUnlock;
$("licClose").onclick = closeOffer;

// The dimmed backdrop closes the offer only. On the start screen and the
// ended trial it does nothing.
$("licenseOverlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget && card === "offer") closeOffer();
});

if (storeBuild) {
  if (devLicense) {
    applyDevLicense();
    launchOfferShown = true;
    offerOpen = !owned;
    computeAccessAndUI();
  } else {
    // Play's connection opens a moment after launch, so an early "no answer"
    // is tried again. The first answer, fresh or kept, is enough to draw.
    computeAccessAndUI();
    (async () => {
      for (const wait of [0, 2000, 6000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        await refreshLicense();
        if (playAnswered) break;
      }
    })();
    // Coming back to the app (from Play's purchase sheet, or from anywhere)
    // looks again: that is where a pending purchase clears, and where a buy
    // that never answered (pending) frees its button.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      busy = false;
      refreshLicense();
    });
  }
  // The days left, and the moment the trial ends, without waiting for a
  // restart.
  setInterval(() => {
    if (!owned && !setupPhase && trialStartMs) computeAccessAndUI();
  }, 60000);
}

// The browser's own right-click menu is kept where it is useful, which is
// anywhere words can be typed or selected: there it offers cut, copy, paste and
// select all. Everywhere else it only offered Refresh, Save As and Print, so it
// is blocked.
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest("input, textarea, [contenteditable='true']")) return;
  if (String(window.getSelection())) return;
  e.preventDefault();
});

invoke("app_version")
  .then((v) => {
    appVersionStr = v;
    updateBrandSub();
  })
  .catch(() => {});

loadAll();
if (!isAndroid) $("captureInput").focus();
