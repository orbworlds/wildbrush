/**
 * Small Key counter: the pill near the top-left of the screen showing how many keys the hero carries inside a temple.
 */
const KEY_ICON_SVG =
  '<svg viewBox="0 0 40 40" width="100%" height="100%"><defs><linearGradient id="tkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a1"/><stop offset="1" stop-color="#d59a2c"/></linearGradient></defs><g fill="none" stroke="#3a2610" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="11" r="7"/><path d="M20 18 V35 M20 27 H26 M20 32 H25"/></g><g fill="none" stroke="url(#tkg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="11" r="7"/><path d="M20 18 V35 M20 27 H26 M20 32 H25"/></g><circle cx="20" cy="11" r="2.4" fill="#fff4cf"/></svg>';
export class KeyHud {
  el = null;
  count = null;
  shown = false;
  last = -1;
  ensure() {
    if (this.el || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'wb-temple-keys';
    el.style.cssText = [
      'position:fixed',
      'left:1.6em',
      'top:5.6em',
      'z-index:40',
      'display:flex',
      'align-items:center',
      'gap:0.35em',
      'padding:0.28em 0.8em 0.28em 0.45em',
      'border-radius:999px',
      'pointer-events:none',
      'background:linear-gradient(180deg, rgba(34,26,20,0.62), rgba(20,16,14,0.5))',
      'box-shadow:0 2px 10px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,226,160,0.28)',
      "font:800 1.05em/1 'Nunito Variable', 'Nunito', system-ui, sans-serif",
      'color:#fff3d2',
      'text-shadow:0 1px 1px rgba(8,10,16,0.6), 0 0 8px rgba(8,10,16,0.38)',
      'opacity:0',
      'transform:translateY(-6px)',
      'transition:opacity 0.35s ease, transform 0.35s ease',
    ].join(';');
    const icon = document.createElement('span');
    icon.style.cssText =
      'display:inline-block;width:1.7em;height:1.7em;filter:drop-shadow(0 0 6px rgba(255,210,120,0.55))';
    icon.innerHTML = KEY_ICON_SVG;
    const countEl = document.createElement('span');
    countEl.textContent = '×0';
    el.append(icon, countEl);
    (document.getElementById('app') ?? document.body).appendChild(el);
    this.el = el;
    this.count = countEl;
  }
  set(shown, keys) {
    try {
      if ((!shown && !this.el) || (this.ensure(), !this.el || !this.count)) return;
      if (keys !== this.last) {
        this.last = keys;
        this.count.textContent = `×${keys}`;
        if (shown)
          this.el.animate?.(
            [
              {
                transform: 'scale(1.25)',
              },
              {
                transform: 'scale(1)',
              },
            ],
            {
              duration: 380,
              easing: 'ease-out',
            },
          );
      }
      if (shown !== this.shown) {
        this.shown = shown;
        this.el.style.opacity = shown ? '1' : '0';
        this.el.style.transform = shown ? 'translateY(0)' : 'translateY(-6px)';
      }
    } catch {}
  }
  dispose() {
    this.el?.remove();
    this.el = null;
  }
}
