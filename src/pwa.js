// Partes propias de la PWA: el service worker (para abrir rápido e instalarse) y el botón
// "Instalar" que aparece cuando el navegador ofrece instalar la app (Chrome, Edge, Android).

/** Registra sw.js, salvo en localhost (npm run dev), donde la caché solo estorba. */
export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return;
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // sin service worker la app funciona igual, solo no se puede instalar
    });
  });
}

/** Muestra `boton` cuando se puede instalar la app y la instala al tocarlo. */
export function prepararInstalacion(boton) {
  let aviso = null;
  addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    aviso = evento;
    boton.hidden = false;
  });
  addEventListener('appinstalled', () => {
    aviso = null;
    boton.hidden = true;
  });
  boton.addEventListener('click', async (evento) => {
    evento.stopPropagation();
    if (!aviso) return;
    aviso.prompt();
    await aviso.userChoice.catch(() => null);
    aviso = null;
    boton.hidden = true;
  });
}
