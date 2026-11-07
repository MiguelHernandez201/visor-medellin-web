// Service worker de Visor Medellín.
// - La "cáscara" de la app (HTML, JS, CSS, íconos) se guarda al instalar, así la app abre
//   rápido y sin conexión muestra al menos la interfaz.
// - Todo lo demás (fotos de las cámaras, radar, datos del SIATA, teselas del mapa) va siempre
//   a la red: son datos en vivo y no tiene sentido guardarlos.
// npm run build reemplaza __VERSION__ por una marca única: al publicar una versión nueva,
// el navegador ve el service worker cambiado, guarda la cáscara nueva y borra la vieja.
const VERSION = '__VERSION__';
const CACHE = `visor-medellin-${VERSION}`;
const CASCARA = [
  './',
  'index.html',
  'manifest.webmanifest',
  'build/main.js',
  'build/main.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon-48.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CASCARA))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c.startsWith('visor-medellin-') && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // datos en vivo: directo a la red

  // Cáscara: primero la red (para tener siempre la última versión) y, si no hay, la copia.
  evento.respondWith(
    fetch(request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
