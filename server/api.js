// API de Sonora (/api/...): catálogo, búsqueda, reproducciones y "me gusta".
// Cada navegador se identifica con un id anónimo (cabecera X-Sonora-Client) que genera la página.
const { json, fail, readJSON, rateLimiter } = require('./http');

const CLIENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAY_GAP = 30 * 1000; // la misma persona no suma otra reproducción del mismo disco antes de 30 s

function createApi({ catalog, db, news, supabase, started, extra = () => ({}) }) {
  const allowWrite = rateLimiter(120, 60 * 1000);
  const recentPlays = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, t] of recentPlays) if (now - t > PLAY_GAP) recentPlays.delete(k); }, PLAY_GAP).unref();

  const stats = id => ({ plays: db.plays(id), likes: db.likes(id) });
  const withStats = a => ({ ...a, ...stats(a.id) });
  const clientOf = req => { const c = req.headers['x-sonora-client']; return c && CLIENT.test(c) ? c.toLowerCase() : null; };
  const int = (v, d, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

  const SORTS = {
    plays: (a, b) => db.plays(b.id) - db.plays(a.id),
    likes: (a, b) => db.likes(b.id) - db.likes(a.id),
    year: (a, b) => b.year - a.year,
    title: (a, b) => a.title.localeCompare(b.title, 'es')
  };

  /** Ranking por reproducciones y "me gusta" (solo discos con actividad). */
  function top(limit) {
    return catalog.albums
      .filter(a => db.plays(a.id) || db.likes(a.id))
      .sort((a, b) => db.plays(b.id) - db.plays(a.id) || db.likes(b.id) - db.likes(a.id))
      .slice(0, limit)
      .map(a => ({ id: a.id, title: a.title, artist: a.artist, ...stats(a.id) }));
  }

  const routes = [
    ['GET', /^\/api\/health$/, (req, res) => json(req, res, 200, {
      ok: true, uptime: Math.round((Date.now() - started) / 1000), ...catalog.summary,
      supabase: supabase.enabled, news: news.status(), ...extra()
    })],

    // Datos públicos para que la página se conecte a Supabase (null si no está configurado)
    ['GET', /^\/api\/config$/, (req, res) => json(req, res, 200, { supabase: supabase.publicConfig() }, 'no-cache')],

    // Noticias de música leídas de los RSS: ?limit= &before=<fecha ISO> &source= &artist= &catalog=1
    ['GET', /^\/api\/news$/, (req, res, _, url) => {
      const p = url.searchParams;
      const items = news.list({ limit: int(p.get('limit'), 20, 1, 100), before: p.get('before') || undefined, source: p.get('source') || undefined, artist: p.get('artist') || undefined, catalog: p.get('catalog') === '1' });
      json(req, res, 200, { items, status: news.status() }, 'no-cache');
    }],

    // Buscar noticias ahora mismo (solo administradores con sesión de Supabase)
    ['POST', /^\/api\/news\/refresh$/, async (req, res) => {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const profile = await supabase.userFromToken(token).catch(() => null);
      if (!profile || profile.role !== 'admin') return fail(req, res, 403, 'Solo para administradores');
      const added = await news.refresh();
      json(req, res, 200, { added, status: news.status() });
    }],

    // Todo el catálogo en una sola petición (lo usa la página al arrancar)
    ['GET', /^\/api\/catalog$/, (req, res) => json(req, res, 200, {
      genres: catalog.genres, artists: catalog.artists, albums: catalog.albums, summary: catalog.summary
    }, 'no-cache')],

    ['GET', /^\/api\/genres$/, (req, res) => json(req, res, 200, catalog.genres, 'no-cache')],

    ['GET', /^\/api\/artists$/, (req, res) => json(req, res, 200,
      catalog.order.map(id => ({ id, ...catalog.artists[id], albums: catalog.albums.filter(a => a.artist === id).length })), 'no-cache')],

    ['GET', /^\/api\/artists\/([\w-]+)$/, (req, res, [id]) => {
      const artist = catalog.artists[id];
      if (!artist) return fail(req, res, 404, 'Artista no encontrado');
      json(req, res, 200, { id, ...artist, albums: catalog.albums.filter(a => a.artist === id).map(withStats) });
    }],

    // ?q= &genre= &artist= &decade= &sort=plays|likes|year|title &limit= &offset=
    ['GET', /^\/api\/albums$/, (req, res, _, url) => {
      const p = url.searchParams;
      let list = catalog.filter({ q: p.get('q'), genre: p.get('genre'), artist: p.get('artist'), decade: p.get('decade') });
      const sort = SORTS[p.get('sort')];
      if (sort) list = list.slice().sort(sort);
      const offset = int(p.get('offset'), 0, 0, 1e6), limit = int(p.get('limit'), 100, 1, 200);
      json(req, res, 200, { total: list.length, offset, limit, items: list.slice(offset, offset + limit).map(withStats) });
    }],

    ['GET', /^\/api\/albums\/([\w-]+)$/, (req, res, [id]) => {
      const a = catalog.byId.get(id);
      if (!a) return fail(req, res, 404, 'Disco no encontrado');
      const client = clientOf(req);
      json(req, res, 200, { ...withStats(a), liked: !!client && db.likedBy(client).includes(id) });
    }],

    ['GET', /^\/api\/search$/, (req, res, _, url) => {
      const q = (url.searchParams.get('q') || '').slice(0, 100);
      const r = catalog.search(q, int(url.searchParams.get('limit'), 10, 1, 50));
      json(req, res, 200, { q, albums: r.albums.map(withStats), artists: r.artists, tracks: r.tracks });
    }],

    // Estadísticas de todos los discos + ranking
    ['GET', /^\/api\/stats$/, (req, res, _, url) => {
      const albums = {};
      for (const a of catalog.albums) { const s = stats(a.id); if (s.plays || s.likes) albums[a.id] = s; }
      json(req, res, 200, { totals: db.totals(), top: top(int(url.searchParams.get('limit'), 10, 1, 50)), albums });
    }],

    // Lo de este navegador: sus favoritos
    ['GET', /^\/api\/me$/, (req, res) => {
      const client = clientOf(req);
      if (!client) return fail(req, res, 400, 'Falta la cabecera X-Sonora-Client');
      json(req, res, 200, { liked: db.likedBy(client) });
    }],

    ['POST', /^\/api\/albums\/([\w-]+)\/play$/, (req, res, [id]) => {
      if (!catalog.byId.has(id)) return fail(req, res, 404, 'Disco no encontrado');
      const key = `${clientOf(req) || req.socket.remoteAddress}|${id}`;
      const counted = !recentPlays.has(key);
      if (counted) {
        recentPlays.set(key, Date.now());
        db.addPlay(id);
        // Con Supabase, la reproducción también se suma allá (la página la recibe en tiempo real)
        if (supabase.enabled) supabase.rpc('add_play', { p_album: id }).catch(e => console.error('add_play:', e.message));
      }
      json(req, res, 200, { id, counted, ...stats(id) });
    }],

    // PUT agrega el "me gusta", DELETE lo quita. También acepta POST con {"liked": true|false}
    [/^(PUT|DELETE|POST)$/, /^\/api\/albums\/([\w-]+)\/like$/, async (req, res, [id]) => {
      if (!catalog.byId.has(id)) return fail(req, res, 404, 'Disco no encontrado');
      const client = clientOf(req);
      if (!client) return fail(req, res, 400, 'Falta la cabecera X-Sonora-Client');
      let on = req.method === 'PUT';
      if (req.method === 'POST') on = (await readJSON(req)).liked !== false;
      const likes = db.setLike(id, client, on);
      json(req, res, 200, { id, liked: on, likes, plays: db.plays(id) });
    }]
  ];

  /** Atiende la petición si es de la API. Regresa false si no lo es. */
  return async function handle(req, res, pathname, url) {
    if (!pathname.startsWith('/api/')) return false;
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, { Allow: 'GET, POST, PUT, DELETE, OPTIONS' }); res.end(); return true; }
      let pathMatched = false;
      for (const [method, pattern, fn] of routes) {
        const m = pathname.match(pattern);
        if (!m) continue;
        pathMatched = true;
        const okMethod = typeof method === 'string' ? (method === req.method || (method === 'GET' && req.method === 'HEAD')) : method.test(req.method);
        if (!okMethod) continue;
        if (req.method !== 'GET' && req.method !== 'HEAD' && !allowWrite(req)) { fail(req, res, 429, 'Demasiadas peticiones, espera un momento'); return true; }
        await fn(req, res, m.slice(1), url);
        return true;
      }
      if (pathMatched) fail(req, res, 405, 'Método no permitido');
      else fail(req, res, 404, 'Ruta de la API no encontrada');
    } catch (e) {
      if (!res.headersSent) fail(req, res, e.status || 500, e.status ? e.message : 'Error del servidor');
      if (!e.status) console.error(e);
    }
    return true;
  };
}

module.exports = { createApi };
