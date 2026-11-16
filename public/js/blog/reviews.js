/* Reseñas del disco que está en el tocadiscos: promedio, lista y formulario (1 a 5 estrellas). */
import { $, esc } from '../core/dom.js';
import { current, artistOf } from '../core/store.js';
import { sb, auth, onAuth, connected, isAdmin, requireLogin } from '../core/supa.js';
import { avatar, agoTag, toast, errMsg, offline } from './util.js';

let album = null, list = [], rating = 0, editing = false, loadId = 0;

export const stars = (n, cls = 'stars') => `<span class="${cls}" aria-label="${n} de 5 estrellas">${'★'.repeat(Math.round(n))}<i>${'★'.repeat(5 - Math.round(n))}</i></span>`;

async function load() {
  album = current();
  if (!album) return;
  render();
  if (!connected()) return;
  const id = ++loadId;
  const { data, error } = await sb().from('album_reviews')
    .select('album_id,user_id,rating,body,created_at,updated_at,author:profiles(display_name,avatar_url,username)')
    .eq('album_id', album.id).order('updated_at', { ascending: false });
  if (id !== loadId) return; // ya se cambió de disco
  if (error) { console.warn(error.message); return; }
  list = data || [];
  const mine = list.find(r => r.user_id === auth.user?.id);
  rating = mine?.rating || 0;
  editing = false;
  render();
}

function render() {
  const box = $('#reviews');
  if (!box || !album) return;
  const A = artistOf(album);
  const avg = list.length ? list.reduce((n, r) => n + r.rating, 0) / list.length : 0;
  const mine = list.find(r => r.user_id === auth.user?.id);
  const showForm = auth.user && (!mine || editing);

  let form = '';
  if (!connected()) form = `<p class="rv-note">${offline('Las reseñas', true)}</p>`;
  else if (!auth.user) form = `<button type="button" class="pill pill-line" data-review-login>Inicia sesión para reseñar</button>`;
  else if (showForm) form = `<form class="rv-form" id="rvForm">
      <fieldset class="star-input" aria-label="Tu calificación">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" aria-pressed="${n <= rating}" aria-label="${n} estrella${n > 1 ? 's' : ''}">★</button>`).join('')}
      </fieldset>
      <label class="sr" for="rvText">Tu reseña</label>
      <textarea id="rvText" name="body" rows="3" maxlength="3000" placeholder="¿Qué te parece ${esc(album.title)}? (opcional)">${esc(mine?.body || '')}</textarea>
      <div class="rv-send">
        ${mine ? '<button type="button" class="tlink" data-review-cancel>Cancelar</button><button type="button" class="tlink" data-review-delete>Borrar mi reseña</button>' : ''}
        <button class="pill pill-fill" type="submit">${mine ? 'Guardar' : 'Publicar reseña'}</button>
      </div>
    </form>`;
  else form = `<button type="button" class="pill pill-line" data-review-edit>Editar mi reseña</button>`;

  box.innerHTML = `
    <div class="rv-head">
      <div>
        <p class="g-eyebrow">Reseñas de la comunidad</p>
        <h3>${esc(album.title)} <span>· ${esc(A.name)}</span></h3>
      </div>
      <div class="rv-score">${list.length ? `<b class="num">${avg.toFixed(1)}</b>${stars(avg)}<small class="num">${list.length} ${list.length === 1 ? 'reseña' : 'reseñas'}</small>` : '<small>Sin reseñas todavía</small>'}</div>
    </div>
    ${form}
    <ol class="rv-list">${list.filter(r => r !== mine || !showForm).map(r => `<li class="rv-item">
      ${avatar(r.author, 32)}
      <div>
        <p class="rv-who"><b>${esc(r.author?.display_name || 'Oyente')}</b>${stars(r.rating)}${agoTag(r.updated_at)}</p>
        ${r.body ? `<p class="rv-text">${esc(r.body).replace(/\n/g, '<br>')}</p>` : ''}
        ${isAdmin() && r.user_id !== auth.user?.id ? `<button type="button" class="tlink" data-review-remove="${r.user_id}">Quitar</button>` : ''}
      </div>
    </li>`).join('')}</ol>`;
}

async function save(form) {
  if (!rating) return toast('Elige de 1 a 5 estrellas', 'error');
  const { error } = await sb().from('album_reviews').upsert(
    { album_id: album.id, user_id: auth.user.id, rating, body: form.body.value.trim() || null },
    { onConflict: 'album_id,user_id' });
  if (error) return toast(errMsg(error), 'error');
  toast('¡Gracias por tu reseña!');
  load();
}

async function remove(userId) {
  if (!confirm('¿Borrar esta reseña?')) return;
  const { error } = await sb().from('album_reviews').delete().match({ album_id: album.id, user_id: userId });
  if (error) return toast(errMsg(error), 'error');
  load();
}

export function initReviews() {
  const box = $('#reviews');
  box.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.star) {
      rating = +t.dataset.star;
      box.querySelectorAll('[data-star]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.star <= rating));
    }
    if (t.dataset.reviewLogin !== undefined) requireLogin('para reseñar discos');
    if (t.dataset.reviewEdit !== undefined) { editing = true; rating = list.find(r => r.user_id === auth.user?.id)?.rating || 0; render(); }
    if (t.dataset.reviewCancel !== undefined) { editing = false; render(); }
    if (t.dataset.reviewDelete !== undefined) remove(auth.user.id);
    if (t.dataset.reviewRemove) remove(t.dataset.reviewRemove);
  });
  box.addEventListener('submit', e => { e.preventDefault(); save(e.target); });
  document.addEventListener('sonora:album', load);
  onAuth(load);

  if (connected()) {
    let timer = null;
    sb().channel('reviews-current')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_reviews' }, ({ new: n, old: o }) => {
        // No se recarga mientras la persona escribe su reseña
        if ((n?.album_id || o?.album_id) !== album?.id || editing || $('#rvText')?.value) return;
        clearTimeout(timer); timer = setTimeout(load, 300);
      })
      .subscribe();
  }
  load();
}

