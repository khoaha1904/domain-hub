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
  for (const type of [...new Set(projection.nodes.map((node) => node.type))].sort()) {
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
    ...projection.nodes.map((node) => ({
      data: { id: node.id, label: node.title, type: node.type, membership: node.membership,
        questionCount: (questionsBySubject.get(node.id) ?? []).length },
      classes: `${node.membership} ${node.representation}${questionsBySubject.has(node.id) ? " question" : ""}`,
    })),
    ...allEdges.map((edge, index) => ({
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
    style: [
      { selector: "node", style: {
        "background-color": "#55c995", "border-color": "#b9f3d7", "border-width": 1,
        color: "#f7f9fc", label: "data(label)", "font-family": "Inter, system-ui, sans-serif",
        "font-size": 11, "font-weight": 600, height: 34, label: "data(label)", padding: 0, shape: "ellipse",
        "text-halign": "center", "text-max-width": 150, "text-outline-color": "#111827",
        "text-outline-opacity": .72, "text-outline-width": 2, "text-valign": "center",
        "text-margin-y": 27, "text-valign": "bottom", "text-wrap": "wrap", width: 34,
      } },
      { selector: 'node[type = "Domain"]', style: { "background-color": "#ff7657", "border-color": "#ffd0c4", "font-size": 13, width: 42, height: 42, "text-margin-y": 31 } },
      { selector: 'node[type = "System"]', style: { "background-color": "#337ec8", "border-color": "#8bc5ff", width: 38, height: 38, "text-margin-y": 29 } },
      { selector: 'node[type = "Repository"]', style: { "background-color": "#7552b9", "border-color": "#c8b1ff", width: 38, height: 38, "text-margin-y": 29 } },
      { selector: 'node[type = "Flow"]', style: { "background-color": "#b77a18", "border-color": "#f4cf86" } },
      { selector: "node.embedded", style: { "background-color": "#263b35", "border-color": "#f4be5b",
        "border-style": "dashed", "border-width": 2, color: "#d7deea", height: 27, width: 27, "text-margin-y": 23 } },
      { selector: "node.boundary", style: { "background-opacity": .3, "border-style": "dashed", "border-width": 2, color: "#c0c8d4" } },
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

  const initialVisible = () => new Set(projection.nodes.map((node) => node.id));
  let visible = initialVisible();
  let selected;

  function shownNodeIds() {
    return new Set([...visible].filter((id) => {
      const node = nodeById.get(id);
      return node && (typeFilter.value === "all" || node.type === typeFilter.value)
        && (repositoryFilter.value === "all" || node.repositoryIds.includes(repositoryFilter.value))
        && (membershipFilter.value === "all" || node.membership === membershipFilter.value);
    }));
  }

  function applyHighlight() {
    cy.elements().removeClass("faded");
    if (!selected) return;
    const node = cy.$id(selected);
    if (!node.length || node.hasClass("hidden")) return;
    cy.elements().not(".hidden").addClass("faded");
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
      displayed.layout({
        name: "concentric",
        animate: false,
        avoidOverlap: false,
        equidistant: true,
        minNodeSpacing: 16,
        spacingFactor: .78,
        startAngle: -Math.PI / 2,
        concentric(node) {
          const type = node.data("type");
          if (type === "Domain") return 4;
          if (type === "System") return 3;
          if (type === "Repository") return 2;
          if (type === "Flow") return 1;
          return 0;
        },
        levelWidth: () => 1,
        sort: (left, right) => left.id().localeCompare(right.id()),
      }).run();
      if (fit) cy.fit(displayed, 52);
    }
    applyHighlight();
    document.querySelector("#stats").textContent = `${displayed.nodes().length} shown / ${projection.nodes.length} nodes\n${displayed.edges().length} shown / ${allEdges.length} links\n${projection.questions.length} active questions`;
  }

  function showDetails(id) {
    const node = nodeById.get(id);
    if (!node) return;
    selected = id;
    details.classList.add("is-open");
    details.setAttribute("aria-label", `Details for ${node.title}`);
    visible.add(id);
    if (node.expandable) for (const related of adjacency.get(id) ?? []) visible.add(related);
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
    cy.$id(id).select();
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
    flowToggle.checked = false;
    visible = initialVisible();
    cy.nodes().unselect();
    clearDetails();
    applyVisibility();
  });
  new ResizeObserver(() => cy.resize()).observe(graphHost);
  applyVisibility();
}

start().catch(showFallback);
