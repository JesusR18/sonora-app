// Copia el servidor y la página dentro de desktop/app para empaquetarlos (sin la carpeta de descargas).
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'app');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(SRC, 'server.js'), path.join(OUT, 'server.js'));
fs.cpSync(path.join(SRC, 'server'), path.join(OUT, 'server'), { recursive: true });
fs.cpSync(path.join(SRC, 'public'), path.join(OUT, 'public'), {
  recursive: true,
  filter: src => !src.startsWith(path.join(SRC, 'public', 'downloads'))
});
console.log('Página copiada en desktop/app');
