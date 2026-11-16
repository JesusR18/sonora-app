/* Tocadiscos (modelo Apple): etiqueta del vinilo, datos del disco, lista de canciones,
   enlaces para escucharlo completo y la información del mini reproductor. */
import { $, esc } from '../core/dom.js';
import { store, current, artistOf, spotifyUrl } from '../core/store.js';
import { cov } from '../core/covers.js';
import { stats } from '../core/api.js';
import { resetProgress } from './player.js';

export function renderDeck() {
  const a = current(), A = artistOf(a);
  $('#discLabel').src = cov(a, 300);
  $('#deckArtist').textContent = a.credit || A.name;
  $('#deckTitle').textContent = a.title;
  $('#deckMeta').textContent = `${a.year} · ${store.GENRES[a.genre].name} · ${a.tracks.length} canciones`;
  $('#deckNew').hidden = !a.isNew;

  const list = $('#deckTracks');
  list.innerHTML = a.tracks.map((t, i) => {
    const on = t === a.feat;
    return `<li class="${on ? 'on' : ''}"><span class="num">${i + 1}</span><span>${esc(t)}</span>${on ? '<span class="tag">Avance</span>' : ''}</li>`;
  }).join('');
  const onLi = list.querySelector('li.on');
  if (onLi) list.scrollTop = Math.max(0, onLi.offsetTop - list.offsetTop - 40);

  $('#spotifyLink').href = spotifyUrl(a);
  $('#appleLink').href = a.apple;
  $('#spotifyLink').setAttribute('aria-label', `Escuchar ${a.title} completo en Spotify`);
  $('#appleLink').setAttribute('aria-label', `Abrir ${a.title} en Apple Music`);
  resetProgress();

  $('#miniImg').src = cov(a, 100);
  $('#miniTitle').textContent = a.feat;
  $('#miniArtist').textContent = `${a.title} · ${A.name}`;
  renderDeckStats();
}

const plural = (n, one, many) => `${n.toLocaleString('es-MX')} ${n === 1 ? one : many}`;

/** Botón de favorito y contadores de reproducciones y "me gusta" del disco actual. */
export function renderDeckStats() {
  const a = current();
  if (!a) return;
  const plays = stats.plays[a.id] || 0, likes = stats.likes[a.id] || 0, on = stats.liked.has(a.id), rating = stats.rating[a.id];
  const parts = [];
  if (plays || likes) parts.push(plural(plays, 'reproducción', 'reproducciones'), plural(likes, 'me gusta', 'me gusta'));
  if (rating) parts.push(`★ ${rating.toFixed(1)} (${plural(stats.reviews[a.id] || 0, 'reseña', 'reseñas')})`);
  $('#deckStats').textContent = parts.join(' · ');
  $('#likeBtn').setAttribute('aria-pressed', on);
  $('#likeBtn').setAttribute('aria-label', on ? `Quitar ${a.title} de mis favoritos` : `Agregar ${a.title} a mis favoritos`);
  $('#likeText').textContent = on ? 'En favoritos' : 'Me gusta';
}
