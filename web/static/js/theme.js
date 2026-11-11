// Light / dark theme: the sidebar toggle, the OS setting while the user hasn't chosen, and other open tabs.
// The first choice is made before paint by partials/theme_head.html. Pages listen for `themechange` (e.g. to redraw charts).
(function () {
  var KEY = 'naar-theme', root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function current() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function sync() {
    var b = document.getElementById('themeToggle'); if (!b) return;
    var dark = current() === 'dark', label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    b.setAttribute('aria-label', label); b.title = label; b.setAttribute('aria-pressed', String(dark));
  }
  function apply(t, persist) {
    if (root.hasAttribute('data-theme-locked')) return;
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', t); root.style.colorScheme = t;
    if (persist) { try { localStorage.setItem(KEY, t); } catch (e) {} }
    sync();
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('theme-switching'); }); });
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } }));
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#themeToggle')) apply(current() === 'dark' ? 'light' : 'dark', true);
  });
  var onOs = function (e) {             // follow the OS only while the user hasn't chosen
    var saved = null; try { saved = localStorage.getItem(KEY); } catch (_) {}
    if (!saved) apply(e.matches ? 'dark' : 'light', false);
  };
  if (mq.addEventListener) mq.addEventListener('change', onOs); else if (mq.addListener) mq.addListener(onOs);
  window.addEventListener('storage', function (e) { if (e.key === KEY && e.newValue) apply(e.newValue, false); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
})();
