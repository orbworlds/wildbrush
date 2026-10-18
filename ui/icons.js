/**
 * Inked SVG icons: the element icon for each paint colour (flame, snowflake, spring, leaves), the Prism Trial gem, the mouse and the check mark.
 */
function snowflakeSvg() {
  let arms = '';
  let barbs = '';
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const vx = -uy;
    const vy = ux;
    const pt = (along, across) =>
      `${(16 + ux * along + vx * across).toFixed(2)} ${(16 + uy * along + vy * across).toFixed(2)}`;
    arms += `M${pt(2.2, 0)}L${pt(13, 0)}`;
    barbs += `M${pt(5.8, 3.4)}L${pt(8.8, 0)}L${pt(5.8, -3.4)}`;
  }
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="${arms}" stroke-width="2.5"/><path d="${barbs}" stroke-width="2"/><circle cx="16" cy="16" r="2.3" fill="currentColor" stroke="none"/></svg>`;
}
export const ELEMENT_ICONS = {
  red: '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M16.4 2.6c1.2 4.6 7.9 7.6 7.9 15.4 0 5.4-3.9 10.4-8.6 10.4S7.4 24.7 7.4 19.2c0-3.6 1.7-6.2 3.7-7.8.1 2.7 1 4.5 2.9 5.4-.3-5.9.7-10.2 2.4-14.2z"/><path fill="rgba(0,0,0,.28)" d="M15.9 28.4c-2.3 0-4-1.8-4-4.1 0-2.9 2.4-4.4 3.3-7 2.2 1.7 4.9 3.9 4.9 7 0 2.3-1.8 4.1-4.2 4.1z"/></svg>',
  blue: snowflakeSvg(),
  yellow: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="7.2" r="4.4" fill="currentColor" stroke="none"/>
    <path stroke-width="2.4" d="M10.5 15.2 21.5 17.4 10.5 19.6 21.5 21.8 10.5 24"/>
    <path stroke-width="2.8" d="M8 28.2h16"/>
    <path stroke-width="1.5" opacity=".7" d="M7.2 9.5c-1.4-1.6-1.6-3.6-.6-5.4M24.8 9.5c1.4-1.6 1.6-3.6.6-5.4"/></svg>`,
  green: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path stroke-width="2.4" d="M16 29.2c-.4-5.2-.2-10.4 1-15.2"/>
    <path fill="currentColor" stroke="none" d="M16.4 17.6C15.2 12 10.6 9 4.6 9.6c.4 6 5 9.2 11.8 8z"/>
    <path fill="currentColor" stroke="none" d="M17.2 14.6c.4-6.6 5.2-10.8 12.2-11-.2 7.2-5 11.2-12.2 11z"/>
    <path stroke="rgba(0,0,0,.3)" stroke-width="1.1" d="M6.8 10.8c3 1.4 5.8 3.4 9 6.4M27.4 5.4c-3.4 2.2-6.6 5.2-9.6 8.6"/></svg>`,
};
export function prismSvg(cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 34" fill="none" stroke-linejoin="round">
    <path class="pf" d="M12 1.6 21.4 10.4 12 32.4 2.6 10.4Z"/>
    <path class="ph" d="M12 1.6 8.6 10.4 12 32.4 15.4 10.4Z"/>
    <path class="ps" d="M12 1.6 21.4 10.4 12 32.4 2.6 10.4ZM2.6 10.4h18.8M12 1.6 8.6 10.4 12 32.4M12 1.6l3.4 8.8L12 32.4"/></svg>`;
}
export const MOUSE_SVG =
  '<svg viewBox="0 0 20 28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="1.5" width="16" height="25" rx="8"/><path d="M10 1.5v9M2 10.5h16" /><path class="lmb" d="M10 1.5a8 8 0 0 0-8 8v1h8z" fill="currentColor" stroke="none"/></svg>';
export const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.8 9.6 17.6 19.8 5.8"/></svg>';
