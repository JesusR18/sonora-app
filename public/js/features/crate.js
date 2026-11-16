/* Caja de discos (modelo Apple): fundas apiladas, el disco actual al frente.
   La profundidad se simula con desplazamiento, escala y capas (z-index), no con 3D real,
   porque Safari ordenaba mal las fundas con preserve-3d. */
import { $, esc, pad } from '../core/dom.js';
import { store, state } from '../core/store.js';
import { cov, srcset } from '../core/covers.js';

let sleeves = [];

export function buildCrate() {
  const inner = $('#crateInner');
  // Las imágenes se crean sin src: solo se cargan las fundas que se ven (ver loadVisible)
  inner.innerHTML = store.ALBUMS.map((a, i) =>
    `<button type="button" class="sleeve" data-i="${i}" aria-label="${esc(a.title)}, ${esc(store.ARTISTS[a.artist].name)}"><img sizes="(max-width: 480px) 260px, 340px" alt=""></button>`).join('') +
    `<div class="crate-lip" aria-hidden="true"><span>Sonora</span><span class="num">${store.ALBUMS.length} LP · 33⅓</span></div>`;
  sleeves = [...inner.querySelectorAll('.sleeve')];
}

/** Carga la portada de una funda la primera vez que queda a la vista. */
function loadSleeve(el) {
  const img = el.firstElementChild;
  if (img.getAttribute('src')) return;
  const a = store.ALBUMS[+el.dataset.i];
  img.srcset = srcset(a);
  img.src = cov(a, 600);
}

export function layoutCrate() {
  sleeves.forEach((el, i) => {
    const d = i - state.cur;
    let t, o = 1, f = 'none';
    if (d < 0) { t = 'perspective(1400px) translateY(90px) rotateX(-38deg) scale(1.08)'; o = 0; }
    else if (d === 0) t = 'translateY(-78px) scale(1.01)';
    else { const k = Math.min(d, 7); t = `translateY(${-78 - k * 17}px) scale(${1 - k * .045})`; f = `brightness(${1 - k * .07})`; if (d > 7) o = 0; }
    el.style.transform = t;
    el.style.opacity = o;
    el.style.filter = f;
    el.style.zIndex = d < 0 ? 150 : 100 - Math.min(d, 99);
    el.style.visibility = (d < -1 || d > 8) ? 'hidden' : 'visible';
    if (d >= -1 && d <= 8) loadSleeve(el);
    el.style.pointerEvents = (d < 0 || d > 7) ? 'none' : 'auto';
    el.tabIndex = -1;
  });
  $('#counter').textContent = `${pad(state.cur + 1)} / ${store.ALBUMS.length}`;
}

/** Teclado (flechas, Enter) y deslizamiento con el dedo o el mouse. */
export function bindCrate({ step, toggle }) {
  const crate = $('#crate');
  crate.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
  let sx = null, sy = null;
  crate.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  crate.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
}
