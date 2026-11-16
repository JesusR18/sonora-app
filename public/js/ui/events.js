/* Conecta los clics y controles de la página con las funciones de cada módulo.
   Usa delegación: un solo listener en el documento atiende los botones que se crean dinámicamente. */
import { $, go, smooth } from '../core/dom.js';
import { state, current } from '../core/store.js';
import { toggleLike } from '../core/api.js';
import { setCur, step, randomPlay } from '../features/selection.js';
import { play, toggle } from '../features/player.js';
import { toggleGenre, setArtistFilter, setDecade, setQuery, clearFilters, toggleLiked, toggleTop } from '../features/catalog.js';
import { selectArtist } from '../features/artists.js';
import { bindCrate } from '../features/crate.js';

export function bindEvents() {
  document.addEventListener('click', e => {
    const t = e.target.closest('button, a');
    if (!t) return;
    // Funda de la caja: la de enfrente reproduce, otra la trae al frente
    if (t.classList.contains('sleeve')) {
      const i = +t.dataset.i;
      return i === state.cur ? toggle() : setCur(i);
    }
    // Cualquier portada con data-play: ponerla en el tocadiscos y reproducir
    if (t.dataset.i !== undefined && t.dataset.play) return setCur(+t.dataset.i, { scroll: true, play: true });
    if (t.dataset.genre) { toggleGenre(t.dataset.genre); return go('discos'); }
    if (t.dataset.afilter !== undefined) return setArtistFilter(t.dataset.afilter);
    if (t.dataset.decade) return setDecade(t.dataset.decade);
    if (t.dataset.fav) return toggleLiked();
    if (t.dataset.top) return toggleTop();
    if (t.id === 'clearAll') return clearFilters();
    if (t.dataset.artist) return selectArtist(t.dataset.artist);
    if (t.id === 'randomBtn' || t.id === 'randomLink') return randomPlay();
  });

  $('#prev').addEventListener('click', () => step(-1));
  $('#next').addEventListener('click', () => step(1));
  $('#playBtn').addEventListener('click', toggle);
  $('#likeBtn').addEventListener('click', () => toggleLike(current().id));
  $('#heroThumb').addEventListener('click', toggle);
  $('#miniPlay').addEventListener('click', toggle);
  $('#heroObject').addEventListener('click', () => { go('plato'); play(); });
  bindCrate({ step, toggle });

  // Búsqueda: filtra mientras se escribe; al enviar, lleva al catálogo
  $('#focusSearch').addEventListener('click', () => { go('descubre'); setTimeout(() => $('#q').focus({ preventScroll: true }), 450); });
  $('#q').addEventListener('input', e => setQuery(e.target.value));
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); setQuery($('#q').value); $('#q').blur(); go('discos'); });

  const rail = $('#rail');
  $('#railPrev').addEventListener('click', () => rail.scrollBy({ left: -rail.clientWidth * .8, behavior: smooth() }));
  $('#railNext').addEventListener('click', () => rail.scrollBy({ left: rail.clientWidth * .8, behavior: smooth() }));
}
