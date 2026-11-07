// Relevo de datos del SIATA para la PWA (npm run datos; lo corre GitHub Actions cada 5 min).
//
// La API del geoportal del SIATA (geoportal.siata.gov.co/fastgeoapi) no envía CORS, así que
// un navegador no la puede leer desde otra página. Este script la descarga y deja los JSON en
// datos/, y el flujo .github/workflows/datos.yml los publica en la rama "datos" del repo. La
// app los lee de raw.githubusercontent.com, que sí envía CORS (Access-Control-Allow-Origin: *).
//
//   datos/niveles.json        nivel de ~160 estaciones (con umbrales: ver abajo)
//   datos/pluvios.json        ~180 pluviómetros (mm en 15 min)
//   datos/meteo.json          ~40 estaciones meteorológicas
//   datos/aire.json           PM2.5 (ICA de 24 h)
//   datos/alertas.json        alertas vigentes para la ciudadanía
//   datos/series/<cód>.json   nivel de las últimas 3 h de las estaciones que tienen cámara
//   datos/umbrales.json       últimos umbrales conocidos de cada estación (cm)
//   datos/estado.json         cuándo se generó y qué falló
//
// Los archivos son las respuestas del geoportal tal cual, salvo niveles.json, al que se le
// completan los umbrales: la API a veces responde sin nivelSeguro / nivelPrecaucion /
// inundacionMenor / inundacionMayor, así que se guardan los últimos que llegaron (de la lista
// o de las series) en umbrales.json y se rellenan con ellos.
//
// Si una fuente falla se conserva el archivo anterior (el flujo descarga la rama "datos" en
// datos/ antes de correr esto). Termina con error solo si fallan todas.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CAMARAS_SIATA } from '../src/siata.js';

const API = 'https://geoportal.siata.gov.co/fastgeoapi';
const CARPETA = new URL('../datos/', import.meta.url);
const UMBRALES = ['nivelSeguro', 'nivelPrecaucion', 'inundacionMenor', 'inundacionMayor'];

const FUENTES = {
  'niveles.json': 'geodata/geodataJson/2/niveles',
  'pluvios.json': 'geodata/geodataJson/3/pluvios_v2',
  'meteo.json': 'geodata/geodataJson/3/tempVient',
  'aire.json': 'geodata/geodataJson/1/pm25_minio',
  'alertas.json': 'alerts/active/citizen',
};

mkdirSync(new URL('series/', CARPETA), { recursive: true });

async function pedir(ruta, intentos = 3) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      const respuesta = await fetch(`${API}/${ruta}`, {
        headers: { 'User-Agent': 'visor-medellin-web (relevo de datos; github.com/MiguelHernandez201/visor-medellin-web)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      return await respuesta.json();
    } catch (error) {
      ultimoError = error;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw ultimoError;
}

const leerJson = (archivo, porDefecto) => {
  const url = new URL(archivo, CARPETA);
  try {
    return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : porDefecto;
  } catch {
    return porDefecto;
  }
};
const guardar = (archivo, datos) => writeFileSync(new URL(archivo, CARPETA), JSON.stringify(datos));

const estado = { generado: new Date().toISOString(), archivos: {} };
const umbrales = leerJson('umbrales.json', {}); // código → { nivelSeguro, … } en cm
let fallos = 0;

// Listas principales
const respuestas = {};
await Promise.all(
  Object.entries(FUENTES).map(async ([archivo, ruta]) => {
    try {
      respuestas[archivo] = await pedir(ruta);
      estado.archivos[archivo] = { ok: true };
    } catch (error) {
      fallos += 1;
      estado.archivos[archivo] = { ok: false, error: String(error.message || error) };
    }
  }),
);

// Series de 3 h de las estaciones con cámara (de a 6 en paralelo)
const codigos = [...new Set(CAMARAS_SIATA.map((c) => c.estacion).filter(Boolean).map(String))];
let seriesOk = 0;
for (let i = 0; i < codigos.length; i += 6) {
  await Promise.all(
    codigos.slice(i, i + 6).map(async (codigo) => {
      try {
        const serie = await pedir(`geodata/geographJson/3/nivel/${codigo}`, 2);
        guardar(`series/${codigo}.json`, serie);
        seriesOk += 1;
        const info = serie && serie.info;
        if (info && UMBRALES.every((u) => typeof info[u] === 'number')) {
          umbrales[codigo] = Object.fromEntries(UMBRALES.map((u) => [u, Math.round(info[u] * 1000) / 10])); // m → cm
        }
      } catch {
        // estación sin datos o inactiva: se deja la serie anterior si la había
      }
    }),
  );
}
estado.archivos.series = { ok: seriesOk > 0, estaciones: codigos.length, actualizadas: seriesOk };

// Niveles: se recuerdan los umbrales que llegan y se rellenan los que faltan
if (respuestas['niveles.json']) {
  for (const { properties: p } of respuestas['niveles.json'].features || []) {
    if (!p || p.codigo == null) continue;
    const codigo = String(p.codigo);
    if (UMBRALES.every((u) => typeof p[u] === 'number')) {
      umbrales[codigo] = Object.fromEntries(UMBRALES.map((u) => [u, p[u]]));
    } else if (umbrales[codigo]) {
      Object.assign(p, umbrales[codigo]);
    }
  }
}
guardar('umbrales.json', umbrales);

for (const [archivo, datos] of Object.entries(respuestas)) guardar(archivo, datos);
guardar('estado.json', estado);

console.log(JSON.stringify(estado, null, 2));
if (fallos === Object.keys(FUENTES).length && !seriesOk) {
  console.error('No se pudo leer ninguna fuente del SIATA');
  process.exit(1);
}
