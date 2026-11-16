// Cliente mínimo de Supabase para el servidor (REST con la llave service_role).
// Solo lo usa el servidor: importar noticias, sumar reproducciones y verificar administradores.
function createSupabase({ url, anonKey, serviceKey }) {
  const base = (url || '').replace(/\/+$/, '');
  const enabled = !!(base && anonKey && serviceKey);
  const headers = extra => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...extra });

  async function rest(method, path, body, extra) {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method, headers: headers(extra), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    enabled,
    /** Datos públicos para la página (la llave anon está protegida por RLS). */
    publicConfig: () => (enabled ? { url: base, anonKey } : null),

    rpc: (fn, args) => rest('POST', `rpc/${fn}`, args),

    /** Inserta filas y omite las que choquen con `onConflict` (no sobrescribe). */
    insertIgnore: (table, rows, onConflict) =>
      rest('POST', `${table}?on_conflict=${onConflict}`, rows, { Prefer: 'resolution=ignore-duplicates,return=minimal' }),

    select: (table, query) => rest('GET', `${table}?${query}`),

    /** Regresa el perfil de quien manda el token, o null si el token no es válido. */
    async userFromToken(token) {
      if (!enabled || !token) return null;
      const res = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const user = await res.json();
      const [profile] = await rest('GET', `profiles?id=eq.${user.id}&select=id,role,display_name`);
      return profile || null;
    }
  };
}

module.exports = { createSupabase };
