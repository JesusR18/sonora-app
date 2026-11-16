/* Panel de administración: escribir y editar entradas, crear encuestas y pedir noticias nuevas. */
import { $, esc, norm } from '../core/dom.js';
import { store } from '../core/store.js';
import { sb, auth, isAdmin, accessToken } from '../core/supa.js';
import { openModal, closeModal } from '../ui/modal.js';
import { md, toast, errMsg } from './util.js';
import { addLocal, reloadFeed } from './feed.js';
import { refreshOpenPost } from './reader.js';

let editing = null; // entrada que se edita (null = nueva)

const slugify = t => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) + '-' + Math.random().toString(36).slice(2, 6);

function fillSelects() {
  $('#edArtist').innerHTML = '<option value="">Ninguno</option>' + store.ARTIST_ORDER.map(id => `<option value="${id}">${esc(store.ARTISTS[id].name)}</option>`).join('');
  $('#edAlbum').innerHTML = '<option value="">Ninguno</option>' + store.ALBUMS.map(a => `<option value="${a.id}">${esc(store.ARTISTS[a.artist].name)} — ${esc(a.title)} (${a.year})</option>`).join('');
  $('#pollAttach').innerHTML = '<option value="">En la sección Comunidad</option>';
}

/** Abre el editor vacío o con una entrada existente. */
export function openEditor(post = null) {
  if (!isAdmin()) return;
  editing = post?.id ? post : null;
  const f = $('#editorForm');
  f.reset();
  $('#editorTitle').textContent = editing ? 'Editar entrada' : 'Nueva entrada';
  if (editing) {
    f.title.value = editing.title || '';
    f.excerpt.value = editing.excerpt || '';
    f.cover_url.value = editing.cover_url || '';
    f.body.value = editing.body || '';
    f.tags.value = (editing.tags || []).join(', ');
    f.artist_id.value = editing.artist_id || '';
    f.album_id.value = editing.album_id || '';
    f.featured.checked = !!editing.featured;
    f.status.value = editing.status || 'published';
  }
  $('#edPreview').hidden = true;
  $('#edBody').hidden = false;
  $('#edMsg').textContent = '';
  openModal($('#editorModal'));
}

async function savePost(e) {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('[type=submit]');
  const row = {
    title: f.title.value.trim(),
    excerpt: f.excerpt.value.trim() || null,
    cover_url: f.cover_url.value.trim() || null,
    body: f.body.value,
    tags: f.tags.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
    artist_id: f.artist_id.value || null,
    album_id: f.album_id.value || null,
    featured: f.featured.checked,
    status: f.status.value
  };
  if (row.album_id && !row.artist_id) row.artist_id = store.ALBUMS.find(a => a.id === row.album_id)?.artist || null;
  if (row.cover_url && !/^https:\/\//.test(row.cover_url)) { $('#edMsg').textContent = 'La portada debe ser un enlace https://'; return; }
  btn.disabled = true;
  const q = editing
    ? sb().from('posts').update(row).eq('id', editing.id)
    : sb().from('posts').insert({ ...row, kind: 'article', slug: slugify(row.title), author_id: auth.user.id, published_at: new Date().toISOString() });
  const { data, error } = await q.select('*, author:profiles(display_name,avatar_url,username)').single();
  btn.disabled = false;
  if (error) { $('#edMsg').textContent = errMsg(error); return; }
  closeModal($('#editorModal'));
  toast(editing ? 'Entrada actualizada' : row.status === 'draft' ? 'Borrador guardado' : '¡Entrada publicada!');
  if (editing) refreshOpenPost(data);
  else if (data.status === 'published') addLocal({ ...data, stats: { comments: 0, reactions: 0 } });
}

function togglePreview() {
  const prev = $('#edPreview');
  const showing = prev.hidden;
  prev.hidden = !showing;
  $('#edBody').hidden = showing;
  $('#edPreviewBtn').textContent = showing ? 'Seguir escribiendo' : 'Vista previa';
  if (showing) prev.innerHTML = md($('#edBody').value) || '<p>(Vacío)</p>';
}

/* ---------- Encuestas ---------- */

function optionRow(value = '') {
  const n = $('#pollOptions').children.length + 1;
  const li = document.createElement('li');
  li.innerHTML = `<label class="sr" for="po${n}">Opción ${n}</label><input id="po${n}" name="option" maxlength="120" placeholder="Opción ${n}" value="${esc(value)}"><button type="button" class="tlink" data-remove-option aria-label="Quitar opción">×</button>`;
  $('#pollOptions').append(li);
}

async function openPollEditor() {
  if (!isAdmin()) return;
  $('#pollForm').reset();
  $('#pollOptions').innerHTML = '';
  optionRow(); optionRow();
  $('#pollMsg').textContent = '';
  // Se puede adjuntar a uno de los artículos recientes
  const { data } = await sb().from('posts').select('id,title').eq('kind', 'article').order('published_at', { ascending: false }).limit(20);
  $('#pollAttach').innerHTML = '<option value="">En la sección Comunidad</option>' + (data || []).map(p => `<option value="${p.id}">Dentro de: ${esc(p.title)}</option>`).join('');
  openModal($('#pollModal'));
}

async function savePoll(e) {
  e.preventDefault();
  const f = e.target;
  const options = [...f.querySelectorAll('[name=option]')].map(i => i.value.trim()).filter(Boolean);
  if (options.length < 2) { $('#pollMsg').textContent = 'Agrega al menos dos opciones.'; return; }
  const days = +f.days.value;
  const { data: poll, error } = await sb().from('polls').insert({
    question: f.question.value.trim(),
    post_id: f.post_id.value || null,
    closes_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null
  }).select().single();
  if (error) { $('#pollMsg').textContent = errMsg(error); return; }
  const { error: e2 } = await sb().from('poll_options').insert(options.map((label, position) => {
    const album = store.ALBUMS.find(a => norm(a.title) === norm(label));
    return { poll_id: poll.id, label, position, album_id: album?.id || null };
  }));
  if (e2) { $('#pollMsg').textContent = errMsg(e2); return; }
  closeModal($('#pollModal'));
  toast('Encuesta publicada');
  document.dispatchEvent(new CustomEvent('sonora:poll', { detail: poll }));
}

/* ---------- Noticias ---------- */

async function refreshNews(btn) {
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Buscando…';
  try {
    const res = await fetch('/api/news/refresh', { method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}` } });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error);
    toast(r.added ? `${r.added} noticias nuevas` : 'No hay noticias nuevas por ahora');
    if (r.added) reloadFeed();
  } catch (e) { toast(errMsg(e), 'error'); }
  finally { btn.disabled = false; btn.textContent = old; }
}

export function initEditor() {
  fillSelects();
  $('#editorForm').addEventListener('submit', savePost);
  $('#edPreviewBtn').addEventListener('click', togglePreview);
  $('#pollForm').addEventListener('submit', savePoll);
  $('#addOption').addEventListener('click', () => { if ($('#pollOptions').children.length < 8) optionRow(); });
  $('#pollOptions').addEventListener('click', e => { if (e.target.closest('[data-remove-option]') && $('#pollOptions').children.length > 2) e.target.closest('li').remove(); });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-admin]');
    if (!t) return;
    if (t.dataset.admin === 'post') { closeModal($('#profileModal')); openEditor(); }
    if (t.dataset.admin === 'poll') { closeModal($('#profileModal')); openPollEditor(); }
    if (t.dataset.admin === 'news') refreshNews(t);
  });
}
