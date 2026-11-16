/* Lector de entradas (#/p/<slug>): artículo o noticia, reacciones, encuesta y comentarios en vivo. */
import { $, esc } from '../core/dom.js';
import { store, albumsOf } from '../core/store.js';
import { cov } from '../core/covers.js';
import { sb, auth, onAuth, connected, isAdmin, requireLogin } from '../core/supa.js';
import { openModal, closeModal } from '../ui/modal.js';
import { md, agoTag, longDate, avatar, toast, errMsg, offline } from './util.js';
import { postCache } from './feed.js';
import { mountPoll } from './poll.js';

export const REACTIONS = { fire: '🔥', heart: '❤️', vinyl: '💿', mind: '🤯', sad: '😢' };
const REACTION_NAMES = { fire: 'Fuego', heart: 'Me encanta', vinyl: 'Para el tocadiscos', mind: 'Sorprendente', sad: 'Triste' };
const POST_SELECT = 'id,slug,kind,status,title,excerpt,body,cover_url,source_name,source_url,author_id,artist_id,album_id,tags,featured,published_at,author:profiles(display_name,avatar_url,username)';

let post = null;           // entrada abierta
let comments = [];         // con autor y likes
let likes = new Map();     // comment_id → { n, mine }
let reactions = {};        // emoji → { n, mine }
let replyTo = null;        // comentario al que se responde
let channel = null, unmountPoll = null, offAuth = null;
let openedFromPage = false;

const reader = () => $('#reader');

/* ---------- Abrir y cerrar ---------- */

async function findPost(slug) {
  if (connected()) {
    const { data } = await sb().from('posts').select(POST_SELECT).eq('slug', slug).maybeSingle();
    if (data) return data;
  }
  if (postCache.has(slug)) return postCache.get(slug);
  // Enlace directo a una noticia sin base de datos: se busca entre las del servidor
  try {
    const { items } = await (await fetch('/api/news?limit=100')).json();
    return items.find(p => p.slug === slug) || null;
  } catch { return null; }
}

async function open(slug) {
  const el = reader();
  $('#readerBody').innerHTML = '<p class="rd-loading">Cargando…</p>';
  openModal(el);
  el.scrollTop = 0;
  cleanup();
  post = await findPost(slug);
  if (!post) { $('#readerBody').innerHTML = '<p class="rd-loading">No encontramos esa entrada. Puede que se haya borrado.</p>'; return; }
  document.title = `${post.title} · Sonora`;
  renderPost();
  if (connected() && post.id) {
    await Promise.all([loadReactions(), loadComments()]);
    subscribe();
    unmountPoll = await mountPoll($('#rdPoll'), { postId: post.id });
    offAuth = onAuth(() => { loadReactions(); loadComments(); renderForm(); });
  }
}

function cleanup() {
  if (channel) { sb().removeChannel(channel); channel = null; }
  unmountPoll?.(); unmountPoll = null;
  offAuth?.(); offAuth = null;
  comments = []; likes = new Map(); reactions = {}; replyTo = null;
}

export function closeReader() {
  if (!reader().hidden) closeModal(reader());
}

function onClosed() {
  cleanup();
  post = null;
  document.title = 'Sonora · Blog de música';
  if (location.hash.startsWith('#/p/')) {
    if (openedFromPage) history.back();
    else history.replaceState(null, '', '#noticias');
  }
  openedFromPage = false;
}

/* ---------- Entrada ---------- */

function relatedAlbums() {
  if (post.album_id) {
    const a = store.ALBUMS.find(x => x.id === post.album_id);
    if (a) return [a, ...albumsOf(a.artist).filter(x => x !== a)].slice(0, 6);
  }
  return post.artist_id ? albumsOf(post.artist_id).slice(-6).reverse() : [];
}

function renderPost() {
  const p = post;
  const isNews = p.kind === 'news';
  const related = relatedAlbums();
  const artist = store.ARTISTS[p.artist_id] || (related[0] && store.ARTISTS[related[0].artist]);
  const cover = p.cover_url || (related[0] ? cov(related[0], 1000) : '');
  $('#readerBody').innerHTML = `
    <article class="rd-article">
      <header class="rd-head">
        <p class="rd-kicker">${isNews ? `Noticia · ${esc(p.source_name || '')}` : 'Artículo de Sonora'}${p.tags?.length ? ` · ${p.tags.slice(0, 3).map(esc).join(' · ')}` : ''}</p>
        <h1 class="rd-title">${esc(p.title)}</h1>
        <p class="rd-meta">
          ${!isNews && p.author ? `${avatar(p.author, 28)}<span>${esc(p.author.display_name)}</span>` : ''}
          <span>${longDate(p.published_at)} · ${agoTag(p.published_at)}</span>
          ${p.status === 'draft' ? '<span class="rd-draft">Borrador</span>' : ''}
        </p>
        ${isAdmin() && p.id ? `<p class="rd-admin"><button type="button" class="tlink" data-edit-post>Editar</button><button type="button" class="tlink" data-delete-post>Eliminar</button></p>` : ''}
      </header>
      ${cover ? `<figure class="rd-cover"><img src="${esc(cover)}" alt="" ${p.cover_url ? 'referrerpolicy="no-referrer"' : ''} onerror="this.parentNode.remove()"></figure>` : ''}
      <div class="rd-prose">
        ${isNews ? `<p class="rd-lede">${esc(p.excerpt || '')}</p>` : (p.excerpt ? `<p class="rd-lede">${esc(p.excerpt)}</p>` : '') + md(p.body || '')}
      </div>
      ${isNews && p.source_url ? `<a class="pill pill-fill rd-source" href="${esc(p.source_url)}" target="_blank" rel="noopener">Leer la nota completa en ${esc(p.source_name || 'la fuente')} ↗</a>` : ''}
      ${related.length ? `<aside class="rd-related">
        <p class="g-eyebrow">${artist ? `${esc(artist.name)} en Sonora` : 'Escúchalo en Sonora'}</p>
        <div class="rd-albums">${related.map(a => `<button type="button" class="rd-album" data-i="${store.ALBUMS.indexOf(a)}" data-play="1" aria-label="Poner ${esc(a.title)} en el tocadiscos">
          <img src="${cov(a, 300)}" alt="" loading="lazy"><span>${esc(a.title)}</span><small class="num">${a.year}</small></button>`).join('')}</div>
      </aside>` : ''}
      <section class="rd-react" id="rdReact" aria-label="Reacciones"></section>
      <div id="rdPoll" class="rd-poll"></div>
      <section class="rd-comments" aria-labelledby="rdCommentsTitle">
        <h2 id="rdCommentsTitle">Comentarios <span class="num" id="rdCount"></span></h2>
        <div id="rdForm"></div>
        <ol class="cm-list" id="rdList"></ol>
      </section>
    </article>`;
  renderReactions();
  renderForm();
  renderComments();
}

/* ---------- Reacciones ---------- */

async function loadReactions() {
  const { data } = await sb().from('post_reactions').select('emoji,user_id').eq('post_id', post.id);
  reactions = {};
  (data || []).forEach(r => {
    const x = reactions[r.emoji] ||= { n: 0, mine: false };
    x.n++; if (r.user_id === auth.user?.id) x.mine = true;
  });
  renderReactions();
}

function renderReactions() {
  const box = $('#rdReact');
  if (!box) return;
  if (!connected() || !post.id) { box.innerHTML = `<p class="rd-note">${offline('Las reacciones y los comentarios', true)}</p>`; return; }
  box.innerHTML = `<p class="g-eyebrow">¿Qué te pareció?</p><div class="react-row">${Object.entries(REACTIONS).map(([k, e]) => {
    const r = reactions[k] || { n: 0, mine: false };
    return `<button type="button" class="react${r.mine ? ' mine' : ''}" data-react="${k}" aria-pressed="${r.mine}" title="${REACTION_NAMES[k]}"><span>${e}</span><b class="num">${r.n || ''}</b></button>`;
  }).join('')}</div>`;
}

async function toggleReaction(k) {
  if (!requireLogin('para reaccionar')) return;
  const r = reactions[k] ||= { n: 0, mine: false };
  const on = !r.mine;
  r.mine = on; r.n += on ? 1 : -1;
  renderReactions();
  const q = on ? sb().from('post_reactions').insert({ post_id: post.id, emoji: k })
    : sb().from('post_reactions').delete().match({ post_id: post.id, emoji: k, user_id: auth.user.id });
  const { error } = await q;
  if (error && !/duplicate/.test(error.message)) { toast(errMsg(error), 'error'); loadReactions(); }
}

/* ---------- Comentarios ---------- */

async function loadComments() {
  const { data, error } = await sb().from('comments')
    .select('id,post_id,user_id,parent_id,body,created_at,edited_at,author:profiles(display_name,avatar_url,username)')
    .eq('post_id', post.id).order('created_at');
  if (error) return console.warn(error.message);
  comments = data || [];
  const ids = comments.map(c => c.id);
  likes = new Map();
  if (ids.length) {
    const { data: l } = await sb().from('comment_likes').select('comment_id,user_id').in('comment_id', ids);
    (l || []).forEach(x => {
      const v = likes.get(x.comment_id) || { n: 0, mine: false };
      v.n++; if (x.user_id === auth.user?.id) v.mine = true;
      likes.set(x.comment_id, v);
    });
  }
  renderComments();
}

const commentHtml = c => {
  const l = likes.get(c.id) || { n: 0, mine: false };
  const canDelete = auth.user && (c.user_id === auth.user.id || isAdmin());
  return `<li class="cm" id="c-${c.id}">
    ${avatar(c.author, 36)}
    <div class="cm-main">
      <p class="cm-head"><b>${esc(c.author?.display_name || 'Oyente')}</b>${c.author?.username ? `<span>@${esc(c.author.username)}</span>` : ''}${agoTag(c.created_at)}</p>
      <p class="cm-body">${esc(c.body).replace(/\n/g, '<br>')}</p>
      <p class="cm-actions">
        <button type="button" class="cm-like${l.mine ? ' mine' : ''}" data-like="${c.id}" aria-pressed="${l.mine}">♥ <span class="num">${l.n || ''}</span></button>
        ${c.parent_id ? '' : `<button type="button" data-reply="${c.id}">Responder</button>`}
        ${canDelete ? `<button type="button" data-del="${c.id}">Borrar</button>` : ''}
      </p>
      ${c.parent_id ? '' : `<ol class="cm-replies">${comments.filter(r => r.parent_id === c.id).map(commentHtml).join('')}</ol>`}
    </div>
  </li>`;
};

function renderComments() {
  const list = $('#rdList');
  if (!list) return;
  $('#rdCount').textContent = comments.length ? `(${comments.length})` : '';
  const roots = comments.filter(c => !c.parent_id).reverse(); // los más nuevos arriba
  list.innerHTML = roots.length ? roots.map(commentHtml).join('')
    : connected() && post.id ? '<li class="cm-empty">Sé la primera persona en comentar.</li>' : '';
}

function renderForm() {
  const box = $('#rdForm');
  if (!box) return;
  if (!connected() || !post.id) { box.innerHTML = ''; return; }
  if (!auth.user) { box.innerHTML = `<button type="button" class="cm-login" data-login>Inicia sesión para comentar</button>`; return; }
  const parent = replyTo && comments.find(c => c.id === replyTo);
  box.innerHTML = `<form class="cm-form" id="cmForm">
    ${avatar(auth.profile, 36)}
    <div>
      ${parent ? `<p class="cm-replying">Respondiendo a <b>${esc(parent.author?.display_name || 'Oyente')}</b> <button type="button" class="tlink" data-cancel-reply>Cancelar</button></p>` : ''}
      <label class="sr" for="cmText">Tu comentario</label>
      <textarea id="cmText" name="body" rows="3" maxlength="2000" placeholder="${parent ? 'Escribe tu respuesta…' : '¿Qué opinas?'}" required></textarea>
      <div class="cm-send"><span class="num" id="cmLeft">2000</span><button class="pill pill-fill" type="submit">Publicar</button></div>
    </div>
  </form>`;
}

async function sendComment(form) {
  const body = form.body.value.trim();
  if (!body) return;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  const { data, error } = await sb().from('comments').insert({ post_id: post.id, body, parent_id: replyTo })
    .select('id,post_id,user_id,parent_id,body,created_at,edited_at,author:profiles(display_name,avatar_url,username)').single();
  btn.disabled = false;
  if (error) return toast(errMsg(error), 'error');
  if (!comments.some(c => c.id === data.id)) comments.push(data);
  replyTo = null;
  renderForm(); renderComments();
}

async function toggleLike(id) {
  if (!requireLogin('para dar me gusta')) return;
  const l = likes.get(id) || { n: 0, mine: false };
  const on = !l.mine;
  likes.set(id, { n: l.n + (on ? 1 : -1), mine: on });
  renderComments();
  const { error } = on ? await sb().from('comment_likes').insert({ comment_id: id })
    : await sb().from('comment_likes').delete().match({ comment_id: id, user_id: auth.user.id });
  if (error && !/duplicate/.test(error.message)) { toast(errMsg(error), 'error'); loadComments(); }
}

async function deleteComment(id) {
  if (!confirm('¿Borrar este comentario?')) return;
  const { error } = await sb().from('comments').delete().eq('id', id);
  if (error) return toast(errMsg(error), 'error');
  comments = comments.filter(c => c.id !== id && c.parent_id !== id);
  renderComments();
}

/* ---------- Tiempo real ---------- */

function subscribe() {
  const pid = post.id;
  let t1 = null;
  channel = sb().channel(`post-${pid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${pid}` }, async ({ new: c }) => {
      if (comments.some(x => x.id === c.id)) return;
      const { data } = await sb().from('profiles').select('display_name,avatar_url,username').eq('id', c.user_id).maybeSingle();
      comments.push({ ...c, author: data });
      renderComments();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, ({ old }) => {
      if (!comments.some(c => c.id === old.id)) return;
      comments = comments.filter(c => c.id !== old.id && c.parent_id !== old.id);
      renderComments();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_likes' }, ({ new: n, old: o }) => {
      const id = n?.comment_id || o?.comment_id;
      if ((n?.user_id || o?.user_id) === auth.user?.id || !comments.some(c => c.id === id)) return;
      const l = likes.get(id) || { n: 0, mine: false };
      l.n = Math.max(0, l.n + (n?.comment_id ? 1 : -1));
      likes.set(id, l);
      renderComments();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reactions' }, ({ new: n, old: o }) => {
      if ((n?.post_id || o?.post_id) !== pid || (n?.user_id || o?.user_id) === auth.user?.id) return;
      clearTimeout(t1); t1 = setTimeout(loadReactions, 200);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts', filter: `id=eq.${pid}` }, ({ new: p }) => {
      rerender({ ...post, ...p });
    })
    .subscribe();
}

/* ---------- Eventos ---------- */

async function share() {
  if (!post) return;
  const url = `${location.origin}/#/p/${encodeURIComponent(post.slug)}`;
  try {
    if (navigator.share) await navigator.share({ title: post.title, url });
    else { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
  } catch {}
}

function route() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) open(decodeURIComponent(m[1]));
  else closeReader();
}

/** @param {{onEdit: (post) => void}} hooks */
export function initReader({ onEdit }) {
  const el = reader();
  el.addEventListener('modal:close', onClosed);
  el.addEventListener('click', async e => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.play) { closeReader(); return; } // el manejador general lo pone en el tocadiscos
    if (t.dataset.share !== undefined) return share();
    if (t.dataset.react) return toggleReaction(t.dataset.react);
    if (t.dataset.like) return toggleLike(t.dataset.like);
    if (t.dataset.reply) { replyTo = t.dataset.reply; renderForm(); $('#cmText')?.focus(); return; }
    if (t.dataset.cancelReply !== undefined) { replyTo = null; renderForm(); return; }
    if (t.dataset.del) return deleteComment(t.dataset.del);
    if (t.dataset.login !== undefined) return requireLogin('para comentar');
    if (t.dataset.editPost !== undefined) return onEdit(post);
    if (t.dataset.deletePost !== undefined) {
      if (!confirm('¿Eliminar esta entrada y sus comentarios? No se puede deshacer.')) return;
      const { error } = await sb().from('posts').delete().eq('id', post.id);
      if (error) return toast(errMsg(error), 'error');
      toast('Entrada eliminada');
      closeReader();
    }
  });
  el.addEventListener('submit', e => { if (e.target.id === 'cmForm') { e.preventDefault(); sendComment(e.target); } });
  el.addEventListener('input', e => { if (e.target.id === 'cmText') $('#cmLeft').textContent = 2000 - e.target.value.length; });
  el.addEventListener('keydown', e => { if (e.target.id === 'cmText' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.target.form.requestSubmit(); } });
  // Los enlaces #/p/... dentro de la página abren el lector y "Atrás" lo cierra
  document.addEventListener('click', e => { if (e.target.closest('a[href^="#/p/"]')) openedFromPage = true; });
  addEventListener('hashchange', route);
  route();
}

/** Vuelve a pintar la entrada abierta (después de editarla). */
export function refreshOpenPost(p) {
  if (post && p && post.id === p.id) rerender({ ...post, ...p });
}

async function rerender(next) {
  post = next;
  renderPost();
  unmountPoll?.();
  unmountPoll = await mountPoll($('#rdPoll'), { postId: post.id });
}
