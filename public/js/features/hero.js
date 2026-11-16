/* Inicio (modelo ORYZO): la funda del disco actual con su vinilo y la miniatura con botón de reproducir. */
import { $ } from '../core/dom.js';
import { current, artistOf } from '../core/store.js';
import { cov, srcset } from '../core/covers.js';

export function renderHero() {
  const a = current(), A = artistOf(a);
  const sleeve = $('#heroSleeve');
  sleeve.src = cov(a, 600);
  sleeve.srcset = srcset(a);
  sleeve.sizes = '(max-width: 820px) 64vw, 34vw';
  $('#heroLabel').src = cov(a, 300);
  $('#heroObject').setAttribute('aria-label', `${a.title} de ${A.name}. Ir al tocadiscos y reproducir`);
  $('#thumbImg').src = cov(a, 200);
  $('#thumbTitle').textContent = a.feat;
  $('#thumbArtist').textContent = `${a.title} · ${A.name}`;
  $('#heroThumb').setAttribute('aria-label', `Escuchar ${a.feat} de ${A.name}`);
}
