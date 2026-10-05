const root = context.element;
const urlParameters = new URLSearchParams(window.location.search);
const initialSelection = urlParameters.get("select");
const container = root.querySelector(".service-map");
if (!container || container.dataset.bound === "true") return;
container.dataset.bound = "true";
container.classList.toggle("map-only", urlParameters.get("view") === "map");
const state = (window.serviceMapState = window.serviceMapState || { selection: null, hops: "all" });
const groups = [...root.querySelectorAll(".edge-group, .edge-label")];
const nodes = [...root.querySelectorAll(".node")];
const rows = [...root.querySelectorAll(".table-view tbody tr")];
const tooltip = root.querySelector(".tooltip");
const chips = [...root.querySelectorAll(".chip")];
const selectionBar = root.querySelector(".selection-bar");
const tableView = root.querySelector(".table-view");
const tableCount = root.querySelector(".table-count");
const HOVER_DELAY_MILLISECONDS = 200;

const keyOfGroup = (group) => group.dataset.key;
const groupsByKey = (key) => groups.filter((group) => keyOfGroup(group) === key);
const edgeGroups = groups.filter((group) => group.classList.contains("edge-group"));

const chainKeysOf = (key) => {
  const byIndex = new Map(edgeGroups.map((group) => [group.dataset.index, group]));
  const triggersOf = (group) => (group.dataset.triggers ? group.dataset.triggers.split(",") : []);
  const start = edgeGroups.find((group) => keyOfGroup(group) === key);
  if (!start) return new Set();
  const visited = new Set();
  const walkDown = (index) => {
    if (visited.has(index)) return;
    visited.add(index);
    triggersOf(byIndex.get(index)).forEach(walkDown);
  };
  const visitedUp = new Set();
  const walkUp = (index) => {
    if (visitedUp.has(index)) return;
    visitedUp.add(index);
    edgeGroups.filter((group) => triggersOf(group).includes(index)).forEach((group) => walkUp(group.dataset.index));
  };
  walkDown(start.dataset.index);
  walkUp(start.dataset.index);
  return new Set([...visited, ...visitedUp].map((index) => keyOfGroup(byIndex.get(index))));
};

const resetClasses = () => {
  groups.forEach((group) => group.classList.remove("dim", "chain", "hovered", "chosen"));
  nodes.forEach((node) => node.classList.remove("dim", "chosen"));
};

const paintService = (name, chosen) => {
  const related = new Set([name]);
  groups.forEach((group) => {
    const touches = group.dataset.from === name || group.dataset.to === name;
    group.classList.toggle("dim", !touches);
    if (touches && chosen) group.classList.add("chosen");
    if (touches && !group.classList.contains("hidden")) {
      related.add(group.dataset.from);
      related.add(group.dataset.to);
    }
  });
  nodes.forEach((node) => {
    node.classList.toggle("dim", !related.has(node.dataset.name));
    if (chosen && node.dataset.name === name) node.classList.add("chosen");
  });
};

const paintEdge = (key, chosen) => {
  const chain = chainKeysOf(key);
  const touched = new Set();
  groups.forEach((group) => {
    const inChain = chain.has(keyOfGroup(group));
    group.classList.toggle("dim", !inChain);
    group.classList.toggle("chain", inChain && keyOfGroup(group) !== key);
    group.classList.toggle(chosen ? "chosen" : "hovered", keyOfGroup(group) === key);
    if (inChain) {
      touched.add(group.dataset.from);
      touched.add(group.dataset.to);
    }
  });
  nodes.forEach((node) => node.classList.toggle("dim", !touched.has(node.dataset.name)));
};

const describeSelection = () => {
  const { selection } = state;
  if (!selection) return null;
  if (selection.type === "service") return `Service <strong>${selection.name}</strong>`;
  const [from, to, uri] = selection.key.split("|");
  return `Edge <strong>${from} → ${to}</strong> <span class="bar-url">${uri}</span>`;
};

const filterTable = () => {
  const { selection } = state;
  const chain = selection && selection.type === "edge" ? chainKeysOf(selection.key) : null;
  let shown = 0;
  rows.forEach((row) => {
    let visible = true;
    row.classList.remove("chosen-row", "related-row");
    if (selection && selection.type === "service") {
      visible = row.dataset.from === selection.name || row.dataset.to === selection.name;
      if (visible) row.classList.add("related-row");
    } else if (selection && selection.type === "edge") {
      visible = chain.has(row.dataset.key);
      if (row.dataset.key === selection.key) row.classList.add("chosen-row");
      else if (visible) row.classList.add("related-row");
    }
    row.classList.toggle("hidden", !visible);
    if (visible) shown++;
  });
  tableCount.textContent = selection ? `(${shown} of ${rows.length} edges, filtered)` : `(${rows.length} edges)`;
  if (selection) tableView.open = true;
};

const paintSelection = () => {
  resetClasses();
  const { selection } = state;
  if (selection && selection.type === "service" && nodes.some((node) => node.dataset.name === selection.name)) paintService(selection.name, true);
  else if (selection && selection.type === "edge" && groupsByKey(selection.key).length) paintEdge(selection.key, true);
  else state.selection = null;
  const description = describeSelection();
  selectionBar.hidden = !description;
  selectionBar.innerHTML = description ? `<span class="bar-label">Selected</span>${description}<button class="bar-clear" type="button">Clear</button>` : "";
  const clear = selectionBar.querySelector(".bar-clear");
  if (clear) clear.addEventListener("click", (event) => { event.stopPropagation(); select(null); });
  filterTable();
};

const select = (selection) => {
  const same = selection && state.selection && JSON.stringify(selection) === JSON.stringify(state.selection);
  state.selection = same ? null : selection;
  paintSelection();
};

const applyHopFilter = () => {
  const limit = state.hops === "all" ? Infinity : Number(state.hops);
  groups.forEach((group) => group.classList.toggle("hidden", Number(group.dataset.hops) > limit));
  rows.forEach((row) => row.classList.toggle("hop-hidden", Number(row.dataset.hops || 0) > limit));
  chips.forEach((chip) => chip.classList.toggle("active", chip.dataset.hops === String(state.hops)));
  const touched = new Set(groups.filter((group) => !group.classList.contains("hidden")).flatMap((group) => [group.dataset.from, group.dataset.to]));
  nodes.forEach((node) => node.classList.toggle("off", !touched.has(node.dataset.name)));
};

let hoverTimer = null;
const hoverAfterDelay = (paint) => {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    resetClasses();
    paint();
  }, HOVER_DELAY_MILLISECONDS);
};
const endHover = () => {
  clearTimeout(hoverTimer);
  tooltip.style.display = "none";
  paintSelection();
};

const showTooltip = (group) => {
  const data = group.dataset;
  tooltip.innerHTML = `
    <strong>${data.from} → ${data.to}</strong>
    <span class="tooltip-url">${data.uri}</span>
    <dl>
      <dt>Calls</dt><dd>${Number(data.count).toLocaleString("en-US")}</dd>
      <dt>Per minute</dt><dd>${data.rate}</dd>
      <dt>Share of visible calls</dt><dd>${data.share}%</dd>
      <dt>Hops from selection</dt><dd>${data.hops}</dd>
      <dt>Edges in its call chain</dt><dd>${chainKeysOf(keyOfGroup(group)).size}</dd>
    </dl>`;
  tooltip.style.display = "block";
  tooltip.style.right = "16px";
  tooltip.style.top = "16px";
  tooltip.style.left = "auto";
};

groups.forEach((group) => {
  group.addEventListener("mouseenter", () => {
    showTooltip(group);
    hoverAfterDelay(() => paintEdge(keyOfGroup(group), false));
  });
  group.addEventListener("mouseleave", endHover);
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    select({ type: "edge", key: keyOfGroup(group) });
  });
});

nodes.forEach((node) => {
  node.addEventListener("mouseenter", () => hoverAfterDelay(() => paintService(node.dataset.name, false)));
  node.addEventListener("focus", () => {
    resetClasses();
    paintService(node.dataset.name, false);
  });
  node.addEventListener("mouseleave", endHover);
  node.addEventListener("blur", endHover);
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    select({ type: "service", name: node.dataset.name });
  });
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select({ type: "service", name: node.dataset.name });
    }
  });
});

chips.forEach((chip) =>
  chip.addEventListener("click", () => {
    state.hops = chip.dataset.hops;
    applyHopFilter();
    paintSelection();
  })
);

root.addEventListener("click", () => select(null));

if (!window.serviceMapEscapeBound) {
  window.serviceMapEscapeBound = true;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && window.serviceMapState) {
      window.serviceMapState.selection = null;
      const bar = document.querySelector(".service-map .selection-bar .bar-clear");
      if (bar) bar.click();
    }
  });
}

if (initialSelection && !state.selection && !state.initialSelectionApplied) {
  state.initialSelectionApplied = true;
  const [type, value] = [initialSelection.slice(0, initialSelection.indexOf(":")), initialSelection.slice(initialSelection.indexOf(":") + 1)];
  if (type === "edge") state.selection = { type, key: value };
  if (type === "service") state.selection = { type, name: value };
}

applyHopFilter();
paintSelection();
