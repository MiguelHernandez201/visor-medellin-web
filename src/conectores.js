// Dibujos de frente de cada tipo de conector de carga, para el globo de los cargadores.
// Trazos de 32x32 con currentColor: el contorno de la toma y sus pines.

const svg = (cuerpo) =>
  `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;
const pines = (lista) => lista.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');

// Tipo 2 (Mennekes): círculo con el lado de arriba recto, 2 pines de señal y 5 de potencia
const tipo2 = (cx, cy, r) => {
  const arriba = cy - r * 0.74;
  const ancho = Math.sqrt(r * r - (cy - arriba) ** 2);
  const e = r / 11; // escala de los pines
  return (
    `<path d="M${cx - ancho} ${arriba}H${cx + ancho}A${r} ${r} 0 1 1 ${cx - ancho} ${arriba}Z"/>` +
    pines([
      [cx - 3 * e, cy - 4.5 * e, 1.2 * e],
      [cx + 3 * e, cy - 4.5 * e, 1.2 * e],
      [cx - 5.5 * e, cy + 0.5 * e, 1.9 * e],
      [cx, cy + 0.5 * e, 1.9 * e],
      [cx + 5.5 * e, cy + 0.5 * e, 1.9 * e],
      [cx - 3 * e, cy + 6 * e, 1.9 * e],
      [cx + 3 * e, cy + 6 * e, 1.9 * e],
    ])
  );
};

// Tipo 1 (J1772): círculo con la pestaña del seguro arriba, 3 pines grandes y 2 pequeños
const tipo1 = (cx, cy, r) => {
  const e = r / 11;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}"/><path d="M${cx - 3 * e} ${cy - r}V${cy - r - 2.5 * e}H${cx + 3 * e}V${cy - r}"/>` +
    pines([
      [cx - 5 * e, cy - 3 * e, 2.5 * e],
      [cx + 5 * e, cy - 3 * e, 2.5 * e],
      [cx, cy + 5.5 * e, 2.5 * e],
      [cx - 5.5 * e, cy + 3.5 * e, 1.3 * e],
      [cx + 5.5 * e, cy + 3.5 * e, 1.3 * e],
    ])
  );
};

// Parte de corriente continua de los CCS: dos pines grandes debajo
const baseDc = `<rect x="7" y="21" width="18" height="9" rx="4.5"/>${pines([
  [12, 25.5, 2.3],
  [20, 25.5, 2.3],
])}`;

const DIBUJOS = {
  'Tipo 2': svg(tipo2(16, 16, 11)),
  'Tipo 1': svg(tipo1(16, 17, 10.5)),
  CCS2: svg(tipo2(16, 10.5, 8.5) + baseDc),
  CCS1: svg(tipo1(16, 11.5, 7.5) + baseDc),
  CHAdeMO: svg(
    '<circle cx="16" cy="16" r="11.5"/><path d="M4.5 13.5H2.5v5h2M27.5 13.5h2v5h-2"/>' +
      pines([
        [10.5, 16, 3.2],
        [21.5, 16, 3.2],
        [16, 9.5, 1.3],
        [16, 22.5, 1.3],
        [12.5, 21.5, 1.1],
        [19.5, 21.5, 1.1],
      ]),
  ),
  'GB/T': svg(
    '<circle cx="16" cy="16" r="11.5"/><path d="M13.5 4.6l2.5 2.6 2.5-2.6"/>' +
      pines([
        [11, 13.5, 2.3],
        [21, 13.5, 2.3],
        [16, 21.5, 2.3],
        [11, 20, 1.2],
        [21, 20, 1.2],
        [16, 11, 1.2],
      ]),
  ),
  'GB/T rápido': svg(
    '<circle cx="16" cy="16" r="11.5"/><path d="M13.5 4.6l2.5 2.6 2.5-2.6"/>' +
      pines([
        [10.5, 17, 3],
        [21.5, 17, 3],
        [16, 11, 1.2],
        [12.5, 11.5, 1.2],
        [19.5, 11.5, 1.2],
        [16, 23, 1.2],
        [12.5, 22.5, 1.2],
        [19.5, 22.5, 1.2],
      ]),
  ),
  Tesla: svg(
    '<path d="M16 4c6.5 0 11 4.6 11 10.5C27 22 21.6 28 16 28S5 22 5 14.5C5 8.6 9.5 4 16 4z"/>' +
      pines([
        [11.5, 13, 2.6],
        [20.5, 13, 2.6],
        [12, 20, 1.2],
        [16, 22, 1.2],
        [20, 20, 1.2],
      ]),
  ),
  'Enchufe común': svg(
    '<rect x="5" y="5" width="22" height="22" rx="6"/><circle cx="16" cy="16" r="8"/>' + pines([[12.5, 16, 1.7], [19.5, 16, 1.7]]) + '<path d="M16 8v2.5M16 21.5V24"/>',
  ),
};
DIBUJOS.NACS = DIBUJOS.Tesla;

/** Dibujo del conector `tipo` (como lo nombra el relevo: «CCS2», «Tipo 2»…). */
export const dibujoConector = (tipo) => DIBUJOS[tipo] || DIBUJOS['Tipo 2'];

/** Nombre largo del conector, como suele aparecer en los carros y los cargadores. */
export const NOMBRES_CONECTOR = {
  'Tipo 1': 'Tipo 1 (J1772)',
  'Tipo 2': 'Tipo 2 (Mennekes)',
  CCS1: 'CCS (Tipo 1)',
  CCS2: 'CCS (Tipo 2)',
  CHAdeMO: 'CHAdeMO',
  'GB/T': 'GB/T',
  'GB/T rápido': 'GB/T rápido',
  Tesla: 'Tesla',
  NACS: 'NACS (Tesla)',
  'Enchufe común': 'Enchufe común',
};
