// Descarga de las fotos de las dos fuentes:
// - SIMM (Sistema Inteligente de Movilidad de Medellín): una foto por cámara, numerada,
//   que renueva cada minuto: https://www.medellin.gov.co/SIMM/camaras-cctv/imagen6.jpg
//   No hay un listado público de cámaras, así que la app busca qué números existen
//   (descubrir) y guarda el resultado en el TV.
// - SIATA: una lista fija de fotos (ver siata.js) que también renueva cada minuto.
//
// En el TV la app se carga desde file:// y puede leer las cabeceras de la respuesta
// aunque los sitios no envíen CORS. Con ellas sabe cuándo se tomó cada foto y pide la
// siguiente justo cuando se renueva, con una petición condicional (304 si no cambió):
// - SIMM: reescribe las fotos una tras otra al empezar cada minuto (la 2 hacia el
//   segundo :01, la 82 hacia el :17). La hora sale de Last-Modified, corregida con el
//   desfase de su reloj (va minutos atrás) medido con la cabecera Date.
// - SIATA: su Last-Modified no sirve (repite la hora de la petición), pero el ETag
//   (estilo Apache: "tamaño-mtime") lleva la hora real del archivo en microsegundos.
// En el navegador del PC (npm run dev) CORS no deja leer las cabeceras, así que ahí
// se usa <img> y se pide cada minuto sin sincronizar.
import { esSiata, camaraSiata, URL_SIATA } from './siata.js';

export const URL_BASE = 'https://www.medellin.gov.co/SIMM/camaras-cctv/imagen';
export const REFRESCO_MS = 60 * 1000;
const MARGEN_MS = 2000; // retraso mínimo tras la hora prevista, por si aún se está escribiendo la foto
const RETRASO_MAXIMO_MS = 45000;
const REINTENTO_ATRASADA_MS = 5000; // la foto no se ha renovado a su hora
const REINTENTO_DETENIDA_MS = 30000; // la cámara lleva más de un minuto sin foto nueva

/** En el TV (webOS, file://) se pueden leer las cabeceras; en el PC no. */
export const conCabeceras = location.protocol === 'file:';

/** URL de la imagen con una marca para que el TV no la sirva de su caché. */
export const urlImagen = (numero, marca) => `${URL_BASE}${numero}.jpg?t=${marca}`;

/** URL de la foto de cualquier cámara: número del SIMM o "siata:…". */
const urlDe = (id, marca) =>
  esSiata(id) ? `${URL_SIATA}${camaraSiata(id).archivo}.jpg?t=${marca}` : urlImagen(id, marca);

/** Carga una URL en una Image() aparte; resuelve cuando está lista para mostrarse. */
function precargar(url, tiempoMs) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    const temporizador = setTimeout(() => fin(false), tiempoMs);
    function fin(ok) {
      clearTimeout(temporizador);
      imagen.onload = null;
      imagen.onerror = null;
      if (ok) resolver();
      else rechazar(new Error('imagen no disponible'));
    }
    imagen.onload = () => fin(imagen.naturalWidth > 0);
    imagen.onerror = () => fin(false);
    imagen.src = url;
  });
}

// Cuánto tarda cada cámara en publicar su foto después de la hora que marca (aprendido).
// En el SIMM es casi nada; en el SIATA las fotos llegan al servidor unos 20 s después
// de su hora. Se mide cuando una foto nueva aparece mientras se estaba esperando (tras
// un 304), así que el error es como mucho el intervalo entre reintentos.
const retrasos = new Map(); // cámara → ms
const esperando = new Set(); // cámaras cuya última respuesta fue 304

/** Hora local en que conviene volver a pedir la foto de `id` tomada a la hora local `tomada`. */
function proximaPeticion(id, tomada, ahora) {
  const prevista = tomada + REFRESCO_MS + (retrasos.get(id) || MARGEN_MS);
  if (prevista > ahora + 1000) return prevista;
  return ahora + (ahora - prevista < REFRESCO_MS ? REINTENTO_ATRASADA_MS : REINTENTO_DETENIDA_MS);
}

/** Diferencia entre el reloj local y el del SIMM (que puede ir minutos atrás), según la cabecera Date. */
let desfaseSimm = 0;

/** Hora (reloj local) en que se tomó la foto, según las cabeceras; NaN si no se puede saber. */
function horaDeLaFoto(id, respuesta) {
  if (esSiata(id)) {
    const mtime = /-([0-9a-f]{11,14})"$/.exec(respuesta.headers.get('etag') || '');
    return mtime ? parseInt(mtime[1], 16) / 1000 : NaN;
  }
  return Date.parse(respuesta.headers.get('last-modified')) + desfaseSimm;
}

/**
 * Pide la foto de una cámara (número del SIMM o "siata:…").
 * Resuelve { url, tomada, validador, proxima } con una foto nueva lista para
 * mostrarse, o { sinCambio: true, proxima } si aún no se ha renovado. `tomada` y
 * `proxima` son horas del reloj local. `anterior` es lo que se tiene de la última
 * foto ({ tomada, validador }) para pedirla solo si cambió. Rechaza si no se pudo descargar.
 */
export async function descargar(id, anterior, tiempoMs = 20000) {
  const inicio = Date.now();
  const url = urlDe(id, inicio);
  if (!conCabeceras) {
    await precargar(url, tiempoMs);
    return { url, tomada: Date.now(), proxima: inicio + REFRESCO_MS };
  }

  const cabeceras = {};
  if (anterior && anterior.validador) {
    cabeceras[esSiata(id) ? 'If-None-Match' : 'If-Modified-Since'] = anterior.validador;
  }
  const abortar = new AbortController();
  const temporizador = setTimeout(() => abortar.abort(), tiempoMs);
  try {
    const respuesta = await fetch(url, { headers: cabeceras, cache: 'no-store', signal: abortar.signal });
    const ahora = Date.now();
    if (!esSiata(id)) {
      const servidor = Date.parse(respuesta.headers.get('date'));
      if (!Number.isNaN(servidor)) desfaseSimm = ahora - servidor;
    }
    if (respuesta.status === 304) {
      esperando.add(id);
      return { sinCambio: true, proxima: proximaPeticion(id, anterior.tomada, ahora) };
    }
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    const validador = respuesta.headers.get(esSiata(id) ? 'etag' : 'last-modified');
    const blob = URL.createObjectURL(await respuesta.blob());
    try {
      await precargar(blob, tiempoMs);
    } catch (error) {
      URL.revokeObjectURL(blob);
      throw error;
    }
    const tomada = horaDeLaFoto(id, respuesta);
    if (Number.isNaN(tomada)) return { url: blob, tomada: ahora, proxima: ahora + REFRESCO_MS };
    if (esperando.delete(id)) retrasos.set(id, Math.min(RETRASO_MAXIMO_MS, Math.max(MARGEN_MS, ahora - tomada)));
    return { url: blob, tomada, validador, proxima: proximaPeticion(id, tomada, ahora) };
  } finally {
    clearTimeout(temporizador);
  }
}

/** Resuelve true si la URL carga como imagen válida antes de tiempoMs. */
export const probarImagen = (url, tiempoMs = 15000) =>
  precargar(url, tiempoMs).then(
    () => true,
    () => false,
  );

/**
 * Busca qué cámaras existen probando imagen{desde}…imagen{hasta}.
 * Se detiene antes si encuentra `hueco` números seguidos sin imagen después
 * de la última que sí existe. Devuelve los números encontrados, ordenados.
 */
export async function descubrir({
  desde = 1,
  hasta = 400,
  hueco = 60,
  paralelas = 6,
  debeParar = () => false,
  alProgreso = () => {},
} = {}) {
  const marca = Date.now();
  const encontradas = [];
  let siguiente = desde;
  let ultima = desde - 1;
  let revisadas = 0;

  const seguir = () => !debeParar() && siguiente <= hasta && siguiente - ultima <= hueco;

  async function trabajador() {
    while (seguir()) {
      const numero = siguiente++;
      if (await probarImagen(urlImagen(numero, marca), 12000)) {
        encontradas.push(numero);
        if (numero > ultima) ultima = numero;
      }
      revisadas += 1;
      alProgreso({ revisadas, encontradas: encontradas.length, actual: numero, hasta });
    }
  }

  await Promise.all(Array.from({ length: paralelas }, () => trabajador()));
  return encontradas.sort((a, b) => a - b);
}
