/**
 * The wardrobe: looks for the hero sold for Orb credits (orb.shop): scarves, hoods and glider
 * canopies. What is for sale, and at what price, is the orb-shop list in index.html (the copy Orb
 * charges by); what this player owns comes from Orb, so a look bought once is theirs on every device
 * they sign in on; what they wear is kept in localStorage. Looks only: none changes how the game plays.
 */
import { Color } from 'three';
import { PALETTE } from '../core/config.js';
import { HERO_COLORS } from '../character/body-mesh.js';

const WORN_KEY = 'wildbrush.wardrobe.v2';
const SCARF_KEY = 'wildbrush.wardrobe.v1'; // before hoods and gliders: the scarf alone
/** How fast a scarf that shifts as you go moves through its colours (phase per second). */
export const CYCLE_SPEED = 0.12;

/** The wardrobe's tabs, in order; each look is worn in one of them. */
export const SLOTS = [
  { id: 'scarf', name: 'Scarves' },
  { id: 'hood', name: 'Hoods' },
  { id: 'glider', name: 'Gliders' },
];

const css = (hex) => '#' + new Color(hex).getHexString();
const toward = (hex, target, t) => '#' + new Color(hex).lerp(new Color(target), t).getHexString();
const scaled = (hex, k) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const hsl = (h, s, l) => new Color().setHSL(((h % 1) + 1) % 1, s, l);
/** A scarf dyed one colour: [base, dark, band]. */
const dyed = (hex) => [hex, toward(hex, '#000000', 0.38), toward(hex, '#ffffff', 0.6)];
/** A hood dyed one colour: [base, light, lining], lit and shaded like the classic. */
const hooded = (hex) => [hex, scaled(hex, 1.22), scaled(hex, 0.58)];
const prism = (phase) => [hsl(phase, 0.85, 0.55), hsl(phase + 0.08, 0.8, 0.32), hsl(phase + 0.5, 0.9, 0.78)];
const aurora = (phase) => {
  const hue = 0.56 + 0.2 * Math.sin(phase * Math.PI * 2);
  return [hsl(hue, 0.75, 0.55), hsl(hue + 0.06, 0.7, 0.3), hsl(hue - 0.22, 0.8, 0.82)];
};

/**
 * Every look, in the wardrobe's order; the first of each slot is the hero's own, free. A scarf has
 * `colors` [base, dark, band, tip?] (the tails fade to tip) or a `cycle` (its colours at a phase that
 * moves on while it's worn); a hood has `colors` [base, light, lining]; a glider a `canopy`, a key of
 * character/glider.js CANOPIES. `swatch`: its colour in the wardrobe (or `swatches`, a blend).
 */
export const LOOKS = [
  { id: 'scarf-classic', slot: 'scarf', name: 'Classic', free: true, swatch: css(HERO_COLORS.scarf) },
  { id: 'scarf-ember', slot: 'scarf', name: 'Ember', colors: dyed(PALETTE.red.css) },
  { id: 'scarf-frost', slot: 'scarf', name: 'Frost', colors: dyed(PALETTE.blue.css) },
  { id: 'scarf-spring', slot: 'scarf', name: 'Spring', colors: dyed(PALETTE.yellow.css) },
  { id: 'scarf-bloom', slot: 'scarf', name: 'Bloom', colors: dyed(PALETTE.green.css) },
  { id: 'scarf-rose', slot: 'scarf', name: 'Rose', colors: dyed('#e8789e') },
  { id: 'scarf-midnight', slot: 'scarf', name: 'Midnight', colors: ['#2b4380', '#16234a', '#ecc45c'] },
  { id: 'scarf-snow', slot: 'scarf', name: 'Snow', colors: ['#f1f4f7', '#b6c3ce', '#8fb3d4'] },
  { id: 'scarf-gold', slot: 'scarf', name: 'Gold', colors: ['#e2ab3f', '#9a6a1a', '#fff1bf'] },
  {
    id: 'scarf-sunset',
    slot: 'scarf',
    name: 'Sunset',
    colors: ['#f6a04c', '#b8552a', '#ffe3a6', '#9150b4'],
    swatches: ['#f6a04c', '#e0607e', '#9150b4'],
  },
  {
    id: 'scarf-prism',
    slot: 'scarf',
    name: 'Prism',
    cycle: prism,
    swatches: [PALETTE.red.css, PALETTE.yellow.css, PALETTE.green.css, PALETTE.blue.css],
  },
  { id: 'scarf-aurora', slot: 'scarf', name: 'Aurora', cycle: aurora, swatches: ['#3fd18f', '#3aa7e0', '#8a5ee0'] },
  { id: 'hood-classic', slot: 'hood', name: 'Classic', free: true, swatch: css(HERO_COLORS.hood) },
  { id: 'hood-crimson', slot: 'hood', name: 'Crimson', colors: hooded('#932d2d') },
  { id: 'hood-plum', slot: 'hood', name: 'Plum', colors: hooded('#5f3b80') },
  { id: 'hood-moss', slot: 'hood', name: 'Moss', colors: hooded('#56722d') },
  { id: 'hood-sand', slot: 'hood', name: 'Sand', colors: hooded('#b28c55') },
  { id: 'hood-snow', slot: 'hood', name: 'Snow', colors: hooded('#dde3e8') },
  { id: 'hood-night', slot: 'hood', name: 'Night', colors: hooded('#222d52') },
  { id: 'glider-classic', slot: 'glider', name: 'Classic', free: true },
  { id: 'glider-night', slot: 'glider', name: 'Starry', canopy: 'night' },
  { id: 'glider-prism', slot: 'glider', name: 'Prism', canopy: 'prism' },
  { id: 'glider-leaf', slot: 'glider', name: 'Leaf', canopy: 'leaf' },
  { id: 'glider-sunset', slot: 'glider', name: 'Sunset', canopy: 'sunset' },
];

const BY_ID = new Map(LOOKS.map((look) => [look.id, look]));
export const lookOf = (id) => BY_ID.get(id) ?? null;
const classics = () => Object.fromEntries(SLOTS.map((slot) => [slot.id, LOOKS.find((look) => look.slot === slot.id && look.free).id]));

/** A scarf's colours (one that shifts as you go, at `phase`), or null for the outfit's own. */
export function scarfColors(id, phase = 0) {
  const look = lookOf(id);
  if (look?.slot !== 'scarf') return null;
  return look.cycle ? look.cycle(phase) : (look.colors ?? null);
}
/** A hood's colours, or null for the classic. */
export const hoodColors = (id) => (lookOf(id)?.slot === 'hood' ? (lookOf(id).colors ?? null) : null);
/** A glider's canopy, or null for the classic. */
export const gliderCanopy = (id) => (lookOf(id)?.slot === 'glider' ? (lookOf(id).canopy ?? null) : null);
/** What a player wears, from the looks their pose carries (Wardrobe.looks): a look per slot, the classic where it says none. */
export function wornOf(looks) {
  const worn = classics();
  for (const id of typeof looks === 'string' ? looks.split(' ') : []) {
    const look = lookOf(id);
    if (look) worn[look.slot] = id;
  }
  return worn;
}

/** The orb-shop list of the page: [{ id, name, price, emoji?, description? }]. */
function shopList() {
  try {
    const list = JSON.parse(document.getElementById('orb-shop')?.textContent || '{}').items;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const NOTES = {
  sign_in: 'Sign in to Orb to buy it: it’s kept with your account.',
  no_credits: 'Not enough Orb credits for that one yet.',
  not_saved: 'This copy of the world isn’t saved on Orb, so it sells nothing.',
  not_on_orb: 'Open Wildbrush on Orb to get it.',
  looking: 'Orb is playing the world right now: try again in a moment.',
  busy: 'Orb is already asking about something else.',
  failed: 'Couldn’t reach Orb. Try again in a moment.',
};

export class Wardrobe {
  ctx;
  owned = new Set(LOOKS.filter((look) => look.free).map((look) => look.id));
  /** What the hero wears, a look per slot; `wanted` is what they last chose, worn once Orb says it's theirs. */
  worn = classics();
  wanted = classics();
  buying = null;
  note = null;
  listeners = new Set();
  phase = 0;
  sinceTint = 0;
  constructor(ctx) {
    this.ctx = ctx;
    const sold = new Map(shopList().map((item) => [item.id, item]));
    this.items = LOOKS.flatMap((look) => {
      if (look.free) return [{ ...look, price: 0 }];
      const item = sold.get(look.id);
      return item && item.price > 0 ? [{ ...look, price: item.price }] : [];
    });
    const sells = (id, slot) => this.items.some((item) => item.id === id && item.slot === slot);
    try {
      const saved = JSON.parse(localStorage.getItem(WORN_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        for (const slot of SLOTS) if (sells(saved[slot.id], slot.id)) this.wanted[slot.id] = saved[slot.id];
      } else {
        const scarf = localStorage.getItem(SCARF_KEY);
        if (sells(scarf, 'scarf')) this.wanted.scarf = scarf;
      }
    } catch {}
    this.refreshOwned();
  }
  get onOrb() {
    return !!window.orb?.shop;
  }
  /** What others see this player wear (orb/visitors.js): the looks they wear that aren't the hero's own. */
  get looks() {
    return SLOTS.map((slot) => this.worn[slot.id])
      .filter((id) => !lookOf(id)?.free)
      .join(' ');
  }
  isWorn(id) {
    return this.worn[lookOf(id)?.slot] === id;
  }
  /** Ask Orb what this player owns here (at the start, and after the wardrobe opens). */
  refreshOwned() {
    const shop = window.orb?.shop;
    if (!shop || this.items.every((item) => item.free)) return;
    shop.owned().then(
      (ids) => {
        for (const id of Array.isArray(ids) ? ids : []) if (typeof id === 'string') this.owned.add(id);
        let put = false;
        for (const slot of SLOTS) {
          const id = this.wanted[slot.id];
          if (id !== this.worn[slot.id] && this.owned.has(id)) {
            this.worn[slot.id] = id;
            put = true;
          }
        }
        if (put) this.apply();
        this.changed();
      },
      () => {},
    );
  }
  /** Orb's own sheet asks the player (at the price on the page's list); worn as soon as it's theirs. */
  async buy(id) {
    const item = this.items.find((x) => x.id === id);
    if (!item || this.owned.has(id) || this.buying) return false;
    if (!this.onOrb) {
      this.note = { id, text: NOTES.not_on_orb };
      this.changed();
      return false;
    }
    this.buying = id;
    this.note = null;
    this.changed();
    let result;
    try {
      result = await window.orb.shop.buy(id);
    } catch {
      result = { ok: false, reason: 'failed' };
    }
    this.buying = null;
    if (result?.ok) {
      this.owned.add(id);
      this.wear(id);
      this.ctx.events.emit('wardrobe:bought', { id });
    } else if (result?.reason !== 'cancelled') this.note = { id, text: NOTES[result?.reason] ?? NOTES.failed };
    this.changed();
    this.refreshOwned();
    return !!result?.ok;
  }
  wear(id, save = true) {
    const item = this.items.find((x) => x.id === id);
    if (!item || !this.owned.has(id)) return false;
    this.worn[item.slot] = id;
    this.wanted[item.slot] = id;
    if (save)
      try {
        localStorage.setItem(WORN_KEY, JSON.stringify(this.wanted));
      } catch {}
    this.apply();
    this.changed();
    return true;
  }
  apply() {
    const character = this.ctx.character;
    const scarf = lookOf(this.worn.scarf);
    if (!scarf?.cycle) character?.setScarf?.(scarf?.colors ?? null);
    character?.setHood?.(hoodColors(this.worn.hood));
    character?.setGlider?.(gliderCanopy(this.worn.glider));
  }
  update(dt) {
    const scarf = lookOf(this.worn.scarf);
    if (!scarf?.cycle) return;
    this.phase = (this.phase + dt * CYCLE_SPEED) % 1;
    this.sinceTint += dt;
    if (this.sinceTint < 1 / 30) return;
    this.sinceTint = 0;
    this.ctx.character?.setScarf?.(scarf.cycle(this.phase));
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed() {
    for (const fn of this.listeners)
      try {
        fn();
      } catch (err) {
        console.warn('[wardrobe] listener failed', err);
      }
  }
}
