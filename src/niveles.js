// Nivel del agua en las estaciones del SIATA (río Medellín y quebradas), del geoportal
// (a través del relevo, ver geoportal.js):
//   https://geoportal.siata.gov.co/fastgeoapi/geodata/geodataJson/2/niveles → niveles.json
// Es un GeoJSON (~65 KB, se renueva cada ~5 minutos) con las ~160 estaciones de nivel:
//   codigo, nombreEstacion
//   nivelActual        en cm, o un texto si la estación no reporta
//   fechaUltimoDato    "2026-11-06T18:20:00", hora de Colombia
//   color              el del riesgo (#79c454 N1, #F9DA41 N2, #F29436 N3, rojo N4);
//                      negro (#0e0e0e), gris (#707070) o null = sin dato
//   nivelSeguro, nivelPrecaucion, inundacionMenor   en cm: el límite superior de N1, N2 y N3.
//                      ¡Ojo! A veces la respuesta llega sin estos tres campos: se recuerdan
//                      los últimos que llegaron de cada estación.
// Los niveles de riesgo son los del SIATA: N1 seguro, N2 precaución, N3 inundación menor y
// N4 inundación mayor. El riesgo sale del color (lo que muestra el geoportal); si el color
// no se reconoce, de los umbrales.
//
// Para la pantalla completa, la serie de las últimas 3 horas de una estación (minuto a minuto,
// en metros) sale de geodata/geographJson/3/nivel/<código> → series/<código>.json (el relevo
// solo copia las de las estaciones que tienen cámara).
import { DATOS, fuenteJson, horaDe } from './geoportal.js';

/** Texto de cada riesgo; 0 = la estación no reporta. */
export const RIESGOS = ['Sin dato', 'N1 · seguro', 'N2 · precaución', 'N3 · inundación menor', 'N4 · inundación mayor'];

/** Riesgo (1 a 4) según el tono del color del geoportal; 0 si es gris/negro; null si no se reconoce. */
function riesgoPorColor(color) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color || '');
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40) return 0; // gris o negro: sin dato
  let tono;
  if (max === r) tono = (60 * (g - b)) / (max - min);
  else if (max === g) tono = 120 + (60 * (b - r)) / (max - min);
  else tono = 240 + (60 * (r - g)) / (max - min);
  if (tono < 0) tono += 360;
  if (tono < 20 || tono >= 330) return 4; // rojo
  if (tono < 42) return 3; // naranja
  if (tono < 70) return 2; // amarillo
  if (tono < 170) return 1; // verde
  return null;
}

/** Riesgo (1 a 4) de un nivel según los límites superiores de N1, N2 y N3, o null sin límites. */
function riesgoPorLimites(valor, limites) {
  if (!limites.every((l) => typeof l === 'number')) return null;
  return limites.findIndex((limite) => valor < limite) + 1 || 4;
}

const limitesConocidos = new Map(); // código → [N1, N2, N3] en cm (la API a veces no los manda)

/** Datos de una estación del GeoJSON del geoportal. */
function leerEstacion(p) {
  const cm = p.nivelActual;
  const codigo = String(p.codigo);
  if ([p.nivelSeguro, p.nivelPrecaucion, p.inundacionMenor].every((l) => typeof l === 'number')) {
    limitesConocidos.set(codigo, [p.nivelSeguro, p.nivelPrecaucion, p.inundacionMenor]);
  }
  const limites = limitesConocidos.get(codigo) || [null, null, null]; // cm
  let riesgo = 0;
  if (typeof cm === 'number') {
    const porColor = riesgoPorColor(p.color);
    riesgo = porColor === null ? riesgoPorLimites(cm, limites) || 0 : porColor;
  }
  return {
    codigo,
    nombre: String(p.nombreEstacion || '').replace(/\s+/g, ' ').trim(),
    riesgo,
    metros: riesgo ? cm / 100 : null,
    hora: riesgo ? horaDe(p.fechaUltimoDato) : '',
    // Nivel (en m) desde el que empieza el riesgo siguiente; null en N4 o sin dato.
    siguiente: riesgo && riesgo < 4 && typeof limites[riesgo - 1] === 'number' ? limites[riesgo - 1] / 100 : null,
  };
}

const fuente = fuenteJson('niveles.json', 5 * 60 * 1000, (geojson) => {
  const estaciones = new Map();
  for (const { properties } of geojson.features || []) {
    if (properties && properties.codigo != null) {
      const datos = leerEstacion(properties);
      estaciones.set(datos.codigo, datos);
    }
  }
  if (!estaciones.size) throw new Error('sin estaciones');
  return estaciones;
});

export const revisarNiveles = fuente.revisar;
export const alActualizarNiveles = fuente.alActualizar;

/** Datos de una estación por su código, o null si aún no hay datos o no existe. */
export const estacion = (codigo) => {
  const estaciones = fuente.datos();
  return (estaciones && estaciones.get(String(codigo))) || null;
};

// ---------------------------------------------------------------------------
// Serie de las últimas 3 horas (para la gráfica de la pantalla completa)
// ---------------------------------------------------------------------------
const SERIE_VALIDA_MS = 2 * 60 * 1000;
const series = new Map(); // código → { pedida, datos: { horas, metros, limites } | null }

/**
 * Serie de las últimas 3 h de una estación: { horas: ['15:35', …], metros: [0.84, …],
 * limites: [N1, N2, N3, N4] en m } o null mientras llega. `alLlegar` se llama cuando hay datos nuevos.
 */
export function serieNivel(codigo, alLlegar) {
  const clave = String(codigo);
  const guardada = series.get(clave);
  const ahora = Date.now();
  if (!guardada || ahora - guardada.pedida > SERIE_VALIDA_MS) {
    const entrada = { pedida: ahora, datos: guardada ? guardada.datos : null };
    series.set(clave, entrada);
    fetch(`${DATOS}/series/${encodeURIComponent(clave)}.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(({ info }) => {
        const datos = info && info.nivelUltimosDatos;
        if (!datos || !datos.x || !datos.y || !datos.y.length) return;
        entrada.datos = {
          horas: datos.x.map(horaDe),
          metros: datos.y.map(Number),
          limites: [info.nivelSeguro, info.nivelPrecaucion, info.inundacionMenor, info.inundacionMayor].map(Number),
        };
        alLlegar();
      })
      .catch(() => {
        entrada.pedida = ahora - SERIE_VALIDA_MS + 30000; // reintento en 30 s
      });
  }
  return guardada ? guardada.datos : null;
}
