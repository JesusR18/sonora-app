// Almacenamiento persistente sin dependencias: un archivo JSON que se guarda de forma atómica.
// Por defecto vive en sonora-app/storage; DATA_DIR permite guardarlo en otra carpeta.
const fs = require('fs');
const path = require('path');

function open(dir) {
  const file = path.join(dir, 'sonora-db.json');
  const plays = {};
  const likes = new Map(); // albumId → Set de clientes que le dieron "me gusta"
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.assign(plays, raw.plays);
    for (const [id, list] of Object.entries(raw.likes || {})) likes.set(id, new Set(list));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('No se pudo leer la base de datos, se empieza vacía:', e.message);
  }

  const serialize = () => JSON.stringify({ plays, likes: Object.fromEntries([...likes].map(([id, s]) => [id, [...s]])) });

  // Los cambios se juntan y se escriben como mucho una vez por segundo (archivo temporal + rename)
  let timer = null, writing = false, again = false;
  function flush() {
    timer = null;
    if (writing) { again = true; return; }
    writing = true;
    const tmp = file + '.tmp';
    const done = err => {
      if (err) console.error('No se pudo guardar la base de datos:', err.message);
      writing = false;
      if (again) { again = false; save(); }
    };
    fs.mkdir(dir, { recursive: true }, () => fs.writeFile(tmp, serialize(), err => (err ? done(err) : fs.rename(tmp, file, done))));
  }
  const save = () => { if (!timer) timer = setTimeout(flush, 1000); };

  return {
    file,
    plays: id => plays[id] || 0,
    likes: id => likes.get(id)?.size || 0,
    addPlay(id) { plays[id] = (plays[id] || 0) + 1; save(); return plays[id]; },
    setLike(id, client, on) {
      let s = likes.get(id);
      if (on) { if (!s) likes.set(id, s = new Set()); s.add(client); }
      else if (s) { s.delete(client); if (!s.size) likes.delete(id); }
      save();
      return likes.get(id)?.size || 0;
    },
    likedBy: client => [...likes].filter(([, s]) => s.has(client)).map(([id]) => id),
    totals: () => ({
      plays: Object.values(plays).reduce((a, b) => a + b, 0),
      likes: [...likes.values()].reduce((n, s) => n + s.size, 0)
    }),
    /** Guarda de inmediato lo pendiente (al apagar el servidor). */
    flushSync() {
      if (!timer) return;
      clearTimeout(timer); timer = null;
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, serialize()); }
      catch (e) { console.error('No se pudo guardar la base de datos:', e.message); }
    }
  };
}

module.exports = { open };
