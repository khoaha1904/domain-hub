const graphHost = document.querySelector("#graph");
const fallback = document.querySelector("#fallback");
const typeFilter = document.querySelector("#type-filter");
const repositoryFilter = document.querySelector("#repository-filter");
const membershipFilter = document.querySelector("#membership-filter");
const flowToggle = document.querySelector("#flow-toggle");
const search = document.querySelector("#search");
const details = document.querySelector(".details");
const closeDetails = document.querySelector("#close-details");
const viewDocument = document.querySelector("#view-document");
const documentDialog = document.querySelector("#document-dialog");
const domainDetails = document.querySelector("#domain-details");

function addTextBlock(parent, title, values) {
  if (!values.length) return;
  const block = document.createElement("section");
  block.className = "meta-block";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  }
  block.append(heading, list);
  parent.append(block);
}

function sourceGroup(value) {
  const repository = /^repository:\/\/([^/]+)\/([^#]+)(?:#.*)?$/.exec(value);
  if (repository) return { key: `${repository[1]}/${repository[2]}`, label: repository[2] };
  const base = value.split("#", 1)[0];
  return { key: base, label: base };
}

function addEvidenceBlock(parent, values) {
  const exact = [...new Set(values)].sort();
  if (!exact.length) return;
  const groups = new Map();
  for (const value of exact) {
    const group = sourceGroup(value), current = groups.get(group.key) ?? { label: group.label, count: 0 };
    current.count += 1; groups.set(group.key, current);
  }
  const block = document.createElement("section");
  block.className = "meta-block evidence-block";
  const heading = document.createElement("h3");
  heading.textContent = "Evidence";
  const summary = document.createElement("p");
  summary.className = "evidence-summary";
  summary.textContent = `${groups.size} files or sources · ${exact.length} citations`;
  const files = document.createElement("ul");
  for (const { label, count } of [...groups.values()].sort((left, right) => left.label.localeCompare(right.label))) {
    const item = document.createElement("li");
    item.textContent = `${label} · ${count}`;
    files.append(item);
  }
  const disclosure = document.createElement("details");
  const disclosureLabel = document.createElement("summary");
  disclosureLabel.textContent = "Show exact evidence";
  const citations = document.createElement("ul");
  citations.className = "exact-evidence";
  for (const value of exact) {
    const item = document.createElement("li");
    item.textContent = value; citations.append(item);
  }
  disclosure.append(disclosureLabel, citations);
  block.append(heading, summary, files, disclosure);
  parent.append(block);
}

function nodeType(node) {
  return node.representation === "embedded"
    ? `${node.type} / ${node.resourceKind} · embedded`
    : `${node.type} · ${node.membership}`;
}

function showFallback(error) {
  graphHost.hidden = true;
  fallback.hidden = false;
  const detail = document.createElement("p");
  detail.textContent = error instanceof Error ? error.message : "The static map could not start.";
  fallback.append(detail);
}

function repositoryRegionId(repositoryId) {
  return `region:${repositoryId}`;
}

function fixedPositions(nodes, repositoryColumns, edges) {
  const positions = new Map(), regions = new Map(), repositories = nodes.filter((node) => node.type === "Repository")
    .sort((left, right) => left.id.localeCompare(right.id)), nodeById = new Map(nodes.map((node) => [node.id, node]));
  let nextX = 0, nextY = 0, rowHeight = 0, maximumBottom = 0;
  repositories.forEach((repository, repositoryIndex) => {
    if (repositoryIndex > 0 && repositoryIndex % repositoryColumns === 0) {
      nextX = 0; nextY += rowHeight + 90; rowHeight = 0;
    }
    const owned = nodes.filter((node) => node.id !== repository.id
      && node.repositoryIds.length === 1 && node.repositoryIds[0] === repository.id)
      .sort((left, right) => left.id.localeCompare(right.id));
    const width = Math.max(420, Math.min(720, owned.length * 120));
    const height = Math.max(320, Math.min(480, owned.length * 80));
    const center = { x: nextX + width / 2, y: nextY + height / 2 };
    const region = { ...center, width, height };
    regions.set(repository.id, region);
    positions.set(repositoryRegionId(repository.id), center);
    positions.set(repository.id, { x: nextX + 82, y: nextY + 34 });
    owned.forEach((node, index) => {
      const angle = -Math.PI / 2 + index * 2 * Math.PI / Math.max(owned.length, 1);
      positions.set(node.id, {
        x: center.x + Math.cos(angle) * (width / 2 - 90),
        y: center.y + Math.sin(angle) * (height / 2 - 80),
      });
    });
    nextX += width + 90;
    rowHeight = Math.max(rowHeight, height);
    maximumBottom = Math.max(maximumBottom, nextY + height);
  });
  const outside = nodes.filter((node) => !positions.has(node.id)).sort((left, right) => left.id.localeCompare(right.id));
  const relatedRepositories = new Map(outside.map((node) => {
    const related = new Set(node.repositoryIds.filter((repositoryId) => regions.has(repositoryId)));
    for (const edge of edges) {
      const otherId = edge.displaySource === node.id ? edge.displayTarget : edge.displayTarget === node.id ? edge.displaySource : undefined;
      for (const repositoryId of nodeById.get(otherId)?.repositoryIds ?? []) if (regions.has(repositoryId)) related.add(repositoryId);
    }
    return [node.id, [...related].sort()];
  }));
  const groups = new Map();
  for (const node of outside) {
    const key = relatedRepositories.get(node.id).join("|") || "unassociated";
    const group = groups.get(key) ?? [];
    group.push(node); groups.set(key, group);
  }
  for (const [key, group] of groups) group.forEach((node, index) => {
    const repositoryIds = relatedRepositories.get(node.id);
    if (repositoryIds.length === 1) {
      const repositoryId = repositoryIds[0], region = regions.get(repositoryId);
      const side = repositories.findIndex((repository) => repository.id === repositoryId) % repositoryColumns === 0 ? -1 : 1;
      positions.set(node.id, { x: region.x + side * (region.width / 2 + 90), y: region.y + (index - (group.length - 1) / 2) * 90 });
      return;
    }
    if (repositoryIds.length > 1) {
      const related = repositoryIds.map((repositoryId) => regions.get(repositoryId));
      const spread = index === 0 ? 0 : Math.ceil(index / 2) * 70 * (index % 2 ? 1 : -1);
      const horizontal = Math.max(...related.map((region) => region.x)) - Math.min(...related.map((region) => region.x))
        >= Math.max(...related.map((region) => region.y)) - Math.min(...related.map((region) => region.y));
      positions.set(node.id, {
        x: related.reduce((total, region) => total + region.x, 0) / related.length + (horizontal ? 0 : spread),
        y: related.reduce((total, region) => total + region.y, 0) / related.length + (horizontal ? spread : 0),
      });
      return;
    }
    const columns = Math.min(5, Math.max(1, group.length));
    positions.set(node.id, { x: 80 + (index % columns) * 150, y: maximumBottom + 100 + Math.floor(index / columns) * 120 });
  });
  return { positions, regions };
}

function outsideLabel(node) {
  if (node.membership === "boundary") return "Shared / External";
  if (node.repositoryIds.length > 1) return "Shared";
  return "";
}

async function start() {
  if (typeof globalThis.cytoscape !== "function") throw new Error("The local 2D renderer is unavailable.");
  const browserBuildQuery = new URL(import.meta.url).search;
  const response = await fetch(`data/domain.json${browserBuildQuery}`);
  if (!response.ok) throw new Error("Published Domain snapshot could not be loaded.");
  const projection = await response.json();
  const nodeById = new Map(projection.nodes.map((node) => [node.id, node]));
  const flowEdges = projection.flows.flatMap((flow) => flow.steps.map((step) => ({
    id: `flow-${flow.id}-${step.order}`,
    predicate: step.action,
    displaySource: step.source,
    displayTarget: step.target,
    displayClass: "flow-step",
    directed: true,
    flow: flow.id,
  })));
  const allEdges = [...projection.edges, ...flowEdges];
  const graphNodes = projection.nodes.filter((node) => node.type !== "Domain");
  const graphNodeIds = new Set(graphNodes.map((node) => node.id));
  const visualEdges = [...projection.edges.filter((edge) => edge.displayClass !== "structural"), ...flowEdges]
    .filter((edge) => graphNodeIds.has(edge.displaySource) && graphNodeIds.has(edge.displayTarget));
  const { positions, regions } = fixedPositions(graphNodes, graphHost.clientWidth <= 720 ? 1 : 2, visualEdges);
  const repositories = graphNodes.filter((node) => node.type === "Repository");
  const adjacency = new Map(projection.nodes.map((node) => [node.id, new Set(node.parentIds)]));
  for (const node of projection.nodes) {
    for (const parent of node.parentIds) adjacency.get(parent)?.add(node.id);
  }
  for (const edge of allEdges) {
    adjacency.get(edge.displaySource)?.add(edge.displayTarget);
    adjacency.get(edge.displayTarget)?.add(edge.displaySource);
  }
  const questionsBySubject = new Map();
  for (const question of projection.questions) {
    const values = questionsBySubject.get(question.subject) ?? [];
    values.push(question);
    questionsBySubject.set(question.subject, values);
  }

  document.querySelector("#domain-title").textContent = projection.domain.title;
  document.querySelector("#snapshot").textContent = `${projection.hub} · ${projection.commit.slice(0, 12)}`;
  for (const type of [...new Set(graphNodes.map((node) => node.type))].sort()) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    typeFilter.append(option);
  }
  for (const repository of projection.nodes.filter((node) => node.type === "Repository")
    .sort((left, right) => left.title.localeCompare(right.title))) {
    const option = document.createElement("option");
    option.value = repository.id;
    option.textContent = repository.title;
    repositoryFilter.append(option);
  }
  flowToggle.disabled = projection.flows.length === 0;

  const elements = [
    ...repositories.map((repository) => ({
      data: { id: repositoryRegionId(repository.id), repositoryId: repository.id,
        regionWidth: regions.get(repository.id)?.width, regionHeight: regions.get(repository.id)?.height },
      position: positions.get(repositoryRegionId(repository.id)),
      classes: "repository-region",
      grabbable: false,
      selectable: false,
    })),
    ...graphNodes.map((node) => ({
      data: { id: node.id, label: node.type === "Flow" ? `Flow · ${node.title}`
        : outsideLabel(node) ? `${node.title}\n${outsideLabel(node)}` : node.title,
        type: node.type, membership: node.membership,
        questionCount: (questionsBySubject.get(node.id) ?? []).length },
      position: positions.get(node.id),
      classes: `${node.membership} ${node.representation}${outsideLabel(node) ? " outside" : ""}${questionsBySubject.has(node.id) ? " question" : ""}`,
    })),
    ...visualEdges.map((edge, index) => ({
      data: { id: `edge-${index}-${edge.id}`, source: edge.displaySource, target: edge.displayTarget,
        label: edge.predicate, displayClass: edge.displayClass, directed: edge.directed },
      classes: `${edge.displayClass}${edge.directed ? " directed" : ""}`,
    })),
  ];

  const cy = globalThis.cytoscape({
    container: graphHost,
    elements,
    minZoom: .25,
    maxZoom: 2.5,
    wheelSensitivity: .22,
    boxSelectionEnabled: false,
    autoungrabify: false,
    layout: { name: "preset", fit: false },
    style: [
      { selector: "node", style: {
        "background-color": "#55c995", "border-color": "#b9f3d7", "border-width": 1,
        color: "#f7f9fc", label: "data(label)", "font-family": "Inter, system-ui, sans-serif",
        "font-size": 11, "font-weight": 600, height: 34, label: "data(label)", padding: 0, shape: "ellipse",
        "text-halign": "center", "text-max-width": 150, "text-outline-color": "#111827",
        "text-outline-opacity": .72, "text-outline-width": 2, "text-valign": "center",
        "text-margin-y": 27, "text-valign": "bottom", "text-wrap": "wrap", width: 34, "z-index": 10,
      } },
      { selector: 'node[type = "System"]', style: { "background-color": "#337ec8", "border-color": "#8bc5ff", width: 38, height: 38, "text-margin-y": 29 } },
      { selector: "node.repository-region", style: { "background-color": "#7552b9", "background-opacity": .1,
        "border-color": "#7552b9", "border-width": 2, events: "no", height: "data(regionHeight)",
        shape: "roundrectangle", width: "data(regionWidth)", "z-index": 0 } },
      { selector: 'node[type = "Repository"]', style: { "background-color": "#7552b9", "background-opacity": .92,
        "border-color": "#c5adff", "border-width": 1.5, "font-size": 11, "font-weight": 700,
        height: 34, shape: "roundrectangle", "text-margin-y": 0, "text-outline-opacity": 0,
        "text-max-width": 116, "text-valign": "center", "text-wrap": "ellipsis", width: 132, "z-index": 8 } },
      { selector: 'node[type = "Flow"]', style: { "background-color": "#b77a18", "background-opacity": .16,
        "border-color": "#f4cf86", "border-style": "dashed", "font-size": 9, height: 28,
        shape: "roundrectangle", "text-margin-y": 0, "text-max-width": 150, "text-outline-opacity": 0,
        "text-valign": "center", "text-wrap": "ellipsis", width: 170 } },
      { selector: "node.embedded", style: { "background-color": "#263b35", "border-color": "#f4be5b",
        "border-style": "dashed", "border-width": 2, color: "#d7deea", height: 27, width: 27, "text-margin-y": 23 } },
      { selector: "node.boundary", style: { "background-opacity": .3, "border-style": "dashed", "border-width": 2, color: "#c0c8d4" } },
      { selector: "node.outside", style: { "font-size": 9, "text-max-width": 170 } },
      { selector: "node.question", style: { "border-color": "#ff7657", "border-width": 4 } },
      { selector: "edge", style: { "curve-style": "bezier", "line-color": "#465367", opacity: .62, width: 1.2 } },
      { selector: "edge.structural", style: { "line-style": "dashed", opacity: .38 } },
      { selector: "edge.runtime", style: { color: "#9bcaff", label: "data(label)", "font-size": 8,
        "line-color": "#58a6ff", "target-arrow-color": "#58a6ff", "target-arrow-shape": "triangle",
        "text-background-color": "#09101a", "text-background-opacity": .85, "text-background-padding": 2,
        "text-rotation": "autorotate", width: 2 } },
      { selector: "edge.flow-step", style: { color: "#f8d895", label: "data(label)", "font-size": 8,
        "line-color": "#f4be5b", "line-style": "dashed", "target-arrow-color": "#f4be5b",
        "target-arrow-shape": "triangle", "text-background-color": "#09101a", "text-background-opacity": .85,
        "text-background-padding": 2, "text-rotation": "autorotate", width: 2 } },
      { selector: ".hidden", style: { display: "none" } },
      { selector: ".faded", style: { opacity: .1, "text-opacity": .08 } },
      { selector: "node:selected", style: { "border-color": "#ffffff", "border-width": 4, "overlay-color": "#58a6ff", "overlay-opacity": .12, "overlay-padding": 8 } },
    ],
  });
  cy.nodes(".repository-region").ungrabify();
  cy.nodes('[type = "Repository"]').ungrabify();
  const initialPositions = new Map([...positions].map(([id, position]) => [id, { x: position.x, y: position.y }]));

  const initialVisible = () => new Set(graphNodes.map((node) => node.id));
  let visible = initialVisible();
  let selected;

  function shownNodeIds() {
    const shown = new Set([...visible].filter((id) => {
      const node = nodeById.get(id);
      return node && (typeFilter.value === "all" || node.type === typeFilter.value)
        && (repositoryFilter.value === "all" || node.repositoryIds.includes(repositoryFilter.value))
        && (membershipFilter.value === "all" || node.membership === membershipFilter.value);
    }));
    for (const id of [...shown]) {
      for (const repositoryId of nodeById.get(id)?.repositoryIds ?? []) if (graphNodeIds.has(repositoryId)) shown.add(repositoryId);
    }
    for (const repository of repositories) if (shown.has(repository.id)) shown.add(repositoryRegionId(repository.id));
    return shown;
  }

  function clampToOwnership(graphNode) {
    const node = nodeById.get(graphNode.id());
    if (!node || node.type === "Repository") return;
    const position = graphNode.position(), padding = 52;
    if (node.repositoryIds.length === 1 && regions.has(node.repositoryIds[0])) {
      const region = regions.get(node.repositoryIds[0]);
      graphNode.position({
        x: Math.max(region.x - region.width / 2 + padding, Math.min(region.x + region.width / 2 - padding, position.x)),
        y: Math.max(region.y - region.height / 2 + 72, Math.min(region.y + region.height / 2 - padding, position.y)),
      });
      return;
    }
    for (const region of regions.values()) {
      const left = region.x - region.width / 2 - padding, right = region.x + region.width / 2 + padding;
      const top = region.y - region.height / 2 - padding, bottom = region.y + region.height / 2 + padding;
      if (position.x <= left || position.x >= right || position.y <= top || position.y >= bottom) continue;
      const nearest = Math.min(position.x - left, right - position.x, position.y - top, bottom - position.y);
      if (nearest === position.x - left) position.x = left;
      else if (nearest === right - position.x) position.x = right;
      else if (nearest === position.y - top) position.y = top;
      else position.y = bottom;
    }
    graphNode.position(position);
  }

  function applyHighlight() {
    cy.elements().removeClass("faded");
    if (!selected) return;
    const node = cy.$id(selected);
    if (!node.length || node.hasClass("hidden")) return;
    cy.elements().not(".hidden").addClass("faded");
    if (nodeById.get(selected)?.type === "System") {
      const members = new Set([selected, ...projection.nodes
        .filter((candidate) => candidate.parentIds.includes(selected)).map((candidate) => candidate.id)]);
      cy.nodes().filter((candidate) => members.has(candidate.id())).removeClass("faded");
      cy.edges().filter((edge) => members.has(edge.source().id()) && members.has(edge.target().id())).removeClass("faded");
      return;
    }
    node.closedNeighborhood().removeClass("faded");
  }

  function applyVisibility({ fit = true } = {}) {
    const shown = shownNodeIds();
    cy.nodes().forEach((node) => node.toggleClass("hidden", !shown.has(node.id())));
    cy.edges().forEach((edge) => {
      const flowHidden = edge.hasClass("flow-step") && !flowToggle.checked;
      edge.toggleClass("hidden", flowHidden || !shown.has(edge.source().id()) || !shown.has(edge.target().id()));
    });
    const displayed = cy.elements().not(".hidden");
    if (displayed.nodes().length) {
      if (fit) cy.fit(displayed, 80);
    }
    applyHighlight();
    document.querySelector("#stats").textContent = `${displayed.nodes().not(".repository-region").length} shown / ${graphNodes.length} nodes\n${displayed.edges().length} shown / ${visualEdges.length} arrows\n${projection.questions.length} active questions`;
  }

  function showDetails(id) {
    const node = nodeById.get(id);
    if (!node) return;
    selected = id;
    details.classList.add("is-open");
    details.setAttribute("aria-label", `Details for ${node.title}`);
    if (graphNodeIds.has(id)) visible.add(id);
    if (node.expandable) for (const related of adjacency.get(id) ?? []) if (graphNodeIds.has(related)) visible.add(related);
    document.querySelector("#detail-title").textContent = node.title;
    document.querySelector("#detail-type").textContent = nodeType(node);
    document.querySelector("#detail-description").textContent = node.description || "No Published description.";
    const meta = document.querySelector("#detail-meta");
    meta.replaceChildren();
    addTextBlock(meta, "Identity", [node.externalIdentity ?? node.id, node.path]);
    if (node.representation === "embedded") addTextBlock(meta, "Published parents", node.parentIds);
    addEvidenceBlock(meta, node.sources);
    addTextBlock(meta, "Active questions", (questionsBySubject.get(id) ?? []).map((item) => `${item.state}: ${item.property}`));
    addTextBlock(meta, "Direct relations", allEdges.filter((edge) => edge.displaySource === id || edge.displayTarget === id)
      .map((edge) => {
        const source = nodeById.get(edge.displaySource)?.title ?? edge.displaySource;
        const target = nodeById.get(edge.displayTarget)?.title ?? edge.displayTarget;
        return `${source} — ${edge.predicate} → ${target}`;
      }));
    viewDocument.disabled = node.representation === "embedded";
    viewDocument.textContent = node.representation === "embedded" ? "Contained in parent document" : "View document";
    cy.nodes().unselect();
    if (graphNodeIds.has(id)) cy.$id(id).select();
    applyVisibility();
  }

  function clearDetails() {
    details.classList.remove("is-open");
    details.removeAttribute("aria-label");
    document.querySelector("#detail-title").textContent = "Choose a node";
    document.querySelector("#detail-type").textContent = "Published concept details appear here.";
    document.querySelector("#detail-description").textContent = "";
    document.querySelector("#detail-meta").replaceChildren();
    viewDocument.disabled = true;
    viewDocument.textContent = "View document";
  }

  function showDocument(id) {
    const node = nodeById.get(id);
    if (!node) return;
    document.querySelector("#document-title").textContent = node.title;
    document.querySelector("#document-type").textContent = nodeType(node);
    document.querySelector("#document-description").textContent = node.description || "No Published description.";
    const meta = document.querySelector("#document-meta");
    meta.replaceChildren();
    addTextBlock(meta, "Identity", [node.id, node.path]);
    addEvidenceBlock(meta, node.sources);
    addTextBlock(meta, "Direct relations", allEdges.filter((edge) => edge.displaySource === id || edge.displayTarget === id)
      .map((edge) => `${nodeById.get(edge.displaySource)?.title ?? edge.displaySource} — ${edge.predicate} → ${nodeById.get(edge.displayTarget)?.title ?? edge.displayTarget}`));
    documentDialog.showModal();
  }

  function focus(hops) {
    if (!selected) return;
    const found = new Set([selected]);
    let frontier = new Set([selected]);
    for (let depth = 0; depth < hops; depth += 1) {
      const next = new Set();
      for (const id of frontier) for (const related of adjacency.get(id) ?? []) {
        if (!found.has(related)) { found.add(related); next.add(related); }
      }
      frontier = next;
    }
    visible = found;
    applyVisibility();
  }

  cy.on("tap", "node", (event) => showDetails(event.target.id()));
  cy.on("dragfree", "node", (event) => clampToOwnership(event.target));
  domainDetails.addEventListener("click", () => showDetails(projection.domain.id));
  closeDetails.addEventListener("click", () => { selected = undefined; cy.nodes().unselect(); clearDetails(); applyVisibility({ fit: false }); });
  viewDocument.addEventListener("click", () => showDocument(selected));
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    if (!query) return;
    const match = projection.nodes.find((node) => `${node.title} ${node.id} ${node.description} ${node.resourceKind ?? ""} ${node.externalIdentity ?? ""}`.toLowerCase().includes(query));
    if (match) showDetails(match.id);
  });
  typeFilter.addEventListener("change", () => applyVisibility());
  repositoryFilter.addEventListener("change", () => applyVisibility());
  membershipFilter.addEventListener("change", () => applyVisibility());
  flowToggle.addEventListener("change", () => applyVisibility({ fit: false }));
  document.querySelector("#focus-one").addEventListener("click", () => focus(1));
  document.querySelector("#focus-two").addEventListener("click", () => focus(2));
  document.querySelector("#reset").addEventListener("click", () => {
    selected = undefined;
    search.value = "";
    typeFilter.value = "all";
    repositoryFilter.value = "all";
    membershipFilter.value = "all";
    flowToggle.checked = true;
    visible = initialVisible();
    cy.nodes().unselect();
    for (const [id, position] of initialPositions) cy.$id(id).position(position);
    clearDetails();
    applyVisibility();
  });
  new ResizeObserver(() => cy.resize()).observe(graphHost);
  applyVisibility();
}

start().catch(showFallback);
