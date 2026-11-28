// Web build of Bear in Mind, served at eeriegoesd.com/bear-in-mind/.
//
// app.js is the desktop app's own script (bear-in-mind/src/main.js). It talks
// to the app through window.__TAURI__.core.invoke; this file answers those same
// calls from the browser instead: the list lives in this site's local storage,
// so it never leaves the machine and no server ever sees it.
//
// Loaded in <head>, before the page paints, so the saved theme is on from the
// first frame.

(function () {
  // Bumped by hand when this page changes. There is no manifest to read it from.
  const APP_VERSION = "1.0.3";

  // The same keys the earlier web build used, so a list already saved here is
  // still there after this update.
  const NOTES_KEY = "bim.notes";
  const SETTINGS_KEY = "bim.settings";

  let t = "dark";
  try {
    t = localStorage.getItem("bim.theme") === "light" ? "light" : "dark";
  } catch {}
  document.documentElement.setAttribute("data-theme", t);

  // Counts THAT something happened, never what it says. No entry text, no
  // description, no counts of what is on the list: only the name of the action.
  // Nothing is sent at all unless the visitor accepted the cookie banner, since
  // without that the analytics library is never loaded and this goes nowhere.
  function track(action) {
    try {
      if (typeof window.gtag === "function") window.gtag("event", action);
    } catch {}
  }

  // What the list looked like at the last save, to tell what just happened.
  const seen = new Set();
  const doneBefore = new Map();
  let importing = false;

  function remember(list) {
    doneBefore.clear();
    list.forEach((i) => {
      if (!i || !i.id) return;
      seen.add(i.id);
      doneBefore.set(i.id, !!i.done);
    });
  }

  function trackSave(list) {
    if (importing) {
      importing = false;
      track("list_imported");
    } else {
      list.forEach((i) => {
        if (!i || !i.id) return;
        // Undo puts back an id that was here before; that is not a new entry.
        if (!seen.has(i.id)) track("entry_added");
        else if (doneBefore.has(i.id) && doneBefore.get(i.id) !== !!i.done) {
          track(i.done ? "entry_done" : "entry_reopened");
        }
      });
    }
    remember(list);
  }

  function readNotes() {
    const raw = localStorage.getItem(NOTES_KEY);
    if (raw !== null) {
      try {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) remember(list);
      } catch {}
    }
    return raw === null ? "[]" : raw;
  }

  function download(data) {
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bear-in-mind.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    track("list_exported");
    return true;
  }

  // A file box opened by the Import button. Answers the text of the file, or
  // null when the box was closed without picking anything.
  function pickFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.hidden = true;
      document.body.appendChild(input);
      const done = () => input.remove();
      input.addEventListener("cancel", () => {
        done();
        resolve(null);
      });
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        done();
        if (!file) return resolve(null);
        file.text().then((text) => {
          importing = true;
          resolve(text);
        }, reject);
      });
      // Clicked in the same turn as the button press, or the browser refuses.
      input.click();
    });
  }

  // The account: the sync code and the address signed in, never the password.
  const SYNC_KEY = "bim.sync";

  function readSync() {
    try {
      const s = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}");
      return s && typeof s === "object" ? s : {};
    } catch {
      return {};
    }
  }

  function writeSync(field, value) {
    const s = readSync();
    s[field] = value;
    localStorage.setItem(SYNC_KEY, JSON.stringify(s));
  }

  const handlers = {
    get_notes: () => readNotes(),
    set_notes: ({ data, synced }) => {
      localStorage.setItem(NOTES_KEY, data);
      try {
        // A list that came from another device is not something done here.
        if (synced) remember(JSON.parse(data));
        else trackSave(JSON.parse(data));
      } catch {}
    },
    sync_code: () => readSync().code || "",
    set_sync_code: ({ code }) => writeSync("code", code),
    sync_email: () => readSync().email || "",
    set_sync_email: ({ email }) => writeSync("email", email),
    // Changes not sent yet when another device's newer list won, kept aside.
    park_conflict: ({ data }) => {
      localStorage.setItem(NOTES_KEY + ".conflict." + Date.now(), data);
    },
    get_settings: () => localStorage.getItem(SETTINGS_KEY) || "{}",
    set_settings: ({ data }) => localStorage.setItem(SETTINGS_KEY, data),
    export_to_file: ({ data }) => download(data),
    import_from_file: () => pickFile(),
    open_url: ({ url }) => {
      window.open(url, "_blank", "noopener");
    },
    app_version: () => APP_VERSION,
    // The page's own colours already follow the theme; a browser tab has no
    // frame of its own to repaint.
    set_window_theme: () => null,
    // What the list and its settings take up in this browser.
    cache_size: () =>
      (localStorage.getItem(NOTES_KEY) || "").length + (localStorage.getItem(SETTINGS_KEY) || "").length,
  };

  // Anything not listed (processor and memory use, purchases, reminders) is not
  // something a web page can do, so it fails quietly and that part stays empty.
  function invoke(cmd, args) {
    const fn = handlers[cmd];
    if (!fn) return Promise.reject(new Error("Not available in the browser."));
    try {
      return Promise.resolve(fn(args || {}));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  window.__TAURI__ = { core: { invoke } };
})();
