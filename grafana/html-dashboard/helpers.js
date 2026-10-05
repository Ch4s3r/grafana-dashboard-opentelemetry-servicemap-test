const handlebars = context.handlebars;
const grafana = context.grafana;

const MAX_HOPS = 6;
const NODE_WIDTH = 170;
const MIN_NODE_HEIGHT = 78;
const PORT_SPACING = 26;
const COLUMN_GAP = 400;
const NODE_GAP = 70;
const PADDING = 56;
const LABEL_HEIGHT = 26;
const LABEL_TRIES = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78];
const RAMP_DARK = ["#184f95", "#3987e5", "#9ec5f4"];
const RAMP_LIGHT = ["#86b6ef", "#256abf", "#0d366b"];

function readEdges(frames) {
  return [].concat(...(frames || []))
    .map((row) => ({
      client: row.client,
      server: row.server,
      uri: row.uri,
      callerUri: row.caller_uri || "",
      count: Number(row.Value),
    }))
    .filter((edge) => edge.client && edge.count > 0);
}

function readSelection() {
  const endpoint = grafana.replaceVariables("$endpoint");
  return {
    called: grafana.replaceVariables("$mode") !== "0",
    service: grafana.replaceVariables("$service"),
    uri: endpoint === ".*" || endpoint === "$endpoint" ? "" : endpoint,
  };
}

function collectEdges(allEdges, selection) {
  const sideOf = (edge) => (selection.called ? edge.server : edge.client);
  const visited = new Map();
  let frontier = allEdges
    .filter((edge) => sideOf(edge) === selection.service && (selection.uri === "" || edge.uri === selection.uri))
    .map((edge) => ({ edge, hops: 1 }));
  while (frontier.length && frontier[0].hops <= MAX_HOPS) {
    const nextFrontier = [];
    for (const { edge, hops } of frontier) {
      const key = [edge.client, edge.server, edge.uri, edge.callerUri].join("|");
      if (visited.has(key)) continue;
      visited.set(key, { ...edge, hops });
      const followers = selection.called
        ? edge.callerUri === ""
          ? []
          : allEdges.filter((other) => other.server === edge.client && other.uri === edge.callerUri)
        : allEdges.filter((other) => other.client === edge.server && other.callerUri === edge.uri);
      followers.forEach((other) => nextFrontier.push({ edge: other, hops: hops + 1 }));
    }
    frontier = nextFrontier;
  }
  const merged = new Map();
  for (const edge of visited.values()) {
    const key = [edge.client, edge.server, edge.uri].join("|");
    const existing = merged.get(key);
    if (existing) {
      existing.count += edge.count;
      existing.hops = Math.min(existing.hops, edge.hops);
      existing.callerUris.add(edge.callerUri);
    } else {
      merged.set(key, { client: edge.client, server: edge.server, uri: edge.uri, count: edge.count, hops: edge.hops, callerUris: new Set([edge.callerUri]) });
    }
  }
  return [...merged.values()];
}

function mixHex(from, to, amount) {
  const channel = (hex, index) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const mixed = [0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount));
  return "#" + mixed.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function rampColor(ramp, share) {
  const scaled = share * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(scaled));
  return mixHex(ramp[index], ramp[index + 1], scaled - index);
}

const formatCount = (count) => count.toLocaleString("en-US");

function layoutNodes(edges) {
  const names = [...new Set(edges.flatMap((edge) => [edge.client, edge.server]))].sort();
  const rank = Object.fromEntries(names.map((name) => [name, 0]));
  for (let pass = 0; pass < names.length; pass++) {
    for (const edge of edges) rank[edge.server] = Math.max(rank[edge.server], rank[edge.client] + 1);
  }
  const columns = [];
  names.forEach((name) => (columns[rank[name]] = columns[rank[name]] || []).push(name));
  const rowOf = {};
  columns.forEach((column) => column.forEach((name, index) => (rowOf[name] = index)));
  for (let sweep = 0; sweep < 3; sweep++) {
    columns.forEach((column, columnIndex) => {
      if (columnIndex === 0) return;
      const barycenter = (name) => {
        const rows = edges.filter((edge) => edge.server === name).map((edge) => rowOf[edge.client]);
        return rows.length ? rows.reduce((sum, row) => sum + row, 0) / rows.length : rowOf[name];
      };
      column.sort((a, b) => barycenter(a) - barycenter(b));
      column.forEach((name, index) => (rowOf[name] = index));
    });
  }
  const heightOf = (name) => {
    const incoming = edges.filter((edge) => edge.server === name).length;
    const outgoing = edges.filter((edge) => edge.client === name).length;
    return Math.max(MIN_NODE_HEIGHT, (Math.max(incoming, outgoing) + 1) * PORT_SPACING);
  };
  const columnHeights = columns.map((column) => column.reduce((sum, name) => sum + heightOf(name), 0) + (column.length - 1) * NODE_GAP);
  const height = Math.max(380, Math.max(...columnHeights) + PADDING * 2);
  const width = Math.max(900, (columns.length - 1) * COLUMN_GAP + NODE_WIDTH + PADDING * 2);
  const nodes = {};
  columns.forEach((column, columnIndex) => {
    let cursor = (height - columnHeights[columnIndex]) / 2;
    column.forEach((name) => {
      const nodeHeight = heightOf(name);
      nodes[name] = {
        name,
        x: PADDING + columnIndex * COLUMN_GAP,
        y: cursor,
        height: nodeHeight,
        role: columnIndex === 0 ? "entry" : columnIndex === columns.length - 1 ? "leaf" : "relay",
      };
      cursor += nodeHeight + NODE_GAP;
    });
  });
  return { nodes, width, height };
}

function assignPorts(edges, nodes) {
  const centerY = (name) => nodes[name].y + nodes[name].height / 2;
  const portY = (name, siblings, edge) => {
    const index = siblings.indexOf(edge);
    return nodes[name].y + ((index + 1) * nodes[name].height) / (siblings.length + 1);
  };
  const outgoingOf = (name) => edges.filter((edge) => edge.client === name).sort((a, b) => centerY(a.server) - centerY(b.server) || a.uri.localeCompare(b.uri));
  const incomingOf = (name) => edges.filter((edge) => edge.server === name).sort((a, b) => centerY(a.client) - centerY(b.client) || a.uri.localeCompare(b.uri));
  edges.forEach((edge) => {
    edge.startY = portY(edge.client, outgoingOf(edge.client), edge);
    edge.endY = portY(edge.server, incomingOf(edge.server), edge);
  });
}

function bezierPoint(edge, t) {
  const mirror = 1 - t;
  const weights = [mirror ** 3, 3 * mirror ** 2 * t, 3 * mirror * t ** 2, t ** 3];
  const xs = [edge.startX, edge.control1X, edge.control2X, edge.endX];
  const ys = [edge.startY, edge.startY, edge.endY, edge.endY];
  return {
    x: weights.reduce((sum, weight, index) => sum + weight * xs[index], 0),
    y: weights.reduce((sum, weight, index) => sum + weight * ys[index], 0),
  };
}

function placeLabels(edges) {
  const placed = [];
  const overlaps = (box, other) => box.x < other.x + other.width + 8 && other.x < box.x + box.width + 8 && box.y < other.y + other.height + 6 && other.y < box.y + box.height + 6;
  [...edges].sort((a, b) => b.count - a.count).forEach((edge) => {
    const text = edge.uri + "  " + formatCount(edge.count);
    const width = text.length * 7 + 26;
    let chosen = null;
    for (const t of LABEL_TRIES) {
      const point = bezierPoint(edge, t);
      const box = { x: point.x - width / 2, y: point.y - LABEL_HEIGHT / 2, width, height: LABEL_HEIGHT };
      if (!placed.some((other) => overlaps(box, other))) {
        chosen = box;
        break;
      }
    }
    if (!chosen) {
      const point = bezierPoint(edge, 0.5);
      chosen = { x: point.x - width / 2, y: point.y - LABEL_HEIGHT / 2, width, height: LABEL_HEIGHT };
    }
    placed.push(chosen);
    edge.label = chosen;
  });
}

function statsMarkup(edges, selection, rangeMinutes) {
  const totalCalls = edges.reduce((sum, edge) => sum + edge.count, 0);
  const services = new Set(edges.flatMap((edge) => [edge.client, edge.server])).size;
  const deepest = edges.reduce((max, edge) => Math.max(max, edge.hops), 0);
  const busiest = edges.reduce((best, edge) => (edge.count > best.count ? edge : best), edges[0] || { count: 0, uri: "-", client: "", server: "" });
  const direction = selection.called ? "Callers of" : "Calls made by";
  const urlLabel = selection.uri === "" ? "all URLs" : selection.uri;
  const depthText = deepest > 1 ? deepest + " hops" : "Direct";
  return `
    <div class="stats">
      <div class="stat selection"><span class="caption">${direction}</span><span class="selection-name">${selection.service}</span><span class="selection-url">${urlLabel}</span></div>
      <div class="stat"><span class="caption">Services</span><span class="figure">${services}</span></div>
      <div class="stat"><span class="caption">Calls in range</span><span class="figure">${formatCount(totalCalls)}</span><span class="sub">${(totalCalls / rangeMinutes).toFixed(1)} per minute</span></div>
      <div class="stat"><span class="caption">Busiest edge</span><span class="figure">${formatCount(busiest.count)}</span><span class="sub">${busiest.client} → ${busiest.server}<br>${busiest.uri}</span></div>
      <div class="stat"><span class="caption">Reach</span><span class="figure">${depthText}</span><span class="sub">${edges.length} edges</span></div>
    </div>`;
}

function hopChipsMarkup(edges) {
  const deepest = edges.reduce((max, edge) => Math.max(max, edge.hops), 0);
  if (deepest < 2) return "";
  const chips = [`<button class="chip" data-hops="all">All hops</button>`];
  for (let hops = 1; hops <= deepest; hops++) chips.push(`<button class="chip" data-hops="${hops}">${hops === 1 ? "Direct only" : "Up to " + hops + " hops"}</button>`);
  return `<div class="chips" role="group" aria-label="Hop filter">${chips.join("")}</div>`;
}

function tableMarkup(edges, rangeMinutes) {
  const rows = [...edges]
    .sort((a, b) => b.count - a.count)
    .map((edge) => `<tr data-key="${edge.client}|${edge.server}|${edge.uri}" data-from="${edge.client}" data-to="${edge.server}" data-index="${edge.index}"><td>${edge.client}</td><td>${edge.server}</td><td>${edge.uri}</td><td class="number">${formatCount(edge.count)}</td><td class="number">${(edge.count / rangeMinutes).toFixed(1)}</td><td class="number">${edge.hops}</td></tr>`)
    .join("");
  return `
    <details class="table-view">
      <summary>Table view <span class="table-count"></span></summary>
      <table>
        <thead><tr><th>Caller</th><th>Called</th><th>URL</th><th class="number">Calls</th><th class="number">Per minute</th><th class="number">Hops</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}

function graphMarkup(edges, selection, rangeMinutes, ramp) {
  const { nodes, width, height } = layoutNodes(edges);
  assignPorts(edges, nodes);
  const counts = edges.map((edge) => edge.count);
  const lowest = Math.min(...counts);
  const highest = Math.max(...counts);
  const totalCalls = counts.reduce((sum, count) => sum + count, 0);
  Object.values(nodes).forEach((node) => {
    node.inCalls = edges.filter((edge) => edge.server === node.name).reduce((sum, edge) => sum + edge.count, 0);
    node.outCalls = edges.filter((edge) => edge.client === node.name).reduce((sum, edge) => sum + edge.count, 0);
  });
  edges.forEach((edge, index) => {
    edge.index = index;
  });
  edges.forEach((edge) => {
    edge.triggers = edges.filter((other) => other.client === edge.server && other.callerUris.has(edge.uri)).map((other) => other.index);
  });
  edges.forEach((edge) => {
    edge.share = highest === lowest ? 0.5 : (edge.count - lowest) / (highest - lowest);
    edge.strokeWidth = 2 + edge.share * 8;
    edge.color = rampColor(ramp, edge.share);
    edge.tailColor = rampColor(ramp, edge.share * 0.45);
    edge.startX = nodes[edge.client].x + NODE_WIDTH;
    edge.endX = nodes[edge.server].x - 6;
    edge.control1X = edge.startX + (edge.endX - edge.startX) * 0.5;
    edge.control2X = edge.endX - (edge.endX - edge.startX) * 0.5;
  });
  placeLabels(edges);

  const dataAttributes = (edge) =>
    `data-key="${edge.client}|${edge.server}|${edge.uri}" data-index="${edge.index}" data-triggers="${edge.triggers.join(",")}" data-from="${edge.client}" data-to="${edge.server}" data-hops="${edge.hops}" data-uri="${edge.uri}" data-count="${edge.count}" data-rate="${(edge.count / rangeMinutes).toFixed(1)}" data-share="${Math.round((edge.count / totalCalls) * 100)}"`;

  const gradientMarkup = edges
    .map(
      (edge) => `
        <linearGradient id="edge-gradient-${edge.index}" gradientUnits="userSpaceOnUse" x1="${edge.startX}" y1="0" x2="${edge.endX}" y2="0">
          <stop offset="0" stop-color="${edge.tailColor}"/><stop offset="1" stop-color="${edge.color}"/>
        </linearGradient>`
    )
    .join("");

  const edgeMarkup = edges
    .map((edge) => {
      const path = `M${edge.startX},${edge.startY} C${edge.control1X},${edge.startY} ${edge.control2X},${edge.endY} ${edge.endX},${edge.endY}`;
      return `
        <g class="edge-group" ${dataAttributes(edge)}>
          <path class="edge" d="${path}" fill="none" stroke="url(#edge-gradient-${edge.index})" stroke-width="${edge.strokeWidth}" stroke-linecap="round" marker-end="url(#arrow-${edge.index})"/>
          <path class="edge-hit" d="${path}" fill="none" stroke="transparent" stroke-width="22"/>
        </g>`;
    })
    .join("");

  const markerMarkup = edges
    .map(
      (edge) => `
        <marker id="arrow-${edge.index}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="${edge.color}"/>
        </marker>`
    )
    .join("");

  const nodeMarkup = Object.values(nodes)
    .map(
      (node) => `
        <g class="node ${node.name === selection.service ? "selected" : ""}" tabindex="0" role="button" aria-label="${node.name}" data-name="${node.name}" transform="translate(${node.x},${node.y})">
          <rect class="card" width="${NODE_WIDTH}" height="${node.height}" rx="14"/>
          <circle class="role-dot" cx="18" cy="20" r="3.5"/>
          <text class="role" x="28" y="24">${node.role}</text>
          <text class="name" x="${NODE_WIDTH / 2}" y="${node.height / 2 + 6}">${node.name}</text>
          <text class="traffic" x="${NODE_WIDTH / 2}" y="${node.height - 14}">${node.inCalls ? "in " + formatCount(node.inCalls) : ""}${node.inCalls && node.outCalls ? "  ·  " : ""}${node.outCalls ? "out " + formatCount(node.outCalls) : ""}</text>
        </g>`
    )
    .join("");

  const labelMarkup = edges
    .map(
      (edge) => `
        <g class="edge-label" ${dataAttributes(edge)}>
          <rect x="${edge.label.x}" y="${edge.label.y}" width="${edge.label.width}" height="${edge.label.height}" rx="13"/>
          <circle cx="${edge.label.x + 13}" cy="${edge.label.y + 13}" r="3.5" fill="${edge.color}"/>
          <text x="${edge.label.x + edge.label.width / 2 + 6}" y="${edge.label.y + 17.5}">${edge.uri} <tspan class="count">${formatCount(edge.count)}</tspan></text>
        </g>`
    )
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Service call graph">
      <defs>${gradientMarkup}${markerMarkup}</defs>
      ${edgeMarkup}
      ${nodeMarkup}
      ${labelMarkup}
    </svg>
    <div class="tooltip" role="tooltip"></div>
    <div class="legend">
      <span>Calls per edge</span>
      <span>fewer</span><span class="bar" style="background:linear-gradient(90deg,${ramp[0]},${ramp[1]},${ramp[2]})"></span><span>more</span>
      <span class="hint">Hover an edge to trace its chain · click a service or edge to select it · Esc to clear</span>
    </div>`;
}

handlebars.registerHelper("serviceMap", function (frames) {
  const selection = readSelection();
  const isDark = grafana.theme.isDark;
  const range = grafana.timeRange;
  const rangeMinutes = Math.max(1, (range.to.valueOf() - range.from.valueOf()) / 60000);
  const edges = collectEdges(readEdges(frames), selection);
  const body = edges.length
    ? graphMarkup(edges, selection, rangeMinutes, isDark ? RAMP_DARK : RAMP_LIGHT)
    : `<div class="empty">No calls found for this selection in the chosen time range.</div>`;
  const table = edges.length ? tableMarkup(edges, rangeMinutes) : "";
  return new handlebars.SafeString(
    `<div class="service-map ${isDark ? "dark" : "light"}">${statsMarkup(edges, selection, rangeMinutes)}${hopChipsMarkup(edges)}<div class="selection-bar" hidden></div><div class="canvas">${body}</div>${table}</div>`
  );
});
