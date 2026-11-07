// La app se diseña a 1920x1080 (resolución de apps webOS). En el TV la escala
// es 1; en el PC se escala para caber en la ventana del navegador.

export const ANCHO = 1920;
export const ALTO = 1080;

let escenario = null;
let escala = 1;

export function montarEscenario(elemento) {
  escenario = elemento;
  const ajustar = () => {
    escala = Math.min(innerWidth / ANCHO, innerHeight / ALTO);
    elemento.style.transform = `scale(${escala})`;
    elemento.style.left = `${(innerWidth - ANCHO * escala) / 2}px`;
    elemento.style.top = `${(innerHeight - ALTO * escala) / 2}px`;
  };
  addEventListener('resize', ajustar);
  ajustar();
}

/** Convierte la posición de un evento del puntero a coordenadas del escenario. */
export function puntoEnEscenario({ clientX, clientY }) {
  const caja = escenario.getBoundingClientRect();
  return { x: (clientX - caja.left) / escala, y: (clientY - caja.top) / escala };
}
