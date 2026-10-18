/**
 * The painter's camp beside the spawn point: fire ring, log seat, easel with a half-finished painting, crate of paint pots, brush jar, bedroll, tent, paintings drying on a line and a lantern post.
 */
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Euler,
  Float32BufferAttribute,
  LineCurve3,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { displace, lathe, randRange, rng, rockGeometry, roundedBox, taperedTube, TAU } from '../shared/util.js';
import { localFrame, rubble, STONE, stoneColor } from './ruin-kit.js';
import { addClearing, Site } from './site.js';
const PAINTER_WOOD = 9069122;
const PAINTER_WOOD_DARK = 6177067;
function paintingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 400;
  const g = canvas.getContext('2d');
  const rand = rng('painting');
  g.fillStyle = '#f3ecdc';
  g.fillRect(0, 0, 512, 400);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(120,100,70,${rand() * 0.05})`;
    g.fillRect(rand() * 512, rand() * 400, 1.5, 1.5);
  }
  const blob = (x, y, radius, rgba, alpha) => {
    const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba.replace('A', String(alpha)));
    gradient.addColorStop(1, rgba.replace('A', '0'));
    g.fillStyle = gradient;
    g.beginPath();
    g.arc(x, y, radius, 0, TAU);
    g.fill();
  };
  g.save();
  g.beginPath();
  g.moveTo(0, 0);
  const paintEdge = (y) => 307.2 + Math.sin(y * 0.05) * 18 + Math.sin(y * 0.13) * 9;
  for (let y = 0; y <= 400; y += 8) g.lineTo(paintEdge(y), y);
  g.lineTo(0, 400);
  g.closePath();
  g.clip();
  const sky = g.createLinearGradient(0, 0, 0, 280);
  sky.addColorStop(0, 'rgba(110,170,225,0.95)');
  sky.addColorStop(1, 'rgba(225,236,240,0.9)');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 400);
  for (let i = 0; i < 18; i++) blob(rand() * 512, rand() * 400 * 0.45, 30 + rand() * 50, 'rgba(255,255,255,A)', 0.35);
  blob(92.16, 80, 70, 'rgba(255,236,190,A)', 0.8);
  const ridge = (baseY, peak, fill, center, phase) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(0, 400);
    for (let x = 0; x <= 512; x += 6) {
      const u = x / 512;
      const y =
        baseY -
        peak * Math.exp(-(((u - center) / 0.16) ** 2)) -
        Math.sin(u * 20 + phase) * 5 -
        Math.sin(u * 7 + phase) * 8;
      g.lineTo(x, y);
    }
    g.lineTo(512, 400);
    g.closePath();
    g.fill();
  };
  ridge(248, 152, 'rgba(120,140,175,0.85)', 0.55, 1);
  g.fillStyle = 'rgba(125,135,160,0.8)';
  g.fillRect(30.72, 144, 61.44, 120);
  ridge(288, 40, 'rgba(95,150,90,0.9)', 0.3, 2);
  ridge(336, 24, 'rgba(120,175,85,0.95)', 0.7, 3);
  for (let i = 0; i < 160; i++) {
    const x = rand() * 512;
    const y = 320 + rand() * 400 * 0.2;
    g.strokeStyle = `rgba(${60 + rand() * 60},${130 + rand() * 60},${50 + rand() * 30},0.6)`;
    g.lineWidth = 2 + rand() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 6, y - 8 - rand() * 14);
    g.stroke();
  }
  ['#ff5b3a', '#4cc3ff', '#ffd447', '#58d66b'].forEach((color, i) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(512 * (0.12 + i * 0.12), 120 + Math.sin(i) * 12, 4, 0, TAU);
    g.fill();
    g.fillRect(512 * (0.12 + i * 0.12) - 1, 120 + Math.sin(i) * 12, 2, -40);
  });
  g.restore();
  g.strokeStyle = 'rgba(70,65,60,0.55)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    for (let x = 281.6; x <= 512; x += 5) {
      const u = x / 512;
      const y =
        248 -
        152 * Math.exp(-(((u - 0.55) / 0.16) ** 2)) -
        Math.sin(u * 20 + 1) * 5 -
        Math.sin(u * 7 + 1) * 8 +
        (rand() - 0.5) * 3;
      if (x === 281.6) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const x = 317.44 + rand() * 512 * 0.36;
    const y = 260 + rand() * 400 * 0.3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 10 + rand() * 20, y + (rand() - 0.5) * 6);
    g.stroke();
  }
  g.strokeRect(440.32, 168, 14, 60);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
function paintLogGrain(geometry, center, axis) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = geometry.attributes.color;
  const bark = new Color(0x7a5236);
  const barkDark = new Color(0x4a3020);
  const ring = new Color(0xd6b48a);
  const ringDark = new Color(0xa87a50);
  const tint = new Color();
  const offset = new Vector3();
  const nrm = new Vector3();
  for (let i = 0; i < position.count; i++) {
    offset.fromBufferAttribute(position, i).sub(center);
    nrm.fromBufferAttribute(normal, i);
    const along = offset.dot(axis);
    const radial = offset.clone().addScaledVector(axis, -along);
    if (Math.abs(nrm.dot(axis)) > 0.75) tint.copy(ring).lerp(ringDark, 0.5 + 0.5 * Math.sin(radial.length() * 60));
    else {
      const angle = Math.atan2(radial.y, radial.x + radial.z);
      const stripe = 0.5 + 0.5 * Math.sin(angle * 14 + Math.sin(along * 3) * 1.5);
      tint.copy(bark).lerp(barkDark, stripe * stripe);
    }
    colors.setXYZ(i, tint.r, tint.g, tint.b);
  }
}
function campBox(w, h, d, radius = 0.02) {
  return roundedBox(w, h, d, radius, 3);
}
export function buildPainterCamp(ctx, mats, spot, yaw) {
  const rand = rng('camp');
  const site = new Site(ctx, 'camp');
  addClearing(spot.x + 0.3, spot.z + 0.4, 4.6);
  const at = localFrame(spot, yaw);
  const ground = (x, z, lift = 0) => {
    const p = at(x, 0, z);
    p.y = ctx.terrain.heightAt(p.x, p.z) + lift;
    return p;
  };
  const firePos = ground(0, 0);
  for (let i = 0; i < 13; i++) {
    const angle = (i / 13) * TAU;
    const pos = ground(Math.cos(angle) * 0.72, Math.sin(angle) * 0.72);
    site.stone(
      rockGeometry(randRange(rand, 0.13, 0.17), rand() * 99, 0.62),
      pos.add(new Vector3(0, 0.04, 0)),
      rand() * TAU,
      stoneColor(rand, STONE.grey),
    );
  }
  const ash = lathe(
    [
      [0, 0],
      [0.7, 0],
      [0.6, 0.04],
      [0, 0.05],
    ],
    16,
  );
  site.prop(ash, firePos.clone().add(new Vector3(0, -0.01, 0)), 0, 2827810);
  for (let i = 0; i < 3; i++) {
    const stick = lathe(
      [
        [0, 0],
        [0.09, 0],
        [0.1, 0.9],
        [0, 0.9],
      ],
      8,
    );
    stick.translate(0, -0.45, 0);
    const tilt = new Euler(Math.PI / 2 - 0.35, (i / 3) * TAU + 0.3, 0, 'YXZ');
    site.prop(stick, firePos.clone().add(new Vector3(0, 0.22, 0)), tilt, i === 0 ? 2759957 : 3877406);
  }
  {
    const logPos = ground(-2, 1.5, 0.2);
    const log = lathe(
      [
        [0, 0],
        [0.2, 0],
        [0.22, 0.05],
        [0.22, 1.6],
        [0.2, 1.65],
        [0, 1.65],
      ],
      14,
    );
    displace(log, 0.02, 3, 4);
    log.translate(0, -0.82, 0);
    paintLogGrain(
      site.prop(log, logPos, new Euler(0, yaw + 0.5, Math.PI / 2, 'YXZ'), PAINTER_WOOD),
      logPos,
      new Vector3(-Math.cos(yaw + 0.5), 0, Math.sin(yaw + 0.5)),
    );
    site.cylCol(logPos, 0.82, 0.22, new Quaternion().setFromEuler(new Euler(0, yaw + 0.5, Math.PI / 2, 'YXZ')));
  }
  const easelPos = ground(-1.8, -2.4);
  const easelYaw = yaw;
  const onEasel = localFrame(easelPos, easelYaw);
  const legs = [
    [onEasel(-0.45, 0, 0.2), onEasel(-0.12, 1.85, 0)],
    [onEasel(0.45, 0, 0.2), onEasel(0.12, 1.85, 0)],
    [onEasel(0, 0, -0.65), onEasel(0, 1.75, -0.05)],
  ];
  for (const [from, to] of legs) {
    const leg = taperedTube(new LineCurve3(from, to), 2, 5, () => 0.03);
    site.prop(leg, new Vector3(), 0, PAINTER_WOOD);
  }
  site.prop(campBox(1.15, 0.05, 0.12), onEasel(0, 0.72, 0.16), easelYaw, PAINTER_WOOD);
  site.prop(campBox(0.9, 0.04, 0.06), onEasel(0, 1.58, 0.1), easelYaw, PAINTER_WOOD);
  site.prop(campBox(1.04, 0.84, 0.04), onEasel(0, 1.16, 0.1), new Euler(-0.12, easelYaw, 0, 'YXZ'), 15327436);
  const texture = paintingTexture();
  const material = new MeshStandardMaterial({
    map: texture,
    roughness: 0.9,
  });
  const painting = new Mesh(new PlaneGeometry(0.98, 0.78), material);
  painting.position.copy(onEasel(0, 1.16, 0.125));
  painting.rotation.set(-0.12, easelYaw, 0, 'YXZ');
  painting.castShadow = false;
  painting.receiveShadow = true;
  painting.name = 'camp-painting';
  site.group.add(painting);
  {
    const handle = onEasel(-0.35, 0.77, 0.2);
    const tip = onEasel(0.2, 0.79, 0.24);
    site.prop(
      taperedTube(new LineCurve3(handle, tip), 2, 5, (t) => 0.012 + t * 0.004),
      new Vector3(),
      0,
      12094026,
    );
    site.prop(
      lathe(
        [
          [0, 0],
          [0.02, 0],
          [0.024, 0.05],
          [0, 0.09],
        ],
        6,
      ),
      tip,
      new Euler(0, easelYaw, -Math.PI / 2, 'YXZ'),
      5822059,
    );
  }
  site.boxCol(onEasel(0, 0.9, 0), 0.5, 0.9, 0.35, easelYaw);
  const cratePos = ground(-0.2, -2.9);
  site.prop(campBox(0.7, 0.55, 0.55, 0.03), cratePos.clone().add(new Vector3(0, 0.27, 0)), yaw + 0.2, PAINTER_WOOD);
  for (let i = 0; i < 3; i++)
    site.prop(
      campBox(0.72, 0.05, 0.08, 0.01),
      cratePos
        .clone()
        .add(new Vector3(0, 0.1 + i * 0.18, 0))
        .add(at(0, 0, 0.28).sub(spot).setY(0)),
      yaw + 0.2,
      PAINTER_WOOD_DARK,
    );
  site.boxCol(cratePos.clone().add(new Vector3(0, 0.27, 0)), 0.35, 0.28, 0.28, yaw + 0.2);
  const paints = [16735034, 5030911, 16766023, 5822059];
  for (let i = 0; i < 4; i++) {
    const potPos = cratePos.clone().add(new Vector3(((i % 2) - 0.5) * 0.3, 0.55, (Math.floor(i / 2) - 0.5) * 0.24));
    const pot = lathe(
      [
        [0, 0],
        [0.08, 0],
        [0.1, 0.03],
        [0.1, 0.13],
        [0.11, 0.15],
        [0.09, 0.16],
        [0, 0.16],
      ],
      12,
    );
    site.prop(pot, potPos, 0, 12089941);
    const paint = lathe(
      [
        [0, 0],
        [0.088, 0],
        [0.085, 0.01],
        [0, 0.015],
      ],
      12,
    );
    site.prop(paint, potPos.clone().add(new Vector3(0, 0.145, 0)), 0, paints[i]);
    const angle = rand() * TAU;
    site.prop(
      campBox(0.035, 0.07, 0.02, 0.01),
      potPos.clone().add(new Vector3(Math.cos(angle) * 0.1, 0.1, Math.sin(angle) * 0.1)),
      -angle,
      paints[i],
    );
  }
  for (let i = 0; i < 4; i++) {
    const pos = ground(randRange(rand, -2.5, 0.5), randRange(rand, -3.6, -1.6), 0.015);
    const splat = lathe(
      [
        [0, 0],
        [randRange(rand, 0.1, 0.22), 0],
        [0.05, 0.012],
        [0, 0.014],
      ],
      10,
    );
    site.prop(splat, pos, rand() * TAU, paints[i], new Vector3(1, 1, randRange(rand, 0.6, 1.2)));
  }
  {
    const jarPos = ground(0.55, -2.6);
    site.prop(
      lathe(
        [
          [0, 0],
          [0.08, 0],
          [0.09, 0.2],
          [0.075, 0.22],
          [0, 0.22],
        ],
        10,
      ),
      jarPos,
      0,
      7311253,
    );
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * TAU;
      const base = jarPos.clone().add(new Vector3(Math.cos(angle) * 0.03, 0.05, Math.sin(angle) * 0.03));
      const tip = base.clone().add(new Vector3(Math.cos(angle) * 0.12, 0.45, Math.sin(angle) * 0.12));
      site.prop(
        taperedTube(new LineCurve3(base, tip), 2, 4, () => 0.01),
        new Vector3(),
        0,
        12884570,
      );
      site.prop(
        lathe(
          [
            [0, 0],
            [0.018, 0],
            [0.02, 0.04],
            [0, 0.07],
          ],
          6,
        ),
        tip,
        new Euler(Math.cos(angle) * 0.25, 0, -Math.sin(angle) * 0.25),
        paints[i],
      );
    }
  }
  {
    const bedPos = ground(2.3, 1, 0);
    const quiltW = 1.05;
    const quiltL = 2.05;
    const quilt = new PlaneGeometry(quiltW, quiltL, 10, 20).rotateX(-Math.PI / 2);
    quilt.deleteAttribute('uv');
    const position = quilt.attributes.position;
    const colors = [];
    const patchColors = [
      new Color(0xb5523f),
      new Color(0xd9a441),
      new Color(0x4f6d8a),
      new Color(0xe8dcc0),
      new Color(0x7a8f4a),
    ];
    const quiltRand = rng('quilt');
    const patches = [];
    for (let i = 0; i < 12; i++) patches.push(Math.floor(quiltRand() * patchColors.length));
    const quiltYaw = yaw + 0.25;
    const cosY = Math.cos(quiltYaw);
    const sinY = Math.sin(quiltYaw);
    for (let j = 0; j < position.count; j++) {
      const x = position.getX(j);
      const z = position.getZ(j);
      const edge = Math.max(Math.abs(x) / (quiltW / 2), Math.abs(z) / (quiltL / 2));
      const wx = bedPos.x + x * cosY + z * sinY;
      const wz = bedPos.z - x * sinY + z * cosY;
      const dy = ctx.terrain.heightAt(wx, wz) - bedPos.y;
      const wrinkle = Math.sin(z * 7 + x * 2) * 0.012 + Math.sin(x * 9) * 0.008;
      const puff = (1 - edge ** 6) * 0.07 + (z < -2.05 * 0.3 ? 0.03 : 0);
      position.setY(j, dy + 0.02 + puff + wrinkle);
      const patch = patchColors[
        patches[Math.min(2, Math.floor((x / quiltW + 0.5) * 3)) + Math.min(3, Math.floor((z / quiltL + 0.5) * 4)) * 3]
      ]
        .clone()
        .multiplyScalar(edge > 0.93 ? 0.7 : 1);
      colors.push(patch.r, patch.g, patch.b);
    }
    quilt.setAttribute('color', new Float32BufferAttribute(colors, 3));
    quilt.computeVertexNormals();
    site.add('prop', quilt, bedPos, quiltYaw);
    const pillow = roundedBox(0.6, 0.16, 0.36, 0.08, 4);
    site.prop(pillow, bedPos.clone().add(at(0, 0, -0.78).sub(spot).setY(0.12)), yaw + 0.25, 15722194);
    const bedroll = lathe(
      [
        [0, 0],
        [0.2, 0],
        [0.22, 0.05],
        [0.22, 0.9],
        [0.2, 0.95],
        [0, 0.95],
      ],
      14,
    );
    bedroll.translate(0, -0.47, 0);
    const rollPos = ground(2.2, 2.6, 0.22);
    site.prop(bedroll, rollPos, new Euler(0, yaw + 0.3, Math.PI / 2, 'YXZ'), 10370869);
    for (const offset of [-0.25, 0.25]) {
      const strap = lathe(
        [
          [0, 0],
          [0.23, 0],
          [0.23, 0.04],
          [0, 0.04],
        ],
        14,
      );
      strap.translate(0, -0.02, 0);
      site.prop(
        strap,
        rollPos.clone().add(new Vector3(Math.cos(yaw + 0.3) * offset, 0, -Math.sin(yaw + 0.3) * offset)),
        new Euler(0, yaw + 0.3, Math.PI / 2, 'YXZ'),
        4863270,
      );
    }
  }
  {
    const rockPos = ground(3, -2.2);
    const rock = rockGeometry(0.6, 12, 0.7);
    site.stone(rock, rockPos.clone().add(new Vector3(0, 0.15, 0)), 0, stoneColor(rand, STONE.grey));
    site.ballCol(rockPos.clone().add(new Vector3(0, 0.15, 0)), 0.55);
    const packPos = rockPos.clone().add(at(-0.55, 0, 0.45).sub(spot).setY(0.33));
    const pack = roundedBox(0.5, 0.62, 0.32, 0.12, 4);
    site.prop(pack, packPos, new Euler(-0.25, yaw + 2.4, 0, 'YXZ'), 8018490);
    const flap = roundedBox(0.52, 0.2, 0.34, 0.08, 4);
    site.prop(flap, packPos.clone().add(new Vector3(0, 0.3, 0)), new Euler(-0.25, yaw + 2.4, 0, 'YXZ'), 6177578);
    site.prop(
      lathe(
        [
          [0, 0],
          [0.04, 0],
          [0.04, 0.5],
          [0, 0.5],
        ],
        8,
      ),
      packPos.clone().add(new Vector3(0.1, 0.2, 0)),
      new Euler(0.3, 0, 0.2),
      15260864,
    );
  }
  {
    const tentPos = ground(2.55, 1.05);
    const tentLen = 2.5;
    const halfW = 1.05;
    const tentH = 1.55;
    const tentYaw = yaw + 0.25;
    const onTent = localFrame(tentPos, tentYaw);
    const slant = Math.hypot(halfW, tentH);
    const slope = Math.atan2(tentH, halfW);
    const cloth = new Color(0xe9dcc0);
    for (const side of [-1, 1]) {
      const panel = roundedBox(0.035, slant + 0.12, tentLen, 0.015, 2.5);
      const position = panel.attributes.position;
      const colors = [];
      const tint = new Color();
      for (let j = 0; j < position.count; j++) {
        const y = position.getY(j);
        const z = position.getZ(j);
        position.setX(j, position.getX(j) + Math.sin((z / tentLen + 0.5) * Math.PI) * 0.05 * (1 - Math.abs(y) / slant));
        const daub = Math.sin(z * 3.1 + side) * Math.sin(y * 4.3) > 0.82;
        tint.copy(cloth).multiplyScalar(y < -slant / 2 + 0.12 ? 0.8 : 1);
        if (daub) tint.lerp(new Color(colors.length % 2 ? 5030911 : 16747098), 0.35);
        colors.push(tint.r, tint.g, tint.b);
      }
      panel.computeVertexNormals();
      panel.setAttribute('color', new Float32BufferAttribute(colors, 3));
      const pos = onTent(side * halfW * 0.5, tentH / 2, 0);
      pos.y = tentPos.y + tentH / 2;
      site.add('prop', panel, pos, new Euler(0, tentYaw, side * (Math.PI / 2 - slope), 'YXZ'));
    }
    {
      const gable = new BufferGeometry();
      gable.setAttribute('position', new Float32BufferAttribute([-1.05, 0, 0, halfW, 0, 0, 0, tentH, 0], 3));
      gable.computeVertexNormals();
      const backPos = onTent(0, 0, tentLen / 2 - 0.05);
      backPos.y = tentPos.y;
      site.add('prop', gable, backPos, tentYaw, 1, 14207144);
      const gableBack = gable.clone();
      gableBack.rotateY(Math.PI);
      site.add('prop', gableBack, backPos.clone(), tentYaw, 1, 14207144);
    }
    for (const along of [-2.5 / 2 - 0.05, 1.3]) {
      const pos = onTent(0, 0, along);
      pos.y = ctx.terrain.heightAt(pos.x, pos.z) - 0.1;
      site.prop(
        lathe(
          [
            [0, 0],
            [0.035, 0],
            [0.03, 1.9],
            [0, 1.9500000000000002],
          ],
          6,
        ),
        pos,
        0,
        PAINTER_WOOD_DARK,
      );
    }
    {
      const ridgeFrom = onTent(0, 0, -2.5 / 2 - 0.15);
      const ridgeTo = onTent(0, 0, 1.4);
      ridgeFrom.y = ridgeTo.y = tentPos.y + tentH + 0.02;
      site.prop(
        taperedTube(new LineCurve3(ridgeFrom, ridgeTo), 2, 5, () => 0.03),
        new Vector3(),
        0,
        PAINTER_WOOD,
      );
    }
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const ropeTop = onTent(0, 0, end * 1.3);
        ropeTop.y = tentPos.y + tentH + 0.3;
        const peg = onTent(side * 0.4, 0, end * 2.35);
        peg.y = ctx.terrain.heightAt(peg.x, peg.z);
        site.prop(
          taperedTube(new LineCurve3(ropeTop, peg), 2, 3, () => 0.008),
          new Vector3(),
          0,
          13482127,
        );
        site.prop(
          lathe(
            [
              [0, 0],
              [0.025, 0],
              [0.02, 0.2],
              [0, 0.22],
            ],
            5,
          ),
          peg.clone().add(new Vector3(0, -0.05, 0)),
          0,
          PAINTER_WOOD_DARK,
        );
      }
    site.boxCol(onTent(0, tentH / 2, 0).setY(tentPos.y + tentH / 2), halfW, tentH / 2, tentLen / 2, tentYaw);
  }
  {
    const poleA = ground(-3.6, 3.3);
    const poleB = ground(0.8, 4.3);
    const poleH = 1.9;
    for (const pole of [poleA, poleB]) {
      site.prop(
        lathe(
          [
            [0, 0],
            [0.05, 0],
            [0.04, 2],
            [0, 2.05],
          ],
          6,
        ),
        pole.clone().add(new Vector3(0, -0.1, 0)),
        0,
        PAINTER_WOOD_DARK,
      );
      site.cylCol(pole.clone().add(new Vector3(0, poleH / 2, 0)), poleH / 2, 0.06);
    }
    const topA = poleA.clone().add(new Vector3(0, poleH, 0));
    const topB = poleB.clone().add(new Vector3(0, poleH, 0));
    const sag = topA
      .clone()
      .lerp(topB, 0.5)
      .add(new Vector3(0, -0.25, 0));
    const line = new QuadraticBezierCurve3(topA, sag, topB);
    site.prop(
      taperedTube(line, 12, 4, () => 0.012),
      new Vector3(),
      0,
      13482127,
    );
    const sheetColors = [16742997, 6080767, 16767322, 7001210];
    const dir = new Vector3().subVectors(topB, topA).normalize();
    const sheetYaw = Math.atan2(dir.x, dir.z) - Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const along = 0.14 + i * 0.24;
      const hang = line.getPoint(along);
      const w = randRange(rand, 0.55, 0.7);
      const h = randRange(rand, 0.6, 0.8);
      const sheet = roundedBox(w, h, 0.02, 0.008, 4);
      const position = sheet.attributes.position;
      const colors = [];
      const paper = new Color(0xf1e8d6);
      const paint = new Color(sheetColors[i]);
      const tint = new Color();
      for (let j = 0; j < position.count; j++) {
        const x = position.getX(j);
        const y = position.getY(j);
        position.setZ(j, position.getZ(j) + Math.sin(x * 5 + i) * 0.03 + (0.5 - y / h) * 0.04);
        const wash = MathUtils.smoothstep(-y / h + 0.3 + Math.sin(x * 7 + i) * 0.1, 0, 0.8);
        const stroke = Math.abs(y + Math.sin(x * 4 + i * 2) * 0.1) < 0.05 ? 0.4 : 0;
        tint.copy(paper).lerp(paint, Math.min(1, wash * 0.85 + stroke));
        colors.push(tint.r, tint.g, tint.b);
      }
      sheet.computeVertexNormals();
      sheet.setAttribute('color', new Float32BufferAttribute(colors, 3));
      site.add(
        'prop',
        sheet,
        hang.clone().add(new Vector3(0, -h / 2 - 0.02, 0)),
        new Euler(0.04, sheetYaw + (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.08, 'YXZ'),
      );
      for (const side of [-1, 1])
        site.prop(
          roundedBox(0.03, 0.09, 0.03, 0.01, 4),
          hang
            .clone()
            .add(dir.clone().multiplyScalar(side * w * 0.35))
            .add(new Vector3(0, -0.02, 0)),
          sheetYaw,
          PAINTER_WOOD,
        );
    }
  }
  let lantern;
  {
    const postPos = ground(1.2, -1.4);
    const postH = 1.75;
    const hook = postPos.clone().add(new Vector3(0.25, postH, 0));
    site.prop(
      taperedTube(
        new QuadraticBezierCurve3(
          postPos.clone().add(new Vector3(0, -0.2, 0)),
          postPos.clone().add(new Vector3(-0.05, postH * 0.6, 0)),
          hook,
        ),
        6,
        5,
        (t) => 0.04 - t * 0.015,
      ),
      new Vector3(),
      0,
      PAINTER_WOOD_DARK,
    );
    lantern = hook.clone().add(new Vector3(0.18, -0.28, 0));
    site.prop(
      lathe(
        [
          [0, 0],
          [0.09, 0],
          [0.1, 0.03],
          [0.1, 0.2],
          [0.06, 0.26],
          [0.02, 0.3],
          [0, 0.3],
        ],
        8,
      ),
      lantern.clone().add(new Vector3(0, -0.15, 0)),
      0,
      3814704,
    );
    site.prop(
      lathe(
        [
          [0, 0],
          [0.075, 0],
          [0.075, 0.15],
          [0, 0.15],
        ],
        8,
      ),
      lantern.clone().add(new Vector3(0, -0.12, 0)),
      0,
      16765066,
    );
    site.prop(
      taperedTube(new LineCurve3(hook, lantern.clone().add(new Vector3(0, 0.15, 0))), 2, 3, () => 0.008),
      new Vector3(),
      0,
      3814704,
    );
  }
  for (let i = 0; i < 3; i++) {
    const pos = ground(randRange(rand, -3.2, -2.2), randRange(rand, 0, 1.4), 0.03);
    site.prop(campBox(0.3, 0.005, 0.4, 0.002), pos, rand() * TAU, 15854038);
  }
  rubble(site, ctx, spot.x, spot.z, 5.5, 5, rand, 0.35);
  site.build(mats);
  return {
    fire: firePos,
    easel: easelPos,
    lantern,
  };
}
