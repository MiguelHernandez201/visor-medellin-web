// Lluvia según el radar meteorológico del SIATA (cerro Santa Elena).
// El SIATA publica cada ~5 minutos la última imagen de reflectividad del radar:
//   https://siata.gov.co/data/siata_app/ultima_imagen_radarDBZH.png
// Es un PNG transparente de 515x496 px (unos 450 m por píxel) que cubre de 5,1° a 7,3°
// de latitud y de -76,6° a -74,3° de longitud (radar.json). La lluvia sale en colores,
// de azul (débil) a verde, amarillo y rojo (fuerte); los anillos de distancia van en
// negro semitransparente y se ignoran. Como el servidor envía CORS (*), la imagen se
// puede leer píxel a píxel tanto en el TV como en el PC.
//
// El radar tiene "falsos ecos": rayas finas en línea recta hacia el radar (interferencias
// de otras antenas) y puntos sueltos, que marcaban lluvia donde no llovía (p. ej. una raya
// sobre Belalcázar con todos los pluviómetros secos). Al cargar cada imagen se borran los
// píxeles de lluvia que tienen menos de 3 vecinos con lluvia: una raya de 1 px desaparece y
// las zonas de lluvia de verdad (manchas anchas) quedan casi iguales. Además, main.js
// confirma lo del radar con los pluviómetros cercanos (ver pluvios.js).

const URL_RADAR = 'https://siata.gov.co/data/siata_app/ultima_imagen_radarDBZH.png';
export const LIMITES_RADAR = { norte: 7.3, sur: 5.1, este: -74.3, oeste: -76.6 };
const CADA_MS = 5 * 60 * 1000;
const VECINDAD = 1; // píxeles alrededor del punto: 3x3 px ≈ 1,4 x 1,4 km
const VECINOS_MINIMOS = 3; // un píxel de lluvia con menos vecinos con lluvia es un falso eco

export const NIVELES = ['', 'Llovizna', 'Lluvia ligera', 'Lluvia moderada', 'Lluvia fuerte'];

let radar = null; // { ancho, alto, pixeles, hora, lienzo }
let pedido = 0;
let cargando = false;
const oyentes = [];

/** Nivel de lluvia (0 a 4) de un color del radar. */
function nivelDeColor(r, g, b, a) {
  if (a < 60) return 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40) return 0; // gris o negro: anillos, bordes
  let tono;
  if (max === r) tono = (60 * (g - b)) / (max - min);
  else if (max === g) tono = 120 + (60 * (b - r)) / (max - min);
  else tono = 240 + (60 * (r - g)) / (max - min);
  if (tono < 0) tono += 360;
  if (tono >= 190 && tono < 290) return 1; // azul, morado
  if (tono >= 75 && tono < 190) return 2; // verde
  if (tono >= 25 && tono < 75) return 3; // amarillo, naranja
  return 4; // rojo, magenta
}

/**
 * Borra (deja transparentes) los falsos ecos de una imagen del radar: píxeles con lluvia
 * que tienen menos de VECINOS_MINIMOS vecinos (de 8) con lluvia. Modifica `pixeles`.
 */
function limpiarFalsosEcos(pixeles, ancho, alto) {
  const conLluvia = new Uint8Array(ancho * alto);
  for (let i = 0; i < conLluvia.length; i++) {
    const k = i * 4;
    conLluvia[i] = nivelDeColor(pixeles[k], pixeles[k + 1], pixeles[k + 2], pixeles[k + 3]) > 0 ? 1 : 0;
  }
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x;
      if (!conLluvia[i]) continue;
      let vecinos = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const vx = x + dx;
          const vy = y + dy;
          if ((dx || dy) && vx >= 0 && vy >= 0 && vx < ancho && vy < alto) vecinos += conLluvia[vy * ancho + vx];
        }
      }
      if (vecinos < VECINOS_MINIMOS) pixeles[i * 4 + 3] = 0;
    }
  }
}

/**
 * Dibuja una imagen del radar en un <canvas> sin falsos ecos; devuelve { lienzo, pixeles }.
 * Si la imagen viene de un servidor sin CORS (los cuadros de la animación), el navegador no
 * deja leer sus píxeles: se dibuja tal cual, sin limpiar, y `pixeles` es null.
 */
function lienzoLimpio(imagen) {
  const lienzo = document.createElement('canvas');
  lienzo.width = imagen.naturalWidth;
  lienzo.height = imagen.naturalHeight;
  const contexto = lienzo.getContext('2d');
  contexto.drawImage(imagen, 0, 0);
  try {
    const datos = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
    limpiarFalsosEcos(datos.data, lienzo.width, lienzo.height);
    contexto.putImageData(datos, 0, 0);
    return { lienzo, pixeles: datos.data };
  } catch {
    return { lienzo, pixeles: null };
  }
}

/** Nivel de lluvia (0 a 4) en un punto, o null si aún no hay imagen del radar. */
export function lluviaEn(latitud, longitud) {
  if (!radar) return null;
  const { ancho, alto, pixeles } = radar;
  const x = Math.round(((longitud - LIMITES_RADAR.oeste) / (LIMITES_RADAR.este - LIMITES_RADAR.oeste)) * ancho);
  const y = Math.round(((LIMITES_RADAR.norte - latitud) / (LIMITES_RADAR.norte - LIMITES_RADAR.sur)) * alto);
  let nivel = 0;
  for (let dy = -VECINDAD; dy <= VECINDAD; dy++) {
    for (let dx = -VECINDAD; dx <= VECINDAD; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= ancho || py >= alto) continue;
      const i = (py * ancho + px) * 4;
      nivel = Math.max(nivel, nivelDeColor(pixeles[i], pixeles[i + 1], pixeles[i + 2], pixeles[i + 3]));
    }
  }
  return nivel;
}

/** Última imagen del radar en un <canvas> (para el mapa) y su hora, o null. */
export const imagenRadar = () => (radar ? { lienzo: radar.lienzo, hora: radar.hora } : null);

/** Llama a `fn` cada vez que llega una imagen nueva del radar. */
export const alActualizarRadar = (fn) => oyentes.push(fn);

function decodificar(url) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => resolver(imagen);
    imagen.onerror = () => rechazar(new Error('radar no disponible'));
    imagen.src = url;
  });
}

/** Pide la imagen del radar si han pasado 5 minutos (o nunca se ha pedido). */
export async function revisarRadar() {
  const ahora = Date.now();
  if (cargando || ahora - pedido < CADA_MS) return;
  cargando = true;
  pedido = ahora;
  let url = null;
  try {
    const respuesta = await fetch(`${URL_RADAR}?t=${ahora}`, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const hora = Date.parse(respuesta.headers.get('last-modified')) || ahora;
    if (radar && hora === radar.hora) return;
    url = URL.createObjectURL(await respuesta.blob());
    const imagen = await decodificar(url);
    const { lienzo, pixeles } = lienzoLimpio(imagen);
    radar = { ancho: lienzo.width, alto: lienzo.height, pixeles, hora, lienzo };
    oyentes.forEach((fn) => fn());
  } catch {
    pedido = ahora - CADA_MS + 60000; // reintento en 1 minuto
  } finally {
    if (url) URL.revokeObjectURL(url);
    cargando = false;
  }
}

// ---------------------------------------------------------------------------
// Animación: las imágenes del radar de las últimas ~3 horas (una cada ~5 min). La lista sale
// de la carpeta de la app móvil del SIATA, que sí envía CORS:
//   https://siata.gov.co/data/siata_app/animacion_radar.json
//   → { urls: [{ time: "2026-11-06 18:30", image: "https://siata.gov.co/newpage/../data/radar/10/…png" }, …] }
//      (de la más vieja a la más nueva; mismo tamaño y zona que la última imagen)
// Las imágenes no envían CORS: se cargan como <img> (eso sí se puede) y se muestran tal cual,
// sin quitarles los falsos ecos porque el navegador no deja leer sus píxeles.
// ---------------------------------------------------------------------------
const URL_ANIMACION = 'https://siata.gov.co/data/siata_app/animacion_radar.json';
let cuadros = []; // [{ url, hora, lienzo }] de la más vieja a la más nueva
let pedidoAnimacion = 0;
let cargandoAnimacion = false;
const oyentesAnimacion = [];

/** Carga una imagen del radar (sin CORS) y la deja en un <canvas>. */
async function lienzoDe(direccion) {
  return lienzoLimpio(await decodificar(direccion)).lienzo;
}

/** "https://siata.gov.co/newpage/../data/…" → "https://siata.gov.co/data/…" */
const normalizar = (direccion) => new URL(direccion).href;

/** Cuadros de la animación ya descargados: [{ lienzo, hora: "18:20" }], del más viejo al más nuevo. */
export const cuadrosRadar = () => cuadros.filter((c) => c.lienzo).map(({ lienzo, hora }) => ({ lienzo, hora }));

/** Llama a `fn` cada vez que llegan cuadros nuevos de la animación. */
export const alActualizarAnimacion = (fn) => oyentesAnimacion.push(fn);

/** Pide la lista de cuadros si han pasado 5 minutos y descarga los que falten. */
export async function revisarAnimacion() {
  const ahora = Date.now();
  if (cargandoAnimacion || ahora - pedidoAnimacion < CADA_MS) return;
  cargandoAnimacion = true;
  pedidoAnimacion = ahora;
  try {
    const respuesta = await fetch(`${URL_ANIMACION}?t=${ahora}`, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const lista = (await respuesta.json()).urls;
    const previos = new Map(cuadros.map((c) => [c.url, c]));
    cuadros = (Array.isArray(lista) ? lista : [])
      .filter((c) => c && typeof c.image === 'string')
      .map((c) => {
        const url = normalizar(c.image);
        return previos.get(url) || { url, hora: (/\d\d:\d\d/.exec(c.time || '') || [''])[0], lienzo: null };
      });
    // De a una, de la más nueva a la más vieja, avisando cada 6 para que la animación crezca.
    const faltan = cuadros.filter((c) => !c.lienzo).reverse();
    for (let i = 0; i < faltan.length; i++) {
      try {
        faltan[i].lienzo = await lienzoDe(faltan[i].url);
      } catch {
        // un cuadro que no llega se omite
      }
      if (i % 6 === 5 || i === faltan.length - 1) oyentesAnimacion.forEach((fn) => fn());
    }
  } catch {
    pedidoAnimacion = ahora - CADA_MS + 60000; // reintento en 1 minuto
  } finally {
    cargandoAnimacion = false;
  }
}
