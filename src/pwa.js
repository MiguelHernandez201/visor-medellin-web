// Partes propias de la PWA: el service worker (para abrir rápido e instalarse) y el botón
// "Instalar" que aparece cuando el navegador ofrece instalar la app (Chrome, Edge, Android).

/**
 * Registra sw.js, salvo en localhost (npm run dev), donde la caché solo estorba.
 *
 * Instalada en el iPhone, la app casi nunca se vuelve a cargar: al abrirla, iOS la despierta
 * tal como quedó. Por eso se busca una versión nueva cada vez que vuelve a verse (y cada 30
 * minutos), y cuando el service worker nuevo toma el control:
 * - si la app acaba de abrir (menos de 15 s), se recarga sola: aún no se está usando;
 * - si no, aparece un aviso «Hay una versión nueva» con el botón «Actualizar», para no
 *   cortar una ruta o el sonido del motor a mitad de camino.
 */
export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return;
  const sw = navigator.serviceWorker;
  const abierta = Date.now();
  // sin controlador es la primera instalación: la página ya es la versión más nueva
  const habiaVersion = Boolean(sw.controller);
  let recargando = false;
  const recargar = () => {
    if (recargando) return;
    recargando = true;
    location.reload();
  };
  sw.addEventListener('controllerchange', () => {
    if (!habiaVersion) return;
    if (Date.now() - abierta < 15000) recargar();
    else avisarVersionNueva(recargar);
  });
  addEventListener('load', () => {
    sw.register('sw.js', { updateViaCache: 'none' })
      .then((registro) => {
        const buscar = () => registro.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) buscar();
        });
        setInterval(buscar, 30 * 60 * 1000);
      })
      .catch(() => {
        // sin service worker la app funciona igual, solo no se puede instalar
      });
  });
}

/** Aviso abajo con «Actualizar»; `recargar()` se llama al tocarlo. */
function avisarVersionNueva(recargar) {
  if (document.querySelector('.aviso-version')) return;
  const aviso = document.createElement('div');
  aviso.className = 'aviso-version';
  aviso.setAttribute('role', 'status');
  aviso.innerHTML = '<span>Hay una versión nueva de la app</span><button class="boton boton-principal" type="button">Actualizar</button><button class="boton aviso-version-cerrar" type="button" aria-label="Ahora no">✕</button>';
  aviso.querySelector('.boton-principal').addEventListener('click', recargar);
  aviso.querySelector('.aviso-version-cerrar').addEventListener('click', () => aviso.remove());
  document.body.append(aviso);
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
