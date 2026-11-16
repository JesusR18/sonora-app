// Catálogo en memoria: lee public/data/*.json una vez y ofrece consultas para la API.
const fs = require('fs');
const path = require('path');

const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function load(root) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
  const genres = read('genres'), artists = read('artists'), albums = read('albums');
  const order = Object.keys(artists);
  albums.sort((a, b) => order.indexOf(a.artist) - order.indexOf(b.artist) || a.year - b.year);
  const byId = new Map(albums.map(a => [a.id, a]));
  // Texto de búsqueda precalculado por álbum
  const hay = new Map(albums.map(a => [a.id,
    norm(`${a.title} ${artists[a.artist]?.name || ''} ${a.credit || ''} ${genres[a.genre]?.name || ''} ${a.year} ${a.tracks.join(' ')}`)]));
  const years = albums.map(a => a.year);

  return {
    genres, artists, albums, byId, order,
    summary: {
      albums: albums.length,
      artists: order.length,
      songs: albums.reduce((n, a) => n + a.tracks.length, 0),
      minYear: Math.min(...years),
      maxYear: Math.max(...years)
    },

    /** Filtra por texto, género, artista y década. */
    filter({ q, genre, artist, decade } = {}) {
      const nq = q ? norm(q.trim()) : '';
      return albums.filter(a =>
        (!genre || a.genre === genre) &&
        (!artist || a.artist === artist) &&
        (!decade || Math.floor(a.year / 10) * 10 === +decade) &&
        (!nq || hay.get(a.id).includes(nq)));
    },

    /** Búsqueda agrupada: discos, artistas y canciones que coinciden. */
    search(q, limit = 10) {
      const nq = norm(q.trim());
      if (!nq) return { albums: [], artists: [], tracks: [] };
      const tracks = [];
      for (const a of albums) {
        for (const t of a.tracks) {
          if (tracks.length >= limit) break;
          if (norm(t).includes(nq)) tracks.push({ title: t, albumId: a.id, album: a.title, artist: a.artist });
        }
      }
      return {
        albums: albums.filter(a => hay.get(a.id).includes(nq)).slice(0, limit),
        artists: order.filter(id => norm(artists[id].name).includes(nq)).slice(0, limit).map(id => ({ id, ...artists[id] })),
        tracks
      };
    }
  };
}

module.exports = { load };
