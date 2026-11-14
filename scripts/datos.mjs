// Relevo de datos para la PWA (npm run datos; lo corre GitHub Actions cada 5 min): SIATA,
// fotomultas, cargadores y moteles.
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
//   datos/fotomultas.json     cámaras de fotodetección de la Alcaldía (se renueva una vez al día)
//   datos/cargadores.json     cargadores de carros eléctricos, de OpenStreetMap y Open Charge Map (una vez al día)
//   datos/moteles.json        moteles, de OpenStreetMap (en la misma consulta)
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
import { redDe } from '../src/redes-carga.js';

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

// Fotomultas: capa "Camaras_FDT" del servidor de mapas de la Alcaldía de Medellín. Cambia muy
// de vez en cuando, así que se lee una vez al día; si falla o llega algo raro, queda la anterior.
const FOTOMULTAS =
  'https://www.medellin.gov.co/servidormapas/rest/services/transporte/VC_Infraest_Gestion_Transito/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=json';
const SENTIDOS = {
  'SUR-NORTE': 'sur a norte',
  'NORTE-SUR': 'norte a sur',
  'OCCIDENTE-ORIENTE': 'occidente a oriente',
  'ORIENTE-OCCIDENTE': 'oriente a occidente',
};

/** Las cámaras de varios carriles de un mismo punto y sentido se juntan en una. */
function leerFotomultas(json) {
  const limpio = (texto) => String(texto || '').replace(/\s+/g, ' ').trim();
  const marcada = (valor) => limpio(valor) !== '';
  const grupos = new Map();
  for (const { attributes: a } of json.features || []) {
    const sentido = SENTIDOS[limpio(a.sentido).toUpperCase()];
    const fuera = /^(NO |FUERA|INACTIV|SUSPEND)/i.test(limpio(a.operando));
    if (!sentido || fuera || typeof a.latitud !== 'number' || typeof a.longitud !== 'number' || !(a.vel_max_k > 0)) continue;
    // el nombre trae el sentido al final ("Don Quijote NORTE-SUR"): se le quita
    let nombre = limpio(a.descripcion);
    const cola = /[\s-]*\b(NORTE[- ]SUR|SUR[- ]NORTE|OCC-ORI|ORI-OCC|S-N|N-S)$/i;
    while (cola.test(nombre)) nombre = nombre.replace(cola, ''); // a veces viene dos veces ("S-N SUR-NORTE")
    nombre = nombre.replace(/^[\s-]+|[\s-]+$/g, '');
    const clave = `${nombre}|${sentido}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(a);
  }
  return [...grupos.entries()].map(([clave, lista]) => {
    const [nombre, sentido] = clave.split('|');
    const media = (campo) => Math.round((lista.reduce((suma, a) => suma + a[campo], 0) / lista.length) * 1e5) / 1e5;
    const detecta = [['v', 'ev'], ['r', 'sr'], ['p', 'pyp']].filter(([, campo]) => lista.some((a) => marcada(a[campo]))).map(([letra]) => letra).join('');
    return { nombre: nombre || limpio(lista[0].direccion), direccion: limpio(lista[0].direccion), sentido, limite: Math.round(lista[0].vel_max_k), latitud: media('latitud'), longitud: media('longitud'), detecta };
  });
}

const fotomultasAntes = leerJson('fotomultas.json', null);
const edadHoras = fotomultasAntes && fotomultasAntes.leido ? (Date.now() - Date.parse(fotomultasAntes.leido)) / 3600000 : Infinity;
if (edadHoras < 20) {
  estado.archivos['fotomultas.json'] = { ok: true, camaras: fotomultasAntes.camaras.length, leido: fotomultasAntes.leido };
} else {
  try {
    const respuesta = await fetch(FOTOMULTAS, { headers: { 'User-Agent': 'Mozilla/5.0 (visor-medellin-web; relevo de datos)' }, signal: AbortSignal.timeout(30000) });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const camaras = leerFotomultas(await respuesta.json());
    const enElValle = camaras.every((c) => c.latitud > 5.9 && c.latitud < 6.6 && c.longitud > -75.9 && c.longitud < -75.2);
    if (camaras.length < 10 || !enElValle) throw new Error(`respuesta rara (${camaras.length} cámaras)`);
    guardar('fotomultas.json', { leido: new Date().toISOString(), camaras });
    estado.archivos['fotomultas.json'] = { ok: true, camaras: camaras.length };
  } catch (error) {
    estado.archivos['fotomultas.json'] = { ok: false, error: String(error.message || error) };
  }
}

// Cargadores de carros eléctricos: OpenStreetMap (amenity=charging_station) en el Valle de
// Aburrá y sus alrededores, por Overpass. Una vez al día; si falla, queda la lista anterior.
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const ZONA = '(5.95,-75.75,6.55,-75.25)';
const CONSULTA = `[out:json][timeout:60];(nwr["amenity"="charging_station"]${ZONA};nwr["amenity"="love_hotel"]${ZONA};nwr["tourism"="motel"]${ZONA};);out center tags;`;
const CONECTORES = {
  type2: 'Tipo 2',
  type2_cable: 'Tipo 2',
  type2_combo: 'CCS2',
  type1: 'Tipo 1',
  type1_combo: 'CCS1',
  chademo: 'CHAdeMO',
  tesla_supercharger: 'Tesla',
  tesla_destination: 'Tesla',
  nacs: 'NACS',
  gb_dc: 'GB/T rápido',
  gb_ac: 'GB/T',
  schuko: 'Enchufe común',
  nema_5_15: 'Enchufe común',
  nema_5_20: 'Enchufe común',
};

/** kW de un texto como "50 kW", "7,4kW", "22000 W" o "150"; null si no se entiende. */
function kilovatios(texto) {
  const m = /([\d.,]+)\s*(kw|kva|w)?/i.exec(String(texto || ''));
  if (!m) return null;
  let valor = Number(m[1].replace(',', '.'));
  if (!(valor > 0)) return null;
  if ((m[2] || '').toLowerCase() === 'w') valor /= 1000;
  return valor > 0 && valor <= 500 ? Math.round(valor * 10) / 10 : null;
}

function leerCargadores(json) {
  const limpio = (texto) => String(texto || '').replace(/\s+/g, ' ').trim();
  const lista = [];
  for (const elemento of json.elements || []) {
    const t = elemento.tags || {};
    if (t.amenity !== 'charging_station') continue;
    const latitud = elemento.lat ?? (elemento.center && elemento.center.lat);
    const longitud = elemento.lon ?? (elemento.center && elemento.center.lon);
    if (typeof latitud !== 'number' || typeof longitud !== 'number') continue;
    if (['private', 'no'].includes(t.access)) continue; // los de uso privado no sirven en el mapa
    if (t.disused === 'yes' || t.abandoned === 'yes') continue;
    const operador = limpio(t.operator || t.network || t.brand);
    const conectores = new Set();
    let kw = kilovatios(t['charging_station:output']);
    for (const [clave, valor] of Object.entries(t)) {
      const m = /^socket:([a-z0-9_]+)(:output)?$/.exec(clave);
      if (!m) continue;
      if (m[2]) kw = Math.max(kw || 0, kilovatios(valor) || 0) || kw;
      else if (valor !== 'no' && CONECTORES[m[1]]) conectores.add(CONECTORES[m[1]]);
    }
    const calle = limpio([t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '));
    const nombre = limpio(t.name).replace(/^(punto|estaci[oó]n) de carga\s+/i, '') || operador || 'Cargador';
    lista.push({
      id: `${elemento.type[0].toUpperCase()}${elemento.id}`,
      nombre,
      red: redDe(t.name, t.operator, t.network, t.brand),
      operador,
      direccion: limpio([calle, t['addr:city']].filter(Boolean).join(', ')),
      latitud: Math.round(latitud * 1e5) / 1e5,
      longitud: Math.round(longitud * 1e5) / 1e5,
      conectores: [...conectores],
      kw: kw || null,
      plazas: Number(t.capacity) > 0 ? Number(t.capacity) : null,
      pago: t.fee === 'yes' ? true : t.fee === 'no' ? false : null,
      horario: limpio(t.opening_hours) === '24/7' ? '24 horas' : limpio(t.opening_hours),
    });
  }
  return lista;
}

function leerMoteles(json) {
  const limpio = (texto) => String(texto || '').replace(/\s+/g, ' ').trim();
  const lista = [];
  for (const elemento of json.elements || []) {
    const t = elemento.tags || {};
    if (t.amenity !== 'love_hotel' && t.tourism !== 'motel') continue;
    const latitud = elemento.lat ?? (elemento.center && elemento.center.lat);
    const longitud = elemento.lon ?? (elemento.center && elemento.center.lon);
    const nombre = limpio(t.name);
    if (typeof latitud !== 'number' || typeof longitud !== 'number' || !nombre) continue;
    if (t.disused === 'yes' || t.abandoned === 'yes') continue;
    const calle = limpio([t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '));
    lista.push({
      id: `${elemento.type[0].toUpperCase()}${elemento.id}`,
      nombre,
      direccion: limpio([calle, t['addr:city']].filter(Boolean).join(', ')),
      latitud: Math.round(latitud * 1e5) / 1e5,
      longitud: Math.round(longitud * 1e5) / 1e5,
      telefono: limpio(t.phone || t['contact:phone']),
      web: limpio(t.website || t['contact:website']),
    });
  }
  return lista;
}

// Open Charge Map: trae redes que OpenStreetMap no tiene etiquetadas (Celsia, EPM, Tesla…).
// Necesita una clave (secreto OPENCHARGEMAP_KEY en GitHub); sin ella se usa solo OpenStreetMap.
const OCM = 'https://api.openchargemap.io/v3/poi/';
const OCM_CAJA = '(6.55,-75.75),(5.95,-75.25)'; // la misma zona de la consulta a Overpass
const OCM_CONECTORES = {
  1: 'Tipo 1',
  2: 'CHAdeMO',
  25: 'Tipo 2',
  1036: 'Tipo 2',
  32: 'CCS1',
  33: 'CCS2',
  27: 'Tesla',
  30: 'Tesla',
  28: 'Enchufe común',
  22: 'Enchufe común',
  9: 'Enchufe común',
  1038: 'GB/T',
  1039: 'GB/T',
  1040: 'GB/T rápido',
};
const OCM_PRIVADO = [2, 3, 6]; // UsageType: privado, o solo para clientes con aviso
const OCM_FUERA = [100, 150, 200, 210]; // StatusType: no funciona, planeado, retirado, duplicado
const OCM_OPERADORES = { 23: 'Tesla', 3304: 'Celsia', 3705: 'Terpel Voltex' }; // el 1 es «desconocido»

function leerOpenChargeMap(json) {
  const limpio = (texto) => String(texto || '').replace(/\s+/g, ' ').trim();
  const lista = [];
  for (const p of Array.isArray(json) ? json : []) {
    const a = p.AddressInfo || {};
    if (typeof a.Latitude !== 'number' || typeof a.Longitude !== 'number') continue;
    if (OCM_PRIVADO.includes(p.UsageTypeID) || OCM_FUERA.includes(p.StatusTypeID)) continue;
    const conexiones = (p.Connections || []).filter((c) => !OCM_FUERA.includes(c.StatusTypeID));
    const kw = Math.max(0, ...conexiones.map((c) => (c.PowerKW > 0 && c.PowerKW <= 500 ? c.PowerKW : 0)));
    const operador = OCM_OPERADORES[p.OperatorID] || '';
    const nombre = limpio(a.Title).replace(/^(punto|estaci[oó]n) de carga\s+/i, '') || operador || 'Cargador';
    const costo = limpio(p.UsageCost);
    lista.push({
      id: `C${p.ID}`,
      nombre,
      red: redDe(nombre, operador, a.AddressLine2),
      operador,
      direccion: limpio([a.AddressLine1, a.Town].filter(Boolean).join(', ')),
      latitud: Math.round(a.Latitude * 1e5) / 1e5,
      longitud: Math.round(a.Longitude * 1e5) / 1e5,
      conectores: [...new Set(conexiones.map((c) => OCM_CONECTORES[c.ConnectionTypeID]).filter(Boolean))],
      kw: kw ? Math.round(kw * 10) / 10 : null,
      plazas: p.NumberOfPoints > 0 ? p.NumberOfPoints : null,
      pago: /gratis|free|sin costo|^0\b/i.test(costo) ? false : costo || p.UsageTypeID === 5 ? true : null,
      horario: '',
    });
  }
  return lista;
}

/** Metros entre dos puntos (aproximación plana, de sobra para unos cientos de metros). */
const metros = (a, b) =>
  Math.hypot((a.latitud - b.latitud) * 111320, (a.longitud - b.longitud) * 111320 * Math.cos((a.latitud * Math.PI) / 180));

const GENERICAS = ['otra', 'comercial']; // redes que no dicen quién opera el cargador
/** Nombre sin la red ni palabras de relleno: «Terpel Voltex Autopista Norte» → «autopista norte». */
const nombreBase = (texto) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(terpel|voltex|celsia|epm|enel x?|evsy|tesla|supercharger|eds|estacion|cargador|de|del|la|el)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Junta las dos listas. Un cargador de Open Charge Map es el mismo que otro ya en la lista
 * si está a menos de 150 m de uno de OpenStreetMap, a menos de 50 m de otro de Open Charge
 * Map, o si es de la misma red con el mismo nombre a menos de 2 km (las dos fuentes a veces
 * lo ubican distinto). Entonces se completa lo que le falte (red, conectores…).
 */
function combinarCargadores(osm, ocm) {
  const lista = osm.map((c) => ({ ...c, conectores: [...c.conectores] }));
  for (const c of ocm) {
    const igual = lista.find((o) => {
      const distancia = metros(o, c);
      if (distancia < (o.id.startsWith('C') ? 50 : 150)) return true;
      return distancia < 2000 && o.red === c.red && !GENERICAS.includes(c.red) && nombreBase(o.nombre) !== '' && nombreBase(o.nombre) === nombreBase(c.nombre);
    });
    if (!igual) {
      lista.push(c);
      continue;
    }
    if (GENERICAS.includes(igual.red) && !GENERICAS.includes(c.red)) igual.red = c.red;
    else if (igual.red === 'otra') igual.red = c.red;
    igual.operador ||= c.operador;
    igual.direccion ||= c.direccion;
    igual.conectores = [...new Set([...igual.conectores, ...c.conectores])];
    igual.kw = Math.max(igual.kw || 0, c.kw || 0) || null;
    igual.plazas ??= c.plazas;
    igual.pago ??= c.pago;
  }
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const pedirJson = (url, opciones) => fetch(url, opciones).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
const textoError = (motivo) => String((motivo && motivo.message) || motivo);

const cargadoresAntes = leerJson('cargadores.json', null);
const edadCargadores = cargadoresAntes && cargadoresAntes.leido ? (Date.now() - Date.parse(cargadoresAntes.leido)) / 3600000 : Infinity;
const claveOcm = process.env.OPENCHARGEMAP_KEY;
if (edadCargadores < 20) {
  estado.archivos['cargadores.json'] = { ok: true, cargadores: cargadoresAntes.cargadores.length, leido: cargadoresAntes.leido };
} else {
  const leido = new Date().toISOString();
  const [overpass, openCharge] = await Promise.allSettled([
    pedirJson(OVERPASS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'visor-medellin-web (relevo de datos; github.com/MiguelHernandez201/visor-medellin-web)',
      },
      body: `data=${encodeURIComponent(CONSULTA)}`,
      signal: AbortSignal.timeout(70000),
    }),
    claveOcm
      ? pedirJson(`${OCM}?output=json&compact=true&verbose=false&maxresults=1000&boundingbox=${encodeURIComponent(OCM_CAJA)}`, {
          headers: { 'X-API-Key': claveOcm, 'User-Agent': 'visor-medellin-web (relevo de datos)' },
          signal: AbortSignal.timeout(40000),
        })
      : Promise.reject(new Error('sin clave OPENCHARGEMAP_KEY')),
  ]);

  // Lo último bueno de cada fuente se guarda aparte: si una falla, se combina la otra con
  // lo que la que falló trajo la vez anterior.
  const fuentes = { ...((cargadoresAntes && cargadoresAntes.fuentes) || {}) };
  const errores = {};
  let moteles = null;
  if (overpass.status === 'fulfilled') {
    const osm = leerCargadores(overpass.value);
    moteles = leerMoteles(overpass.value);
    if (osm.length >= 5) fuentes.osm = { leido, lista: osm };
    else errores.osm = `respuesta rara (${osm.length} cargadores)`;
  } else errores.osm = textoError(overpass.reason);
  if (openCharge.status === 'fulfilled') {
    const ocm = leerOpenChargeMap(openCharge.value);
    if (ocm.length >= 3) fuentes.ocm = { leido, lista: ocm };
    else errores.ocm = `respuesta rara (${ocm.length} cargadores)`;
  } else errores.ocm = textoError(openCharge.reason);

  // Una lista vieja sin `fuentes` (de antes de Open Charge Map) vale como la de OpenStreetMap
  if (!fuentes.osm && cargadoresAntes && !cargadoresAntes.fuentes) fuentes.osm = { leido: cargadoresAntes.leido, lista: cargadoresAntes.cargadores || [] };
  const cargadores = combinarCargadores((fuentes.osm && fuentes.osm.lista) || [], (fuentes.ocm && fuentes.ocm.lista) || []);
  const fuente = ['© Colaboradores de OpenStreetMap (ODbL)', fuentes.ocm && 'Open Charge Map (CC BY 4.0)'].filter(Boolean).join(' · ');
  // `leido` marca la consulta: aunque una fuente falle, no se repite hasta mañana
  if (cargadores.length >= 5) guardar('cargadores.json', { leido, fuente, cargadores, fuentes });
  else if (cargadoresAntes) guardar('cargadores.json', { ...cargadoresAntes, leido });
  estado.archivos['cargadores.json'] = {
    ok: cargadores.length >= 5 && !Object.keys(errores).length,
    cargadores: cargadores.length,
    openstreetmap: fuentes.osm ? fuentes.osm.lista.length : 0,
    openchargemap: fuentes.ocm ? fuentes.ocm.lista.length : 0,
    ...(Object.keys(errores).length ? { errores } : {}),
  };
  if (moteles && moteles.length >= 5) {
    guardar('moteles.json', { leido, fuente: '© Colaboradores de OpenStreetMap (ODbL)', moteles });
    estado.archivos['moteles.json'] = { ok: true, moteles: moteles.length };
  } else {
    estado.archivos['moteles.json'] = { ok: false, error: errores.osm || `respuesta rara (${moteles ? moteles.length : 0} moteles)` };
  }
}

for (const [archivo, datos] of Object.entries(respuestas)) guardar(archivo, datos);
guardar('estado.json', estado);

console.log(JSON.stringify(estado, null, 2));
if (fallos === Object.keys(FUENTES).length && !seriesOk) {
  console.error('No se pudo leer ninguna fuente del SIATA');
  process.exit(1);
}
