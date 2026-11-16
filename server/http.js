// Utilidades HTTP compartidas: respuestas JSON, compresión, lectura del cuerpo y límite de peticiones.
const zlib = require('zlib');

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN'
};

/** Envía `body`, comprimido con gzip si el cliente lo acepta y vale la pena. */
function send(req, res, status, headers, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const out = { ...SECURITY, ...headers };
  if (buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const gz = zlib.gzipSync(buf);
    out['Content-Encoding'] = 'gzip';
    out['Vary'] = 'Accept-Encoding';
    out['Content-Length'] = gz.length;
    res.writeHead(status, out);
    return res.end(req.method === 'HEAD' ? undefined : gz);
  }
  out['Content-Length'] = buf.length;
  res.writeHead(status, out);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function json(req, res, status, data, cache = 'no-store') {
  send(req, res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache }, JSON.stringify(data));
}

const fail = (req, res, status, message) => json(req, res, status, { error: message });

/** Lee un cuerpo JSON pequeño (máx. `limit` bytes). Regresa {} si viene vacío. */
function readJSON(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON no válido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';

/** Límite simple por IP: `max` peticiones por ventana de `windowMs`. */
function rateLimiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return req => {
    const key = clientIp(req), now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    return ++h.n <= max;
  };
}

module.exports = { SECURITY, send, json, fail, readJSON, rateLimiter };
