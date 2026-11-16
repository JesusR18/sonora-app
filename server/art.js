// Portadas: /art/<ruta del catálogo de Apple>. El servidor las pide a Apple y las
// entrega desde el mismo dominio, así cargan aunque el celular no llegue a mzstatic.
const ART_PATH = /^\/art\/([\w\-./%]+\/\d{2,4}x\d{2,4}bb\.jpg)$/;
const ART_HOSTS = ['is1-ssl', 'is2-ssl', 'is3-ssl', 'is4-ssl', 'is5-ssl'];
const ART_MAX_BYTES = 80 * 1024 * 1024;
const artCache = new Map();
let artBytes = 0;
const artPending = new Map();

function remember(key, buf) {
  artCache.set(key, buf); artBytes += buf.length;
  for (const [k, v] of artCache) {
    if (artBytes <= ART_MAX_BYTES) break;
    artCache.delete(k); artBytes -= v.length;
  }
}

// Pocas descargas simultáneas a Apple para no saturar la conexión del servidor.
// Las portadas que pide una persona van primero; la precarga usa solo unos cuantos lugares.
const MAX_UPSTREAM = 16;
const MAX_BACKGROUND = 2;
let active = 0, activeBg = 0;
const urgent = [], background = [];

function pump() {
  while (active < MAX_UPSTREAM) {
    let job = urgent.shift();
    if (!job && activeBg < MAX_BACKGROUND) job = background.shift();
    if (!job) break;
    active++;
    if (job.bg) activeBg++;
    job.run();
  }
}
const slot = (rest, bg) => new Promise(resolve => {
  const job = { rest, bg };
  job.run = () => resolve(job);
  (bg ? background : urgent).push(job);
  pump();
});
const release = job => { active--; if (job.bg) activeBg--; pump(); };
// Si alguien pide una portada que la precarga tiene en espera, se adelanta
function promote(rest) {
  const i = background.findIndex(j => j.rest === rest);
  if (i < 0) return;
  const [job] = background.splice(i, 1);
  job.bg = false;
  urgent.push(job);
  pump();
}

async function fetchArt(rest, bg) {
  const job = await slot(rest, bg);
  try {
    for (const host of ART_HOSTS) {
      try {
        const r = await fetch(`https://${host}.mzstatic.com/image/thumb/${rest}`, { signal: AbortSignal.timeout(6000) });
        if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) return Buffer.from(await r.arrayBuffer());
      } catch {}
    }
    return null;
  } finally { release(job); }
}

function getArt(rest, bg = false) {
  const hit = artCache.get(rest);
  if (hit) { artCache.delete(rest); artCache.set(rest, hit); return Promise.resolve(hit); }
  if (artPending.has(rest)) { if (!bg) promote(rest); return artPending.get(rest); }
  artPending.set(rest, fetchArt(rest, bg).then(buf => { if (buf) remember(rest, buf); return buf; }).finally(() => artPending.delete(rest)));
  return artPending.get(rest);
}

/** Al arrancar, precarga las portadas del catálogo (tamaños más usados) para que la primera visita no espere a Apple. */
function warmArt(albums) {
  const paths = [...new Set(albums.map(a => (a.coverUrl.match(/\/image\/thumb\/(.+?)\/\d+x\d+bb\.jpg$/) || [])[1]).filter(Boolean))];
  const jobs = paths.flatMap(p => [300, 600, 100].map(n => `${p}/${n}x${n}bb.jpg`));
  let done = 0;
  Promise.all(jobs.map(j => getArt(j, true).then(b => { if (b) done++; }))).then(() => console.log(`Portadas precargadas: ${done}/${jobs.length}`));
}

async function serveArt(rest, res) {
  if (rest.includes('..')) { res.writeHead(400); return res.end(); }
  const buf = await getArt(rest);
  if (!buf) { res.writeHead(502, { 'Cache-Control': 'no-store' }); return res.end('Portada no disponible'); }
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.end(buf);
}

const artStats = () => ({ cached: artCache.size, megabytes: +(artBytes / 1048576).toFixed(1), pending: artPending.size });

module.exports = { ART_PATH, serveArt, warmArt, artStats };
