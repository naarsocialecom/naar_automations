// ============================================================
// NDO.JS — Naar Data Operations page (entry point)
// Data: /api/ndo/report · Notes / RAG / Slack: /api/ndo/*
// ============================================================

import { escapeHtml, getStatusClass, API_BASE } from './modules/helpers.js';

const NDO_API = `${API_BASE}/ndo`;
const $ = id => document.getElementById(id);

let report      = null;
let typeFilter  = 'All';
// Open Tickets table: rows per page and the page shown
const PAGE_SIZE = 15;
let ticketPage  = 1;
// ?day=YYYY-MM-DD shows a past day's summary (read-only)
const VIEW_DAY  = new URLSearchParams(location.search).get('day');

const SOURCE_ICONS = {
    slack:     '<i class="fab fa-slack" title="From Slack"></i>',
    jira:      '<i class="fab fa-jira" title="Ticket closed today — written from its Jira comments"></i>',
    dashboard: '<i class="fas fa-keyboard" title="Added on dashboard"></i>',
};

// ── API ──────────────────────────────────────────────────────
async function api(path, options = {}) {
    const res = await fetch(`${NDO_API}${path}`, {
        headers: { 'Content-Type': 'application/json', 'X-NDO-Request': '1' },
        ...options,
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON error page */ }
    if (!res.ok && res.status !== 409) throw new Error(data.error || `Request failed (${res.status})`);
    return { status: res.status, data };
}

async function loadReport(refresh = false) {
    try {
        const params = new URLSearchParams();
        if (refresh) params.set('refresh', '1');
        if (VIEW_DAY) params.set('day', VIEW_DAY);
        const { data } = await api(`/report${params.toString() ? `?${params}` : ''}`);
        report = data;
        $('ndoError').classList.add('ndo-hidden');
        render();
        document.body.dataset.ready = '1';   // signals the Slack screenshot job that data is drawn
    } catch (err) {
        console.error('NDO report error:', err);
        const box = $('ndoError');
        box.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escapeHtml(err.message)}`;
        box.classList.remove('ndo-hidden');
        $('ndoUpdatedLabel').textContent = 'Failed to load';
        document.body.dataset.ready = 'error';
    }
}

// ── Render ───────────────────────────────────────────────────
const chipClass = v => String(v).replace(/[^A-Za-z0-9-]/g, '-');
const chip      = (v, prefix = '') => `<span class="ndo-chip ndo-chip--${prefix}${chipClass(v)}">${escapeHtml(v)}</span>`;
const keyLink   = t => `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener" class="ndo-key">${escapeHtml(t.key)}</a>`;
const timeLabel = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Escapes text and turns ticket keys (e.g. NDO-873) into Jira links
function linkify(text) {
    const html     = escapeHtml(text);
    const prefixes = (report?.ticket_prefixes || []).map(p => p.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
    if (!prefixes.length) return html;
    const re = new RegExp(`\\b((?:${prefixes.join('|')})-\\d+)\\b`, 'gi');
    return html.replace(re, key => {
        const k = key.toUpperCase();
        return `<a href="${escapeHtml(report.jira_browse_url + k)}" target="_blank" rel="noopener">${k}</a>`;
    });
}

function render() {
    const { totals, rag } = report;
    $('ndoUpdatedLabel').textContent = report.is_today ? `Updated ${timeLabel(report.generated_at)}` : `Past day · ${report.date_label}`;
    document.body.classList.toggle('ndo-past', !report.is_today);
    $('ndoTitleCell').textContent = `Daily Update · ${report.date_label}`;
    $('ndoJql').textContent = report.jql;

    $('tileIncident').textContent   = totals.by_type.Incident ?? 0;
    $('tileOps').textContent        = totals.by_type.Operations ?? 0;
    $('tileCritical').textContent   = totals.critical_high;
    $('tileUnassigned').textContent = totals.unassigned;
    $('tileNew').textContent        = totals.new_24h;
    const split = totals.splits || {};
    // Open tickets by work status: started, not started, stuck
    const byState = ty => {
        const out = { active: [], todo: [], hold: [] };
        (report.tickets || []).filter(t => t.type === ty).forEach(t => out[ticketState(t.status)]?.push(t.key));
        return out;
    };
    const STATE_PARTS = { active: ['In progress', '#4f8fea'], todo: ['To do', '#c1c7d0'], hold: ['On hold', '#f5b25b'] };
    renderSplit('splitIncident', byState('Incident'),   STATE_PARTS);
    renderSplit('splitOps',      byState('Operations'), STATE_PARTS);
    renderSplit('splitCritical',   split.critical_high, { Critical: ['Critical', '#f0806f'], High: ['High', '#f5a3b0'] });
    renderSplit('splitUnassigned', split.unassigned, TYPE_PARTS);
    renderSplit('splitNew',        split.new_24h,    TYPE_PARTS);

    // RAG banner
    $('ndoRagCell').className = `ndo-rag-banner ndo-rag--${rag.level}`;
    $('ndoRagLabel').textContent = rag.label;
    $('ndoRagReasons').innerHTML = rag.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('');

    renderAging();
    renderOwners();
    renderBreakdowns();
    renderSlackStatus();
    renderTypeFilter();
    renderTickets();
}

const TYPE_PARTS = { Incident: ['Incidents', '#f0806f'], Operations: ['Operations', '#4f8fea'] };

// Small donut + legend under a tile: how its number splits (e.g. incidents vs operations).
// parts maps a key in `keysBy` to [label, colour]; hovering a legend item lists its tickets.
function renderSplit(id, keysBy = {}, parts) {
    const items = Object.entries(parts).map(([k, [label, color]]) => ({ label, color, keys: keysBy[k] || [] }));
    const total = items.reduce((a, it) => a + it.keys.length, 0);
    const C = 2 * Math.PI * 15;
    let offset = 0;
    const arcs = total ? items.filter(it => it.keys.length).map(it => {
        const len = it.keys.length / total * C;
        const arc = `<circle r="15" cx="20" cy="20" fill="none" stroke="${it.color}" stroke-width="7"
            stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
        offset += len;
        return arc;
    }).join('') : '';
    $(id).innerHTML = `
        <svg class="ndo-donut" viewBox="0 0 40 40" aria-hidden="true">
            <circle r="15" cx="20" cy="20" fill="none" stroke="#ebecf0" stroke-width="7"/>
            <g transform="rotate(-90 20 20)">${arcs}</g>
        </svg>
        <div class="ndo-split-legend">${items.map(it => `
            <span class="${it.keys.length ? '' : 'is-zero'}"${it.keys.length ? ` title="${escapeHtml(it.keys.join(', '))}"` : ''}>
                <i style="background:${it.color}"></i><b>${it.keys.length}</b> ${escapeHtml(it.label)}</span>`).join('')}
        </div>`;
}

const URGENT = new Set(['Critical', 'Highest', 'High']);
// Priorities always shown for incidents; Low / Lowest (or any other) appear only when an incident has them
const JIRA_PRIORITIES = ['Critical', 'High', 'Medium'];

// Open tickets by age since created: clustered columns, one group per age bucket with an
// Incidents and an Operations bar side by side on one shared scale; hover a bar for its tickets
function renderAging() {
    // One straight column per age group: operations at the bottom, incidents stacked on top
    const aging = report.aging || {};
    const parts = [['Operations', 'ops', 'Operations'], ['Incident', 'incident', 'Incidents']];
    const total = ty => (aging[ty] || []).reduce((a, b) => a + b.keys.length, 0);
    $('ndoAgeIncidentTotal').textContent = total('Incident');
    $('ndoAgeOpsTotal').textContent = total('Operations');
    const labels = (aging.Incident || aging.Operations || []).map(b => b.label);
    const groups = labels.map((label, i) => {
        const segs = parts.map(([ty, cls, name]) => ({ cls, name, keys: aging[ty]?.[i]?.keys || [] }));
        return { label, segs, n: segs.reduce((a, x) => a + x.keys.length, 0) };
    });
    const max = Math.max(1, ...groups.map(g => g.n));
    $('ndoAgeChart').innerHTML = `<div class="ndo-age-plot">${groups.map(g => `
        <div class="ndo-age-group">
            <div class="ndo-age-bars">
                <div class="ndo-age-col${g.n ? '' : ' is-zero'}">
                    <span class="ndo-age-val">${g.n}</span>
                    <div class="ndo-age-stack" style="height:${g.n ? Math.max(4, g.n / max * 100).toFixed(1) : 0}%">${g.segs.filter(x => x.keys.length).map(x =>
                        `<div class="ndo-age-bar ndo-age-bar--${x.cls}" style="flex:${x.keys.length}"
                            title="${escapeHtml(`${x.name} · ${g.label} (${x.keys.length}): ${x.keys.join(', ')}`)}">${x.keys.length}</div>`).join('')}</div>
                </div>
            </div>
            <span class="ndo-age-label">${escapeHtml(g.label)}</span>
        </div>`).join('')}</div>`;
}

// Open tickets per Requirement Owner, split into in progress / on hold / to do.
// A ticket with two owners counts under both; tickets without one go under "Not set".
const OWNER_STATES = [['active', 'In progress', '#4f8fea'], ['hold', 'On hold', '#f5b25b'], ['todo', 'To do', '#c1c7d0']];
function renderOwners() {
    const rows = new Map();
    (report.tickets || []).forEach(t => {
        const st = ticketState(t.status);
        if (!OWNER_STATES.some(([k]) => k === st)) return;
        (t.owners?.length ? t.owners : ['Not set']).forEach(owner => {
            if (!rows.has(owner)) rows.set(owner, { active: [], hold: [], todo: [] });
            rows.get(owner)[st].push(t.key);
        });
    });
    const total = r => r.active.length + r.hold.length + r.todo.length;
    // Most in progress first; "Not set" always last
    const list = [...rows].sort(([a, x], [b, y]) => (a === 'Not set') - (b === 'Not set')
        || y.active.length - x.active.length || total(y) - total(x) || a.localeCompare(b));
    if (!list.length) { $('ndoOwnerChart').innerHTML = '<div class="ndo-muted">No open tickets.</div>'; return; }
    const cell = (owner, label, keys) => `<td class="${keys.length ? '' : 'is-zero'}"${keys.length
        ? ` title="${escapeHtml(`${owner} · ${label}: ${keys.join(', ')}`)}"` : ''}>${keys.length}</td>`;
    $('ndoOwnerChart').innerHTML = `<table class="ndo-owner-table">
        <thead><tr><th></th>${OWNER_STATES.map(([, label, color]) => `<th><i style="background:${color}"></i>${label}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${list.map(([owner, r]) => `<tr class="${owner === 'Not set' ? 'is-unset' : ''}">
            <th scope="row"><span>${escapeHtml(owner)}</span></th>
            ${OWNER_STATES.map(([k, label]) => cell(owner, label, r[k])).join('')}
            <td class="ndo-owner-total">${total(r)}</td></tr>`).join('')}</tbody></table>`;
}

function ticketState(status) {
    const cls = getStatusClass(status || '');
    if (!status) return 'none';
    if (cls === 'status-done' || cls === 'status-cancelled') return 'done';
    if (cls === 'status-onhold' || cls === 'status-blocked') return 'hold';
    if (cls === 'status-todo' || cls === 'status-backlog')   return 'todo';
    return 'active';
}

function renderBreakdowns() {
    // Today: closed / in progress / on hold, split into incidents and operations.
    // Each number lists its ticket keys on hover.
    const types = ['Incident', 'Operations'];
    const keys  = { done: {}, active: {}, hold: {} };
    types.forEach(ty => Object.keys(keys).forEach(st => { keys[st][ty] = []; }));
    (report.closed_today || []).forEach(t => { if (keys.done[t.type]) keys.done[t.type].push(t.key); });
    (report.tickets || []).forEach(t => {
        const st = ticketState(t.status);
        if (keys[st]?.[t.type]) keys[st][t.type].push(t.key);
    });
    const cell = list => `<td class="${list.length ? '' : 'is-zero'}"${list.length ? ` title="${escapeHtml(list.join(', '))}"` : ''}>${list.length}</td>`;
    $('ndoTodayStats').innerHTML = `<table class="ndo-today-table">
        <thead><tr><th></th><th>Incidents</th><th>Operations</th></tr></thead>
        <tbody>${[
            ['done',   report.is_today ? 'Closed today' : 'Closed that day'],
            ['active', 'In progress'],
            ['hold',   'On hold'],
        ].map(([st, label]) => `<tr class="ndo-today--${st}"><th scope="row"><i aria-hidden="true"></i>${label}</th>${types.map(ty => cell(keys[st][ty])).join('')}</tr>`).join('')}
        </tbody></table>`;

    // Incidents only: operations tickets are reviewed first and become incidents when they matter
    const incidents = report.totals.by_type.Incident ?? 0;
    $('ndoPrioNote').textContent = `· ${incidents} incident${incidents === 1 ? '' : 's'}`;
    // Critical / High / Medium always (zeros greyed), plus any other priority an incident actually has
    const counts = Object.fromEntries(Object.entries(report.breakdown.priority).map(([name, byType]) => [name, byType.Incident || 0]));
    const rows  = [...JIRA_PRIORITIES, ...Object.keys(counts).filter(p => !JIRA_PRIORITIES.includes(p) && counts[p])]
        .map(name => [name, counts[name] || 0]);
    const total = rows.reduce((a, [, n]) => a + n, 0) || 1;
    $('ndoPriorityBars').innerHTML = rows.map(([name, n]) => `
        <div class="ndo-bar-row${n ? '' : ' is-zero'}">
            <span class="ndo-bar-label">${escapeHtml(name)}</span>
            <div class="ndo-bar-track"><div class="ndo-bar-fill ndo-bar--${chipClass(name)}" style="width:${n ? Math.max(2, n / total * 100).toFixed(1) : 0}%"></div></div>
            <span class="ndo-bar-value">${n}</span>
        </div>`).join('');
}

// One line: posted today, or when it posts automatically
function renderSlackStatus() {
    const s   = report.slack;
    const box = $('ndoSlackStatus');
    let cls = '', html;
    if (!s.enabled) {
        cls  = 'ndo-slack-status--off';
        html = '<i class="fas fa-plug"></i> Slack not connected — set <code>SLACK_BOT_TOKEN</code> and <code>SLACK_CHANNEL_ID</code> in <code>web/backend/.env</code>.';
    } else if (s.posted_at) {
        cls  = 'ndo-slack-status--done';
        html = `<i class="fas fa-check-circle"></i> Posted today at ${timeLabel(s.posted_at)}.`;
    } else {
        html = `<i class="fas fa-clock"></i> Posts automatically every day at ${escapeHtml(s.post_time)}.`;
    }
    box.className = `ndo-slack-status ${cls}`;
    box.innerHTML = html;
    $('ndoSlackPost').disabled = !s.enabled;
}

function renderTypeFilter() {
    const options = ['All', ...report.issue_types];
    $('ndoTypeFilter').innerHTML = options.map(t =>
        `<button type="button" data-type="${escapeHtml(t)}" class="${t === typeFilter ? 'active' : ''}">${escapeHtml(t)}</button>`
    ).join('');
}

// Incidents first, then Operations (order of NDO_ISSUE_TYPES); newest ticket number first within each
function ticketOrder(a, b) {
    const rank = t => { const i = report.issue_types.indexOf(t.type); return i === -1 ? report.issue_types.length : i; };
    const num  = t => parseInt(t.key.split('-').pop(), 10) || 0;
    return rank(a) - rank(b) || num(b) - num(a);
}

function renderTickets() {
    const q = $('ndoSearch').value.trim().toLowerCase();
    const list = report.tickets.filter(t =>
        (typeFilter === 'All' || t.type === typeFilter) &&
        (!q || [t.key, t.summary, t.assignee || '', t.status].some(v => v.toLowerCase().includes(q)))
    ).sort(ticketOrder);
    $('ndoTicketCount').textContent = list.length;
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    ticketPage = Math.min(Math.max(1, ticketPage), pages);
    const rows = list.slice((ticketPage - 1) * PAGE_SIZE, ticketPage * PAGE_SIZE);
    renderPager(list.length, pages);
    $('ndoTicketBody').innerHTML = rows.length
        ? rows.map(t => `<tr>
            <td>${keyLink(t)}</td>
            <td>${chip(t.type, 'type-')}</td>
            <td>${escapeHtml(t.summary)}</td>
            <td><span class="status-pill ${getStatusClass(t.status)}">${escapeHtml(t.status)}</span></td>
            <td>${chip(t.priority)}</td>
            <td>${t.severity !== 'Not set' ? chip(t.severity) : '<span class="ndo-muted">—</span>'}</td>
            <td>${t.assignee ? escapeHtml(t.assignee) : '<span class="ndo-unassigned">Unassigned</span>'}</td>
            <td>${t.age_days ?? '–'}d</td>
          </tr>`).join('')
        : '<tr><td colspan="8" class="ndo-empty">No tickets match</td></tr>';
}

// "Showing 16–30 of 58" · ‹ 1 2 3 4 › (page numbers around the current one)
function renderPager(total, pages) {
    const pager = $('ndoPager');
    if (pages <= 1) { pager.innerHTML = total ? `<span class="ndo-pager-info">Showing all ${total}</span>` : ''; return; }
    const from = (ticketPage - 1) * PAGE_SIZE + 1;
    const to = Math.min(ticketPage * PAGE_SIZE, total);
    const nums = [];
    for (let p = 1; p <= pages; p++) {
        if (p === 1 || p === pages || Math.abs(p - ticketPage) <= 1) nums.push(p);
        else if (nums[nums.length - 1] !== '…') nums.push('…');
    }
    const btn = (p, label, disabled = false, active = false) =>
        `<button type="button" data-page="${p}" class="${active ? 'active' : ''}"${disabled ? ' disabled' : ''}>${label}</button>`;
    pager.innerHTML = `<span class="ndo-pager-info">Showing ${from}–${to} of ${total}</span>
        <div class="ndo-pager-btns">
            ${btn(ticketPage - 1, '<i class="fas fa-chevron-left"></i>', ticketPage === 1)}
            ${nums.map(p => p === '…' ? '<span class="ndo-pager-gap">…</span>' : btn(p, p, false, p === ticketPage)).join('')}
            ${btn(ticketPage + 1, '<i class="fas fa-chevron-right"></i>', ticketPage === pages)}
        </div>`;
}

// ── Actions ──────────────────────────────────────────────────
let toastTimer;
function toast(message, isError = false) {
    const el = $('ndoToast');
    el.textContent = message;
    el.classList.toggle('ndo-toast--error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 7000 : 3500);
}

async function withBusy(button, fn) {
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add('is-busy');
    try { await fn(); }
    catch (err) { toast(err.message, true); }
    finally {
        button.classList.remove('is-busy');
        button.disabled = false;
        if (report) renderSlackStatus();
    }
}

function bindEvents() {
    // Highlights collapse (same behaviour as the sprint dashboard)
    $('highlightsToggle').addEventListener('click', e => {
        if (e.target.closest('select')) return;
        const collapsed = $('highlightsBody').classList.toggle('collapsed');
        $('highlightsToggleBtn').classList.toggle('collapsed', collapsed);
    });

    const refreshBtn = $('refreshBtn');
    refreshBtn.addEventListener('click', async () => {
        if (refreshBtn.classList.contains('spinning')) return;
        refreshBtn.classList.add('spinning');
        try { await loadReport(true); }
        finally { setTimeout(() => refreshBtn.classList.remove('spinning'), 500); }
    });


    // Slack
    $('ndoSlackPost').addEventListener('click', e => withBusy(e.currentTarget, async () => {
        const already = !!report?.slack?.posted_at;
        if (!confirm(already ? 'Today\'s update was already posted. Post it again?' : 'Post today\'s update to the Slack channel?')) return;
        const { status, data } = await api('/slack/post', { method: 'POST', body: JSON.stringify({ force: already }) });
        await loadReport();
        toast(status === 409 ? data.message : 'Daily update posted to Slack', status === 409);
    }));
    initPreviewModal();

    // Tickets table
    $('ndoSearch').addEventListener('input', () => { ticketPage = 1; if (report) renderTickets(); });
    $('ndoPager').addEventListener('click', e => {
        const btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        ticketPage = Number(btn.dataset.page);
        renderTickets();
    });
    $('ndoTypeFilter').addEventListener('click', e => {
        const btn = e.target.closest('button[data-type]');
        if (!btn) return;
        typeFilter = btn.dataset.type;
        ticketPage = 1;
        renderTypeFilter();
        renderTickets();
    });
}

// ── Slack image preview modal ────────────────────────────────
function initPreviewModal() {
    const modal = $('ndoModal'), img = $('ndoModalImg'), body = $('ndoModalBody');
    let lastFocus = null;

    const close = () => {
        modal.hidden = true;
        document.body.classList.remove('ndo-modal-open');
        lastFocus?.focus();
    };
    const open = () => {
        lastFocus = document.activeElement;
        const src = `${NDO_API}/snapshot.png?t=${Date.now()}${VIEW_DAY ? `&day=${encodeURIComponent(VIEW_DAY)}` : ''}`;
        img.hidden = true;
        body.classList.remove('is-zoomed');
        $('ndoModalZoom').innerHTML = '<i class="fas fa-search-plus"></i> Actual size';
        $('ndoModalLoading').hidden = false;
        $('ndoModalLoading').innerHTML = '<div class="spinner"></div> Rendering the dashboard image…';
        $('ndoModalOpen').href = src;
        img.onload  = () => { $('ndoModalLoading').hidden = true; img.hidden = false; };
        img.onerror = () => { $('ndoModalLoading').innerHTML = '<i class="fas fa-exclamation-triangle"></i> Could not render the image — check the server log.'; };
        img.src = src;
        modal.hidden = false;
        document.body.classList.add('ndo-modal-open');
        $('ndoModalClose').focus();
    };
    const toggleZoom = () => {
        const zoomed = body.classList.toggle('is-zoomed');
        $('ndoModalZoom').innerHTML = zoomed
            ? '<i class="fas fa-search-minus"></i> Fit to screen'
            : '<i class="fas fa-search-plus"></i> Actual size';
    };

    $('ndoPreviewBtn').addEventListener('click', open);
    $('ndoModalClose').addEventListener('click', close);
    $('ndoModalZoom').addEventListener('click', toggleZoom);
    img.addEventListener('click', toggleZoom);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
}

document.addEventListener('DOMContentLoaded', () => {
    // ?snapshot=1 → clean, non-interactive view used for the Slack image
    if (new URLSearchParams(location.search).has('snapshot')) document.body.classList.add('ndo-snapshot');
    bindEvents();
    loadReport();
});
