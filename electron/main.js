// Ventana de escritorio (Windows) que carga la misma app web desde www/.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const esExterno = (url) => !url.startsWith('file://');

function crearVentana() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 360,
    minHeight: 500,
    title: 'Préstamos',
    icon: path.join(__dirname, '..', 'www', 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  // WhatsApp, teléfono y cualquier enlace externo se abren fuera de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (esExterno(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (esExterno(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

// Una sola ventana: dos ventanas a la vez podrían pisarse los datos.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(crearVentana);
  app.on('window-all-closed', () => app.quit());
}
