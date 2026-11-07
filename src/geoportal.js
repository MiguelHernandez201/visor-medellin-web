// Datos en vivo del geoportal del SIATA (https://geoportal.siata.gov.co).
// Su API (fastgeoapi) devuelve JSON pero no envía CORS, así que el navegador no la puede
// leer desde esta página. Por eso la PWA lee una copia que GitHub Actions renueva cada
// ~5 minutos (scripts/datos.mjs → rama "datos" del repo), servida por raw.githubusercontent.com,
// que sí envía CORS. Si se monta otro relevo (p. ej. un Cloudflare Worker), basta cambiar
// DATOS_POR_DEFECTO o abrir la app con ?datos=<url>.

const DATOS_POR_DEFECTO = 'https://raw.githubusercontent.com/MiguelHernandez201/visor-medellin-web/datos';
export const DATOS = (new URLSearchParams(location.search).get('datos') || DATOS_POR_DEFECTO).replace(/\/$/, '');

/**
 * Fuente que se pide de nuevo cada `cadaMs` (si se llama a revisar()) y se transforma con
 * `leer(json)`. `archivo` es el nombre en el relevo (p. ej. "niveles.json"). Si falla, se
 * reintenta al minuto. Devuelve { revisar, datos, alActualizar }.
 */
export function fuenteJson(archivo, cadaMs, leer) {
  let datos = null;
  let pedido = 0;
  let cargando = false;
  const oyentes = [];

  async function revisar() {
    const ahora = Date.now();
    if (cargando || ahora - pedido < cadaMs) return;
    cargando = true;
    pedido = ahora;
    try {
      const respuesta = await fetch(`${DATOS}/${archivo}`, { cache: 'no-store' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      datos = leer(await respuesta.json());
      oyentes.forEach((fn) => fn());
    } catch {
      pedido = ahora - cadaMs + Math.min(cadaMs, 60000); // reintento en 1 minuto
    } finally {
      cargando = false;
    }
  }

  return { revisar, datos: () => datos, alActualizar: (fn) => oyentes.push(fn) };
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
