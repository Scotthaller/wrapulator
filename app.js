// ─── Default Settings ──────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  basicPricePerSqft: 3.50,
  premiumPricePerSqft: 6.00,
  laborPerSqft: 8.00,
  wasteFactor: 1.15,
};

// ─── Vehicle Types ────────────────────────────────────────────────
const VEHICLE_TYPES = [
  { id: 'hatchback',  label: 'Hatchback',      icon: '🚗', mult: 0.92 },
  { id: 'sedan',      label: 'Sedan',           icon: '🚙', mult: 1.05 },
  { id: 'sports',     label: 'Sports Car',      icon: '🏎️',  mult: 0.90 },
  { id: 'coupe',      label: 'Coupe',           icon: '🚘', mult: 0.95 },
  { id: 'suv_small',  label: 'SUV / Crossover', icon: '🚐', mult: 1.35 },
  { id: 'suv_large',  label: 'Full-Size SUV',   icon: '🛻', mult: 1.55 },
  { id: 'pickup',     label: 'Pickup Truck',    icon: '🛻', mult: 1.40 },
  { id: 'minivan',    label: 'Minivan',         icon: '🚌', mult: 1.45 },
  { id: 'van',        label: 'Cargo Van',       icon: '🚐', mult: 1.60 },
];

// ─── Panels ────────────────────────────────────────────────────────
const PANELS = [
  { id: 'hood',         label: 'Hood',               sqft: 28 },
  { id: 'roof',         label: 'Roof',               sqft: 22 },
  { id: 'trunk',        label: 'Trunk / Hatch',      sqft: 17 },
  { id: 'front_bumper', label: 'Front Bumper',        sqft: 16 },
  { id: 'rear_bumper',  label: 'Rear Bumper',         sqft: 14 },
  { id: 'door_fl',      label: 'Front Left Door',    sqft: 16 },
  { id: 'door_fr',      label: 'Front Right Door',   sqft: 16 },
  { id: 'door_rl',      label: 'Rear Left Door',     sqft: 13 },
  { id: 'door_rr',      label: 'Rear Right Door',    sqft: 13 },
  { id: 'fender_fl',    label: 'Front Left Fender',  sqft: 12 },
  { id: 'fender_fr',    label: 'Front Right Fender', sqft: 12 },
  { id: 'quarter_l',    label: 'Left Quarter Panel', sqft: 11 },
  { id: 'quarter_r',    label: 'Right Quarter Panel',sqft: 11 },
  { id: 'mirror_l',     label: 'Left Mirror',        sqft:  3 },
  { id: 'mirror_r',     label: 'Right Mirror',       sqft:  3 },
  { id: 'pillars',      label: 'A/B/C Pillars',      sqft:  8 },
];

// ─── State ─────────────────────────────────────────────────────────
let state = {
  screen: 'estimator',
  estimateMode: 'quick',   // 'quick' | 'detailed'
  year: '',
  make: '',
  model: '',
  vehicleType: '',
  wrapMode: 'full',
  selectedPanels: new Set(),
  vinylType: 'basic',
  makes: [],
  models: [],
  loadingMakes: false,
  loadingModels: false,
};

let settings = loadSettings();

// ─── Persistence ───────────────────────────────────────────────────
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('wrapSettings') || '{}');
    return Object.assign({}, DEFAULT_SETTINGS, s);
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings() {
  localStorage.setItem('wrapSettings', JSON.stringify(settings));
}

// ─── NHTSA API ─────────────────────────────────────────────────────
async function fetchMakes() {
  state.loadingMakes = true;
  renderVehicleSection();
  try {
    const res = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json');
    const data = await res.json();
    state.makes = data.Results
      .map(r => r.MakeName)
      .filter(n => n && n.trim())
      .sort();
  } catch {
    state.makes = [];
  }
  state.loadingMakes = false;
  renderVehicleSection();
}

async function fetchModels(make, year) {
  if (!make || !year) { state.models = []; renderVehicleSection(); return; }
  state.loadingModels = true;
  renderVehicleSection();
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
    const res = await fetch(url);
    const data = await res.json();
    state.models = data.Results
      .map(r => r.Model_Name)
      .filter(n => n && n.trim())
      .sort();
  } catch {
    state.models = [];
  }
  state.loadingModels = false;
  renderVehicleSection();
}

// ─── Calculation ───────────────────────────────────────────────────
function calcSqft() {
  const type = VEHICLE_TYPES.find(t => t.id === state.vehicleType);
  const mult = type ? type.mult : 1.0;
  let baseSqft = 0;
  if (state.wrapMode === 'full') {
    baseSqft = PANELS.reduce((sum, p) => sum + p.sqft, 0);
  } else {
    for (const id of state.selectedPanels) {
      const panel = PANELS.find(p => p.id === id);
      if (panel) baseSqft += panel.sqft;
    }
  }
  const raw = baseSqft * mult;
  const withWaste = raw * settings.wasteFactor;
  return { raw: Math.round(raw), withWaste: Math.ceil(withWaste) };
}

function calcCost(sqft) {
  const vinyl = state.vinylType === 'premium'
    ? settings.premiumPricePerSqft
    : settings.basicPricePerSqft;
  const material = sqft * vinyl;
  const labor = sqft * settings.laborPerSqft;
  return { material, labor, total: material + labor, vinyl };
}

// ─── Formatting ────────────────────────────────────────────────────
function fmt(n) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function showScreen(name) {
  state.screen = name;
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.id === `screen-${name}`);
  });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// ─── Mode Toggle ───────────────────────────────────────────────────
function setEstimateMode(mode) {
  state.estimateMode = mode;
  document.getElementById('mode-quick').classList.toggle('active', mode === 'quick');
  document.getElementById('mode-detailed').classList.toggle('active', mode === 'detailed');
  document.getElementById('quick-section').style.display   = mode === 'quick'    ? '' : 'none';
  document.getElementById('detailed-section').style.display = mode === 'detailed' ? '' : 'none';
  updateCalculateBtn();
}

// ─── Quick Type Grid ───────────────────────────────────────────────
function renderQuickTypeGrid() {
  const grid = document.getElementById('quick-type-grid');
  if (!grid) return;
  grid.innerHTML = VEHICLE_TYPES.map(t => `
    <button class="type-card${state.vehicleType === t.id ? ' active' : ''}"
            onclick="onTypeChange('${t.id}')">
      <span class="type-icon">${t.icon}</span>
      <span class="type-label">${t.label}</span>
    </button>
  `).join('');
}

// ─── Combobox helpers ──────────────────────────────────────────────
function openCombo(field) {
  filterCombo(field);
  document.getElementById(`${field}-combo-list`).classList.add('open');
}

function blurCombo(field) {
  // Delay so click on list item fires first
  setTimeout(() => {
    document.getElementById(`${field}-combo-list`).classList.remove('open');
  }, 150);
}

function filterCombo(field) {
  const inp = document.getElementById(`inp-${field}`);
  const list = document.getElementById(`${field}-combo-list`);
  const q = inp.value.trim().toLowerCase();
  const items = field === 'make' ? state.makes : state.models;
  const filtered = q ? items.filter(i => i.toLowerCase().includes(q)) : items;

  list.innerHTML = filtered.slice(0, 80).map(item => {
    const safe = item.replace(/'/g, '&#39;');
    const hi = q ? item.replace(new RegExp(`(${q})`, 'gi'), '<strong>$1</strong>') : item;
    return `<div class="combo-item" onmousedown="selectCombo('${field}','${safe}')">${hi}</div>`;
  }).join('');

  if (filtered.length === 0) {
    list.innerHTML = '<div class="combo-empty">No results</div>';
  }
  list.classList.add('open');
}

function selectCombo(field, value) {
  document.getElementById(`inp-${field}`).value = value;
  document.getElementById(`${field}-combo-list`).classList.remove('open');
  if (field === 'make') onMakeChange(value);
  else { state.model = value; updateCalculateBtn(); }
}

// ─── Detailed Vehicle Section ──────────────────────────────────────
function renderVehicleSection() {
  const yearSel = document.getElementById('sel-year');
  if (!yearSel) return;

  if (yearSel.options.length <= 1) {
    yearSel.innerHTML = '<option value="">Select year…</option>';
    const cur = new Date().getFullYear() + 1;
    for (let y = cur; y >= 1985; y--) yearSel.add(new Option(y, y));
    yearSel.value = state.year || '';
  }

  const makeInp = document.getElementById('inp-make');
  if (state.loadingMakes) {
    makeInp.placeholder = 'Loading makes…';
    makeInp.disabled = true;
    makeInp.value = '';
  } else if (!state.makes.length) {
    makeInp.placeholder = '— select year first —';
    makeInp.disabled = true;
    makeInp.value = '';
  } else {
    makeInp.placeholder = 'Type or select make…';
    makeInp.disabled = false;
    if (state.make) makeInp.value = state.make;
  }

  const modelInp = document.getElementById('inp-model');
  if (state.loadingModels) {
    modelInp.placeholder = 'Loading models…';
    modelInp.disabled = true;
    modelInp.value = '';
  } else if (!state.models.length) {
    modelInp.placeholder = '— select make first —';
    modelInp.disabled = true;
    modelInp.value = '';
  } else {
    modelInp.placeholder = 'Type or select model…';
    modelInp.disabled = false;
    if (state.model) modelInp.value = state.model;
  }

  document.querySelectorAll('.pill[data-type]').forEach(b => {
    b.classList.toggle('active', b.dataset.type === state.vehicleType);
  });

  updateCalculateBtn();
}

// ─── Panel Section ─────────────────────────────────────────────────
function renderPanelSection() {
  const section = document.getElementById('panel-section');
  if (!section) return;
  const type = VEHICLE_TYPES.find(t => t.id === state.vehicleType);
  const mult = type ? type.mult : 1.0;

  if (state.wrapMode === 'full') {
    const totalSqft = PANELS.reduce((s, p) => s + p.sqft, 0);
    section.innerHTML = `
      <div style="color:var(--text-muted);font-size:14px;padding:4px 0">
        All panels — approx <strong style="color:var(--text)">${Math.round(totalSqft * mult)} sq ft</strong> before waste
      </div>`;
    return;
  }

  section.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn-secondary" style="flex:1;font-size:13px;padding:8px" onclick="selectAllPanels()">All</button>
      <button class="btn-secondary" style="flex:1;font-size:13px;padding:8px" onclick="clearAllPanels()">None</button>
    </div>
    <div class="panel-grid" id="panel-grid"></div>`;

  const grid = document.getElementById('panel-grid');
  PANELS.forEach(p => {
    const scaled = Math.round(p.sqft * mult);
    const checked = state.selectedPanels.has(p.id);
    const div = document.createElement('div');
    div.className = 'panel-check' + (checked ? ' checked' : '');
    div.innerHTML = `
      <input type="checkbox" id="p_${p.id}" ${checked ? 'checked' : ''}>
      <label for="p_${p.id}">${p.label}</label>
      <span class="panel-sqft">${scaled} ft²</span>`;
    div.addEventListener('click', () => togglePanel(p.id, div));
    grid.appendChild(div);
  });
  updateCalculateBtn();
}

function togglePanel(id, el) {
  if (state.selectedPanels.has(id)) {
    state.selectedPanels.delete(id);
    el.classList.remove('checked');
    el.querySelector('input').checked = false;
  } else {
    state.selectedPanels.add(id);
    el.classList.add('checked');
    el.querySelector('input').checked = true;
  }
  updateCalculateBtn();
}

function selectAllPanels() { PANELS.forEach(p => state.selectedPanels.add(p.id)); renderPanelSection(); updateCalculateBtn(); }
function clearAllPanels()  { state.selectedPanels.clear(); renderPanelSection(); updateCalculateBtn(); }

// ─── Calculate Button State ────────────────────────────────────────
function updateCalculateBtn() {
  const btn = document.getElementById('btn-calculate');
  if (!btn) return;
  const hasType = !!state.vehicleType;
  const hasPanels = state.wrapMode === 'full' || state.selectedPanels.size > 0;
  const hasVehicle = state.estimateMode === 'quick'
    ? hasType
    : (state.year && state.make && state.model && hasType);
  btn.disabled = !(hasVehicle && hasPanels);
}

// ─── Results ───────────────────────────────────────────────────────
function renderResults() {
  const { raw, withWaste } = calcSqft();
  const { material, labor, total, vinyl } = calcCost(withWaste);
  const type = VEHICLE_TYPES.find(t => t.id === state.vehicleType);
  const vinylLabel = state.vinylType === 'premium' ? 'Premium' : 'Basic';
  const panelList = state.wrapMode === 'full'
    ? 'Full Wrap'
    : [...state.selectedPanels].map(id => PANELS.find(p => p.id === id)?.label).filter(Boolean).join(', ');

  const vehicleTitle = state.estimateMode === 'quick'
    ? `${type?.icon || ''} ${type?.label || 'Vehicle'}`
    : `${state.year} ${state.make} ${state.model}`;

  const vehicleSub = state.estimateMode === 'quick'
    ? `Quick Estimate · ${vinylLabel} Vinyl`
    : `${type?.label || ''} · ${vinylLabel} Vinyl`;

  document.getElementById('results-content').innerHTML = `
    <div class="result-card">
      <h2>Vehicle</h2>
      <div style="font-size:18px;font-weight:700;margin-top:4px">${vehicleTitle}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${vehicleSub}</div>
    </div>
    <div class="result-card">
      <h2>Vinyl Needed</h2>
      <div class="result-value accent">${withWaste} sq ft</div>
      <div class="result-sub">${raw} sq ft raw + ${Math.round((settings.wasteFactor - 1) * 100)}% waste buffer</div>
    </div>
    <div class="result-card">
      <h2>Cost Breakdown</h2>
      <div class="line-item">
        <span>Vinyl (${fmt(vinyl)}/sqft × ${withWaste})</span>
        <span>${fmt(material)}</span>
      </div>
      <div class="line-item">
        <span>Labor (${fmt(settings.laborPerSqft)}/sqft × ${withWaste})</span>
        <span>${fmt(labor)}</span>
      </div>
      <div class="result-divider"></div>
      <div class="line-item" style="font-size:16px">
        <span style="font-weight:700">Total Installed</span>
        <span style="font-size:20px;color:var(--success)">${fmt(total)}</span>
      </div>
      <div style="margin-top:4px;font-size:12px;color:var(--text-muted)">Material only: ${fmt(material)}</div>
    </div>
    <div class="result-card">
      <h2>Panels</h2>
      <div style="font-size:13px;color:var(--text-muted);line-height:1.6">${panelList}</div>
    </div>`;

  const query = encodeURIComponent(state.vinylType === 'premium' ? 'premium vinyl wrap' : 'vinyl wrap');
  document.getElementById('metro-link').href = `https://www.metrorestyling.com/search?q=${query}`;
  showScreen('results');
}

// ─── Settings ──────────────────────────────────────────────────────
function renderSettings() {
  document.getElementById('set-basic').value   = settings.basicPricePerSqft;
  document.getElementById('set-premium').value = settings.premiumPricePerSqft;
  document.getElementById('set-labor').value   = settings.laborPerSqft;
  document.getElementById('set-waste').value   = Math.round((settings.wasteFactor - 1) * 100);
  showScreen('settings');
}

function saveSettingsForm() {
  settings.basicPricePerSqft   = parseFloat(document.getElementById('set-basic').value)   || DEFAULT_SETTINGS.basicPricePerSqft;
  settings.premiumPricePerSqft = parseFloat(document.getElementById('set-premium').value) || DEFAULT_SETTINGS.premiumPricePerSqft;
  settings.laborPerSqft        = parseFloat(document.getElementById('set-labor').value)   || DEFAULT_SETTINGS.laborPerSqft;
  const wastePct               = parseFloat(document.getElementById('set-waste').value);
  settings.wasteFactor         = 1 + (isNaN(wastePct) ? 15 : wastePct) / 100;
  saveSettings();
  // Refresh price tags on estimator
  const bt = document.getElementById('basic-price-tag');
  const pt = document.getElementById('premium-price-tag');
  if (bt) bt.textContent = fmt(settings.basicPricePerSqft) + '/ft²';
  if (pt) pt.textContent = fmt(settings.premiumPricePerSqft) + '/ft²';
  toast('Settings saved');
  showScreen('estimator');
}

// ─── Event Handlers ────────────────────────────────────────────────
function onYearChange(year) {
  state.year = year;
  state.make = '';
  state.model = '';
  state.models = [];
  const mi = document.getElementById('inp-make');
  const mo = document.getElementById('inp-model');
  if (mi) mi.value = '';
  if (mo) mo.value = '';
  if (year) fetchMakes();
  else { state.makes = []; renderVehicleSection(); }
}

function onMakeChange(make) {
  state.make = make;
  state.model = '';
  state.models = [];
  const mo = document.getElementById('inp-model');
  if (mo) mo.value = '';
  if (make && state.year) fetchModels(make, state.year);
  else renderVehicleSection();
}

function onTypeChange(id) {
  state.vehicleType = id;
  // Update quick grid
  renderQuickTypeGrid();
  // Update detailed type pills
  document.querySelectorAll('.pill[data-type]').forEach(b => {
    b.classList.toggle('active', b.dataset.type === id);
  });
  renderPanelSection();
  updateCalculateBtn();
}

function onWrapMode(mode) {
  state.wrapMode = mode;
  document.getElementById('pill-full').classList.toggle('active', mode === 'full');
  document.getElementById('pill-partial').classList.toggle('active', mode === 'partial');
  renderPanelSection();
  updateCalculateBtn();
}

function onVinylType(type) {
  state.vinylType = type;
  document.getElementById('vinyl-basic').classList.toggle('active', type === 'basic');
  document.getElementById('vinyl-premium').classList.toggle('active', type === 'premium');
}

// ─── Build DOM ─────────────────────────────────────────────────────
function buildApp() {
  document.getElementById('app').innerHTML = `
    <header>
      <span class="logo">🎨</span>
      <h1>Wrapulator</h1>
      <button class="settings-btn" onclick="renderSettings()" title="Settings">⚙️</button>
    </header>

    <!-- ── ESTIMATOR SCREEN ── -->
    <div id="screen-estimator" class="screen active">

      <!-- Mode toggle -->
      <div style="display:flex;gap:0;margin:14px 16px 0;background:var(--surface2);border-radius:var(--radius-sm);padding:3px">
        <button id="mode-quick"    class="mode-tab active" onclick="setEstimateMode('quick')">⚡ Quick</button>
        <button id="mode-detailed" class="mode-tab"        onclick="setEstimateMode('detailed')">🔍 Detailed</button>
      </div>

      <!-- ── QUICK MODE ── -->
      <div id="quick-section">
        <div class="section">
          <div class="section-title">Vehicle Type</div>
          <div id="quick-type-grid" class="type-grid"></div>
        </div>
      </div>

      <!-- ── DETAILED MODE ── -->
      <div id="detailed-section" style="display:none">
        <div class="section">
          <div class="section-title">Vehicle</div>
          <div class="select-wrap">
            <select id="sel-year" onchange="onYearChange(this.value)">
              <option value="">Select year…</option>
            </select>
          </div>
          <div class="combo-wrap" id="make-combo-wrap">
            <input id="inp-make" class="combo-input" type="text" placeholder="— select year first —"
                   disabled autocomplete="off" spellcheck="false"
                   oninput="filterCombo('make')" onfocus="openCombo('make')" onblur="blurCombo('make')">
            <div id="make-combo-list" class="combo-list"></div>
          </div>
          <div class="combo-wrap" id="model-combo-wrap" style="margin-bottom:0">
            <input id="inp-model" class="combo-input" type="text" placeholder="— select make first —"
                   disabled autocomplete="off" spellcheck="false"
                   oninput="filterCombo('model')" onfocus="openCombo('model')" onblur="blurCombo('model')">
            <div id="model-combo-list" class="combo-list"></div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">Vehicle Type</div>
          <div class="pill-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${VEHICLE_TYPES.map(t => `
              <button class="pill" style="min-width:0;white-space:normal;line-height:1.3;text-align:left;padding:10px 12px" data-type="${t.id}" onclick="onTypeChange('${t.id}')">
                ${t.icon} ${t.label}
              </button>`).join('')}
          </div>
        </div>
      </div>

      <!-- ── SHARED: Wrap scope, vinyl, button ── -->
      <div class="section">
        <div class="section-title">Wrap Scope</div>
        <div class="pill-group" style="margin-bottom:14px">
          <button class="pill active" id="pill-full"    onclick="onWrapMode('full')">Full Wrap</button>
          <button class="pill"        id="pill-partial" onclick="onWrapMode('partial')">Select Panels</button>
        </div>
        <div id="panel-section"></div>
      </div>

      <div class="section">
        <div class="section-title">Vinyl Type</div>
        <div class="vinyl-option active" id="vinyl-basic" onclick="onVinylType('basic')">
          <div class="vinyl-swatch" style="background:linear-gradient(135deg,#94a3b8,#64748b)"></div>
          <div class="vinyl-info">
            <div class="vinyl-name">Basic / Standard</div>
            <div class="vinyl-desc">Solid colors, matte &amp; gloss finishes</div>
          </div>
          <div class="vinyl-price-tag" id="basic-price-tag">${fmt(settings.basicPricePerSqft)}/ft²</div>
        </div>
        <div class="vinyl-option" id="vinyl-premium" onclick="onVinylType('premium')">
          <div class="vinyl-swatch" style="background:linear-gradient(135deg,#c084fc,#818cf8,#38bdf8)"></div>
          <div class="vinyl-info">
            <div class="vinyl-name">Premium / Special</div>
            <div class="vinyl-desc">Chrome, color-shift, carbon fiber, satin</div>
          </div>
          <div class="vinyl-price-tag" id="premium-price-tag">${fmt(settings.premiumPricePerSqft)}/ft²</div>
        </div>
      </div>

      <button class="btn-primary" id="btn-calculate" disabled onclick="renderResults()">
        Calculate Estimate
      </button>
      <div class="bottom-spacer"></div>
    </div>

    <!-- ── RESULTS SCREEN ── -->
    <div id="screen-results" class="screen">
      <div id="results-content"></div>
      <a id="metro-link" class="order-link" href="https://www.metrorestyling.com" target="_blank">
        🛒 Order Vinyl at MetroRestyling.com
      </a>
      <button class="btn-primary" style="margin-top:0" onclick="showScreen('estimator')">← New Estimate</button>
      <div class="bottom-spacer"></div>
    </div>

    <!-- ── SETTINGS SCREEN ── -->
    <div id="screen-settings" class="screen">
      <div class="section">
        <div class="section-title">Vinyl Pricing</div>
        <div class="settings-row">
          <label>Basic vinyl (per sq ft)</label>
          <div class="input-prefix-wrap"><input type="number" id="set-basic" min="0" step="0.25"></div>
        </div>
        <div class="settings-row">
          <label>Premium vinyl (per sq ft)</label>
          <div class="input-prefix-wrap"><input type="number" id="set-premium" min="0" step="0.25"></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Labor</div>
        <div class="settings-row">
          <label>Install labor (per sq ft)</label>
          <div class="input-prefix-wrap"><input type="number" id="set-labor" min="0" step="0.50"></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Material Buffer</div>
        <div class="settings-row">
          <label>Waste / overlap factor</label>
          <div class="input-suffix-wrap" data-suffix="% extra">
            <input type="number" id="set-waste" min="0" max="50" step="1">
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted)">Extra material for cuts and overlaps. Default 15%.</div>
      </div>
      <button class="btn-primary" onclick="saveSettingsForm()">Save Settings</button>
      <button class="btn-secondary" style="margin:0 16px" onclick="showScreen('estimator')">Cancel</button>
      <div class="bottom-spacer"></div>
    </div>

    <div class="toast" id="toast"></div>`;

  renderQuickTypeGrid();
  renderVehicleSection();
  renderPanelSection();
  updateCalculateBtn();
}

// ─── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildApp();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
