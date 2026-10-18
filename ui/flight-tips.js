/**
 * Flight tutorial: steps the player through steering, rising and diving, boosting, painting from the air and dismounting, moving on as each is done, shown only once.
 */
const FLIGHT_TIPS_KEY = 'wb-flight-tips-v1';
const FLIGHT_TIPS = [
  {
    id: 'steer',
    text: 'Fly where you look',
    key: 'W',
    pad: 'LS',
    secs: 5,
    done: (st) => st.flown > 45,
  },
  {
    id: 'updown',
    text: 'Rise',
    key: 'Space',
    pad: 'A',
    text2: 'Dive',
    key2: 'C',
    pad2: 'X',
    secs: 6,
    done: (st) => st.rose && st.dove,
  },
  {
    id: 'boost',
    text: 'Boost',
    key: 'Shift',
    pad: 'B',
    secs: 5,
    done: (st) => st.boosted,
  },
  {
    id: 'paint',
    text: 'Hold to paint the land below',
    key: 'LMB',
    pad: 'RT',
    secs: 6,
    done: (st) => st.painted > 1.2,
  },
  {
    id: 'land',
    text: 'Dismount',
    key: 'R',
    pad: 'L3',
    secs: 4.5,
  },
];
export class FlightTips {
  ctx;
  show;
  hide;
  done;
  step = -1;
  stepT = 0;
  flying = false;
  shown = false;
  st = {
    flown: 0,
    rose: false,
    dove: false,
    boosted: false,
    painted: 0,
  };
  lastX = NaN;
  lastZ = NaN;
  constructor(ctx, show, hide) {
    this.ctx = ctx;
    this.show = show;
    this.hide = hide;
    let done = false;
    if (ctx.params.get('tips') === 'reset')
      try {
        localStorage.removeItem(FLIGHT_TIPS_KEY);
      } catch {}
    else if (!ctx.shotMode)
      try {
        done = localStorage.getItem(FLIGHT_TIPS_KEY) === '1';
      } catch {
        done = false;
      }
    this.done = done;
  }
  pad() {
    return !!this.ctx.input?.usingGamepad;
  }
  present() {
    const tip = FLIGHT_TIPS[this.step];
    if (tip) {
      this.show('flight-tip', tip.text, this.pad() ? tip.pad : tip.key);
      if (tip.text2) this.show('flight-tip-2', tip.text2, this.pad() ? tip.pad2 : tip.key2);
      this.shown = true;
    }
  }
  clear() {
    if (this.shown) {
      this.shown = false;
      this.hide('flight-tip');
      this.hide('flight-tip-2');
    }
  }
  finish() {
    this.clear();
    this.done = true;
    if (!this.ctx.shotMode)
      try {
        localStorage.setItem(FLIGHT_TIPS_KEY, '1');
      } catch {}
  }
  update(dt, active) {
    if (this.done) return;
    const state = this.ctx.player?.state;
    const flying = !!state && state.mode === 'fly' && !state.dead && active;
    if (flying !== this.flying) {
      this.flying = flying;
      if (flying) {
        if (this.step < 0) this.step = 0;
        this.stepT = 0;
        this.stepT = -0.8;
        this.lastX = NaN;
      } else {
        this.clear();
        if (this.step === FLIGHT_TIPS.length - 1 && this.stepT > 0) this.finish();
      }
    }
    if (!flying || !state || dt <= 0) return;
    const input = this.ctx.input;
    if (Number.isFinite(this.lastX))
      this.st.flown += Math.hypot(state.position.x - this.lastX, state.position.z - this.lastZ);
    this.lastX = state.position.x;
    this.lastZ = state.position.z;
    if (input.held('jump')) this.st.rose = true;
    if (input.held('drop')) this.st.dove = true;
    if (state.sprinting) this.st.boosted = true;
    if (input.held('attack') || input.held('paint')) this.st.painted += dt;
    this.stepT += dt;
    if (this.stepT < 0) return;
    if (!this.shown) this.present();
    const tip = FLIGHT_TIPS[this.step];
    const met = tip.done?.(this.st) ?? false;
    if (this.stepT > tip.secs || (met && this.stepT > 1.4)) {
      this.clear();
      this.step++;
      this.stepT = -0.6;
      if (this.step >= FLIGHT_TIPS.length) this.finish();
    }
  }
}
