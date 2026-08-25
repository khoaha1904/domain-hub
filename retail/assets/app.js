import * as THREE from "./three.module.min.js";

const host = document.querySelector("#canvas-host");
const labelHost = document.querySelector("#labels");
const fallback = document.querySelector("#fallback");
const typeFilter = document.querySelector("#type-filter");
const repositoryFilter = document.querySelector("#repository-filter");
const membershipFilter = document.querySelector("#membership-filter");
const search = document.querySelector("#search");
const highLevelTypes = new Set(["Domain", "System", "Repository"]);

function hash(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function color(node) {
  if (node.membership === "boundary") return 0x6d7480;
  if (node.type === "Domain") return 0xff7448;
  if (node.type === "System") return 0x65a9ff;
  if (node.type === "Repository") return 0xb798ff;
  if (node.type === "Flow") return 0xffc76b;
  return 0x6ad6a0;
}

function addTextBlock(parent, title, values) {
  if (!values.length) return;
  const block = document.createElement("section");
  block.className = "meta-block";
  const heading = document.createElement("h3");
  heading.textContent = title;
  block.append(heading);
  const list = document.createElement("ul");
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  }
  block.append(list);
  parent.append(block);
}

function showFallback(error) {
  host.hidden = true;
  labelHost.hidden = true;
  fallback.hidden = false;
  const detail = document.createElement("p");
  detail.textContent = error instanceof Error ? error.message : "The static graph could not start.";
  fallback.append(detail);
}

async function start() {
  const response = await fetch("data/domain.json");
  if (!response.ok) throw new Error("Published Domain snapshot could not be loaded.");
  const projection = await response.json();
  const nodeById = new Map(projection.nodes.map((node) => [node.id, node]));
  const flowEdges = projection.flows.flatMap((flow) => flow.steps.map((step) => ({
    id: `flow-${flow.id}-${step.order}`,
    predicate: step.action,
    displaySource: step.source,
    displayTarget: step.target,
    displayClass: "runtime",
    directed: true,
    flow: flow.id,
  })));
  const allEdges = [...projection.edges, ...flowEdges];
  const adjacency = new Map(projection.nodes.map((node) => [node.id, new Set(node.parentIds)]));
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
    const option = document.createElement("option"); option.value = type; option.textContent = type; typeFilter.append(option);
  }
  for (const repository of projection.nodes.filter((node) => node.type === "Repository").sort((left, right) => left.title.localeCompare(right.title))) {
    const option = document.createElement("option"); option.value = repository.id; option.textContent = repository.title; repositoryFilter.append(option);
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090d15, .012);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 400);
  camera.position.set(0, 8, 58);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x090d15, 0);
  host.append(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xdbe8ff, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(18, 25, 24); scene.add(key);
  const rim = new THREE.PointLight(0x658cff, 55, 90); rim.position.set(-24, -8, 20); scene.add(rim);
  const graph = new THREE.Group(); scene.add(graph);
  const nodeObjects = new Map(), positions = new Map(), labels = new Map();

  function positionFor(node, trail = new Set()) {
    const known = positions.get(node.id); if (known) return known;
    if (trail.has(node.id)) return new THREE.Vector3();
    const seed = hash(node.id), angle = ((seed % 3600) / 3600) * Math.PI * 2;
    let result;
    if (node.type === "Domain") result = new THREE.Vector3(0, 0, 0);
    else if (node.type === "System") result = new THREE.Vector3(Math.cos(angle) * 15, 7 + ((seed >> 5) % 5), Math.sin(angle) * 15);
    else if (node.type === "Repository") result = new THREE.Vector3(Math.cos(angle) * 22, -7 - ((seed >> 5) % 5), Math.sin(angle) * 22);
    else {
      const parent = node.parentIds.map((id) => nodeById.get(id)).find(Boolean);
      const base = parent ? positionFor(parent, new Set(trail).add(node.id)) : new THREE.Vector3();
      const radius = 6 + ((seed >> 8) % 6);
      result = base.clone().add(new THREE.Vector3(Math.cos(angle) * radius, ((seed >> 16) % 9) - 4, Math.sin(angle) * radius));
    }
    positions.set(node.id, result); return result;
  }
  projection.nodes.forEach((node) => positionFor(node));

  let visible = new Set(projection.nodes.filter((node) => highLevelTypes.has(node.type) || node.membership === "boundary").map((node) => node.id));
  let focused, selected;

  function filteredIds() {
    return new Set([...visible].filter((id) => {
      const node = nodeById.get(id);
      return node && (typeFilter.value === "all" || node.type === typeFilter.value)
        && (repositoryFilter.value === "all" || node.repositoryIds.includes(repositoryFilter.value))
        && (membershipFilter.value === "all" || node.membership === membershipFilter.value);
    }));
  }

  function clearGraph() {
    for (const child of [...graph.children]) {
      graph.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((item) => item.dispose()); else child.material?.dispose();
    }
    labelHost.replaceChildren(); nodeObjects.clear(); labels.clear();
  }

  function rebuild() {
    clearGraph();
    const shown = filteredIds();
    const shownEdges = allEdges.filter((edge) => shown.has(edge.displaySource) && shown.has(edge.displayTarget));
    for (const edge of shownEdges) {
      const source = positions.get(edge.displaySource), target = positions.get(edge.displayTarget);
      if (!source || !target) continue;
      const material = new THREE.LineBasicMaterial({ color: edge.displayClass === "structural" ? 0x586273 : 0x65a9ff,
        transparent: true, opacity: edge.displayClass === "structural" ? .35 : .7 });
      graph.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([source, target]), material));
      if (edge.directed) {
        const direction = target.clone().sub(source), length = direction.length();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(.22, .65, 8), new THREE.MeshBasicMaterial({ color: 0x65a9ff }));
        cone.position.copy(source).add(direction.clone().normalize().multiplyScalar(Math.max(0, length - 1.25)));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        graph.add(cone);
      }
    }
    for (const node of projection.nodes.filter((item) => shown.has(item.id))) {
      const radius = node.type === "Domain" ? 1.15 : highLevelTypes.has(node.type) ? .82 : .58;
      const material = new THREE.MeshStandardMaterial({ color: color(node), roughness: .38, metalness: .18,
        transparent: node.membership === "boundary", opacity: node.membership === "boundary" ? .7 : 1 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), material);
      mesh.position.copy(positions.get(node.id)); mesh.userData.id = node.id; graph.add(mesh); nodeObjects.set(node.id, mesh);
      const label = document.createElement("span");
      label.className = `node-label ${node.membership}${questionsBySubject.has(node.id) ? " question" : ""}`;
      label.textContent = node.title; labelHost.append(label); labels.set(node.id, label);
    }
    document.querySelector("#stats").textContent = `${shown.size} shown / ${projection.nodes.length} nodes\n${shownEdges.length} shown / ${allEdges.length} links\n${projection.questions.length} active questions`;
  }

  function showDetails(id) {
    const node = nodeById.get(id); if (!node) return;
    selected = id;
    document.querySelector("#detail-title").textContent = node.title;
    document.querySelector("#detail-type").textContent = `${node.type} · ${node.membership}`;
    document.querySelector("#detail-description").textContent = node.description || "No Published description.";
    const meta = document.querySelector("#detail-meta"); meta.replaceChildren();
    addTextBlock(meta, "Identity", [node.id, node.path]);
    addTextBlock(meta, "Published sources", node.sources);
    addTextBlock(meta, "Active questions", (questionsBySubject.get(id) ?? []).map((item) => `${item.state}: ${item.property}`));
    addTextBlock(meta, "Direct relations", allEdges.filter((edge) => edge.displaySource === id || edge.displayTarget === id)
      .map((edge) => `${edge.displaySource} — ${edge.predicate} → ${edge.displayTarget}`));
    if (node.expandable) for (const related of adjacency.get(id) ?? []) visible.add(related);
    rebuild();
  }

  function focus(hops) {
    if (!selected) return;
    const found = new Set([selected]), frontier = new Set([selected]);
    for (let depth = 0; depth < hops; depth += 1) {
      const next = new Set();
      for (const id of frontier) for (const related of adjacency.get(id) ?? []) if (!found.has(related)) { found.add(related); next.add(related); }
      frontier.clear(); for (const id of next) frontier.add(id);
    }
    focused = found; visible = new Set(found); rebuild();
  }

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase(); if (!query) return;
    const match = projection.nodes.find((node) => `${node.title} ${node.id} ${node.description}`.toLowerCase().includes(query));
    if (match) { visible.add(match.id); for (const id of adjacency.get(match.id) ?? []) visible.add(id); showDetails(match.id); }
  });
  typeFilter.addEventListener("change", rebuild); repositoryFilter.addEventListener("change", rebuild); membershipFilter.addEventListener("change", rebuild);
  document.querySelector("#focus-one").addEventListener("click", () => focus(1));
  document.querySelector("#focus-two").addEventListener("click", () => focus(2));
  document.querySelector("#reset").addEventListener("click", () => {
    focused = undefined; selected = undefined; typeFilter.value = "all"; repositoryFilter.value = "all"; membershipFilter.value = "all";
    visible = new Set(projection.nodes.filter((node) => highLevelTypes.has(node.type) || node.membership === "boundary").map((node) => node.id)); rebuild();
  });

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let dragging = false, moved = false, previous = { x: 0, y: 0 };
  renderer.domElement.addEventListener("pointerdown", (event) => { dragging = true; moved = false; previous = { x: event.clientX, y: event.clientY }; renderer.domElement.setPointerCapture(event.pointerId); });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y; moved ||= Math.abs(dx) + Math.abs(dy) > 2;
    graph.rotation.y += dx * .006; graph.rotation.x = THREE.MathUtils.clamp(graph.rotation.x + dy * .004, -.8, .8); previous = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    dragging = false; if (moved) return;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects([...nodeObjects.values()], false)[0]; if (hit?.object.userData.id) showDetails(hit.object.userData.id);
  });
  renderer.domElement.addEventListener("wheel", (event) => { event.preventDefault(); camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * .025, 18, 110); }, { passive: false });

  function resize() {
    const rect = host.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / Math.max(1, rect.height); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize(); rebuild();
  function animate() {
    requestAnimationFrame(animate);
    for (const [id, label] of labels) {
      const mesh = nodeObjects.get(id); if (!mesh) continue;
      const point = mesh.position.clone().applyMatrix4(graph.matrixWorld).project(camera);
      label.style.left = `${(point.x * .5 + .5) * host.clientWidth}px`; label.style.top = `${(-point.y * .5 + .5) * host.clientHeight}px`;
      label.style.opacity = point.z < 1 ? "1" : "0";
    }
    renderer.render(scene, camera);
  }
  animate();
}

start().catch(showFallback);
