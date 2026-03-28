const SHEET_ID = "1F3kGkaIt-A9PIdsLiHkHbrmnRSrXlMvuaqRsZO0XtsM";
const SHEET_NAME = "Web Data";

document.addEventListener("DOMContentLoaded", () => {
  const navPanel = document.querySelector(".nav-panel");
  const divider = document.getElementById("divider");
  const contentPanel = document.getElementById("content-panel");
  const subCategories = document.getElementById("sub-categories");
  const menuLinks = document.querySelectorAll(".terminal-menu li a");
  const menuItems = document.querySelectorAll(".terminal-menu li");

  let itemsByCategoryKeyPromise = null;
  let activeCategory = null;
  let contentRevealTimer = null;

  /* ── SVG Snake ── */
  const svgNS = "http://www.w3.org/2000/svg";
  const layoutEl = document.querySelector(".layout");
  const snakeSvg = document.createElementNS(svgNS, "svg");
  snakeSvg.setAttribute("aria-hidden", "true");
  snakeSvg.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;";

  function makeLine() {
    const l = document.createElementNS(svgNS, "line");
    l.setAttribute("stroke", "rgba(30,144,255,0.4)");
    l.setAttribute("stroke-width", "1");
    l.setAttribute("shape-rendering", "crispEdges");
    snakeSvg.appendChild(l);
    return l;
  }
  const snakeH = makeLine();
  const snakeVUp = makeLine();
  const snakeVDown = makeLine();
  snakeSvg.style.opacity = "0";
  layoutEl.appendChild(snakeSvg);

  function isMobile() {
    return window.innerWidth <= 700;
  }

  function animateSnake(categoryKey, immediate) {
    if (isMobile()) return;

    const link = document.querySelector(
      `.terminal-menu li a[data-category="${categoryKey}"]`
    );
    if (!link) return;

    const lr = layoutEl.getBoundingClientRect();
    const ar = link.getBoundingClientRect();
    const dr = divider.getBoundingClientRect();

    // Snap to half-pixels so 1px strokes render crisply
    const startX = Math.round(ar.right - lr.left + 10) + 0.5;
    const startY = Math.round(ar.top + ar.height / 2 - lr.top) + 0.5;
    const jX = Math.round(dr.left + dr.width / 2 - lr.left) + 0.5;

    snakeH.setAttribute("x1", startX);
    snakeH.setAttribute("y1", startY);
    snakeH.setAttribute("x2", jX);
    snakeH.setAttribute("y2", startY);

    snakeVUp.setAttribute("x1", jX);
    snakeVUp.setAttribute("y1", startY);
    snakeVUp.setAttribute("x2", jX);
    snakeVUp.setAttribute("y2", 0);

    snakeVDown.setAttribute("x1", jX);
    snakeVDown.setAttribute("y1", startY);
    snakeVDown.setAttribute("x2", jX);
    snakeVDown.setAttribute("y2", lr.height);

    const hLen = Math.abs(jX - startX);
    const vUpLen = startY;
    const vDownLen = lr.height - startY;

    snakeSvg.style.transition = "none";
    snakeSvg.style.opacity = "1";

    if (immediate) {
      [snakeH, snakeVUp, snakeVDown].forEach((l) => {
        l.style.transition = "none";
        l.style.strokeDasharray = "none";
        l.style.strokeDashoffset = "0";
        l.style.opacity = "1";
      });
      return;
    }

    // Reset all lines hidden
    [snakeH, snakeVUp, snakeVDown].forEach((l) => {
      l.style.transition = "none";
      l.style.opacity = "1";
    });
    snakeH.style.strokeDasharray = hLen;
    snakeH.style.strokeDashoffset = hLen;
    snakeVUp.style.strokeDasharray = vUpLen;
    snakeVUp.style.strokeDashoffset = vUpLen;
    snakeVDown.style.strokeDasharray = vDownLen;
    snakeVDown.style.strokeDashoffset = vDownLen;

    // Force reflow
    snakeH.getBoundingClientRect();

    // Horizontal draws first
    const hDur = 0.25;
    snakeH.style.transition = `stroke-dashoffset ${hDur}s ease-out`;
    snakeH.style.strokeDashoffset = "0";

    // Verticals start just before horizontal finishes — seamless corner turn
    const vDelay = hDur - 0.04;
    const vDur = 0.35;
    const vEase = "cubic-bezier(0.16, 1, 0.3, 1)";
    snakeVUp.style.transition = `stroke-dashoffset ${vDur}s ${vEase} ${vDelay}s`;
    snakeVUp.style.strokeDashoffset = "0";
    snakeVDown.style.transition = `stroke-dashoffset ${vDur}s ${vEase} ${vDelay}s`;
    snakeVDown.style.strokeDashoffset = "0";
  }

  function hideSnake() {
    if (isMobile()) return;

    // Read current dasharray lengths for the reverse
    const hLen = parseFloat(snakeH.style.strokeDasharray) || 0;
    const vUpLen = parseFloat(snakeVUp.style.strokeDasharray) || 0;
    const vDownLen = parseFloat(snakeVDown.style.strokeDasharray) || 0;

    if (!hLen) {
      snakeSvg.style.transition = "opacity 0.2s ease";
      snakeSvg.style.opacity = "0";
      return;
    }

    // Step 1: Verticals collapse back to junction
    const vDur = 0.15;
    const vEase = "ease-in";
    snakeVUp.style.transition = `stroke-dashoffset ${vDur}s ${vEase}`;
    snakeVUp.style.strokeDashoffset = vUpLen;
    snakeVDown.style.transition = `stroke-dashoffset ${vDur}s ${vEase}`;
    snakeVDown.style.strokeDashoffset = vDownLen;

    // Step 2: Horizontal retracts right after verticals
    const hDelay = vDur - 0.03;
    const hDur = 0.12;
    snakeH.style.transition = `stroke-dashoffset ${hDur}s ease-in ${hDelay}s`;
    snakeH.style.strokeDashoffset = hLen;

    // Hide SVG after full sequence
    const totalDur = (hDelay + hDur) * 1000 + 30;
    setTimeout(() => {
      snakeSvg.style.transition = "none";
      snakeSvg.style.opacity = "0";
    }, totalDur);
  }

  function gvizUrl() {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      SHEET_ID
    )}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;
  }

  function parseGvizJson(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Unexpected GViz response");
    return JSON.parse(text.slice(start, end + 1));
  }

  function cellValue(cell) {
    if (!cell) return "";
    if (typeof cell.f === "string") return cell.f;
    if (cell.v == null) return "";
    return String(cell.v);
  }

  function normalizeUrl(url) {
    const s = (url || "").trim();
    if (!s) return "";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s;
    if (s.startsWith("www.")) return `https://${s}`;
    return s;
  }

  function isProbablyUrl(s) {
    const v = (s || "").trim();
    if (!v) return false;
    if (v.startsWith("mailto:")) return true;
    if (v.startsWith("http://") || v.startsWith("https://")) return true;
    if (v.startsWith("www.")) return true;
    return false;
  }

  function fetchGvizViaScript() {
    return new Promise((resolve, reject) => {
      let done = false;

      const cleanup = (script) => {
        if (script && script.parentNode) script.parentNode.removeChild(script);
      };

      const prevGoogle = window.google;
      window.google = window.google || {};
      window.google.visualization = window.google.visualization || {};
      window.google.visualization.Query = window.google.visualization.Query || {};

      const prevSetResponse = window.google.visualization.Query.setResponse;

      window.google.visualization.Query.setResponse = (resp) => {
        if (done) return;
        done = true;
        if (prevSetResponse) {
          window.google.visualization.Query.setResponse = prevSetResponse;
        }
        resolve(resp);
      };

      const script = document.createElement("script");
      script.src = gvizUrl();
      script.async = true;

      script.onerror = () => {
        if (done) return;
        done = true;
        if (prevSetResponse) window.google.visualization.Query.setResponse = prevSetResponse;
        cleanup(script);
        reject(new Error("Failed to load GViz script (network error)."));
      };

      const t = setTimeout(() => {
        if (done) return;
        done = true;
        if (prevSetResponse) window.google.visualization.Query.setResponse = prevSetResponse;
        cleanup(script);
        reject(new Error("GViz script loaded but did not return data in time."));
      }, 10000);

      const originalResolve = resolve;
      resolve = (resp) => {
        clearTimeout(t);
        cleanup(script);
        originalResolve(resp);
      };

      document.head.appendChild(script);
    });
  }

  async function fetchItemsByCategoryKey() {
    if (!SHEET_ID) throw new Error("Missing SHEET_ID");

    let data;
    if (location.protocol === "file:") {
      data = await fetchGvizViaScript();
    } else {
      const res = await fetch(gvizUrl(), { cache: "default" });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const text = await res.text();
      data = parseGvizJson(text);
    }

    const table = data?.table;
    const cols = table?.cols || [];
    const rows = table?.rows || [];

    const colIndex = new Map();
    cols.forEach((c, i) => {
      const label = (c?.label || "").trim();
      if (label) colIndex.set(label, i);
    });

    const idxCategoryKey = colIndex.get("categoryKey");
    const idxCategory = colIndex.get("category");
    const idxName = colIndex.get("name");
    const idxLink = colIndex.get("link");
    const idxTooltip = colIndex.get("tooltip");
    const idxGithub = colIndex.get("github");
    const idxChrome = colIndex.get("chrome");
    const idxMicrosoft = colIndex.get("microsoft");
    const idxStore = colIndex.get("store");
    const idxSteam = colIndex.get("steam");
    const idxGamefaqs = colIndex.get("gamefaqs");
    const idxGoogleDrive = colIndex.get("google-drive");

    const out = {
      music: [],
      apps: [],
      "videogame-guides": [],
      contacts: []
    };

    for (const r of rows) {
      const cells = r?.c || [];

      const categoryKey = (cellValue(cells[idxCategoryKey]) || "").trim();
      const category = (cellValue(cells[idxCategory]) || "").trim();
      const name = (cellValue(cells[idxName]) || "").trim();
      const link = normalizeUrl(cellValue(cells[idxLink]));
      const tooltip = cellValue(cells[idxTooltip]) || "";

      if (!categoryKey || !name) continue;
      if (!out[categoryKey]) continue;

      const github = normalizeUrl(cellValue(cells[idxGithub]));
      const chrome = normalizeUrl(cellValue(cells[idxChrome]));
      const microsoft = normalizeUrl(cellValue(cells[idxMicrosoft]));
      const store = normalizeUrl(cellValue(cells[idxStore]));
      const steam = normalizeUrl(cellValue(cells[idxSteam]));
      const gamefaqs = normalizeUrl(cellValue(cells[idxGamefaqs]));
      const googleDrive = normalizeUrl(cellValue(cells[idxGoogleDrive]));

      const downloads = [];
      if (isProbablyUrl(github)) downloads.push({ label: "GitHub", url: github });
      if (isProbablyUrl(chrome)) downloads.push({ label: "Chrome Web Store", url: chrome });
      if (isProbablyUrl(microsoft)) downloads.push({ label: "Microsoft Store", url: microsoft });
      if (isProbablyUrl(store)) downloads.push({ label: "Store", url: store });
      if (isProbablyUrl(steam)) downloads.push({ label: "Steam", url: steam });
      if (isProbablyUrl(gamefaqs)) downloads.push({ label: "GameFAQs", url: gamefaqs });
      if (isProbablyUrl(googleDrive)) downloads.push({ label: "Google Drive", url: googleDrive });

      const hasLink = !!link;
      const hasDownloads = downloads.length > 0;
      if (categoryKey === "videogame-guides") {
        if (!hasLink && !hasDownloads) continue;
      } else {
        if (!hasLink) continue;
      }

      out[categoryKey].push({
        category: category || null,
        name,
        link: link || null,
        tooltip: tooltip || null,
        downloads
      });
    }

    return out;
  }

  function setLoading() {
    subCategories.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = "loading\u2026";
    li.style.color = "rgba(255,255,255,0.4)";
    subCategories.appendChild(li);
  }

  function setError(msg) {
    subCategories.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = msg;
    li.style.color = "#e84a8a";
    subCategories.appendChild(li);
  }

  function closeAllExpandablePanels() {
    const openRows = subCategories.querySelectorAll(".app-row.is-open");
    openRows.forEach((row) => row.classList.remove("is-open"));
  }

  function setActiveLink(categoryKey) {
    menuLinks.forEach((l) => l.classList.remove("active"));
    menuItems.forEach((li) => li.classList.remove("is-active"));

    if (categoryKey) {
      const link = document.querySelector(`.terminal-menu li a[data-category="${categoryKey}"]`);
      if (link) {
        link.classList.add("active");
        link.closest("li").classList.add("is-active");
      }
    }
  }

  function populateSubCategories(categoryKey, items) {
    subCategories.innerHTML = "";
    subCategories.scrollTop = 0;

    const list = (items || []).slice();

    if (categoryKey === "apps") {
      list.sort(
        (a, b) =>
          (a.category || "").localeCompare(b.category || "") ||
          a.name.localeCompare(b.name)
      );
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    let lastGroup = null;

    list.forEach((item) => {
      let group = null;

      if (categoryKey === "apps") {
        group = item.category || null;
      } else if (categoryKey === "videogame-guides") {
        group = item.name.charAt(0).toUpperCase();
      }

      if (group !== lastGroup && group !== null) {
        lastGroup = group;
        const headerLi = document.createElement("li");
        headerLi.textContent = group;
        headerLi.classList.add("letter");
        subCategories.appendChild(headerLi);
      }

      // APPS: click-to-expand
      if (categoryKey === "apps") {
        const li = document.createElement("li");
        li.classList.add("app-item");

        const row = document.createElement("div");
        row.classList.add("app-row");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.classList.add("app-title");
        btn.textContent = item.name;

        const panel = document.createElement("div");
        panel.classList.add("app-panel");

        const desc = document.createElement("div");
        desc.classList.add("app-desc");
        desc.textContent = item.tooltip ? String(item.tooltip) : "No description.";
        panel.appendChild(desc);

        const links = document.createElement("div");
        links.classList.add("app-links");

        const hasDownloads = Array.isArray(item.downloads) && item.downloads.length > 0;

        if (item.link) {
          const a = document.createElement("a");
          a.classList.add("pill");
          a.href = item.link;
          a.target = item.link.startsWith("mailto:") ? "_self" : "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "Open";
          links.appendChild(a);
        }

        if (hasDownloads) {
          item.downloads.forEach((d) => {
            const a = document.createElement("a");
            a.classList.add("pill");
            a.href = d.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = d.label;
            links.appendChild(a);
          });
        }

        panel.appendChild(links);

        btn.addEventListener("click", () => {
          const isOpen = row.classList.contains("is-open");
          closeAllExpandablePanels();
          if (!isOpen) row.classList.add("is-open");
        });

        row.appendChild(btn);
        row.appendChild(panel);
        li.appendChild(row);
        subCategories.appendChild(li);
        return;
      }

      // VIDEOGAME-GUIDES: click-to-expand
      if (categoryKey === "videogame-guides") {
        const li = document.createElement("li");
        li.classList.add("app-item");

        const row = document.createElement("div");
        row.classList.add("app-row");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.classList.add("app-title");
        btn.textContent = item.name;

        const panel = document.createElement("div");
        panel.classList.add("app-panel");

        const desc = document.createElement("div");
        desc.classList.add("app-desc");
        desc.textContent = item.tooltip ? String(item.tooltip) : "No description.";
        panel.appendChild(desc);

        const links = document.createElement("div");
        links.classList.add("app-links");

        if (item.link) {
          const open = document.createElement("a");
          open.classList.add("pill");
          open.href = item.link;
          open.target = item.link.startsWith("mailto:") ? "_self" : "_blank";
          open.rel = "noopener noreferrer";
          open.textContent = "Website";
          links.appendChild(open);
        }

        const hasDownloads = Array.isArray(item.downloads) && item.downloads.length > 0;
        if (hasDownloads) {
          item.downloads.forEach((d) => {
            const a = document.createElement("a");
            a.classList.add("pill");
            a.href = d.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = d.label;
            links.appendChild(a);
          });
        }

        panel.appendChild(links);

        btn.addEventListener("click", () => {
          const isOpen = row.classList.contains("is-open");
          closeAllExpandablePanels();
          if (!isOpen) row.classList.add("is-open");
        });

        row.appendChild(btn);
        row.appendChild(panel);
        li.appendChild(row);
        subCategories.appendChild(li);
        return;
      }

      // Non-expandable categories (music, contacts): hover tooltip
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.link;
      a.target = item.link.startsWith("mailto:") ? "_self" : "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.name;

      if (item.tooltip) {
        const tooltip = document.createElement("span");
        tooltip.classList.add("tooltip");
        tooltip.textContent = String(item.tooltip);
        a.appendChild(tooltip);
      }

      li.appendChild(a);
      subCategories.appendChild(li);
    });

    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "No items yet.";
      li.style.color = "rgba(255,255,255,0.4)";
      subCategories.appendChild(li);
    }
  }

  function showContentPanel() {
    divider.classList.add("visible");
    contentPanel.classList.add("visible");
    navPanel.classList.add("collapsed");
  }

  function hideContentPanel() {
    if (contentRevealTimer) {
      clearTimeout(contentRevealTimer);
      contentRevealTimer = null;
    }
    activeCategory = null;
    setActiveLink(null);

    if (isMobile()) {
      hideSnake();
      subCategories.style.opacity = "0";
      divider.classList.remove("visible");
      contentPanel.classList.remove("visible");
      navPanel.classList.remove("collapsed");
      setTimeout(() => {
        subCategories.innerHTML = "";
        subCategories.style.opacity = "1";
      }, 350);
      return;
    }

    // Desktop: everything starts at once
    subCategories.style.opacity = "0";
    contentPanel.classList.remove("visible");
    hideSnake();
    setTimeout(() => {
      divider.classList.remove("visible");
      navPanel.classList.remove("collapsed");
      subCategories.innerHTML = "";
      subCategories.style.opacity = "1";
    }, 280);
  }

  function fade(opacity) {
    return new Promise((resolve) => {
      subCategories.style.opacity = opacity;
      setTimeout(resolve, 60);
    });
  }

  async function openCategory(categoryKey) {
    // Toggle off if clicking the same category
    if (activeCategory === categoryKey) {
      hideContentPanel();
      return;
    }

    const isSwitch = activeCategory !== null;
    activeCategory = categoryKey;
    setActiveLink(categoryKey);

    // Fade out current content
    if (isSwitch) {
      await fade("0");
      animateSnake(categoryKey, true);
      showContentPanel();
    } else {
      subCategories.style.opacity = "0";
      animateSnake(categoryKey, false);
      // Delay content reveal until snake reaches the divider and verticals begin
      if (!isMobile()) {
        if (contentRevealTimer) clearTimeout(contentRevealTimer);
        contentRevealTimer = setTimeout(() => {
          showContentPanel();
          contentRevealTimer = null;
        }, 400);
      } else {
        showContentPanel();
      }
    }

    try {
      if (!itemsByCategoryKeyPromise) {
        itemsByCategoryKeyPromise = fetchItemsByCategoryKey().catch((err) => {
          itemsByCategoryKeyPromise = null;
          throw err;
        });
      }

      const itemsByKey = await itemsByCategoryKeyPromise;
      populateSubCategories(categoryKey, itemsByKey[categoryKey] || []);
    } catch (e) {
      setError(`Failed to load items. (${e?.message || "unknown error"})`);
    }

    // Fade in new content
    requestAnimationFrame(() => {
      subCategories.style.opacity = "1";
    });
  }

  // Prefetch immediately
  itemsByCategoryKeyPromise = fetchItemsByCategoryKey().catch((err) => {
    itemsByCategoryKeyPromise = null;
    throw err;
  });

  // Initial animation
  navPanel.classList.add("animate");

  menuLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const key = link.getAttribute("data-category");
      if (!key) return;
      e.preventDefault();
      openCategory(key);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeCategory) {
      hideContentPanel();
    }
  });
});
