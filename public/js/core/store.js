/* Datos del catálogo y estado de la interfaz.
   Los datos se cargan de /api/catalog (o de /data/*.json); el estado guarda lo que la persona está viendo. */
import { getCatalog } from './api.js';

export const store = {
  GENRES: {},
  ARTISTS: {},
  ARTIST_ORDER: [],
  ALBUMS: [],
  MIN_YEAR: 0,
  MAX_YEAR: 0,
  SONGS: 0
};

export const state = {
  cur: 0,              // índice del disco que está en el tocadiscos
  q: '',               // texto buscado
  genre: null,         // género filtrado
  decade: 'all',       // década filtrada
  artistFilter: null,  // artista filtrado en el catálogo
  onlyLiked: false,    // catálogo: solo mis favoritos
  sortTop: false,      // catálogo: ordenar por más escuchados
  artist: 'weeknd'     // artista destacado en la sección de artistas
};

const getJSON = async name => {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`No se pudo cargar data/${name}.json (${res.status})`);
  return res.json();
};

export async function loadStore() {
  // Primero la API del servidor (una sola petición); si no está, los archivos de data/
  const api = await getCatalog();
  const [genres, artists, albums] = api ? [api.genres, api.artists, api.albums]
    : await Promise.all([getJSON('genres'), getJSON('artists'), getJSON('albums')]);
  store.GENRES = genres;
  store.ARTISTS = artists;
  store.ARTIST_ORDER = Object.keys(artists);
  // Orden: por artista (como en artists.json) y luego por año
  store.ALBUMS = albums.slice().sort((a, b) =>
    store.ARTIST_ORDER.indexOf(a.artist) - store.ARTIST_ORDER.indexOf(b.artist) || a.year - b.year);
  store.MAX_YEAR = Math.max(...store.ALBUMS.map(a => a.year));
  store.MIN_YEAR = Math.min(...store.ALBUMS.map(a => a.year));
  store.SONGS = store.ALBUMS.reduce((n, a) => n + a.tracks.length, 0);
  store.ALBUMS.forEach(a => {
    a.isNew = a.year === store.MAX_YEAR;
    a.audio = a.previewUrl;
    a.art = a.coverUrl.split('/image/thumb/')[1]; // ruta de la portada dentro del catálogo de Apple
  });
  state.cur = Math.max(0, byId('weeknd-after-hours'));
}

export const byId = id => store.ALBUMS.findIndex(a => a.id === id);
export const albumsOf = artistId => store.ALBUMS.filter(a => a.artist === artistId);
export const current = () => store.ALBUMS[state.cur];
export const artistOf = album => store.ARTISTS[album.artist];
export const spotifyUrl = a => 'https://open.spotify.com/search/' + encodeURIComponent(`${store.ARTISTS[a.artist].name} ${a.title}`);
