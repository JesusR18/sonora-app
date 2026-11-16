// Lee el archivo .env (sin dependencias) y lo pasa a process.env.
// Las variables que ya existen en el sistema tienen prioridad sobre el archivo.
const fs = require('fs');
const path = require('path');

function loadEnv(dir) {
  let text;
  try { text = fs.readFileSync(path.join(dir, '.env'), 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

module.exports = { loadEnv };
