// Put the visitor's own store first and highlight it; desktops keep both equal.
(() => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const platform = ios ? 'ios' : /Android/.test(ua) ? 'android' : null;
  if (!platform) return;
  for (const group of document.querySelectorAll('[data-stores]')) {
    const own = group.querySelector(`[data-platform="${platform}"]`);
    if (!own) continue;
    own.classList.add('primary');
    group.prepend(own);
  }
})();
