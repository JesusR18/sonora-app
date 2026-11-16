// Deja el instalador en public/downloads para que el botón "Descargar app" lo entregue.
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, 'dist', 'Sonora-Setup.exe');
const dir = path.join(__dirname, '..', 'public', 'downloads');
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(from, path.join(dir, 'Sonora-Setup.exe'));
console.log(`Instalador listo: public/downloads/Sonora-Setup.exe (${(fs.statSync(from).size / 1048576).toFixed(1)} MB)`);
