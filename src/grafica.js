// Gráfica del nivel de un río en las últimas 3 horas (pantalla completa de las cámaras de
// río), con las franjas de riesgo del SIATA de fondo: N1 verde, N2 amarillo, N3 naranja, N4 rojo.

const COLORES_FRANJA = ['rgba(61, 220, 132, 0.16)', 'rgba(255, 210, 63, 0.2)', 'rgba(255, 159, 67, 0.22)', 'rgba(255, 77, 94, 0.24)'];
const COLORES_LIMITE = ['#3ddc84', '#ffd23f', '#ff9f43', '#ff4d5e'];
const metros = (m) => `${m.toFixed(2).replace('.', ',')} m`;

/**
 * Dibuja en `lienzo` la serie { horas, metros, limites } (limites = topes de N1, N2, N3 y el de
 * N4, en m). `actual` = datos de la estación (riesgo) para el color de la línea, o null.
 */
export function dibujarGraficaNivel(lienzo, serie, actual) {
  const ctx = lienzo.getContext('2d');
  const W = lienzo.width;
  const H = lienzo.height;
  const izq = 20;
  const der = 120; // espacio para las etiquetas de los umbrales
  const arriba = 56;
  const abajo = 40;
  ctx.clearRect(0, 0, W, H);

  const valores = serie.metros.filter((v) => Number.isFinite(v));
  if (!valores.length) return;
  const [n1, n2, n3] = serie.limites;
  const maximo = Math.max(...valores);
  const minimo = Math.min(...valores);
  // Se ve hasta el primer umbral por encima del dato más alto, para saber qué tan cerca está.
  const umbralArriba = [n1, n2, n3].find((l) => Number.isFinite(l) && l > maximo);
  const yMax = Math.max(maximo + 0.05, umbralArriba ? umbralArriba * 1.08 : maximo * 1.15);
  const yMin = Math.min(0, minimo);
  const y = (v) => arriba + (1 - (v - yMin) / (yMax - yMin)) * (H - arriba - abajo);
  const x = (i) => izq + (i / Math.max(1, serie.metros.length - 1)) * (W - izq - der);

  // Fondo y franjas de riesgo
  ctx.fillStyle = 'rgba(5, 7, 13, 0.82)';
  ctx.fillRect(0, 0, W, H);
  const topes = [yMin, n1, n2, n3, Infinity];
  for (let i = 0; i < 4; i++) {
    const desde = Math.max(yMin, topes[i]);
    const hasta = Math.min(yMax, topes[i + 1]);
    if (!(hasta > desde)) continue;
    ctx.fillStyle = COLORES_FRANJA[i];
    ctx.fillRect(izq, y(hasta), W - izq - der, y(desde) - y(hasta));
  }
  // Líneas y etiquetas de los umbrales visibles (donde empieza N2, N3 y N4)
  ctx.font = '20px "LG Smart UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  [n1, n2, n3].forEach((limite, i) => {
    if (!Number.isFinite(limite) || limite > yMax) return;
    ctx.strokeStyle = COLORES_LIMITE[i + 1];
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(izq, y(limite));
    ctx.lineTo(W - der, y(limite));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORES_LIMITE[i + 1];
    ctx.fillText(`N${i + 2} ${metros(limite)}`, W - der + 8, y(limite));
  });

  // Serie
  const riesgo = actual ? actual.riesgo : 0;
  ctx.strokeStyle = riesgo >= 2 ? COLORES_LIMITE[riesgo - 1] : '#eef6ff';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  serie.metros.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    if (i === 0) ctx.moveTo(x(i), y(v));
    else ctx.lineTo(x(i), y(v));
  });
  ctx.stroke();
  const ultimo = serie.metros.length - 1;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(x(ultimo), y(serie.metros[ultimo]), 7, 0, 2 * Math.PI);
  ctx.fill();

  // Títulos y horas
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#eef6ff';
  ctx.font = '600 26px "LG Smart UI", system-ui, sans-serif';
  ctx.fillText('Nivel del agua · últimas 3 h', izq, 36);
  ctx.textAlign = 'right';
  ctx.fillText(metros(serie.metros[ultimo]), W - 12, 36);
  ctx.font = '20px "LG Smart UI", system-ui, sans-serif';
  ctx.fillStyle = '#8ea3b8';
  const mitad = Math.floor(ultimo / 2);
  ctx.textAlign = 'left';
  ctx.fillText(serie.horas[0] || '', izq, H - 12);
  ctx.textAlign = 'center';
  ctx.fillText(serie.horas[mitad] || '', x(mitad), H - 12);
  ctx.textAlign = 'right';
  ctx.fillText(serie.horas[ultimo] || '', x(ultimo), H - 12);
  ctx.textAlign = 'left';
}
