// What the live Wildbrush build is made of, as established by tools/decompile/identify.mjs:
// which chunk is which system, where the libraries sit inside the entry chunk, and the exact
// library versions (matched byte-for-byte or by fingerprint alignment).

export const ORIGIN = 'https://wildbrush.vercel.app';

export const VERSIONS = {
  three: '0.186.1', // three.core/three.module r186 (0.186.0 and 0.186.1 builds are identical)
  rapier: '0.21.0', // @dimforge/rapier3d-compat: embedded WASM is byte-identical
  lilGui: '0.21.0',
  simplexNoise: '4.0.3',
  postprocessing: '6.39.5', // pmndrs postprocessing, inlined in the render chunk
  n8ao: '2.0.1', // N8AO ambient occlusion, inlined in the render chunk
  fontsource: '5.3.0', // @fontsource/cinzel and @fontsource-variable/nunito: font files byte-identical
};

export const IMPORT_MAP = {
  imports: {
    three: `https://cdn.jsdelivr.net/npm/three@${VERSIONS.three}/build/three.module.js`,
    'three/addons/': `https://cdn.jsdelivr.net/npm/three@${VERSIONS.three}/examples/jsm/`,
    // N8AO imports three/examples/jsm/postprocessing/Pass.js
    'three/examples/jsm/': `https://cdn.jsdelivr.net/npm/three@${VERSIONS.three}/examples/jsm/`,
    '@dimforge/rapier3d-compat': `https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@${VERSIONS.rapier}/dist/rapier.mjs`,
    'lil-gui': `https://cdn.jsdelivr.net/npm/lil-gui@${VERSIONS.lilGui}/dist/lil-gui.esm.js`,
    'simplex-noise': `https://cdn.jsdelivr.net/npm/simplex-noise@${VERSIONS.simplexNoise}/dist/esm/simplex-noise.js`,
    postprocessing: `https://cdn.jsdelivr.net/npm/postprocessing@${VERSIONS.postprocessing}/build/index.js`,
    n8ao: `https://cdn.jsdelivr.net/npm/n8ao@${VERSIONS.n8ao}/dist/N8AO.js`,
  },
};

/** Library chunks: replaced by imports (exported name → library export). */
export const LIB_CHUNKS = {
  'three.core-DFiMdTvi.js': { source: 'three', map: 'map-three-core.json', overrides: { En: 'ReversedDepthFuncs', v: 'ColorManagement' } },
  'BufferGeometryUtils-DQ2VyRlx.js': { source: 'three/addons/utils/BufferGeometryUtils.js', map: 'map-bgu.json' },
};

/**
 * Application chunks in the order they are processed (dependencies first). `dir` is the folder
 * of the decompiled module(s); entry chunks (loaded by the boot) keep their `create` export.
 */
export const APP_CHUNKS = [
  { file: 'index-D9AhHOn0.js', name: 'index', dir: 'core', main: true },
  { file: 'signals-DTd5o0VY.js', name: 'signals', dir: 'shared' },
  { file: 'skyground-b2tRwISP.js', name: 'skyground', dir: 'shared' },
  { file: 'artdefs-DGloOU95.js', name: 'artdefs', dir: 'shared' },
  { file: 'util-B5nH5oxN.js', name: 'util', dir: 'shared' },
  { file: 'hints-Cuh7l1uz.js', name: 'hints', dir: 'shared' },
  { file: 'chests-Bz72fjJ7.js', name: 'chests', dir: 'shared' },
  { file: 'ink-CyRBoTPw.js', name: 'ink', dir: 'shared' },
  { file: 'treeSpecies-BUQLnmez.js', name: 'treeSpecies', dir: 'shared' },
  { file: 'render-Bg7DJhwm.js', name: 'render', dir: 'render', entry: true },
  { file: 'paint-DPWlG1ZU.js', name: 'paint', dir: 'paint', entry: true },
  { file: 'terrain-KTXjirmi.js', name: 'terrain', dir: 'terrain', entry: true },
  { file: 'water-DvAoIGJY.js', name: 'water', dir: 'water', entry: true },
  { file: 'vegetation-BAJ8ooGY.js', name: 'vegetation', dir: 'vegetation', entry: true },
  { file: 'elements-Dqrzpsbu.js', name: 'elements', dir: 'elements', entry: true },
  { file: 'enemies-C9evYR9S.js', name: 'enemies', dir: 'enemies', entry: true },
  { file: 'boss-D7QGrMym.js', name: 'boss', dir: 'boss', entry: true },
  { file: 'sky-B7wRjF5B.js', name: 'sky', dir: 'sky', entry: true },
  { file: 'caverns-DV9Bd1vo.js', name: 'caverns', dir: 'caverns', entry: true },
  { file: 'temples-B-TGmSpf.js', name: 'temples', dir: 'temples', entry: true },
  { file: 'player-BWE2CXZl.js', name: 'player', dir: 'player', entry: true },
  { file: 'character-DjBl7MSN.js', name: 'character', dir: 'character', entry: true },
  { file: 'content-CdF1gaAg.js', name: 'content', dir: 'content', entry: true },
  { file: 'ui-B6m58HFF.js', name: 'ui', dir: 'ui', entry: true },
  { file: 'audio-poB4Ix8l.js', name: 'audio', dir: 'audio', entry: true },
  { file: 'debug-BrTCcdHg.js', name: 'debug', dir: 'audio', entry: true, defaultPath: 'audio/debug.js' },
];

export const WORKERS = [{ file: 'synth.worker-uMR_s6Wv.js', path: 'audio/synth.worker.js', url: '/assets/synth.worker-uMR_s6Wv.js' }];
export const STYLES = [{ file: 'ui-ChleCx4p.css', path: 'styles/ui.css' }];

/**
 * Byte ranges of the entry chunk that are library code, and how the game reaches into them.
 * `names` maps a minified local of the range to its library export ('default' for a default import).
 */
export const INDEX_LIB_RANGES = [
  { lib: 'vite', from: 0, to: 2360 }, // __vite__mapDeps + the modulepreload polyfill
  { lib: 'three', from: 2360, to: 354400, source: 'three', map: 'map-index-three.module.json' },
  { lib: 'rapier', from: 354400, to: 4687704, source: '@dimforge/rapier3d-compat', names: { Ac: 'default' } },
  { lib: 'lil-gui', from: 4687704, to: 4718342, source: 'lil-gui', names: { Kc: 'GUI' } },
  { lib: 'vite', from: 4732805, to: 4734016 }, // Vite's dynamic-import preload helper
  { lib: 'orbit', from: 4735448, to: 4755301, source: 'three/addons/controls/OrbitControls.js', names: { ql: 'OrbitControls' } },
  { lib: 'simplex', from: 4755301, to: 4757403, source: 'simplex-noise', names: { hu: 'createNoise2D', gu: 'createNoise3D' } },
];
/** Library code inside other chunks (names from tools/decompile/maps, aligned against the builds). */
export const LIB_RANGES = {
  'index-D9AhHOn0.js': INDEX_LIB_RANGES,
  'render-Bg7DJhwm.js': [
    { lib: 'postprocessing', from: 8777, to: 160316, source: 'postprocessing', namesMap: 'names-render-pp.json' },
    { lib: 'n8ao', from: 160316, to: 318571, source: 'n8ao', namesMap: 'names-render-n8ao.json' },
  ],
  'elements-Dqrzpsbu.js': [
    { lib: 'rounded-box', from: 55376, to: 57012, source: 'three/addons/geometries/RoundedBoxGeometry.js', names: { Z: 'RoundedBoxGeometry' } },
  ],
};
/** The preload helper (`__vitePreload`) as the entry chunk exports it to the others. */
export const PRELOAD_HELPER = { local: 'Pl', export: 'l' };
/** Names for default imports. */
export const DEFAULT_IMPORT_NAMES = { '@dimforge/rapier3d-compat': 'RAPIER' };

export const FONT_URLS = {
  cinzel: `https://cdn.jsdelivr.net/npm/@fontsource/cinzel@${VERSIONS.fontsource}/files/`,
  nunito: `https://cdn.jsdelivr.net/npm/@fontsource-variable/nunito@${VERSIONS.fontsource}/files/`,
};
