// Clima, calidad del aire y alertas del geoportal del SIATA (a través del relevo, ver geoportal.js):
//   geodata/geodataJson/3/tempVient     ~40 estaciones meteorológicas (cada 5 min): temperatura
//                                       (°C), humedad (%), viento (km/h y dirección)
//   geodata/geodataJson/1/pm25_minio    ~23 estaciones de PM2.5 (dato horario): índice ICA de
//                                       las últimas 24 h y su color
//   alerts/active/citizen               alertas vigentes para la ciudadanía:
//                                       [{ id_alerta, title, description (HTML) }]
import { fuenteJson, puntos, masCercano, horaDe } from './geoportal.js';

// ---------------------------------------------------------------------------
// Estaciones meteorológicas
// ---------------------------------------------------------------------------
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const meteo = fuenteJson('meteo.json', 5 * 60 * 1000, (geojson) =>
  puntos(geojson)
    .map(({ latitud, longitud, p }) => ({
      nombre: String(p.NombreEstacion || '').trim(),
      latitud,
      longitud,
      temperatura: numero(p.Temperatura),
      humedad: numero(p.Humedad_relativa),
      viento: numero(p.Magnitud_viento), // km/h
      direccion: String(p.Direccion_viento_cardinal || '').trim(),
      hora: horaDe(p.FechaUltimaModificacion),
    }))
    .filter((e) => e.temperatura != null),
);

export const revisarMeteo = meteo.revisar;
export const alActualizarMeteo = meteo.alActualizar;

/** Estación meteorológica más cercana (a menos de 5 km) o null. */
export const meteoCercana = (latitud, longitud) => masCercano(meteo.datos(), latitud, longitud, 5);

/** Temperatura en el centro de Medellín: la estación más cercana a la Torre SIATA. */
export function temperaturaCentro() {
  const estacion = masCercano(meteo.datos(), 6.2589, -75.5889, 4);
  return estacion ? estacion.temperatura : null;
}

// ---------------------------------------------------------------------------
// Calidad del aire (PM2.5)
// ---------------------------------------------------------------------------
const CATEGORIAS_ICA = [
  [50, 'buena'],
  [100, 'aceptable'],
  [150, 'dañina para grupos sensibles'],
  [200, 'dañina'],
  [300, 'muy dañina'],
  [Infinity, 'peligrosa'],
];

const aire = fuenteJson('aire.json', 15 * 60 * 1000, (geojson) =>
  puntos(geojson)
    .map(({ latitud, longitud, p }) => ({
      nombre: String(p.nombreEstacion || '').trim(),
      latitud,
      longitud,
      ica: numero(p.ICA_24H_prom),
      color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : null,
    }))
    .filter((e) => e.ica != null && e.ica >= 0),
);

export const revisarAire = aire.revisar;
export const alActualizarAire = aire.alActualizar;

/** Estación de PM2.5 más cercana (a menos de 6 km), con su categoría, o null. */
export function aireCercano(latitud, longitud) {
  const estacion = masCercano(aire.datos(), latitud, longitud, 6);
  if (!estacion) return null;
  const [, categoria] = CATEGORIAS_ICA.find(([tope]) => estacion.ica <= tope);
  return { ...estacion, categoria };
}

// ---------------------------------------------------------------------------
// Alertas para la ciudadanía
// ---------------------------------------------------------------------------
/** Texto plano de un fragmento HTML (las alertas traen la descripción en HTML). */
function textoPlano(html) {
  // DOMParser crea un documento inerte: no carga imágenes ni ejecuta nada del HTML.
  const documento = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return (documento.body.textContent || '').replace(/\s+/g, ' ').trim();
}

const alertas = fuenteJson('alertas.json', 2 * 60 * 1000, (json) =>
  (Array.isArray(json) ? json : [json])
    .filter((a) => a && (a.title || a.description))
    .map((a) => ({ id: String(a.id_alerta || a.title), titulo: textoPlano(a.title), texto: textoPlano(a.description) })),
);

export const revisarAlertas = alertas.revisar;
export const alActualizarAlertas = alertas.alActualizar;
/** Alertas vigentes ([] si no hay ninguna o aún no se sabe). */
export const alertasVigentes = () => alertas.datos() || [];
