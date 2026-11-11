// ============================================================
// CHART-ISSUE-TYPE.JS — Issue Types Bar Chart
// To change this chart's appearance or logic, edit ONLY this file.
// ============================================================

import { Settings, ISSUE_TYPE_LABELS } from '../modules/state.js';
import { addCompactLegend } from '../modules/legend.js';
import { axisTitle } from '../modules/chart-plugins.js';
import { chartTheme } from '/static/js/theme-colors.js';

let _instance = null;
let _last = null;

// Same colour for the same issue type on every chart and page; a colour set in Settings wins
export function issueTypeColor(label, i, t = chartTheme()) {
    const k = ISSUE_TYPE_LABELS.indexOf(label);
    return (k !== -1 && Settings.barColors.issueType[k]) || t.type[label] || t.palette[i % t.palette.length];
}

export function updateIssueBarChart(sortedTypeMap) {
    _last = sortedTypeMap;
    const ctx = document.getElementById('issueTypeChart');
    if (!ctx) return;

    const t         = chartTheme();
    const labels    = Array.from(sortedTypeMap.keys());
    const data      = Array.from(sortedTypeMap.values());
    const barColors = labels.map((l, i) => issueTypeColor(l, i, t));

    if (_instance) { _instance.destroy(); _instance = null; }

    _instance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Number of Issues',
                data,
                backgroundColor: barColors,
                borderWidth: 0,
                borderRadius: 6,
                maxBarThickness: 36,
                barPercentage: 0.7,
                categoryPercentage: 0.8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            layout: { padding: { top: 20 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => `${c.raw} issues` } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: t.grid, drawTicks: false },
                    border: { display: false },
                    title: axisTitle('Issue Count'),
                    ticks: { stepSize: 1, padding: 6, color: t.tick }
                },
                x: {
                    grid: { display: false },
                    border: { color: t.axis },
                    ticks: {
                        color: t.tick, maxRotation: 0, minRotation: 0, autoSkip: false,
                        // Multi-word labels wrap onto two lines instead of rotating. On a narrow card the
                        // names don't fit side by side: they are left to the legend below the chart.
                        callback(v) {
                            if (this.chart.width < 480 && labels.length > 4) return '';
                            const l = this.getLabelForValue(v); return l.length > 10 ? l.split(' ') : l;
                        }
                    }
                }
            }
        }
    });
    addCompactLegend('issueTypeChart', labels, barColors, data);
}

export function rerenderIssueBarChart() { if (_last) updateIssueBarChart(_last); }

export function destroyIssueBarChart() {
    if (_instance) { _instance.destroy(); _instance = null; }
}
