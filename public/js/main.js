import { $ } from './core/dom.js';
import { store, state, loadStore } from './core/store.js';
import { initCoverFallback } from './core/covers.js';
import { stats, loadStats, onStats } from './core/api.js';
import { renderConstellation, renderGenres } from './features/discover.js';
import { buildCrate } from './features/crate.js';
import { setCur, randomPlay } from './features/selection.js';
import { initPlayer } from './features/player.js';
import { buildFilters, renderGrid } from './features/catalog.js';
import { renderDeckStats } from './features/deck.js';
import { buildRail, renderArtist } from './features/artists.js';
import { renderTimeline } from './features/timeline.js';
import { startPortraits } from './features/portraits.js';
import { initNav } from './ui/nav.js';
import { initMenu } from './ui/menu.js';
import { bindEvents } from './ui/events.js';
import { registerServiceWorker, initInstall } from './pwa/install.js';
import { initModals } from './ui/modal.js';
import { initSupabase } from './core/supa.js';
import { initAuth } from './blog/auth.js';
import { initFeed } from './blog/feed.js';
import { initReader } from './blog/reader.js';
import { initCommunity } from './blog/community.js';
import { initReviews } from './blog/reviews.js';
import { initEditor, openEditor } from './blog/editor.js';
import { tickAgo } from './blog/util.js';

/** Textos que dependen del tamaño del catálogo. */
function fillCounts() {
  const { ALBUMS, ARTIST_ORDER, SONGS, MIN_YEAR, MAX_YEAR } = store;
  $('#heroCount').textContent = `El blog de música con ${ALBUMS.length} discos de ${ARTIST_ORDER.length} artistas para escuchar mientras lees.`;
  $('#discoverLede').textContent = `Busca entre ${ALBUMS.length} discos, ${SONGS} canciones y ${ARTIST_ORDER.length} artistas, o empieza por un género.`;
  $('#tlTitle').textContent = `${MIN_YEAR} a ${MAX_YEAR}, disco por disco.`;
  $('#sideLabel').textContent = `Sonora ${ALBUMS.length}-LP · 33⅓ RPM · ${MIN_YEAR}–${MAX_YEAR}`;
}

async function boot() {
  initCoverFallback();
  registerServiceWorker();
  initInstall();
  initNav();
  initMenu({ onRandom: randomPlay });
  initModals();
  // La conexión con Supabase empieza al mismo tiempo que el catálogo
  const supabaseReady = initSupabase();
  initAuth();

  try {
    await loadStore();
  } catch (err) {
    console.error(err);
    $('#heroCount').textContent = 'No se pudo cargar el catálogo. Revisa tu conexión y vuelve a abrir la página.';
    return;
  }

  fillCounts();
  renderConstellation();
  renderGenres();
  buildCrate();
  buildFilters();
  buildRail();
  renderTimeline();
  setCur(state.cur);
  renderGrid();
  renderArtist();
  initPlayer();
  bindEvents();
  startPortraits();

  // Reproducciones y favoritos desde la API (sin servidor, quedan los favoritos de este navegador)
  // La cuadrícula solo se vuelve a dibujar si cambian los favoritos o si está ordenada por más escuchados
  let likedKey = '';
  onStats(() => {
    renderDeckStats();
    const key = [...stats.liked].sort().join();
    if (key !== likedKey || state.sortTop) { likedKey = key; renderGrid(); }
  });
  await supabaseReady;
  loadStats();

  // Blog: portada de noticias, lector, comunidad, reseñas y panel de administración
  initFeed();
  initReader({ onEdit: openEditor });
  initCommunity();
  initReviews();
  initEditor();
  tickAgo();
}

boot();
