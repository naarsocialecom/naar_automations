// Theme colours for canvas charts (Chart.js can't read CSS variables). Read at draw time so a theme switch applies.
export const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function chartTheme() {
    const s = i => cssVar(`--series-${i}`);
    return {
        text: cssVar('--text'), tick: cssVar('--chart-tick'), grid: cssVar('--chart-grid'), axis: cssVar('--chart-axis'),
        surface: cssVar('--surface'), label: cssVar('--series-label'),
        palette: [1, 2, 3, 4, 5, 6, 7, 8].map(s),
        type: {
            Story: s(3), Bug: s(4), Incident: s(2), Operations: s(1), Task: s(8), Epic: s(5),
            Improvement: s(6), 'Change Request': s(7), Design: s(6), 'Test Cycle': s(5),
        },
        prio: {
            Critical: cssVar('--prio-critical'), Highest: cssVar('--prio-critical'), High: cssVar('--prio-high'),
            Medium: cssVar('--prio-medium'), Low: cssVar('--prio-low'), Lowest: cssVar('--prio-lowest'), None: cssVar('--prio-none'),
        },
    };
}
