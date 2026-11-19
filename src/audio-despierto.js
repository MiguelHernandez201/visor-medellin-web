// Chrome (sobre todo en Android) suspende los contextos de audio al minimizar la página o
// pasar a otra app, y al volver no los reanuda solo: todo lo que sonaba con ellos (avisos,
// voz, alarma, DJ, gol por voz…) se quedaba callado. Aquí se registran los contextos y se
// reanudan apenas la página vuelve a estar a la vista, o con el primer toque si el navegador
// no deja hacerlo antes.

const contextos = new Set();
let escuchando = false;

/** Reanuda `ctx` si quedó suspendido o interrumpido (no hace nada si está cerrado). */
export function despertar(ctx) {
  if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
  ctx.resume().catch(() => {});
}

function despertarTodos() {
  if (document.hidden) return;
  for (const ctx of contextos) {
    if (ctx.state === 'closed') contextos.delete(ctx);
    else despertar(ctx);
  }
}

/** Deja `ctx` vigilado: se reanuda solo al volver a la página. Devuelve el mismo `ctx`. */
export function mantenerDespierto(ctx) {
  contextos.add(ctx);
  if (!escuchando) {
    escuchando = true;
    document.addEventListener('visibilitychange', despertarTodos);
    addEventListener('pageshow', despertarTodos);
    addEventListener('focus', despertarTodos);
    // si el navegador pide un toque para volver a sonar, cualquiera sirve
    document.addEventListener('pointerdown', despertarTodos, true);
    document.addEventListener('keydown', despertarTodos, true);
  }
  return ctx;
}
