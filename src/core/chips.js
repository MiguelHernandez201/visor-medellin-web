// Chips de la leyenda del control remoto (botones de colores, flechas, OK…).

const ETIQUETAS = {
  ok: 'OK',
  flechas: '← →',
  arriba: '↑',
  numeros: '1–4',
  vertical: '↑ ↓',
  cruz: '← → ↑ ↓',
  canal: 'CH ±',
  atras: 'Atrás',
};

const COLORES = ['rojo', 'verde', 'amarillo', 'azul'];

export function chip(tecla) {
  if (tecla === 'colores') {
    return COLORES.map((color) => `<span class="chip chip-${color}"></span>`).join('');
  }
  return `<span class="chip chip-${tecla}">${ETIQUETAS[tecla] ?? ''}</span>`;
}
