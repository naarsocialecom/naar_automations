// Scheduler: list every scheduled job; change its time or switch it on/off.
import { escapeHtml } from '/static/js/helpers.js';

const $ = id => document.getElementById(id);
let TZ = 'Asia/Kolkata';

function when(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    const day = x => x.toLocaleDateString('en-CA', { timeZone: TZ });
    const today = new Date();
    const label = day(d) === day(today) ? 'Today'
        : day(d) === day(new Date(today.getTime() + 864e5)) ? 'Tomorrow'
        : day(d) === day(new Date(today.getTime() - 864e5)) ? 'Yesterday'
        : d.toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
    return `${label}, ${d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}`;
}

const RESULT = {
    ok:       ['ok', 'check-circle', 'Done'],
    failed:   ['fail', 'times-circle', 'Failed'],
    running:  ['run', 'spinner fa-spin', 'Running'],
    starting: ['run', 'spinner fa-spin', 'Starting'],
};

function lastRun(run) {
    if (!run?.started_at) return '<span class="sch-muted">Not run yet</span>';
    const [cls, icon, label] = RESULT[run.status] || ['muted', 'question-circle', run.status || '–'];
    return `<div>${when(run.started_at)}</div><span class="sch-chip sch-chip--${cls}"><i class="fas fa-${icon}"></i> ${label}</span>`;
}

function render(data) {
    TZ = data.timezone || TZ;
    $('schTzName').textContent = TZ;
    $('schTz').textContent = `Times in ${data.tz_abbr || TZ}`;
    $('schOff').hidden = data.scheduler_running;
    $('schRows').innerHTML = data.jobs.map(j => `
        <tr data-id="${escapeHtml(j.id)}" class="${j.enabled ? '' : 'is-off'}">
            <td class="sch-job">
                <span class="sch-kind sch-kind--${j.kind.toLowerCase()}">${escapeHtml(j.kind)}</span>
                <a class="sch-name" href="${escapeHtml(j.page)}">${escapeHtml(j.name)}</a>
                <div class="sch-desc">${escapeHtml(j.description)}</div>
                ${j.log.length ? `<details class="sch-log"><summary>Last output</summary><pre>${escapeHtml(j.log.join('\n'))}</pre></details>` : ''}
            </td>
            <td>
                <div class="sch-time">
                    <input type="time" value="${escapeHtml(j.time)}" aria-label="Time for ${escapeHtml(j.name)}">
                    <button type="button" class="sch-save" hidden>Save</button>
                </div>
                <div class="sch-muted">${j.time === j.default_time ? 'Default' : `Default ${escapeHtml(j.default_time)}`}</div>
            </td>
            <td><label class="sch-switch" title="${j.enabled ? 'On: runs every day' : 'Off: does not run'}">
                <input type="checkbox" ${j.enabled ? 'checked' : ''}><span></span></label></td>
            <td>${j.enabled ? `<b>${when(j.next_run)}</b>` : '<span class="sch-chip sch-chip--muted"><i class="fas fa-pause"></i> Off</span>'}</td>
            <td>${lastRun(j.last_run)}</td>
            <td><a class="sch-open" href="${escapeHtml(j.page)}" title="Open its page"><i class="fas fa-arrow-right"></i></a></td>
        </tr>`).join('');

    document.querySelectorAll('#schRows tr[data-id]').forEach(row => {
        const input = row.querySelector('input[type=time]');
        const save = row.querySelector('.sch-save');
        const original = input.value;
        input.addEventListener('input', () => { save.hidden = !input.value || input.value === original; });
        save.addEventListener('click', () => update(row.dataset.id, { time: input.value }, `Run time changed to ${input.value}`));
        row.querySelector('.sch-switch input').addEventListener('change', e => {
            const on = e.target.checked;
            if (!on && !confirm('Switch this job off? It will not run until you switch it on again.')) { e.target.checked = true; return; }
            update(row.dataset.id, { enabled: on }, on ? 'Switched on' : 'Switched off');
        });
    });
}

function showError(msg) { $('schError').textContent = msg; $('schError').hidden = !msg; }

async function update(id, body, done) {
    try {
        const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Naar-Request': '1' }, body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Could not save (${res.status})`);
        render(data);
        showError('');
        flash(done);
    } catch (e) { showError(e.message); load(); }
}

function flash(text) {
    const el = document.createElement('div');
    el.className = 'sch-toast'; el.textContent = `✓ ${text}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

async function load() {
    const btn = $('schRefresh');
    btn.classList.add('is-spinning');
    try {
        const res = await fetch('/api/schedules', { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 401 ? 'Your session ended — reload the page to sign in again.' : `Could not load (${res.status})`);
        render(await res.json());
        showError('');
    } catch (e) { showError(e.message); }
    finally { btn.classList.remove('is-spinning'); }
}

$('schRefresh').addEventListener('click', load);
load();
setInterval(load, 60000);
