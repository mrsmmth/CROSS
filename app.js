
(() => {
  const STORAGE_KEY = "cross-globe-v1";
  const DEFAULT_CONTINENTS = {
    av: "AVEL",
    nr: "NORIA",
    vc: "VELCA",
    sr: "SERA",
    or: "ORNE"
  };

  const CONTINENT_SHAPES = {
    av: [[-20, -12], [-6, -22], [12, -18], [26, -6], [18, 12], [0, 18], [-16, 10], [-24, -2]],
    nr: [[-58, -56], [-36, -60], [-20, -48], [-28, -34], [-50, -36], [-62, -46]],
    vc: [[34, -16], [56, -20], [68, -8], [64, 10], [44, 16], [28, 2]],
    sr: [[-8, 28], [18, 24], [36, 34], [28, 52], [8, 60], [-12, 50], [-16, 36]],
    or: [[-62, 2], [-42, -8], [-36, 10], [-46, 28], [-64, 20]]
  };

  const SAMPLE_DATA = {
    version: 1,
    continentNames: { ...DEFAULT_CONTINENTS },
    nodes: [
      { id: uid(), name: "新島晴人", work: "君は写りたがらない", gender: "男性", age: "28", job: "会社員", detail: "主人公。膵臓がん。", continent: "av", lat: 2, lon: -8 },
      { id: uid(), name: "北原菜摘", work: "君は写りたがらない", gender: "女性", age: "28", job: "会社員", detail: "妊娠初期。", continent: "av", lat: 14, lon: 22 },
      { id: uid(), name: "松木蓮太郎", work: "まっすぐを見た日", gender: "男性", age: "28", job: "芸人", detail: "盲目の主人公。", continent: "nr", lat: -38, lon: -46 },
      { id: uid(), name: "夜行", work: "POPLAB", gender: "-", age: "-", job: "記録者", detail: "POPLABの記録者。", continent: "vc", lat: -4, lon: 58 }
    ],
    links: [],
    camera: { rotX: -0.2, rotY: 0.58, zoom: 1 },
    moveMode: false,
    selectedId: null
  };

  function uid() {
    return "id-" + Math.random().toString(36).slice(2, 11);
  }

  const canvas = document.getElementById("globeCanvas");
  const ctx = canvas.getContext("2d");
  const addNodeButton = document.getElementById("addNodeButton");
  const moveModeButton = document.getElementById("moveModeButton");
  const settingsButton = document.getElementById("settingsButton");
  const searchInput = document.getElementById("searchInput");
  const workFilter = document.getElementById("workFilter");
  const continentFilter = document.getElementById("continentFilter");
  const resultList = document.getElementById("resultList");
  const resultCount = document.getElementById("resultCount");
  const selectedTitle = document.getElementById("selectedTitle");
  const selectedMeta = document.getElementById("selectedMeta");
  const focusSelectedButton = document.getElementById("focusSelectedButton");
  const editSelectedButton = document.getElementById("editSelectedButton");
  const connectSelectedButton = document.getElementById("connectSelectedButton");
  const toast = document.getElementById("toast");

  const editorModal = document.getElementById("editorModal");
  const editorTitle = document.getElementById("editorTitle");
  const nameInput = document.getElementById("nameInput");
  const workInput = document.getElementById("workInput");
  const genderInput = document.getElementById("genderInput");
  const ageInput = document.getElementById("ageInput");
  const jobInput = document.getElementById("jobInput");
  const continentInput = document.getElementById("continentInput");
  const detailInput = document.getElementById("detailInput");
  const saveNodeButton = document.getElementById("saveNodeButton");
  const deleteNodeButton = document.getElementById("deleteNodeButton");

  const connectModal = document.getElementById("connectModal");
  const connectSearchInput = document.getElementById("connectSearchInput");
  const connectWorkFilter = document.getElementById("connectWorkFilter");
  const connectContinentFilter = document.getElementById("connectContinentFilter");
  const connectList = document.getElementById("connectList");

  const settingsModal = document.getElementById("settingsModal");
  const continentNameList = document.getElementById("continentNameList");
  const saveSettingsButton = document.getElementById("saveSettingsButton");
  const exportButton = document.getElementById("exportButton");
  const importInput = document.getElementById("importInput");

  let state = loadState();
  let editingId = null;
  let dragging = false;
  let moved = false;
  let pointerStart = null;
  let activePointerId = null;
  let activeNodeId = null;
  let pinchDistance = null;
  let focusTarget = null;
  let hoverHits = [];
  let toastTimer = null;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.nodes && parsed.continentNames) {
          parsed.continentNames = { ...DEFAULT_CONTINENTS, ...parsed.continentNames };
          parsed.moveMode = false;
          return parsed;
        }
      }
    } catch (_) {}
    const sample = structuredClone(SAMPLE_DATA);
    sample.links = [[sample.nodes[0].id, sample.nodes[1].id], [sample.nodes[2].id, sample.nodes[3].id]];
    sample.selectedId = sample.nodes[0].id;
    return sample;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderFilters();
    renderSelectedInfo();
    renderSearchResults();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  function setModal(modal, open) {
    modal.classList.toggle("hidden", !open);
  }

  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => setModal(document.getElementById(button.dataset.close), false));
  });

  function getNode(id) {
    return state.nodes.find(node => node.id === id) || null;
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
    return {
      lat: Math.asin(n.y) * 180 / Math.PI,
      lon: Math.atan2(n.x, n.z) * 180 / Math.PI
    };
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
    const rx = rotateX(v, -state.camera.rotX);
    return rotateY(rx, -state.camera.rotY);
  }

  function normalize(v) {
    const m = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / m, y: v.y / m, z: v.z / m };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function getGlobeMetrics() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const panelOffset = window.innerWidth > 820 ? 0 : 0;
    const cx = width / 2;
    const cy = height / 2 + (window.innerWidth > 820 ? 26 : 40);
    const radius = Math.min(width, height) * 0.24 * state.camera.zoom;
    return { width, height, cx, cy, radius };
  }

  function project(v) {
    const { cx, cy, radius } = getGlobeMetrics();
    return { x: cx + v.x * radius, y: cy + v.y * radius, z: v.z, radius };
  }

  function pathForContinent(points) {
    const rotated = points.map(([lat, lon]) => rotatePoint(latLonToVec(lat, lon)));
    const frontCount = rotated.filter(p => p.z > -0.08).length;
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
    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
  }

  function drawGlobe() {
    const { cx, cy, radius } = getGlobeMetrics();

    const outerGlow = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius * 1.45);
    outerGlow.addColorStop(0, 'rgba(82,220,255,0.05)');
    outerGlow.addColorStop(0.65, 'rgba(74,168,255,0.03)');
    outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.48, 0, Math.PI * 2); ctx.fill();

    const sphere = ctx.createRadialGradient(cx - radius * 0.26, cy - radius * 0.35, radius * 0.05, cx, cy, radius);
    sphere.addColorStop(0, 'rgba(34,126,160,0.23)');
    sphere.addColorStop(0.42, 'rgba(10,44,74,0.44)');
    sphere.addColorStop(1, 'rgba(5,17,29,0.85)');
    ctx.fillStyle = sphere;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();

    drawGridLines(cx, cy, radius);
    drawContinents();

    ctx.restore();

    ctx.strokeStyle = 'rgba(117,234,255,0.34)';
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.92, 0, Math.PI * 2); ctx.stroke();
  }

  function drawGridLines(cx, cy, radius) {
    ctx.strokeStyle = 'rgba(112,231,255,0.12)';
    ctx.lineWidth = 1;
    const latLines = [-60, -30, 0, 30, 60];
    const lonLines = [-120, -60, 0, 60, 120];

    for (const lat of latLines) {
      ctx.beginPath();
      let first = true;
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = project(rotatePoint(latLonToVec(lat, lon)));
        if (first) { ctx.moveTo(p.x, p.y); first = false; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    for (const lon of lonLines) {
      ctx.beginPath();
      let first = true;
      for (let lat = -89; lat <= 89; lat += 3) {
        const p = project(rotatePoint(latLonToVec(lat, lon)));
        if (first) { ctx.moveTo(p.x, p.y); first = false; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  function drawContinents() {
    Object.entries(CONTINENT_SHAPES).forEach(([id, shape]) => {
      const path = pathForContinent(shape);
      if (!path) return;
      ctx.beginPath();
      path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = 'rgba(89, 248, 255, 0.10)';
      ctx.strokeStyle = 'rgba(111, 240, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      const center = path.reduce((acc, p) => ({ x: acc.x + p.x / path.length, y: acc.y + p.y / path.length }), { x: 0, y: 0 });
      ctx.fillStyle = 'rgba(205,248,255,0.45)';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.continentNames[id] || id, center.x, center.y);
    });
  }

  function slerp(a, b, t) {
    const na = normalize(a), nb = normalize(b);
    let dot = na.x * nb.x + na.y * nb.y + na.z * nb.z;
    dot = Math.max(-1, Math.min(1, dot));
    const theta = Math.acos(dot) * t;
    const rel = normalize({ x: nb.x - na.x * dot, y: nb.y - na.y * dot, z: nb.z - na.z * dot });
    return {
      x: na.x * Math.cos(theta) + rel.x * Math.sin(theta),
      y: na.y * Math.cos(theta) + rel.y * Math.sin(theta),
      z: na.z * Math.cos(theta) + rel.z * Math.sin(theta)
    };
  }

  function drawConnections() {
    state.links.forEach(([aId, bId]) => {
      const a = getNode(aId); const b = getNode(bId);
      if (!a || !b) return;
      const va = latLonToVec(a.lat, a.lon);
      const vb = latLonToVec(b.lat, b.lon);
      ctx.beginPath();
      let visible = false;
      for (let i = 0; i <= 42; i++) {
        const t = i / 42;
        const base = slerp(va, vb, t);
        const lift = 1 + Math.sin(Math.PI * t) * 0.18;
        const p = rotatePoint({ x: base.x * lift, y: base.y * lift, z: base.z * lift });
        const pr = project(p);
        if (p.z > -0.12) visible = true;
        if (i === 0) ctx.moveTo(pr.x, pr.y);
        else ctx.lineTo(pr.x, pr.y);
      }
      if (!visible) return;
      const gradient = ctx.createLinearGradient(0, 0, canvas.clientWidth, canvas.clientHeight);
      gradient.addColorStop(0, 'rgba(122,250,255,0.10)');
      gradient.addColorStop(.5, 'rgba(122,250,255,0.55)');
      gradient.addColorStop(1, 'rgba(90,133,255,0.20)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.35;
      ctx.shadowColor = 'rgba(114,239,255,0.35)';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  function drawNodes() {
    hoverHits = [];
    const rendered = state.nodes.map(node => {
      const rotated = rotatePoint(latLonToVec(node.lat, node.lon));
      const p = project(rotated);
      return { node, rotated, x: p.x, y: p.y, z: rotated.z, screenRadius: rotated.z > 0 ? 7.5 : 4.2 };
    }).sort((a, b) => a.z - b.z);

    rendered.forEach(item => {
      const selected = item.node.id === state.selectedId;
      const focused = focusTarget === item.node.id;
      const alpha = item.z > 0 ? 0.96 : 0.26;
      const r = item.screenRadius + (selected ? 1.8 : 0);
      ctx.globalAlpha = alpha;

      const glow = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, r * 3.1);
      glow.addColorStop(0, focused ? 'rgba(131,255,247,0.45)' : 'rgba(110,231,255,0.35)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(item.x, item.y, r * 3.1, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = selected ? 'rgba(197,255,250,0.98)' : 'rgba(145,236,255,0.96)';
      ctx.beginPath(); ctx.arc(item.x, item.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = selected ? 'rgba(145,255,239,0.96)' : 'rgba(186,245,255,0.55)';
      ctx.lineWidth = selected ? 1.8 : 1;
      ctx.stroke();

      if (item.z > 0.42) {
        ctx.globalAlpha = Math.min(1, 0.42 + item.z * 0.6);
        ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = selected ? 'rgba(229,255,252,0.98)' : 'rgba(208,247,255,0.84)';
        ctx.textAlign = 'left';
        ctx.fillText(item.node.name || 'NO NAME', item.x + 12, item.y + 3);
      }

      hoverHits.push({ id: item.node.id, x: item.x, y: item.y, r: Math.max(18, r * 2.4), z: item.z });
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
      }
    }

    drawGlobe();
    drawConnections();
    drawNodes();
    requestAnimationFrame(render);
  }

  function getFocusAngles(lat, lon) {
    const v = latLonToVec(lat, lon);
    const rotY = -Math.atan2(v.x, v.z);
    const v1 = rotateY(v, rotY);
    const rotX = Math.atan2(v1.y, v1.z);
    return { rotX, rotY };
  }

  function lerpAngle(a, b, t) {
    let diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
    return a + diff * t;
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
    selectedTitle.textContent = node ? node.name : 'NO CHARACTER';
    if (!node) {
      selectedMeta.classList.add('empty');
      selectedMeta.textContent = '地球上の座標をタップすると、ここに詳細が表示されます。';
      return;
    }
    selectedMeta.classList.remove('empty');
    selectedMeta.textContent = [
      `作品名：${node.work || '-'}`,
      `性別：${node.gender || '-'}`,
      `年齢：${node.age || '-'}`,
      `職業：${node.job || '-'}`,
      `大陸：${state.continentNames[node.continent] || node.continent}`,
      node.detail ? `\n${node.detail}` : ''
    ].join('\n');
  }

  function uniqueWorks() {
    return Array.from(new Set(state.nodes.map(node => node.work).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  function fillSelect(select, options, includeAll = true, allLabel = 'ALL') {
    const current = select.value;
    select.innerHTML = '';
    if (includeAll) select.appendChild(new Option(allLabel, ''));
    options.forEach(opt => select.appendChild(new Option(opt.label, opt.value)));
    select.value = options.some(opt => opt.value === current) || (includeAll && current === '') ? current : '';
  }

  function renderFilters() {
    fillSelect(workFilter, uniqueWorks().map(work => ({ label: work, value: work })));
    fillSelect(connectWorkFilter, uniqueWorks().map(work => ({ label: work, value: work })));
    const continentOptions = Object.entries(state.continentNames).map(([value, label]) => ({ value, label }));
    fillSelect(continentFilter, continentOptions);
    fillSelect(connectContinentFilter, continentOptions);
    continentInput.innerHTML = '';
    continentOptions.forEach(opt => continentInput.appendChild(new Option(opt.label, opt.value)));
  }

  function filteredNodes(forConnect = false) {
    const query = (forConnect ? connectSearchInput.value : searchInput.value).trim().toLowerCase();
    const work = forConnect ? connectWorkFilter.value : workFilter.value;
    const continent = forConnect ? connectContinentFilter.value : continentFilter.value;
    return state.nodes.filter(node => {
      if (forConnect && node.id === state.selectedId) return false;
      const text = `${node.name} ${node.work}`.toLowerCase();
      if (query && !text.includes(query)) return false;
      if (work && node.work !== work) return false;
      if (continent && node.continent !== continent) return false;
      return true;
    });
  }

  function renderSearchResults() {
    const nodes = filteredNodes(false);
    resultList.innerHTML = '';
    resultCount.textContent = `${nodes.length} RESULTS`;
    nodes.forEach(node => {
      const button = document.createElement('button');
      button.className = 'result-item' + (node.id === state.selectedId ? ' active' : '');
      button.innerHTML = `<div class="name">${escapeHtml(node.name || 'NO NAME')}</div><div class="meta">${escapeHtml(node.work || '-')} ｜ ${escapeHtml(state.continentNames[node.continent] || node.continent)}</div>`;
      button.addEventListener('click', () => {
        focusNode(node.id);
        showToast(`「${node.name}」にフォーカス`);
      });
      resultList.appendChild(button);
    });
  }

  function renderConnectList() {
    const nodes = filteredNodes(true);
    connectList.innerHTML = '';
    const selected = state.selectedId;
    const links = new Set(state.links.map(link => sortLink(...link).join('|')));
    nodes.forEach(node => {
      const key = sortLink(selected, node.id).join('|');
      const linked = links.has(key);
      const button = document.createElement('button');
      button.className = 'connect-item';
      button.innerHTML = `<div class="name">${escapeHtml(node.name)}</div><div class="meta">${escapeHtml(node.work || '-')} ｜ ${escapeHtml(state.continentNames[node.continent] || node.continent)} ｜ ${linked ? 'CONNECTED' : 'NOT CONNECTED'}</div>`;
      button.addEventListener('click', () => {
        toggleLink(selected, node.id);
        renderConnectList();
        showToast(linked ? '接続を解除しました' : '接続しました');
      });
      connectList.appendChild(button);
    });
  }

  function sortLink(a, b) {
    return [a, b].sort();
  }

  function toggleLink(a, b) {
    if (!a || !b || a === b) return;
    const key = sortLink(a, b).join('|');
    const index = state.links.findIndex(link => sortLink(link[0], link[1]).join('|') === key);
    if (index >= 0) state.links.splice(index, 1);
    else state.links.push([a, b]);
    saveState();
  }

  function openEditor(id = null) {
    editingId = id;
    const node = id ? getNode(id) : null;
    editorTitle.textContent = node ? 'EDIT CHARACTER' : 'NEW CHARACTER';
    nameInput.value = node?.name || '';
    workInput.value = node?.work || '';
    genderInput.value = node?.gender || '';
    ageInput.value = node?.age || '';
    jobInput.value = node?.job || '';
    detailInput.value = node?.detail || '';
    continentInput.value = node?.continent || Object.keys(state.continentNames)[0];
    deleteNodeButton.style.display = node ? '' : 'none';
    setModal(editorModal, true);
  }

  function saveNode() {
    const base = editingId ? getNode(editingId) : null;
    const form = {
      name: nameInput.value.trim() || 'NO NAME',
      work: workInput.value.trim(),
      gender: genderInput.value.trim(),
      age: ageInput.value.trim(),
      job: jobInput.value.trim(),
      detail: detailInput.value.trim(),
      continent: continentInput.value || Object.keys(state.continentNames)[0]
    };

    if (base) {
      Object.assign(base, form);
      state.selectedId = base.id;
    } else {
      const position = getSpawnPosition(form.continent);
      const node = { id: uid(), ...form, lat: position.lat, lon: position.lon };
      state.nodes.push(node);
      state.selectedId = node.id;
      focusTarget = node.id;
    }
    saveState();
    setModal(editorModal, false);
    showToast('保存しました');
  }

  function getSpawnPosition(continent) {
    const base = CONTINENT_SHAPES[continent] || CONTINENT_SHAPES.av;
    const center = base.reduce((acc, [lat, lon]) => ({ lat: acc.lat + lat / base.length, lon: acc.lon + lon / base.length }), { lat: 0, lon: 0 });
    return { lat: center.lat + Math.random() * 8 - 4, lon: center.lon + Math.random() * 10 - 5 };
  }

  function deleteNode() {
    if (!editingId) return;
    const id = editingId;
    state.nodes = state.nodes.filter(node => node.id !== id);
    state.links = state.links.filter(link => !link.includes(id));
    if (state.selectedId === id) state.selectedId = state.nodes[0]?.id || null;
    saveState();
    setModal(editorModal, false);
    showToast('削除しました');
  }

  function openConnectModal() {
    if (!state.selectedId) return;
    connectSearchInput.value = '';
    connectWorkFilter.value = '';
    connectContinentFilter.value = '';
    renderConnectList();
    setModal(connectModal, true);
  }

  function renderContinentSettings() {
    continentNameList.innerHTML = '';
    Object.entries(state.continentNames).forEach(([key, value]) => {
      const label = document.createElement('label');
      label.className = 'field';
      label.innerHTML = `<span>${key.toUpperCase()}</span><input type="text" data-continent-key="${key}" maxlength="40" value="${escapeHtml(value)}" />`;
      continentNameList.appendChild(label);
    });
  }

  function saveSettings() {
    continentNameList.querySelectorAll('input').forEach(input => {
      state.continentNames[input.dataset.continentKey] = input.value.trim() || DEFAULT_CONTINENTS[input.dataset.continentKey];
    });
    saveState();
    renderContinentSettings();
    setModal(settingsModal, false);
    showToast('設定を保存しました');
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cross_backup.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.nodes || !parsed.continentNames) throw new Error('invalid');
        state = parsed;
        state.continentNames = { ...DEFAULT_CONTINENTS, ...state.continentNames };
        state.moveMode = false;
        focusTarget = state.selectedId;
        saveState();
        renderContinentSettings();
        showToast('読み込みました');
      } catch (_) {
        showToast('JSONの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
  }

  function hitTest(x, y) {
    const hits = hoverHits
      .map(hit => ({ ...hit, d: Math.hypot(hit.x - x, hit.y - y) }))
      .filter(hit => hit.d <= hit.r)
      .sort((a, b) => b.z - a.z || a.d - b.d);
    return hits[0]?.id || null;
  }

  function screenPointToSphere(x, y) {
    const { cx, cy, radius } = getGlobeMetrics();
    const nx = (x - cx) / radius;
    const ny = (y - cy) / radius;
    const d2 = nx * nx + ny * ny;
    if (d2 > 1) return null;
    const nz = Math.sqrt(1 - d2);
    const rotated = { x: nx, y: ny, z: nz };
    const base = inverseRotatePoint(rotated);
    return vecToLatLon(base);
  }

  function updateMoveMode() {
    moveModeButton.textContent = state.moveMode ? 'MOVE ON' : 'MOVE OFF';
    moveModeButton.classList.toggle('active', state.moveMode);
  }

  addNodeButton.addEventListener('click', () => openEditor());
  settingsButton.addEventListener('click', () => { renderContinentSettings(); setModal(settingsModal, true); });
  moveModeButton.addEventListener('click', () => {
    state.moveMode = !state.moveMode;
    activeNodeId = null;
    updateMoveMode();
    saveState();
    showToast(state.moveMode ? '移動モードをONにしました' : '移動モードをOFFにしました');
  });
  saveNodeButton.addEventListener('click', saveNode);
  deleteNodeButton.addEventListener('click', deleteNode);
  focusSelectedButton.addEventListener('click', () => state.selectedId && (focusTarget = state.selectedId));
  editSelectedButton.addEventListener('click', () => state.selectedId && openEditor(state.selectedId));
  connectSelectedButton.addEventListener('click', openConnectModal);
  saveSettingsButton.addEventListener('click', saveSettings);
  exportButton.addEventListener('click', exportJson);
  importInput.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) importJson(file);
    event.target.value = '';
  });

  [searchInput, workFilter, continentFilter].forEach(el => el.addEventListener('input', renderSearchResults));
  [connectSearchInput, connectWorkFilter, connectContinentFilter].forEach(el => el.addEventListener('input', renderConnectList));

  canvas.addEventListener('pointerdown', event => {
    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    dragging = true;
    moved = false;
    pointerStart = { x: event.clientX, y: event.clientY };
    if (state.moveMode) {
      activeNodeId = hitTest(event.clientX, event.clientY) || state.selectedId;
    }
  });

  canvas.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== activePointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.hypot(dx, dy) > 4) moved = true;

    if (state.moveMode && activeNodeId) {
      const ll = screenPointToSphere(event.clientX, event.clientY);
      if (ll) {
        const node = getNode(activeNodeId);
        if (node) {
          node.lat = ll.lat;
          node.lon = ll.lon;
          state.selectedId = node.id;
          focusTarget = null;
          renderSelectedInfo();
          renderSearchResults();
        }
      }
    } else {
      state.camera.rotY += dx * 0.0066;
      state.camera.rotX += dy * 0.0066;
      state.camera.rotX = Math.max(-1.2, Math.min(1.2, state.camera.rotX));
      focusTarget = null;
      pointerStart = { x: event.clientX, y: event.clientY };
    }
  });

  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== activePointerId) return;
    canvas.releasePointerCapture(event.pointerId);
    if (!moved) {
      const hit = hitTest(event.clientX, event.clientY);
      if (hit) {
        state.selectedId = hit;
        focusTarget = hit;
        renderSelectedInfo();
        renderSearchResults();
      }
    } else {
      saveState();
    }
    dragging = false;
    activePointerId = null;
    activeNodeId = null;
  });

  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const direction = Math.sign(event.deltaY);
    state.camera.zoom = Math.max(0.74, Math.min(1.64, state.camera.zoom - direction * 0.06));
    saveState();
  }, { passive: false });

  let touchStartDistance = 0;
  canvas.addEventListener('touchstart', event => {
    if (event.touches.length === 2) {
      touchStartDistance = distance(event.touches[0], event.touches[1]);
      pinchDistance = touchStartDistance;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', event => {
    if (event.touches.length === 2 && pinchDistance) {
      const current = distance(event.touches[0], event.touches[1]);
      const delta = current - pinchDistance;
      state.camera.zoom = Math.max(0.74, Math.min(1.64, state.camera.zoom + delta * 0.002));
      pinchDistance = current;
    }
  }, { passive: true });

  canvas.addEventListener('touchend', () => {
    pinchDistance = null;
  });

  function distance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  renderFilters();
  renderSelectedInfo();
  renderSearchResults();
  renderContinentSettings();
  updateMoveMode();
  requestAnimationFrame(render);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js?v=01');
  }
})();
