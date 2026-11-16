/* Utilidades del blog: fechas relativas, Markdown seguro, avatares y avisos. */
import { esc } from '../core/dom.js';

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];

/** "hace 5 minutos", "ayer"… */
export function ago(date) {
  const s = (new Date(date) - Date.now()) / 1000;
  if (Math.abs(s) < 45) return 'justo ahora';
  for (const [u, n] of UNITS) if (Math.abs(s) >= n || u === 'minute') return rtf.format(Math.round(s / n), u);
}

export const longDate = d => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

/** Actualiza cada 30 s los textos con data-ago. */
export function tickAgo() {
  const run = () => document.querySelectorAll('[data-ago]').forEach(el => { el.textContent = ago(el.dataset.ago); });
  setInterval(run, 30000);
}
export const agoTag = d => `<time datetime="${esc(d)}" data-ago="${esc(d)}">${ago(d)}</time>`;

const safeUrl = u => (/^https?:\/\//i.test(u) ? u.replace(/"/g, '%22') : '#');

/** Markdown sencillo y seguro (escapa todo el HTML): títulos, negritas, cursivas, enlaces, imágenes, citas y listas. */
export function md(src = '') {
  const inline = s => esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) => `<img src="${safeUrl(u)}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener nofollow">${t}</a>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const line of src.replace(/\r/g, '').split('\n')) {
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { flushPara(); flushList(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = line.match(/^>\s?(.*)/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.*)/))) {
      flushPara();
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[2]);
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) { flushPara(); flushList(); out.push('<hr>'); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out.join('');
}

/** Avatar: foto o inicial con un color estable por persona. */
export function avatar(profile, size = 32) {
  const name = profile?.display_name || 'Oyente';
  if (profile?.avatar_url && /^https:\/\//.test(profile.avatar_url)) {
    return `<img class="avatar" src="${esc(profile.avatar_url)}" alt="" width="${size}" height="${size}" style="--s:${size}px" referrerpolicy="no-referrer">`;
  }
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="avatar" style="--s:${size}px;--h:${h}" aria-hidden="true">${esc(name.trim()[0]?.toUpperCase() || '?')}</span>`;
}

/** Aviso breve en la parte de abajo de la pantalla. */
export function toast(message, kind = 'info') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = message;
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3800);
}

/** Mensaje amable para errores de Supabase. */
export function errMsg(error) {
  const m = error?.message || String(error || '');
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja).';
  if (/User already registered/i.test(m)) return 'Ya existe una cuenta con ese correo.';
  if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/duplicate key.*username/i.test(m)) return 'Ese nombre de usuario ya está ocupado.';
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer eso.';
  if (/Espera un momento/i.test(m)) return 'Espera un momento antes de enviar otro mensaje.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Inténtalo de nuevo.';
  return m || 'Algo salió mal. Inténtalo de nuevo.';
}

/** Aviso para cuando la página no está conectada a la base de datos, ej. offline('El chat') u offline('Las reseñas', true). */
export const offline = (subject, plural = false) => `${subject} se ${plural ? 'activan' : 'activa'} cuando el sitio se conecta a la base de datos.`;
