/**
 * Compass strip at the top of the screen: headings and ticks scroll with the camera, with marks and distances for the trial shrines, Greymaw's arena, the sky island, the brush perch, entrances already found and nearby elites.
 */
import { Vector3 } from 'three';
import { BOSS_ARENA, PALETTE, SKY_ISLAND } from '../core/config.js';
import { washCanvas } from './brush.js';
import { el, setClass, setStyle, setText } from './dom.js';
import { CHECK_SVG, ELEMENT_ICONS, prismSvg } from './icons.js';
import { TRIALS } from './trials.js';
const BOSS_MARK_SVG = `<svg viewBox="-20 -20 40 40" overflow="visible">
  <path fill="#1a171f" stroke="rgba(230,220,245,.55)" stroke-width="1.4" d="M0-17c6 0 8 4 12 5s7 5 5 10 2 8-1 12-9 6-14 6-10-1-13-5-5-7-4-11 3-9 6-12 5-5 9-5z"/>
  <path fill="#ece8e0" d="M-8.5-4.5c2.5-3.5 14.5-3.5 17 0 1.2 5.5-1.8 12-8.5 13.5-6.7-1.5-9.7-8-8.5-13.5z"/>
  <path fill="#1a171f" d="M-6-1.5c1.4-1.3 3.6-1.3 4.6.2-1.2 1.6-3.4 1.8-4.6-.2zM1.4-1.3c1-1.5 3.2-1.5 4.6-.2-1.2 2-3.4 1.8-4.6.2zM-2.6 4.6c1.6.9 3.6.9 5.2 0-.9 1.8-4.3 1.8-5.2 0z"/>
  <circle cx="-15" cy="-10" r="2" fill="#ff5b3a"/><circle cx="15" cy="-9" r="1.8" fill="#4cc3ff"/><circle cx="-13" cy="12" r="1.7" fill="#ffd447"/><circle cx="14" cy="11" r="1.9" fill="#58d66b"/>
</svg>`;
const PERCH_MARK_SVG = `<svg viewBox="-20 -20 40 40" overflow="visible">
  <defs><linearGradient id="cp-perch-g" x1="0" x2="1"><stop offset="0" stop-color="#fff4df"/><stop offset=".2" stop-color="#ff5b3a"/><stop offset=".45" stop-color="#ffd447"/><stop offset=".7" stop-color="#58d66b"/><stop offset="1" stop-color="#4cc3ff"/></linearGradient></defs>
  <g transform="rotate(-32)" stroke="#1b1720" stroke-width=".9" stroke-linejoin="round">
    <path fill="#4cc3ff" d="M2-1Q-5-9-13-13Q-8-6 2-1Z"/><path fill="#58d66b" d="M2-1Q-2-10-6-15Q-5-7 2-1Z"/><path fill="#ffd447" d="M3-1Q2-10 1-15Q-1-7 3-1Z"/>
    <path fill="#4cc3ff" d="M2 1Q-5 9-13 13Q-8 6 2 1Z"/><path fill="#58d66b" d="M2 1Q-2 10-6 15Q-5 7 2 1Z"/><path fill="#ffd447" d="M3 1Q2 10 1 15Q-1 7 3 1Z"/>
    <rect x="-17" y="-1.4" width="21" height="2.8" rx="1.4" fill="#f3ece0"/>
    <rect x="2.6" y="-2.2" width="2.6" height="4.4" rx=".9" fill="#f0b93a"/>
    <path fill="url(#cp-perch-g)" d="M5-2.4C10-5.6 15-4.2 18.5.4 15.2 3.6 10 5 5 2.4Z"/>
  </g>
</svg>`;
const AERIE_MARK_SVG = `<svg viewBox="-20 -20 40 40" overflow="visible">
  <defs><linearGradient id="cp-aerie-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9aee0"/><stop offset="1" stop-color="#5b4f8a"/></linearGradient>
  <linearGradient id="cp-aerie-g" x1="0" x2="1"><stop offset="0" stop-color="#7fd36b"/><stop offset="1" stop-color="#c8e97a"/></linearGradient></defs>
  <path fill="url(#cp-aerie-r)" stroke="#1b1720" stroke-width=".9" stroke-linejoin="round" d="M-13-3Q-9 7-3 15-1 17 0 13 3 8 6 6 10 1 13-3Z"/>
  <path fill="url(#cp-aerie-g)" stroke="#1b1720" stroke-width=".9" d="M-14-4Q-7-9 0-8 8-9 14-4 8-1 0-1-8-1-14-4Z"/>
  <path fill="none" stroke="#9fdcff" stroke-width="1.4" stroke-linecap="round" d="M8-2Q9 5 8.5 11"/>
  <path fill="#f4efe6" stroke="#1b1720" stroke-width=".7" d="M-4-7l1-5 1.2 5zM3-7.5l1.4-3.6 1 3.4z"/>
  <path fill="#ffffff" opacity=".92" d="M-17 8q1-3 4-2 1-3 4-1 3-1 3 2 2 0 1 2h-12q-2 0 0-1z"/>
  <path fill="#ffd25e" d="M11-14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>
</svg>`;
const CAVE_MARK_SVG = `<svg viewBox="-20 -20 40 40" overflow="visible">
  <path fill="#8f877c" stroke="#1b1720" stroke-width=".9" stroke-linejoin="round" d="M-15 12Q-15-6-6-12 0-15 6-12 15-6 15 12Z"/>
  <path fill="#15121a" d="M-8 12Q-8-3 0-6 8-3 8 12Z"/>
  <path fill="#b9aee0" opacity=".45" d="M-13 2q2-7 6-10-3 5-4 12z"/>
  <ellipse cx="-4" cy="9" rx="2.6" ry="1.4" fill="#ffc46a"/><rect x="-4.6" y="9" width="1.2" height="3" fill="#fff1c8"/>
  <ellipse cx="3.5" cy="7.6" rx="2" ry="1.1" fill="#7fe0c0"/><rect x="3" y="7.6" width="1" height="4.4" fill="#e8fff4"/>
  <circle cx="0" cy="3" r="5" fill="#ffc46a" opacity=".22"/>
</svg>`;
function templeMarkSvg(color) {
  return `<svg viewBox="-20 -20 40 40" overflow="visible">
  <path fill="#e8e0d0" stroke="#1b1720" stroke-width=".9" stroke-linejoin="round" d="M-15-5 0-15 15-5Z"/>
  <rect x="-14" y="-5" width="28" height="3" fill="#d8cfbd" stroke="#1b1720" stroke-width=".8"/>
  <rect x="-12" y="-2" width="4" height="12" fill="#efe8da" stroke="#1b1720" stroke-width=".7"/>
  <rect x="8" y="-2" width="4" height="12" fill="#efe8da" stroke="#1b1720" stroke-width=".7"/>
  <path fill="${color}" stroke="#1b1720" stroke-width=".7" d="M-5 10v-7q5-5 10 0v7Z"/>
  <rect x="-15" y="10" width="30" height="3" rx="1" fill="#cfc5b1" stroke="#1b1720" stroke-width=".8"/>
  <circle cx="0" cy="-8.5" r="2" fill="${color}"/>
</svg>`;
}
function eliteMarkSvg(color) {
  return `<svg viewBox="-20 -20 40 40" overflow="visible">
    <path fill="#15141b" stroke="${PALETTE[color].css}" stroke-width="1.6" d="M0-15c8 0 15 6 15 14S9 16 0 16-15 8-15 0 -8-15 0-15z"/>
    ${ELEMENT_ICONS[color].replace('<svg ', `<svg x="-10" y="-10" width="20" height="20" color="${PALETTE[color].css}" `)}
  </svg>`;
}
const COMPASS_LABELS = {
  0: ['N', 'n'],
  90: ['E', ''],
  180: ['S', ''],
  270: ['W', ''],
  45: ['NE', 'sub'],
  135: ['SE', 'sub'],
  225: ['SW', 'sub'],
  315: ['NW', 'sub'],
};
export class Compass {
  ctx;
  tracker;
  root;
  strip;
  mask;
  markers = [];
  widthPx = 0;
  ppd = 1;
  lastHeading = NaN;
  dir = new Vector3();
  useCamDir;
  boss = null;
  perch = null;
  perchGone = false;
  aerie = null;
  aerieQ = null;
  aerieKnown = null;
  aerieUp = '';
  elites = new Map();
  entrances = new Map();
  indoorId = null;
  eliteGone = new Set();
  scanT = 0;
  constructor(host, ctx, tracker) {
    this.ctx = ctx;
    this.tracker = tracker;
    this.root = el('div', 'wb-compass', host);
    const back = washCanvas(46, 6.4, 'compass-back', 0.5);
    back.className = 'cp-back';
    this.root.appendChild(back);
    this.mask = el('div', 'cp-mask', this.root);
    el('div', 'cp-line', this.mask);
    this.strip = el('div', 'cp-strip', this.mask);
    for (const trial of TRIALS) {
      const mark = el('div', 'cp-mark', this.mask);
      mark.style.setProperty('--mc', PALETTE[trial.color].css);
      mark.insertAdjacentHTML('beforeend', prismSvg());
      el('div', 'cp-check', mark, CHECK_SVG);
      const dist = el('div', 'cp-dist', mark);
      this.markers.push({
        color: trial.color,
        root: mark,
        dist,
        pos: tracker.position(trial, new Vector3()),
        x: NaN,
        vis: true,
        meters: -1,
      });
    }
    el('div', 'cp-caret', this.root);
    this.useCamDir = !!ctx.player?.isStub || ctx.params.has('cam');
    try {
      const groundY = ctx.terrain.heightAt(BOSS_ARENA.x, BOSS_ARENA.z);
      this.boss = this.makeMark('cp-boss', BOSS_MARK_SVG, '#b9a6d9', new Vector3(BOSS_ARENA.x, groundY, BOSS_ARENA.z));
    } catch {
      this.boss = null;
    }
    try {
      const center = ctx.sky?.center;
      const pos =
        center && Number.isFinite(center.x + center.y + center.z)
          ? center
          : new Vector3(SKY_ISLAND.x, SKY_ISLAND.y, SKY_ISLAND.z);
      this.aerie = this.makeMark('cp-aerie unknown', AERIE_MARK_SVG, '#cfe8ff', pos);
      this.aerieQ = el('div', 'cp-q', this.aerie.root, '?');
    } catch {
      this.aerie = null;
    }
    tracker.onChange(() => this.refreshDone());
    this.refreshDone();
    this.layout();
  }
  updateAerie(heading, pos) {
    const aerie = this.aerie;
    if (!aerie) return;
    try {
      const center = this.ctx.sky?.center;
      if (center && Number.isFinite(center.x + center.y + center.z)) aerie.pos.copy(center);
    } catch {}
    let known = false;
    try {
      known = !!this.ctx.player?.hasItem?.('brushflight');
    } catch {
      known = false;
    }
    if (known !== this.aerieKnown) {
      if (this.aerieKnown === false && known)
        aerie.root.animate(
          [
            {
              opacity: 0.2,
              transform: `${aerie.root.style.transform} scale(2)`,
            },
            {
              opacity: 1,
              transform: aerie.root.style.transform,
            },
          ],
          {
            duration: 900,
            easing: 'cubic-bezier(.2,1.3,.4,1)',
          },
        );
      this.aerieKnown = known;
      setClass(aerie.root, 'unknown', !known);
    }
    const radius = Number(this.ctx.sky?.radius) || SKY_ISLAND.radius;
    const dist = Math.hypot(aerie.pos.x - pos.x, aerie.pos.z - pos.z);
    setClass(aerie.root, 'onit', dist < radius && Math.abs(pos.y - aerie.pos.y) < 30);
    this.placeMark(aerie, heading, pos);
    const up = aerie.pos.y - pos.y > 25 && dist >= 8 ? '▲ ' : '';
    if (up !== this.aerieUp || aerie.meters >= 0) {
      this.aerieUp = up;
      const meters = Math.round(dist);
      setText(aerie.dist, meters < 8 ? 'here' : `${up}${meters} m`);
    }
    this.aerieQ;
  }
  makeMark(cls, svg, color, pos) {
    const root = el('div', `cp-mark ${cls}`, this.mask);
    root.style.setProperty('--mc', color);
    root.insertAdjacentHTML('beforeend', svg);
    return {
      root,
      dist: el('div', 'cp-dist', root),
      pos: pos.clone(),
      x: NaN,
      vis: true,
      meters: -1,
    };
  }
  addElite(id, element, pos) {
    if (this.eliteGone.has(id) || !PALETTE[element]) return;
    let mark = this.elites.get(id);
    if (!mark) {
      mark = this.makeMark('cp-foe', eliteMarkSvg(element), PALETTE[element].css, pos ?? new Vector3());
      this.elites.set(id, mark);
    }
    if (pos && Number.isFinite(pos.x)) mark.pos.copy(pos);
  }
  removeElite(id) {
    this.eliteGone.add(id);
    const mark = this.elites.get(id);
    if (mark) {
      this.elites.delete(id);
      mark.root.animate(
        [
          {
            opacity: 1,
            transform: mark.root.style.transform,
          },
          {
            opacity: 0,
            transform: `${mark.root.style.transform} scale(1.8)`,
          },
        ],
        {
          duration: 600,
          easing: 'ease-out',
        },
      ).onfinish = () => mark.root.remove();
    }
  }
  addEntrance(id, variant, pos) {
    if (!id || this.entrances.has(id) || !pos || !Number.isFinite(pos.x + pos.z)) return;
    const color = variant === 'kiln' ? '#ff7a3c' : variant === 'cistern' ? '#7cc8ff' : '#ffd79a';
    const svg = variant === 'cave' ? CAVE_MARK_SVG : templeMarkSvg(color);
    const mark = this.makeMark(`cp-entrance ${variant}`, svg, variant === 'cave' ? '#b8f0dc' : color, pos);
    mark.root.animate(
      [
        {
          opacity: 0,
          transform: 'scale(2)',
        },
        {
          opacity: 1,
          transform: 'scale(1)',
        },
      ],
      {
        duration: 900,
        easing: 'cubic-bezier(.2,1.3,.4,1)',
        composite: 'add',
      },
    );
    this.entrances.set(id, mark);
  }
  setIndoor(indoorId) {
    if (indoorId !== this.indoorId) {
      this.indoorId = indoorId;
      setClass(this.root, 'indoor', !!indoorId);
    }
  }
  addPerch(pos) {
    if (!this.perch && !this.perchGone && pos && Number.isFinite(pos.x)) {
      this.perch = this.makeMark('cp-perch', PERCH_MARK_SVG, '#fff3d6', pos);
      this.perch.root.animate(
        [
          {
            opacity: 0,
            transform: 'scale(2.2)',
          },
          {
            opacity: 1,
            transform: 'scale(1)',
          },
        ],
        {
          duration: 900,
          easing: 'cubic-bezier(.2,1.3,.4,1)',
          composite: 'add',
        },
      );
    }
  }
  removePerch() {
    this.perchGone = true;
    const perch = this.perch;
    if (perch) {
      this.perch = null;
      perch.root.animate(
        [
          {
            opacity: 1,
          },
          {
            opacity: 0,
          },
        ],
        {
          duration: 900,
          easing: 'ease-out',
        },
      ).onfinish = () => perch.root.remove();
    }
  }
  bossDefeated() {
    const boss = this.boss;
    if (boss) {
      this.boss = null;
      boss.root.animate(
        [
          {
            opacity: 1,
          },
          {
            opacity: 0,
          },
        ],
        {
          duration: 1200,
          easing: 'ease-out',
        },
      ).onfinish = () => boss.root.remove();
    }
  }
  placeMark(mark, heading, pos) {
    const dx = mark.pos.x - pos.x;
    const dz = mark.pos.z - pos.z;
    let rel = ((Math.PI - Math.atan2(dx, dz)) * 180) / Math.PI - heading;
    rel = ((((rel + 180) % 360) + 360) % 360) - 180;
    const vis = Math.abs(rel) < 99;
    if (vis !== mark.vis) {
      mark.vis = vis;
      setStyle(mark.root, 'visibility', vis ? 'visible' : 'hidden');
    }
    if (!vis) return;
    const x = this.widthPx / 2 + rel * this.ppd;
    if (!(Math.abs(x - mark.x) <= 0.3)) {
      mark.x = x;
      setStyle(mark.root, 'transform', `translate3d(${x.toFixed(1)}px,0,0)`);
    }
    const meters = Math.round(Math.hypot(dx, dz));
    if (meters !== mark.meters) {
      mark.meters = meters;
      setText(mark.dist, meters < 8 ? 'here' : `${meters} m`);
    }
  }
  scanElites(pos) {
    let nearby = [];
    try {
      nearby = this.ctx.enemies?.query?.(pos, 55) ?? [];
    } catch {
      return;
    }
    for (const enemy of nearby) {
      const elite = enemy?.elite;
      if (elite && enemy.alive && !enemy.boss) this.addElite(enemy.id, elite.element, enemy.position);
    }
    for (const [id, mark] of this.elites) {
      let enemy;
      try {
        enemy = this.ctx.enemies?.get?.(id);
      } catch {
        enemy = undefined;
      }
      if (enemy && enemy.position && Number.isFinite(enemy.position.x))
        if (enemy.alive) mark.pos.copy(enemy.position);
        else this.removeElite(id);
    }
  }
  refreshDone() {
    for (const marker of this.markers) setClass(marker.root, 'done', this.tracker.done.has(marker.color));
  }
  layout() {
    const width = this.root.getBoundingClientRect().width || this.root.offsetWidth;
    if (!width) return;
    this.widthPx = width;
    this.ppd = width / 190;
    this.strip.textContent = '';
    const frag = document.createDocumentFragment();
    for (let deg = -180; deg <= 540; deg += 15) {
      const wrapped = ((deg % 360) + 360) % 360;
      const x = (deg + 180) * this.ppd;
      const label = COMPASS_LABELS[wrapped];
      if (label) {
        const lbl = el('div', `cp-lbl ${label[1]}`, null, label[0]);
        lbl.style.left = `${x.toFixed(1)}px`;
        frag.appendChild(lbl);
      } else {
        const tick = el('div', 'cp-tick');
        tick.style.left = `${x.toFixed(1)}px`;
        frag.appendChild(tick);
      }
    }
    this.strip.appendChild(frag);
    this.lastHeading = NaN;
    for (const marker of this.markers) marker.x = NaN;
    TRIALS.forEach((trial, i) => this.tracker.position(trial, this.markers[i].pos));
  }
  heading() {
    let yaw;
    if (this.useCamDir || !Number.isFinite(this.ctx.player?.cameraYaw)) {
      this.ctx.camera.getWorldDirection(this.dir);
      yaw = Math.atan2(this.dir.x, this.dir.z);
    } else yaw = this.ctx.player.cameraYaw;
    let deg = ((Math.PI - yaw) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }
  update() {
    if (!this.widthPx) this.layout();
    if (!this.widthPx) return;
    const heading = this.heading();
    if (Math.abs(heading - this.lastHeading) > 0.02 || Number.isNaN(this.lastHeading)) {
      this.lastHeading = heading;
      setStyle(
        this.strip,
        'transform',
        `translate3d(${(this.widthPx / 2 - (heading + 180) * this.ppd).toFixed(1)}px,0,0)`,
      );
    }
    const position = this.ctx.player?.state?.position;
    if (position) {
      this.scanT -= 1 / 60;
      if (this.scanT <= 0) {
        this.scanT = 0.5;
        this.scanElites(position);
        try {
          if (this.boss && this.ctx.boss?.defeated) this.bossDefeated();
        } catch {}
      }
      if (this.boss) this.placeMark(this.boss, heading, position);
      if (this.perch) {
        this.placeMark(this.perch, heading, position);
        const boss = this.boss;
        setClass(
          this.perch.root,
          'stacked',
          !!boss && boss.vis && this.perch.vis && Math.abs(boss.x - this.perch.x) < 30,
        );
      }
      for (const elite of this.elites.values()) this.placeMark(elite, heading, position);
      for (const entrance of this.entrances.values()) this.placeMark(entrance, heading, position);
      this.updateAerie(heading, position);
      for (const marker of this.markers) {
        const dx = marker.pos.x - position.x;
        const dz = marker.pos.z - position.z;
        let rel = ((Math.PI - Math.atan2(dx, dz)) * 180) / Math.PI - heading;
        rel = ((((rel + 180) % 360) + 360) % 360) - 180;
        const vis = Math.abs(rel) < 99;
        if (vis !== marker.vis) {
          marker.vis = vis;
          setStyle(marker.root, 'visibility', vis ? 'visible' : 'hidden');
        }
        if (!vis) continue;
        const x = this.widthPx / 2 + rel * this.ppd;
        if (!(Math.abs(x - marker.x) <= 0.3)) {
          marker.x = x;
          setStyle(marker.root, 'transform', `translate3d(${x.toFixed(1)}px,0,0)`);
        }
        const meters = Math.round(Math.hypot(dx, dz));
        if (meters !== marker.meters) {
          marker.meters = meters;
          setText(marker.dist, meters < 8 ? 'here' : `${meters} m`);
        }
      }
    }
  }
}
