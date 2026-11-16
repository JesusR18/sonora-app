/* Utilidades de DOM y de texto compartidas por todos los módulos. */

export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];

/** Escapa texto para insertarlo dentro de HTML. */
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Rellena con cero a la izquierda: 7 → "07". */
export const pad = n => String(n).padStart(2, '0');

/** Quita acentos y pasa a minúsculas para comparar búsquedas. */
export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Segundos a "m:ss". */
export const fmt = t => `${Math.floor(t / 60)}:${pad(Math.floor(t % 60))}`;

/** Desplazamiento suave, salvo que la persona pida menos movimiento. */
export const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** Lleva la vista a la sección con ese id. */
export const go = id => document.getElementById(id).scrollIntoView({ behavior: smooth() });
