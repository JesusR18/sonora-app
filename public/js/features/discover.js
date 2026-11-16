/* Descubre (modelo Shop): constelación de portadas flotantes y botones de género. */
import { $, esc } from '../core/dom.js';
import { store, byId } from '../core/store.js';
import { cov, srcset } from '../core/covers.js';

// [id del álbum, x %, y %, ancho base px, rotación °, retraso de animación s, clase extra]
const FLOATING = [
  ['weeknd-after-hours', 8, 30, 132, -8, 0, ''],
  ['travis-utopia', 22, 2, 150, 4, -1.5, ''],
  ['frank-blonde', 37, 36, 118, -3, -3, 'fc-hide'],
  ['badbunny-un-verano-sin-ti', 52, 0, 170, 2, -.8, ''],
  ['kanye-my-beautiful-dark-twisted-fantasy', 67, 32, 128, 6, -2.2, 'fc-hide'],
  ['olivia-guts', 80, 4, 150, -5, -4, ''],
  ['mora-estrella', 93, 36, 122, 8, -2.6, '']
];

export function renderConstellation() {
  $('#constellation').innerHTML = FLOATING.filter(f => byId(f[0]) >= 0).map(([id, x, y, w, rot, delay, cls]) => {
    const i = byId(id), a = store.ALBUMS[i];
    return `<button type="button" class="fcard ${cls}" data-i="${i}" data-play="1" style="--x:${x}%;--y:${y}%;--w:${w};--r:${rot}deg;--d:${delay}s">
      <img src="${cov(a, 300)}" srcset="${srcset(a)}" sizes="(max-width: 700px) 100px, 170px" alt="Portada de ${esc(a.title)}"><span>${esc(a.title)}</span><small>${esc(store.ARTISTS[a.artist].name)}</small></button>`;
  }).join('');
}

export function renderGenres() {
  $('#cats').innerHTML = Object.entries(store.GENRES).map(([key, g]) =>
    `<button type="button" class="cat" data-genre="${key}" aria-pressed="false" style="--c:${g.c}"><i></i>${g.name}</button>`).join('');
}
