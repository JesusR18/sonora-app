/* Artistas (modelo ORYZO): artista destacado y carrusel con todos los artistas. */
import { $, $$, esc, pad } from '../core/dom.js';
import { store, state, albumsOf } from '../core/store.js';
import { cov } from '../core/covers.js';
import { paintPortraits } from './portraits.js';

export function buildRail() {
  $('#rail').innerHTML = store.ARTIST_ORDER.map(id => {
    const A = store.ARTISTS[id], n = albumsOf(id).length;
    return `<button type="button" class="acard" data-artist="${id}" aria-current="false"><img data-portrait="${id}" alt="Retrato generativo de ${esc(A.name)}"><b>${esc(A.name)}</b><small>${esc(A.origin.split(',')[0])} · ${n} ${n === 1 ? 'disco' : 'discos'}</small></button>`;
  }).join('');
}

export function renderArtist() {
  const id = state.artist, A = store.ARTISTS[id], list = albumsOf(id);
  const img = $('#featImg');
  img.dataset.portrait = id;
  img.alt = `Retrato generativo de ${A.name}`;
  $('#featName').textContent = A.name;
  $('#featOrigin').textContent = A.origin;
  $('#featStatement').textContent = A.statement;
  $('#featBio').textContent = A.bio;
  $('#factOrigin').textContent = A.origin.split(',')[0];
  $('#factCount').textContent = pad(list.length);
  $('#factForm').textContent = A.form + (A.n > 1 ? ` de ${A.n}` : '');
  $('#featStrip').innerHTML = list.map(a =>
    `<button type="button" data-i="${store.ALBUMS.indexOf(a)}" data-play="1" title="${esc(a.title)} (${a.year})" aria-label="Poner ${esc(a.title)}, ${a.year}"><img src="${cov(a, 200)}" alt=""></button>`).join('');
  $$('.acard').forEach(c => c.setAttribute('aria-current', c.dataset.artist === id ? 'true' : 'false'));
  paintPortraits($('#artistas'));
}

export function selectArtist(id) {
  state.artist = id;
  renderArtist();
}
