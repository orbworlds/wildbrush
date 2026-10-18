/**
 * Interior manager for the caverns and temples: fades the hero in and out, hides the outdoor world while inside and switches to the interior's lighting.
 */
const OUTDOOR_ROOTS_RE =
  /^(terrain|distant-scenery|water-root|vegetation|sky-|greymaw|boss-|glowcap-entrance|temple-gates|content-|perch-)/;
export class InteriorManager {
  ctx;
  defs = new Map();
  cur = null;
  traveling = false;
  detached = [];
  constructor(ctx) {
    this.ctx = ctx;
  }
  get current() {
    return this.cur;
  }
  register(def) {
    if (def && def.id && def.bounds) {
      this.defs.set(def.id, def);
      if (def.object && def !== this.cur) def.object.visible = false;
    }
  }
  unregister(id) {
    const def = this.defs.get(id);
    if (def) {
      this.defs.delete(id);
      if (def === this.cur) this.switchTo(null);
    }
  }
  at(pos) {
    if (!pos) return null;
    for (const def of this.defs.values()) if (def.bounds.containsPoint(pos)) return def;
    return null;
  }
  async travel(position, facing) {
    if (this.traveling || !position) return;
    this.traveling = true;
    const { ui, player } = this.ctx;
    try {
      player.setControlEnabled(false);
      await Promise.race([ui.fade(true, 0.45), sleep(900)]);
      const def = this.at(position);
      if (def?.object) def.object.visible = true;
      player.teleport(position, facing);
      this.update();
      await sleep(120);
      await Promise.race([ui.fade(false, 0.6), sleep(1100)]);
    } catch (err) {
      console.warn('[interiors] travel failed', err);
    } finally {
      player.setControlEnabled(true);
      this.traveling = false;
    }
  }
  detachOutdoors(interior) {
    const scene = this.ctx.scene;
    for (const child of [...scene.children])
      if (child !== interior.object && OUTDOOR_ROOTS_RE.test(child.name)) {
        scene.remove(child);
        this.detached.push(child);
      }
  }
  reattachOutdoors() {
    const scene = this.ctx.scene;
    for (const child of this.detached) if (!child.parent) scene.add(child);
    this.detached = [];
  }
  update() {
    const position = this.ctx.player?.state?.position;
    if (!position) return;
    const next = this.at(position);
    if (next !== this.cur) this.switchTo(next);
  }
  switchTo(next) {
    const prev = this.cur;
    this.cur = next;
    try {
      if (next && !prev) this.detachOutdoors(next);
      else if (!next && prev) this.reattachOutdoors();
    } catch (err) {
      console.warn('[interiors] outdoor culling failed', err);
    }
    if (prev?.object && prev !== next) prev.object.visible = false;
    if (next?.object) next.object.visible = true;
    try {
      this.ctx.environment.setInterior(next ? next.lighting : null);
    } catch (err) {
      console.warn('[interiors] environment.setInterior failed', err);
    }
    if (prev)
      this.ctx.events.emit('interior:exit', {
        id: prev.id,
        name: prev.name,
        kind: prev.kind,
      });
    if (next)
      this.ctx.events.emit('interior:enter', {
        id: next.id,
        name: next.name,
        kind: next.kind,
      });
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
