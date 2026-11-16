/* Portadas de los discos.
   Llegan por el servidor propio (/art/), que las descarga de Apple. Si la página se abre sin ese
   servidor (un servidor estático como Live Server) o una portada falla, se piden directo a Apple. */

const APPLE = 'https://is1-ssl.mzstatic.com/image/thumb/';
let direct = location.protocol === 'file:';

const toDirect = url => url.replace(/^.*\/art\//, APPLE);

/** URL de la portada del álbum `a` en `n`×`n` píxeles (100, 200, 300, 600 o 1000). */
export const cov = (a, n) => (direct ? APPLE : '/art/') + a.art.replace(/\/\d+x\d+bb\./, `/${n}x${n}bb.`);

/** Opciones de tamaño para que el navegador elija según la pantalla. */
export const srcset = a => `${cov(a, 300)} 300w, ${cov(a, 600)} 600w, ${cov(a, 1000)} 1000w`;

function switchToDirect(img) {
  img.dataset.fb = '1';
  if (img.srcset) img.srcset = img.srcset.split(',').map(p => toDirect(p.trim())).join(', ');
  img.src = toDirect(img.getAttribute('src'));
}

/** Al primer error de /art/, pasa todas las portadas pendientes a carga directa. */
export function initCoverFallback() {
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG' || img.dataset.fb || !(img.currentSrc || img.src).includes('/art/')) return;
    direct = true;
    switchToDirect(img);
    document.querySelectorAll('img[src*="/art/"]:not([data-fb])').forEach(o => {
      if (!(o.complete && o.naturalWidth)) switchToDirect(o);
    });
  }, true);
}
