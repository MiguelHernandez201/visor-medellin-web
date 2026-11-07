// Traducción de teclas del control remoto LG (y equivalentes del teclado del PC).

const MAPA = new Map([
  [13, 'ok'],
  [37, 'izquierda'],
  [38, 'arriba'],
  [39, 'derecha'],
  [40, 'abajo'],
  [33, 'paginaAnterior'], // CH+ en el control; Re Pág en el PC
  [34, 'paginaSiguiente'], // CH- en el control; Av Pág en el PC
  [403, 'rojo'],
  [404, 'verde'],
  [405, 'amarillo'],
  [406, 'azul'],
  [415, 'play'],
  [19, 'pausa'],
  [413, 'stop'],
  // En el PC, las teclas R, G, Y y B simulan los botones de colores.
  [82, 'rojo'],
  [71, 'verde'],
  [89, 'amarillo'],
  [66, 'azul'],
]);

/**
 * Convierte un KeyboardEvent en { nombre, numero? } o null si no nos interesa.
 * El botón Atrás (461) no se traduce: webOS lo convierte en history.back().
 */
export function leerTecla(evento) {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return null;
  const { keyCode } = evento;
  if (keyCode >= 48 && keyCode <= 57) return { nombre: 'numero', numero: keyCode - 48 };
  if (keyCode >= 96 && keyCode <= 105) return { nombre: 'numero', numero: keyCode - 96 };
  const nombre = MAPA.get(keyCode);
  return nombre ? { nombre } : null;
}

/** Escape o Retroceso en el PC equivalen al botón Atrás del control. */
export const esAtrasDelPc = (evento) => evento.keyCode === 27 || evento.keyCode === 8;

let ultimaActivacion = 0;

/**
 * Con el puntero del Magic Remote visible, el botón OK puede generar a la vez
 * un keydown y un click. Esto deja pasar solo uno de los dos.
 */
export function activacionPermitida() {
  const ahora = performance.now();
  if (ahora - ultimaActivacion < 200) return false;
  ultimaActivacion = ahora;
  return true;
}
