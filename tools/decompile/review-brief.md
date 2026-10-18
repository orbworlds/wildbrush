# Naming review for the decompiled Wildbrush game

Wildbrush is a browser action-adventure game (three.js r186 + Rapier physics): a painterly island
where the hero paints with four colours (red Ember = fire, blue Frost = ice, yellow Spring =
bounce, green Bloom = growth), fights Smudges (ink enemies) and a boss (Greymaw), explores
caverns, temples and a sky island (the Painted Aerie), with procedural audio. Its production
bundle was decompiled mechanically: library code is already replaced by real imports (three,
Rapier, lil-gui, simplex-noise) with real names, syntax is un-minified, and many locals got
heuristic names. What is left are the minified names (`e`, `t`, `Xc`, `ll`, `Wu` …). Your job is
to give the code the names its authors most likely used, so it reads like the original source.

Every rename you give is applied by a scope-aware tool that keeps every reference pointing at the
same binding (it resolves clashes itself), so you only say *what* a binding should be called.

## How the code is organised

- `src/main.js` is the entry module (the "index" chunk): constants, core services and the boot.
  Boot builds a shared context object `ctx` = { params, renderer, scene, camera, RAPIER, physics
  (Rapier world), colliders, events (event bus with on/once/off/emit), input, time { elapsed, dt,
  realDt, scale, frame, hitStop(), slowMo() }, globals (shared shader uniforms), settings, debug,
  shotMode, interiors, … } and then loads 16 systems in order: environment, paint, terrain,
  water, vegetation, sky, elements, enemies, boss, caverns, temples, player, character, content,
  ui, audio. Each system module exports `async create(ctx)` returning an object stored as
  `ctx.<system>` (with optional `update(dt)` / `lateUpdate(dt)` called every frame). Each system
  has a stub fallback in main.js.
- Every other file is one system (`src/<system>/index.js`) or a module shared by several systems
  (`src/shared/*.js`). Comments `// ── unit N @offset ──` mark the smallest pieces the file can be
  cut into (a later tool splits files only at these marks).
- Imports at the top of each file are generated: never rename an import, and never rename
  anything you see used but not declared in your file/range — it is named where it's declared.
- Property names, method names, object keys, strings, GLSL and log messages are original. Use
  them as evidence: `console.warn('[interiors] travel failed')` inside a class says it's the
  interiors manager; a function returning `{ isStub: true, name: 'Greymaw', … }` is the boss stub.

## What to produce

Write ONE JSON file (with the Write tool) to the output path you were given:

```json
{
  "file": "<the reviewed file, relative to src/, e.g. main.js or enemies/index.js>",
  "chunk": "<the chunk name you were given>",
  "names": {
    "<line>:<currentName>": "<newName>"
  },
  "files": [
    { "path": "<folder>/<file>.js", "unit": <first unit number of this file>, "header": "<1–3 lines: what this file does in the game>" }
  ]
}
```

- `<line>` is the 1-based line number where the binding is DECLARED in the file you read (the
  line of the identifier itself: the `function x(`, `class x`, `const x =`, the parameter, the
  `catch (x)`, the `for (const x of`…). Use the line numbers the Read tool shows. If two bindings
  with the same name are declared on one line, the second is `<line>:<name>#2`.
- Only declarations inside the line range you were assigned.
- Priorities, in order:
  1. EVERY top-level binding in your range (functions, classes, constants, tables): all of them.
  2. Every parameter of every function/method/arrow in your range that is still minified.
  3. Locals that are still minified and carry meaning (skip throwaway math temporaries where a
     short name like `t`, `k`, `u`, `v`, `x`, `y`, `z` is genuinely the natural name — but rename
     them if a better name exists, e.g. `dist`, `height`, `angle`).
  4. Bindings with an auto-generated name that is wrong or vague (`item`, `data`, `vec3`, `mesh2`,
     `el`, `value`) may be improved, but only when you are confident.
- Style: camelCase for functions and variables; PascalCase for classes; UPPER_SNAKE_CASE for
  module-level constant tables and tuning constants (e.g. `PALETTE`, `LANDMARKS`, `GRAVITY_Y`).
  Systems' factory functions keep the name `create` where they are exported as `create`.
  Prefer names that say what a thing is in the game (`throwInkBlob`, `brambleGate`, `smudgeling`)
  over generic ones (`handler`, `obj`, `fn`). Shader source strings: `<THING>_VERTEX` /
  `<THING>_FRAGMENT` / `<THING>_GLSL`.
- Never use: JS reserved words, `undefined`, `arguments`, or browser globals as names (`window`,
  `document`, `name`, `event`, `length`, `top`, `parent`, `status`, `location`, `history`,
  `screen`, `origin`, `close`, `open`, `print`, `alert`, `fetch`, `Image`, `Audio`, `URL`, `Map`,
  `Set`, `Date`, `Math`, `JSON`, `Promise`, `Error`, `Node`, `Event`, `Worker`, `performance`).
- Top-level names within one chunk should be distinct; inner names may repeat freely.

### `files`: splitting the chunk into modules

Group consecutive units into files the way the original project most likely had them (one file
per cohesive module: a class with its helpers, a table of definitions, a shader, a feature). Each
entry starts a file at a unit; the file runs until the next entry. Rules:
- The first entry must start at the first unit of your range (for whole files: unit 0).
- Paths are relative to `src/`, kebab-case, `.js`, inside the folder you were given.
- For a system chunk, the unit containing `export … create` must be in `<folder>/index.js`.
- For the main chunk: the boot (the async function that builds ctx and runs the frame loop, and
  the statement that calls it) goes in `main.js`; everything else in `core/*.js` files.
- Aim for files of roughly 100–1500 lines; very small units belong with their neighbours.
- Header: plain sentences, no markdown, e.g. "Smudgeling AI: wander, notice the hero, lunge."

Be thorough: the measure of success is how close the result reads to the original source. When
done, reply with only: the output path, how many names you gave, and how many files you proposed.
