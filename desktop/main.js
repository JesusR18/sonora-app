// Sonora para Windows: arranca el mismo servidor de la web en un puerto local y lo abre en una ventana propia.
const { app, BrowserWindow, shell } = require('electron');
const net = require('net');
const path = require('path');

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function start() {
  const port = await freePort();
  process.env.PORT = port;
  // Favoritos y reproducciones se guardan en la carpeta del usuario (la de la app es de solo lectura)
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'data');
  require(path.join(__dirname, 'app', 'server.js'));

  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 600,
    backgroundColor: '#100904', title: 'Sonora', autoHideMenuBar: true,
    icon: path.join(__dirname, 'app', 'public', 'icons', 'icon-512.png'),
    webPreferences: { contextIsolation: true }
  });

  // Spotify, Apple Music y demás enlaces externos se abren en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  const url = `http://127.0.0.1:${port}/`;
  // Si el servidor todavía no escucha, reintenta
  win.webContents.on('did-fail-load', () => setTimeout(() => win.loadURL(url), 300));
  win.loadURL(url);
}

app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
