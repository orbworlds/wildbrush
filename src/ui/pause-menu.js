/**
 * Pause menu on a painted paper card with Journal (Prism Trials), Brush Arts, Wardrobe (scarves, hoods and gliders for Orb credits), Settings and Controls tabs; settings are edited in place and saved.
 */
import { CANOPIES, paintCanopy } from '../character/glider.js';
import { ARTS, COLORS, PALETTE } from '../core/config.js';
import { saveSettings } from '../core/settings.js';
import { SLOTS } from '../orb/wardrobe.js';
import { formatInk } from './art-charge.js';
import { brushStroke, makeCanvas, paperCard, shade, splatCanvas, strokeCanvas, tint } from './brush.js';
import { CONTROL_ROWS, RIDE_ROW } from './controls-hint.js';
import { el, setClass, setText } from './dom.js';
import { CHECK_SVG, ELEMENT_ICONS, prismSvg } from './icons.js';
import { TRIALS } from './trials.js';
const CREST_NOTES = {
  red: 'Ember Crest: bigger blast, less ink, a lingering ring of fire.',
  blue: 'Frost Crest: pierces every foe, freezes longer, leaves an icy path.',
};
function rainbowNavStroke(seed) {
  const canvas = strokeCanvas(12, 3, '#ffffff', seed, {
    widthFrac: 0.78,
    dry: 0.3,
    taperStart: 0.06,
    taperEnd: 0.3,
    core: 0.75,
    sheen: 0.14,
    streak: 0.06,
  });
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  const gradient = g.createLinearGradient(0, 0, canvas.width, 0);
  COLORS.forEach((color, i) => gradient.addColorStop(i / 3, PALETTE[color].css));
  tint(g, gradient, canvas.width, canvas.height);
  return canvas;
}
/** A look's swatch in the wardrobe: a splat of its colour (or its blend of colours), or a glider's canopy. */
function lookSwatch(item) {
  if (item.slot === 'glider') {
    const { canvas, g } = makeCanvas(64, 40);
    g.beginPath();
    g.moveTo(3, 34);
    g.quadraticCurveTo(32, -10, 61, 34);
    g.quadraticCurveTo(32, 16, 3, 34);
    g.closePath();
    g.save();
    g.clip();
    paintCanopy(g, 64, 40, CANOPIES[item.canopy] ?? CANOPIES.classic);
    g.restore();
    g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(43,38,32,0.6)';
    g.stroke();
    canvas.className = 'wd-canopy';
    return canvas;
  }
  const blend = item.swatches;
  const dot = splatCanvas(4, blend ? '#ffffff' : (item.swatch ?? item.colors[0]), `wd-dot-${item.id}`, {
    rFrac: 0.29,
    tendrils: 5,
    drops: 6,
    reach: 0.55,
    rim: true,
  });
  if (blend) {
    const g = dot.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    const gradient = g.createLinearGradient(0, 0, dot.width, dot.height);
    blend.forEach((color, i) => gradient.addColorStop(i / (blend.length - 1), color));
    tint(g, gradient, dot.width, dot.height);
  }
  return dot;
}
function ellipseStroke(width, height, color, seed) {
  const pw = width * 16;
  const ph = height * 16;
  const { canvas, g } = makeCanvas(pw, ph);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const angle = -Math.PI * 0.75 + (i / 40) * Math.PI * 2.15;
    const shrink = 1 - (i / 40) * 0.08;
    pts.push([pw / 2 + Math.cos(angle) * (pw / 2 - 4) * shrink, ph / 2 + Math.sin(angle) * (ph / 2 - 4) * shrink]);
  }
  brushStroke(g, pts, color, {
    width: 2.6,
    seed,
    dry: 0.2,
    core: 0.7,
    taperStart: 0.05,
    taperEnd: 0.2,
  });
  return canvas;
}
export class PauseMenu {
  ctx;
  tracker;
  cb;
  root;
  isOpen = false;
  tab = 'journal';
  navs = new Map();
  sections = new Map();
  card;
  paperDone = false;
  splatHost;
  splats = new Map();
  jnRows = new Map();
  jnCount;
  miniTrials;
  trialText;
  foot;
  resumeHint;
  settingsSync = [];
  rideRow = null;
  rideNote = null;
  artCosts = new Map();
  artCrests = new Map();
  wardrobeRows = new Map();
  wardrobeTabs = new Map();
  wardrobeSlot = null;
  wardrobeNote = null;
  constructor(host, ctx, tracker, cb) {
    this.ctx = ctx;
    this.tracker = tracker;
    this.cb = cb;
    this.root = el('div', 'wb-layer wb-pause', host);
    el('div', 'pz-bg', this.root);
    const grain = el('div', 'pz-grain', this.root);
    grain.dataset.grain = '1';
    const side = el('div', 'pz-side', this.root);
    this.splatHost = el('div', '', side);
    el('h1', 'pz-title', side, 'Paused');
    el('div', 'pz-sub', side, 'Wildbrush');
    const nav = el('nav', 'pz-nav', side);
    for (const [tab, label, color] of [
      ['resume', 'Resume', 'green'],
      ['journal', 'Journal', 'yellow'],
      ['arts', 'Brush Arts', 'all'],
      ['wardrobe', 'Wardrobe', 'red'],
      ['settings', 'Settings', 'blue'],
      ['controls', 'Controls', 'red'],
    ]) {
      const button = el('button', 'wb-pnav', nav);
      button.appendChild(
        color === 'all'
          ? rainbowNavStroke(`nav-${tab}`)
          : strokeCanvas(12, 3, PALETTE[color].css, `nav-${tab}`, {
              widthFrac: 0.78,
              dry: 0.3,
              taperStart: 0.06,
              taperEnd: 0.3,
              core: 0.75,
              sheen: 0.14,
              streak: 0.06,
            }),
      );
      el('span', '', button, label);
      this.hoverSound(button);
      button.addEventListener('click', () => {
        this.sound('ui-click');
        if (tab === 'resume') this.cb.resume();
        else this.show(tab);
      });
      this.navs.set(tab, button);
    }
    const trials = el('div', 'pz-trials', side);
    this.miniTrials = el('div', 'wb-trials-mini', trials);
    this.trialText = el('div', '', trials);
    this.card = el('div', 'wb-card', this.root);
    const body = el('div', 'cd-body', this.card);
    this.buildJournal(body);
    this.buildArts(body);
    this.buildWardrobe(body);
    this.buildSettings(body);
    this.buildControls(body);
    this.foot = el('div', 'pz-foot', this.root);
    const escHint = el('span', '', this.foot);
    el('span', 'wb-key wide dark', escHint, 'Esc');
    escHint.append('Resume');
    this.resumeHint = el('span', '', this.foot);
    this.resumeHint.innerHTML = '<span class="wb-key wide dark">Click</span> Resume to continue';
    this.resumeHint.style.opacity = '0';
    tracker.onChange(() => this.refreshTrials());
    this.refreshTrials();
  }
  sound(id) {
    try {
      this.ctx.audio?.play?.(id);
    } catch {}
  }
  hoverSound(el) {
    el.addEventListener('pointerenter', () => this.sound('ui-hover'));
  }
  rule(host, seed, color = '#2b2620') {
    const stroke = strokeCanvas(12, 0.9, color, seed, {
      widthFrac: 0.35,
      dry: 0.4,
      taperEnd: 0.45,
      core: 0.7,
    });
    stroke.className = 'cd-rule';
    host.appendChild(stroke);
  }
  buildJournal(body) {
    const section = el('section', '', body);
    section.dataset.tab = 'journal';
    el('h2', '', section, 'Journal');
    this.rule(section, 'rule-j', shade(PALETTE.yellow.css, -0.25));
    el(
      'p',
      'cd-lead',
      section,
      'Four Prism Trials hold the island’s lost colour. Restore each one to bring the land back to life.',
    );
    this.jnCount = el('div', 'jn-count', section);
    const list = el('div', 'wb-jn', section);
    for (const trial of TRIALS) {
      const row = el('div', 'jn-row', list);
      row.style.setProperty('--tc', PALETTE[trial.color].css);
      const wash = strokeCanvas(30, 4, PALETTE[trial.color].css, `jn-${trial.color}`, {
        widthFrac: 0.9,
        dry: 0.3,
        core: 0.5,
        taperEnd: 0.4,
        alpha: 0.6,
      });
      wash.className = 'jn-wash';
      row.appendChild(wash);
      el('div', 'jn-prism', row, prismSvg());
      const text = el('div', '', row);
      el('div', 'jn-t', text, trial.title);
      el('div', 'jn-p', text, trial.place);
      el('div', 'jn-s', row, 'Awaiting');
      this.jnRows.set(trial.color, row);
    }
    this.sections.set('journal', section);
  }
  refreshTrials() {
    const count = this.tracker.done.size;
    setText(this.jnCount, `Restored ${count} of 4`);
    for (const trial of TRIALS) {
      const row = this.jnRows.get(trial.color);
      const done = this.tracker.done.has(trial.color);
      setClass(row, 'done', done);
      setText(row.querySelector('.jn-s'), done ? 'Restored' : 'Awaiting');
    }
    this.miniTrials.innerHTML = '';
    for (const trial of TRIALS) {
      const prism = el('div', `tr-p${this.tracker.done.has(trial.color) ? ' done' : ''}`, this.miniTrials, prismSvg());
      prism.style.cssText = `--tc:${PALETTE[trial.color].css};position:relative;width:1.1em;height:1.55em`;
    }
    setText(this.trialText, `${count} of 4 Prism Trials restored`);
  }
  buildArts(body) {
    const section = el('section', '', body);
    section.dataset.tab = 'arts';
    el('h2', '', section, 'Brush Arts');
    this.rule(section, 'rule-a', shade(PALETTE.red.css, -0.2));
    el(
      'p',
      'cd-lead',
      section,
      'Aim, then hold paint: the ring round your sight fills to its notch — release to cast your colour’s art. A quick tap still flicks a blob.',
    );
    const list = el('div', 'wb-arts', section);
    for (const color of COLORS) {
      const pal = PALETTE[color];
      const art = ARTS[color];
      const row = el('div', `ar-row ${color}`, list);
      const wash = strokeCanvas(30, 4, pal.css, `ar-${color}`, {
        widthFrac: 0.9,
        dry: 0.3,
        core: 0.5,
        taperEnd: 0.4,
        alpha: 0.5,
      });
      wash.className = 'ar-wash';
      row.appendChild(wash);
      const icon = el('div', 'ar-icon', row);
      icon.appendChild(
        splatCanvas(4, pal.css, `ar-dot-${color}`, {
          rFrac: 0.29,
          tendrils: 5,
          drops: 6,
          reach: 0.55,
          rim: true,
        }),
      );
      el('i', '', icon, ELEMENT_ICONS[color] ?? '');
      const info = el('div', '', row);
      const head = el('div', 'ar-head', info);
      el('div', 'ar-t', head, art.name);
      el('div', 'ar-el', head, pal.name);
      this.artCosts.set(color, el('div', 'ar-cost', head));
      el('div', 'ar-d', info, art.description);
      const crestNote = CREST_NOTES[color];
      if (crestNote) {
        const crest = el('div', 'ar-crest', info, crestNote);
        crest.style.display = 'none';
        this.artCrests.set(color, crest);
      }
    }
    el(
      'div',
      'cd-note',
      section,
      'Each art spends ink of its colour — the Chroma Brush halves the cost. Refill at glowing ink plants and from the ink foes leave behind.',
    );
    this.sections.set('arts', section);
  }
  refreshArts() {
    let chroma = false;
    try {
      chroma = this.ctx.player?.state?.brush === 'chroma';
    } catch {
      chroma = false;
    }
    const has = (item) => {
      try {
        return !!this.ctx.player?.hasItem?.(item);
      } catch {
        return false;
      }
    };
    const emberCrest = has('emberCrest');
    for (const [color, artCost] of this.artCosts)
      artCost.innerHTML = `<b>${formatInk((ARTS[color]?.ink ?? 0) * (chroma ? 0.5 : 1) * (color === 'red' && emberCrest ? 0.75 : 1))}</b> ink`;
    let anyCrest = false;
    for (const [color, artCrest] of this.artCrests) {
      const owned = color === 'red' ? emberCrest : color === 'blue' && has('frostCrest');
      artCrest.style.display = owned ? '' : 'none';
      anyCrest ||= owned;
    }
    const list = this.artCrests.get('red')?.closest('.wb-arts');
    if (list) list.classList.toggle('crested', anyCrest);
  }
  /** Looks sold for Orb credits (orb/wardrobe.js), a tab per slot: a tile buys its look through Orb's sheet, or wears it. */
  buildWardrobe(body) {
    const wardrobe = this.ctx.wardrobe;
    const section = el('section', '', body);
    section.dataset.tab = 'wardrobe';
    el('h2', '', section, 'Wardrobe');
    this.rule(section, 'rule-w', shade(PALETTE.red.css, -0.2));
    const tabs = el('div', 'wb-seg wd-tabs', section);
    for (const slot of SLOTS) {
      const items = (wardrobe?.items ?? []).filter((item) => item.slot === slot.id);
      if (items.length < 2) continue;
      const tab = el('button', '', tabs);
      tab.appendChild(ellipseStroke(slot.name.length * 0.62 + 1.9, 2.1, '#2b2620', `wd-tab-${slot.id}`));
      el('span', '', tab, slot.name);
      this.hoverSound(tab);
      tab.addEventListener('click', () => {
        this.sound('ui-click');
        this.wardrobeSlot = slot.id;
        this.refreshWardrobe();
      });
      const grid = el('div', 'wd-grid', section);
      for (const item of items) {
        const tile = el('button', 'wd-tile', grid);
        tile.appendChild(lookSwatch(item));
        el('span', 'wd-name', tile, item.name);
        const status = el('span', 'wd-status', tile);
        this.hoverSound(tile);
        tile.addEventListener('click', () => {
          this.sound('ui-click');
          if (wardrobe.owned.has(item.id)) wardrobe.wear(item.id);
          else wardrobe.buy(item.id);
        });
        this.wardrobeRows.set(item.id, { tile, status });
      }
      this.wardrobeTabs.set(slot.id, { tab, grid });
    }
    this.wardrobeSlot = this.wardrobeTabs.keys().next().value ?? null;
    this.wardrobeNote = el('div', 'cd-note', section);
    wardrobe?.onChange(() => this.refreshWardrobe());
    this.refreshWardrobe();
    this.sections.set('wardrobe', section);
  }
  refreshWardrobe() {
    const wardrobe = this.ctx.wardrobe;
    if (!wardrobe || !this.wardrobeNote) return;
    for (const [slot, { tab, grid }] of this.wardrobeTabs) {
      setClass(tab, 'on', slot === this.wardrobeSlot);
      setClass(grid, 'on', slot === this.wardrobeSlot);
    }
    for (const item of wardrobe.items) {
      const { tile, status } = this.wardrobeRows.get(item.id);
      const owned = wardrobe.owned.has(item.id);
      const worn = wardrobe.isWorn(item.id);
      status.innerHTML = worn
        ? 'Wearing'
        : owned
          ? 'Wear'
          : wardrobe.buying === item.id
            ? 'Asking Orb…'
            : `<b>${item.price}</b> credits`;
      tile.disabled = worn || (!owned && (!!wardrobe.buying || !wardrobe.onOrb));
      setClass(tile, 'worn', worn);
    }
    setText(
      this.wardrobeNote,
      wardrobe.note?.text ??
        (wardrobe.onOrb ? 'What you own is yours on every device you sign in on.' : 'Open Wildbrush on Orb to get these.'),
    );
  }
  buildSettings(body) {
    const section = el('section', '', body);
    section.dataset.tab = 'settings';
    el('h2', '', section, 'Settings');
    this.rule(section, 'rule-s', shade(PALETTE.blue.css, -0.2));
    const settings = this.ctx.settings;
    const changed = (persist) => {
      if (persist) saveSettings(settings);
      this.ctx.events.emit('settings:changed', {
        settings,
      });
    };
    const slider = (label, key, min, max, step, format, color) => {
      const row = el('div', 'wb-set', section);
      el('label', '', row, label);
      const range = el('input', 'wb-range', row);
      range.type = 'range';
      range.min = String(min);
      range.max = String(max);
      range.step = String(step);
      range.style.setProperty('--rc', PALETTE[color].css);
      const readout = el('div', 'sv', row);
      const sync = () => {
        const value = Number(settings[key]);
        range.value = String(value);
        range.style.setProperty('--p', `${(((value - min) / (max - min)) * 100).toFixed(1)}%`);
        setText(readout, format(value));
      };
      range.addEventListener('input', () => {
        settings[key] = Number(range.value);
        sync();
        changed(false);
      });
      range.addEventListener('change', () => {
        changed(true);
        this.sound('ui-click');
      });
      this.hoverSound(range);
      this.settingsSync.push(sync);
      sync();
    };
    const toggle = (label, key) => {
      const row = el('div', 'wb-set', section);
      el('label', '', row, label);
      const button = el('button', 'wb-toggle', row);
      el('div', 'tg-box', button);
      button.insertAdjacentHTML('beforeend', CHECK_SVG);
      el('div', '', row);
      const sync = () => setClass(button, 'on', !!settings[key]);
      button.addEventListener('click', () => {
        settings[key] = !settings[key];
        sync();
        changed(true);
        this.sound('ui-click');
      });
      this.hoverSound(button);
      this.settingsSync.push(sync);
      sync();
    };
    slider('Mouse sensitivity', 'mouseSensitivity', 0.2, 3, 0.05, (value) => `${value.toFixed(2)}×`, 'blue');
    toggle('Invert look (Y)', 'invertY');
    {
      const row = el('div', 'wb-set', section);
      el('label', '', row, 'Visual quality');
      const seg = el('div', 'wb-seg', row);
      el('div', '', row);
      const buttons = [];
      for (const [level, label] of [
        ['low', 'Low'],
        ['medium', 'Medium'],
        ['high', 'High'],
      ]) {
        const button = el('button', '', seg);
        button.appendChild(ellipseStroke(label.length * 0.62 + 1.9, 2.1, '#2b2620', `seg-${level}`));
        el('span', '', button, label);
        buttons.push([level, button]);
        button.addEventListener('click', () => {
          settings.quality = level;
          sync();
          changed(true);
          this.sound('ui-click');
        });
        this.hoverSound(button);
      }
      const sync = () => buttons.forEach(([level, button]) => setClass(button, 'on', settings.quality === level));
      this.settingsSync.push(sync);
      sync();
    }
    slider('Master volume', 'masterVolume', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`, 'green');
    slider('Music volume', 'musicVolume', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`, 'yellow');
    toggle('Show controls hint', 'showControlsHint');
    el(
      'div',
      'cd-note',
      section,
      'Settings are saved on this device. Quality changes take full effect after a reload.',
    );
    this.sections.set('settings', section);
  }
  buildControls(body) {
    const section = el('section', '', body);
    section.dataset.tab = 'controls';
    el('h2', '', section, 'Controls');
    this.rule(section, 'rule-c', shade(PALETTE.red.css, -0.2));
    const list = el('div', 'wb-ctl', section);
    const rows = [...CONTROL_ROWS, RIDE_ROW, [['Esc'], 'Pause'], [['H'], 'Toggle hints']];
    for (const [keys, label, joiner] of rows) {
      const row = el('div', 'cl-row', list);
      if (label === RIDE_ROW[1]) this.rideRow = row;
      el('div', 'cl-lbl', row, label);
      const keyBox = el('div', 'cl-keys', row);
      keys.forEach((cap, i) => {
        if (i > 0 && joiner) keyBox.append(joiner);
        el('span', `wb-key${cap.length > 1 ? ' wide' : ''}`, keyBox, cap);
      });
    }
    el(
      'div',
      'cd-note',
      section,
      'Every strike paints: your colour is your element. Dodge just before a blow lands for a <b>Masterstroke</b>, then strike. Ember burns, Frost freezes (the next hit shatters), Spring launches, Bloom roots. Gamepads are supported.',
    );
    this.rideNote = el(
      'div',
      'cd-note',
      section,
      '<b>Brushflight:</b> press R to ride, again to hop off. You fly where you look — Space rises, C dives, Shift boosts (stamina), and holding LMB paints the land below.',
    );
    this.sections.set('controls', section);
  }
  show(tab) {
    this.tab = tab;
    for (const [id, nav] of this.navs) setClass(nav, 'active', id === tab);
    for (const [id, section] of this.sections) setClass(section, 'on', id === tab);
    // you may have bought or signed in on another device since
    if (tab === 'wardrobe') this.ctx.wardrobe?.refreshOwned();
  }
  prepare() {
    if (!this.paperDone) {
      this.paperDone = true;
      try {
        const paper = paperCard(576, 544, 'pause-card', [
          PALETTE.red.css,
          PALETTE.blue.css,
          PALETTE.yellow.css,
          PALETTE.green.css,
        ]);
        paper.className = 'cd-paper';
        this.card.insertBefore(paper, this.card.firstChild);
      } catch (err) {
        console.warn('[ui] paper card failed', err);
        this.card.style.background = '#efe6d1';
      }
    }
    this.splatFor(this.ctx.player?.state?.selectedColor ?? 'green');
  }
  splatFor(color) {
    let splat = this.splats.get(color);
    if (!splat && PALETTE[color]) {
      splat = splatCanvas(16, PALETTE[color].css, `pause-splat-${color}`, {
        rFrac: 0.2,
        tendrils: 7,
        drops: 20,
        reach: 1.1,
        rim: true,
      });
      splat.className = 'pz-splat';
      splat.style.opacity = '0.9';
      this.splats.set(color, splat);
    }
    return splat;
  }
  open(tab = 'journal') {
    this.prepare();
    const splat = this.splatFor(this.ctx.player?.state?.selectedColor ?? 'green');
    if (splat && splat.parentElement !== this.splatHost) {
      this.splatHost.textContent = '';
      this.splatHost.appendChild(splat);
    }
    for (const sync of this.settingsSync) sync();
    this.refreshTrials();
    this.refreshArts();
    this.refreshWardrobe();
    let canFly = false;
    try {
      canFly = !!this.ctx.player?.hasItem?.('brushflight');
    } catch {
      canFly = false;
    }
    if (this.rideRow) setClass(this.rideRow, 'locked', !canFly);
    if (this.rideNote) this.rideNote.style.display = canFly ? '' : 'none';
    this.resumeHint.style.opacity = '0';
    this.show(tab);
    this.isOpen = true;
    setClass(this.root, 'open', true);
  }
  close() {
    this.isOpen = false;
    setClass(this.root, 'open', false);
  }
  nudgeResume() {
    const resume = this.navs.get('resume');
    this.resumeHint.style.opacity = '1';
    resume?.animate(
      [
        {
          transform: 'translateX(0.3em)',
        },
        {
          transform: 'translateX(1em)',
        },
        {
          transform: 'translateX(0.2em)',
        },
        {
          transform: 'translateX(0.6em)',
        },
        {
          transform: 'translateX(0.3em)',
        },
      ],
      {
        duration: 420,
        easing: 'ease-out',
      },
    );
  }
}
