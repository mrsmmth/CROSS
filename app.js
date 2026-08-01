(() => {
  "use strict";

  const STORAGE_KEY = "cross-globe-v1";
  const LONG_PRESS_MS = 620;
  const MOVE_THRESHOLD = 7;
  const SIZE_RADIUS = { small: 5.5, medium: 9.5, large: 15 };
  const SIZE_LABEL = { small: "小", medium: "中", large: "大" };

  const DEFAULT_CONTINENTS = [
    { id: "av", name: "AVEL", size: "large", custom: false, points: [[-20,-12],[-6,-22],[12,-18],[26,-6],[18,12],[0,18],[-16,10],[-24,-2]] },
    { id: "nr", name: "NORIA", size: "medium", custom: false, points: [[-58,-56],[-36,-60],[-20,-48],[-28,-34],[-50,-36],[-62,-46]] },
    { id: "vc", name: "VELCA", size: "large", custom: false, points: [[34,-16],[56,-20],[68,-8],[64,10],[44,16],[28,2]] },
    { id: "sr", name: "SERA", size: "large", custom: false, points: [[-8,28],[18,24],[36,34],[28,52],[8,60],[-12,50],[-16,36]] },
    { id: "or", name: "ORNE", size: "medium", custom: false, points: [[-62,2],[-42,-8],[-36,10],[-46,28],[-64,20]] }
  ];

  function uid(prefix = "id") {
    return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
  }

  const SAMPLE_DATA = (() => {
    const nodes = [
      { id: uid(), name: "新島晴人", work: "君は写りたがらない", gender: "男性", age: "28", job: "会社員", detail: "主人公。膵臓がん。", continent: "av", lat: 2, lon: -8 },
      { id: uid(), name: "北原菜摘", work: "君は写りたがらない", gender: "女性", age: "28", job: "会社員", detail: "妊娠初期。", continent: "av", lat: 14, lon: 22 },
      { id: uid(), name: "松木蓮太郎", work: "まっすぐを見た日", gender: "男性", age: "28", job: "芸人", detail: "盲目の主人公。", continent: "nr", lat: -38, lon: -46 },
      { id: uid(), name: "夜行", work: "POPLAB", gender: "-", age: "-", job: "記録者", detail: "POPLABの記録者。", continent: "vc", lat: -4, lon: 58 }
    ];
    return {
      version: 2,
      continents: clone(DEFAULT_CONTINENTS),
      nodes,
      links: [[nodes[0].id, nodes[1].id], [nodes[2].id, nodes[3].id]],
      camera: { rotX: -0.2, rotY: 0.58, zoom: 1, viewZoom: 1.08 },
      viewMode: false,
      selectedId: nodes[0].id
    };
  })();

  const $ = id => document.getElementById(id);
  const appShell = $("appShell");
  const canvas = $("globeCanvas");
  const ctx = canvas.getContext("2d");
  const addNodeButton = $("addNodeButton");
  const settingsButton = $("settingsButton");
  const viewModeButton = $("viewModeButton");
  const exitViewButton = $("exitViewButton");
  const searchInput = $("searchInput");
  const workFilter = $("workFilter");
  const continentFilter = $("continentFilter");
  const resultList = $("resultList");
  const resultCount = $("resultCount");
  const selectedTitle = $("selectedTitle");
  const selectedMeta = $("selectedMeta");
  const focusSelectedButton = $("focusSelectedButton");
  const editSelectedButton = $("editSelectedButton");
  const connectSelectedButton = $("connectSelectedButton");
  const longPressHint = $("longPressHint");
  const toast = $("toast");

  const editorModal = $("editorModal");
  const editorTitle = $("editorTitle");
  const nameInput = $("nameInput");
  const workInput = $("workInput");
  const genderInput = $("genderInput");
  const ageInput = $("ageInput");
  const jobInput = $("jobInput");
  const continentInput = $("continentInput");
  const detailInput = $("detailInput");
  const saveNodeButton = $("saveNodeButton");
  const deleteNodeButton = $("deleteNodeButton");

  const connectModal = $("connectModal");
  const connectSearchInput = $("connectSearchInput");
  const connectWorkFilter = $("connectWorkFilter");
  const connectContinentFilter = $("connectContinentFilter");
  const connectList = $("connectList");

  const settingsModal = $("settingsModal");
  const helpModal = $("helpModal");
  const continentNameList = $("continentNameList");
  const newIslandNameInput = $("newIslandNameInput");
  const newIslandSizeInput = $("newIslandSizeInput");
  const addIslandButton = $("addIslandButton");
  const helpButton = $("helpButton");
  const saveSettingsButton = $("saveSettingsButton");
  const exportButton = $("exportButton");
  const importInput = $("importInput");

  let state = loadState();
  let editingId = null;
  let pendingSpawnPosition = null;
  let dragging = false;
  let moved = false;
  let pointerStart = null;
  let pointerLast = null;
  let activePointerId = null;
  let activeNodeId = null;
  let pinchDistance = null;
  let focusTarget = null;
  let hoverHits = [];
  let toastTimer = null;
  let longPressTimer = null;
  let longPressCandidate = null;
  let longPressTriggered = false;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function migrateState(parsed) {
    const migrated = parsed && typeof parsed === "object" ? parsed : clone(SAMPLE_DATA);
    if (!Array.isArray(migrated.continents)) {
      const oldNames = migrated.continentNames || {};
      migrated.continents = clone(DEFAULT_CONTINENTS).map(item => ({ ...item, name: oldNames[item.id] || item.name }));
    }
    migrated.continents = migrated.continents.map((item, index) => normalizeContinent(item, index));
    if (!migrated.continents.length) migrated.continents = clone(DEFAULT_CONTINENTS);
    migrated.nodes = Array.isArray(migrated.nodes) ? migrated.nodes : [];
    migrated.links = Array.isArray(migrated.links) ? migrated.links : [];
    migrated.camera = { rotX: -0.2, rotY: 0.58, zoom: 1, viewZoom: 1.08, ...(migrated.camera || {}) };
    migrated.camera.zoom = clamp(Number(migrated.camera.zoom) || 1, 0.74, 1.64);
    migrated.camera.viewZoom = clamp(Number(migrated.camera.viewZoom) || Math.max(1.08, migrated.camera.zoom), 0.58, 2.85);
    delete migrated.moveMode;
    migrated.viewMode = false;
    migrated.version = 3;
    const validIds = new Set(migrated.continents.map(item => item.id));
    const fallbackId = migrated.continents[0].id;
    migrated.nodes.forEach(node => {
      if (!validIds.has(node.continent)) node.continent = fallbackId;
      node.lat = clamp(Number(node.lat) || 0, -89, 89);
      node.lon = wrapLon(Number(node.lon) || 0);
    });
    if (!migrated.nodes.some(node => node.id === migrated.selectedId)) migrated.selectedId = migrated.nodes[0]?.id || null;
    delete migrated.continentNames;
    return migrated;
  }

  function normalizeContinent(item, index) {
    const fallback = DEFAULT_CONTINENTS[index] || DEFAULT_CONTINENTS[0];
    const points = Array.isArray(item.points) && item.points.length >= 3 ? item.points : clone(fallback.points);
    return {
      id: String(item.id || uid("is")),
      name: String(item.name || `ISLAND ${index + 1}`),
      size: SIZE_RADIUS[item.size] ? item.size : "medium",
      custom: Boolean(item.custom),
      points: points.map(pair => [clamp(Number(pair[0]) || 0, -82, 82), wrapLon(Number(pair[1]) || 0)])
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return migrateState(JSON.parse(raw));
    } catch (error) {
      console.warn("CROSS state load failed", error);
    }
    return clone(SAMPLE_DATA);
  }

  function persistState() {
    const persisted = clone(state);
    delete persisted.moveMode;
    persisted.viewMode = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }

  function saveState({ rerender = true } = {}) {
    persistState();
    if (rerender) {
      renderFilters();
      renderSelectedInfo();
      renderSearchResults();
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
  }

  function setModal(modal, open) {
    modal.classList.toggle("hidden", !open);
  }

  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => setModal($(button.dataset.close), false));
  });

  function getNode(id) {
    return state.nodes.find(node => node.id === id) || null;
  }

  function getContinent(id) {
    return state.continents.find(item => item.id === id) || null;
  }

  function continentName(id) {
    return getContinent(id)?.name || id || "-";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrapLon(lon) {
    let result = lon;
    while (result > 180) result -= 360;
    while (result < -180) result += 360;
    return result;
  }

  function latLonToVec(lat, lon, scale = 1) {
    const a = lat * Math.PI / 180;
    const b = lon * Math.PI / 180;
    return {
      x: Math.cos(a) * Math.sin(b) * scale,
      y: Math.sin(a) * scale,
      z: Math.cos(a) * Math.cos(b) * scale
    };
  }

  function vecToLatLon(v) {
    const n = normalize(v);
    return { lat: Math.asin(n.y) * 180 / Math.PI, lon: Math.atan2(n.x, n.z) * 180 / Math.PI };
  }

  function rotateY(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
  }

  function rotateX(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
  }

  function rotatePoint(v) {
    return rotateX(rotateY(v, state.camera.rotY), state.camera.rotX);
  }

  function inverseRotatePoint(v) {
    return rotateY(rotateX(v, -state.camera.rotX), -state.camera.rotY);
  }

  function normalize(v) {
    const m = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / m, y: v.y / m, z: v.z / m };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function getGlobeMetrics() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const viewScale = state.viewMode ? 0.31 : 0.24;
    const zoom = state.viewMode ? state.camera.viewZoom : state.camera.zoom;
    const cx = width / 2;
    const cy = height / 2 + (state.viewMode ? 0 : (window.innerWidth > 820 ? 26 : 40));
    const radius = Math.min(width, height) * viewScale * zoom;
    return { width, height, cx, cy, radius };
  }

  function project(v) {
    const { cx, cy, radius } = getGlobeMetrics();
    return { x: cx + v.x * radius, y: cy + v.y * radius, z: v.z, radius };
  }

  function pathForContinent(points) {
    const rotated = points.map(([lat, lon]) => rotatePoint(latLonToVec(lat, lon)));
    const frontCount = rotated.filter(point => point.z > -0.08).length;
    if (frontCount < 3) return null;
    return rotated.map(project);
  }

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));
  resize();

  function drawBackground() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  function drawGlobe() {
    const { cx, cy, radius } = getGlobeMetrics();
    const outerGlow = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius * 1.45);
    outerGlow.addColorStop(0, "rgba(82,220,255,0.05)");
    outerGlow.addColorStop(0.65, "rgba(74,168,255,0.03)");
    outerGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = outerGlow;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.48, 0, Math.PI * 2); ctx.fill();

    const sphere = ctx.createRadialGradient(cx - radius * 0.26, cy - radius * 0.35, radius * 0.05, cx, cy, radius);
    sphere.addColorStop(0, "rgba(34,126,160,0.23)");
    sphere.addColorStop(0.42, "rgba(10,44,74,0.44)");
    sphere.addColorStop(1, "rgba(5,17,29,0.85)");
    ctx.fillStyle = sphere;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
    drawGridLines();
    drawContinents();
    ctx.restore();

    ctx.strokeStyle = "rgba(117,234,255,0.34)";
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.92, 0, Math.PI * 2); ctx.stroke();
  }

  function drawGridLines() {
    ctx.strokeStyle = "rgba(112,231,255,0.12)";
    ctx.lineWidth = 1;
    for (const lat of [-60, -30, 0, 30, 60]) {
      ctx.beginPath();
      let first = true;
      for (let lon = -180; lon <= 180; lon += 4) {
        const point = project(rotatePoint(latLonToVec(lat, lon)));
        if (first) { ctx.moveTo(point.x, point.y); first = false; } else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    for (const lon of [-120, -60, 0, 60, 120]) {
      ctx.beginPath();
      let first = true;
      for (let lat = -89; lat <= 89; lat += 3) {
        const point = project(rotatePoint(latLonToVec(lat, lon)));
        if (first) { ctx.moveTo(point.x, point.y); first = false; } else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
  }

  function drawContinents() {
    state.continents.forEach(continent => {
      const path = pathForContinent(continent.points);
      if (!path) return;
      ctx.beginPath();
      path.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath();
      const alpha = continent.custom ? 0.13 : 0.10;
      ctx.fillStyle = `rgba(89,248,255,${alpha})`;
      ctx.strokeStyle = continent.custom ? "rgba(143,246,255,0.24)" : "rgba(111,240,255,0.16)";
      ctx.lineWidth = continent.custom ? 1.2 : 1;
      ctx.fill();
      ctx.stroke();

      const center = path.reduce((sum, point) => ({ x: sum.x + point.x / path.length, y: sum.y + point.y / path.length }), { x: 0, y: 0 });
      ctx.fillStyle = "rgba(205,248,255,0.45)";
      ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(continent.name, center.x, center.y);
    });
  }

  function slerp(a, b, t) {
    const na = normalize(a), nb = normalize(b);
    let dot = clamp(na.x * nb.x + na.y * nb.y + na.z * nb.z, -1, 1);
    if (Math.abs(dot) > 0.9995) return normalize({ x: lerp(na.x, nb.x, t), y: lerp(na.y, nb.y, t), z: lerp(na.z, nb.z, t) });
    const theta = Math.acos(dot) * t;
    const relative = normalize({ x: nb.x - na.x * dot, y: nb.y - na.y * dot, z: nb.z - na.z * dot });
    return {
      x: na.x * Math.cos(theta) + relative.x * Math.sin(theta),
      y: na.y * Math.cos(theta) + relative.y * Math.sin(theta),
      z: na.z * Math.cos(theta) + relative.z * Math.sin(theta)
    };
  }

  function drawConnections() {
    state.links.forEach(([aId, bId]) => {
      const a = getNode(aId), b = getNode(bId);
      if (!a || !b) return;
      const va = latLonToVec(a.lat, a.lon), vb = latLonToVec(b.lat, b.lon);
      ctx.beginPath();
      let visible = false;
      for (let index = 0; index <= 48; index++) {
        const t = index / 48;
        const base = slerp(va, vb, t);
        const lift = 1 + Math.sin(Math.PI * t) * 0.20;
        const rotated = rotatePoint({ x: base.x * lift, y: base.y * lift, z: base.z * lift });
        const point = project(rotated);
        if (rotated.z > -0.15) visible = true;
        if (!index) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
      }
      if (!visible) return;
      const gradient = ctx.createLinearGradient(0, 0, canvas.clientWidth, canvas.clientHeight);
      gradient.addColorStop(0, "rgba(122,250,255,0.10)");
      gradient.addColorStop(0.5, "rgba(122,250,255,0.58)");
      gradient.addColorStop(1, "rgba(90,133,255,0.20)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = state.viewMode ? 1.6 : 1.35;
      ctx.shadowColor = "rgba(114,239,255,0.35)";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  function drawNodes() {
    hoverHits = [];
    const rendered = state.nodes.map(node => {
      const rotated = rotatePoint(latLonToVec(node.lat, node.lon));
      const point = project(rotated);
      return { node, rotated, x: point.x, y: point.y, z: rotated.z, radius: rotated.z > 0 ? 7.5 : 4.2 };
    }).sort((a, b) => a.z - b.z);

    rendered.forEach(item => {
      const selected = item.node.id === state.selectedId;
      const focused = focusTarget === item.node.id;
      const alpha = item.z > 0 ? 0.96 : 0.26;
      const radius = item.radius + (selected ? 1.8 : 0);
      ctx.globalAlpha = alpha;
      const glow = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, radius * 3.1);
      glow.addColorStop(0, focused ? "rgba(131,255,247,0.45)" : "rgba(110,231,255,0.35)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(item.x, item.y, radius * 3.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = selected ? "rgba(197,255,250,0.98)" : "rgba(145,236,255,0.96)";
      ctx.beginPath(); ctx.arc(item.x, item.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = selected ? "rgba(145,255,239,0.96)" : "rgba(186,245,255,0.55)";
      ctx.lineWidth = selected ? 1.8 : 1;
      ctx.stroke();

      if (item.z > (state.viewMode ? 0.22 : 0.42)) {
        ctx.globalAlpha = Math.min(1, 0.42 + item.z * 0.6);
        ctx.font = `${state.viewMode ? 13 : 12}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = selected ? "rgba(229,255,252,0.98)" : "rgba(208,247,255,0.84)";
        ctx.textAlign = "left";
        ctx.fillText(item.node.name || "NO NAME", item.x + 12, item.y + 3);
      }
      hoverHits.push({ id: item.node.id, x: item.x, y: item.y, r: Math.max(18, radius * 2.4), z: item.z });
    });
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBackground();
    if (focusTarget) {
      const node = getNode(focusTarget);
      if (node) {
        const target = getFocusAngles(node.lat, node.lon);
        state.camera.rotX = lerp(state.camera.rotX, target.rotX, 0.08);
        state.camera.rotY = lerpAngle(state.camera.rotY, target.rotY, 0.08);
        if (Math.abs(state.camera.rotX - target.rotX) < 0.002 && Math.abs(angleDiff(state.camera.rotY, target.rotY)) < 0.002) focusTarget = null;
      }
    }
    drawGlobe();
    drawConnections();
    drawNodes();
    requestAnimationFrame(render);
  }

  function getFocusAngles(lat, lon) {
    const vector = latLonToVec(lat, lon);
    const rotY = -Math.atan2(vector.x, vector.z);
    const rotated = rotateY(vector, rotY);
    return { rotX: Math.atan2(rotated.y, rotated.z), rotY };
  }

  function angleDiff(a, b) {
    return (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  }

  function lerpAngle(a, b, t) {
    return a + angleDiff(a, b) * t;
  }

  function focusNode(id) {
    state.selectedId = id;
    focusTarget = id;
    saveState();
  }

  function renderSelectedInfo() {
    const node = getNode(state.selectedId);
    const disabled = !node;
    focusSelectedButton.disabled = disabled;
    editSelectedButton.disabled = disabled;
    connectSelectedButton.disabled = disabled;
    selectedTitle.textContent = node ? node.name : "NO CHARACTER";
    if (!node) {
      selectedMeta.classList.add("empty");
      selectedMeta.textContent = "地球上の座標をタップすると、ここに詳細が表示されます。";
      return;
    }
    selectedMeta.classList.remove("empty");
    selectedMeta.textContent = [
      `作品名：${node.work || "-"}`,
      `性別：${node.gender || "-"}`,
      `年齢：${node.age || "-"}`,
      `職業：${node.job || "-"}`,
      `島：${continentName(node.continent)}`,
      node.detail ? `\n${node.detail}` : ""
    ].join("\n");
  }

  function uniqueWorks() {
    return Array.from(new Set(state.nodes.map(node => node.work).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja"));
  }

  function fillSelect(select, options, includeAll = true, allLabel = "ALL") {
    const current = select.value;
    select.innerHTML = "";
    if (includeAll) select.appendChild(new Option(allLabel, ""));
    options.forEach(option => select.appendChild(new Option(option.label, option.value)));
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function renderFilters() {
    const works = uniqueWorks().map(work => ({ label: work, value: work }));
    const islands = state.continents.map(item => ({ label: item.name, value: item.id }));
    fillSelect(workFilter, works);
    fillSelect(connectWorkFilter, works);
    fillSelect(continentFilter, islands);
    fillSelect(connectContinentFilter, islands);
    const current = continentInput.value;
    continentInput.innerHTML = "";
    islands.forEach(option => continentInput.appendChild(new Option(option.label, option.value)));
    if (islands.some(option => option.value === current)) continentInput.value = current;
  }

  function filteredNodes(forConnect = false) {
    const query = (forConnect ? connectSearchInput.value : searchInput.value).trim().toLowerCase();
    const work = forConnect ? connectWorkFilter.value : workFilter.value;
    const continent = forConnect ? connectContinentFilter.value : continentFilter.value;
    return state.nodes.filter(node => {
      if (forConnect && node.id === state.selectedId) return false;
      if (query && !`${node.name} ${node.work}`.toLowerCase().includes(query)) return false;
      if (work && node.work !== work) return false;
      if (continent && node.continent !== continent) return false;
      return true;
    });
  }

  function renderSearchResults() {
    const nodes = filteredNodes(false);
    resultList.innerHTML = "";
    resultCount.textContent = `${nodes.length} RESULTS`;
    nodes.forEach(node => {
      const button = document.createElement("button");
      button.className = `result-item${node.id === state.selectedId ? " active" : ""}`;
      button.innerHTML = `<div class="name">${escapeHtml(node.name || "NO NAME")}</div><div class="meta">${escapeHtml(node.work || "-")} ｜ ${escapeHtml(continentName(node.continent))}</div>`;
      button.addEventListener("click", () => { focusNode(node.id); showToast(`「${node.name}」にフォーカス`); });
      resultList.appendChild(button);
    });
  }

  function renderConnectList() {
    const nodes = filteredNodes(true);
    connectList.innerHTML = "";
    const selected = state.selectedId;
    const links = new Set(state.links.map(link => sortLink(...link).join("|")));
    nodes.forEach(node => {
      const key = sortLink(selected, node.id).join("|");
      const linked = links.has(key);
      const button = document.createElement("button");
      button.className = "connect-item";
      button.innerHTML = `<div class="name">${escapeHtml(node.name)}</div><div class="meta">${escapeHtml(node.work || "-")} ｜ ${escapeHtml(continentName(node.continent))} ｜ ${linked ? "CONNECTED" : "NOT CONNECTED"}</div>`;
      button.addEventListener("click", () => {
        toggleLink(selected, node.id);
        renderConnectList();
        showToast(linked ? "接続を解除しました" : "接続しました");
      });
      connectList.appendChild(button);
    });
  }

  function sortLink(a, b) { return [a, b].sort(); }

  function toggleLink(a, b) {
    if (!a || !b || a === b) return;
    const key = sortLink(a, b).join("|");
    const index = state.links.findIndex(link => sortLink(link[0], link[1]).join("|") === key);
    if (index >= 0) state.links.splice(index, 1); else state.links.push([a, b]);
    saveState();
  }

  function nearestContinent(lat, lon) {
    const target = latLonToVec(lat, lon);
    let best = state.continents[0];
    let bestScore = -Infinity;
    state.continents.forEach(continent => {
      const center = continentCenter(continent);
      const vector = latLonToVec(center.lat, center.lon);
      const score = target.x * vector.x + target.y * vector.y + target.z * vector.z;
      if (score > bestScore) { bestScore = score; best = continent; }
    });
    return best?.id || state.continents[0]?.id || "";
  }

  function openEditor(id = null, spawnPosition = null) {
    editingId = id;
    pendingSpawnPosition = spawnPosition;
    const node = id ? getNode(id) : null;
    editorTitle.textContent = node ? "EDIT CHARACTER" : "NEW CHARACTER";
    nameInput.value = node?.name || "";
    workInput.value = node?.work || "";
    genderInput.value = node?.gender || "";
    ageInput.value = node?.age || "";
    jobInput.value = node?.job || "";
    detailInput.value = node?.detail || "";
    const suggested = spawnPosition ? nearestContinent(spawnPosition.lat, spawnPosition.lon) : state.continents[0]?.id;
    continentInput.value = node?.continent || suggested || "";
    deleteNodeButton.style.display = node ? "" : "none";
    setModal(editorModal, true);
  }

  function saveNode() {
    const base = editingId ? getNode(editingId) : null;
    const form = {
      name: nameInput.value.trim() || "NO NAME",
      work: workInput.value.trim(),
      gender: genderInput.value.trim(),
      age: ageInput.value.trim(),
      job: jobInput.value.trim(),
      detail: detailInput.value.trim(),
      continent: continentInput.value || state.continents[0]?.id || ""
    };
    if (base) {
      Object.assign(base, form);
      state.selectedId = base.id;
    } else {
      const position = pendingSpawnPosition || getSpawnPosition(form.continent);
      const node = { id: uid(), ...form, lat: position.lat, lon: position.lon };
      state.nodes.push(node);
      state.selectedId = node.id;
      focusTarget = node.id;
    }
    pendingSpawnPosition = null;
    saveState();
    setModal(editorModal, false);
    showToast("保存しました");
  }

  function getSpawnPosition(continentId) {
    const continent = getContinent(continentId) || state.continents[0];
    const center = continent ? continentCenter(continent) : { lat: 0, lon: 0 };
    return { lat: clamp(center.lat + Math.random() * 8 - 4, -82, 82), lon: wrapLon(center.lon + Math.random() * 10 - 5) };
  }

  function deleteNode() {
    if (!editingId) return;
    const id = editingId;
    state.nodes = state.nodes.filter(node => node.id !== id);
    state.links = state.links.filter(link => !link.includes(id));
    if (state.selectedId === id) state.selectedId = state.nodes[0]?.id || null;
    saveState();
    setModal(editorModal, false);
    showToast("削除しました");
  }

  function openConnectModal() {
    if (!state.selectedId) return;
    connectSearchInput.value = "";
    connectWorkFilter.value = "";
    connectContinentFilter.value = "";
    renderConnectList();
    setModal(connectModal, true);
  }

  function renderContinentSettings() {
    continentNameList.innerHTML = "";
    state.continents.forEach(continent => {
      const row = document.createElement("div");
      row.className = "island-name-row";
      row.innerHTML = `<label class="field"><span>${escapeHtml(continent.id.toUpperCase())}</span><input type="text" data-continent-id="${escapeHtml(continent.id)}" maxlength="40" value="${escapeHtml(continent.name)}" /></label><div class="size-badge">${SIZE_LABEL[continent.size] || "中"}</div>`;
      continentNameList.appendChild(row);
    });
  }

  function saveSettings() {
    continentNameList.querySelectorAll("input[data-continent-id]").forEach(input => {
      const continent = getContinent(input.dataset.continentId);
      if (continent) continent.name = input.value.trim() || continent.name;
    });
    saveState();
    renderContinentSettings();
    setModal(settingsModal, false);
    showToast("設定を保存しました");
  }

  function addIsland() {
    const size = SIZE_RADIUS[newIslandSizeInput.value] ? newIslandSizeInput.value : "medium";
    const name = newIslandNameInput.value.trim() || `ISLAND ${state.continents.length + 1}`;
    const center = chooseIslandCenter();
    const continent = {
      id: uid("is"),
      name,
      size,
      custom: true,
      points: generateIslandPoints(center.lat, center.lon, size)
    };
    state.continents.push(continent);
    newIslandNameInput.value = "";
    saveState();
    renderContinentSettings();
    focusCoordinate(center.lat, center.lon);
    showToast(`${name} を追加しました`);
  }

  function continentCenter(continent) {
    const vectors = continent.points.map(([lat, lon]) => latLonToVec(lat, lon));
    const sum = vectors.reduce((acc, vector) => ({ x: acc.x + vector.x, y: acc.y + vector.y, z: acc.z + vector.z }), { x: 0, y: 0, z: 0 });
    return vecToLatLon(sum);
  }

  function chooseIslandCenter() {
    const existing = state.continents.map(continentCenter).map(item => latLonToVec(item.lat, item.lon));
    let best = { lat: 0, lon: 110, score: -Infinity };
    for (let index = 0; index < 80; index++) {
      const lat = -55 + Math.random() * 110;
      const lon = -140 + Math.random() * 280;
      const vector = latLonToVec(lat, lon);
      const nearest = existing.length ? Math.min(...existing.map(other => Math.acos(clamp(vector.x * other.x + vector.y * other.y + vector.z * other.z, -1, 1)))) : Math.PI;
      if (nearest > best.score) best = { lat, lon, score: nearest };
    }
    return { lat: best.lat, lon: best.lon };
  }

  function generateIslandPoints(centerLat, centerLon, size) {
    const radius = SIZE_RADIUS[size];
    const count = size === "small" ? 7 : size === "large" ? 11 : 9;
    const points = [];
    for (let index = 0; index < count; index++) {
      const angle = (Math.PI * 2 * index / count) + (Math.random() - 0.5) * 0.22;
      const irregular = radius * (0.72 + Math.random() * 0.45);
      const lat = clamp(centerLat + Math.sin(angle) * irregular, -78, 78);
      const lonScale = Math.max(0.35, Math.cos(centerLat * Math.PI / 180));
      const lon = wrapLon(centerLon + Math.cos(angle) * irregular / lonScale);
      points.push([lat, lon]);
    }
    return points;
  }

  function focusCoordinate(lat, lon) {
    const target = getFocusAngles(lat, lon);
    focusTarget = null;
    const startX = state.camera.rotX;
    const startY = state.camera.rotY;
    const started = performance.now();
    const duration = 560;
    function step(now) {
      const t = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      state.camera.rotX = lerp(startX, target.rotX, eased);
      state.camera.rotY = startY + angleDiff(startY, target.rotY) * eased;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cross_backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = migrateState(JSON.parse(reader.result));
        focusTarget = state.selectedId;
        saveState();
        renderContinentSettings();
        updateModeButtons();
        showToast("読み込みました");
      } catch (error) {
        console.error(error);
        showToast("JSONの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
  }

  function hitTest(x, y) {
    const hits = hoverHits.map(hit => ({ ...hit, distance: Math.hypot(hit.x - x, hit.y - y) }))
      .filter(hit => hit.distance <= hit.r)
      .sort((a, b) => b.z - a.z || a.distance - b.distance);
    return hits[0]?.id || null;
  }

  function screenPointToSphere(x, y) {
    const { cx, cy, radius } = getGlobeMetrics();
    const nx = (x - cx) / radius;
    const ny = (y - cy) / radius;
    const d2 = nx * nx + ny * ny;
    if (d2 > 1) return null;
    const rotated = { x: nx, y: ny, z: Math.sqrt(1 - d2) };
    return vecToLatLon(inverseRotatePoint(rotated));
  }

  function updateModeButtons() {
    appShell.classList.toggle("view-mode", state.viewMode);
  }

  function enterViewMode() {
    state.viewMode = true;
    state.camera.viewZoom = clamp(Number(state.camera.viewZoom) || 1.08, 0.58, 2.85);
    updateModeButtons();
    showToast("VIEW：長押しで移動 / 空き地表長押しで追加");
  }

  function exitViewMode() {
    clearLongPress();
    state.viewMode = false;
    activeNodeId = null;
    updateModeButtons();
    persistState();
  }

  function clearLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressCandidate = null;
    longPressHint.classList.remove("show");
  }

  function beginLongPress(event, candidate) {
    clearLongPress();
    longPressCandidate = candidate;
    longPressHint.textContent = candidate.type === "move" ? "HOLD TO MOVE" : "HOLD TO ADD";
    longPressHint.style.left = `${event.clientX}px`;
    longPressHint.style.top = `${event.clientY - 36}px`;
    longPressHint.classList.add("show");
    longPressTimer = setTimeout(() => {
      if (!longPressCandidate || moved || !state.viewMode) return;
      const confirmed = longPressCandidate;
      longPressTriggered = true;
      clearLongPress();
      if (confirmed.type === "move") {
        const node = getNode(confirmed.nodeId);
        if (!node) return;
        activeNodeId = node.id;
        state.selectedId = node.id;
        focusTarget = null;
        renderSelectedInfo();
        renderSearchResults();
        showToast("そのままドラッグして移動");
      } else {
        dragging = false;
        openEditor(null, { ...confirmed.coordinate });
      }
      if (navigator.vibrate) navigator.vibrate(18);
    }, LONG_PRESS_MS);
  }

  addNodeButton.addEventListener("click", () => openEditor());
  settingsButton.addEventListener("click", () => { renderContinentSettings(); setModal(settingsModal, true); });
  viewModeButton.addEventListener("click", enterViewMode);
  exitViewButton.addEventListener("click", exitViewMode);
  saveNodeButton.addEventListener("click", saveNode);
  deleteNodeButton.addEventListener("click", deleteNode);
  focusSelectedButton.addEventListener("click", () => state.selectedId && (focusTarget = state.selectedId));
  editSelectedButton.addEventListener("click", () => state.selectedId && openEditor(state.selectedId));
  connectSelectedButton.addEventListener("click", openConnectModal);
  saveSettingsButton.addEventListener("click", saveSettings);
  addIslandButton.addEventListener("click", addIsland);
  helpButton.addEventListener("click", () => setModal(helpModal, true));
  exportButton.addEventListener("click", exportJson);
  importInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) importJson(file);
    event.target.value = "";
  });

  [searchInput, workFilter, continentFilter].forEach(element => element.addEventListener("input", renderSearchResults));
  [connectSearchInput, connectWorkFilter, connectContinentFilter].forEach(element => element.addEventListener("input", renderConnectList));

  canvas.addEventListener("contextmenu", event => event.preventDefault());

  canvas.addEventListener("pointerdown", event => {
    if (![editorModal, connectModal, settingsModal, helpModal].every(modal => modal.classList.contains("hidden"))) return;
    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    dragging = true;
    moved = false;
    longPressTriggered = false;
    activeNodeId = null;
    pointerStart = { x: event.clientX, y: event.clientY };
    pointerLast = { ...pointerStart };
    const hit = hitTest(event.clientX, event.clientY);
    const coordinate = screenPointToSphere(event.clientX, event.clientY);
    if (state.viewMode) {
      if (hit) beginLongPress(event, { type: "move", nodeId: hit });
      else if (coordinate) beginLongPress(event, { type: "add", coordinate });
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!dragging || event.pointerId !== activePointerId) return;
    const totalDx = event.clientX - pointerStart.x;
    const totalDy = event.clientY - pointerStart.y;
    if (!moved && Math.hypot(totalDx, totalDy) > MOVE_THRESHOLD) {
      moved = true;
      if (!longPressTriggered) clearLongPress();
    }
    if (!moved) return;

    const dx = event.clientX - pointerLast.x;
    const dy = event.clientY - pointerLast.y;
    pointerLast = { x: event.clientX, y: event.clientY };

    if (state.viewMode && longPressTriggered && activeNodeId) {
      const coordinate = screenPointToSphere(event.clientX, event.clientY);
      const node = getNode(activeNodeId);
      if (coordinate && node) {
        node.lat = coordinate.lat;
        node.lon = coordinate.lon;
        state.selectedId = node.id;
        focusTarget = null;
      }
    } else {
      state.camera.rotY += dx * 0.0066;
      state.camera.rotX -= dy * 0.0066;
      state.camera.rotX = clamp(state.camera.rotX, -1.2, 1.2);
      focusTarget = null;
    }
  });

  canvas.addEventListener("pointerup", event => {
    if (event.pointerId !== activePointerId) return;
    clearLongPress();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!longPressTriggered && !moved) {
      const hit = hitTest(event.clientX, event.clientY);
      if (hit) {
        state.selectedId = hit;
        focusTarget = hit;
        saveState();
      }
    } else if (moved || longPressTriggered) {
      persistState();
    }
    dragging = false;
    activePointerId = null;
    activeNodeId = null;
    longPressTriggered = false;
  });

  canvas.addEventListener("pointercancel", event => {
    clearLongPress();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    dragging = false;
    activePointerId = null;
    activeNodeId = null;
    longPressTriggered = false;
  });

  function zoomConfig() {
    return state.viewMode
      ? { key: "viewZoom", min: 0.58, max: 2.85, step: 0.085 }
      : { key: "zoom", min: 0.74, max: 1.64, step: 0.06 };
  }

  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const config = zoomConfig();
    state.camera[config.key] = clamp(state.camera[config.key] - Math.sign(event.deltaY) * config.step, config.min, config.max);
    persistState();
  }, { passive: false });

  canvas.addEventListener("touchstart", event => {
    if (event.touches.length === 2) pinchDistance = distance(event.touches[0], event.touches[1]);
  }, { passive: true });

  canvas.addEventListener("touchmove", event => {
    if (event.touches.length === 2 && pinchDistance) {
      const current = distance(event.touches[0], event.touches[1]);
      const config = zoomConfig();
      state.camera[config.key] = clamp(state.camera[config.key] + (current - pinchDistance) * 0.0025, config.min, config.max);
      pinchDistance = current;
    }
  }, { passive: true });

  canvas.addEventListener("touchend", () => { pinchDistance = null; persistState(); });

  function distance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  renderFilters();
  renderSelectedInfo();
  renderSearchResults();
  renderContinentSettings();
  updateModeButtons();
  requestAnimationFrame(render);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js?v=11");
})();
