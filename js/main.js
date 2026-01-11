const SHEET_ID = "1F3kGkaIt-A9PIdsLiHkHbrmnRSrXlMvuaqRsZO0XtsM";
const SHEET_NAME = "Web Data";

document.addEventListener("DOMContentLoaded", () => {
  const backArrow = document.getElementById("back-arrow");
  const mainCategories = document.querySelector(".main-categories");
  const subCategories = document.getElementById("sub-categories");
  const mainLinks = document.querySelectorAll(".main-categories li a");

  let itemsByCategoryKeyPromise = null;

  function gvizUrl() {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      SHEET_ID
    )}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;
  }

  function parseGvizJson(text) {
    // Google returns: /*O_o*/\ngoogle.visualization.Query.setResponse(<json>);
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
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s; // has scheme
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

  // Local file:// workaround: load GViz via <script> to bypass fetch CORS limits on opaque origins.
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
        if (!prevGoogle) {
          // leave window.google as-is
        }
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

    // Required headers: categoryKey, category, name, link, tooltip
    // Optional download headers:
    // - github, chrome, microsoft, store, steam, gamefaqs, google-drive
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

      // Keep legacy requirement for non-guides: link must exist.
      // For videogame-guides: allow missing link if at least one download URL exists.
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
    li.textContent = "Loading…";
    subCategories.appendChild(li);
  }

  function setError(msg) {
    subCategories.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = msg;
    subCategories.appendChild(li);
  }

  function closeAllExpandablePanels() {
    const openRows = subCategories.querySelectorAll(".app-row.is-open");
    openRows.forEach((row) => row.classList.remove("is-open"));
  }

  function populateSubCategories(categoryKey, items) {
    subCategories.innerHTML = "";

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

      // APPS: click-to-expand only (NO hover tooltip)
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

        // Links area: show download links (GitHub / Chrome / etc).
        // If none provided, fallback to the original 'link' as "Open".
        const links = document.createElement("div");
        links.classList.add("app-links");

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
        } else {
          const a = document.createElement("a");
          a.classList.add("pill");
          a.href = item.link;
          a.target = item.link.startsWith("mailto:") ? "_self" : "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "Open";
          links.appendChild(a);
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

      // VIDEOGAME-GUIDES: same click-to-expand logic as apps (NO hover tooltip)
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

        // Show website button only if provided
        if (item.link) {
          const open = document.createElement("a");
          open.classList.add("pill");
          open.href = item.link;
          open.target = item.link.startsWith("mailto:") ? "_self" : "_blank";
          open.rel = "noopener noreferrer";
          open.textContent = "Website";
          links.appendChild(open);
        }

        // Show extra buttons (GitHub / Steam / GameFAQs / Google Drive / etc) when provided
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

      // Non-app categories: original hover tooltip behavior stays
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.link;
      a.target = item.link.startsWith("mailto:") ? "_self" : "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.name;

      if (item.tooltip) {
        const tooltip = document.createElement("span");
        tooltip.classList.add("tooltip");
        tooltip.innerHTML = String(item.tooltip).replace(/\n/g, "<br>");
        a.appendChild(tooltip);
      }

      li.appendChild(a);
      subCategories.appendChild(li);
    });

    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "No items yet.";
      subCategories.appendChild(li);
    }
  }

  async function openCategory(categoryKey) {
    setLoading();

    try {
      if (!itemsByCategoryKeyPromise) {
        itemsByCategoryKeyPromise = fetchItemsByCategoryKey().catch((err) => {
          itemsByCategoryKeyPromise = null;
          throw err;
        });
      }

      const itemsByKey = await itemsByCategoryKeyPromise;

      populateSubCategories(categoryKey, itemsByKey[categoryKey] || []);

      if (categoryKey === "videogame-guides" || categoryKey === "apps") {
        subCategories.classList.add("left-align");
      } else {
        subCategories.classList.remove("left-align");
      }

      mainCategories.classList.add("active");
      subCategories.classList.remove("hidden");
      subCategories.classList.add("show");
      backArrow.style.display = "block";
    } catch (e) {
      setError(`Failed to load items. (${e?.message || "unknown error"})`);
    }
  }

  // Prefetch immediately
  itemsByCategoryKeyPromise = fetchItemsByCategoryKey().catch((err) => {
    itemsByCategoryKeyPromise = null;
    throw err;
  });

  mainLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const key = link.getAttribute("data-category");
      if (!key) return;
      openCategory(key);
    });
  });

  backArrow.addEventListener("click", () => {
    mainCategories.classList.remove("active");
    subCategories.classList.remove("show");
    subCategories.classList.add("hidden");
    backArrow.style.display = "none";

    mainCategories.classList.remove("animate");
    void mainCategories.offsetWidth;
    mainCategories.classList.add("animate");

    setTimeout(() => {
      subCategories.innerHTML = "";
    }, 500);
  });

  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".main-categories") &&
      !e.target.closest(".sub-categories") &&
      e.target !== backArrow
    ) {
      if (mainCategories.classList.contains("active")) backArrow.click();
    }
  });
});
