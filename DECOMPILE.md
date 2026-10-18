# Wildbrush

Wildbrush is a painterly three.js action-adventure: you paint a grey island back to life with four
colours (Ember fire, Frost ice, Spring bounce, Bloom growth), fight the ink Smudges, explore
Glowcap Caverns, the Paint Temples and a floating sky island, and face Greymaw. These notes are how
a production bundle of the game (no source maps) was turned back into this source.

## Results

| | |
|---|---|
| Input | The live build: 28 JS chunks, a worker, a stylesheet and 22 font files; 7.8 MB of JS and CSS, minified by Vite 8 (Rolldown/Oxc), no source maps |
| Libraries | 5.3 MB (69 %) identified and replaced by CDN imports at their exact versions: three.js 0.186.1 (with OrbitControls, BufferGeometryUtils, RoundedBoxGeometry), Rapier 0.21.0 (its embedded 3 MB WASM is byte-identical), postprocessing 6.39.5, N8AO 2.0.1, lil-gui 0.21.0, simplex-noise 4.0.3; the fonts are @fontsource 5.3.0's, byte for byte |
| Game code | 2.4 MB minified in 26 chunks → 277 ES modules in 19 folders (and two more for Orb), 130,000 lines, plus the 4,700-line stylesheet |
| Names | 36,000 bindings; the property names, strings and shaders survived minification, the variable names didn't: 31,000 were named by 36 reviewing agents working in parallel (an hour), the rest by heuristics; a few dozen minifier names are left |
| Equivalence | Played side by side (`tools/decompile/compare.mjs`) through 200 frames of scripted play (title screen, walk, jump, strafe, sword swing): both boot all 16 systems without an error and the hero's position, velocity, facing, stamina and camera match to four decimals at every checkpoint. The frames match pixel for pixel until play starts; after that a few butterflies drift apart (up to 2.5 % of the pixels by frame 200), exactly as far as two runs of the original drift apart under the same harness, because some ambient behaviour follows the wall clock. All 279 synthesized sounds are bit-identical |
| Time | 45 minutes to a decompiled build that boots all 16 of the game's systems without an error; 2¼ hours to the reviewed source; 3 hours to running natively inside Orb. Verifying it took about two hours more, as software WebGL draws a few frames a second |

### What came back, and what didn't

Exactly as written: all behaviour; every property, method and class-field name, object key and
string (UI copy, landmark notes such as "South meadow, gentle rolling grassland ~6-10m elevation.
Player spawns here facing north"), every GLSL shader with its comments, every log message, the
tuning numbers, the order of the code and with it where modules began and ended.

Reconstructed: identifier names, file names and the split into files (277 modules where the
bundle had 26 chunks of game code), a header comment per file, three.js constants the minifier
had inlined (`renderer.toneMapping = 4` reads `ACESFilmicToneMapping` again), hex colours,
`const`/`let`.

Lost for good: comments outside strings, the TypeScript types, the original paths, code that
tree-shaking dropped, and constant arithmetic the minifier folded (`0.8200000000000001` where the
source surely said `1 - DEADZONE`).

## How

Everything is reproducible from a production build (`npm install` here, then the steps in order):

1. `tools/decompile/fetch.mjs` mirrors the build into `.original/` (index.html and everything it
   reaches).
2. `tools/decompile/identify.mjs` finds the libraries. Minifiers rename variables but keep property
   names, strings, numbers and globals, so each top-level declaration has a fingerprint that
   survives; aligning the bundle's declarations in order against the real library builds (in
   `node_modules`) names each one (`cr` → `Vector3`) and shows where each library starts and ends
   (`config.mjs` records those byte ranges).
3. `tools/decompile/run.mjs` rebuilds the source: library code becomes imports; the syntax is
   un-minified (`!0` → `true`, comma sequences and `a && b()` → statements, `var` → `const`/`let`,
   `var X = class` → `class X`); identifiers are renamed by a scope-aware renamer that refuses any
   name that would change what an identifier refers to and verifies every reference afterwards;
   each chunk is cut into "units" at every point where nothing earlier refers to anything later
   (every original module boundary is such a point, so the cuts are always safe) and grouped into
   files as the plan says.
4. The plan (`tools/decompile/plan.json`) came from reviewers: `review-brief.md` was given to 36
   agents in two waves (the core and shared modules first, so the systems' reviewers saw good
   imported names), each reading up to 5,000 lines and answering with renames by `line:name`
   and a grouping of units into files; `ingest.mjs` turns these into stable ids (each binding's
   offset in the minified chunk), so a plan survives re-runs.
5. `tools/decompile/compare.mjs` plays the original and the decompiled build under identical
   conditions: seeded `Math.random` (three.js's UUIDs get their own stream, since the CDN build
   creates objects the tree-shaken one didn't), a virtual clock, `requestAnimationFrame`, timers
   and idle callbacks, a scripted click through the title screen, walking, jumping, strafing and a
   sword swing, and compares each checkpoint's WebGL frame and the hero's state. Run it against
   the original twice to see the game's own drift: the sound bank picks random variations of sounds
   the worker is still synthesizing in real time (`?stub=audio` removes that), and a little ambient
   life follows the wall clock even then.

After the decompilation, `src/` was changed by hand:

- The synth worker was a second, self-contained 9,300-line copy of the sound recipes, because
  Vite bundles workers on their own. Both copies render all 279 sounds bit-identically, so the
  worker now imports `audio/recipes.js` like the main-thread fallback, as the original source must
  have.
- In Orb's sandbox (an opaque origin) `new Worker(url)` throws; `core/spawn-worker.js` starts it
  through a `data:` URL module instead, so sounds are still made off the main thread.
- `orb/visitors.js` shows everyone else playing the world as heroes. Each is a copy of yours
  (`character/double.js`: the model, animator, scarf, glider and Sky Mantle) played back from the
  pose they send through `orb.visitors`: where they are and how they move, their mode, jumps,
  bounces, attacks and dodges, the colour in hand and the looks they wear; their throws flick its
  brush. It runs on its own clock, so they move on while you're in the pause menu, and Orb draws
  their name tags. The ground probes and the cloth fitting moved out of `character/index.js`
  (`character/probes.js`, `character/cloth-fit.js`) for the copies to share. Outside Orb this and
  the worker start do nothing different.
- `orb/multiplayer.js` shares paint. A blob one player throws is sent through the world's room and
  thrown again in each other player's world, so it paints their land and sets off the same element
  (fire, frost, bounce, growth). Someone who arrives is sent the latest splats, painted back a few
  a frame. A remote throw spends none of your ink. Enemies, the boss, trials and items stay each
  player's own: one shared simulation of those would need a host.
- `orb/wardrobe.js` sells looks for Orb credits: eleven scarves (100 for a plain colour, 200 for
  Gold and Sunset, 300 for the Prism and Aurora, which shift as you go), six hood dyes (150) and
  four glider canopies (250, the Prism 300). The page's `orb-shop` list is what Orb charges; what
  you own is your account's, so it follows you to every device, and what you wear is kept in the
  browser. The Wardrobe tab of the pause menu has a tab per kind of look and buys through Orb's own
  sheet. A scarf dyes the whole scarf: the cloth tails, and the wrap, knot and classic hood's
  bobble, which are part of the body mesh; a hood dyes the classic hood, its lining and the
  shoulder cape. Both are masks from the mesh builder, coloured by the body and outline materials,
  so others' heroes wear them too. Looks only: none changes how the game plays.
  `tools/test-together.mjs` plays two copies with a stand-in for Orb's room, visitors and shop.

## What this means for serving native games

- A shipped web client is its source. Minification hides nothing that matters: a working rebuild
  took 45 minutes of mostly mechanical work, and a project that reads like hand-written source
  and plays identically a few more hours, most of it parallel agent time. Anything a game sends to
  the browser (logic, content, shaders, recipes, unreleased areas behind flags) should be assumed
  public.
- Libraries cost nothing to strip out: two thirds of the bytes were identified by fingerprint and
  version, so what's left to understand is only the game itself.
- Names were the only real loss, and they are the part language models restore best, because
  the property names, strings and shaders around every variable survive.
- What raises the cost is moving what matters off the client: authoritative state on the server
  (progress, inventories, matches; Orb's rooms, stores and accounts), content streamed when it's
  needed, game logic compiled to WebAssembly (far harder to read back than JS). Obfuscation only
  slows a reader down, and agents are patient readers; licences and terms are the real protection
  for code that has to run in the browser.
- For Orb, whose native worlds are open by design (remixable, code visible), this means a world's
  value has to live in what Orb holds: its people, their saves and shared state, its rooms and its
  shop, not in the secrecy of its code.
