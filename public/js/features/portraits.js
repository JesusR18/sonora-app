/* Retratos generativos de los artistas: una cuadrícula de puntos en un canvas.
   Los puntos crecen donde está la silueta y donde pega la luz. Una semilla derivada
   del id del artista hace que cada retrato salga siempre igual. */
import { store } from '../core/store.js';

const cache = {};

const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function portrait(id) {
  const A = store.ARTISTS[id], W = 600, H = 750, r = rng(hash(id + 'p'));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = A.bg;
  x.fillRect(0, 0, W, H);

  // Una figura por integrante: cabeza (círculo) y hombros (elipse)
  const figs = [];
  if (A.n === 1) figs.push({ x: 300 + (r() - .5) * 40, y: 330, r: 112 });
  else {
    const R = { 2: 84, 3: 70, 4: 58, 5: 50 }[A.n];
    for (let i = 0; i < A.n; i++) figs.push({ x: W * (i + .5) / A.n + (r() - .5) * 16, y: H - R * 3.7 - (i % 2) * 24, r: R });
  }

  const lx = 480, ly = 120, step = 10; // luz desde arriba a la derecha
  x.fillStyle = A.dot;
  for (let py = step / 2; py < H; py += step) for (let px = step / 2; px < W; px += step) {
    let shade = -1;
    for (const f of figs) {
      const dh = Math.hypot(px - f.x, py - f.y) / f.r;
      const db = Math.hypot((px - f.x) / (f.r * 2.2), (py - (f.y + f.r * 2.75)) / (f.r * 1.8));
      if (dh < 1) shade = Math.max(shade, 1 - dh * .45);
      else if (db < 1) shade = Math.max(shade, .62 - db * .3);
    }
    const light = 1 - Math.hypot(px - lx, py - ly) / 900;
    let v, alpha;
    if (shade >= 0) { v = Math.min(1, Math.max(.12, .1 + shade * .5 + light * .45 + (r() - .5) * .14)); alpha = 1; }
    else { v = .1 + r() * .08; alpha = .3; }
    x.globalAlpha = alpha;
    x.beginPath();
    x.arc(px, py, step * .5 * v, 0, Math.PI * 2);
    x.fill();
  }
  return c.toDataURL('image/jpeg', .86);
}

/** Pone el retrato en cada <img data-portrait="id"> que ya tenga uno generado. */
export function paintPortraits(root = document) {
  root.querySelectorAll('[data-portrait]').forEach(img => {
    const src = cache[img.dataset.portrait];
    if (src && img.src !== src) img.src = src;
  });
}

/** Genera los retratos uno por uno, sin congelar la página. */
export function startPortraits() {
  let i = 0;
  (function next() {
    if (i >= store.ARTIST_ORDER.length) return;
    const id = store.ARTIST_ORDER[i++];
    cache[id] = portrait(id);
    paintPortraits();
    setTimeout(next, 0);
  })();
}
