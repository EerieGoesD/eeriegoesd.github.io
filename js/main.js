// js/main.js

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

  async function fetchItemsByCategoryKey() {
    if (!SHEET_ID) throw new Error("Missing SHEET_ID");

    const res = await fetch(gvizUrl(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

    const text = await res.text();
    const data = parseGvizJson(text);

    const table = data?.table;
    const cols = table?.cols || [];
    const rows = table?.rows || [];

    // Expected headers: categoryKey, category, name, link, tooltip
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
      const link = (cellValue(cells[idxLink]) || "").trim();
      const tooltip = cellValue(cells[idxTooltip]) || "";

      if (!categoryKey || !name || !link) continue;
      if (!out[categoryKey]) continue;

      out[categoryKey].push({
        category: category || null,
        name,
        link,
        tooltip: tooltip || null
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

      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.link;
      a.target = item.link.startsWith("mailto:") ? "_self" : "_blank";
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
        itemsByCategoryKeyPromise = fetchItemsByCategoryKey();
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

