/* Catálogo (modelo Shop): búsqueda, filtros por género, artista y década, y la cuadrícula de discos. */
import { $, $$, esc, norm } from '../core/dom.js';
import { store, state, albumsOf } from '../core/store.js';
import { cov, srcset } from '../core/covers.js';
import { stats } from '../core/api.js';

const DECADES = [['all', 'Todas las décadas'], ['1970', '70s'], ['1980', '80s'], ['1990', '90s'], ['2000', '2000s'], ['2010', '2010s'], ['2020', '2020s']];

export function buildFilters() {
  $('#achips').innerHTML = `<button type="button" class="achip achip-all" data-afilter="" aria-pressed="true">Todos</button>` +
    store.ARTIST_ORDER.map(id => {
      const last = albumsOf(id).slice(-1)[0];
      return `<button type="button" class="achip" data-afilter="${id}" aria-pressed="false"><img src="${last ? cov(last, 100) : ''}" alt="">${esc(store.ARTISTS[id].name)}</button>`;
    }).join('');
  $('#decades').innerHTML = DECADES.map(([k, t]) => `<button type="button" class="chip" data-decade="${k}" aria-pressed="${k === 'all'}">${t}</button>`).join('') +
    `<span class="chip-sep" aria-hidden="true"></span>` +
    `<button type="button" class="chip" data-fav="1" aria-pressed="false">♥ Mis favoritos</button>` +
    `<button type="button" class="chip" data-top="1" aria-pressed="false">Más escuchados</button>` +
    `<div class="status" id="status" aria-live="polite"></div>`;
}

/** Álbumes que cumplen la búsqueda y los filtros activos. */
function filtered() {
  const q = norm(state.q.trim());
  const list = store.ALBUMS.filter(a => {
    if (state.onlyLiked && !stats.liked.has(a.id)) return false;
    if (state.genre && a.genre !== state.genre) return false;
    if (state.artistFilter && a.artist !== state.artistFilter) return false;
    if (state.decade !== 'all' && Math.floor(a.year / 10) * 10 !== +state.decade) return false;
    if (q) {
      const hay = norm(`${a.title} ${store.ARTISTS[a.artist].name} ${a.credit} ${store.GENRES[a.genre].name} ${a.year} ${a.tracks.join(' ')}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // Más escuchados: por reproducciones y luego por "me gusta" (el orden estable deja el resto como estaba)
  if (state.sortTop) list.sort((a, b) => (stats.plays[b.id] || 0) - (stats.plays[a.id] || 0) || (stats.likes[b.id] || 0) - (stats.likes[a.id] || 0));
  return list;
}

const tile = a => {
  const i = store.ALBUMS.indexOf(a), artist = store.ARTISTS[a.artist].name;
  return `<button type="button" class="tile" data-i="${i}" data-play="1" aria-label="${esc(a.title)} de ${esc(artist)}, ${a.year}. Poner en el tocadiscos">
    ${a.isNew ? '<span class="s-new">Nuevo</span>' : ''}
    <span class="tile-art"><span class="tile-disc"><img loading="lazy" src="${cov(a, 200)}" alt=""></span><img class="tile-cover" loading="lazy" src="${cov(a, 600)}" srcset="${srcset(a)}" sizes="(max-width: 700px) 46vw, (max-width: 1100px) 31vw, (max-width: 1500px) 280px, 260px" alt=""></span>
    ${stats.liked.has(a.id) ? '<span class="tile-fav" aria-label="En tus favoritos">♥</span>' : ''}
    <span class="tile-cap"><span class="tile-title">${esc(a.title)}</span><span class="tile-meta"><span>${esc(artist)}</span><span class="num">${a.year}</span></span></span>
  </button>`;
};

export function renderGrid() {
  const list = filtered();
  const parts = [];
  if (state.artistFilter) parts.push(store.ARTISTS[state.artistFilter].name);
  if (state.genre) parts.push(store.GENRES[state.genre].name);
  if (state.q.trim()) parts.push(`“${state.q.trim()}”`);
  if (state.onlyLiked) parts.push('Mis favoritos');
  if (state.sortTop) parts.push('Más escuchados');
  const any = parts.length || state.decade !== 'all';
  $('#status').innerHTML = `<span class="num">${list.length} ${list.length === 1 ? 'disco' : 'discos'}${parts.length ? ' · ' + esc(parts.join(' · ')) : ''}</span>` +
    (any ? `<button type="button" class="s-link" id="clearAll">Quitar filtros</button>` : '');
  $('#grid').innerHTML = list.length ? list.map(tile).join('')
    : `<div class="empty">${state.onlyLiked && !stats.liked.size
      ? 'Todavía no tienes favoritos. Pon un disco en el tocadiscos y toca “Me gusta”.'
      : 'No hay discos para esa búsqueda. Prueba con un artista, un disco, una canción o un género.'}</div>`;
}

const press = (attr, isOn) => $$(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', isOn(b)));

export function toggleGenre(key) {
  state.genre = state.genre === key ? null : key;
  press('data-genre', b => b.dataset.genre === state.genre);
  renderGrid();
}

export function setArtistFilter(id) {
  state.artistFilter = id || null;
  press('data-afilter', b => (b.dataset.afilter || null) === state.artistFilter);
  renderGrid();
}

export function setDecade(key) {
  state.decade = key;
  press('data-decade', b => b.dataset.decade === state.decade);
  renderGrid();
}

export function toggleLiked() {
  state.onlyLiked = !state.onlyLiked;
  press('data-fav', () => state.onlyLiked);
  renderGrid();
}

export function toggleTop() {
  state.sortTop = !state.sortTop;
  press('data-top', () => state.sortTop);
  renderGrid();
}

export function setQuery(q) {
  state.q = q;
  renderGrid();
}

export function clearFilters() {
  state.genre = null; state.decade = 'all'; state.q = ''; state.artistFilter = null; state.onlyLiked = false; state.sortTop = false;
  $('#q').value = '';
  press('data-genre', () => false);
  press('data-afilter', b => !b.dataset.afilter);
  press('data-decade', b => b.dataset.decade === 'all');
  press('data-fav', () => false);
  press('data-top', () => false);
  renderGrid();
}
