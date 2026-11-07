// Lienzos de las capas de lluvia del mapa:
// - recortarRadar: la zona del valle de una imagen del radar, sin los anillos de distancia;
// - pintarCalor: mapa de calor con lo que miden los pluviómetros en los últimos 15 min.
// Los dos cubren el mismo rectángulo (RECORTE), que mapa.js pone sobre el mapa.
import { LIMITES_RADAR } from './lluvia.js';

/** Zona del valle y alrededores que cubren el radar recortado y el mapa de calor. */
export const RECORTE = { norte: 6.55, sur: 5.95, este: -75.25, oeste: -75.85 };

const CALOR_LADO = 330; // ≈ 200 m por píxel
const CALOR_SIGMA_KM = 0.8; // la lluvia de un pluviómetro se desvanece en ~2,5 km
// Colores del mapa de calor según los mm en 15 min: [mm, r, g, b, opacidad].
const ESCALA_CALOR = [
  [0.05, 127, 178, 255, 0],
  [0.25, 127, 178, 255, 0.35],
  [0.5, 61, 220, 132, 0.45],
  [1.5, 255, 210, 63, 0.55],
  [4, 255, 77, 94, 0.62],
  [8, 214, 92, 255, 0.7],
];

/** Posición (px) dentro de un lienzo de `ancho`x`alto` px que cubre el RECORTE. */
function enRecorte(latitud, longitud, ancho, alto) {
  return {
    x: ((longitud - RECORTE.oeste) / (RECORTE.este - RECORTE.oeste)) * ancho,
    y: ((RECORTE.norte - latitud) / (RECORTE.norte - RECORTE.sur)) * alto,
  };
}

/** Color [r, g, b, a(0-255)] del mapa de calor para un valor en mm. */
function colorCalor(mm) {
  if (mm <= ESCALA_CALOR[0][0]) return null;
  let i = 1;
  while (i < ESCALA_CALOR.length - 1 && mm > ESCALA_CALOR[i][0]) i++;
  const [m0, r0, g0, b0, a0] = ESCALA_CALOR[i - 1];
  const [m1, r1, g1, b1, a1] = ESCALA_CALOR[i];
  const t = Math.max(0, Math.min(1, (mm - m0) / (m1 - m0)));
  const mezcla = (u, v) => Math.round(u + (v - u) * t);
  return [mezcla(r0, r1), mezcla(g0, g1), mezcla(b0, b1), Math.round((a0 + (a1 - a0) * t) * 255)];
}

/**
 * Lienzo con el mapa de calor de la lluvia: cada pluviómetro que mide lluvia aporta sus mm,
 * que se desvanecen con la distancia (campana de Gauss); en cada píxel manda el que más aporta.
 */
export function pintarCalor(pluviometros) {
  const lienzo = document.createElement('canvas');
  lienzo.width = CALOR_LADO;
  lienzo.height = CALOR_LADO;
  const valores = new Float32Array(CALOR_LADO * CALOR_LADO);
  const kmPorPxX = ((RECORTE.este - RECORTE.oeste) * 111.2 * Math.cos((6.25 * Math.PI) / 180)) / CALOR_LADO;
  const kmPorPxY = ((RECORTE.norte - RECORTE.sur) * 111.2) / CALOR_LADO;
  const alcanceX = Math.ceil((3 * CALOR_SIGMA_KM) / kmPorPxX);
  const alcanceY = Math.ceil((3 * CALOR_SIGMA_KM) / kmPorPxY);
  const dosSigma2 = 2 * CALOR_SIGMA_KM * CALOR_SIGMA_KM;
  for (const p of pluviometros) {
    if (!p.nivel) continue;
    const c = enRecorte(p.latitud, p.longitud, CALOR_LADO, CALOR_LADO);
    const cx = Math.round(c.x);
    const cy = Math.round(c.y);
    for (let y = Math.max(0, cy - alcanceY); y <= Math.min(CALOR_LADO - 1, cy + alcanceY); y++) {
      const dy = (y - c.y) * kmPorPxY;
      for (let x = Math.max(0, cx - alcanceX); x <= Math.min(CALOR_LADO - 1, cx + alcanceX); x++) {
        const dx = (x - c.x) * kmPorPxX;
        const v = p.mm * Math.exp(-(dx * dx + dy * dy) / dosSigma2);
        const i = y * CALOR_LADO + x;
        if (v > valores[i]) valores[i] = v;
      }
    }
  }
  const contexto = lienzo.getContext('2d');
  const imagen = contexto.createImageData(CALOR_LADO, CALOR_LADO);
  for (let i = 0; i < valores.length; i++) {
    const color = colorCalor(valores[i]);
    if (color) imagen.data.set(color, i * 4);
  }
  contexto.putImageData(imagen, 0, 0);
  return lienzo;
}

const recortes = new WeakMap(); // imagen del radar → su recorte

/**
 * Recorta el valle de una imagen del radar y borra los anillos de distancia (grises/negros).
 * Si la imagen no deja leer sus píxeles (cuadros de la animación, sin CORS), se recorta sin limpiar.
 */
export function recortarRadar(lienzo) {
  const guardado = recortes.get(lienzo);
  if (guardado) return guardado;
  const ancho = LIMITES_RADAR.este - LIMITES_RADAR.oeste;
  const alto = LIMITES_RADAR.norte - LIMITES_RADAR.sur;
  const sx = ((RECORTE.oeste - LIMITES_RADAR.oeste) / ancho) * lienzo.width;
  const sy = ((LIMITES_RADAR.norte - RECORTE.norte) / alto) * lienzo.height;
  const sw = ((RECORTE.este - RECORTE.oeste) / ancho) * lienzo.width;
  const sh = ((RECORTE.norte - RECORTE.sur) / alto) * lienzo.height;
  const recorte = document.createElement('canvas');
  recorte.width = Math.round(sw);
  recorte.height = Math.round(sh);
  const contexto = recorte.getContext('2d');
  contexto.drawImage(lienzo, sx, sy, sw, sh, 0, 0, recorte.width, recorte.height);
  try {
    const datos = contexto.getImageData(0, 0, recorte.width, recorte.height);
    const p = datos.data;
    for (let i = 0; i < p.length; i += 4) {
      if (Math.max(p[i], p[i + 1], p[i + 2]) - Math.min(p[i], p[i + 1], p[i + 2]) < 40) p[i + 3] = 0;
    }
    contexto.putImageData(datos, 0, 0);
  } catch {
    // imagen sin CORS: se muestra con los anillos de distancia
  }
  recortes.set(lienzo, recorte);
  return recorte;
}
