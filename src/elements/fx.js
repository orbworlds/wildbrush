/**
 * One-shot element effects built from puffs and glows: steam, sizzle, sparks, ignition bursts, ember puffs, frost, ice shards and the green bloom.
 */
export class ElementFx {
  puffs;
  glows;
  constructor(puffs, glows) {
    this.puffs = puffs;
    this.glows = glows;
  }
  steam(x, y, z, scale = 1) {
    const count = Math.round(16 * scale + 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.5 + Math.random() * 3.5) * Math.sqrt(scale);
      const size = (0.5 + Math.random() * 0.6) * Math.sqrt(scale);
      this.puffs.spawn(
        x + Math.cos(angle) * 0.4 * scale,
        y + Math.random() * 0.4,
        z + Math.sin(angle) * 0.4 * scale,
        Math.cos(angle) * speed,
        2.5 + Math.random() * 4.5 * Math.sqrt(scale),
        Math.sin(angle) * speed,
        1.3 + Math.random() * 1.6,
        size,
        size * (3.2 + Math.random() * 2.2),
        2.2,
        1.6,
        0.96,
        0.98,
        1,
        0.62 + Math.random() * 0.25,
        0,
        0.7,
        0.6,
      );
    }
    for (let i = 0; i < 8 * scale; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      this.glows.spawn(
        x,
        y + 0.2,
        z,
        Math.cos(angle) * speed,
        3 + Math.random() * 4,
        Math.sin(angle) * speed,
        0.5 + Math.random() * 0.4,
        0.04,
        0.5,
        -12,
        0.75,
        0.9,
        1,
        1.2,
        0.8,
        30,
        0.1,
        0,
      );
    }
  }
  sizzle(x, y, z) {
    for (let i = 0; i < 7; i++)
      this.puffs.spawn(
        x + (Math.random() - 0.5) * 0.8,
        y + 0.1,
        z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
        1.2 + Math.random() * 1.5,
        (Math.random() - 0.5) * 0.8,
        1 + Math.random() * 0.8,
        0.35,
        1.3,
        1.5,
        0.8,
        0.5,
        0.47,
        0.45,
        0.45,
        0.6,
        0.8,
        0.5,
      );
    this.sparks(x, y + 0.1, z, 14, 0.8);
  }
  sparks(x, y, z, count = 20, power = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (2 + Math.random() * 5) * power;
      this.glows.spawn(
        x,
        y,
        z,
        Math.cos(angle) * speed,
        (2 + Math.random() * 5) * power,
        Math.sin(angle) * speed,
        0.35 + Math.random() * 0.6,
        0.035 + Math.random() * 0.03,
        1.2,
        -9,
        1,
        0.72,
        0.32,
        4 + Math.random() * 3,
        1.2,
        25,
        0.15,
        1.2,
      );
    }
  }
  ignition(x, y, z, radius = 1.5) {
    this.sparks(x, y + 0.3, z, 18 + Math.round(radius * 6), 1);
    for (let i = 0; i < 10 + radius * 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      this.glows.spawn(
        x + Math.cos(angle) * dist,
        y + 0.3,
        z + Math.sin(angle) * dist,
        (Math.random() - 0.5) * 1.5,
        3 + Math.random() * 4,
        (Math.random() - 0.5) * 1.5,
        0.6 + Math.random() * 0.6,
        0.12 + Math.random() * 0.1,
        1.5,
        2,
        1,
        0.55,
        0.18,
        3.5,
        0.3,
        18,
        0.5,
        1,
      );
    }
    for (let i = 0; i < 5; i++)
      this.puffs.spawn(
        x + (Math.random() - 0.5) * radius,
        y + 0.4,
        z + (Math.random() - 0.5) * radius,
        Math.random() - 0.5,
        2 + Math.random() * 2,
        Math.random() - 0.5,
        1.4 + Math.random(),
        0.6,
        2.4,
        1.2,
        1.2,
        0.35,
        0.32,
        0.3,
        0.45,
        1.2,
        0.8,
        0.4,
      );
  }
  emberPuff(x, y, z, scale = 1) {
    for (let i = 0; i < 40 * scale; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.glows.spawn(
        x + (Math.random() - 0.5) * scale,
        y + (Math.random() - 0.5) * scale,
        z + (Math.random() - 0.5) * scale,
        Math.cos(angle) * speed,
        1 + Math.random() * 5,
        Math.sin(angle) * speed,
        0.8 + Math.random() * 1.6,
        0.04 + Math.random() * 0.05,
        1,
        1.5,
        1,
        0.6,
        0.2,
        3.5 + Math.random() * 3,
        0.6,
        16,
        0.7,
        1,
      );
    }
    for (let i = 0; i < 10 * scale; i++)
      this.puffs.spawn(
        x + (Math.random() - 0.5) * scale,
        y,
        z + (Math.random() - 0.5) * scale,
        (Math.random() - 0.5) * 2,
        1.5 + Math.random() * 2,
        (Math.random() - 0.5) * 2,
        2 + Math.random() * 1.5,
        0.7 * scale,
        2.8 * scale,
        1.4,
        0.6,
        0.3,
        0.28,
        0.27,
        0.55,
        1.4,
        0.9,
        0.4,
      );
  }
  frost(x, y, z, radius = 2) {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      this.puffs.spawn(
        x + Math.cos(angle) * dist,
        y + 0.1,
        z + Math.sin(angle) * dist,
        Math.cos(angle) * 1.5,
        0.6 + Math.random() * 0.8,
        Math.sin(angle) * 1.5,
        1.1 + Math.random() * 0.8,
        0.5,
        1.9,
        2,
        0.2,
        0.85,
        0.95,
        1,
        0.45,
        0,
        0.4,
        0.3,
      );
    }
    for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      this.glows.spawn(
        x + Math.cos(angle) * dist,
        y + 0.2 + Math.random() * 0.3,
        z + Math.sin(angle) * dist,
        (Math.random() - 0.5) * 1.5,
        1 + Math.random() * 2.5,
        (Math.random() - 0.5) * 1.5,
        0.6 + Math.random() * 0.8,
        0.035,
        1.5,
        -1.5,
        0.7,
        0.92,
        1,
        2.2,
        0.1,
        22,
        0.2,
        0,
      );
    }
  }
  shards(x, y, z, radius = 2) {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      this.glows.spawn(
        x + Math.cos(angle) * radius * 0.6,
        y + 0.2,
        z + Math.sin(angle) * radius * 0.6,
        Math.cos(angle) * speed,
        2 + Math.random() * 3,
        Math.sin(angle) * speed,
        0.5 + Math.random() * 0.4,
        0.05,
        0.6,
        -14,
        0.8,
        0.95,
        1,
        1.6,
        0.6,
        30,
        0.05,
        0,
      );
    }
    for (let i = 0; i < 6; i++)
      this.puffs.spawn(
        x + (Math.random() - 0.5) * radius,
        y + 0.1,
        z + (Math.random() - 0.5) * radius,
        Math.random() - 0.5,
        0.8 + Math.random(),
        Math.random() - 0.5,
        1 + Math.random(),
        0.5,
        1.8,
        2,
        0.3,
        0.9,
        0.97,
        1,
        0.5,
        0,
        0.5,
        0.3,
      );
  }
  bloom(x, y, z, radius = 2) {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * radius;
      this.glows.spawn(
        x + Math.cos(angle) * dist,
        y + 0.15,
        z + Math.sin(angle) * dist,
        (Math.random() - 0.5) * 0.6,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * 0.6,
        0.9 + Math.random() * 0.8,
        0.05,
        1.2,
        0.2,
        0.45,
        1,
        0.45,
        1.8,
        0.2,
        10,
        0.4,
        0,
      );
    }
  }
  flush() {
    this.puffs.flush();
    this.glows.flush();
  }
}
