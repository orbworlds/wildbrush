/**
 * Proximity hints: registered hint spots show their text as a UI prompt while the hero stands near the closest one, and hide it when the hero walks away.
 */
export class Hints {
  ctx;
  list = [];
  active = null;
  constructor(ctx) {
    this.ctx = ctx;
  }
  add(pos, text, radius = 3.4) {
    this.list.push({
      pos: pos.clone(),
      text,
      radius,
    });
  }
  setText(pos, text) {
    const hint = this.list.find((h) => h.pos.distanceToSquared(pos) < 0.01);
    if (hint && hint.text !== text && ((hint.text = text), this.active === hint))
      try {
        this.ctx.ui.showPrompt('hint', text);
      } catch {}
  }
  update() {
    const state = this.ctx.player?.state;
    if (!state) return;
    let nearest = null;
    let nearestDist = Infinity;
    for (const hint of this.list) {
      const dist = Math.hypot(hint.pos.x - state.position.x, hint.pos.z - state.position.z);
      const dy = Math.abs(hint.pos.y - state.position.y);
      if (dist < (this.active === hint ? hint.radius + 0.8 : hint.radius) && dy < 4 && dist < nearestDist) {
        nearestDist = dist;
        nearest = hint;
      }
    }
    if (nearest !== this.active) {
      try {
        if (nearest) this.ctx.ui.showPrompt('hint', nearest.text);
        else this.ctx.ui.hidePrompt('hint');
      } catch {}
      this.active = nearest;
    }
  }
}
