/* Encuestas con resultados en vivo: un voto por persona, se puede cambiar o quitar. */
import { esc } from '../core/dom.js';
import { sb, auth, onAuth, requireLogin } from '../core/supa.js';
import { errMsg, toast } from './util.js';

/**
 * Monta una encuesta en `el`. Sin `pollId` muestra la más reciente que no pertenece a una entrada.
 * Regresa una función para desmontarla (deja de escuchar cambios).
 */
export async function mountPoll(el, { pollId, postId, empty = '' } = {}) {
  let q = sb().from('polls').select('*');
  if (pollId) q = q.eq('id', pollId);
  else if (postId) q = q.eq('post_id', postId);
  else q = q.is('post_id', null);
  const { data: polls } = await q.order('created_at', { ascending: false }).limit(1);
  const poll = polls?.[0];
  if (!poll) { el.innerHTML = empty; return () => {}; }

  let results = [], mine = null, busy = false, alive = true;
  const closed = () => poll.closes_at && new Date(poll.closes_at) < new Date();

  async function refresh() {
    const [{ data: r }, { data: v }] = await Promise.all([
      sb().from('poll_results').select('*').eq('poll_id', poll.id).order('position'),
      auth.user ? sb().from('poll_votes').select('option_id').eq('poll_id', poll.id).eq('user_id', auth.user.id).maybeSingle() : Promise.resolve({ data: null })
    ]);
    results = r || [];
    mine = v?.option_id || null;
    if (alive) render();
  }

  function render() {
    const total = results.reduce((n, o) => n + Number(o.votes), 0);
    const top = Math.max(...results.map(o => Number(o.votes)), 0);
    el.innerHTML = `<div class="poll" data-closed="${closed()}">
      <p class="poll-q">${esc(poll.question)}</p>
      <div class="poll-opts">${results.map(o => {
        const pct = total ? Math.round(Number(o.votes) / total * 100) : 0;
        return `<button type="button" class="poll-opt${o.option_id === mine ? ' mine' : ''}${top && Number(o.votes) === top ? ' lead' : ''}" data-opt="${o.option_id}" ${closed() ? 'disabled' : ''} aria-pressed="${o.option_id === mine}">
          <span class="po-bar" style="width:${pct}%"></span>
          <span class="po-label">${esc(o.label)}${o.option_id === mine ? ' <small>· tu voto</small>' : ''}</span>
          <span class="po-pct num">${pct}%</span>
        </button>`;
      }).join('')}</div>
      <p class="poll-foot num">${total === 1 ? '1 voto' : `${total} votos`} · ${closed() ? 'Encuesta cerrada' : poll.closes_at ? `Cierra el ${new Date(poll.closes_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : 'Resultados en vivo'}${mine && !closed() ? ' · toca tu voto para quitarlo' : ''}</p>
    </div>`;
  }

  async function vote(optionId) {
    if (busy || closed() || !requireLogin('para votar')) return;
    busy = true;
    try {
      await sb().from('poll_votes').delete().eq('poll_id', poll.id).eq('user_id', auth.user.id);
      if (optionId !== mine) {
        const { error } = await sb().from('poll_votes').insert({ poll_id: poll.id, option_id: optionId });
        if (error) throw error;
      }
      await refresh();
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { busy = false; }
  }

  const onClick = e => { const b = e.target.closest('[data-opt]'); if (b) vote(b.dataset.opt); };
  el.addEventListener('click', onClick);

  // Cada voto de cualquier persona actualiza las barras al instante
  let timer = null;
  const channel = sb().channel(`poll-${poll.id}-${Math.random().toString(36).slice(2, 7)}`)
    // Los borrados no se pueden filtrar en el servidor de Realtime: se filtra aquí
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, ({ new: n, old: o }) => {
      if ((n?.poll_id || o?.poll_id) !== poll.id) return;
      clearTimeout(timer); timer = setTimeout(refresh, 250);
    })
    .subscribe();
  // onAuth llama una vez de inmediato: sirve como primera carga
  const offAuth = onAuth(() => alive && refresh());

  return () => { alive = false; offAuth(); el.removeEventListener('click', onClick); sb().removeChannel(channel); };
}
