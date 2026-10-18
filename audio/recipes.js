/**
 * Every sound recipe in one list: bright sounds such as ice steps, UI clicks and chimes render at 44.1 kHz, and the list is sorted so impulse responses, UI and footsteps render first and stingers last. Also renders a recipe's variations into trimmed, normalised buffers; shared by the synth worker and the main-thread fallback.
 */
import { AMBIENCE_SOUNDS } from './ambience-sounds.js';
import { ART_RECIPES } from './art-recipes.js';
import { BATTLE_RECIPES } from './battle-recipes.js';
import { BOSS_RECIPES } from './boss-sounds.js';
import { COMBAT_SOUNDS } from './combat-sounds.js';
import { CORE_RECIPES } from './core-recipes.js';
import { crossfadeLoop, finalize, hashString, mulberry32, normalize, trimTail } from './dsp.js';
import { FLIGHT_RECIPES } from './flight-recipes.js';
import { INTERIOR_RECIPES } from './interior-recipes.js';
import { SFX_RECIPES } from './sfx-recipes.js';
import { SKY_RECIPES } from './sky-recipes.js';
const HIFI_IDS = new Set([
  'step-ice',
  'step-grass',
  'step-path',
  'splat-frost',
  'splat-ember',
  'steam',
  'fire-out',
  'ui-click',
  'ui-hover',
  'st-pickup',
  'st-secret',
  'color-red',
  'color-blue',
  'color-yellow',
  'color-green',
  'ice-freeze',
  'st-item-get',
  'bs-crystal',
  'bs-barrier-down',
  'bm-anvil',
  'perch-socket',
]);
const ALL_RECIPES = [
  ...CORE_RECIPES,
  ...SFX_RECIPES,
  ...AMBIENCE_SOUNDS,
  ...COMBAT_SOUNDS,
  ...ART_RECIPES,
  ...BATTLE_RECIPES,
  ...BOSS_RECIPES,
  ...FLIGHT_RECIPES,
  ...SKY_RECIPES,
  ...INTERIOR_RECIPES,
].map((recipe) =>
  HIFI_IDS.has(recipe.id) && !recipe.sr
    ? {
        ...recipe,
        sr: 44100,
      }
    : recipe,
);
function renderPriority(id) {
  return id.startsWith('ir-')
    ? 0
    : id.startsWith('ui-') || id.startsWith('step-')
      ? 1
      : id.startsWith('amb-sky-') ||
          id.startsWith('sky-') ||
          id.startsWith('vine-') ||
          id === 'wind-gust' ||
          id === 'storm-crackle'
        ? 6
        : id.startsWith('amb-') || id === 'fire-loop'
          ? 2
          : ['jump', 'land-soft', 'land-heavy', 'throw', 'splat', 'bounce', 'glide-open', 'glide-close'].includes(id) ||
              /^(swing-|hit-|smudge-|spitter-|brute-|telegraph|hero-hurt|lock-|charge-)/.test(id)
            ? 3
            : id.startsWith('art-')
              ? 4
              : id.startsWith('bt-') || id.startsWith('pizz:') || id.startsWith('bm-')
                ? 5
                : id.startsWith('bs-')
                  ? 6
                  : id.startsWith('piano:') || id.startsWith('fl-')
                    ? 5
                    : id.startsWith('fm-') || id.startsWith('perch-') || id.startsWith('st-')
                      ? 7
                      : id.startsWith('harp:') || id.startsWith('celesta:')
                        ? 6
                        : 4;
}
export const RECIPES = ALL_RECIPES.map((recipe, i) => ({
  d: recipe,
  i,
  p: renderPriority(recipe.id),
}))
  .sort((a, b) => a.p - b.p || a.i - b.i)
  .map((entry) => entry.d);
RECIPES.map((recipe) => recipe.id);
export function renderSound(recipe) {
  const sr = recipe.sr ?? 32000;
  const vars = [];
  const count = recipe.vars ?? 1;
  const seed = hashString(recipe.id);
  for (let i = 0; i < count; i++) {
    const rand = mulberry32(seed + i * 7919 + 13);
    const out = recipe.render(sr, rand, i);
    let channels = Array.isArray(out) ? out : [out];
    if (recipe.loop) channels = channels.map((ch) => crossfadeLoop(finalize(ch, sr, 0, 0), sr, recipe.loop));
    else {
      channels = channels.map((ch) => finalize(ch, sr));
      if (!recipe.keepTail) channels = trimTail(channels, sr);
    }
    const norm = recipe.norm ?? (recipe.loop ? 'long' : 'short');
    normalize(channels, sr, norm, recipe.level ?? (norm === 'long' ? -20 : -16));
    vars.push(channels);
  }
  return {
    id: recipe.id,
    sr,
    vars,
  };
}
