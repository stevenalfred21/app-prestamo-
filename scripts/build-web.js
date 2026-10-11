// Copia los archivos de la app web a www/, que es lo que empaquetan Android (Capacitor) y Windows (Electron).
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const destino = path.join(raiz, 'www');
const archivos = ['index.html', 'styles.css', 'calc.js', 'app.js', 'manifest.webmanifest', 'sw.js', 'icons'];

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino);
for (const a of archivos) fs.cpSync(path.join(raiz, a), path.join(destino, a), { recursive: true });
console.log('www/ listo');
