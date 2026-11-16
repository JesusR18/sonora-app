// Avances de 30 s: /audio/<id del álbum>. Igual que las portadas, el servidor los pide a Apple y los
// reenvía desde el mismo dominio. Solo sirve los avances del catálogo (no es un proxy abierto) y
// respeta Range para que el navegador pueda adelantar y Safari reproduzca.
const { Readable } = require('stream');

const AUDIO_PATH = /^\/audio\/([\w-]+)$/;
const PASS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

async function serveAudio(req, res, album) {
  if (!album || !/^https:\/\/audio-ssl\.itunes\.apple\.com\//.test(album.previewUrl || '')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Avance no encontrado');
  }
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15000); // solo para que Apple responda
  res.on('close', () => ctrl.abort());
  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const up = await fetch(album.previewUrl, { headers, signal: ctrl.signal });
    clearTimeout(timeout);
    if (!up.ok && up.status !== 206) throw new Error(`Apple respondió ${up.status}`);
    const out = { 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
    for (const h of PASS) { const v = up.headers.get(h); if (v) out[h] = v; }
    // Apple los manda como audio/x-m4p o x-m4a; audio/mp4 lo entienden todos los navegadores
    if (!out['content-type'] || /m4[ap]|octet/.test(out['content-type'])) out['content-type'] = 'audio/mp4';
    res.writeHead(up.status, out);
    if (req.method === 'HEAD' || !up.body) return res.end();
    Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) {
    clearTimeout(timeout);
    if (res.headersSent) return res.destroy();
    if (ctrl.signal.aborted && res.destroyed) return;
    console.warn(`Avance ${album.id} no disponible:`, e.name === 'AbortError' ? 'Apple tardó demasiado' : e.message);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Avance no disponible');
  }
}

module.exports = { AUDIO_PATH, serveAudio };
