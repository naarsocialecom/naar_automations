// ============================================================
// ADF-RENDERER.JS — Converts Atlassian Document Format → HTML
// Completely self-contained. Touch only this file if Jira
// changes their ADF schema.
// ============================================================

import { escapeHtml } from '/static/js/helpers.js';

export function adfToHtml(raw) {
    if (!raw) return '';
    let doc = raw;

    if (typeof doc === 'string') {
        const macroMatch = doc.match(/\{adf[^}]*\}([\s\S]*?)\{adf\}/i);
        const jsonStr = macroMatch ? macroMatch[1].trim() : doc.trim();
        try { doc = JSON.parse(jsonStr); }
        catch (_) { return `<p>${escapeHtml(doc)}</p>`; }
    }

    function renderNode(node) {
        if (!node) return '';
        const type = node.type;
        switch (type) {
            case 'doc':         return (node.content || []).map(renderNode).join('');
            case 'paragraph':   return `<p>${(node.content || []).map(renderNode).join('')}</p>`;
            case 'bulletList':  return `<ul>${(node.content || []).map(renderNode).join('')}</ul>`;
            case 'orderedList': return `<ol>${(node.content || []).map(renderNode).join('')}</ol>`;
            case 'listItem':    return `<li>${(node.content || []).map(renderNode).join('')}</li>`;
            case 'blockquote':  return `<blockquote>${(node.content || []).map(renderNode).join('')}</blockquote>`;
            case 'codeBlock':   return `<pre><code>${(node.content || []).map(renderNode).join('')}</code></pre>`;
            case 'rule':        return `<hr>`;
            case 'heading': {
                const lvl   = node.attrs?.level || 2;
                const sizes = { 1:'var(--fs-xl)', 2:'var(--fs-lg)', 3:'var(--fs-md)', 4:'var(--fs-md)', 5:'var(--fs-sm)', 6:'var(--fs-sm)' };
                return `<h${lvl} style="font-size:${sizes[lvl]||'var(--fs-md)'}">${(node.content || []).map(renderNode).join('')}</h${lvl}>`;
            }
            case 'table': {
                const rows = (node.content || []).map(renderNode).join('');
                return `<table>${rows}</table>`;
            }
            case 'tableRow': {
                const cells    = node.content || [];
                const isHeader = cells.every(c => c.type === 'tableHeader');
                const firstBg  = cells[0]?.attrs?.background;
                // Jira's own cell colours are content and stay as they are
                const rowStyle = firstBg ? ` style="background-color:${firstBg};"` : '';
                return `<tr${isHeader ? ' class="adf-row-head"' : ''}${rowStyle}>${cells.map(c => renderNode(c)).join('')}</tr>`;
            }
            case 'tableHeader':
            case 'tableCell': {
                const attrs   = node.attrs || {};
                const colspan = attrs.colspan  ? `colspan="${attrs.colspan}"` : '';
                const rowspan = attrs.rowspan  ? `rowspan="${attrs.rowspan}"` : '';
                const bg      = attrs.background ? `background-color:${attrs.background};` : '';
                const isHdr   = type === 'tableHeader';
                const tdStyle = bg ? ` style="${bg}"` : '';
                const tag     = isHdr ? 'th' : 'td';
                const inner   = (node.content || []).map(renderNode).join('');
                return `<${tag} ${colspan} ${rowspan}${tdStyle}>${inner}</${tag}>`;
            }
            case 'text': {
                let text = escapeHtml(node.text || '');
                (node.marks || []).forEach(mark => {
                    switch (mark.type) {
                        case 'strong':          text = `<strong>${text}</strong>`; break;
                        case 'em':              text = `<em>${text}</em>`; break;
                        case 'underline':       text = `<u>${text}</u>`; break;
                        case 'strike':          text = `<s>${text}</s>`; break;
                        case 'code':            text = `<code>${text}</code>`; break;
                        case 'textColor':       text = `<span style="color:${mark.attrs?.color||'inherit'};">${text}</span>`; break;
                        case 'backgroundColor': text = `<span style="background-color:${mark.attrs?.color||'transparent'};">${text}</span>`; break;
                        case 'link':            text = `<a href="${escapeHtml(mark.attrs?.href||'#')}" target="_blank" rel="noopener">${text}</a>`; break;
                    }
                });
                return text;
            }
            case 'hardBreak':   return '<br>';
            case 'mention':     return `<span class="adf-mention">@${escapeHtml(node.attrs?.text||node.attrs?.id||'user')}</span>`;
            case 'emoji':       return escapeHtml(node.attrs?.text || node.attrs?.shortName || '');
            case 'date': {
                const ts = node.attrs?.timestamp;
                if (!ts) return '<span class="adf-date-chip"><i class="fas fa-calendar-alt"></i> —</span>';
                const d   = isNaN(Number(ts)) ? new Date(ts) : new Date(Number(ts));
                const lbl = isNaN(d.getTime()) ? escapeHtml(String(ts)) : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
                return `<span class="adf-date-chip"><i class="fas fa-calendar-alt"></i> ${lbl}</span>`;
            }
            case 'inlineCard': return `<a href="${escapeHtml(node.attrs?.url||'#')}" target="_blank" rel="noopener">${escapeHtml(node.attrs?.url||'link')}</a>`;
            case 'mediaGroup':
            case 'mediaSingle': return `<div class="adf-attachment">[Attachment]</div>`;
            case 'panel': {
                const icons = { info:'ℹ️', note:'📝', warning:'⚠️', error:'🚫', success:'✅' };
                const pt = icons[node.attrs?.panelType] ? node.attrs.panelType : 'info';
                return `<div class="adf-panel adf-panel--${pt}">${icons[pt]} ${(node.content||[]).map(renderNode).join('')}</div>`;
            }
            default:
                if (node.content && node.content.length) return (node.content).map(renderNode).join('');
                return '';
        }
    }
    return renderNode(doc);
}
