// ============================================================
// CHART-PRIORITY.JS — Priority Distribution Donut Chart
// To change this chart's appearance or logic, edit ONLY this file.
// ============================================================

import { addDonutCompactLegend } from '../modules/legend.js';
import { chartTheme } from '/static/js/theme-colors.js';

let _instance = null;
let _last = null;

export function updatePriorityDonutChart(priorityCountMap) {
    _last = priorityCountMap;
    const ctx = document.getElementById('priorityChart');
    if (!ctx) return;

    const t                = chartTheme();
    const sortedEntries    = Array.from(priorityCountMap.entries())
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1]);
    const labels           = sortedEntries.map(([name]) => name);
    const data             = sortedEntries.map(([, count]) => count);
    const total            = data.reduce((a, b) => a + b, 0);
    const backgroundColors = labels.map(l => t.prio[l] || t.prio.None);

    if (_instance) { _instance.destroy(); _instance = null; }

    _instance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: t.surface,
                hoverOffset: 4,
                cutout: '68%'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            layout: { padding: 4 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => `${c.label}: ${c.raw} (${total > 0 ? ((c.raw/total)*100).toFixed(1) : 0}%)`
                    }
                }
            }
        }
    });
    addDonutCompactLegend('priorityChart', labels, backgroundColors, data, total);
}

export function rerenderPriorityDonutChart() { if (_last) updatePriorityDonutChart(_last); }

export function destroyPriorityDonutChart() {
    if (_instance) { _instance.destroy(); _instance = null; }
}
