// ============================================================
// CHART-COMPONENT.JS — Components Horizontal Bar Chart
// To change this chart's appearance or logic, edit ONLY this file.
// ============================================================

import { Settings } from '../modules/state.js';
import { addCompactLegend } from '../modules/legend.js';
import { axisTitle } from '../modules/chart-plugins.js';
import { chartTheme } from '/static/js/theme-colors.js';

let _instance = null;
let _last = null;

// Colour by position (theme palette); a colour set in Settings wins
export function componentColor(i, t = chartTheme()) {
    const ov = Settings.barColors.component;
    return ov[i % ov.length] || t.palette[i % t.palette.length];
}

export function updateComponentBarChart(componentCountMap) {
    _last = componentCountMap;
    const ctx = document.getElementById('componentChart');
    if (!ctx) return;

    const t         = chartTheme();
    const entries   = Array.from(componentCountMap.entries()); // already sorted high→low
    const labels    = entries.map(([name]) => name);
    const data      = entries.map(([, count]) => count);
    const barColors = data.map((_, i) => componentColor(i, t));

    if (_instance) { _instance.destroy(); _instance = null; }

    _instance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Issues per Component',
                data,
                backgroundColor: barColors,
                borderWidth: 0,
                borderRadius: 6,
                maxBarThickness: 28
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { right: 36 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => `${c.raw} issues` } }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: t.grid, drawTicks: false },
                    border: { display: false },
                    title: axisTitle('Issue Count'),
                    ticks: { color: t.tick, padding: 6, precision: 0 },
                    afterFit: s => {
                        const m = Math.max(...data, 0);
                        s.max = m + Math.max(10, m * 0.2);
                    }
                },
                y: { grid: { display: false }, border: { color: t.axis }, ticks: { color: t.tick, font: { size: 12, weight: '500' } } }
            }
        }
    });
    addCompactLegend('componentChart', labels, barColors, data);
}

export function rerenderComponentBarChart() { if (_last) updateComponentBarChart(_last); }

export function destroyComponentBarChart() {
    if (_instance) { _instance.destroy(); _instance = null; }
}
