/* Reproductor de avances: un solo elemento de audio para toda la página,
   el estado de giro del tocadiscos y el mini reproductor flotante. */
import { $, esc, fmt } from '../core/dom.js';
import { current } from '../core/store.js';
import { online, reportPlay } from '../core/api.js';

const audio = new Audio();
audio.preload = 'none';

let loadedId = null;     // id del álbum cuyo audio está cargado
let countedId = null;    // último álbum cuya reproducción ya se sumó en el servidor
let audioDirect = !online.ok; // sin servidor propio, el avance se pide directo a Apple
let everPlayed = false;  // el mini reproductor solo aparece después de la primera reproducción
let deckVisible = false;
let heroVisible = true;

const nowText = html => { $('#now').innerHTML = html; };

/** Gira el vinilo, baja el brazo y cambia el texto del botón. */
function setSpin(on) {
  document.body.classList.toggle('playing', on);
  $('#playBtn').textContent = on ? 'Detener' : 'Poner disco';
  updateMini();
}

export function play() {
  const a = current();
  if (loadedId !== a.id) { audio.src = audioDirect ? a.audio : `/audio/${encodeURIComponent(a.id)}`; loadedId = a.id; }
  everPlayed = true;
  setSpin(true);
  nowText(`Cargando <b>${esc(a.feat)}</b>…`);
  const p = audio.play();
  if (p && p.catch) p.catch(() => { setSpin(false); nowText('No se pudo reproducir. Toca “Poner disco” otra vez.'); });
}

export const stop = () => audio.pause();
export const toggle = () => (audio.paused ? play() : stop());

/** Suelta el audio actual (al cambiar de disco). */
export function unload() {
  stop();
  audio.removeAttribute('src');
  loadedId = null;
  countedId = null;
}

/** Deja la barra de progreso en cero y el texto listo para el disco actual. */
export function resetProgress() {
  $('#tCur').textContent = '0:00';
  $('#tDur').textContent = '0:30';
  $('#bar').style.width = '0%';
  $('#miniBar').style.width = '0%';
  nowText(`Listo para sonar: <b>${esc(current().feat)}</b>`);
}

/** El mini reproductor se ve si ya sonó algo y no están a la vista el tocadiscos ni la miniatura del inicio. */
export function updateMini() {
  $('#mini').classList.toggle('show', everPlayed && !deckVisible && !heroVisible);
}

export function initPlayer() {
  audio.addEventListener('playing', () => {
    setSpin(true);
    nowText(`Sonando: <b>${esc(current().feat)}</b>`);
    if (countedId !== loadedId) { countedId = loadedId; reportPlay(loadedId); }
  });
  // Si el servidor no pudo entregar el avance, se pide directo a Apple
  audio.addEventListener('error', () => {
    if (audioDirect || !loadedId || !audio.src.includes('/audio/')) return;
    audioDirect = true;
    audio.src = current().audio;
    play();
  });
  audio.addEventListener('pause', () => { setSpin(false); if (!audio.ended) nowText(`En pausa: <b>${esc(current().feat)}</b>`); });
  audio.addEventListener('ended', () => { setSpin(false); audio.currentTime = 0; nowText('Fin del avance. Escucha el disco completo en Spotify o Apple Music.'); });
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration || 30, pct = (audio.currentTime / d * 100) + '%';
    $('#tCur').textContent = fmt(audio.currentTime);
    $('#tDur').textContent = fmt(d);
    $('#bar').style.width = pct;
    $('#miniBar').style.width = pct;
  });
  new IntersectionObserver(([en]) => { deckVisible = en.isIntersecting; updateMini(); }, { threshold: .3 }).observe($('#tt'));
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; updateMini(); }, { threshold: .35 }).observe($('#heroThumb'));
}
