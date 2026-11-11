// ============================================================
// STATE.JS — Single source of truth for all dashboard state
// If you need to add a new global variable, it lives here.
// ============================================================

export const State = {
    allSprintsList:    [],
    selectedSprintIds: new Set(),
    currentIssues:     [],
    sprintDetailsMap:  new Map(),
};

// Issue types that get a colour picker in Settings (same order as Settings.barColors.issueType)
export const ISSUE_TYPE_LABELS = ['Story', 'Improvement', 'Bug', 'Incident', 'Task', 'Epic'];

// Chart colours: null = use the theme colour (tokens.css). Only colours the user changed in Settings are set.
export const Settings = {
    sortOrder: 'high-to-low',      // 'high-to-low' | 'low-to-high'
    barColors: {
        issueType:  [null, null, null, null, null, null],   // by ISSUE_TYPE_LABELS
        component:  [null, null, null, null, null, null],   // by bar position
        heat:       { Bug: null, Incident: null },
    },
    legendStyle: 'pills',          // 'pills' | 'table'
};

// The colours that used to be the defaults. Saved settings that still hold them are dropped,
// so the soft theme colours apply (and follow light / dark).
const LEGACY_DEFAULTS = {
    issueType:    ['#16ecac', '#25d6ee', '#d63a0a', '#ffaa00', '#4d4d4d', '#0755ae'],
    component:    ['#d03100', '#e07d03', '#00aac0', '#00b17c', '#484848', '#0563cf'],
    heatBug:      '#d03100',
    heatIncident: '#e07d03',
};
const isColor = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const keep = (v, legacy) => (isColor(v) && v.toLowerCase() !== legacy ? v : null);

export function applySettings(incoming) {
    if (incoming.sortOrder) Settings.sortOrder = incoming.sortOrder;
    const bc = incoming.barColors;
    if (bc) {
        ['issueType', 'component'].forEach(k => {
            if (Array.isArray(bc[k])) Settings.barColors[k] = Settings.barColors[k].map((_, i) => keep(bc[k][i], LEGACY_DEFAULTS[k][i]));
        });
        Settings.barColors.heat.Bug      = keep(bc.heatBug, LEGACY_DEFAULTS.heatBug);
        Settings.barColors.heat.Incident = keep(bc.heatIncident, LEGACY_DEFAULTS.heatIncident);
    }
}

export function loadSettingsFromStorage() {
    try {
        const raw = localStorage.getItem('naar_dashboard_settings');
        if (raw) applySettings(JSON.parse(raw));
    } catch (_) {}
}

export function saveSettingsToStorage() {
    try {
        localStorage.setItem('naar_dashboard_settings', JSON.stringify({
            sortOrder: Settings.sortOrder,
            barColors: {
                issueType:   Settings.barColors.issueType,
                component:   Settings.barColors.component,
                heatBug:     Settings.barColors.heat.Bug,
                heatIncident:Settings.barColors.heat.Incident,
            }
        }));
    } catch (_) {}
}
