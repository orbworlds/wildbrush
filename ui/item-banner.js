/**
 * Item banner: when the hero gets an item, a painted card shows its icon, title, description and a tip with key caps, timed to the item hold-up pose.
 */
import { COLORS, ITEMS, PALETTE } from '../core/config.js';
import { ITEM_HOLD } from '../shared/combat-defs.js';
import { ringCanvas, splatCanvas, strokeCanvas, tint, washCanvas } from './brush.js';
import { el } from './dom.js';
import { cloudstepIcon, emberCrestIcon, frostCrestIcon, lanternIcon } from './gear-icons.js';
import {
  brushflightIcon,
  chromaBrushIcon,
  heartContainerIcon,
  rainbowGradient,
  rainbowStroke,
  skyMantleIcon,
  staminaVesselIcon,
} from './item-icons.js';
const iconCache = new Map();
function itemIconURL(item) {
  let url = iconCache.get(item);
  if (!url) {
    url = (
      {
        chromaBrush: chromaBrushIcon,
        brushflight: brushflightIcon,
        staminaVessel: staminaVesselIcon,
        skyMantle: skyMantleIcon,
        lantern: lanternIcon,
        emberCrest: emberCrestIcon,
        frostCrest: frostCrestIcon,
        cloudstep: cloudstepIcon,
      }[item] ?? heartContainerIcon
    )(6).toDataURL();
    iconCache.set(item, url);
  }
  return url;
}
function withArticle(noun) {
  return /^the\s/i.test(noun)
    ? `the ${noun.replace(/^the\s+/i, '')}`
    : /^[aeiou]/i.test(noun)
      ? `an ${noun}`
      : `a ${noun}`;
}
const ITEM_TIPS = {
  chromaBrush: 'Strikes need no ink and burst in a second colour. Charge a spin to loose a rainbow wave.',
  heartContainer: 'Your hearts are restored.',
  brushflight: 'R ride · W fly where you look · Space rise · C dive · Shift boost · hold LMB paint the ground',
  staminaVessel: 'Your stamina grows! Climb, glide and boost for longer.',
  skyMantle: 'Shift-boosting costs half the stamina. Your glider floats longer.',
  lantern: 'It shines by itself in dark caves and at night.',
  emberCrest: 'Fireball: a bigger blast, less ink, a lingering ring of fire.',
  frostCrest: 'Ice Lance: pierces every foe, freezes longer, leaves an icy path.',
  cloudstep: 'Space in mid-air jump again · Space once more open the glider',
};
const ITEM_TITLES = {
  brushflight: 'You learned Brushflight!',
  staminaVessel: 'You got a Stamina Vessel!',
  skyMantle: 'You got the Sky Mantle!',
  cloudstep: 'You got the Cloudstep Boots!',
};
function itemBannerTheme(item) {
  return item === 'chromaBrush'
    ? {
        cls: 'chroma',
        rainbow: true,
        cols: [],
        ring: '',
        under: '',
      }
    : item === 'brushflight'
      ? {
          cls: 'chroma flight',
          rainbow: true,
          cols: [],
          ring: '',
          under: '',
        }
      : item === 'staminaVessel'
        ? {
            cls: 'vessel',
            rainbow: false,
            cols: ['#58d66b', '#9dffc0', '#2fc774', '#e9fff0'],
            ring: '#7dffb0',
            under: '#6dffa4',
          }
        : item === 'skyMantle'
          ? {
              cls: 'mantle',
              rainbow: false,
              cols: ['#8cc6f4', '#ffd25e', '#ff8f86', '#f6f1e6'],
              ring: '#ffd25e',
              under: '#8cc6f4',
            }
          : item === 'lantern'
            ? {
                cls: 'lantern',
                rainbow: false,
                cols: ['#ffc46a', '#ffe2a8', '#ff9a3c', '#fff1c8'],
                ring: '#ffc46a',
                under: '#ffb84a',
              }
            : item === 'emberCrest'
              ? {
                  cls: 'ember',
                  rainbow: false,
                  cols: ['#ff5b3a', '#ffb03a', '#ff8a4a', '#ffe0a0'],
                  ring: '#ff7a3c',
                  under: '#ff5b3a',
                }
              : item === 'frostCrest'
                ? {
                    cls: 'frost',
                    rainbow: false,
                    cols: ['#4cc3ff', '#bfe8ff', '#2c7fd6', '#f2fbff'],
                    ring: '#7cc8ff',
                    under: '#4cc3ff',
                  }
                : item === 'cloudstep'
                  ? {
                      cls: 'cloud',
                      rainbow: false,
                      cols: ['#ffffff', '#bfe2ff', '#8cc6f4', '#fff6d8'],
                      ring: '#cfe8ff',
                      under: '#8cc6f4',
                    }
                  : {
                      cls: 'heart',
                      rainbow: false,
                      cols: ['#ff3f64', '#ff8fa6'],
                      ring: '#ff6f8e',
                      under: '#ff6f8e',
                    };
}
const KEYCAP_WORDS = new Set(['R', 'W', 'Space', 'C', 'Shift', 'LMB', 'RMB', 'F', 'E', 'Q', 'Tab']);
function appendKeyChips(host, text) {
  for (const part of text.split(' · ')) {
    const chip = el('span', 'ib-chip', host);
    for (const word of part.split(' '))
      if (KEYCAP_WORDS.has(word)) el('span', `wb-key${word.length > 1 ? ' wide' : ''}`, chip, word);
      else chip.append(`${word} `);
  }
}
export class ItemBanner {
  ctx;
  root;
  box = null;
  showAt = -1;
  hideAt = -1;
  pending = null;
  open = false;
  elapsed = 0;
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-itembanner', host);
  }
  onItem(item) {
    if (ITEMS[item]) {
      this.pending = item;
      this.showAt = this.elapsed + ITEM_HOLD.reveal - 0.05;
      this.hideAt = this.elapsed + ITEM_HOLD.dur + 0.4;
    }
  }
  build(item) {
    this.close(true);
    const def = ITEMS[item];
    const isFlight = item === 'brushflight';
    const theme = itemBannerTheme(item);
    const rainbow = theme.rainbow;
    const box = el('div', `ib-box ${theme.cls}`, this.root);
    const wash = washCanvas(46, 17, 'ib-wash', 0.78);
    wash.className = 'ib-wash';
    box.appendChild(wash);
    const frame = strokeCanvas(40, 10.5, '#0d0e14', `ib-frame-${item}`, {
      widthFrac: 0.86,
      pts: [
        [0.02, 0.52],
        [0.3, 0.47],
        [0.7, 0.53],
        [0.98, 0.47],
      ],
      dry: 0.38,
      core: 0.9,
      alpha: 0.9,
      taperStart: 0.03,
      taperEnd: 0.06,
      wobble: 0.2,
    });
    frame.className = 'ib-frame';
    box.appendChild(frame);
    const spotColors = rainbow ? COLORS.map((color) => PALETTE[color].css) : theme.cols;
    [
      ['-2.4em', '-1.6em'],
      ['calc(100% - 2.4em)', 'calc(100% - 3.2em)'],
      ['calc(100% - 3.6em)', '-2em'],
      ['-1.2em', 'calc(100% - 2.8em)'],
    ].forEach(([x, y], i) => {
      const color = spotColors[i % spotColors.length];
      const spot = splatCanvas(5, color, `ib-spot-${item}-${i}`, {
        rFrac: 0.14 + (i % 2) * 0.03,
        tendrils: 6,
        drops: 10,
        reach: 1.1,
        rim: true,
      });
      spot.className = 'ib-spot';
      spot.style.left = x;
      spot.style.top = y;
      spot.style.animationDelay = `${0.12 + i * 0.07}s`;
      box.appendChild(spot);
    });
    const icon = el('div', 'ib-icon', box);
    const ring = rainbow
      ? (() => {
          const canvas = ringCanvas(7, '#ffffff', 'ib-ring', 0.075, {
            dry: 0.35,
          });
          const g = canvas.getContext('2d');
          g.setTransform(1, 0, 0, 1, 0, 0);
          tint(g, rainbowGradient(g, 0, canvas.width), canvas.width, canvas.height);
          return canvas;
        })()
      : ringCanvas(7, theme.ring, `ib-ring-${item}`, 0.075, {
          dry: 0.35,
        });
    ring.className = 'ib-ring';
    icon.appendChild(ring);
    const img = el('i', 'ib-img', icon);
    img.style.backgroundImage = `url(${itemIconURL(item)})`;
    const text = el('div', 'ib-text', box);
    const title = el('div', 'ib-title', text);
    title.textContent = ITEM_TITLES[item] ?? `You got ${withArticle(def.name)}!`;
    const line = el('div', 'ib-line', text);
    const under = rainbow
      ? rainbowStroke(24, 1.6, 'ib-under', {
          widthFrac: 0.5,
          dry: 0.5,
          taperStart: 0.06,
          taperEnd: 0.35,
          core: 0.5,
        })
      : strokeCanvas(24, 1.6, theme.under, `ib-under-${item}`, {
          widthFrac: 0.5,
          dry: 0.5,
          taperStart: 0.06,
          taperEnd: 0.35,
          core: 0.5,
        });
    under.className = 'ib-stroke';
    line.appendChild(under);
    el('div', 'ib-desc', text).textContent = def.description;
    const tip = ITEM_TIPS[item];
    if (tip && (isFlight || item === 'cloudstep')) appendKeyChips(el('div', 'ib-tip ib-keys', text), tip);
    else if (tip) el('div', 'ib-tip', text).textContent = tip;
    box.offsetWidth;
    box.classList.add('in');
    this.box = box;
    this.open = true;
  }
  close(instant = false) {
    const box = this.box;
    if (box) {
      this.box = null;
      this.open = false;
      if (instant) {
        box.remove();
        return;
      }
      box.classList.remove('in');
      box.classList.add('out');
      setTimeout(() => box.remove(), 600);
    }
  }
  update(dt) {
    this.elapsed += dt;
    if (this.pending && this.elapsed >= this.showAt) {
      const item = this.pending;
      this.pending = null;
      this.build(item);
    }
    if (!this.open) return;
    const itemHold = this.ctx.player?.state?.itemHold;
    if (itemHold ? itemHold.t >= ITEM_HOLD.lower - 0.1 : this.elapsed >= this.hideAt) this.close();
  }
}
