/* Portada del blog: noticias y artículos en tiempo real.
   Con Supabase lee la tabla posts y recibe las nuevas entradas al instante (Realtime).
   Sin Supabase usa las noticias que el servidor junta de los RSS (/api/news) y revisa cada 2 minutos. */
import { $, esc } from '../core/dom.js';
import { store, albumsOf } from '../core/store.js';
import { cov } from '../core/covers.js';
import { sb, connected } from '../core/supa.js';
import { agoTag, ago } from './util.js';

const PAGE = 13;
const SELECT = 'id,slug,kind,title,excerpt,cover_url,source_name,source_url,artist_id,album_id,tags,featured,published_at,author:profiles(display_name,avatar_url)';

const feed = {
  filter: 'all',      // all | news | article | catalog
  items: [],
  pending: [],        // entradas nuevas que llegaron mientras se leía
  done: false,
  loading: false,
  checkedAt: null,
  useServer: false    // true si se usan las noticias del servidor en lugar de Supabase
};

/** Entradas ya cargadas, por slug (las usa el lector). */
export const postCache = new Map();
const remember = list => list.forEach(p => postCache.set(p.slug, { ...postCache.get(p.slug), ...p }));

const matches = p => feed.filter === 'all' || (feed.filter === 'catalog' ? !!(p.artist_id || p.album_id) : p.kind === feed.filter);

/* ---------- Datos ---------- */

async function fetchStats(list) {
  const ids = list.map(p => p.id).filter(Boolean);
  if (!connected() || !ids.length) return;
  const { data } = await sb().from('post_stats').select('*').in('post_id', ids);
  const byId = new Map((data || []).map(s => [s.post_id, s]));
  list.forEach(p => { const s = byId.get(p.id); p.stats = { comments: s?.comments || 0, reactions: s?.reactions || 0 }; });
}

async function fetchPage(before) {
  if (connected() && !feed.useServer) {
    let q = sb().from('posts').select(SELECT).eq('status', 'published').order('published_at', { ascending: false }).limit(PAGE);
    if (feed.filter === 'news' || feed.filter === 'article') q = q.eq('kind', feed.filter);
    if (feed.filter === 'catalog') q = q.not('artist_id', 'is', null);
    if (before) q = q.lt('published_at', before);
    const { data, error } = await q;
    if (!error) { await fetchStats(data); return data; }
    // Si la tabla todavía no existe (falta correr schema.sql), se usan las noticias del servidor
    console.warn('Supabase posts:', error.message);
    feed.useServer = true;
  }
  if (feed.filter === 'article') return [];
  const params = new URLSearchParams({ limit: PAGE });
  if (before) params.set('before', before);
  if (feed.filter === 'catalog') params.set('catalog', '1');
  const res = await fetch(`/api/news?${params}`);
  if (!res.ok) throw new Error('Sin noticias');
  const { items } = await res.json();
  return items.filter(matches);
}

/* ---------- Dibujo ---------- */

/** Portada de la entrada; si no tiene, la de un disco del artista relacionado o un vinilo dibujado. */
function coverOf(p) {
  if (p.cover_url) return { src: p.cover_url, ext: true };
  const album = p.album_id ? store.ALBUMS.find(a => a.id === p.album_id) : p.artist_id ? albumsOf(p.artist_id).slice(-1)[0] : null;
  return album ? { src: cov(album, 600), ext: false } : null;
}

const imgTag = (p, cls, sizes) => {
  const c = coverOf(p);
  if (!c) return `<span class="${cls} noimg" aria-hidden="true"><i></i></span>`;
  return `<span class="${cls}"><img src="${esc(c.src)}" alt="" loading="lazy" decoding="async" ${c.ext ? 'referrerpolicy="no-referrer"' : ''} sizes="${sizes}" onerror="this.parentNode.classList.add('noimg');this.remove()"></span>`;
};

const byline = p => p.kind === 'article'
  ? `<span class="pc-src is-own">Sonora</span>${p.author?.display_name ? `<span>${esc(p.author.display_name)}</span>` : ''}`
  : `<span class="pc-src">${esc(p.source_name || 'Noticias')}</span>`;

const statsLine = p => p.stats && (p.stats.comments || p.stats.reactions)
  ? `<span class="pc-stats num">${p.stats.comments ? `<span>💬 ${p.stats.comments}</span>` : ''}${p.stats.reactions ? `<span>🔥 ${p.stats.reactions}</span>` : ''}</span>` : '';

const artistChip = p => {
  const a = store.ARTISTS[p.artist_id];
  return a ? `<span class="pc-artist">${esc(a.name)} · en Sonora</span>` : '';
};

const href = p => `#/p/${encodeURIComponent(p.slug)}`;

const lead = p => `<a class="post-lead" href="${href(p)}">
  ${imgTag(p, 'pl-img', '(max-width: 900px) 100vw, 60vw')}
  <span class="pl-body">
    <span class="pc-meta">${byline(p)}${agoTag(p.published_at)}</span>
    <span class="pl-title">${esc(p.title)}</span>
    ${p.excerpt ? `<span class="pl-excerpt">${esc(p.excerpt)}</span>` : ''}
    <span class="pc-foot">${artistChip(p)}${statsLine(p)}</span>
  </span>
</a>`;

const side = p => `<a class="post-side" href="${href(p)}">
  ${imgTag(p, 'ps-img', '120px')}
  <span class="ps-body">
    <span class="pc-meta">${byline(p)}${agoTag(p.published_at)}</span>
    <span class="ps-title">${esc(p.title)}</span>
  </span>
</a>`;

const card = p => `<a class="post-card" href="${href(p)}">
  ${imgTag(p, 'pc-img', '(max-width: 700px) 100vw, 33vw')}
  <span class="pc-body">
    <span class="pc-meta">${byline(p)}${agoTag(p.published_at)}</span>
    <span class="pc-title">${esc(p.title)}</span>
    <span class="pc-foot">${artistChip(p)}${statsLine(p)}</span>
  </span>
</a>`;

function render() {
  const list = feed.items;
  if (!list.length) {
    $('#feedTop').innerHTML = '';
    $('#feedGrid').innerHTML = `<div class="feed-empty">${feed.loading ? 'Cargando lo último…'
      : feed.filter === 'article' ? 'Todavía no hay artículos de Sonora. Pronto habrá reseñas, listas y entrevistas.'
      : 'No hay noticias por ahora. Vuelve en unos minutos.'}</div>`;
    $('#feedMore').hidden = true;
    return;
  }
  const leadPost = list.find(p => p.featured) || list[0];
  const rest = list.filter(p => p !== leadPost);
  $('#feedTop').innerHTML = lead(leadPost) + `<div class="post-sides">${rest.slice(0, 4).map(side).join('')}</div>`;
  $('#feedGrid').innerHTML = rest.slice(4).map(card).join('');
  $('#feedMore').hidden = feed.done;
}

function renderLive() {
  $('#feedLive').innerHTML = `<i></i>En vivo${feed.checkedAt ? ` · actualizado ${ago(feed.checkedAt)}` : ''}`;
  const n = feed.pending.length;
  $('#feedNew').hidden = !n;
  $('#feedNew').textContent = n === 1 ? '1 entrada nueva ↑' : `${n} entradas nuevas ↑`;
}

/* ---------- Carga y tiempo real ---------- */

async function load(reset) {
  if (feed.loading) return;
  feed.loading = true;
  if (reset) { feed.items = []; feed.done = false; feed.pending = []; render(); }
  $('#feedMore').disabled = true;
  try {
    const before = reset ? undefined : feed.items[feed.items.length - 1]?.published_at;
    const page = await fetchPage(before);
    remember(page);
    feed.items.push(...page.filter(p => !feed.items.some(o => o.slug === p.slug)));
    feed.done = page.length < (feed.useServer || !connected() ? 1 : PAGE);
    feed.checkedAt = new Date().toISOString();
  } catch (e) {
    console.error(e);
    if (!feed.items.length) $('#feedGrid').innerHTML = '<div class="feed-empty">No se pudieron cargar las noticias. Revisa tu conexión.</div>';
  } finally {
    feed.loading = false;
    $('#feedMore').disabled = false;
    if (feed.items.length || reset) render();
    renderLive();
  }
}

function showPending() {
  remember(feed.pending);
  feed.items = [...feed.pending, ...feed.items].sort((a, b) => b.published_at.localeCompare(a.published_at));
  feed.pending = [];
  render(); renderLive();
  document.getElementById('noticias').scrollIntoView({ behavior: 'smooth' });
}

/** Una entrada nueva: si se está viendo el principio, entra sola; si no, espera en el aviso "N nuevas". */
function incoming(p) {
  if (!matches(p) || feed.items.some(o => o.slug === p.slug) || feed.pending.some(o => o.slug === p.slug)) return;
  p.stats = p.stats || { comments: 0, reactions: 0 };
  feed.pending.unshift(p);
  feed.checkedAt = new Date().toISOString();
  const top = document.getElementById('noticias').getBoundingClientRect();
  if (top.top > -200 && top.top < innerHeight && feed.pending.length < 3) showPending();
  else renderLive();
}

function bumpStat(postId, key, d) {
  const p = feed.items.find(o => o.id === postId);
  if (!p) return;
  p.stats = p.stats || { comments: 0, reactions: 0 };
  p.stats[key] = Math.max(0, p.stats[key] + d);
  render();
}

function subscribe() {
  if (connected() && !feed.useServer) {
    sb().channel('feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, ({ new: p }) => { if (p.status === 'published') incoming(p); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, ({ new: p }) => {
        const i = feed.items.findIndex(o => o.id === p.id);
        if (p.status !== 'published') { if (i >= 0) { feed.items.splice(i, 1); render(); } return; }
        if (i >= 0) { feed.items[i] = { ...feed.items[i], ...p }; remember([feed.items[i]]); render(); } else incoming(p);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, ({ old }) => {
        const i = feed.items.findIndex(o => o.id === old.id);
        if (i >= 0) { feed.items.splice(i, 1); render(); }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, ({ new: c }) => bumpStat(c.post_id, 'comments', 1))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, ({ old }) => bumpStat(old.post_id, 'comments', -1))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_reactions' }, ({ new: r }) => bumpStat(r.post_id, 'reactions', 1))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'post_reactions' }, ({ old }) => bumpStat(old.post_id, 'reactions', -1))
      .subscribe(status => { if (status === 'SUBSCRIBED') { feed.checkedAt = new Date().toISOString(); renderLive(); } });
    return;
  }
  // Sin Supabase: revisa las noticias del servidor cada 2 minutos
  setInterval(async () => {
    try {
      const res = await fetch('/api/news?limit=20');
      const { items } = await res.json();
      const newest = feed.items[0]?.published_at || '';
      items.filter(p => p.published_at > newest).reverse().forEach(incoming);
      feed.checkedAt = new Date().toISOString();
      renderLive();
    } catch {}
  }, 120000);
}

/** Agrega una entrada recién publicada desde el editor. */
export function addLocal(p) { remember([p]); incoming(p); }

export function initFeed() {
  $('#feedTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-feed]');
    if (!b || b.dataset.feed === feed.filter) return;
    feed.filter = b.dataset.feed;
    document.querySelectorAll('#feedTabs [data-feed]').forEach(t => t.setAttribute('aria-pressed', t === b));
    load(true);
  });
  $('#feedMore').addEventListener('click', () => load(false));
  $('#feedNew').addEventListener('click', showPending);
  setInterval(renderLive, 30000);
  load(true).then(subscribe);
}

/** Si el servidor encontró noticias nuevas a petición del admin, recarga. */
export const reloadFeed = () => load(true);
export const feedUsesServer = () => feed.useServer || !connected();
