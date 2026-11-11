// ============================================================
// SETTINGS-PANEL.JS
//   Tab 1: Display  (sort, legend)
//   Tab 2: Columns  (only Issue Count + Due Date)
//   Tab 3: Colors   (chart colors + status colors — clean)
// ============================================================

import { Settings, saveSettingsToStorage, ISSUE_TYPE_LABELS } from './state.js';
import { chartTheme } from '/static/js/theme-colors.js';

// ── Only 2 optional columns (removed Assignee, Priority, Sprint) ─
export const EPIC_EXTRA_COLUMNS = [
    { key: 'dueDate',    label: 'Due Date'    },
    { key: 'components', label: 'Components'  },
];

export const EpicColumns = { visible: new Set(['issueCount']) };

export function loadEpicColumnsFromStorage() {
    try {
        const raw = localStorage.getItem('naar_epic_columns');
        if (raw) EpicColumns.visible = new Set(JSON.parse(raw));
    } catch (_) {}
}
export function saveEpicColumnsToStorage() {
    try { localStorage.setItem('naar_epic_columns', JSON.stringify([...EpicColumns.visible])); } catch (_) {}
}

// ── Status color definitions ─────────────────────────────────
// Default colours come from the CSS tokens (style.css, light + dark). A <style> override is injected
// only for statuses the user changed in Settings.
export const STATUS_COLOR_DEFS = [
    { key: 'status-backlog',     label: 'Product Backlog' },
    { key: 'status-research',    label: 'In Research' },
    { key: 'status-design',      label: 'In Design' },
    { key: 'status-readyfordev', label: 'Ready for Dev.' },
    { key: 'status-development', label: 'In Development' },
    { key: 'status-onhold',      label: 'On-hold' },
    { key: 'status-cancelled',   label: 'Cancelled' },
    { key: 'status-done',        label: 'Done' },
    { key: 'status-inprogress',  label: 'In Progress' },
    { key: 'status-todo',        label: 'To Do / Other' },
];
// Former hard-coded defaults: saved values equal to these are dropped (they were never a user choice)
const LEGACY_STATUS_DEFAULTS = {
    'status-backlog':     ['#e4e5e7', '#42526e'], 'status-research':    ['#fff8cc', '#7d6100'],
    'status-design':      ['#fff8cc', '#7d6100'], 'status-readyfordev': ['#f0e6ff', '#5e00cc'],
    'status-development': ['#fff8cc', '#7d6100'], 'status-onhold':      ['#fff0db', '#a05000'],
    'status-cancelled':   ['#ffe8e5', '#9e2a14'], 'status-done':        ['#e3fcef', '#006644'],
    'status-inprogress':  ['#deebff', '#0052cc'], 'status-todo':        ['#f4f5f7', '#42526e'],
};
export const StatusColors = {};

const toHex = c => {
    const m = String(c).match(/\d+(\.\d+)?/g);
    if (String(c).startsWith('#')) return c.length === 4 ? '#' + [...c.slice(1)].map(x => x + x).join('') : c.toLowerCase();
    return m ? '#' + m.slice(0, 3).map(n => Math.round(+n).toString(16).padStart(2, '0')).join('') : '#000000';
};

// The theme's colours for a status (overrides switched off while measuring)
function themeStatusColor(key) {
    const overrides = [...document.querySelectorAll('style[id^="sc-"]')];
    overrides.forEach(el => { el.disabled = true; });
    const probe = document.createElement('span');
    probe.className = `status-pill ${key}`;
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const out = { bg: toHex(cs.backgroundColor), text: toHex(cs.color) };
    probe.remove();
    overrides.forEach(el => { el.disabled = false; });
    return out;
}

export function loadStatusColorsFromStorage() {
    try {
        const raw = localStorage.getItem('naar_status_colors');
        if (raw) Object.assign(StatusColors, JSON.parse(raw));
    } catch (_) {}
    // Drop the old defaults that were saved along with every Apply
    Object.entries(StatusColors).forEach(([key, ov]) => {
        const legacy = LEGACY_STATUS_DEFAULTS[key] || [];
        if (ov?.bg?.toLowerCase() === legacy[0]) delete ov.bg;
        if (ov?.text?.toLowerCase() === legacy[1]) delete ov.text;
        if (!ov || (!ov.bg && !ov.text)) delete StatusColors[key];
    });
    saveStatusColorsToStorage();
    applyStatusColorsToDOM();
}
export function saveStatusColorsToStorage() {
    try { localStorage.setItem('naar_status_colors', JSON.stringify(StatusColors)); } catch (_) {}
}
export function applyStatusColorsToDOM() {
    STATUS_COLOR_DEFS.forEach(def => {
        const ov = StatusColors[def.key];
        let el = document.getElementById(`sc-${def.key}`);
        if (!ov || (!ov.bg && !ov.text)) { el?.remove(); return; }
        if (!el) { el = document.createElement('style'); el.id = `sc-${def.key}`; document.head.appendChild(el); }
        el.textContent = `.${def.key}{${ov.bg ? `background:${ov.bg}!important;` : ''}${ov.text ? `color:${ov.text}!important;` : ''}}`;
    });
}

// ── Panel HTML ───────────────────────────────────────────────
function buildPanelHTML() {
    return `
    <div id="settingsOverlay" class="settings-overlay"></div>
    <div id="settingsPanel" class="settings-panel" role="dialog" aria-label="Dashboard Settings">
        <div class="settings-header">
            <div class="settings-title"><i class="fas fa-sliders-h"></i> Dashboard Settings</div>
            <button id="settingsCloseBtn" type="button" class="icon-btn icon-btn--ghost settings-close-btn" title="Close" aria-label="Close settings"><i class="fas fa-times"></i></button>
        </div>
        <div class="settings-tabs">
            <button class="settings-tab active" data-tab="display"><i class="fas fa-desktop"></i> Display</button>
            <button class="settings-tab" data-tab="columns"><i class="fas fa-columns"></i> Columns</button>
            <button class="settings-tab" data-tab="colors"><i class="fas fa-palette"></i> Colors</button>
        </div>

        <!-- TAB: DISPLAY -->
        <div class="settings-body settings-tab-pane active" id="tab-display">
            <div class="settings-section">
                <div class="settings-section-label"><i class="fas fa-sort-amount-down-alt"></i> Sort Order (Bar Charts)</div>
                <div class="settings-radio-group">
                    <label class="settings-radio-option">
                        <input type="radio" name="sortOrder" value="high-to-low">
                        <span class="radio-custom"></span><span class="radio-label">High to Low</span>
                    </label>
                    <label class="settings-radio-option">
                        <input type="radio" name="sortOrder" value="low-to-high">
                        <span class="radio-custom"></span><span class="radio-label">Low to High</span>
                    </label>
                </div>
            </div>
            <div class="settings-section">
                <div class="settings-section-label"><i class="fas fa-list-ul"></i> Legend Style</div>
                <div class="settings-radio-group">
                    <label class="settings-radio-option">
                        <input type="radio" name="legendStyle" value="pills">
                        <span class="radio-custom"></span><span class="radio-label">Pills (compact)</span>
                    </label>
                    <label class="settings-radio-option">
                        <input type="radio" name="legendStyle" value="table">
                        <span class="radio-custom"></span><span class="radio-label">Table (S.No · Title · Count)</span>
                    </label>
                </div>
            </div>
            <div class="settings-section settings-section-reset">
                <button id="settingsResetBtn" type="button" class="btn btn--secondary btn--sm settings-reset-btn"><i class="fas fa-undo-alt"></i> Reset Display</button>
            </div>
        </div>

        <!-- TAB: COLUMNS -->
        <div class="settings-body settings-tab-pane" id="tab-columns">
            <div class="settings-section">
                <div class="settings-section-label"><i class="fas fa-table"></i> Epic Table Columns</div>
                <p class="settings-hint">Epic Key &amp; Summary are always visible. Toggle extras:</p>
                <div class="column-toggle-list" id="epicColumnToggles"></div>
            </div>
            <div class="settings-section settings-section-reset">
                <button id="columnsResetBtn" type="button" class="btn btn--secondary btn--sm settings-reset-btn"><i class="fas fa-undo-alt"></i> Reset Columns</button>
            </div>
        </div>

        <!-- TAB: COLORS -->
        <div class="settings-body settings-tab-pane" id="tab-colors">
            <!-- Chart colors -->
            <div class="settings-section">
                <div class="settings-section-label"><i class="fas fa-chart-bar"></i> Issue Type Colors</div>
                <div class="color-grid" id="issueTypeColorGrid"></div>
            </div>
            <div class="settings-section">
                <div class="settings-section-label"><i class="fas fa-cubes"></i> Component Colors</div>
                <div class="color-grid" id="componentColorGrid"></div>
            </div>
            <div class="settings-section">
                <div class="settings-section-label"><i class="fas fa-fire"></i> Heat Chart Colors</div>
                <div class="color-grid" id="heatColorGrid"></div>
            </div>
            <!-- Status colors — compact pill-only format -->
            <div class="settings-section">
                <div class="settings-section-label"><i class="fas fa-tag"></i> Epic Status Colors</div>
                <p class="settings-hint">Click any status pill to change its color.</p>
                <div class="status-pill-grid" id="statusColorList"></div>
            </div>
            <div class="settings-section settings-section-reset">
                <button id="colorsResetBtn" type="button" class="btn btn--secondary btn--sm settings-reset-btn"><i class="fas fa-undo-alt"></i> Reset Colors</button>
            </div>
        </div>

        <div class="settings-footer">
            <button id="settingsApplyBtn" type="button" class="btn btn--primary settings-apply-btn"><i class="fas fa-check"></i> Apply Settings</button>
        </div>
    </div>`;
}

// ── Defaults: the theme colours (tokens.css) ───────────────────
const COMPONENT_LABELS = ['Comp 1', 'Comp 2', 'Comp 3', 'Comp 4', 'Comp 5', 'Comp 6'];
const themeIssueTypeColors = (t = chartTheme()) => ISSUE_TYPE_LABELS.map(l => t.type[l]);
const themeComponentColors = (t = chartTheme()) => COMPONENT_LABELS.map((_, i) => t.palette[i % t.palette.length]);
const themeHeatColors      = (t = chartTheme()) => ({ heatBug: t.type.Bug, heatIncident: t.type.Incident });
// What the picker shows: the user's colour, else the theme's
const shown = (overrides, defaults) => defaults.map((d, i) => overrides[i] || d);
// What gets saved: only a colour that differs from the theme's
const changed = (value, def) => (value && value.toLowerCase() !== String(def).toLowerCase() ? value : null);

// ── Color grid (chart colors) ─────────────────────────────────
function wireColorPair(native, hex) {
    native.addEventListener('input', () => { hex.value = native.value; });
    hex.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) native.value = hex.value.trim(); });
    hex.addEventListener('blur', () => {
        let v = hex.value.trim();
        if (v && !v.startsWith('#')) v = '#' + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) { hex.value = v; native.value = v; }
        else hex.value = native.value;
    });
}

function buildColorGrid(containerId, colorArray, labelArray) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';
    colorArray.forEach((color, i) => {
        const item = document.createElement('div');
        item.className = 'color-grid-item';
        item.innerHTML = `
            <span class="color-swatch-name">${labelArray[i] || `Item ${i+1}`}</span>
            <div class="color-inputs">
                <input type="color" class="color-picker-native" data-index="${i}" data-target="${containerId}" value="${color}">
                <input type="text"  class="color-hex-input" data-index="${i}" data-target="${containerId}" value="${color}" maxlength="7" placeholder="#000000" spellcheck="false">
            </div>`;
        wireColorPair(item.querySelector('.color-picker-native'), item.querySelector('.color-hex-input'));
        grid.appendChild(item);
    });
}

function buildHeatColorGrid() {
    const grid = document.getElementById('heatColorGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const def = themeHeatColors();
    [{ label:'Bug', key:'heatBug', color: Settings.barColors.heat.Bug || def.heatBug },
     { label:'Incident', key:'heatIncident', color: Settings.barColors.heat.Incident || def.heatIncident }]
    .forEach(({ label, key, color }) => {
        const item = document.createElement('div');
        item.className = 'color-grid-item';
        item.innerHTML = `
            <span class="color-swatch-name">${label}</span>
            <div class="color-inputs">
                <input type="color" class="color-picker-native" data-heat-key="${key}" value="${color}">
                <input type="text"  class="color-hex-input" data-heat-key="${key}" value="${color}" maxlength="7" placeholder="#000000" spellcheck="false">
            </div>`;
        wireColorPair(item.querySelector('.color-picker-native'), item.querySelector('.color-hex-input'));
        grid.appendChild(item);
    });
}

// ── Status colors — compact pill-click design ────────────────
function buildStatusColorList() {
    const container = document.getElementById('statusColorList');
    if (!container) return;
    container.innerHTML = '';

    STATUS_COLOR_DEFS.forEach(def => {
        const ov   = StatusColors[def.key] || {};
        const base = themeStatusColor(def.key);
        const bg   = ov.bg   || base.bg;
        const text = ov.text || base.text;

        const wrap = document.createElement('div');
        wrap.className = 'status-pill-edit-wrap';

        // The pill itself is the trigger
        wrap.innerHTML = `
            <div class="status-pill-edit-row">
                <span class="status-pill ${def.key} status-pill-editable"
                      style="background:${bg};color:${text};"
                      title="Click to edit colors">
                    ${def.label}
                </span>
                <div class="status-inline-pickers" style="display:none;">
                    <label class="status-picker-compact" title="Background color">
                        <span>BG</span>
                        <input type="color" data-status-key="${def.key}" data-type="bg" value="${bg}">
                        <input type="text" class="color-hex-input" data-status-key="${def.key}" data-type="bg" value="${bg}" maxlength="7">
                    </label>
                    <label class="status-picker-compact" title="Text color">
                        <span>Text</span>
                        <input type="color" data-status-key="${def.key}" data-type="text" value="${text}">
                        <input type="text" class="color-hex-input" data-status-key="${def.key}" data-type="text" value="${text}" maxlength="7">
                    </label>
                </div>
            </div>`;

        // Toggle pickers on pill click
        const pill    = wrap.querySelector('.status-pill-editable');
        const pickers = wrap.querySelector('.status-inline-pickers');
        pill.addEventListener('click', () => {
            const isOpen = pickers.style.display !== 'none';
            // Close all others
            container.querySelectorAll('.status-inline-pickers').forEach(p => { p.style.display = 'none'; });
            pickers.style.display = isOpen ? 'none' : 'flex';
        });

        // Wire pickers to update pill preview live
        wrap.querySelectorAll('label.status-picker-compact').forEach(lbl => {
            const native = lbl.querySelector('input[type=color]');
            const hex    = lbl.querySelector('input[type=text]');
            const sync = () => {
                const bgN   = wrap.querySelector(`input[type=color][data-type="bg"]`)?.value;
                const textN = wrap.querySelector(`input[type=color][data-type="text"]`)?.value;
                if (bgN)   pill.style.background = bgN;
                if (textN) pill.style.color = textN;
            };
            native.addEventListener('input', () => { hex.value = native.value; sync(); });
            hex.addEventListener('input', () => {
                const v = hex.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(v)) { native.value = v; sync(); }
            });
            hex.addEventListener('blur', () => {
                let v = hex.value.trim();
                if (v && !v.startsWith('#')) v = '#' + v;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) { hex.value = v; native.value = v; sync(); }
                else hex.value = native.value;
            });
        });

        container.appendChild(wrap);
    });
}

function collectStatusColors() {
    const base = {};
    document.querySelectorAll('#statusColorList input[type=color]').forEach(native => {
        const key  = native.dataset.statusKey;
        const type = native.dataset.type;
        if (!key || !type) return;
        base[key] = base[key] || themeStatusColor(key);
        const value = changed(native.value, base[key][type]);
        if (value) (StatusColors[key] = StatusColors[key] || {})[type] = value;
        else if (StatusColors[key]) delete StatusColors[key][type];
        if (StatusColors[key] && !StatusColors[key].bg && !StatusColors[key].text) delete StatusColors[key];
    });
}

// ── Column toggles ────────────────────────────────────────────
function buildColumnToggles() {
    const list = document.getElementById('epicColumnToggles');
    if (!list) return;
    list.innerHTML = '';
    EPIC_EXTRA_COLUMNS.forEach(col => {
        const isOn = EpicColumns.visible.has(col.key);
        const row  = document.createElement('div');
        row.className = 'column-toggle-row';
        row.innerHTML = `
            <span class="column-toggle-label">${col.label}</span>
            <label class="toggle-switch">
                <input type="checkbox" data-col-key="${col.key}" ${isOn ? 'checked' : ''}>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>`;
        list.appendChild(row);
    });
}

// ── Tabs ──────────────────────────────────────────────────────
function setupTabs() {
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
        });
    });
}

// ── Collect & apply ───────────────────────────────────────────
function collectAndApply() {
    const sortR = document.querySelector('input[name="sortOrder"]:checked');
    if (sortR) Settings.sortOrder = sortR.value;

    const legR = document.querySelector('input[name="legendStyle"]:checked');
    if (legR) Settings.legendStyle = legR.value;

    const t = chartTheme();
    const typeDefaults = themeIssueTypeColors(t), compDefaults = themeComponentColors(t), heatDefaults = themeHeatColors(t);
    document.querySelectorAll('#issueTypeColorGrid .color-picker-native').forEach(inp => {
        Settings.barColors.issueType[+inp.dataset.index] = changed(inp.value, typeDefaults[+inp.dataset.index]);
    });
    document.querySelectorAll('#componentColorGrid .color-picker-native').forEach(inp => {
        Settings.barColors.component[+inp.dataset.index] = changed(inp.value, compDefaults[+inp.dataset.index]);
    });
    document.querySelectorAll('#heatColorGrid .color-picker-native').forEach(inp => {
        if (inp.dataset.heatKey === 'heatBug')      Settings.barColors.heat.Bug      = changed(inp.value, heatDefaults.heatBug);
        if (inp.dataset.heatKey === 'heatIncident') Settings.barColors.heat.Incident = changed(inp.value, heatDefaults.heatIncident);
    });

    EpicColumns.visible.clear();
    document.querySelectorAll('#epicColumnToggles input[type=checkbox]:checked').forEach(cb => {
        EpicColumns.visible.add(cb.dataset.colKey);
    });

    collectStatusColors();
    saveStatusColorsToStorage();
    applyStatusColorsToDOM();
    saveSettingsToStorage();
    saveEpicColumnsToStorage();
    document.dispatchEvent(new CustomEvent('naar:settingsChanged'));
    closePanel();
}

function syncDisplayForm() {
    const s = document.querySelector(`input[name="sortOrder"][value="${Settings.sortOrder}"]`);
    if (s) s.checked = true;
    const l = document.querySelector(`input[name="legendStyle"][value="${Settings.legendStyle}"]`);
    if (l) l.checked = true;
}

function syncFormToSettings() {
    syncDisplayForm();
    buildColorGrid('issueTypeColorGrid', shown(Settings.barColors.issueType, themeIssueTypeColors()), ISSUE_TYPE_LABELS);
    buildColorGrid('componentColorGrid',  shown(Settings.barColors.component, themeComponentColors()), COMPONENT_LABELS);
    buildHeatColorGrid();
    buildColumnToggles();
    buildStatusColorList();
}

function openPanel() {
    syncFormToSettings();
    document.getElementById('settingsPanel')?.classList.add('open');
    document.getElementById('settingsOverlay')?.classList.add('open');
}
function closePanel() {
    document.getElementById('settingsPanel')?.classList.remove('open');
    document.getElementById('settingsOverlay')?.classList.remove('open');
}

export function initSettingsPanel() {
    loadEpicColumnsFromStorage();
    loadStatusColorsFromStorage();

    const mount = document.createElement('div');
    mount.innerHTML = buildPanelHTML();
    document.body.appendChild(mount);
    setupTabs();

    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const btn = document.createElement('button');
        btn.id = 'settingsTriggerBtn'; btn.type = 'button'; btn.className = 'icon-btn settings-trigger-btn';
        btn.title = 'Dashboard Settings'; btn.setAttribute('aria-label', 'Dashboard settings');
        btn.innerHTML = `<i class="fas fa-sliders-h"></i>`;
        btn.addEventListener('click', openPanel);
        headerRight.appendChild(btn);
    }

    document.getElementById('settingsCloseBtn')?.addEventListener('click', closePanel);
    document.getElementById('settingsOverlay')?.addEventListener('click', closePanel);
    document.getElementById('settingsApplyBtn')?.addEventListener('click', collectAndApply);
    document.getElementById('settingsResetBtn')?.addEventListener('click', () => {
        Settings.sortOrder = 'high-to-low'; Settings.legendStyle = 'pills'; syncDisplayForm();
    });
    document.getElementById('colorsResetBtn')?.addEventListener('click', () => {
        // Back to the theme colours
        Settings.barColors.issueType     = Settings.barColors.issueType.map(() => null);
        Settings.barColors.component     = Settings.barColors.component.map(() => null);
        Settings.barColors.heat.Bug      = null;
        Settings.barColors.heat.Incident = null;
        buildColorGrid('issueTypeColorGrid', themeIssueTypeColors(), ISSUE_TYPE_LABELS);
        buildColorGrid('componentColorGrid',  themeComponentColors(), COMPONENT_LABELS);
        buildHeatColorGrid();
        // Reset status colors
        Object.keys(StatusColors).forEach(k => delete StatusColors[k]);
        buildStatusColorList();
    });
    document.getElementById('columnsResetBtn')?.addEventListener('click', () => {
        EpicColumns.visible = new Set(['issueCount']); buildColumnToggles();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
}