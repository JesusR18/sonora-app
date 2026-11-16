/* Barra de navegación: cambia de tono según la sección que tiene debajo
   (oscura ORYZO o clara Apple/Shop) y subraya la sección que ocupa el centro de la pantalla. */
import { $, $$ } from '../core/dom.js';

export function initNav() {
  const nav = $('#nav');
  const links = $$('.nav-links a');
  const toned = $$('main > [data-tone], footer[data-tone]');
  const navSections = $$('main > [data-nav]');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  let ticking = false;

  function onScroll() {
    ticking = false;
    // data-tone-in / data-tone-out retrasan el cambio mientras el degradado todavía es oscuro
    const line = nav.getBoundingClientRect().bottom;
    const sec = toned.find(el => {
      const r = el.getBoundingClientRect();
      return r.top + (+el.dataset.toneIn || 0) <= line && r.bottom - (+el.dataset.toneOut || 0) > line;
    });
    const tone = sec ? sec.dataset.tone : 'dark';
    if (nav.dataset.tone !== tone) {
      nav.dataset.tone = tone;
      themeMeta.content = tone === 'dark' ? '#100904' : '#fffaf3';
    }
    nav.classList.toggle('solid', scrollY > 24);

    const mid = innerHeight * .45;
    const cur = navSections.find(el => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
    links.forEach(l => l.setAttribute('aria-current', cur && l.dataset.nav === cur.dataset.nav ? 'true' : 'false'));
  }

  // Como mucho un cálculo por cuadro de animación
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
}
