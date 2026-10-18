/**
 * Per-context hero signal bus (air jumps, flame rings, frost patches) shared by the player, character and audio systems. Also computes how dark it is around the hero (caves, dim interiors, night), which drives the lantern.
 */
class SignalBus {
  map = new Map();
  on(type, fn) {
    let listeners = this.map.get(type);
    if (!listeners) this.map.set(type, (listeners = new Set()));
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  emit(type, data) {
    const listeners = this.map.get(type);
    if (listeners)
      for (const fn of listeners)
        try {
          fn(data);
        } catch (err) {
          console.warn(`[hero signal] ${String(type)} listener failed`, err);
        }
  }
}
const buses = new WeakMap();
export function heroSignals(ctx) {
  let bus = buses.get(ctx);
  if (!bus) buses.set(ctx, (bus = new SignalBus()));
  return bus;
}
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
export function darkness(ctx) {
  try {
    const interior = ctx.interiors?.current;
    if (interior) {
      const ambient = Number(interior.lighting?.ambient ?? 0.25);
      return interior.kind === 'cave' ? 1 : Number.isFinite(ambient) ? 1 - smoothstep(0.35, 0.65, ambient) : 1;
    }
    const tod = Number(ctx.environment?.timeOfDay);
    const hour = Number.isFinite(tod) ? ((tod % 24) + 24) % 24 : 12;
    return Math.min(1, Math.max(0, 1 - smoothstep(5.6, 6.6, hour) + smoothstep(18.1, 19.1, hour)));
  } catch {
    return 0;
  }
}
