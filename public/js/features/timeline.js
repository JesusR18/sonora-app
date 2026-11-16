/* Línea del tiempo (modelo Apple): cada año ocupa el mismo ancho y los discos
   de un mismo año se apilan, así la distancia entre portadas representa el tiempo real. */
import { $, esc } from '../core/dom.js';
import { store } from '../core/store.js';
import { cov } from '../core/covers.js';

const PER_YEAR = 44;  // px por año
const COVER = 40;     // alto de cada portada apilada, con su separación
const AXIS_Y = 40;    // distancia del eje al borde inferior

export function renderTimeline() {
  const { ALBUMS, ARTISTS, MIN_YEAR, MAX_YEAR } = store;
  const groups = {};
  ALBUMS.forEach((a, i) => (groups[a.year] = groups[a.year] || []).push(i));
  const maxStack = Math.max(...Object.values(groups).map(g => g.length));

  const tl = $('#tl');
  tl.style.width = ((MAX_YEAR - MIN_YEAR) * PER_YEAR + 48) + 'px';
  tl.style.height = (maxStack * COVER + AXIS_Y + 20) + 'px';
  const xOf = y => (y - MIN_YEAR) * PER_YEAR + 24;

  let html = `<div class="tl2-axis" style="bottom:${AXIS_Y}px"></div>`;
  // Décadas sin discos: se marcan para que se note el hueco
  for (let y = Math.ceil(MIN_YEAR / 10) * 10; y <= MAX_YEAR; y += 10) {
    if (!groups[y]) html += `<span class="tl2-dec num" style="left:${xOf(y)}px;bottom:${AXIS_Y - 22}px">${y}</span>`;
  }
  Object.entries(groups).forEach(([y, idx]) => {
    html += `<div class="tl2-col" style="left:${xOf(+y)}px;bottom:${AXIS_Y + 6}px">` +
      idx.map(i => `<button type="button" data-i="${i}" data-play="1" title="${esc(ALBUMS[i].title)} · ${esc(ARTISTS[ALBUMS[i].artist].name)}" aria-label="${esc(ALBUMS[i].title)}, ${y}"><img loading="lazy" src="${cov(ALBUMS[i], 100)}" alt=""></button>`).join('') +
      `</div><span class="tl2-year num" style="left:${xOf(+y)}px;bottom:${AXIS_Y - 22}px">${y}</span>`;
  });
  tl.innerHTML = html;
  // Empieza mostrando los discos más recientes
  requestAnimationFrame(() => { const s = $('#tlScroll'); s.scrollLeft = s.scrollWidth; });
}
