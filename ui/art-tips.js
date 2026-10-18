/**
 * First-time Brush Art tips: hold to charge, then release to cast each colour's art, remembered in localStorage once learned.
 */
import { ARTS, PALETTE } from '../core/config.js';
import { artCost } from './art-charge.js';
const ART_TIPS_KEY = 'wb-art-tips-v1';
const ART_TIP_ID = 'art-tip';
export class ArtTips {
  ctx;
  show;
  hide;
  learned;
  shown = '';
  hideAt = 0;
  minUntil = 0;
  wasAiming = false;
  wasReady = false;
  constructor(ctx, show, hide) {
    this.ctx = ctx;
    this.show = show;
    this.hide = hide;
    if (ctx.params.get('tips') === 'reset')
      try {
        localStorage.removeItem(ART_TIPS_KEY);
      } catch {}
    this.learned = new Set();
    if (!ctx.shotMode)
      try {
        const saved = localStorage.getItem(ART_TIPS_KEY);
        this.learned = new Set(saved ? JSON.parse(saved) : []);
      } catch {
        this.learned = new Set();
      }
    ctx.events.on('combat:art', () => {
      if (this.shown) this.hideAt = Math.min(this.hideAt, performance.now() + 700);
    });
    ctx.events.on('player:death', () => this.clear());
  }
  pad() {
    return !!this.ctx.input?.usingGamepad;
  }
  tip(id, text, key, secs, detail) {
    this.shown = id;
    const now = performance.now();
    this.hideAt = now + secs * 1000;
    this.minUntil = now + 1400;
    this.show(ART_TIP_ID, text, key, detail);
  }
  clear() {
    if (this.shown) {
      this.shown = '';
      this.hide(ART_TIP_ID);
    }
  }
  learn(id) {
    this.learned.add(id);
    if (!this.ctx.shotMode)
      try {
        localStorage.setItem(ART_TIPS_KEY, JSON.stringify([...this.learned]));
      } catch {}
  }
  update(active) {
    const state = this.ctx.player?.state;
    const now = performance.now();
    const aiming = active && !!state?.aiming && !state?.dead;
    const charge = Number(state?.artCharge);
    const charged = aiming && (Number.isFinite(charge) ? charge : 0) >= 0.4 - 0.0001;
    const key = this.pad() ? 'RT' : 'LMB';
    if (aiming && !this.wasAiming && !this.learned.has('aim') && !this.shown) {
      this.learn('aim');
      this.tip('aim', 'Hold to charge a Brush Art', key, 6);
    }
    if (charged && !this.wasReady) {
      const selectedColor = state.selectedColor;
      if (
        PALETTE[selectedColor] &&
        !this.learned.has(`cast-${selectedColor}`) &&
        artCost(this.ctx, selectedColor).enough
      ) {
        this.learn(`cast-${selectedColor}`);
        const art = ARTS[selectedColor];
        this.tip(`cast-${selectedColor}`, `Release to cast ${art.name}`, key, 5, art.description);
      } else if (this.shown === 'aim') this.hideAt = Math.min(this.hideAt, now + 400);
    }
    this.wasAiming = aiming;
    this.wasReady = charged;
    if (this.shown && (!active || now > this.hideAt || (!aiming && now > this.minUntil))) this.clear();
  }
}
