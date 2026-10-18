/**
 * Combat tutorial prompts: lock on, strike, charge a spin and dodge, each shown once at the right moment in a fight and remembered in localStorage.
 */
const COMBAT_TIPS_KEY = 'wb-combat-tips-v1';
const COMBAT_TIP_ID = 'combat-tip';
function loadCombatTips() {
  try {
    const saved = localStorage.getItem(COMBAT_TIPS_KEY);
    return new Set(saved ? JSON.parse(saved) : []);
  } catch {
    return new Set();
  }
}
export class CombatTips {
  ctx;
  show;
  hide;
  stage = 'idle';
  learned;
  hits = 0;
  hideAt = 0;
  shown = '';
  constructor(ctx, show, hide) {
    this.ctx = ctx;
    this.show = show;
    this.hide = hide;
    if (ctx.params.get('tips') === 'reset')
      try {
        localStorage.removeItem(COMBAT_TIPS_KEY);
      } catch {}
    this.learned = ctx.shotMode ? new Set() : loadCombatTips();
    if (this.learned.has('strike')) this.stage = 'learned';
    const events = ctx.events;
    events.on('enemy:alert', () => {
      if (this.stage === 'idle')
        if (this.lockId() === null) {
          this.stage = 'lock';
          this.tip('Lock on', this.pad() ? 'LT' : 'Q', 10);
        } else {
          this.stage = 'strike';
          this.tip('Strike', this.pad() ? 'X' : 'LMB', 8);
        }
    });
    events.on('combat:lock', (data) => {
      if (
        data?.enemyId !== null &&
        data?.enemyId !== undefined &&
        (this.stage === 'lock' || (this.stage === 'idle' && !this.learned.has('strike')))
      ) {
        this.stage = 'strike';
        this.tip('Strike', this.pad() ? 'X' : 'LMB', 8);
      }
    });
    events.on('combat:hit', (data) => {
      if (data && data.source !== 'fire' && data.source !== 'environment' && data.source !== 'prop') {
        if (this.stage === 'strike') {
          this.stage = 'learned';
          this.learn('strike');
          this.clear();
        }
        if (this.stage === 'learned' && data.source === 'melee') {
          this.hits++;
          if (this.hits >= 3 && !this.learned.has('spin')) {
            this.learn('spin');
            this.tip('Hold to charge a spin', this.pad() ? 'X' : 'LMB', 3.6);
          }
        }
      }
    });
    events.on('combat:swing', (data) => {
      if (data?.move === 'spin' && this.shown === 'Hold to charge a spin') this.clear();
    });
    events.on('enemy:telegraph', () => {
      if (!(this.learned.has('dodge') || this.lockId() === null || this.stage !== 'learned' || this.shown)) {
        this.learn('dodge');
        this.tip('Dodge  ·  with a direction', this.pad() ? 'A' : 'Space', 3);
      }
    });
    events.on('combat:perfect-dodge', () => this.clear());
    events.on('combat:state', (data) => {
      if (!data?.inCombat) {
        this.clear();
        if (this.stage === 'lock' || this.stage === 'strike') this.stage = 'idle';
      }
    });
    events.on('player:death', () => this.clear());
  }
  pad() {
    return !!this.ctx.input?.usingGamepad;
  }
  lockId() {
    const lockTargetId = this.ctx.player?.state?.lockTargetId;
    return typeof lockTargetId == 'number' ? lockTargetId : null;
  }
  tip(text, key, secs) {
    this.shown = text;
    this.hideAt = performance.now() + secs * 1000;
    this.show(COMBAT_TIP_ID, text, key);
  }
  clear() {
    if (this.shown) {
      this.shown = '';
      this.hide(COMBAT_TIP_ID);
    }
  }
  learn(id) {
    this.learned.add(id);
    if (!this.ctx.shotMode)
      try {
        localStorage.setItem(COMBAT_TIPS_KEY, JSON.stringify([...this.learned]));
      } catch {}
  }
  update() {
    if (this.shown && performance.now() > this.hideAt) {
      const wasLock = this.stage === 'lock';
      this.clear();
      if (wasLock) this.stage = 'idle';
    }
  }
}
