/**
 * Sound synthesis worker: on a 'render' message it renders every procedural sound recipe offline,
 * in priority order and skipping ids already cached, and posts each finished sound back with its
 * sample buffers transferred. The recipes are the ones the main-thread fallback uses (recipes.js).
 */
import { RECIPES, renderSound } from './recipes.js';

const ctx = self;
ctx.onmessage = (ev) => {
  const msg = ev.data;
  if (msg?.type !== 'render') return;
  const skip = new Set(msg.skip ?? []);
  for (const def of RECIPES)
    if (!skip.has(def.id))
      try {
        const sound = renderSound(def);
        const transfer = [];
        for (const channels of sound.vars) for (const ch of channels) transfer.push(ch.buffer);
        ctx.postMessage(
          {
            type: 'sound',
            sound,
          },
          transfer,
        );
      } catch (err) {
        ctx.postMessage({
          type: 'error',
          id: def.id,
          message: String(err?.stack ?? err),
        });
      }
  ctx.postMessage({
    type: 'done',
  });
};
