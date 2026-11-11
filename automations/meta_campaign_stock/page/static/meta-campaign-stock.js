// Meta campaign stock report page: run history (run-history.json), next run, latest
// picture and Excel file, plus "Test run" / "Send to Slack" buttons that start the job
// in the background and follow its output until it finishes.

const API = '/api/automations/meta-campaign-stock';
const $ = id => document.getElementById(id);

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = n => (n == null ? '–' : Number(n).toLocaleString('en-IN'));

let TZ = 'Asia/Kolkata';
let lastPostedChannels = '';
let pollTimer = null;
let wasRunning = false;

// "Today, 11:00" / "Yesterday, 11:00" / "4 Nov, 11:00" in the report time zone
function when(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    const day = x => x.toLocaleDateString('en-CA', { timeZone: TZ });
    const time = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const today = new Date();
    const yesterday = new Date(today.getTime() - 864e5);
    const tomorrow = new Date(today.getTime() + 864e5);
    const label = day(d) === day(today) ? 'Today'
        : day(d) === day(yesterday) ? 'Yesterday'
        : day(d) === day(tomorrow) ? 'Tomorrow'
        : d.toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
    return `${label}, ${time}`;
}

function fromNow(iso) {
    const mins = Math.round((new Date(iso) - Date.now()) / 60000);
    if (mins < 60) return `in ${Math.max(mins, 0)} min`;
    const h = Math.floor(mins / 60);
    return `in ${h} h ${mins % 60} min`;
}

// Result of one run: posted / test run / not posted / failed
function result(run) {
    if (!run.ok) return { cls: 'fail', icon: 'times-circle', label: 'Failed', tip: run.error || '' };
    if (run.dryRun) return { cls: 'test', icon: 'flask', label: 'Test run', tip: 'DRY_RUN: files built, nothing sent' };
    if (run.posts?.length) return { cls: 'ok', icon: 'check-circle', label: 'Posted', tip: run.posts.map(p => p.channel).join(', ') };
    return { cls: 'test', icon: 'minus-circle', label: 'Not posted', tip: 'Finished without a Slack post' };
}

const chip = r => `<span class="auto-chip auto-chip--${r.cls}" title="${escapeHtml(r.tip)}"><i class="fas fa-${r.icon}"></i> ${r.label}</span>`;

function render(data) {
    TZ = data.timezone || TZ;
    $('autoSchedule').textContent = `Daily · ${data.run_time_label}`;
    const runs = data.runs || [];
    const last = runs[0];
    // Real (non-test) runs say where it was posted; a test run in between doesn't change that
    const lastPosted = runs.find(r => r.ok && !r.dryRun && r.posts?.length);

    // Last run
    if (last) {
        const r = result(last);
        $('autoLastRun').textContent = when(last.finishedAt || last.startedAt);
        $('autoLastRunNote').innerHTML = chip(r) + (r.cls === 'fail' ? `<div class="auto-fail">${escapeHtml(last.error)}</div>` : '')
            + (last.metaError ? `<div class="auto-fail">Meta: ${escapeHtml(last.metaError)}</div>` : '');
    } else {
        $('autoLastRun').textContent = 'Not run yet';
        $('autoLastRunNote').textContent = 'The first run will show here.';
    }

    // Next run
    $('autoNextRun').textContent = when(data.next_run);
    $('autoNextRunNote').textContent = fromNow(data.next_run);

    // Posted to
    lastPostedChannels = lastPosted ? lastPosted.posts.map(p => p.channel).join(', ') : '';
    if (lastPosted) {
        const channels = lastPosted.posts.map(p => p.channel);
        $('autoPosted').textContent = channels.join(', ');
        const deleted = lastPosted.posts.reduce((a, p) => a + (p.deleted || 0), 0);
        const warning = lastPosted.posts.find(p => p.warning)?.warning;
        $('autoPostedNote').textContent = warning ? `Warning: ${warning}`
            : `${when(lastPosted.finishedAt)} · ${deleted} older post${deleted === 1 ? '' : 's'} removed`;
    } else {
        $('autoPosted').textContent = '–';
        $('autoPostedNote').textContent = 'No Slack post yet';
    }

    // Latest numbers (from the newest successful run)
    const s = runs.find(r => r.ok && r.stats)?.stats;
    $('autoStats').innerHTML = s ? [
        ['Active campaigns', s.campaigns, ''],
        ['Stores matched', s.stores, ''],
        [`Below ${s.threshold}`, s.belowThreshold, 'warn'],
        ['Out of stock', s.outOfStock, 'crit'],
    ].map(([label, n, cls]) => `<div class="auto-stat auto-stat--${cls}"><b>${num(n)}</b><span>${label}</span></div>`).join('')
        : '<span class="auto-muted">No numbers yet</span>';

    // Picture
    if (data.image) {
        const src = `${API}/image.png?v=${encodeURIComponent(data.image.updated_at)}`;
        $('autoImageBox').innerHTML = `<a href="${src}" target="_blank" rel="noopener" title="Open full size">
            <img class="auto-image" src="${src}" alt="Latest Meta campaign stock report"></a>`;
        $('autoImageMeta').textContent = `Created ${when(data.image.updated_at)}`;
    } else {
        $('autoImageBox').innerHTML = '<div class="auto-empty">No report picture yet.</div>';
        $('autoImageMeta').textContent = '';
    }

    // Excel
    $('autoExcelBtn').hidden = !data.excel;
    $('autoExcelMeta').textContent = data.excel ? `${data.excel.name} · ${when(data.excel.updated_at)}` : 'No Excel file yet.';

    // WhatsApp preview: one message per campaign store, click to read it
    const wa = data.whatsapp;
    if (wa?.sellers?.length) {
        const missing = wa.sellers.length - wa.withNumber;
        $('autoWaMeta').textContent = `${wa.sellers.length} seller${wa.sellers.length === 1 ? '' : 's'} would get a message · `
            + `${wa.withNumber} with a WhatsApp number${missing ? ` · ${missing} without` : ''} · built ${when(wa.generatedAt)}. Click a seller to read the message.`;
        $('autoWaList').innerHTML = wa.sellers.map(s => `
            <details class="auto-wa-item">
                <summary>
                    <b>${escapeHtml(s.storeName)}</b>
                    <span class="auto-wa-phone${s.phone ? '' : ' is-missing'}">${s.phone ? `<i class="fab fa-whatsapp"></i> ${escapeHtml(s.phone)}` : escapeHtml(s.problem)}</span>
                    <span class="auto-wa-count">${s.productCount} low-stock product${s.productCount === 1 ? '' : 's'}</span>
                </summary>
                <div class="auto-wa-msg">${s.attachment ? `<div class="auto-wa-file"><i class="fas fa-file-pdf"></i>
                    <span><b>${escapeHtml(s.attachment.fileName)}</b><br>${s.attachment.productCount} products · PDF</span></div>` : ''}${escapeHtml(s.message)}</div>
                ${s.attachment ? `<a class="auto-wa-link" href="${API}/seller-pdf/${encodeURIComponent(s.attachment.file)}" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> View the PDF this seller would get</a>` : ''}
            </details>`).join('');
    } else {
        $('autoWaMeta').textContent = wa ? 'No campaign store has products below the limit, so no messages.' : 'Run a test run to build the preview.';
        $('autoWaList').innerHTML = '';
    }

    // History
    $('autoRuns').innerHTML = runs.length ? runs.slice(0, 10).map(run => {
        const st = run.stats || {};
        const by = run.trigger === 'dashboard' ? '<span class="auto-by" title="Started from this page">button</span>' : '';
        return `<tr><td>${when(run.finishedAt || run.startedAt)} ${by}</td><td>${chip(result(run))}</td>
            <td>${num(st.campaigns)}</td><td>${num(st.belowThreshold)}</td><td>${num(st.outOfStock)}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="auto-empty">No runs yet.</td></tr>';
}

// Run panel: buttons off while a run is going; its output is shown live
function renderRun(data) {
    const running = !!data.running;
    $('autoRunDry').disabled = running;
    $('autoRunSend').disabled = running;
    const log = data.run_log;
    $('autoRunStatus').hidden = !running && !log;
    // Output open while running; folded away once it's done
    if (running) $('autoRunOutput').open = true;
    else if (wasRunning) $('autoRunOutput').open = false;
    wasRunning = running;
    if (running) {
        $('autoRunState').innerHTML = '<span class="spinner-dot"></span> Running… this page updates by itself.';
    } else if (log) {
        const failed = log.lines.some(l => l.includes('Export failed'));
        const busy = log.lines.some(l => l.includes('already in progress'));
        $('autoRunState').innerHTML = busy ? '<i class="fas fa-hourglass-half"></i> Another run was in progress, so this one did not start.'
            : failed ? '<i class="fas fa-times-circle" style="color:#ae2a19"></i> Last button run failed — see the output below.'
            : `<i class="fas fa-check-circle" style="color:#216e4e"></i> Last button run finished · ${when(log.updated_at)}`;
    }
    if (log) {
        const box = $('autoRunLog');
        box.textContent = log.lines.join('\n');
        box.scrollTop = box.scrollHeight;
    }
    // Keep checking while it runs; one last refresh when it ends
    clearTimeout(pollTimer);
    if (running) pollTimer = setTimeout(load, 3000);
}

async function startRun(mode) {
    if (mode === 'send') {
        const where = lastPostedChannels ? ` (${lastPostedChannels})` : '';
        if (!confirm(`Post the Meta campaign stock report to Slack now${where}?\n\nThe previous report post in that channel is removed.`)) return;
    }
    $('autoRunDry').disabled = $('autoRunSend').disabled = true;
    try {
        const res = await fetch(`${API}/run`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Could not start the run (${res.status})`);
    } catch (e) {
        $('autoError').textContent = e.message;
        $('autoError').hidden = false;
    }
    load();
}

async function load() {
    const btn = $('autoRefresh');
    btn.classList.add('is-spinning');
    try {
        const res = await fetch(API, { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 401 ? 'Your session ended — reload the page to sign in again.' : `Could not load status (${res.status})`);
        const data = await res.json();
        render(data);
        renderRun(data);
        $('autoError').hidden = true;
    } catch (e) {
        $('autoError').textContent = e.message;
        $('autoError').hidden = false;
    } finally {
        btn.classList.remove('is-spinning');
    }
}

$('autoRefresh').addEventListener('click', load);
$('autoRunDry').addEventListener('click', () => startRun('dry'));
$('autoRunSend').addEventListener('click', () => startRun('send'));
load();
