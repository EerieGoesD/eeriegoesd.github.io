/* Clock Yard: what each kind of element does. Everything is worked out from
   clock timestamps, never by counting ticks, so a timer stays right while the
   app is closed, asleep or in the background. No page code in here. */
(function () {
  "use strict";

  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const pad = (n) => String(n).padStart(2, "0");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------------------------------------------------------------- durations
  // A duration is kept as its parts ({ mo, d, h, m, s }) so "3 months" means
  // three calendar months from the moment the timer starts.
  const UNIT_KEYS = {
    full: ["mo", "d", "h", "m", "s"],
    dhms: ["d", "h", "m", "s"],
    hms: ["h", "m", "s"],
    ms: ["m", "s"],
    s: ["s"],
  };

  function num(v) {
    v = Math.floor(Number(v));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function dur(o) {
    o = o || {};
    return { mo: num(o.mo), d: num(o.d), h: num(o.h), m: num(o.m), s: num(o.s) };
  }

  function addDur(from, d) {
    const p = dur(d);
    let t = from;
    if (p.mo) {
      const date = new Date(from);
      const day = date.getDate();
      date.setMonth(date.getMonth() + p.mo);
      // 31 January plus one month is the last day of February, not 3 March.
      if (date.getDate() < day) date.setDate(0);
      t = date.getTime();
    }
    return t + p.d * DAY + p.h * HOUR + p.m * MIN + p.s * SEC;
  }

  function durMs(d, from) {
    const f = from == null ? Date.now() : from;
    return addDur(f, d) - f;
  }

  function isZero(d) {
    const p = dur(d);
    return !(p.mo || p.d || p.h || p.m || p.s);
  }

  // Milliseconds back into parts, for the units an element counts in.
  function fromMs(ms, units) {
    let s = Math.max(0, Math.round(ms / SEC));
    const keys = UNIT_KEYS[units] || UNIT_KEYS.dhms;
    const out = { mo: 0, d: 0, h: 0, m: 0, s: 0 };
    if (keys.includes("d")) { out.d = Math.floor(s / 86400); s -= out.d * 86400; }
    if (keys.includes("h")) { out.h = Math.floor(s / 3600); s -= out.h * 3600; }
    if (keys.includes("m")) { out.m = Math.floor(s / 60); s -= out.m * 60; }
    out.s = s;
    return out;
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function describe(d) {
    const p = dur(d);
    const parts = [];
    if (p.mo) parts.push(plural(p.mo, "month", "months"));
    if (p.d) parts.push(plural(p.d, "day", "days"));
    if (p.h) parts.push(plural(p.h, "hour", "hours"));
    if (p.m) parts.push(p.m + " min");
    if (p.s) parts.push(p.s + " s");
    return parts.join(" ") || "0 s";
  }

  // --------------------------------------------------------------- formatting
  function splitSec(total) {
    const d = Math.floor(total / 86400);
    total -= d * 86400;
    const h = Math.floor(total / 3600);
    total -= h * 3600;
    const m = Math.floor(total / 60);
    return { d, h, m, s: total - m * 60 };
  }

  // Time left on a countdown: rounded up, so it reads 00:01 until it is done.
  function fmtLeft(ms) {
    const t = splitSec(Math.ceil(Math.max(0, ms) / SEC));
    if (t.d) return `${t.d}d ${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`;
    if (t.h) return `${t.h}:${pad(t.m)}:${pad(t.s)}`;
    return `${pad(t.m)}:${pad(t.s)}`;
  }

  // Time gone by: rounded down.
  function fmtElapsed(ms) {
    const t = splitSec(Math.floor(Math.max(0, ms) / SEC));
    if (t.d) return `${t.d}d ${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`;
    if (t.h) return `${t.h}:${pad(t.m)}:${pad(t.s)}`;
    return `${pad(t.m)}:${pad(t.s)}`;
  }

  // In the units the user picked for a count-up or interval timer.
  function fmtUnits(ms, units, roundUp) {
    const raw = Math.max(0, ms) / SEC;
    const s = roundUp ? Math.ceil(raw) : Math.floor(raw);
    switch (units) {
      case "s":
        return String(s);
      case "ms":
        return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      case "hms":
        return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
      default: {
        const t = splitSec(s);
        return `${t.d}d ${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`;
      }
    }
  }

  function fmtStopwatch(ms) {
    const t = splitSec(Math.floor(Math.max(0, ms) / 1000));
    const h = t.d * 24 + t.h;
    if (h) return `${h}:${pad(t.m)}:${pad(t.s)}`;
    return `${pad(t.m)}:${pad(t.s)}`;
  }

  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
  const yearFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

  // A moment, as short as it can be and still be clear.
  function fmtTime(ms, now) {
    const n = now == null ? Date.now() : now;
    const a = new Date(ms);
    const b = new Date(n);
    const sameDay = a.toDateString() === b.toDateString();
    if (sameDay) return timeFmt.format(a);
    const days = Math.abs(ms - n) / DAY;
    if (days < 6) return dayFmt.format(a) + " " + timeFmt.format(a);
    if (a.getFullYear() === b.getFullYear()) return dateFmt.format(a) + ", " + timeFmt.format(a);
    return yearFmt.format(a);
  }

  // -------------------------------------------------------------- kinds
  const TYPES = {
    countdown: { label: "Countdown", desc: "Counts down a set time. Can repeat and start later." },
    quick: { label: "Quick timer", desc: "A countdown you set the moment you start it." },
    countup: { label: "Count-up", desc: "Counts up from a chosen point, with alerts on the way." },
    pomodoro: { label: "Pomodoro", desc: "Work and break intervals in cycles." },
    interval: { label: "Interval", desc: "A run of intervals and repeats, like a workout." },
    stopwatch: { label: "Stopwatch", desc: "Measures how long something takes, with laps." },
    counter: { label: "Counter", desc: "Counts up or down in steps, to a final value." },
    clock: { label: "Clock", desc: "The time in any time zone." },
    container: { label: "Container", desc: "Shows and runs the timers of another board." },
    buttons: { label: "Buttons", desc: "Buttons that start, pause or reset other timers." },
  };
  const ORDER = Object.keys(TYPES);
  // Kinds that run and can be started, paused and reset.
  const RUNNABLE = new Set(["countdown", "quick", "countup", "pomodoro", "interval", "stopwatch"]);

  const alertCfg = (sound) => ({ sound: sound || "chime", ring: false, notify: true });

  function localHourCycle() {
    try {
      const hc = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
      return hc === "h11" || hc === "h12" ? "12" : "24";
    } catch {
      return "24";
    }
  }

  const DEFAULTS = {
    countdown: () => ({
      dur: { m: 5 }, loop: false, delay: {}, autoReset: false, extra: "finish",
      alert: alertCfg("chime"), add: [], note: "",
    }),
    quick: () => ({
      autoReset: false, extra: "finish", alert: alertCfg("chime"), add: [], last: { m: 5 },
    }),
    countup: () => ({
      units: "hms", preset: {}, alerts: [], extra: "start", alert: alertCfg("bell"), add: [],
    }),
    pomodoro: () => ({
      work: { m: 25 }, brk: { m: 5 }, long: { m: 15 }, cycle: 4,
      workAlert: alertCfg("bell"), breakAlert: alertCfg("chime"),
    }),
    interval: () => ({
      pauseBetween: false, autoReset: true, extra: "overall", units: "ms", add: [], note: "",
      items: [
        { kind: "interval", id: uid(), name: "Get ready", dur: { s: 5 }, sound: "beep", repeat: 1, note: "" },
        {
          kind: "group", id: uid(), name: "Rounds", repeat: 4,
          items: [
            { kind: "interval", id: uid(), name: "Work", dur: { s: 30 }, sound: "beep", repeat: 1, note: "" },
            { kind: "interval", id: uid(), name: "Rest", dur: { s: 10 }, sound: "chime", repeat: 1, note: "" },
          ],
        },
      ],
    }),
    stopwatch: () => ({ mode: "single", extra: "start" }),
    counter: () => ({ mode: "both", initial: 0, step: 1, final: null, alert: alertCfg("chime") }),
    clock: () => ({ tz: "", mode: "digital", fmt: localHourCycle() }),
    container: () => ({ board: "" }),
    buttons: () => ({
      buttons: [
        { id: uid(), label: "Start all", action: "start", target: "*" },
        { id: uid(), label: "Pause all", action: "pause", target: "*" },
        { id: uid(), label: "Reset all", action: "reset", target: "*" },
      ],
    }),
  };

  function create(type, name) {
    const el = {
      id: uid(), type, name: name || "", cfg: DEFAULTS[type](), run: { st: "idle" },
      hist: [], laps: [], results: [], value: 0, created: Date.now(),
    };
    if (type === "counter") el.value = el.cfg.initial;
    return el;
  }

  // Fills in anything an older save did not have.
  function normalize(el) {
    if (!el || !TYPES[el.type]) return null;
    el.cfg = Object.assign(DEFAULTS[el.type](), el.cfg || {});
    if (!el.run || typeof el.run.st !== "string") el.run = { st: "idle" };
    if (!Array.isArray(el.hist)) el.hist = [];
    if (!Array.isArray(el.laps)) el.laps = [];
    if (!Array.isArray(el.results)) el.results = [];
    if (typeof el.value !== "number") el.value = el.type === "counter" ? Number(el.cfg.initial) || 0 : 0;
    if (typeof el.name !== "string") el.name = "";
    return el;
  }

  function pushHist(el, entry) {
    el.hist.unshift(entry);
    if (el.hist.length > 50) el.hist.length = 50;
  }

  function noteBody(el, text) {
    const note = (el.cfg.note || "").trim();
    return note ? `${text} ${note}` : text;
  }

  // ----------------------------------------------------- countdown and quick
  const cd = {
    dur(el) {
      return el.type === "quick" ? el.run.dur || el.cfg.last : el.cfg.dur;
    },
    start(el, now, opts) {
      if (el.type === "quick") {
        const d = opts && opts.dur;
        if (!d || isZero(d)) return false;
        el.cfg.last = dur(d);
        const endAt = addDur(now, d);
        el.run = { st: "running", dur: dur(d), startedAt: now, endAt, total: endAt - now, round: 1 };
        return true;
      }
      const d = el.cfg.dur;
      if (isZero(d)) return false;
      const delay = durMs(el.cfg.delay, now);
      if (delay > 0) {
        el.run = { st: "delay", delayEnd: now + delay, round: 1 };
      } else {
        const endAt = addDur(now, d);
        el.run = { st: "running", startedAt: now, endAt, total: endAt - now, round: 1 };
      }
      return true;
    },
    pause(el, now) {
      const r = el.run;
      if (r.st === "running") {
        el.run = { st: "paused", left: Math.max(0, r.endAt - now), total: r.total,
          startedAt: r.startedAt, round: r.round, dur: r.dur };
      } else if (r.st === "delay") {
        el.run = { st: "paused", inDelay: true, left: Math.max(0, r.delayEnd - now), round: r.round };
      }
    },
    resume(el, now) {
      const r = el.run;
      if (r.st !== "paused") return;
      if (r.inDelay) {
        el.run = { st: "delay", delayEnd: now + r.left, round: r.round };
      } else {
        el.run = { st: "running", endAt: now + r.left, total: r.total, startedAt: r.startedAt,
          round: r.round, dur: r.dur };
      }
    },
    reset(el, now) {
      const r = el.run;
      if (r.startedAt && (r.st === "running" || r.st === "paused")) {
        pushHist(el, { start: r.startedAt, end: now, ms: now - r.startedAt, result: "Stopped" });
      }
      el.run = { st: "idle" };
    },
    addTime(el, ms, now) {
      const r = el.run;
      if (r.st === "running") {
        r.endAt = Math.max(now, r.endAt + ms);
        r.total = Math.max(1, r.total + ms);
      } else if (r.st === "paused" && !r.inDelay) {
        r.left = Math.max(0, r.left + ms);
        r.total = Math.max(1, r.total + ms);
      } else if (r.st === "done" && ms > 0) {
        // A few more minutes on a timer that just rang: it runs again.
        el.run = { st: "running", startedAt: now, endAt: now + ms, total: ms, round: r.round || 1, dur: r.dur };
      }
    },
    tick(el, now, fire) {
      let r = el.run;
      if (r.st === "delay" && now >= r.delayEnd) {
        const s = r.delayEnd;
        const endAt = addDur(s, el.cfg.dur);
        el.run = r = { st: "running", startedAt: s, endAt, total: endAt - s, round: r.round || 1 };
      }
      let guard = 0;
      while (r.st === "running" && now >= r.endAt && guard++ < 1000) {
        const at = r.endAt;
        pushHist(el, { start: r.startedAt, end: at, ms: at - r.startedAt, result: "Finished" });
        const loop = el.type === "countdown" && el.cfg.loop;
        fire({ el, at, kind: "done", alert: el.cfg.alert,
          body: noteBody(el, loop ? "Time is up. Starting again." : "Time is up.") });
        if (loop) {
          let next = addDur(at, el.cfg.dur);
          if (next <= at) { el.run = { st: "idle" }; break; }
          let start = at;
          const step = next - at;
          // Back after a long time away: jump straight to the current round.
          if (now - at > 20 * step) {
            const k = Math.floor((now - at) / step);
            start = at + k * step;
            next = start + step;
            r.round = (r.round || 1) + k;
          }
          r.startedAt = start;
          r.endAt = next;
          r.total = next - start;
          r.round = (r.round || 1) + 1;
        } else if (el.cfg.autoReset) {
          el.run = r = { st: "idle" };
        } else {
          el.run = r = { st: "done", startedAt: r.startedAt, finishedAt: at, total: r.total, round: r.round, dur: r.dur };
        }
      }
    },
    view(el, now) {
      const r = el.run;
      const c = el.cfg;
      const v = { ring: 1, remaining: null, eta: null };
      const extraLine = (startedAt, endAt) => {
        if (c.extra === "start" && startedAt) return "Started " + fmtTime(startedAt, now);
        if ((c.extra === "finish" || c.extra === "overtime") && endAt) return "Ends " + fmtTime(endAt, now);
        return "";
      };
      const roundTag = el.type === "countdown" && c.loop && r.round > 1 ? `Round ${r.round}` : "";
      if (r.st === "idle") {
        if (el.type === "quick") {
          v.main = fmtLeft(durMs(c.last, now));
          v.sub = "Time set at start";
          v.dim = true;
        } else {
          const ms = durMs(c.dur, now);
          v.main = fmtLeft(ms);
          v.remaining = ms;
          const bits = [describe(c.dur)];
          if (c.loop) bits.push("repeats");
          if (!isZero(c.delay)) bits.push("starts after " + describe(c.delay));
          v.sub = bits.join(" · ");
        }
      } else if (r.st === "delay") {
        const ms = durMs(c.dur, r.delayEnd);
        v.main = fmtLeft(ms);
        v.sub = "Starts in " + fmtLeft(r.delayEnd - now);
        v.remaining = r.delayEnd - now + ms;
        v.eta = r.delayEnd + ms;
      } else if (r.st === "running") {
        const left = r.endAt - now;
        v.main = fmtLeft(left);
        v.ring = r.total > 0 ? Math.max(0, Math.min(1, left / r.total)) : 0;
        v.remaining = Math.max(0, left);
        v.eta = r.endAt;
        v.sub = [roundTag, extraLine(r.startedAt, r.endAt)].filter(Boolean).join(" · ");
      } else if (r.st === "paused") {
        v.main = fmtLeft(r.left);
        v.remaining = r.left;
        if (r.inDelay) {
          v.sub = "Paused before the start";
        } else {
          v.ring = r.total > 0 ? Math.max(0, Math.min(1, r.left / r.total)) : 0;
          v.sub = [roundTag, "Paused"].filter(Boolean).join(" · ");
        }
      } else if (r.st === "done") {
        v.main = fmtLeft(0);
        v.ring = 0;
        v.remaining = 0;
        if (c.extra === "overtime") v.sub = "Overtime +" + fmtElapsed(now - r.finishedAt);
        else if (c.extra === "finish") v.sub = "Done at " + fmtTime(r.finishedAt, now);
        else if (c.extra === "start" && r.startedAt) v.sub = "Done · started " + fmtTime(r.startedAt, now);
        else v.sub = "Done";
      }
      return v;
    },
    upcoming(el, now) {
      const r = el.run;
      const c = el.cfg;
      if (!c.alert.notify) return [];
      const out = [];
      const loop = el.type === "countdown" && c.loop;
      const body = noteBody(el, loop ? "Time is up. Starting again." : "Time is up.");
      let at = null;
      if (r.st === "running") at = r.endAt;
      else if (r.st === "delay") at = addDur(r.delayEnd, c.dur);
      if (at == null) return out;
      out.push({ at, body });
      if (loop) {
        for (let k = 0; k < 8; k++) {
          const next = addDur(at, c.dur);
          if (next <= at) break;
          at = next;
          out.push({ at, body });
        }
      }
      return out;
    },
  };

  // ---------------------------------------------------------------- count-up
  const cu = {
    marks(el) {
      return (el.cfg.alerts || [])
        .map((a) => durMs(a, 0))
        .filter((ms) => ms > 0)
        .sort((a, b) => a - b);
    },
    elapsed(el, now) {
      const r = el.run;
      if (r.st === "running") return Math.max(0, now - r.origin);
      if (r.st === "paused") return r.elapsed;
      return durMs(el.cfg.preset, 0);
    },
    start(el, now) {
      const preset = durMs(el.cfg.preset, 0);
      const marks = cu.marks(el);
      el.run = { st: "running", origin: now - preset, startedAt: now, fired: marks.filter((m) => m <= preset).length };
      return true;
    },
    pause(el, now) {
      const r = el.run;
      if (r.st === "running") el.run = { st: "paused", elapsed: now - r.origin, startedAt: r.startedAt, fired: r.fired };
    },
    resume(el, now) {
      const r = el.run;
      if (r.st === "paused") el.run = { st: "running", origin: now - r.elapsed, startedAt: r.startedAt, fired: r.fired };
    },
    reset(el, now) {
      const r = el.run;
      if (r.st === "running" || r.st === "paused") {
        pushHist(el, { start: r.startedAt, end: now, ms: cu.elapsed(el, now), result: "Stopped" });
      }
      el.run = { st: "idle" };
    },
    addTime(el, ms, now) {
      const r = el.run;
      if (r.st === "running") r.origin = Math.min(now, r.origin - ms);
      else if (r.st === "paused") r.elapsed = Math.max(0, r.elapsed + ms);
      else return;
      // Taking time off can put an alert back in front of the timer.
      const e = cu.elapsed(el, now);
      r.fired = cu.marks(el).filter((m) => m <= e).length;
    },
    tick(el, now, fire) {
      const r = el.run;
      if (r.st !== "running") return;
      const marks = cu.marks(el);
      while (r.fired < marks.length && now - r.origin >= marks[r.fired]) {
        const m = marks[r.fired];
        fire({ el, at: r.origin + m, kind: "alert", alert: el.cfg.alert,
          body: fmtUnits(m, el.cfg.units) + " reached." });
        r.fired++;
      }
    },
    view(el, now) {
      const r = el.run;
      const c = el.cfg;
      const e = cu.elapsed(el, now);
      const marks = cu.marks(el);
      const fired = r.st === "idle" ? marks.filter((m) => m <= e).length : r.fired || 0;
      const next = marks[fired];
      const v = { main: fmtUnits(e, c.units), remaining: null, eta: null };
      v.ring = next ? Math.min(1, e / next) : (e % MIN) / MIN;
      if (r.st === "running" && next) {
        v.remaining = r.origin + next - now;
        v.eta = r.origin + next;
      }
      let line = "";
      if (r.st === "idle") {
        line = marks.length ? plural(marks.length, "alert", "alerts") : "";
        if (!isZero(c.preset)) line = ["From " + fmtUnits(durMs(c.preset, 0), c.units), line].filter(Boolean).join(" · ");
      } else if (c.extra === "start") {
        line = "Started " + fmtTime(r.startedAt, now);
      } else if (c.extra === "next") {
        line = next ? "Next alert at " + fmtUnits(next, c.units) : "No more alerts";
      }
      if (r.st === "paused") line = ["Paused", line].filter(Boolean).join(" · ");
      v.sub = line;
      return v;
    },
    upcoming(el, now) {
      const r = el.run;
      if (r.st !== "running" || !el.cfg.alert.notify) return [];
      return cu.marks(el)
        .filter((m) => r.origin + m > now)
        .slice(0, 20)
        .map((m) => ({ at: r.origin + m, body: fmtUnits(m, el.cfg.units) + " reached." }));
    },
  };

  // ---------------------------------------------------------------- pomodoro
  const po = {
    kind(i, cycle) {
      if (i % 2 === 0) return "work";
      const done = (i + 1) / 2;
      return done % Math.max(1, num(cycle) || 1) === 0 ? "long" : "break";
    },
    len(el, i, from) {
      const k = po.kind(i, el.cfg.cycle);
      return durMs(k === "work" ? el.cfg.work : k === "long" ? el.cfg.long : el.cfg.brk, from);
    },
    label(el, i) {
      const k = po.kind(i, el.cfg.cycle);
      if (k === "work") {
        const cycle = Math.max(1, num(el.cfg.cycle) || 1);
        return `Work ${(Math.floor(i / 2) % cycle) + 1} of ${cycle}`;
      }
      return k === "long" ? "Long break" : "Break";
    },
    body(el, i) {
      const k = po.kind(i, el.cfg.cycle);
      if (k === "work") {
        return po.kind(i + 1, el.cfg.cycle) === "long" ? "Work session done. Long break now." : "Work session done. Break now.";
      }
      return "Break is over. Back to work.";
    },
    start(el, now) {
      const len = po.len(el, 0, now);
      if (len <= 0) return false;
      el.run = { st: "running", i: 0, phaseStart: now, phaseEnd: now + len, startedAt: now };
      return true;
    },
    pause(el, now) {
      const r = el.run;
      if (r.st === "running") {
        el.run = { st: "paused", i: r.i, left: Math.max(0, r.phaseEnd - now), len: r.phaseEnd - r.phaseStart, startedAt: r.startedAt };
      }
    },
    resume(el, now) {
      const r = el.run;
      if (r.st === "paused") {
        el.run = { st: "running", i: r.i, phaseEnd: now + r.left, phaseStart: now + r.left - r.len, startedAt: r.startedAt };
      }
    },
    reset(el, now) {
      const r = el.run;
      if (r.st === "running" || r.st === "paused") {
        const sessions = Math.ceil(r.i / 2);
        pushHist(el, { start: r.startedAt, end: now, ms: now - r.startedAt, result: plural(sessions, "work session", "work sessions") });
      }
      el.run = { st: "idle" };
    },
    addTime(el, ms, now) {
      const r = el.run;
      if (r.st === "running") {
        r.phaseEnd = Math.max(now, r.phaseEnd + ms);
      } else if (r.st === "paused") {
        r.left = Math.max(0, r.left + ms);
        r.len = Math.max(1, r.len + ms);
      }
    },
    tick(el, now, fire) {
      const r = el.run;
      let guard = 0;
      while (r.st === "running" && now >= r.phaseEnd && guard++ < 2000) {
        const k = po.kind(r.i, el.cfg.cycle);
        fire({ el, at: r.phaseEnd, kind: k === "work" ? "work" : "break",
          alert: k === "work" ? el.cfg.workAlert : el.cfg.breakAlert, body: po.body(el, r.i) });
        if (k === "work") pushHist(el, { start: r.phaseStart, end: r.phaseEnd, ms: r.phaseEnd - r.phaseStart, result: "Work session" });
        r.i++;
        r.phaseStart = r.phaseEnd;
        const len = po.len(el, r.i, r.phaseStart);
        if (len <= 0) { el.run = { st: "idle" }; break; }
        r.phaseEnd = r.phaseStart + len;
      }
    },
    view(el, now) {
      const r = el.run;
      const c = el.cfg;
      if (r.st === "idle") {
        return {
          main: fmtLeft(durMs(c.work, now)), ring: 1, remaining: durMs(c.work, now), eta: null,
          sub: `${describe(c.work)} work · ${describe(c.brk)} break`,
        };
      }
      const running = r.st === "running";
      const left = running ? r.phaseEnd - now : r.left;
      const len = running ? r.phaseEnd - r.phaseStart : r.len;
      const label = po.label(el, r.i);
      return {
        main: fmtLeft(left),
        ring: len > 0 ? Math.max(0, Math.min(1, left / len)) : 0,
        remaining: Math.max(0, left),
        eta: running ? r.phaseEnd : null,
        sub: running ? `${label} · ends ${fmtTime(r.phaseEnd, now)}` : `${label} · Paused`,
        phase: po.kind(r.i, c.cycle),
      };
    },
    upcoming(el, now) {
      const r = el.run;
      if (r.st !== "running") return [];
      const out = [];
      let i = r.i;
      let end = r.phaseEnd;
      for (let k = 0; k < 16; k++) {
        const kind = po.kind(i, el.cfg.cycle);
        const a = kind === "work" ? el.cfg.workAlert : el.cfg.breakAlert;
        if (a.notify && end > now) out.push({ at: end, body: po.body(el, i) });
        i++;
        const len = po.len(el, i, end);
        if (len <= 0) break;
        end += len;
      }
      return out;
    },
  };

  // ---------------------------------------------------------------- interval
  const iv = {
    // Every interval in play order, with groups and repeats spelled out.
    steps(el) {
      const out = [];
      const walk = (items, ctx) => {
        for (const it of items || []) {
          if (!it) continue;
          if (it.kind === "group") {
            const reps = Math.max(1, num(it.repeat) || 1);
            for (let k = 0; k < reps; k++) {
              walk(it.items, { group: it.name || "Group", round: k + 1, rounds: reps });
            }
          } else {
            const ms = durMs(it.dur, 0);
            if (ms <= 0) continue;
            const reps = Math.max(1, num(it.repeat) || 1);
            for (let k = 0; k < reps; k++) {
              out.push({ name: it.name || "Interval", ms, sound: it.sound || "chime", note: it.note || "",
                rep: k + 1, reps, group: ctx.group, round: ctx.round, rounds: ctx.rounds });
            }
          }
        }
      };
      walk(el.cfg.items, {});
      return out;
    },
    label(s) {
      let t = s.name;
      if (s.reps > 1) t += ` ${s.rep}/${s.reps}`;
      if (s.group && s.rounds > 1) t += ` · ${s.group} ${s.round}/${s.rounds}`;
      return t;
    },
    rest(steps, i) {
      let t = 0;
      for (let j = i + 1; j < steps.length; j++) t += steps[j].ms;
      return t;
    },
    start(el, now) {
      const S = iv.steps(el);
      if (!S.length) return false;
      el.run = { st: "running", i: 0, stepEnd: now + S[0].ms, startedAt: now };
      return true;
    },
    pause(el, now) {
      const r = el.run;
      if (r.st === "running") el.run = { st: "paused", i: r.i, left: Math.max(0, r.stepEnd - now), startedAt: r.startedAt };
    },
    resume(el, now) {
      const r = el.run;
      const S = iv.steps(el);
      if (r.st === "paused") {
        el.run = { st: "running", i: r.i, stepEnd: now + r.left, startedAt: r.startedAt };
      } else if (r.st === "waiting" && S[r.i]) {
        el.run = { st: "running", i: r.i, stepEnd: now + S[r.i].ms, startedAt: r.startedAt };
      }
    },
    reset(el, now) {
      const r = el.run;
      if (r.st === "running" || r.st === "paused" || r.st === "waiting") {
        pushHist(el, { start: r.startedAt, end: now, ms: now - r.startedAt, result: "Stopped" });
      }
      el.run = { st: "idle" };
    },
    addTime(el, ms, now) {
      const r = el.run;
      if (r.st === "running") r.stepEnd = Math.max(now, r.stepEnd + ms);
      else if (r.st === "paused") r.left = Math.max(0, r.left + ms);
    },
    tick(el, now, fire) {
      let r = el.run;
      if (r.st !== "running") return;
      const S = iv.steps(el);
      let guard = 0;
      while (r.st === "running" && now >= r.stepEnd && guard++ < 5000) {
        const s = S[r.i];
        if (!s) { el.run = { st: "idle" }; return; }
        const last = r.i >= S.length - 1;
        const at = r.stepEnd;
        fire({ el, at, kind: last ? "done" : "step", alert: { sound: s.sound, ring: false, notify: true },
          body: last ? "All intervals done." : `${s.name} done. Next: ${S[r.i + 1].name}.` });
        if (last) {
          pushHist(el, { start: r.startedAt, end: at, ms: at - r.startedAt, result: "Finished" });
          el.run = el.cfg.autoReset ? { st: "idle" } : { st: "done", startedAt: r.startedAt, finishedAt: at };
          return;
        }
        r.i++;
        if (el.cfg.pauseBetween) {
          el.run = r = { st: "waiting", i: r.i, startedAt: r.startedAt };
          return;
        }
        r.stepEnd += S[r.i].ms;
      }
    },
    view(el, now) {
      const r = el.run;
      const c = el.cfg;
      const S = iv.steps(el);
      const total = S.reduce((t, s) => t + s.ms, 0);
      const v = { ring: 1, remaining: null, eta: null };
      if (r.st === "idle") {
        v.main = fmtUnits(total, c.units, true);
        v.sub = S.length ? `${plural(S.length, "interval", "intervals")} · ${fmtElapsed(total)} in all` : "No intervals yet";
        v.remaining = total;
        return v;
      }
      if (r.st === "done") {
        v.main = fmtUnits(0, c.units, true);
        v.ring = 0;
        v.remaining = 0;
        v.sub = "Done at " + fmtTime(r.finishedAt, now);
        return v;
      }
      const s = S[r.i];
      if (!s) {
        v.main = fmtUnits(0, c.units, true);
        v.sub = "";
        return v;
      }
      if (r.st === "waiting") {
        v.main = fmtUnits(s.ms, c.units, true);
        v.sub = `Next: ${iv.label(s)} · tap to continue`;
        v.remaining = s.ms + iv.rest(S, r.i);
        return v;
      }
      const left = r.st === "running" ? r.stepEnd - now : r.left;
      const after = iv.rest(S, r.i);
      v.main = fmtUnits(left, c.units, true);
      v.ring = Math.max(0, Math.min(1, left / s.ms));
      v.remaining = Math.max(0, left) + after;
      v.eta = r.st === "running" && !c.pauseBetween ? now + left + after : null;
      let extra = "";
      if (c.extra === "overall") extra = "Total left " + fmtUnits(left + after, c.units, true);
      else if (c.extra === "start") extra = "Started " + fmtTime(r.startedAt, now);
      else if (c.extra === "finish" && r.st === "running") extra = "Ends " + fmtTime(now + left + after, now);
      v.sub = [iv.label(s), r.st === "paused" ? "Paused" : extra].filter(Boolean).join(" · ");
      v.step = s;
      return v;
    },
    upcoming(el, now) {
      const r = el.run;
      if (r.st !== "running") return [];
      const S = iv.steps(el);
      const out = [];
      let at = r.stepEnd;
      for (let i = r.i; i < S.length && out.length < 40; i++) {
        if (i > r.i) at += S[i].ms;
        const last = i === S.length - 1;
        if (at > now) out.push({ at, body: last ? "All intervals done." : `${S[i].name} done. Next: ${S[i + 1].name}.` });
        if (el.cfg.pauseBetween) break;
      }
      return out;
    },
  };

  // --------------------------------------------------------------- stopwatch
  const sw = {
    elapsed(el, now) {
      const r = el.run;
      if (r.st === "running") return Math.max(0, now - r.origin);
      if (r.st === "paused") return r.elapsed;
      return 0;
    },
    start(el, now) {
      el.run = { st: "running", origin: now, startedAt: now };
      el.laps = [];
      return true;
    },
    pause(el, now) {
      const r = el.run;
      if (r.st === "running") el.run = { st: "paused", elapsed: now - r.origin, startedAt: r.startedAt };
    },
    resume(el, now) {
      const r = el.run;
      if (r.st === "paused") el.run = { st: "running", origin: now - r.elapsed, startedAt: r.startedAt };
    },
    lap(el, now) {
      if (el.run.st === "running") el.laps.push(sw.elapsed(el, now));
    },
    reset(el, now) {
      const r = el.run;
      if (r.st === "running" || r.st === "paused") {
        const ms = sw.elapsed(el, now);
        pushHist(el, { start: r.startedAt, end: now, ms, result: el.laps.length ? plural(el.laps.length, "lap", "laps") : "Stopped" });
        if (el.cfg.mode === "multiple" && ms > 0) {
          el.results.unshift({ at: r.startedAt, ms, laps: el.laps.slice() });
          if (el.results.length > 50) el.results.length = 50;
        }
      }
      el.laps = [];
      el.run = { st: "idle" };
    },
    tick() {},
    view(el, now) {
      const r = el.run;
      const e = sw.elapsed(el, now);
      let sub = "";
      if (r.st !== "idle") {
        if (el.cfg.extra === "start") sub = "Started " + fmtTime(r.startedAt, now);
        else if (el.cfg.extra === "laps" && el.laps.length) {
          const n = el.laps.length;
          sub = `${plural(n, "lap", "laps")} · last ${fmtStopwatch(el.laps[n - 1] - (el.laps[n - 2] || 0))}`;
        }
        if (r.st === "paused") sub = ["Paused", sub].filter(Boolean).join(" · ");
      } else {
        sub = el.cfg.mode === "multiple" && el.results.length ? plural(el.results.length, "measurement", "measurements") : "";
      }
      return { main: fmtStopwatch(e), sub, ring: (e % MIN) / MIN, remaining: null, eta: null };
    },
    upcoming() { return []; },
  };

  // ----------------------------------------------------------------- counter
  const co = {
    round(v) { return Math.round(v * 1e6) / 1e6; },
    step(el, dir, now, fire) {
      const c = el.cfg;
      if ((c.mode === "inc" && dir < 0) || (c.mode === "dec" && dir > 0)) return;
      const step = Math.abs(Number(c.step)) || 1;
      const before = el.value;
      let v = co.round(before + dir * step);
      const fin = c.final === null || c.final === "" || c.final === undefined ? null : Number(c.final);
      if (fin !== null && Number.isFinite(fin)) {
        // Once at the final value it stays there in the direction it was heading.
        const init = Number(c.initial) || 0;
        if ((dir > 0 && before >= fin && fin >= init) || (dir < 0 && before <= fin && fin <= init)) return;
        const crossedUp = dir > 0 && before < fin && v >= fin;
        const crossedDown = dir < 0 && before > fin && v <= fin;
        if (crossedUp || crossedDown) {
          v = fin;
          if (fire) fire({ el, at: now, kind: "done", alert: c.alert, body: "Reached " + fin + "." });
        }
      }
      el.value = v;
    },
    reset(el) {
      el.value = Number(el.cfg.initial) || 0;
    },
    view(el) {
      const c = el.cfg;
      const fin = c.final === null || c.final === "" || c.final === undefined ? null : Number(c.final);
      const init = Number(c.initial) || 0;
      let ring = null;
      if (fin !== null && Number.isFinite(fin) && fin !== init) ring = Math.max(0, Math.min(1, (el.value - init) / (fin - init)));
      const sub = fin !== null && Number.isFinite(fin) ? (el.value === fin ? "Final value reached" : "Counting to " + fin) : "Step " + (Math.abs(Number(c.step)) || 1);
      return { main: Number(el.value).toLocaleString(undefined, { maximumFractionDigits: 6 }), sub, ring, remaining: null, eta: null };
    },
  };

  // ------------------------------------------------------------------- clock
  const clockFmts = new Map();
  const cl = {
    zones() {
      try {
        return Intl.supportedValuesOf("timeZone");
      } catch {
        return ["UTC", "Europe/London", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin", "America/New_York",
          "America/Chicago", "America/Denver", "America/Los_Angeles", "Asia/Tokyo", "Asia/Shanghai",
          "Asia/Kolkata", "Australia/Sydney"];
      }
    },
    city(tz) {
      if (!tz) return "Local time";
      const last = tz.split("/").pop();
      return last.replace(/_/g, " ");
    },
    fmt(el, withSeconds) {
      const key = `${el.cfg.tz}|${el.cfg.fmt}|${withSeconds ? 1 : 0}`;
      let f = clockFmts.get(key);
      if (!f) {
        const twelve = el.cfg.fmt === "12";
        const o = { hour: twelve ? "numeric" : "2-digit", minute: "2-digit", hourCycle: twelve ? "h12" : "h23" };
        if (withSeconds) o.second = "2-digit";
        if (el.cfg.tz) o.timeZone = el.cfg.tz;
        try {
          f = new Intl.DateTimeFormat(undefined, o);
        } catch {
          delete o.timeZone;
          f = new Intl.DateTimeFormat(undefined, o);
        }
        clockFmts.set(key, f);
      }
      return f;
    },
    parts(el, now) {
      const key = `${el.cfg.tz}|parts`;
      let f = clockFmts.get(key);
      if (!f) {
        const o = { hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "short" };
        if (el.cfg.tz) o.timeZone = el.cfg.tz;
        try {
          f = new Intl.DateTimeFormat("en-GB", o);
        } catch {
          delete o.timeZone;
          f = new Intl.DateTimeFormat("en-GB", o);
        }
        clockFmts.set(key, f);
      }
      const p = {};
      for (const x of f.formatToParts(new Date(now))) p[x.type] = x.value;
      return { h: Number(p.hour) % 24, m: Number(p.minute), s: Number(p.second), day: p.weekday };
    },
    offset(el, now) {
      if (!el.cfg.tz) return "";
      try {
        const f = new Intl.DateTimeFormat("en-US", { timeZone: el.cfg.tz, timeZoneName: "shortOffset" });
        const part = f.formatToParts(new Date(now)).find((x) => x.type === "timeZoneName");
        return part ? part.value : "";
      } catch {
        return "";
      }
    },
    view(el, now) {
      const p = cl.parts(el, now);
      const off = cl.offset(el, now);
      return {
        main: cl.fmt(el, false).format(new Date(now)),
        sub: [cl.city(el.cfg.tz), p.day, off].filter(Boolean).join(" · "),
        ring: null, remaining: null, eta: null, hands: p,
      };
    },
  };

  // ----------------------------------------------------------------- generic
  const IMPL = { countdown: cd, quick: cd, countup: cu, pomodoro: po, interval: iv, stopwatch: sw };

  const E = {
    SEC, MIN, HOUR, DAY, TYPES, ORDER, UNIT_KEYS, RUNNABLE,
    uid, dur, addDur, durMs, isZero, fromMs, describe,
    fmtLeft, fmtElapsed, fmtUnits, fmtStopwatch, fmtTime,
    create, normalize, defaults: (t) => DEFAULTS[t](), steps: iv.steps, intervalLabel: iv.label,
    zones: cl.zones, city: cl.city, clockFmt: cl.fmt,

    runnable(el) {
      return RUNNABLE.has(el.type);
    },
    status(el) {
      if (!RUNNABLE.has(el.type)) return "static";
      return el.run.st;
    },
    // Start from the beginning. A quick timer needs { dur }; returns false
    // when it cannot start (nothing to count).
    start(el, now, opts) {
      const impl = IMPL[el.type];
      if (!impl) return false;
      if (el.run.st !== "idle") impl.reset(el, now);
      return impl.start(el, now, opts) !== false;
    },
    pause(el, now) {
      const impl = IMPL[el.type];
      if (impl) impl.pause(el, now);
    },
    resume(el, now) {
      const impl = IMPL[el.type];
      if (impl) impl.resume(el, now);
    },
    reset(el, now) {
      if (el.type === "counter") return co.reset(el);
      const impl = IMPL[el.type];
      if (impl) impl.reset(el, now);
    },
    addTime(el, ms, now) {
      const impl = IMPL[el.type];
      if (impl && impl.addTime) impl.addTime(el, ms, now);
    },
    lap(el, now) {
      if (el.type === "stopwatch") sw.lap(el, now);
    },
    count(el, dir, now, fire) {
      if (el.type === "counter") co.step(el, dir, now, fire);
    },
    // What the main button does now: start, pause, resume, or nothing.
    primary(el) {
      switch (E.status(el)) {
        case "idle": return "start";
        case "running": case "delay": return "pause";
        case "paused": case "waiting": return "resume";
        case "done": return "restart";
        default: return null;
      }
    },
    // Returns "needs-time" when a quick timer has to be given a time first.
    toggle(el, now) {
      const act = E.primary(el);
      if (act === "start" || act === "restart") {
        if (el.type === "quick") return "needs-time";
        E.start(el, now);
      } else if (act === "pause") {
        E.pause(el, now);
      } else if (act === "resume") {
        E.resume(el, now);
      }
      return act;
    },
    tick(el, now, fire) {
      const impl = IMPL[el.type];
      if (impl) impl.tick(el, now, fire);
    },
    view(el, now) {
      if (el.type === "counter") return co.view(el, now);
      if (el.type === "clock") return cl.view(el, now);
      const impl = IMPL[el.type];
      if (impl) return impl.view(el, now);
      return { main: "", sub: "", ring: null, remaining: null, eta: null };
    },
    // Every alert this element will raise from now on, for the system to
    // deliver with the app closed.
    upcoming(el, now) {
      const impl = IMPL[el.type];
      if (!impl || !impl.upcoming) return [];
      const title = el.name || TYPES[el.type].label;
      return impl.upcoming(el, now).map((a, k) => ({ id: `clockyard-${el.id}-${k}`, at: Math.round(a.at), title, body: a.body }));
    },
  };

  window.Engine = E;
})();
