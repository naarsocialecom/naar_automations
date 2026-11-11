// ============================================================
// CHART-HEAT.JS — Heat Distribution (Bug × Incident by Priority)
// To change this chart's appearance or logic, edit ONLY this file.
// ============================================================

import { Settings } from '../modules/state.js';
import { addCompactLegend } from '../modules/legend.js';
import { axisTitle } from '../modules/chart-plugins.js';
import { PRIORITY_ORDER } from '/static/js/helpers.js';
import { chartTheme } from '/static/js/theme-colors.js';

let _instance = null;
let _last = null;

export function updateHeatClusteredChart(heatData) {
    _last = heatData;
    const ctx = document.getElementById('heatChart');
    if (!ctx) return;

    const t = chartTheme();
    // Bug = amber, Incident = coral (same as everywhere else); a colour set in Settings wins
    const typeColors = {
        Bug:      Settings.barColors.heat.Bug      || t.type.Bug,
        Incident: Settings.barColors.heat.Incident || t.type.Incident
    };
    const issueTypes = ['Bug', 'Incident'];

    const prioritiesWithData = PRIORITY_ORDER.filter(
        p => (heatData.Bug?.[p] || 0) > 0 || (heatData.Incident?.[p] || 0) > 0
    );

    const datasets = issueTypes.map(type => ({
        label: type,
        data: prioritiesWithData.map(p => heatData[type]?.[p] || 0),
        backgroundColor: typeColors[type],
        borderWidth: 0,
        borderRadius: 6,
        maxBarThickness: 32,
        barPercentage: 0.85,
        categoryPercentage: 0.8
    }));

    if (_instance) { _instance.destroy(); _instance = null; }

    _instance = new Chart(ctx, {
        type: 'bar',
        data: { labels: prioritiesWithData, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 16 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index', intersect: false,
                    callbacks: { label: c => `${c.dataset.label}: ${c.raw} issues` }
                }
            },
            scales: {
                x: {
                    title: axisTitle('Priority'),
                    grid: { display: false }, border: { color: t.axis }, stacked: false,
                    ticks: { color: t.tick }
                },
                y: {
                    beginAtZero: true,
                    title: axisTitle('Issue Count'),
                    grid: { color: t.grid, drawTicks: false },
                    border: { display: false },
                    ticks: { stepSize: 1, precision: 0, padding: 6, color: t.tick },
                    afterFit: s => {
                        const m = Math.max(...datasets.flatMap(d => d.data), 0);
                        s.max = m + Math.max(2, m * 0.15);
                    }
                }
            }
        }
    });

    addCompactLegend(
        'heatChart',
        issueTypes,
        issueTypes.map(ty => typeColors[ty]),
        issueTypes.map(ty => prioritiesWithData.reduce((sum, p) => sum + (heatData[ty]?.[p] || 0), 0))
    );
}

export function rerenderHeatClusteredChart() { if (_last) updateHeatClusteredChart(_last); }

export function destroyHeatChart() {
    if (_instance) { _instance.destroy(); _instance = null; }
}
