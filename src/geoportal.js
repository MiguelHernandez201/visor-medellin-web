// Datos en vivo del geoportal del SIATA (https://geoportal.siata.gov.co).
// Su API (fastgeoapi) devuelve JSON pero no envía CORS, así que el navegador no la puede
// leer desde esta página. Por eso la PWA lee una copia que GitHub Actions renueva cada
// ~5 minutos (scripts/datos.mjs → rama "datos" del repo), servida por raw.githubusercontent.com,
// que sí envía CORS. Si se monta otro relevo (p. ej. un Cloudflare Worker), basta cambiar
// DATOS_POR_DEFECTO o abrir la app con ?datos=<url> (con ?datos= no se consulta la API de GitHub).

const REPO = 'MiguelHernandez201/visor-medellin-web';
const RAMA = 'datos';
const DATOS_POR_DEFECTO = `https://raw.githubusercontent.com/${REPO}/${RAMA}`;
const DATOS_PEDIDOS = new URLSearchParams(location.search).get('datos');
const DATOS = (DATOS_PEDIDOS || DATOS_POR_DEFECTO).replace(/\/$/, '');

// raw.githubusercontent.com guarda cada archivo de una rama 5 minutos en su caché (y no hace
// caso de parámetros como ?t=…), así que tras una corrida del relevo la app seguía viendo
// los datos viejos un buen rato. Por eso se pregunta a la API de GitHub cuál es el último
// commit de la rama "datos" y se leen los archivos por ese commit: es una URL nueva en cada
// corrida, sin caché vieja. La pregunta se repite cada minuto con su ETag; mientras no cambie,
// GitHub responde 304, que no gasta del cupo de la API (60 por hora y por IP sin cuenta).
// Si la API falla (sin red, cupo agotado) se vuelve a la rama, que puede venir hasta 5 min atrasada.
const VERSION_CADA_MS = 60 * 1000;
let version = null; // sha del último commit de la rama "datos", o null
let versionPedida = 0;
let pidiendoVersion = null;
let primeraVersion = null;
const alCambiarVersion = [];

/** Pregunta (como mucho una vez por minuto) si hay un relevo nuevo; si lo hay, avisa a las fuentes. */
export function revisarVersion() {
  if (DATOS_PEDIDOS) return Promise.resolve();
  if (pidiendoVersion) return pidiendoVersion;
  if (Date.now() - versionPedida < VERSION_CADA_MS) return Promise.resolve();
  versionPedida = Date.now();
  pidiendoVersion = (async () => {
    let nueva = null;
    try {
      const respuesta = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/${RAMA}`, { cache: 'no-cache' });
      if (respuesta.ok) {
        const ref = await respuesta.json();
        if (ref && ref.object && /^[0-9a-f]{40}$/.test(ref.object.sha)) nueva = ref.object.sha;
      }
    } catch {
      // sin red o sin API: se usa la rama
    }
    if (nueva !== version) {
      const habia = version;
      version = nueva;
      if (habia && nueva) alCambiarVersion.forEach((fn) => fn());
    }
    pidiendoVersion = null;
  })();
  return pidiendoVersion;
}

/** La primera vez se espera (hasta 3 s) a saber el commit, para no empezar con datos de la caché. */
function versionLista() {
  if (!primeraVersion) primeraVersion = Promise.race([revisarVersion(), new Promise((r) => setTimeout(r, 3000))]);
  return primeraVersion;
}

/** URL de un archivo del relevo (p. ej. "series/2.json"). */
export const urlDatos = (archivo) => `${version ? `https://raw.githubusercontent.com/${REPO}/${version}` : DATOS}/${archivo}`;

/** `fn` se llama cuando llega un relevo nuevo (para pedir de nuevo lo que ya se tenía). */
export const alHaberRelevoNuevo = (fn) => alCambiarVersion.push(fn);

/**
 * Fuente que se pide de nuevo cada `cadaMs` (si se llama a revisar()) y se transforma con
 * `leer(json)`. `archivo` es el nombre en el relevo (p. ej. "niveles.json"). Si falla, se
 * reintenta al minuto. Devuelve { revisar, datos, alActualizar, fallos } (fallos: pedidos
 * fallidos seguidos, 0 tras uno que funciona).
 */
export function fuenteJson(archivo, cadaMs, leer) {
  let datos = null;
  let pedido = 0;
  let cargando = false;
  let fallos = 0;
  const oyentes = [];
  alHaberRelevoNuevo(() => {
    pedido = 0; // relevo nuevo: se pide en el próximo revisar()
  });

  async function revisar() {
    const ahora = Date.now();
    if (cargando || ahora - pedido < cadaMs) return;
    cargando = true;
    pedido = ahora;
    try {
      await versionLista();
      const respuesta = await fetch(urlDatos(archivo), { cache: 'no-store' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      datos = leer(await respuesta.json());
      fallos = 0;
      oyentes.forEach((fn) => fn());
    } catch {
      fallos += 1;
      // reintento en 1 minuto (salvo que mientras tanto llegara un relevo nuevo: entonces ya)
      if (pedido === ahora) pedido = ahora - cadaMs + Math.min(cadaMs, 60000);
    } finally {
      cargando = false;
    }
  }

  return { revisar, datos: () => datos, alActualizar: (fn) => oyentes.push(fn), fallos: () => fallos };
}

/** Puntos de un GeoJSON: [{ latitud, longitud, p: properties }]. */
export const puntos = (geojson) =>
  (geojson.features || [])
    .filter((f) => f && f.geometry && f.geometry.type === 'Point' && f.properties)
    .map((f) => ({ longitud: f.geometry.coordinates[0], latitud: f.geometry.coordinates[1], p: f.properties }));

/** Distancia aproximada en km (suficiente a esta escala). */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const dy = (lat2 - lat1) * 111.2;
  const dx = (lon2 - lon1) * 111.2 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** El elemento de `lista` más cercano a un punto, a menos de `maxKm`: { ...item, km } o null. */
export function masCercano(lista, latitud, longitud, maxKm) {
  let mejor = null;
  for (const item of lista || []) {
    const km = distanciaKm(latitud, longitud, item.latitud, item.longitud);
    if (km <= maxKm && (!mejor || km < mejor.km)) mejor = { ...item, km };
  }
  return mejor;
}

/** "2026-11-06T18:20:00" o "2026-11-06 18:20:00" → "18:20" (hora de Colombia). */
export const horaDe = (texto) => {
  const m = /[T ](\d\d:\d\d)/.exec(texto || '');
  return m ? m[1] : '';
};

/** Número con coma decimal: 2.416 → "2,4". */
export const decimal = (n, cifras = 1) => n.toFixed(cifras).replace('.', ',');
