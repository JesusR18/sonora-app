/* Menú de pantalla completa para celulares (modelo ORYZO). */
import { $ } from '../core/dom.js';

const menu = () => $('#menu');

export function setMenu(open) {
  menu().hidden = !open;
  $('#menuBtn').setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) $('#menuClose').focus();
  else $('#menuBtn').focus({ preventScroll: true });
}

/** @param {{onRandom: () => void}} handlers */
export function initMenu({ onRandom }) {
  $('#menuBtn').addEventListener('click', () => setMenu(true));
  $('#menuClose').addEventListener('click', () => setMenu(false));
  $('#menuRandom').addEventListener('click', () => { setMenu(false); onRandom(); });
  menu().addEventListener('click', e => { if (e.target.closest('ol a')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu().hidden) setMenu(false); });
}
