// Los navegadores suspenden el audio de la página al minimizarla o pasar a otra app, y al
// volver no siempre lo reanudan solos: todo lo que sonaba con él (avisos, voz, motor, alarma,
// DJ, gol por voz…) se quedaba callado.
//
// - Chrome: basta con reanudar el contexto al volver a la página.
// - iPhone / iPad (sobre todo con la app instalada): el contexto puede quedar «interrumpido» o
//   decir que suena sin sonar, y ya no se reanuda ni con un toque. Ahí la única salida es
//   cerrarlo y abrir uno nuevo: cada módulo da su `renovar()` para eso.
//
// Cada módulo registra su contexto con `vigilar(ctx, { renovar, activo })`. Al volver a la
// página se reanudan; si alguno no arranca (o es iPhone y estuvo un rato en segundo plano), se
// renueva, y con el primer toque se intenta de nuevo, que es cuando el navegador lo deja.

const vigilados = new Map(); // ctx → { renovar, activo }
let escuchando = false;
let ocultaDesde = 0;
const ES_IOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Reanuda `ctx` si quedó suspendido o interrumpido (no hace nada si está cerrado). */
export function despertar(ctx) {
  if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
  ctx.resume().catch(() => {});
}

function renovar(ctx) {
  const datos = vigilados.get(ctx);
  if (!datos) return;
  vigilados.delete(ctx);
  try {
    datos.renovar(); // el módulo cierra este contexto, abre otro y lo vuelve a vigilar
  } catch {
    // si falla, el módulo lo abre de nuevo la próxima vez que vaya a sonar
  }
}

/** Revisa un rato después si `ctx` de verdad arrancó (el reloj del audio avanza). */
function comprobar(ctx) {
  const antes = ctx.currentTime;
  setTimeout(() => {
    const datos = vigilados.get(ctx);
    if (!datos || document.hidden || !datos.activo()) return;
    const vivo = ctx.state === 'running' && ctx.currentTime > antes + 0.1;
    if (!vivo) renovar(ctx);
  }, 600);
}

function alVolver() {
  if (document.hidden) {
    if (!ocultaDesde) ocultaDesde = Date.now();
    return;
  }
  const estuvoFuera = ocultaDesde && Date.now() - ocultaDesde > 1500;
  ocultaDesde = 0;
  for (const [ctx, datos] of [...vigilados]) {
    if (ctx.state === 'closed') {
      vigilados.delete(ctx);
      continue;
    }
    if (!datos.activo()) continue;
    // iPhone: tras un rato en segundo plano el contexto suele quedar mudo aunque diga que suena
    if (ES_IOS && estuvoFuera) renovar(ctx);
    else {
      despertar(ctx);
      comprobar(ctx);
    }
  }
}

/** Con un toque el navegador deja sonar: se reanuda lo dormido y se renueva lo que no arranca. */
function alTocar() {
  for (const [ctx, datos] of [...vigilados]) {
    if (ctx.state === 'closed') {
      vigilados.delete(ctx);
      continue;
    }
    if (!datos.activo() || ctx.state === 'running') continue;
    if (ctx.state === 'interrupted') renovar(ctx);
    else {
      despertar(ctx);
      comprobar(ctx);
    }
  }
}

/**
 * Vigila `ctx`. `renovar()` cierra ese contexto y abre otro (que el módulo vuelve a vigilar);
 * `activo()` dice si ahora debería estar sonando (el motor apagado, por ejemplo, no).
 * Devuelve el mismo `ctx`.
 */
export function vigilar(ctx, { renovar: alRenovar, activo = () => true } = {}) {
  vigilados.set(ctx, { renovar: alRenovar || (() => {}), activo });
  if (!escuchando) {
    escuchando = true;
    document.addEventListener('visibilitychange', alVolver);
    addEventListener('pageshow', alVolver);
    addEventListener('focus', alVolver);
    // iPhone da permiso de sonar al levantar el dedo (touchend / click), no al apoyarlo
    for (const evento of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      document.addEventListener(evento, alTocar, { capture: true, passive: true });
    }
  }
  return ctx;
}
