/**
 * Playing together on Orb. Everyone in the world's room walks the island as a hero, in the scarf
 * they wear (orb/visitors.js), and paint is shared: a blob someone throws flies from their brush
 * and lands in everyone's world, painting it and setting off its element there (fire, frost,
 * bounce, growth). Someone who comes in is sent the latest splats so the shared painting doesn't
 * start blank. Everything else (enemies, the boss, trials, items) stays each player's own. Outside
 * Orb there is no room and nothing happens.
 */
import { Vector3 } from 'three';
import { COLORS } from '../core/config.js';
import { showVisitors } from './visitors.js';

const SNAPSHOT_SPLATS = 80;
const MAX_REPLAY_PER_FRAME = 6;
const round = (n) => Math.round(n * 1000) / 1000;
const vec3 = (a) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) && a.every((n) => Math.abs(n) < 5000) ? new Vector3(a[0], a[1], a[2]) : null);
const isColor = (c) => typeof c === 'string' && COLORS.includes(c);

export function createMultiplayer(ctx) {
  const stats = { peers: 0, sent: 0, received: 0, thrown: 0, snapshots: 0, painted: 0, ignored: 0 };
  const api = { stats, room: null, visitors: null };
  const orb = window.orb;
  if (!orb?.room) return api;

  const recent = []; // the latest splats on the land, local and remote: [x, y, z, radius, color]
  const replay = []; // a snapshot being painted, a few splats a frame
  let snapshotDone = false;
  let room = null;

  ctx.events.on('paint:throw', (e) => {
    if (e?.remote || !room || !room.peers.size) return;
    room.send({ k: 'throw', o: e.origin.toArray().map(round), v: e.velocity.toArray().map(round), c: e.color });
    stats.sent++;
  });
  ctx.events.on('paint:splat', (e) => {
    if (e?.surface !== 'world' || !e.position || !isColor(e.color)) return;
    recent.push([round(e.position.x), round(e.position.y), round(e.position.z), round(e.radius ?? 1), e.color]);
    if (recent.length > SNAPSHOT_SPLATS) recent.shift();
  });

  const name = (peer) => String(peer?.name || 'Someone').slice(0, 40);
  const toast = (title, subtitle) => {
    try {
      ctx.ui?.toast?.(title, subtitle, 'green');
    } catch {}
  };
  /** The one of us who greets a newcomer: the lowest peer id, the newcomer aside. */
  const greeter = (newcomer) => {
    let low = room.self?.id ?? '';
    for (const id of room.peers.keys()) if (id !== newcomer && id < low) low = id;
    return low === room.self?.id;
  };

  function onMessage(peer, data) {
    if (!data || typeof data !== 'object') return;
    stats.received++;
    if (data.k === 'throw') {
      const origin = vec3(data.o);
      const velocity = vec3(data.v);
      if (!origin || !velocity || !isColor(data.c) || velocity.length() > 60) return void stats.ignored++;
      if (ctx.paint?.throwBlob?.(origin, velocity, data.c, { remote: true })) stats.thrown++;
      api.visitors?.flick(peer?.id, origin, velocity);
    } else if (data.k === 'splats' && !snapshotDone && Array.isArray(data.list)) {
      snapshotDone = true;
      stats.snapshots++;
      for (const s of data.list.slice(-SNAPSHOT_SPLATS)) {
        if (!Array.isArray(s) || s.length !== 5) continue;
        const at = vec3(s.slice(0, 3));
        if (at && Number.isFinite(s[3]) && s[3] > 0 && s[3] < 8 && isColor(s[4])) replay.push([at, s[3], s[4]]);
      }
    }
  }

  function onEvent(ev) {
    if (!ev) return;
    if (ev.type === 'joined') {
      stats.peers = room?.peers.size ?? ev.peers?.length ?? 0;
      if (!stats.peers) snapshotDone = true;
      else toast(stats.peers === 1 ? `${name(ev.peers[0])} is painting here too` : `${stats.peers} painters are here`, 'Their paint lands in your world, and yours in theirs');
    } else if (ev.type === 'join') {
      stats.peers = room.peers.size;
      toast(`${name(ev.peer)} came to paint`, 'Their paint lands in your world, and yours in theirs');
      if (recent.length && greeter(ev.peer?.id)) room.send({ k: 'splats', list: recent });
    } else if (ev.type === 'leave') {
      stats.peers = room.peers.size;
      toast(`${name(ev.peer)} left`, '');
    } else if (ev.type === 'message' && ev.peer?.id !== room?.self?.id) onMessage(ev.peer, ev.data);
  }

  try {
    room = orb.room.join(onEvent);
    api.room = room;
  } catch (err) {
    console.warn('[orb] room unavailable', err);
  }
  ctx.events.once('game:ready', () => {
    try {
      api.visitors = showVisitors(ctx);
    } catch (err) {
      console.warn('[orb] visitors failed', err);
    }
  });

  api.update = () => {
    for (let i = 0; i < MAX_REPLAY_PER_FRAME && replay.length; i++) {
      const [at, radius, color] = replay.shift();
      ctx.paint?.paintSphere?.(at, radius, color);
      stats.painted++;
    }
  };
  // the others' heroes move on real time: not paused with your game, nor slowed with it
  api.lateUpdate = () => api.visitors?.update(ctx.time.realDt);
  return api;
}
