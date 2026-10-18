/**
 * The Solved! card shown when a puzzle is solved: a painted ring with a brush-stroke check mark, ink spots and sparks, coloured for the area it was solved in.
 */
import { makeRng } from '../core/math.js';
import { ringCanvas, splatCanvas, strokeCanvas, washCanvas } from './brush.js';
import { el } from './dom.js';
const PUZZLE_HOLD = 2.1;
const PUZZLE_TINTS = {
  cave: {
    ring: '#7fe0c0',
    check: '#fff6dc',
    spot: '#ffd79a',
  },
  kiln: {
    ring: '#ff8a4a',
    check: '#fff2c8',
    spot: '#ffd46a',
  },
  cistern: {
    ring: '#9fdcff',
    check: '#ffffff',
    spot: '#4cc3ff',
  },
  default: {
    ring: '#ffd25e',
    check: '#fffaf0',
    spot: '#ffe39a',
  },
};
export class PuzzleCard {
  root;
  card = null;
  elapsed = 0;
  hideAt = -1;
  n = 0;
  constructor(host) {
    this.root = el('div', 'wb-puzzle', host);
  }
  show(variant) {
    this.close(true);
    const theme = PUZZLE_TINTS[variant] ?? PUZZLE_TINTS.default;
    const serial = this.n++;
    const card = el('div', `pz-card ${variant || 'outdoor'}`, this.root);
    const wash = washCanvas(16, 16, `pz-wash-${serial}`, 0.5);
    wash.className = 'pz-wash';
    card.appendChild(wash);
    const ring = ringCanvas(9, theme.ring, `pz-ring-${serial % 3}`, 0.07, {
      dry: 0.4,
      sweep: 5.6,
      start: -2.2,
    });
    ring.className = 'pz-ring';
    card.appendChild(ring);
    const check = strokeCanvas(8, 7, theme.check, `pz-check-${serial % 3}`, {
      widthFrac: 0.16,
      pts: [
        [0.12, 0.52],
        [0.36, 0.78],
        [0.58, 0.46],
        [0.9, 0.12],
      ],
      dry: 0.3,
      core: 0.85,
      taperStart: 0.2,
      taperEnd: 0.55,
      sheen: 0.25,
    });
    check.className = 'pz-check';
    card.appendChild(check);
    const rng = makeRng(`pz-sp-${serial}`);
    for (let i = 0; i < 4; i++) {
      const spot = splatCanvas(2.4, i % 2 ? theme.spot : theme.ring, `pz-spot-${serial}-${i}`, {
        rFrac: 0.16,
        tendrils: 5,
        drops: 6,
        reach: 0.9,
        rim: true,
      });
      spot.className = 'pz-spot';
      const ang = (i / 4) * Math.PI * 2 + rng() * 0.8;
      spot.style.left = `${(50 + Math.cos(ang) * 44 - 15).toFixed(1)}%`;
      spot.style.top = `${(50 + Math.sin(ang) * 44 - 15).toFixed(1)}%`;
      spot.style.animationDelay = `${(0.45 + i * 0.06).toFixed(2)}s`;
      card.appendChild(spot);
    }
    for (let i = 0; i < 7; i++) {
      const spark = el('i', 'pz-spark', card);
      spark.style.left = `${(10 + rng() * 80).toFixed(1)}%`;
      spark.style.top = `${(8 + rng() * 80).toFixed(1)}%`;
      spark.style.animationDelay = `${(0.5 + rng() * 0.8).toFixed(2)}s`;
      spark.style.setProperty('--k', (0.5 + rng() * 0.8).toFixed(2));
    }
    el('div', 'pz-cap', card, 'Solved!');
    card.offsetWidth;
    card.classList.add('in');
    this.card = card;
    this.hideAt = this.elapsed + PUZZLE_HOLD;
  }
  close(instant = false) {
    const card = this.card;
    if (card) {
      this.card = null;
      this.hideAt = -1;
      if (instant) {
        card.remove();
        return;
      }
      card.classList.remove('in');
      card.classList.add('out');
      setTimeout(() => card.remove(), 900);
    }
  }
  update(dt, visible) {
    this.elapsed += dt;
    this.root.style.opacity = visible ? '' : '0';
    if (this.card && this.hideAt >= 0 && this.elapsed >= this.hideAt) this.close();
  }
}
