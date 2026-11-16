// Noticias de música en tiempo real: el servidor lee los RSS de varios medios cada pocos minutos,
// guarda las más recientes en memoria (para /api/news) y, si Supabase está conectado, las inserta
// en la tabla posts sin duplicarlas. La página recibe las nuevas al instante por Realtime.
const crypto = require('crypto');

const FEEDS = [
  { name: 'Billboard Español', url: 'https://www.billboard.com/c/espanol/feed/', lang: 'es' },
  { name: 'Billboard', url: 'https://www.billboard.com/feed/', lang: 'en' },
  { name: 'Pitchfork', url: 'https://pitchfork.com/feed/feed-news/rss', lang: 'en' },
  { name: 'Rolling Stone', url: 'https://www.rollingstone.com/music/music-news/feed/', lang: 'en' },
  { name: 'NME', url: 'https://www.nme.com/news/music/feed', lang: 'en' },
  { name: 'Consequence', url: 'https://consequence.net/feed/', lang: 'en' },
  { name: 'Stereogum', url: 'https://www.stereogum.com/feed/', lang: 'en' },
  { name: 'Remezcla', url: 'https://remezcla.com/feed/', lang: 'en' },
  { name: 'XXL', url: 'https://www.xxlmag.com/feed/', lang: 'en' }
];
const KEEP = 300;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
const cdata = s => (s || '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
const text = s => decode(cdata(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\s[^>]*${a}="([^"]+)"`, 'i')); return m ? decode(m[1]) : ''; };
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const slugify = (title, url) => norm(title).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) +
  '-' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 6);

function parseFeed(xml, feed, artists) {
  return xml.split(/<item[\s>]/).slice(1).map(raw => {
    const item = raw.split('</item>')[0];
    const link = text(tag(item, 'link')) || attr(item, 'link', 'href');
    const title = text(tag(item, 'title'));
    if (!link || !title || !/^https?:\/\//.test(link)) return null;
    const html = cdata(tag(item, 'content:encoded'));
    const excerpt = text(tag(item, 'description')) || text(html);
    const cover = attr(item, 'media:thumbnail', 'url') || attr(item, 'media:content', 'url') ||
      (/<enclosure[^>]+type="image/i.test(item) ? attr(item, 'enclosure', 'url') : '') ||
      ((html.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '');
    const date = new Date(text(tag(item, 'pubDate')) || text(tag(item, 'dc:date')) || Date.now());
    const cats = [...item.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(m => text(m[1]).toLowerCase())
      .filter(c => c && c.length < 30 && !/^(news|noticias|music|música|musica|espanol|español|uncategorized)$/.test(c));
    // Relaciona la noticia con un artista del catálogo de Sonora si lo menciona
    const hay = norm(`${title} ${excerpt}`);
    const artist = Object.keys(artists).find(id => {
      const n = norm(artists[id].name);
      return n.length > 3 && new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay);
    });
    return {
      slug: slugify(title, link),
      kind: 'news',
      status: 'published',
      title: title.slice(0, 200),
      excerpt: excerpt.slice(0, 400) + (excerpt.length > 400 ? '…' : ''),
      cover_url: /^https:\/\//.test(decode(cover)) ? decode(cover) : null,
      source_name: feed.name,
      source_url: link,
      artist_id: artist || null,
      tags: [...new Set([feed.lang === 'es' ? 'español' : null, ...cats].filter(Boolean))].slice(0, 5),
      published_at: (isNaN(date) ? new Date() : date > new Date() ? new Date() : date).toISOString()
    };
  }).filter(Boolean);
}

function createNews({ artists, supabase, minutes = 15 }) {
  let items = [];
  let lastRun = null, running = null;
  const sources = {};

  async function fetchFeed(feed) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SonoraBot/1.0; +https://sonora)', Accept: 'application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(30000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = parseFeed(await res.text(), feed, artists);
      sources[feed.name] = { ok: true, items: list.length, at: new Date().toISOString() };
      return list;
    } catch (e) {
      sources[feed.name] = { ok: false, error: e.name === 'TimeoutError' ? 'tiempo agotado' : e.message, at: new Date().toISOString() };
      return [];
    }
  }

  /** Lee todos los medios y regresa cuántas noticias nuevas encontró. */
  function refresh() {
    if (running) return running;
    running = (async () => {
      const lists = await Promise.all(FEEDS.map(fetchFeed));
      const known = new Set(items.map(i => i.source_url));
      const fresh = lists.flat().filter(i => !known.has(i.source_url));
      items = [...fresh, ...items]
        .filter((i, n, all) => all.findIndex(o => o.source_url === i.source_url) === n)
        .sort((a, b) => b.published_at.localeCompare(a.published_at))
        .slice(0, KEEP);
      if (supabase.enabled && fresh.length) {
        try { await supabase.insertIgnore('posts', fresh, 'source_url'); }
        catch (e) { console.error('No se pudieron guardar las noticias en Supabase:', e.message); }
      }
      lastRun = new Date().toISOString();
      console.log(`Noticias: ${fresh.length} nuevas (${items.length} en memoria)`);
      return fresh.length;
    })().finally(() => { running = null; });
    return running;
  }

  return {
    refresh,
    start() {
      refresh();
      setInterval(refresh, Math.max(2, minutes) * 60 * 1000).unref();
    },
    /** Noticias en memoria, de la más nueva a la más vieja. `before` = fecha ISO para paginar; `catalog` = solo las de artistas de Sonora. */
    list({ limit = 20, before, source, artist, catalog } = {}) {
      return items.filter(i =>
        (!before || i.published_at < before) &&
        (!catalog || i.artist_id) &&
        (!source || i.source_name === source) &&
        (!artist || i.artist_id === artist)).slice(0, limit);
    },
    status: () => ({ lastRun, items: items.length, everyMinutes: minutes, sources })
  };
}

module.exports = { createNews, FEEDS };
