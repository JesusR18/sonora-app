/* Cliente de la API del servidor (/api/...) y estadísticas de los discos.
   Con Supabase conectado, favoritos, reproducciones y reseñas viven en la base de datos.
   Si la página se abre sin el servidor de Sonora (Live Server, sin conexión), todo sigue
   funcionando: las llamadas fallan en silencio y los favoritos quedan guardados en este navegador. */

import { sb, auth, onAuth, connected, requireLogin } from './supa.js';

const KEY = 'sonora-client';
const LIKED_KEY = 'sonora-liked';

const safeGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

/** Id anónimo de este navegador (no es una cuenta; solo separa los "me gusta" de cada quien). */
const client = safeGet(KEY) || uuid();
safeSet(KEY, client);

export const online = { ok: location.protocol !== 'file:' };

async function call(method, path, body) {
  if (!online.ok) return null;
  try {
    const res = await fetch(`/api/${path}`, {
      method,
      headers: { 'X-Sonora-Client': client, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) {
      if (res.status === 404 || res.status === 405) online.ok = false; // servidor sin API
      return null;
    }
    return await res.json();
  } catch { return null; }
}

/** Catálogo completo, o null si no hay API. */
export const getCatalog = () => call('GET', 'catalog');

/* Estadísticas: reproducciones y "me gusta" por disco, y los favoritos de este navegador */
export const stats = {
  plays: {},
  likes: {},
  rating: {},   // promedio de reseñas (solo con Supabase)
  reviews: {},  // número de reseñas (solo con Supabase)
  liked: new Set(JSON.parse(safeGet(LIKED_KEY) || '[]'))
};
const saveLiked = () => safeSet(LIKED_KEY, JSON.stringify([...stats.liked]));
const listeners = new Set();
/** Avisa a `fn` cada vez que cambian las estadísticas. */
export const onStats = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn());

/* ---------- Con Supabase: favoritos por cuenta y contadores en tiempo real ---------- */

async function loadSupabaseStats() {
  const { data, error } = await sb().from('album_stats').select('*');
  if (error) { console.warn('album_stats:', error.message); return false; }
  stats.plays = {}; stats.likes = {}; stats.rating = {}; stats.reviews = {};
  for (const s of data) {
    stats.plays[s.album_id] = Number(s.plays); stats.likes[s.album_id] = Number(s.likes);
    stats.reviews[s.album_id] = Number(s.reviews); if (s.rating) stats.rating[s.album_id] = Number(s.rating);
  }
  return true;
}

async function loadMyLikes() {
  if (!auth.user) { stats.liked = new Set(); return; }
  // Los favoritos que se marcaron sin cuenta en este navegador se pasan a la cuenta
  const local = JSON.parse(safeGet(LIKED_KEY) || '[]');
  if (local.length) {
    await sb().from('album_likes').upsert(local.map(album_id => ({ album_id, user_id: auth.user.id })), { onConflict: 'album_id,user_id', ignoreDuplicates: true });
    safeSet(LIKED_KEY, '[]');
  }
  const { data } = await sb().from('album_likes').select('album_id').eq('user_id', auth.user.id);
  stats.liked = new Set((data || []).map(r => r.album_id));
}

function subscribeStats() {
  let timer = null;
  const reload = () => { clearTimeout(timer); timer = setTimeout(async () => { await loadSupabaseStats(); emit(); }, 400); };
  sb().channel('album-stats')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'album_plays' }, ({ new: r }) => {
      if (r?.album_id) { stats.plays[r.album_id] = Number(r.plays); emit(); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'album_likes' }, ({ new: n, old: o }) => {
      if ((n?.user_id || o?.user_id) === auth.user?.id) return; // los míos ya se contaron al tocar
      const id = n?.album_id || o?.album_id;
      if (id) { stats.likes[id] = Math.max(0, (stats.likes[id] || 0) + (n?.album_id ? 1 : -1)); emit(); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'album_reviews' }, reload)
    .subscribe();
}

export async function loadStats() {
  if (connected() && await loadSupabaseStats()) {
    onAuth(async () => { await loadMyLikes(); emit(); });
    subscribeStats();
    return;
  }
  const [all, me] = await Promise.all([call('GET', 'stats?limit=50'), call('GET', 'me')]);
  if (all) {
    for (const [id, s] of Object.entries(all.albums)) { stats.plays[id] = s.plays; stats.likes[id] = s.likes; }
  }
  if (me) {
    // Une los favoritos guardados en el navegador con los del servidor y sube los que faltan
    const server = new Set(me.liked);
    for (const id of stats.liked) if (!server.has(id)) call('PUT', `albums/${encodeURIComponent(id)}/like`);
    me.liked.forEach(id => stats.liked.add(id));
    saveLiked();
  }
  emit();
}

/** Suma una reproducción del disco `id` (el servidor también la suma en Supabase). */
export async function reportPlay(id) {
  const r = await call('POST', `albums/${encodeURIComponent(id)}/play`);
  // Con Supabase el número llega por tiempo real; sin él, de la respuesta del servidor
  if (r && !connected()) { stats.plays[id] = r.plays; stats.likes[id] = r.likes; emit(); }
}

/** Marca o desmarca el disco como favorito. Cambia al instante y luego lo confirma. */
export async function toggleLike(id) {
  if (connected() && !requireLogin('para guardar tus favoritos')) return;
  const on = !stats.liked.has(id);
  on ? stats.liked.add(id) : stats.liked.delete(id);
  stats.likes[id] = Math.max(0, (stats.likes[id] || 0) + (on ? 1 : -1));
  emit();
  if (connected()) {
    const { error } = on ? await sb().from('album_likes').insert({ album_id: id })
      : await sb().from('album_likes').delete().match({ album_id: id, user_id: auth.user.id });
    if (error && !/duplicate/.test(error.message)) { await loadSupabaseStats(); await loadMyLikes(); emit(); }
    return;
  }
  saveLiked();
  const r = await call(on ? 'PUT' : 'DELETE', `albums/${encodeURIComponent(id)}/like`);
  if (r) { stats.likes[id] = r.likes; emit(); }
}
