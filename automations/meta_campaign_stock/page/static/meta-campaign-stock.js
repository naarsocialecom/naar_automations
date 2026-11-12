// Meta Campaign Stock dashboard: campaigns, stores and low-stock products from the latest run
// (dashboard.json), the Excel file and Slack picture, the seller emails, and "Test run" /
// "Send to Slack" buttons that start the job in the background and follow its output.

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

const when_ = iso => when(iso);

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

const PAGE_SIZE = 15;
let products = [];
let productPage = 1;
const money = (n, cur) => n == null ? '–' : `${cur === 'INR' ? '₹' : cur ? cur + ' ' : ''}${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const compact = n => n == null ? '–' : Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const OBJECTIVES = { OUTCOME_SALES: 'Sales', OUTCOME_TRAFFIC: 'Traffic', OUTCOME_AWARENESS: 'Awareness', OUTCOME_ENGAGEMENT: 'Engagement', OUTCOME_LEADS: 'Leads', OUTCOME_APP_PROMOTION: 'App promotion' };
const objective = o => OBJECTIVES[o] || (o ? o.replace(/^OUTCOME_/, '').toLowerCase().replace(/^./, c => c.toUpperCase()) : '–');
const since = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }) : '–';

function renderStrip(data) {
    const runs = data.runs || [];
    const last = runs[0];
    const lastPosted = runs.find(r => r.ok && !r.dryRun && r.posts?.length);
    lastPostedChannels = lastPosted ? lastPosted.posts.map(p => p.channel).join(', ') : '';
    const d = data.dashboard;
    const parts = [];
    if (d) parts.push(`<span><i class="fas fa-database"></i> Data from <b>${when(d.generatedAt)}</b></span>`);
    if (last) parts.push(`<span>Last run ${chip(result(last))}</span>`);
    parts.push(data.next_run ? `<span><i class="fas fa-clock"></i> Next run <b>${when(data.next_run)}</b> · ${fromNow(data.next_run)}</span>`
        : '<span><i class="fas fa-pause"></i> Daily run switched off</span>');
    if (lastPosted) parts.push(`<span><i class="fab fa-slack"></i> Posted ${when(lastPosted.finishedAt)}</span>`);
    $('mcsStrip').innerHTML = parts.join('<i class="mcs-dot"></i>');
}

function tile(icon, cls, value, label, note = '') {
    return `<div class="mcs-tile mcs-tile--${cls}"><span class="mcs-tile-icon"><i class="fas fa-${icon}"></i></span>
        <div><div class="mcs-tile-value">${value}</div><div class="mcs-tile-label">${label}</div>${note ? `<div class="mcs-tile-note">${note}</div>` : ''}</div></div>`;
}

function renderDashboard(d) {
    $('mcsEmpty').hidden = !!d;
    $('mcsDash').hidden = !d;
    if (!d) return;
    const t = d.totals;
    $('mcsTiles').innerHTML = [
        tile('bullhorn', 'blue', num(t.campaigns), 'Active campaigns', `${num(t.matchedCampaigns)} linked${t.unmatchedCampaigns ? ` · ${num(t.unmatchedCampaigns)} not linked` : ''}`),
        tile('store', 'violet', num(t.stores), 'Stores in campaigns'),
        tile('boxes', 'teal', num(t.checked), 'Products checked'),
        tile('exclamation-triangle', 'amber', num(t.below), `Below ${d.threshold}`),
        tile('ban', 'red', num(t.out), 'Out of stock'),
        ...(t.spend7d != null ? [tile('rupee-sign', 'green', `<span title="${money(t.spend7d, t.currency)}">${t.currency === 'INR' ? '₹' : ''}${compact(t.spend7d)}</span>`, 'Spend · last 7 days', `${compact(t.clicks7d)} clicks`)] : []),
    ].join('');
    if (d.meta?.error) $('mcsTiles').insertAdjacentHTML('beforeend', `<div class="mcs-meta-error"><i class="fas fa-exclamation-circle"></i> Meta: ${escapeHtml(d.meta.error)}</div>`);

    // Stock health bar: out / low / fine
    const total = Math.max(1, t.checked);
    const seg = [['out', 'Out of stock', t.out], ['low', `Low (1 to ${d.threshold - 1} left)`, t.low], ['ok', `Fine (${d.threshold}+)`, t.healthy]];
    $('mcsBar').innerHTML = seg.filter(([, , n]) => n).map(([k, label, n]) =>
        `<span class="mcs-bar-${k}" style="flex:${n}" title="${label}: ${num(n)}"></span>`).join('');
    $('mcsLegend').innerHTML = seg.map(([k, label, n]) =>
        `<span><i class="mcs-bar-${k}"></i>${label} <b>${num(n)}</b> <em>${Math.round(n / total * 100)}%</em></span>`).join('');
    $('mcsHealthNote').textContent = `${num(t.checked)} products in ${num(t.stores)} stores`;

    // Campaigns
    const anyInsights = d.campaigns.some(c => c.insights);
    $('mcsCampaignNote').textContent = anyInsights ? 'results: last 7 days' : '';
    $('mcsCampaigns').innerHTML = `<thead><tr><th>Campaign</th><th>Objective</th><th>Since</th><th>Budget</th>
        ${anyInsights ? '<th class="r">Spend</th><th class="r">Clicks</th>' : ''}<th>Stores</th><th class="r">Products</th><th class="r">Below ${d.threshold}</th></tr></thead>
        <tbody>${d.campaigns.map(c => `<tr class="${c.matched ? '' : 'is-unlinked'}">
            <td class="mcs-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</td>
            <td>${escapeHtml(objective(c.objective))}</td>
            <td class="mcs-nowrap">${since(c.startTime)}</td>
            <td class="mcs-nowrap">${c.dailyBudget != null ? `${money(c.dailyBudget, c.currency)}/day` : c.lifetimeBudget != null ? `${money(c.lifetimeBudget, c.currency)} total` : '–'}</td>
            ${anyInsights ? `<td class="r">${c.insights ? money(c.insights.spend, c.currency) : '–'}</td><td class="r">${c.insights ? num(c.insights.clicks) : '–'}</td>` : ''}
            <td class="mcs-stores">${c.matched ? c.stores.map(s => `<span class="mcs-store-chip" title="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join(' ') : '<span class="auto-muted">not linked to a store</span>'}</td>
            <td class="r">${c.matched ? num(c.products) : '–'}</td>
            <td class="r">${c.matched ? `<span class="mcs-below ${c.below ? 'is-low' : 'is-ok'}">${c.below ? num(c.below) : 'OK'}</span>` : '–'}</td>
        </tr>`).join('')}</tbody>`;

    // Stores
    const maxLow = Math.max(1, ...d.stores.map(s => s.low));
    $('mcsStores').innerHTML = d.stores.length ? d.stores.map(s => `<div class="mcs-store">
        <div class="mcs-store-top"><b title="${escapeHtml(s.campaigns.join(', '))}">${escapeHtml(s.name)}</b><span>${num(s.low)} <em>of ${num(s.products)}</em></span></div>
        <div class="mcs-store-track"><span class="mcs-bar-out" style="width:${s.out / maxLow * 100}%"></span><span class="mcs-bar-low" style="width:${(s.low - s.out) / maxLow * 100}%"></span></div>
        <div class="mcs-store-note">${num(s.out)} out of stock · ${num(s.low - s.out)} low</div>
    </div>`).join('') : '<div class="auto-empty">No campaign stores.</div>';

    // Products (search, store filter, pages)
    products = d.products;
    const stores = [...new Set(products.map(p => p.store))].sort();
    const sel = $('mcsStoreFilter');
    const keep = sel.value;
    sel.innerHTML = '<option value="">All stores</option>' + stores.map(s => `<option${s === keep ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
    renderProducts();
}

function renderProducts() {
    const q = $('mcsSearch').value.trim().toLowerCase();
    const store = $('mcsStoreFilter').value;
    const list = products.filter(p => (!store || p.store === store) && (!q || p.product.toLowerCase().includes(q) || p.store.toLowerCase().includes(q)));
    $('mcsProductCount').textContent = num(list.length);
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    productPage = Math.min(productPage, pages);
    const rows = list.slice((productPage - 1) * PAGE_SIZE, productPage * PAGE_SIZE);
    $('mcsProducts').innerHTML = `<thead><tr><th>Store</th><th>Product</th><th class="r">Stock</th></tr></thead><tbody>${rows.length
        ? rows.map(p => `<tr><td class="mcs-nowrap">${escapeHtml(p.store)}</td><td>${escapeHtml(p.product)}</td>
            <td class="r"><span class="mcs-stock ${p.stock <= 0 ? 'is-out' : 'is-low'}">${p.stock <= 0 ? 'Out of stock' : `${p.stock} left`}</span></td></tr>`).join('')
        : '<tr><td colspan="3" class="auto-empty">No products match.</td></tr>'}</tbody>`;
    $('mcsPager').innerHTML = pages > 1 ? `<span>Showing ${(productPage - 1) * PAGE_SIZE + 1}–${Math.min(productPage * PAGE_SIZE, list.length)} of ${num(list.length)}</span>
        <span><button class="btn btn--secondary btn--sm" data-p="${productPage - 1}" ${productPage === 1 ? 'disabled' : ''}>Previous</button>
        <button class="btn btn--secondary btn--sm" data-p="${productPage + 1}" ${productPage === pages ? 'disabled' : ''}>Next</button></span>` : '';
    $('mcsPager').querySelectorAll('button[data-p]').forEach(b => b.addEventListener('click', () => { productPage = Number(b.dataset.p); renderProducts(); }));
}

// Seller emails Off / Test / On and the test inbox (saved on the server; the next daily run uses them)
let mailSettings = null;
let pendingTest = false;     // Test clicked, waiting for an address
function renderMailSwitch(settings) {
    if (!settings || !$('mcsMailSwitch')) return;
    mailSettings = settings;
    const { seller_email_mode: mode, email, test_to: testTo } = settings;
    const shown = pendingTest ? 'test' : mode;
    $('mcsMailSwitch').querySelectorAll('button').forEach(b => {
        const active = b.dataset.mode === shown;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-checked', active);
        b.disabled = b.dataset.mode !== 'off' && !email.ready;
        b.title = b.disabled ? 'Email is not set up yet (GRAPH_* and SELLER_EMAIL_FROM in .env)' : '';
    });
    const changed = settings.updated_at && !pendingTest ? ` · changed ${when_(settings.updated_at)}` : '';
    $('mcsMailNote').innerHTML = (pendingTest
        ? `<i class="fas fa-flask"></i> <b>Test</b>: type where the test emails should go (any @${escapeHtml(email.domain)} address) and press Save.`
        : {
            off:  '<i class="fas fa-pause-circle"></i> <b>Off</b>: nothing is sent. The emails below are a preview.',
            test: `<i class="fas fa-flask"></i> <b>Test</b>: each daily run sends every seller's email to <b>${escapeHtml(testTo.join(', '))}</b> only.`,
            on:   `<i class="fas fa-paper-plane"></i> <b>On</b>: each daily run emails every seller their own list (once a day), from ${escapeHtml(email.from)}.`,
        }[mode]) + `<span class="auto-muted">${changed}</span>` + (email.ready ? '' : ' <span class="auto-muted">· Email isn\'t set up yet, so only Off is possible.</span>');
    $('mcsMailNote').className = `mcs-mail-note is-${shown}`;
    $('mcsTestTo').hidden = shown !== 'test';
    if (document.activeElement !== $('mcsTestToInput')) $('mcsTestToInput').value = testTo.join(', ');
}

async function saveMail(body) {
    try {
        const res = await fetch(`${API}/settings`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Naar-Request': '1' }, body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Could not save (${res.status})`);
        pendingTest = false;
        renderMailSwitch(data);
        $('autoError').hidden = true;
        return true;
    } catch (e) {
        $('autoError').textContent = e.message;
        $('autoError').hidden = false;
        return false;
    }
}

// "Send test emails now": saves the typed address (and Test), then sends every seller's email there at once
async function sendTestNow() {
    const btn = $('mcsTestNow');
    const out = $('mcsTestResult');
    const typed = $('mcsTestToInput').value.trim();
    if (!typed) { $('mcsTestToInput').focus(); return; }
    if (typed !== (mailSettings?.test_to || []).join(', ') || mailSettings?.seller_email_mode !== 'test') {
        if (!(await saveMail({ seller_email_mode: 'test', test_to: typed }))) return;
    }
    const count = document.querySelectorAll('#autoMailList details').length;
    if (!confirm(`Send all ${count} seller email${count === 1 ? '' : 's'} to ${mailSettings.test_to.join(', ')} now?\n\nNo seller receives anything.`)) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
    out.hidden = false;
    out.className = 'mcs-test-result';
    out.textContent = 'Sending the test emails… (a few seconds per seller)';
    try {
        const res = await fetch(`${API}/email-test`, { method: 'POST', headers: { 'X-Naar-Request': '1' } });
        const r = await res.json().catch(() => ({}));
        if (r.sent != null) {
            out.className = `mcs-test-result ${r.failed ? 'is-fail' : 'is-ok'}`;
            out.innerHTML = `${r.failed ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-check-circle"></i>'} `
                + `<b>${r.sent} sent</b>${r.failed ? `, ${r.failed} failed` : ''} to ${escapeHtml(r.to.join(', '))} · emails as built ${when_(r.builtAt)}. Check the inbox (and spam the first time).`
                + (r.errors?.length ? `<br>${r.errors.map(escapeHtml).join('<br>')}` : '');
        } else {
            throw new Error(r.error || `Could not send (${res.status})`);
        }
    } catch (e) {
        out.className = 'mcs-test-result is-fail';
        out.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(e.message)}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send test emails now';
    }
}

function setMailMode(mode) {
    if (!mailSettings) return;
    if (mode === 'test') {
        // First time (or no address yet): ask for the address before switching
        if (!mailSettings.test_to.length) { pendingTest = true; renderMailSwitch(mailSettings); $('mcsTestToInput').focus(); return; }
        if (mailSettings.seller_email_mode === 'test') return;
        if (!confirm(`Turn seller emails to TEST?\n\nFrom the next daily run, every seller's email goes to ${mailSettings.test_to.join(', ')} only.`)) return;
        return saveMail({ seller_email_mode: 'test' });
    }
    pendingTest = false;
    if (mode === mailSettings.seller_email_mode) return renderMailSwitch(mailSettings);
    if (mode === 'on' && !confirm('Turn seller emails ON?\n\nFrom the next daily run, every campaign seller gets their own low-stock email.')) return;
    saveMail({ seller_email_mode: mode });
}

// Slack daily report card: schedule, last post, Preview (pop-up) / Excel / Test run / Post now
let imageSrc = null;
function renderSlackCard(data) {
    const runs = data.runs || [];
    const lastPosted = runs.find(r => r.ok && !r.dryRun && r.posts?.length);
    const viewer = !$('autoRunSend');
    const schedule = data.next_run
        ? `<i class="fas fa-clock"></i> Posts automatically every day at ${escapeHtml(data.run_time_label)}${viewer ? '' : ' · <a href="/scheduler">change</a>'}`
        : `<i class="fas fa-pause"></i> Daily post is switched off${viewer ? '' : ' · <a href="/scheduler">Scheduler</a>'}`;
    const posted = lastPosted ? ` <span class="mcs-sep">·</span> <i class="fas fa-check-circle mcs-ok"></i> Last posted ${when(lastPosted.finishedAt)}` : ' <span class="mcs-sep">·</span> Not posted yet';
    $('mcsSlackStatus').innerHTML = schedule + posted;
    imageSrc = data.image ? `${API}/image.png?v=${encodeURIComponent(data.image.updated_at)}` : null;
    $('mcsPreviewBtn').disabled = !imageSrc;
    $('mcsPreviewBtn').title = imageSrc ? `The picture posted to Slack · ${when(data.image.updated_at)}` : 'No picture yet. Press Test run.';
    $('autoExcelBtn').hidden = !data.excel;
    if (data.excel) $('autoExcelBtn').title = `${data.excel.name} · ${when(data.excel.updated_at)}`;
}

function openPreview() {
    if (!imageSrc) return;
    $('mcsModalImg').src = imageSrc;
    $('mcsModalOpen').href = imageSrc;
    $('mcsModal').hidden = false;
    document.body.classList.add('mcs-modal-open');
    $('mcsModalClose').focus();
}
function closePreview() {
    $('mcsModal').hidden = true;
    document.body.classList.remove('mcs-modal-open');
    $('mcsPreviewBtn').focus();
}

function render(data) {
    TZ = data.timezone || TZ;
    $('autoSchedule').textContent = data.next_run ? `Daily · ${data.run_time_label}` : 'Schedule off';
    renderStrip(data);
    renderDashboard(data.dashboard);

    renderSlackCard(data);

    if (!$('autoMailList')) return;     // view-only visitors don't see the seller emails
    const runs = data.runs || [];
    // Seller emails: one per campaign store, click to see the email exactly as the seller gets it
    const mail = data.seller_email;
    renderMailSwitch(data.settings);
    const lastMail = runs.find(r => r.sellerEmail && r.sellerEmail.sent != null && !r.dryRun && r.sellerEmail.mode !== 'off')?.sellerEmail;
    if (mail?.sellers?.length) {
        const missing = mail.sellers.length - mail.withEmail;
        $('autoMailMeta').textContent = `${mail.sellers.length} seller${mail.sellers.length === 1 ? '' : 's'} · `
            + `${mail.withEmail} with an email address${missing ? ` · ${missing} without` : ''} · built ${when(mail.generatedAt)}`
            + (lastMail ? ` · last send: ${lastMail.sent} sent, ${lastMail.failed} failed` : '')
            + '. Click a seller to see their email.';
        $('autoMailList').innerHTML = mail.sellers.map((s, i) => `
            <details class="auto-wa-item" data-i="${i}">
                <summary>
                    <b>${escapeHtml(s.storeName)}</b>
                    <span class="auto-wa-phone${s.email ? '' : ' is-missing'}">${s.email ? `<i class="fas fa-envelope"></i> ${escapeHtml(s.email)}` : escapeHtml(s.problem)}</span>
                    <span class="auto-wa-count">${s.productCount} low-stock product${s.productCount === 1 ? '' : 's'}</span>
                </summary>
                <div class="auto-mail-subject"><span>Subject</span> ${escapeHtml(s.subject)}</div>
                ${s.attachment ? `<div class="auto-mail-attach"><i class="fas fa-file-pdf"></i> ${escapeHtml(s.attachment.fileName)} · ${s.attachment.productCount} products
                    <a href="${API}/seller-pdf/${encodeURIComponent(s.attachment.file)}" target="_blank" rel="noopener">Open PDF</a></div>` : ''}
                <iframe class="auto-mail-frame" sandbox title="Email to ${escapeHtml(s.storeName)}"></iframe>
            </details>`).join('');
        // The email HTML goes into a sandboxed frame (no scripts) when a seller is opened
        document.querySelectorAll('#autoMailList details').forEach(d => d.addEventListener('toggle', () => {
            const frame = d.querySelector('iframe');
            if (d.open && !frame.srcdoc) frame.srcdoc = mail.sellers[Number(d.dataset.i)].html;
        }));
    } else {
        $('autoMailMeta').textContent = mail ? 'No campaign store has products below the limit, so no emails.' : 'Run a test run to build the preview.';
        $('autoMailList').innerHTML = '';
    }

}

// Run panel: buttons off while a run is going; its output is shown live
function renderRun(data) {
    if (!$('autoRunDry')) return;          // view-only: no run buttons
    const running = !!data.running;
    $('autoRunDry').disabled = running;
    $('autoRunSend').disabled = running;
    const log = data.run_log;
    const recent = log && (Date.now() - new Date(log.updated_at)) < 15 * 60 * 1000;
    $('autoRunStatus').hidden = !running && !recent;
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
            : failed ? '<i class="fas fa-times-circle auto-icon--fail"></i> Last button run failed — see the output below.'
            : `<i class="fas fa-check-circle auto-icon--ok"></i> Last button run finished · ${when(log.updated_at)}`;
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
$('mcsPreviewBtn').addEventListener('click', openPreview);
$('mcsModalClose').addEventListener('click', closePreview);
$('mcsModal').addEventListener('click', e => { if (e.target === $('mcsModal')) closePreview(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('mcsModal').hidden) closePreview(); });
$('autoRunDry')?.addEventListener('click', () => startRun('dry'));
$('mcsEmptyRun')?.addEventListener('click', () => startRun('dry'));
document.querySelectorAll('#mcsMailSwitch button').forEach(b => b.addEventListener('click', () => setMailMode(b.dataset.mode)));
$('mcsTestTo')?.addEventListener('submit', e => { e.preventDefault(); saveMail({ seller_email_mode: 'test', test_to: $('mcsTestToInput').value }); });
$('mcsTestNow')?.addEventListener('click', sendTestNow);
$('autoRunSend')?.addEventListener('click', () => startRun('send'));
$('mcsSearch').addEventListener('input', () => { productPage = 1; renderProducts(); });
$('mcsStoreFilter').addEventListener('change', () => { productPage = 1; renderProducts(); });
load();
