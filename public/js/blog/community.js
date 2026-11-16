/* Comunidad: encuesta de la semana, chat en vivo (con quién está conectado), reseñas recientes
   y lo más escuchado. Todo se actualiza al instante con Supabase Realtime. */
import { $, esc } from '../core/dom.js';
import { store, byId } from '../core/store.js';
import { cov } from '../core/covers.js';
import { sb, auth, onAuth, connected, isAdmin, requireLogin } from '../core/supa.js';
import { stats, onStats } from '../core/api.js';
import { mountPoll } from './poll.js';
import { stars } from './reviews.js';
import { avatar, agoTag, toast, errMsg, offline } from './util.js';

const ROOM = 'general';
const profiles = new Map(); // id → perfil (para los mensajes que llegan en vivo)
let messages = [];

/* ---------- Chat ---------- */

async function profileOf(id) {
  if (!profiles.has(id)) {
    const { data } = await sb().from('profiles').select('id,display_name,avatar_url,username').eq('id', id).maybeSingle();
    profiles.set(id, data);
  }
  return profiles.get(id);
}

const msgHtml = m => {
  const mine = m.user_id === auth.user?.id;
  return `<li class="msg${mine ? ' mine' : ''}" data-id="${m.id}">
    ${avatar(m.author, 28)}
    <div><p class="msg-head"><b>${esc(m.author?.display_name || 'Oyente')}</b>${agoTag(m.created_at)}${mine || isAdmin() ? `<button type="button" class="msg-del" data-msg-del="${m.id}" aria-label="Borrar mensaje">×</button>` : ''}</p>
    <p class="msg-body">${esc(m.body)}</p></div>
  </li>`;
};

function renderChat(stick) {
  const list = $('#chatList');
  const atBottom = stick || list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.innerHTML = messages.length ? messages.map(msgHtml).join('') : '<li class="chat-empty">Nadie ha escrito todavía. ¡Rompe el hielo!</li>';
  if (atBottom) list.scrollTop = list.scrollHeight;
}

function renderChatForm() {
  const f = $('#chatForm');
  f.querySelector('input').placeholder = auth.user ? `Escribe como ${auth.profile?.display_name || 'Oyente'}…` : 'Inicia sesión para escribir';
  f.querySelector('input').readOnly = !auth.user;
}

async function initChat() {
  const { data } = await sb().from('chat_messages')
    .select('id,room,user_id,body,created_at,author:profiles(id,display_name,avatar_url,username)')
    .eq('room', ROOM).order('created_at', { ascending: false }).limit(60);
  messages = (data || []).reverse();
  messages.forEach(m => m.author && profiles.set(m.user_id, m.author));
  renderChat(true);

  // Mensajes nuevos y borrados en vivo, y "presencia": cuántas personas tienen la página abierta
  const channel = sb().channel(`chat-${ROOM}`, { config: { presence: { key: crypto.randomUUID?.() || String(Math.random()) } } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room=eq.${ROOM}` }, async ({ new: m }) => {
      if (messages.some(x => x.id === m.id)) return;
      m.author = await profileOf(m.user_id);
      messages.push(m);
      if (messages.length > 200) messages.shift();
      renderChat(m.user_id === auth.user?.id);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, ({ old }) => {
      messages = messages.filter(m => m.id !== old.id);
      renderChat();
    })
    .on('presence', { event: 'sync' }, () => {
      const people = Object.values(channel.presenceState()).flat();
      const n = people.length;
      $('#chatOnline').innerHTML = `<i></i>${n === 1 ? '1 persona conectada' : `${n} personas conectadas`}`;
    })
    .subscribe(status => { if (status === 'SUBSCRIBED') channel.track({ name: auth.profile?.display_name || null, at: Date.now() }); });

  onAuth(() => { renderChatForm(); renderChat(); channel.track({ name: auth.profile?.display_name || null, at: Date.now() }); });

  $('#chatForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireLogin('para escribir en el chat')) return;
    const input = e.target.querySelector('input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    const { error } = await sb().from('chat_messages').insert({ room: ROOM, body });
    if (error) { input.value = body; toast(errMsg(error), 'error'); }
  });
  $('#chatForm input').addEventListener('focus', () => { if (!auth.user) requireLogin('para escribir en el chat'); });
  $('#chatList').addEventListener('click', async e => {
    const id = e.target.closest('[data-msg-del]')?.dataset.msgDel;
    if (!id) return;
    const { error } = await sb().from('chat_messages').delete().eq('id', id);
    if (error) toast(errMsg(error), 'error');
  });
}

/* ---------- Reseñas recientes ---------- */

async function loadRecentReviews() {
  const { data } = await sb().from('album_reviews')
    .select('album_id,rating,body,updated_at,author:profiles(display_name,avatar_url)')
    .order('updated_at', { ascending: false }).limit(6);
  const list = (data || []).filter(r => byId(r.album_id) >= 0);
  $('#recentReviews').innerHTML = list.length ? list.map(r => {
    const i = byId(r.album_id), a = store.ALBUMS[i];
    return `<li><button type="button" class="rr" data-i="${i}" data-play="1">
      <img src="${cov(a, 100)}" alt="" loading="lazy">
      <span class="rr-main"><span class="rr-title">${esc(a.title)}</span>${stars(r.rating)}
      ${r.body ? `<span class="rr-body">“${esc(r.body.length > 120 ? r.body.slice(0, 120) + '…' : r.body)}”</span>` : ''}
      <span class="rr-who">${esc(r.author?.display_name || 'Oyente')} · ${agoTag(r.updated_at)}</span></span>
    </button></li>`;
  }).join('') : '<li class="cm-empty">Aún no hay reseñas. Pon un disco en el tocadiscos y califícalo.</li>';
}

/* ---------- Lo más escuchado (con o sin Supabase) ---------- */

function renderTop() {
  const top = store.ALBUMS
    .filter(a => stats.plays[a.id] || stats.likes[a.id])
    .sort((a, b) => (stats.plays[b.id] || 0) - (stats.plays[a.id] || 0) || (stats.likes[b.id] || 0) - (stats.likes[a.id] || 0))
    .slice(0, 5);
  $('#topList').innerHTML = top.length ? top.map((a, n) => `<li><button type="button" class="top-row" data-i="${store.ALBUMS.indexOf(a)}" data-play="1">
      <span class="top-n num">${n + 1}</span><img src="${cov(a, 100)}" alt="" loading="lazy">
      <span class="top-main"><b>${esc(a.title)}</b><span>${esc(store.ARTISTS[a.artist].name)}</span></span>
      <span class="top-stats num">▶ ${stats.plays[a.id] || 0}${stats.rating[a.id] ? ` · ★ ${stats.rating[a.id].toFixed(1)}` : ''}</span>
    </button></li>`).join('')
    : '<li class="cm-empty">Todavía no se ha escuchado nada. ¡Pon el primer disco!</li>';
}

/* ---------- Inicio ---------- */

export async function initCommunity() {
  renderTop();
  onStats(renderTop);

  if (!connected()) {
    $('#pollBox').innerHTML = `<p class="rd-note">${offline('Las encuestas', true)}</p>`;
    $('#chatList').innerHTML = `<li class="chat-empty">${offline('El chat')}</li>`;
    $('#chatForm').hidden = true;
    $('#chatOnline').textContent = '';
    $('#recentReviews').innerHTML = `<li class="cm-empty">${offline('Las reseñas', true)}</li>`;
    return;
  }

  const EMPTY = '<p class="rd-note">No hay encuestas abiertas por ahora.</p>';
  let unmountPoll = await mountPoll($('#pollBox'), { empty: EMPTY });
  // Al crear una encuesta nueva desde el editor, se muestra en lugar de la anterior
  document.addEventListener('sonora:poll', async () => { unmountPoll(); unmountPoll = await mountPoll($('#pollBox'), { empty: EMPTY }); });
  initChat();
  loadRecentReviews();
  let timer = null;
  sb().channel('recent-reviews')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'album_reviews' }, () => { clearTimeout(timer); timer = setTimeout(loadRecentReviews, 400); })
    .subscribe();
}
