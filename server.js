// Servidor de Sonora (sin dependencias): página, API, portadas, avances de audio e instalador.
// Variables (en .env o en el sistema): PORT, DATA_DIR, SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY y NEWS_REFRESH_MINUTES. Ver .env.example.
const http = require('http');
const fs = require('fs');
const path = require('path');
require('./server/env').loadEnv(__dirname);
const { SECURITY, send } = require('./server/http');
const { load } = require('./server/catalog');
const { open } = require('./server/db');
const { createApi } = require('./server/api');
const { ART_PATH, serveArt, warmArt, artStats } = require('./server/art');
const { AUDIO_PATH, serveAudio } = require('./server/audio');
const { createSupabase } = require('./server/supabase');
const { createNews } = require('./server/news');

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'storage');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};
const COMPRESSIBLE = ['.html', '.js', '.css', '.json', '.webmanifest', '.svg'];

const catalog = load(ROOT);
const db = open(DATA_DIR);
const supabase = createSupabase({ url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
const news = createNews({ artists: catalog.artists, supabase, minutes: +process.env.NEWS_REFRESH_MINUTES || 15 });
const api = createApi({ catalog, db, news, supabase, started: Date.now(), extra: () => ({ art: artStats() }) });

function serveInstaller(res) {
  const file = path.join(ROOT, 'downloads', 'Sonora-Setup.exe');
  fs.stat(file, (err, st) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('El instalador todavía no está disponible.'); }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': st.size,
      'Content-Disposition': 'attachment; filename="Sonora-Setup.exe"',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Prohibido'); }

  fs.readFile(file, (err, data) => {
    if (err) {
      // Archivos que no existen (con extensión) dan 404; cualquier otra ruta regresa la app
      if (path.extname(pathname)) { res.writeHead(404, { ...SECURITY, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
      return fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(500); return res.end('Error del servidor'); }
        send(req, res, 200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' }, html);
      });
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
    // Página, estilos, módulos, datos, sw y manifest siempre frescos; íconos con caché larga
    headers['Cache-Control'] = ['.html', '.css', '.js', '.json', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=604800';
    if (pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/';
    if (COMPRESSIBLE.includes(ext)) return send(req, res, 200, headers, data);
    res.writeHead(200, { ...SECURITY, ...headers, 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer(async (req, res) => {
  let url, pathname;
  try { url = new URL(req.url, 'http://x'); pathname = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); return res.end('Solicitud no válida'); }

  if (await api(req, res, pathname, url)) return;

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }

  const art = pathname.match(ART_PATH);
  if (art) return serveArt(art[1], res);

  const audio = pathname.match(AUDIO_PATH);
  if (audio) return serveAudio(req, res, catalog.byId.get(audio[1]));

  if (pathname.endsWith('/')) pathname += 'index.html';

  // Instalador de Windows: se envía por partes (pesa decenas de MB) y el navegador lo guarda como archivo
  if (pathname === '/downloads/Sonora-Setup.exe') return serveInstaller(res);

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Sonora escuchando en el puerto ${PORT} · datos en ${db.file}`);
  console.log(supabase.enabled ? 'Supabase conectado' : 'Supabase sin configurar (crea .env a partir de .env.example)');
  warmArt(catalog.albums);
  news.start();
});

// Al apagar, guarda lo pendiente antes de salir
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { db.flushSync(); process.exit(0); });
process.on('exit', () => db.flushSync());
