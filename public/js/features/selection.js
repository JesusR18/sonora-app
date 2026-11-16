/* Cambia el disco actual y actualiza en un solo lugar todo lo que depende de él:
   la caja, el tocadiscos y el inicio. */
import { go } from '../core/dom.js';
import { store, state } from '../core/store.js';
import { layoutCrate } from './crate.js';
import { renderDeck } from './deck.js';
import { renderHero } from './hero.js';
import { unload, play } from './player.js';

/**
 * @param {number} i índice del álbum (se ajusta en círculo)
 * @param {{scroll?: boolean, play?: boolean}} opts llevar la vista al tocadiscos y/o reproducir
 */
export function setCur(i, opts = {}) {
  const n = store.ALBUMS.length;
  i = (i + n) % n;
  if (i !== state.cur) unload();
  state.cur = i;
  layoutCrate();
  renderDeck();
  renderHero();
  // Avisa a quien dependa del disco actual (reseñas)
  document.dispatchEvent(new CustomEvent('sonora:album', { detail: store.ALBUMS[i] }));
  if (opts.scroll) go('plato');
  if (opts.play) play();
}

export const step = d => setCur(state.cur + d);

export function randomPlay() {
  let i;
  do { i = Math.floor(Math.random() * store.ALBUMS.length); } while (i === state.cur);
  setCur(i, { scroll: true, play: true });
}
