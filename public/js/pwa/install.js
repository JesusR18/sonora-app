/* Aplicación instalable: registra el Service Worker y ofrece el botón "Instalar app".
   En Windows el botón descarga el instalador Sonora-Setup.exe; en Chrome y Edge de otros sistemas
   usa el diálogo del navegador; en iPhone y otros casos muestra los pasos. */
import { $ } from '../core/dom.js';

const INSTALLER = 'downloads/Sonora-Setup.exe';

const STEPS = {
  ios: '<ol><li>Abre esta página en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> (el cuadro con la flecha hacia arriba).</li><li>Elige <b>Agregar a pantalla de inicio</b> y toca <b>Agregar</b>.</li></ol>',
  android: '<ol><li>Abre el menú <b>⋮</b> de Chrome.</li><li>Elige <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</li></ol>',
  windows: '<ol><li>Abre <b>Sonora-Setup.exe</b> desde tus descargas.</li><li>Si Windows muestra «Windows protegió su PC», elige <b>Más información → Ejecutar de todas formas</b>.</li><li>Sonora se instala sola y deja un acceso directo en el escritorio.</li></ol>',
  desktop: '<ol><li>En Chrome o Edge, haz clic en el ícono de <b>instalar</b> al final de la barra de direcciones.</li><li>O abre el menú <b>⋮</b> y elige <b>Instalar Sonora</b>.</li><li>En Safari para Mac: <b>Archivo → Agregar al Dock</b>.</li></ol>'
};

export function registerServiceWorker() {
  // Solo en HTTPS (Railway); en un servidor local http la app funciona igual, sin modo sin conexión
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

export function initInstall() {
  const buttons = [$('#installBtn'), $('#menuInstall')];
  const sheet = $('#installSheet');
  const show = on => buttons.forEach(b => { b.hidden = !on; });
  const ua = navigator.userAgent;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || /Electron/.test(ua);
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const windows = /Windows/.test(ua) && !android;
  let deferred = null;

  if (standalone) { $('#installNote').textContent = 'Estás usando Sonora como app instalada.'; return; }

  if (windows) buttons.forEach(b => { b.textContent = 'Descargar app'; });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; show(true); });
  window.addEventListener('appinstalled', () => { show(false); sheet.hidden = true; deferred = null; });
  show(true);

  buttons.forEach(btn => btn.addEventListener('click', async () => {
    $('#menu').hidden = true;
    document.body.style.overflow = '';
    if (windows) {
      const a = Object.assign(document.createElement('a'), { href: INSTALLER, download: 'Sonora-Setup.exe' });
      document.body.append(a); a.click(); a.remove();
      $('#installTitle').textContent = 'Descargando Sonora';
      $('#installSteps').innerHTML = STEPS.windows;
      sheet.hidden = false;
    } else if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      if (choice.outcome === 'accepted') show(false);
    } else {
      $('#installSteps').innerHTML = ios ? STEPS.ios : android ? STEPS.android : STEPS.desktop;
      sheet.hidden = false;
    }
  }));
  $('#installClose').addEventListener('click', () => { sheet.hidden = true; });
}
