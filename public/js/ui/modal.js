/* Ventanas (cuenta, perfil, editor, lector): abrir, cerrar con Esc o con el fondo, y devolver el foco. */

const stack = [];

export function openModal(el) {
  if (!el.hidden) return;
  stack.push({ el, back: document.activeElement });
  el.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => (el.querySelector('[autofocus]') || el.querySelector('input, textarea, select, button'))?.focus({ preventScroll: true }));
}

export function closeModal(el) {
  const i = stack.findIndex(s => s.el === el);
  if (i < 0) return;
  const [{ back }] = stack.splice(i, 1);
  el.hidden = true;
  el.dispatchEvent(new CustomEvent('modal:close'));
  if (!stack.length) document.body.classList.remove('modal-open');
  back?.focus?.({ preventScroll: true });
}

export function initModals() {
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) closeModal(stack[stack.length - 1].el); });
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]');
    if (close) return closeModal(close.closest('.modal, .reader'));
    // Clic en el fondo oscuro
    if (e.target.classList?.contains('modal')) closeModal(e.target);
  });
}
