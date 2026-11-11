// Home: one card per dashboard / automation, with a thumbnail of its page.
import { escapeHtml } from '/static/js/helpers.js';

const $ = id => document.getElementById(id);
let retry = null;

function card(c) {
    const thumb = c.thumbnail
        ? `<img src="${escapeHtml(c.thumbnail)}" alt="" loading="lazy">`
        : `<div class="home-thumb-wait"><i class="fas ${escapeHtml(c.icon)}"></i><span>Preparing preview…</span></div>`;
    const sched = c.schedule
        ? (c.schedule.enabled
            ? `<span class="home-chip"><i class="fas fa-clock"></i> Daily ${escapeHtml(c.schedule.time_label)}</span>`
            : '<span class="home-chip home-chip--off"><i class="fas fa-pause"></i> Schedule off</span>')
        : '';
    return `<a class="home-card" href="${escapeHtml(c.url)}">
        <div class="home-thumb">${thumb}</div>
        <div class="home-body">
            <div class="home-title"><span class="home-icon home-icon--${escapeHtml(c.kind)}"><i class="fas ${escapeHtml(c.icon)}"></i></span>${escapeHtml(c.title)}</div>
            <p>${escapeHtml(c.description)}</p>
            <div class="home-foot">${sched}<span class="home-open">Open <i class="fas fa-arrow-right"></i></span></div>
        </div>
    </a>`;
}

async function load() {
    try {
        const res = await fetch('/api/home', { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 401 ? 'Your session ended — reload the page to sign in again.' : `Could not load (${res.status})`);
        const { cards } = await res.json();
        $('homeDashboards').innerHTML = cards.filter(c => c.kind === 'dashboard').map(card).join('');
        $('homeAutomations').innerHTML = cards.filter(c => c.kind === 'automation').map(card).join('');
        $('homeError').hidden = true;
        // Previews are made in the background the first time; look again shortly
        clearTimeout(retry);
        if (cards.some(c => !c.thumbnail)) retry = setTimeout(load, 8000);
    } catch (e) {
        $('homeError').textContent = e.message;
        $('homeError').hidden = false;
    }
}
load();
