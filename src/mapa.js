// Mapa del Valle de Aburrá con todas las cámaras como puntos y la lluvia encima.
// Fondo: teselas "World Dark Gray" de Esri (base y, encima de la lluvia, los nombres), en
// proyección Web Mercator. No necesitan clave; piden atribución.
// El mapa se centra en la cámara elegida; CH ± cambian el zoom.
//
// Capas de lluvia (las elige main.js):
// - radar: una imagen del radar del SIATA (la última o un cuadro de la animación);
// - calor: mapa de calor hecho con lo que miden los pluviómetros en los últimos 15 min;
// - gotas: un ícono en cada pluviómetro donde está lloviendo, con los mm.
import { LIMITES_RADAR } from './lluvia.js';

const TESELA = 256;
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas';
const URL_BASE = (z, x, y) => `${ESRI}/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
const URL_NOMBRES = (z, x, y) => `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/${z}/${y}/${x}`;
export const ZOOM_MIN = 11;
export const ZOOM_MAX = 15;
const SEPARACION = 16; // px entre puntos que comparten coordenadas (p. ej. las 5 de la Torre SIATA)
// Recorte del radar (y zona del mapa de calor) que se dibuja sobre el mapa: el valle y alrededores.
const RECORTE = { norte: 6.55, sur: 5.95, este: -75.25, oeste: -75.85 };
// Mapa de calor: resolución de la grilla (px) y alcance de cada pluviómetro.
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

/** Coordenadas de mundo (px) en Web Mercator para un zoom. */
function proyectar(latitud, longitud, zoom) {
  const escala = TESELA * 2 ** zoom;
  const seno = Math.sin((latitud * Math.PI) / 180);
  return {
    x: ((longitud + 180) / 360) * escala,
    y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * escala,
  };
}

/** Posición (px) dentro de un recorte de `ancho`x`alto` px de un punto geográfico. */
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
 * Pinta en `lienzo` el mapa de calor de la lluvia: cada pluviómetro que mide lluvia aporta
 * sus mm, que se desvanecen con la distancia (campana de Gauss); en cada píxel manda el
 * pluviómetro que más aporta.
 */
function pintarCalor(lienzo, pluviometros) {
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
  const datos = imagen.data;
  for (let i = 0; i < valores.length; i++) {
    const color = colorCalor(valores[i]);
    if (color) datos.set(color, i * 4);
  }
  contexto.putImageData(imagen, 0, 0);
}

/** Recorta el valle de una imagen del radar y borra los anillos de distancia (grises/negros). */
function recortarRadar(lienzo) {
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
    // imagen sin CORS (cuadros de la animación): se muestra con los anillos de distancia
  }
  return recorte;
}

/**
 * Crea el mapa dentro de `contenedor` (que debe tener tamaño fijo).
 * Devuelve { pintar, pintarLluvia, vecino }:
 * - pintar(puntos, elegido, zoom, lluvia): puntos = [{ id, latitud, longitud, clase, titulo }]
 * - pintarLluvia(lluvia): solo las capas de lluvia (para animar el radar sin repintar todo).
 *   lluvia = { radar: { lienzo } | null, calor: [pluviómetros] | null, gotas: [pluviómetros] | null,
 *              titulo: texto de la leyenda }; pluviómetro = { codigo, latitud, longitud, mm, nivel }
 * - vecino(id, direccion): id del punto más cercano en esa dirección ('arriba'…), o null.
 */
export function crearMapa(contenedor) {
  contenedor.innerHTML = `
    <div class="mapa-mundo">
      <div class="mapa-teselas"></div>
      <canvas class="mapa-radar"></canvas>
      <canvas class="mapa-calor"></canvas>
      <div class="mapa-teselas mapa-nombres"></div>
      <div class="mapa-gotas"></div>
      <div class="mapa-puntos"></div>
    </div>
    <div class="mapa-leyenda">
      <span class="mapa-leyenda-titulo"></span>
      <span class="mapa-escala"><span class="escala escala-1">Llovizna</span><span class="escala escala-2">Ligera</span><span class="escala escala-3">Moderada</span><span class="escala escala-4">Fuerte</span></span>
    </div>
    <span class="mapa-creditos">Esri, HERE, Garmin, © OpenStreetMap · radar y pluviómetros SIATA</span>`;
  const mundo = contenedor.querySelector('.mapa-mundo');
  const [capaTeselas, capaNombres] = contenedor.querySelectorAll('.mapa-teselas');
  const lienzoRadar = contenedor.querySelector('.mapa-radar');
  const lienzoCalor = contenedor.querySelector('.mapa-calor');
  const capaGotas = contenedor.querySelector('.mapa-gotas');
  const capaPuntos = contenedor.querySelector('.mapa-puntos');
  const leyendaTitulo = contenedor.querySelector('.mapa-leyenda-titulo');

  const teselas = new Map(); // "z/x/y" ya puestas
  let zoomPintado = null;
  let posiciones = new Map(); // id → { x, y } en px de mundo
  let elementos = new Map(); // id → elemento del punto
  let firmaPuntos = '';
  let zoomActual = 13;
  const recortes = new WeakMap(); // imagen del radar → su recorte ya limpio
  let radarPintado = null;
  let calorPintado = null; // lista de pluviómetros con la que se pintó el calor
  let firmaGotas = '';

  function ponerTeselas(centro, zoom, ancho, alto) {
    if (zoom !== zoomPintado) {
      capaTeselas.innerHTML = '';
      capaNombres.innerHTML = '';
      teselas.clear();
      zoomPintado = zoom;
    }
    const maximo = 2 ** zoom;
    const x0 = Math.floor((centro.x - ancho / 2) / TESELA) - 1;
    const x1 = Math.floor((centro.x + ancho / 2) / TESELA) + 1;
    const y0 = Math.max(0, Math.floor((centro.y - alto / 2) / TESELA) - 1);
    const y1 = Math.min(maximo - 1, Math.floor((centro.y + alto / 2) / TESELA) + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const clave = `${zoom}/${tx}/${ty}`;
        if (teselas.has(clave)) continue;
        const x = ((tx % maximo) + maximo) % maximo;
        for (const [capa, url] of [
          [capaTeselas, URL_BASE],
          [capaNombres, URL_NOMBRES],
        ]) {
          const img = document.createElement('img');
          img.className = 'mapa-tesela';
          img.style.left = `${tx * TESELA}px`;
          img.style.top = `${ty * TESELA}px`;
          img.src = url(zoom, x, ty);
          capa.appendChild(img);
        }
        teselas.set(clave, true);
      }
    }
  }

  /** Ubica un lienzo que cubre el RECORTE sobre el mundo del zoom actual. */
  function ubicarEnRecorte(lienzo, zoom) {
    const a = proyectar(RECORTE.norte, RECORTE.oeste, zoom);
    const b = proyectar(RECORTE.sur, RECORTE.este, zoom);
    lienzo.style.left = `${a.x}px`;
    lienzo.style.top = `${a.y}px`;
    lienzo.style.width = `${b.x - a.x}px`;
    lienzo.style.height = `${b.y - a.y}px`;
  }

  function ponerRadar(radar, zoom) {
    if (!radar) {
      lienzoRadar.hidden = true;
      return;
    }
    // Se recorta solo la zona del valle: la imagen entera escalada a este zoom sería enorme.
    if (radarPintado !== radar.lienzo) {
      radarPintado = radar.lienzo;
      let recorte = recortes.get(radar.lienzo);
      if (!recorte) {
        recorte = recortarRadar(radar.lienzo);
        recortes.set(radar.lienzo, recorte);
      }
      lienzoRadar.width = recorte.width;
      lienzoRadar.height = recorte.height;
      const contexto = lienzoRadar.getContext('2d');
      contexto.clearRect(0, 0, lienzoRadar.width, lienzoRadar.height);
      contexto.drawImage(recorte, 0, 0);
    }
    lienzoRadar.hidden = false;
    ubicarEnRecorte(lienzoRadar, zoom);
  }

  function ponerCalor(pluviometros, zoom) {
    if (!pluviometros) {
      lienzoCalor.hidden = true;
      return;
    }
    if (calorPintado !== pluviometros) {
      calorPintado = pluviometros;
      pintarCalor(lienzoCalor, pluviometros);
    }
    lienzoCalor.hidden = false;
    ubicarEnRecorte(lienzoCalor, zoom);
  }

  function ponerGotas(pluviometros, zoom) {
    const conLluvia = (pluviometros || []).filter((p) => p.nivel > 0);
    const firma = `${zoom}|${conLluvia.map((p) => `${p.codigo}:${p.mm}:${p.nivel}`).join(',')}`;
    if (firma === firmaGotas) return;
    firmaGotas = firma;
    capaGotas.classList.toggle('con-cifras', zoom >= 13);
    capaGotas.innerHTML = conLluvia
      .map((p) => {
        const { x, y } = proyectar(p.latitud, p.longitud, zoom);
        const mm = p.mm.toFixed(1).replace('.', ',');
        return `<span class="gota nivel-${p.nivel}" style="left:${x}px;top:${y}px"><span class="gota-mm">${mm}</span></span>`;
      })
      .join('');
  }

  function pintarLluvia(lluvia = {}) {
    ponerRadar(lluvia.radar || null, zoomActual);
    ponerCalor(lluvia.calor || null, zoomActual);
    ponerGotas(lluvia.gotas || null, zoomActual);
    leyendaTitulo.textContent = lluvia.titulo || '';
  }

  function ponerPuntos(puntos, zoom) {
    // Los puntos con las mismas coordenadas se reparten en un círculo pequeño.
    const grupos = new Map();
    for (const punto of puntos) {
      const clave = `${punto.latitud},${punto.longitud}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(punto);
    }
    posiciones = new Map();
    for (const grupo of grupos.values()) {
      const base = proyectar(grupo[0].latitud, grupo[0].longitud, zoom);
      grupo.forEach((punto, i) => {
        if (grupo.length === 1) return posiciones.set(punto.id, base);
        const angulo = (2 * Math.PI * i) / grupo.length - Math.PI / 2;
        const radio = (SEPARACION * grupo.length) / (2 * Math.PI) + 4;
        return posiciones.set(punto.id, { x: base.x + radio * Math.cos(angulo), y: base.y + radio * Math.sin(angulo) });
      });
    }
    const firma = `${zoom}|${puntos.map((p) => p.id).join(',')}`;
    if (firma !== firmaPuntos) {
      firmaPuntos = firma;
      capaPuntos.innerHTML = '';
      elementos = new Map();
      for (const punto of puntos) {
        const el = document.createElement('div');
        const { x, y } = posiciones.get(punto.id);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.innerHTML = '<span class="punto-etiqueta"></span>';
        el.dataset.id = String(punto.id);
        capaPuntos.appendChild(el);
        elementos.set(punto.id, el);
      }
    }
    for (const punto of puntos) {
      const el = elementos.get(punto.id);
      el.className = `punto ${punto.clase}`;
      el.firstChild.textContent = punto.titulo || '';
    }
  }

  function pintar(puntos, elegido, zoom, lluvia) {
    const ancho = contenedor.clientWidth;
    const alto = contenedor.clientHeight;
    zoomActual = zoom;
    ponerPuntos(puntos, zoom);
    const centro = posiciones.get(elegido) || (puntos[0] && posiciones.get(puntos[0].id)) || { x: 0, y: 0 };
    ponerTeselas(centro, zoom, ancho, alto);
    pintarLluvia(lluvia);
    mundo.style.transform = `translate(${Math.round(ancho / 2 - centro.x)}px, ${Math.round(alto / 2 - centro.y)}px)`;
  }

  /** Punto más cercano en la dirección pedida (dentro de un cono de ±60°). */
  function vecino(id, direccion) {
    const origen = posiciones.get(id);
    if (!origen) return null;
    const [dx, dy] = { izquierda: [-1, 0], derecha: [1, 0], arriba: [0, -1], abajo: [0, 1] }[direccion];
    let mejor = null;
    let mejorPuntaje = Infinity;
    posiciones.forEach((p, otro) => {
      if (otro === id) return;
      const vx = p.x - origen.x;
      const vy = p.y - origen.y;
      const distancia = Math.hypot(vx, vy);
      if (!distancia) return;
      const coseno = (vx * dx + vy * dy) / distancia;
      if (coseno < 0.5) return;
      const puntaje = distancia * (2 - coseno);
      if (puntaje < mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = otro;
      }
    });
    return mejor;
  }

  return { pintar, pintarLluvia, vecino };
}
