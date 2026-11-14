// Rutas en carro y búsqueda de lugares, con servicios públicos sobre datos de OpenStreetMap:
// - Lugares: Photon (photon.komoot.io), limitado al Valle de Aburrá y sus alrededores.
// - Rutas: el servidor de demostración de OSRM (router.project-osrm.org). No conoce el tráfico,
//   el pico y placa ni los cierres: los tiempos son con la vía libre.
// Los dos envían CORS y no piden clave; son gratuitos y de uso moderado.

const PHOTON = 'https://photon.komoot.io/api/';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const CAJA = '-75.75,5.95,-75.25,6.55'; // oeste, sur, este, norte
const RAD = Math.PI / 180;

/** Metros entre dos puntos [latitud, longitud]. */
export function metrosEntre(a, b) {
  const x = (b[1] - a[1]) * RAD * Math.cos(((a[0] + b[0]) / 2) * RAD);
  const y = (b[0] - a[0]) * RAD;
  return Math.hypot(x, y) * 6371000;
}

/** Rumbo en grados (0 = norte, 90 = oriente) para ir de `a` a `b`. */
function rumboEntre(a, b) {
  const x = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * RAD);
  return (Math.atan2(x, b[0] - a[0]) / RAD + 360) % 360;
}

const giro = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** "350 m", "1,2 km", "14 km". */
export function textoDistancia(metros) {
  if (metros < 950) return `${Math.max(10, Math.round(metros / 10) * 10)} m`;
  const km = metros / 1000;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

/** "9 min", "1 h 05 min". */
export function textoDuracion(segundos) {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}

// ---------------------------------------------------------------------------
// Lugares
// ---------------------------------------------------------------------------
/**
 * Busca lugares por nombre. `cerca` = [latitud, longitud] para preferir los cercanos.
 * Devuelve [{ nombre, detalle, latitud, longitud }].
 */
export async function buscarLugares(texto, cerca, senal) {
  const parametros = new URLSearchParams({ q: texto, limit: '6', bbox: CAJA });
  if (cerca) {
    parametros.set('lat', cerca[0].toFixed(4));
    parametros.set('lon', cerca[1].toFixed(4));
  }
  const respuesta = await fetch(`${PHOTON}?${parametros}`, { signal: senal });
  if (!respuesta.ok) throw new Error(`Photon ${respuesta.status}`);
  const datos = await respuesta.json();
  const vistos = new Set();
  const lugares = [];
  for (const { geometry, properties: p } of datos.features || []) {
    if (!geometry || geometry.type !== 'Point') continue;
    const calle = [p.street, p.housenumber].filter(Boolean).join(' ');
    const nombre = p.name || calle;
    if (!nombre) continue;
    const zona = [p.district, p.city || p.county].filter((x) => x && x !== nombre);
    const detalle = [p.name ? calle : '', ...zona].filter(Boolean).join(' · ');
    const clave = `${nombre}|${detalle}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lugares.push({ nombre, detalle, latitud: geometry.coordinates[1], longitud: geometry.coordinates[0] });
  }
  return lugares;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------
const GIROS = {
  left: 'gira a la izquierda',
  right: 'gira a la derecha',
  'slight left': 'mantente a la izquierda',
  'slight right': 'mantente a la derecha',
  'sharp left': 'gira cerrado a la izquierda',
  'sharp right': 'gira cerrado a la derecha',
  straight: 'sigue derecho',
  uturn: 'haz un giro en U',
};
const LADOS = { left: ' a la izquierda', 'slight left': ' a la izquierda', 'sharp left': ' a la izquierda', right: ' a la derecha', 'slight right': ' a la derecha', 'sharp right': ' a la derecha' };
const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Indicación en español de un paso de OSRM. */
function instruccion(paso) {
  const { type: tipo, modifier: modo, exit: salida } = paso.maneuver;
  const via = paso.name || (paso.ref ? `la vía ${paso.ref}` : '');
  const en = via ? ` en ${via}` : '';
  const por = via ? ` por ${via}` : '';
  const lado = LADOS[modo] || '';
  const giroTexto = GIROS[modo] || 'continúa';
  const sigue = modo === 'straight' || !GIROS[modo];
  switch (tipo) {
    case 'depart':
      return `Sal${por}`;
    case 'arrive':
      return 'Llegas a tu destino';
    case 'roundabout':
    case 'rotary':
      return salida ? `En la glorieta toma la salida ${salida}${via ? ` hacia ${via}` : ''}` : `Entra a la glorieta${por}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Sal de la glorieta${por}`;
    case 'roundabout turn':
      return `En la glorieta ${giroTexto}${en}`;
    case 'on ramp':
      return `Toma el acceso${lado}${via ? ` hacia ${via}` : ''}`;
    case 'off ramp':
      return `Toma la salida${lado}${via ? ` hacia ${via}` : ''}`;
    case 'merge':
      return `Incorpórate${lado}${por}`;
    case 'fork':
      return `En la bifurcación ${GIROS[modo] && modo !== 'straight' ? giroTexto : 'sigue derecho'}${por}`;
    case 'end of road':
      return `Al final de la vía ${giroTexto}${en}`;
    case 'new name':
      return `Continúa${por}`;
    default:
      return `${mayuscula(giroTexto)}${sigue ? por : en}`;
  }
}

/**
 * Ruta en carro entre dos puntos [latitud, longitud]. Devuelve
 * { puntos: [[lat, lon]], acumulado: [m], metros, segundos, pasos: [{ texto, desde, metros, segundos }] }
 * (`desde` = metros desde el inicio hasta donde se hace la maniobra) o lanza un error.
 */
export async function calcularRuta(origen, destino, senal) {
  const par = `${origen[1].toFixed(6)},${origen[0].toFixed(6)};${destino[1].toFixed(6)},${destino[0].toFixed(6)}`;
  const respuesta = await fetch(`${OSRM}/${par}?overview=false&geometries=geojson&steps=true`, { signal: senal });
  if (!respuesta.ok && respuesta.status !== 400) throw new Error(`OSRM ${respuesta.status}`);
  const datos = await respuesta.json();
  if (datos.code !== 'Ok' || !datos.routes || !datos.routes.length) {
    const error = new Error(datos.code || 'sin ruta');
    error.sinRuta = true;
    throw error;
  }
  const puntos = [];
  const acumulado = [];
  const pasos = [];
  let total = 0;
  for (const tramo of datos.routes[0].legs) {
    for (const paso of tramo.steps) {
      pasos.push({ texto: instruccion(paso), desde: total, metros: paso.distance, segundos: paso.duration });
      for (const [longitud, latitud] of paso.geometry.coordinates) {
        const punto = [latitud, longitud];
        const ultimo = puntos[puntos.length - 1];
        if (ultimo) {
          const d = metrosEntre(ultimo, punto);
          if (d < 0.05) continue; // los pasos repiten el punto donde se unen
          total += d;
        }
        puntos.push(punto);
        acumulado.push(total);
      }
    }
  }
  if (puntos.length < 2) {
    const error = new Error('ruta vacía');
    error.sinRuta = true;
    throw error;
  }
  return { puntos, acumulado, metros: total, segundos: datos.routes[0].duration, pasos };
}

/**
 * Dónde va el carro respecto a la ruta. `posicion` = [latitud, longitud].
 * Devuelve { fuera: metros hasta la ruta, recorrido, restante, segundos (los que faltan),
 *            paso: la siguiente maniobra o null, metrosAlPaso }.
 */
export function seguirRuta(ruta, posicion) {
  const { puntos, acumulado, pasos } = ruta;
  const escala = Math.cos(posicion[0] * RAD);
  const px = posicion[1] * escala;
  const py = posicion[0];
  let mejor = Infinity;
  let recorrido = 0;
  for (let i = 0; i < puntos.length - 1; i++) {
    const ax = puntos[i][1] * escala;
    const ay = puntos[i][0];
    const bx = puntos[i + 1][1] * escala;
    const by = puntos[i + 1][0];
    const dx = bx - ax;
    const dy = by - ay;
    const largo = dx * dx + dy * dy;
    const t = largo ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / largo)) : 0;
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < mejor) {
      mejor = d;
      recorrido = acumulado[i] + (acumulado[i + 1] - acumulado[i]) * t;
    }
  }
  const fuera = mejor * RAD * 6371000;
  const restante = Math.max(0, ruta.metros - recorrido);
  // siguiente maniobra: la primera que queda más adelante (con 15 m de margen)
  const indice = pasos.findIndex((paso) => paso.desde > recorrido + 15);
  const paso = indice < 0 ? pasos[pasos.length - 1] : pasos[indice];
  const metrosAlPaso = Math.max(0, (indice < 0 ? ruta.metros : paso.desde) - recorrido);
  // tiempo que falta: lo que queda del paso actual más los siguientes
  const actual = (indice < 0 ? pasos.length : indice) - 1;
  let segundos = 0;
  pasos.forEach((p, i) => {
    if (i > actual) segundos += p.segundos;
    else if (i === actual && p.metros > 0) segundos += p.segundos * Math.min(1, Math.max(0, (p.desde + p.metros - recorrido) / p.metros));
  });
  return { fuera, recorrido, restante, segundos, paso, metrosAlPaso };
}

/**
 * Fotomultas que la ruta pasa en el sentido que vigilan (a menos de 45 m del trazado).
 * `camaras` = [{ latitud, longitud, sentido, … }]. Devuelve las que tocan, en orden de recorrido.
 */
export function fotomultasEnRuta(ruta, camaras) {
  const RUMBOS = { 'sur a norte': 0, 'occidente a oriente': 90, 'norte a sur': 180, 'oriente a occidente': 270 };
  const { puntos, acumulado } = ruta;
  const halladas = [];
  for (const camara of camaras) {
    const lugar = [camara.latitud, camara.longitud];
    const escala = Math.cos(lugar[0] * RAD);
    let mejor = null;
    for (let i = 0; i < puntos.length - 1; i++) {
      // descarte rápido: tramos a más de ~500 m
      if (Math.abs(puntos[i][0] - lugar[0]) > 0.005 || Math.abs(puntos[i][1] - lugar[1]) > 0.005) continue;
      const ax = puntos[i][1] * escala;
      const ay = puntos[i][0];
      const dx = puntos[i + 1][1] * escala - ax;
      const dy = puntos[i + 1][0] - ay;
      const largo = dx * dx + dy * dy;
      const t = largo ? Math.min(1, Math.max(0, ((lugar[1] * escala - ax) * dx + (lugar[0] - ay) * dy) / largo)) : 0;
      const d = Math.hypot(lugar[1] * escala - (ax + dx * t), lugar[0] - (ay + dy * t)) * RAD * 6371000;
      if (d > 45 || giro(rumboEntre(puntos[i], puntos[i + 1]), RUMBOS[camara.sentido]) > 75) continue;
      if (!mejor || d < mejor.d) mejor = { d, desde: acumulado[i] };
    }
    if (mejor) halladas.push({ camara, desde: mejor.desde });
  }
  return halladas.sort((a, b) => a.desde - b.desde);
}
