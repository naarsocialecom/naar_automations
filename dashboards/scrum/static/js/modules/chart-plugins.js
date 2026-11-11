// ============================================================
// CHART-PLUGINS.JS — Chart.js custom plugins + theme defaults
// Register once, used by all charts. Colours are read from the
// CSS tokens at draw time, so a light / dark switch applies.
// ============================================================

import { chartTheme } from '/static/js/theme-colors.js';

// Same font stack as the page (style.css)
const FONT = "Lufga, 'Plus Jakarta Sans', Inter, system-ui, sans-serif";

const verticalBarLabelsPlugin = {
    id: 'verticalBarLabels',
    afterDatasetsDraw(chart) {
        if (chart.config.options?.indexAxis === 'y' || chart.config.type !== 'bar') return;
        const { ctx } = chart;
        ctx.save();
        ctx.font = `600 12px ${FONT}`;
        ctx.fillStyle = chartTheme().text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        chart.data.datasets.forEach((dataset, di) => {
            const meta = chart.getDatasetMeta(di);
            if (!meta || meta.hidden) return;
            meta.data.forEach((bar, i) => {
                const value = dataset.data[i];
                if (value > 0) ctx.fillText(String(value), bar.x, bar.y - 4);
            });
        });
        ctx.restore();
    }
};

const horizontalBarLabelsPlugin = {
    id: 'horizontalBarLabels',
    afterDatasetsDraw(chart) {
        if (chart.config.options?.indexAxis !== 'y') return;
        const { ctx } = chart;
        ctx.save();
        ctx.font = `600 12px ${FONT}`;
        ctx.fillStyle = chartTheme().text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach((dataset, di) => {
            const meta = chart.getDatasetMeta(di);
            if (!meta || meta.hidden) return;
            meta.data.forEach((bar, i) => {
                const value = dataset.data[i];
                if (value > 0) ctx.fillText(String(value), bar.x + 6, bar.y);
            });
        });
        ctx.restore();
    }
};

// Total in the middle of the donut (no painted disc: the card shows through in both themes)
const donutCenterPlugin = {
    id: 'donutCenter',
    afterDraw(chart) {
        if (chart.config.type !== 'doughnut') return;
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const t  = chartTheme();
        const cx = (chartArea.left + chartArea.right)  / 2;
        const cy = (chartArea.top  + chartArea.bottom) / 2;
        const total = chart.data.datasets[0].data.reduce((a, b) => Number(a) + Number(b), 0);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `600 24px ${FONT}`;
        ctx.fillStyle = t.text;
        ctx.fillText(String(total), cx, cy - 8);
        ctx.font = `500 12px ${FONT}`;
        ctx.fillStyle = t.tick;
        ctx.fillText('Total', cx, cy + 14);
        ctx.restore();
    }
};

// Chart.js defaults that follow the theme; call again after a theme switch
export function applyChartDefaults() {
    const t = chartTheme();
    Chart.defaults.font.family = FONT;
    Chart.defaults.font.size   = 12;
    Chart.defaults.color       = t.tick;
    Chart.defaults.borderColor = t.grid;
}

export function registerChartPlugins() {
    applyChartDefaults();
    Chart.register(verticalBarLabelsPlugin, horizontalBarLabelsPlugin, donutCenterPlugin);
}

// Shared axis styling: y gridlines only, quiet ticks, 12px/500 axis titles
export function axisTitle(text) {
    return { display: true, text, color: chartTheme().tick, font: { size: 12, weight: '500' } };
}
