/* Conexión con Supabase: base de datos, cuentas y tiempo real.
   La URL y la llave pública vienen del servidor (/api/config). Si el servidor no tiene Supabase
   configurado, la página sigue funcionando y las funciones de comunidad muestran un aviso. */

const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let client = null;
let ready = null;

/** Sesión actual: usuario de Supabase Auth y su perfil (nombre, rol…). */
export const auth = { user: null, profile: null, ready: false };
const listeners = new Set();

/** Llama a `fn` ahora y cada vez que alguien entra, sale o cambia su perfil. Regresa cómo dejar de escuchar. */
export function onAuth(fn) { listeners.add(fn); if (auth.ready) fn(auth); return () => listeners.delete(fn); }
const emit = () => listeners.forEach(fn => { try { fn(auth); } catch (e) { console.error(e); } });

async function setUser(user) {
  auth.user = user;
  auth.profile = null;
  if (user) {
    const { data } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    auth.profile = data || { id: user.id, display_name: user.email?.split('@')[0] || 'Oyente', role: 'user' };
  }
  auth.ready = true;
  emit();
}

/** Vuelve a leer el perfil (después de editarlo). */
export const refreshProfile = () => auth.user && setUser(auth.user);

/** Conecta con Supabase una sola vez. Regresa el cliente, o null si no hay conexión configurada. */
export function initSupabase() {
  ready ??= (async () => {
    let cfg = null;
    try { cfg = (await (await fetch('/api/config')).json()).supabase; } catch {}
    if (!cfg) { auth.ready = true; emit(); return null; }
    const { createClient } = await import(CDN);
    client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    // Supabase recomienda no esperar otras llamadas dentro de este aviso: se difiere un instante
    client.auth.onAuthStateChange((_event, session) => setTimeout(() => setUser(session?.user || null), 0));
    return client;
  })().catch(err => { console.error('Supabase no disponible:', err); auth.ready = true; emit(); return null; });
  return ready;
}

/** Cliente de Supabase (null si no está conectado). */
export const sb = () => client;
export const connected = () => !!client;
export const isAdmin = () => auth.profile?.role === 'admin';

/** Pide iniciar sesión si hace falta. Regresa true si ya hay sesión. */
export function requireLogin(reason) {
  if (auth.user) return true;
  document.dispatchEvent(new CustomEvent('sonora:login', { detail: reason }));
  return false;
}

/** Token de la sesión para llamar a rutas protegidas del servidor. */
export async function accessToken() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token || null;
}
