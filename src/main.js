// Visor Medellín (PWA, versión web del visor para LG webOS TV): cámaras de la ciudad en
// cuatro secciones: tránsito del SIMM,
// cámaras del SIATA (deprimidos, panorámicas y cielo), ríos del SIATA y un mapa con
// todas. Todas son fotos fijas que se renuevan cada minuto. La app las vuelve a pedir
// en cuanto se renuevan (ver fuente.js), y solo las que están en pantalla. Encima se
// marca la lluvia que ve el radar del SIATA en cada cámara (ver lluvia.js), el nivel de
// los ríos (niveles.js) y, del geoportal del SIATA, la lluvia de los pluviómetros
// (pluvios.js), el clima, la calidad del aire y las alertas (clima.js).
import './visor.css';
import { montarEscenario, puntoEnEscenario } from './core/escenario.js';
import { leerTecla, esAtrasDelPc, activacionPermitida } from './core/teclas.js';
import { chip } from './core/chips.js';
import { descargar, descubrir } from './fuente.js';
import { CAMARAS as CAMARAS_SIMM, nombreDe, direccionDe, coordenadasDe } from './nombres.js';
import { registrarServiceWorker, prepararInstalacion } from './pwa.js';
import { CAMARAS_SIATA, esSiata, camaraSiata, idsSiata } from './siata.js';
import {
  NIVELES,
  lluviaEn,
  imagenRadar,
  revisarRadar,
  alActualizarRadar,
  cuadrosRadar,
  revisarAnimacion,
  alActualizarAnimacion,
} from './lluvia.js';
import { RIESGOS, estacion, revisarNiveles, alActualizarNiveles, serieNivel } from './niveles.js';
import { pluviometros, pluviometroCercano, pluviometrosCerca, revisarPluvios, alActualizarPluvios } from './pluvios.js';
import {
  meteoCercana,
  temperaturaCentro,
  revisarMeteo,
  alActualizarMeteo,
  aireCercano,
  revisarAire,
  alActualizarAire,
  alertasVigentes,
  revisarAlertas,
  alActualizarAlertas,
} from './clima.js';
import { decimal } from './geoportal.js';
import { dibujarGraficaNivel } from './grafica.js';
import { crearMapa, ZOOM_MIN, ZOOM_MAX } from './mapa.js';

const COLUMNAS = 4;
const FILAS = 3;
const POR_PAGINA = COLUMNAS * FILAS;
const RECORRIDO_MS = 15 * 1000; // cuánto se ve cada cámara en el recorrido
const CUADRO_MS = 450; // duración de cada cuadro de la animación del radar
const PAUSA_ULTIMO_CUADRO = 6; // el cuadro más reciente se queda 6 cuadros más

// Capas de lluvia del mapa; el botón azul pasa de una a otra.
const MODOS_LLUVIA = {
  radar: 'Lluvia ahora · radar y pluviómetros',
  calor: 'Lluvia medida · pluviómetros, últimos 15 min',
  animacion: 'Radar · últimas 3 horas',
};
const PRECARGA_MS = 4 * 1000; // antes de pasar a la siguiente, se pide su imagen
const ESCANEO_VALIDO_MS = 7 * 24 * 3600 * 1000; // la lista se vuelve a buscar cada semana

const leyenda = (pares) =>
  pares
    .map(
      ([tecla, texto]) =>
        `<span class="control" data-control="${tecla}">${chip(tecla)}<span class="control-texto">${texto}</span></span>`,
    )
    .join('');

const SECCIONES = [
  ['simm', 'SIMM'],
  ['siata', 'SIATA'],
  ['rios', 'Ríos'],
  ['mapa', 'Mapa'],
];

const escenario = document.getElementById('escenario');
montarEscenario(escenario);
escenario.innerHTML = `
  <header class="cabecera">
    <h1>Visor Medellín</h1>
    <nav class="pestanas">
      ${SECCIONES.map(([id, titulo]) => `<span class="pestana" data-seccion="${id}">${titulo}</span>`).join('')}
    </nav>
    <span class="cabecera-estado"></span>
    <span class="cabecera-alerta" hidden><span class="cabecera-alerta-texto"></span></span>
    <span class="cabecera-clima"></span>
    <span class="cabecera-hora"></span>
  </header>
  <main class="grilla"></main>
  <section class="vista-mapa" hidden>
    <div class="mapa"></div>
    <aside class="mapa-panel">
      <div class="panel-foto">
        <img class="panel-imagen" alt="">
        <span class="panel-aviso"></span>
      </div>
      <h2 class="panel-nombre"></h2>
      <p class="panel-detalle"></p>
      <p class="panel-lluvia"></p>
      <p class="panel-nivel"></p>
      <p class="panel-clima"></p>
      <p class="panel-edad"></p>
      <ul class="panel-convenciones">
        <li><span class="punto punto-simm"></span>SIMM · tránsito</li>
        <li><span class="punto punto-siata"></span>SIATA</li>
        <li><span class="punto punto-rios"></span>Ríos</li>
        <li><span class="punto punto-simm lluvia-2"></span>Llueve en la cámara</li>
        <li><span class="punto punto-rios nivel-3"></span>Río en alerta</li>
        <li><span class="gota nivel-2"></span>Pluviómetro: llueve</li>
        <li><span class="punto punto-simm favorita"></span>Favorita</li>
      </ul>
    </aside>
  </section>
  <footer class="controles">
    ${leyenda([
      ['cruz', 'Moverse'],
      ['arriba', 'Sección'],
      ['numeros', 'Sección'],
      ['ok', 'Ver'],
      ['canal', 'Página'],
      ['rojo', 'Favorita'],
      ['verde', 'Solo favoritas'],
      ['amarillo', 'Recorrido'],
      ['azul', 'Buscar cámaras'],
    ])}
    <button class="control control-instalar" type="button" hidden>⬇ Instalar app</button>
  </footer>
  <section class="pantalla" hidden>
    <img class="pantalla-imagen" alt="">
    <p class="pantalla-aviso"></p>
    <div class="pantalla-nivel" hidden><canvas class="pantalla-grafica" width="640" height="300"></canvas></div>
    <div class="pantalla-info">
      <h2 class="pantalla-nombre"></h2>
      <span class="pantalla-edad"></span>
    </div>
    <div class="pantalla-recorrido" hidden><div class="pantalla-barra"></div></div>
    <footer class="controles controles-pantalla">
      ${leyenda([
        ['flechas', 'Anterior / siguiente'],
        ['rojo', 'Favorita'],
        ['amarillo', 'Recorrido'],
        ['atras', 'Volver'],
      ])}
    </footer>
  </section>
  <div class="capa" hidden></div>`;

const $ = (selector) => escenario.querySelector(selector);
const grillaEl = $('.grilla');
const estadoEl = $('.cabecera-estado');
const horaEl = $('.cabecera-hora');
const pantallaEl = $('.pantalla');
const pantallaImagen = $('.pantalla-imagen');
const pantallaAviso = $('.pantalla-aviso');
const pantallaNombre = $('.pantalla-nombre');
const pantallaEdad = $('.pantalla-edad');
const recorridoEl = $('.pantalla-recorrido');
const barraEl = $('.pantalla-barra');
const capaEl = $('.capa');
const pestanasEl = $('.pestanas');
const leyendaBuscar = $('.controles [data-control="azul"]');
const leyendaBuscarTexto = $('.controles [data-control="azul"] .control-texto');
const alertaEl = $('.cabecera-alerta');
const alertaTextoEl = $('.cabecera-alerta-texto');
const climaEl = $('.cabecera-clima');
const pantallaNivelEl = $('.pantalla-nivel');
const pantallaGrafica = $('.pantalla-grafica');
const leyendaArriba = $('.controles [data-control="arriba"]');
const leyendaNumeros = $('.controles [data-control="numeros"]');
const leyendaCanal = $('.controles [data-control="canal"] .control-texto');
const vistaMapaEl = $('.vista-mapa');
const mapaEl = $('.mapa');
const mapa = crearMapa(mapaEl);
const panelImagen = $('.panel-imagen');
const panelAviso = $('.panel-aviso');
const panelNombre = $('.panel-nombre');
const panelDetalle = $('.panel-detalle');
const panelLluvia = $('.panel-lluvia');
const panelNivel = $('.panel-nivel');
const panelClima = $('.panel-clima');
const panelEdad = $('.panel-edad');

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------------------
// Preferencias (se recuerdan en este navegador)
// ---------------------------------------------------------------------------
function leerPreferencia(clave, porDefecto) {
  try {
    const valor = localStorage.getItem(`visor.${clave}`);
    return valor == null ? porDefecto : JSON.parse(valor);
  } catch {
    return porDefecto;
  }
}
function guardarPreferencia(clave, valor) {
  try {
    localStorage.setItem(`visor.${clave}`, JSON.stringify(valor));
  } catch {
    // sin almacenamiento: no se recuerda, pero funciona igual
  }
}

// { numeros: [6, 7, …], fecha }. En la web se parte de las 80 cámaras conocidas (nombres.js),
// así no hay que buscarlas al abrir; el botón azul las vuelve a buscar si hiciera falta.
let camaras = leerPreferencia('lista', null) || {
  numeros: Object.keys(CAMARAS_SIMM).map(Number).sort((a, b) => a - b),
  fecha: Date.now(),
};
const favoritas = new Set(leerPreferencia('favoritas', []));
let soloFavoritas = leerPreferencia('soloFavoritas', false);
let seccion = leerPreferencia('seccion', 'simm'); // 'simm' | 'siata' | 'rios' | 'mapa'
if (!SECCIONES.some(([id]) => id === seccion)) seccion = 'simm';
let zoomMapa = leerPreferencia('zoomMapa', 13);
let modoLluvia = leerPreferencia('modoLluvia', 'radar'); // una de MODOS_LLUVIA
if (!(modoLluvia in MODOS_LLUVIA)) modoLluvia = 'radar';

const nombreCamara = (id) => (esSiata(id) ? camaraSiata(id).nombre : nombreDe(id));
const detalleCamara = (id) => (esSiata(id) ? camaraSiata(id).detalle : direccionDe(id));
const coordenadasCamara = (id) => (esSiata(id) ? camaraSiata(id).coordenadas : coordenadasDe(id));
/** 'simm', 'siata' o 'rios': de qué fuente es la cámara (para el color en el mapa). */
const fuenteDe = (id) => (esSiata(id) ? camaraSiata(id).seccion : 'simm');

// Radio en el que los pluviómetros confirman o desmienten lo que dice el radar.
const RADIO_PLUVIOS_KM = 2.5;

/**
 * Lluvia en una cámara juntando el radar y los pluviómetros cercanos:
 * { nivel (0 a 4), fuente: texto de dónde sale, radar: nivel según el radar }.
 * - Si hay pluviómetros a menos de 2,5 km, mandan ellos (miden lo que cae y llegan más
 *   rápido que la imagen del radar): si alguno mide lluvia, llueve (con el nivel más alto de
 *   los dos); si todos están secos, no llueve aunque el radar marque algo.
 * - Si no hay pluviómetros cerca (o aún no han llegado), vale lo del radar.
 */
function lluviaDe(id) {
  const coordenadas = coordenadasCamara(id);
  if (!coordenadas) return { nivel: 0, fuente: '', radar: 0 };
  const radar = lluviaEn(coordenadas[0], coordenadas[1]) || 0;
  const cerca = pluviometrosCerca(coordenadas[0], coordenadas[1], RADIO_PLUVIOS_KM);
  if (!cerca || !cerca.length) return { nivel: radar, fuente: radar ? 'según el radar' : '', radar };
  const medido = Math.max(0, ...cerca.map((p) => p.nivel));
  if (!medido) return { nivel: 0, fuente: '', radar };
  return { nivel: Math.max(medido, radar), fuente: radar ? 'según radar y pluviómetros' : 'según los pluviómetros', radar };
}

/** Nivel de lluvia (0 a 4) en la cámara, o 0 si no se sabe. */
const lluviaCamara = (id) => lluviaDe(id).nivel;

/** Nivel del agua en la estación del SIATA de una cámara de río, o null si no tiene o no se sabe. */
function nivelCamara(id) {
  const camara = esSiata(id) && camaraSiata(id);
  return (camara && camara.estacion && estacion(camara.estacion)) || null;
}

/** "N2 · precaución · 3,78 m" (sin los metros si no hay medida). */
function textoNivel(nivel) {
  const metros = nivel.metros == null ? '' : ` · ${nivel.metros.toFixed(2).replace('.', ',')} m`;
  return `${RIESGOS[nivel.riesgo]}${nivel.riesgo ? metros : ''}`;
}

/** Hay alerta en el río desde N2 (precaución). */
const enAlerta = (id) => {
  const nivel = nivelCamara(id);
  return Boolean(nivel && nivel.riesgo >= 2);
};

/** Todas las cámaras de una sección. En el mapa, las que tienen coordenadas, de norte a sur. */
function camarasDeSeccion(cual) {
  const simm = camaras ? camaras.numeros : [];
  if (cual === 'simm') return simm;
  if (cual === 'siata' || cual === 'rios') return idsSiata(cual);
  return [...simm, ...CAMARAS_SIATA.map((camara) => camara.id)]
    .filter((id) => coordenadasCamara(id))
    .sort((a, b) => coordenadasCamara(b)[0] - coordenadasCamara(a)[0]);
}

/** Cámaras de la sección actual (números del SIMM o "siata:…"), según el filtro de favoritas. */
function lista() {
  const todas = camarasDeSeccion(seccion);
  return soloFavoritas ? todas.filter((id) => favoritas.has(id)) : todas;
}

// ---------------------------------------------------------------------------
// Imágenes: una por cámara, renovada cuando la fuente la cambia, mientras esté a la vista
// ---------------------------------------------------------------------------
const estados = new Map(); // cámara → { src, tomada, validador, proxima, cargando, fallos }

function estadoDe(numero) {
  let estado = estados.get(numero);
  if (!estado) {
    estado = { src: null, tomada: 0, validador: null, proxima: 0, cargando: false, fallos: 0 };
    estados.set(numero, estado);
  }
  return estado;
}

function cargar(numero) {
  const estado = estadoDe(numero);
  if (estado.cargando) return;
  estado.cargando = true;
  // Se descarga aparte y luego se cambia: la imagen anterior sigue a la vista
  // hasta que la nueva está lista (sin parpadeo).
  descargar(numero, estado).then(
    (resultado) => {
      estado.cargando = false;
      estado.fallos = 0;
      estado.proxima = resultado.proxima;
      if (resultado.sinCambio) return;
      const anterior = estado.src;
      estado.src = resultado.url;
      estado.tomada = resultado.tomada;
      estado.validador = resultado.validador || null;
      pintarCamara(numero);
      // La foto vieja (si es un blob en memoria) se libera cuando ya no está en pantalla.
      if (anterior && anterior.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(anterior), 2000);
    },
    () => {
      estado.cargando = false;
      estado.fallos += 1;
      // Se reintenta antes: 15 s, 30 s… hasta 1 min.
      estado.proxima = Date.now() + Math.min(60000, 15000 * estado.fallos);
      pintarCamara(numero);
    },
  );
}

const estaVencida = (estado, ahora) => !estado.cargando && ahora >= estado.proxima;

function textoEdad(estado, ahora) {
  if (!estado || !estado.tomada) return '';
  const s = Math.max(0, Math.round((ahora - estado.tomada) / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.floor(s / 60)} min`;
}

function textoAviso(estado) {
  if (estado && estado.src) return '';
  return estado && estado.fallos ? 'Sin imagen' : 'Cargando…';
}

// ---------------------------------------------------------------------------
// Vistas: grilla, pantalla completa y búsqueda de cámaras
// ---------------------------------------------------------------------------
let vista = 'grilla'; // 'grilla' | 'pantalla' | 'escaneo'
let foco = 0; // índice en lista() de la celda enfocada
let enPestanas = false; // el foco está en las pestañas de sección (encima de la grilla)
const focoPorSeccion = {}; // se recuerda la celda enfocada al cambiar de sección
let firmaPintada = '';
let actual = 0; // índice en lista() de la cámara en pantalla completa
let recorrido = null; // { inicio } mientras el recorrido automático está activo

function numerosDePagina() {
  const l = lista();
  if (seccion === 'mapa') return l.length ? [l[Math.min(foco, l.length - 1)]] : []; // la del panel
  const pagina = Math.floor(foco / POR_PAGINA);
  return l.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
}

function mensajeVacio() {
  if (seccion !== 'simm') return `No hay favoritas en esta sección. Marca cámaras con ${chip('rojo')} o pulsa ${chip('verde')} para verlas todas.`;
  if (!camaras) return `Aún no hay cámaras. Pulsa ${chip('azul')} para buscarlas.`;
  if (!camaras.numeros.length) return `No se encontró ninguna cámara. Pulsa ${chip('azul')} para buscar de nuevo.`;
  return `No hay favoritas. Marca cámaras con ${chip('rojo')} o pulsa ${chip('verde')} para verlas todas.`;
}

/** Celdas a la vista: cámara → elemento. */
let celdas = new Map();

function pintarGrilla() {
  const l = lista();
  pintarPestanas();
  const enMapa = seccion === 'mapa';
  grillaEl.hidden = enMapa;
  vistaMapaEl.hidden = !enMapa;
  if (enMapa) {
    pintarMapa();
    pintarEstado();
    return;
  }
  if (!l.length) {
    firmaPintada = '';
    celdas = new Map();
    grillaEl.innerHTML = `<p class="grilla-vacia">${mensajeVacio()}</p>`;
    pintarEstado();
    return;
  }
  foco = Math.max(0, Math.min(l.length - 1, foco));
  const numeros = numerosDePagina();
  const firma = `${seccion}:${numeros.join(',')}`;
  if (firma !== firmaPintada) {
    firmaPintada = firma;
    grillaEl.innerHTML = numeros
      .map(
        (n, i) => `
        <div class="celda" data-i="${i}">
          <img class="celda-imagen" alt="">
          <span class="celda-aviso"></span>
          <div class="celda-marcas">
            <span class="celda-lluvia"></span>
            <span class="celda-nivel"></span>
          </div>
          <span class="celda-estrella">★</span>
          <div class="celda-pie">
            <span class="celda-nombre">${escapar(nombreCamara(n))}</span>
            <span class="celda-edad"></span>
          </div>
        </div>`,
      )
      .join('');
    celdas = new Map(numeros.map((n, i) => [n, grillaEl.children[i]]));
    numeros.forEach(pintarCamara);
  }
  const enfocada = enPestanas ? null : l[foco];
  celdas.forEach((celda, id) => celda.classList.toggle('enfocada', id === enfocada));
  pintarEstado();
}

function pintarPestanas() {
  pestanasEl.querySelectorAll('.pestana').forEach((pestana) => {
    const activa = pestana.dataset.seccion === seccion;
    pestana.classList.toggle('activa', activa);
    pestana.classList.toggle('enfocada', activa && enPestanas);
  });
  // Azul: en el SIMM busca cámaras; en el mapa cambia la capa de lluvia.
  leyendaBuscar.hidden = seccion !== 'simm' && seccion !== 'mapa';
  leyendaBuscarTexto.textContent = seccion === 'mapa' ? 'Capa de lluvia' : 'Buscar cámaras';
  leyendaArriba.hidden = seccion === 'mapa'; // en el mapa ↑ se mueve entre cámaras
  leyendaNumeros.hidden = seccion !== 'mapa';
  leyendaCanal.textContent = seccion === 'mapa' ? 'Zoom' : 'Página';
}

// ---------------------------------------------------------------------------
// Mapa
// ---------------------------------------------------------------------------
// Animación del radar: índice del cuadro que se ve (puede pasar del último para la pausa).
let cuadroAnimacion = 0;

/** Capas de lluvia del mapa según el modo elegido con el botón azul. */
function capasLluvia() {
  const pluvios = pluviometros();
  if (modoLluvia === 'calor') {
    return { calor: pluvios, gotas: pluvios, titulo: MODOS_LLUVIA.calor };
  }
  if (modoLluvia === 'animacion') {
    const cuadros = cuadrosRadar();
    if (!cuadros.length) return { radar: imagenRadar(), titulo: `${MODOS_LLUVIA.animacion} · cargando…` };
    const cuadro = cuadros[Math.min(cuadroAnimacion, cuadros.length - 1)];
    return { radar: cuadro, titulo: `${MODOS_LLUVIA.animacion} · ${cuadro.hora}` };
  }
  return { radar: imagenRadar(), gotas: pluvios, titulo: MODOS_LLUVIA.radar };
}

function cambiarModoLluvia() {
  const modos = Object.keys(MODOS_LLUVIA);
  modoLluvia = modos[(modos.indexOf(modoLluvia) + 1) % modos.length];
  guardarPreferencia('modoLluvia', modoLluvia);
  cuadroAnimacion = 0;
  pintarMapa();
}

/** Avanza la animación del radar (si se está viendo). */
function animarRadar() {
  if (document.hidden || vista !== 'grilla' || seccion !== 'mapa' || modoLluvia !== 'animacion') return;
  const total = cuadrosRadar().length;
  if (!total) return;
  cuadroAnimacion = (cuadroAnimacion + 1) % (total + PAUSA_ULTIMO_CUADRO);
  mapa.pintarLluvia(capasLluvia());
}

function pintarMapa() {
  const l = lista();
  if (!l.length) {
    mapa.pintar([], null, zoomMapa, capasLluvia());
    panelImagen.hidden = true;
    panelAviso.textContent = '';
    panelNombre.innerHTML = mensajeVacio();
    panelDetalle.textContent = '';
    panelLluvia.textContent = '';
    panelNivel.textContent = '';
    panelClima.textContent = '';
    panelEdad.textContent = '';
    return;
  }
  foco = Math.max(0, Math.min(l.length - 1, foco));
  const elegida = l[foco];
  const puntos = l.map((id) => {
    const [latitud, longitud] = coordenadasCamara(id);
    const clases = [`punto-${fuenteDe(id)}`, `lluvia-${lluviaCamara(id)}`];
    if (enAlerta(id)) clases.push(`nivel-${nivelCamara(id).riesgo}`);
    if (id === elegida) clases.push(enPestanas ? 'elegido-tenue' : 'elegido');
    if (favoritas.has(id)) clases.push('favorita');
    return { id, latitud, longitud, clase: clases.join(' '), titulo: id === elegida ? nombreCamara(id) : '' };
  });
  mapa.pintar(puntos, elegida, zoomMapa, capasLluvia());
  pintarPanel(elegida);
}

/** "19 °C · 98 % · viento 10 km/h ENE · aire aceptable" cerca de un punto (HTML). */
function textoClima(coordenadas) {
  if (!coordenadas) return '';
  const partes = [];
  const meteo = meteoCercana(coordenadas[0], coordenadas[1]);
  if (meteo) {
    partes.push(`${Math.round(meteo.temperatura)} °C`);
    if (meteo.humedad != null) partes.push(`humedad ${Math.round(meteo.humedad)} %`);
    if (meteo.viento != null) partes.push(`viento ${Math.round(meteo.viento)} km/h ${escapar(meteo.direccion)}`.trim());
  }
  const aire = aireCercano(coordenadas[0], coordenadas[1]);
  if (aire) {
    const punto = aire.color ? `<span class="panel-aire" style="background:${aire.color}"></span>` : '';
    partes.push(`${punto}aire ${escapar(aire.categoria)} (ICA ${Math.round(aire.ica)})`);
  }
  return partes.join(' · ');
}

/** Temperatura del centro y alertas vigentes del SIATA, en la cabecera. */
function pintarCabeceraClima() {
  const temperatura = temperaturaCentro();
  climaEl.textContent = temperatura == null ? '' : `${Math.round(temperatura)} °C`;
  const alertas = alertasVigentes();
  alertaEl.hidden = !alertas.length;
  estadoEl.hidden = alertas.length > 0; // la alerta ocupa el lugar del estado
  const texto = alertas.map((a) => `⚠ ${[a.titulo, a.texto].filter(Boolean).join(': ')}`).join('   ·   ');
  if (alertaTextoEl.textContent !== texto) alertaTextoEl.textContent = texto;
}

/** Panel a la derecha del mapa con la foto de la cámara elegida. */
function pintarPanel(id) {
  const estado = estados.get(id);
  if (estado && estado.src) {
    if (panelImagen.getAttribute('src') !== estado.src) panelImagen.src = estado.src;
    panelImagen.hidden = false;
  } else {
    panelImagen.hidden = true;
  }
  panelAviso.textContent = textoAviso(estado);
  panelNombre.textContent = `${favoritas.has(id) ? '★ ' : ''}${nombreCamara(id)}`;
  panelDetalle.textContent = detalleCamara(id);
  const lluvia = lluviaDe(id);
  const nivel = lluvia.nivel;
  const coordenadas = coordenadasCamara(id);
  const pluvio = coordenadas ? pluviometroCercano(coordenadas[0], coordenadas[1]) : null;
  let radarTexto = '';
  if (nivel) radarTexto = `${NIVELES[nivel]} ${lluvia.fuente}`;
  else if (lluvia.radar) radarTexto = `Sin lluvia: el radar marca ${NIVELES[lluvia.radar].toLowerCase()}, pero los pluviómetros cercanos están secos`;
  else if (imagenRadar() || pluvio) radarTexto = 'Sin lluvia';
  const pluvioTexto = pluvio
    ? `Pluviómetro a ${decimal(pluvio.km)} km: ${pluvio.lloviendo ? `llueve, ${decimal(pluvio.mm)} mm en 15 min` : 'no llueve'}`
    : '';
  panelLluvia.innerHTML = `${escapar(radarTexto)}${pluvioTexto ? `<span class="panel-detalle-lluvia">${escapar(pluvioTexto)}</span>` : ''}`;
  panelLluvia.className = `panel-lluvia lluvia-${Math.max(nivel, pluvio ? pluvio.nivel : 0)}`;
  panelClima.innerHTML = textoClima(coordenadas);
  const agua = nivelCamara(id);
  panelNivel.innerHTML = agua
    ? `Río: ${escapar(textoNivel(agua))}<span class="panel-estacion">Estación ${escapar(agua.codigo)} · ${escapar(agua.nombre)}${agua.hora ? ` · ${escapar(agua.hora)}` : ''}${
        agua.siguiente == null ? '' : ` · N${agua.riesgo + 1} desde ${agua.siguiente.toFixed(2).replace('.', ',')} m`
      }</span>`
    : '';
  panelNivel.className = `panel-nivel nivel-${agua ? agua.riesgo : 0}`;
  const edad = textoEdad(estado, Date.now());
  panelEdad.textContent = edad ? `Foto de ${edad}` : '';
}

function cambiarZoom(delta) {
  const nuevo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomMapa + delta));
  if (nuevo === zoomMapa) return;
  zoomMapa = nuevo;
  guardarPreferencia('zoomMapa', zoomMapa);
  pintarMapa();
}

/** Teclas propias del mapa; devuelve true si la tecla se usó. */
function teclaEnMapa(nombre) {
  const l = lista();
  if (nombre === 'paginaAnterior' || nombre === 'paginaSiguiente') {
    cambiarZoom(nombre === 'paginaAnterior' ? 1 : -1);
    return true;
  }
  if (!['izquierda', 'derecha', 'arriba', 'abajo'].includes(nombre)) return false;
  const otro = l.length ? mapa.vecino(l[foco], nombre) : null;
  if (otro != null) foco = l.indexOf(otro);
  else if (nombre === 'arriba') enPestanas = true; // más arriba no hay cámaras: a las pestañas
  pintarGrilla();
  return true;
}

function pintarEstado() {
  const l = lista();
  const paginas = Math.max(1, Math.ceil(l.length / POR_PAGINA));
  const pagina = Math.floor(foco / POR_PAGINA) + 1;
  const partes = [];
  if (l.length) partes.push(`${l.length} ${l.length === 1 ? 'cámara' : 'cámaras'}`);
  if (l.length && seccion !== 'mapa') partes.push(`pág. ${pagina}/${paginas}`);
  if (soloFavoritas) partes.push('favoritas');
  const conLluvia = l.filter((id) => lluviaCamara(id) > 0).length;
  if (conLluvia) partes.push(`lluvia en ${conLluvia}`);
  const conAlerta = l.filter(enAlerta).length;
  if (conAlerta) partes.push(`${conAlerta} ${conAlerta === 1 ? 'río en alerta' : 'ríos en alerta'}`);
  estadoEl.textContent = partes.join(' · ');
}

/** Refleja en pantalla el estado de una cámara (si está a la vista). */
function pintarCamara(numero) {
  const estado = estados.get(numero);
  const ahora = Date.now();
  const celda = celdas.get(numero);
  if (celda) {
    const imagen = celda.querySelector('.celda-imagen');
    if (estado && estado.src && imagen.getAttribute('src') !== estado.src) imagen.src = estado.src;
    celda.classList.toggle('favorita', favoritas.has(numero));
    celda.classList.toggle('con-fallos', Boolean(estado && estado.fallos));
    celda.querySelector('.celda-aviso').textContent = textoAviso(estado);
    celda.querySelector('.celda-edad').textContent = textoEdad(estado, ahora);
    const nivel = lluviaCamara(numero);
    const lluvia = celda.querySelector('.celda-lluvia');
    lluvia.textContent = NIVELES[nivel];
    lluvia.className = `celda-lluvia lluvia-${nivel}`;
    const agua = nivelCamara(numero);
    const marcaNivel = celda.querySelector('.celda-nivel');
    marcaNivel.textContent = agua ? textoNivel(agua) : '';
    marcaNivel.className = `celda-nivel${agua ? ` nivel-${agua.riesgo}` : ''}`;
  }
  if (vista === 'grilla' && seccion === 'mapa' && lista()[foco] === numero) pintarPanel(numero);
  if (vista === 'pantalla' && lista()[actual] === numero) {
    if (estado && estado.src) {
      if (pantallaImagen.getAttribute('src') !== estado.src) pantallaImagen.src = estado.src;
      pantallaImagen.hidden = false;
    } else {
      pantallaImagen.hidden = true;
    }
    pantallaAviso.textContent = textoAviso(estado);
    pantallaNombre.textContent = `${favoritas.has(numero) ? '★ ' : ''}${nombreCamara(numero)}`;
    const edad = textoEdad(estado, ahora);
    const fallo = estado && estado.src && estado.fallos ? ' · no se pudo renovar' : '';
    const direccion = detalleCamara(numero);
    const datosLluvia = lluviaDe(numero);
    const lluvia = datosLluvia.nivel ? ` · ${NIVELES[datosLluvia.nivel].toLowerCase()} ${datosLluvia.fuente}` : '';
    const agua = nivelCamara(numero);
    const rio = agua ? ` · río ${textoNivel(agua)}` : '';
    pintarGraficaPantalla(numero);
    pantallaEdad.textContent = `${direccion ? `${direccion} · ` : ''}${actual + 1} de ${lista().length}${edad ? ` · foto de ${edad}` : ''}${lluvia}${rio}${fallo}`;
  }
}

/** Gráfica de las últimas 3 h del nivel del río, en pantalla completa (cámaras con estación). */
function pintarGraficaPantalla(id) {
  const camara = esSiata(id) && camaraSiata(id);
  const serie = camara && camara.estacion ? serieNivel(camara.estacion, () => {
    if (vista === 'pantalla' && lista()[actual] === id) pintarGraficaPantalla(id);
  }) : null;
  pantallaNivelEl.hidden = !serie;
  if (serie) dibujarGraficaNivel(pantallaGrafica, serie, estacion(camara.estacion));
}

function abrirPantalla(indice, conRecorrido = false) {
  const l = lista();
  if (!l.length || vista !== 'grilla') return;
  history.pushState({ vista: 'pantalla' }, '');
  vista = 'pantalla';
  actual = Math.max(0, Math.min(l.length - 1, indice));
  pantallaEl.hidden = false;
  pantallaImagen.removeAttribute('src');
  ponerRecorrido(conRecorrido);
  mostrarActual();
}

function cerrarPantalla() {
  vista = 'grilla';
  ponerRecorrido(false);
  pantallaEl.hidden = true;
  foco = actual; // la grilla sigue a la última cámara vista
  pintarGrilla();
}

function mostrarActual() {
  const numero = lista()[actual];
  const estado = estadoDe(numero);
  pantallaImagen.removeAttribute('src');
  pintarCamara(numero);
  if (estaVencida(estado, Date.now())) cargar(numero);
}

function moverPantalla(sentido) {
  const total = lista().length;
  if (!total) return;
  actual = (actual + sentido + total) % total;
  if (recorrido) recorrido.inicio = Date.now();
  mostrarActual();
}

function ponerRecorrido(activo) {
  recorrido = activo ? { inicio: Date.now() } : null;
  recorridoEl.hidden = !activo;
  barraEl.style.width = '0%';
}

// ---------------------------------------------------------------------------
// Búsqueda de cámaras (botón azul; automática la primera vez y cada semana)
// ---------------------------------------------------------------------------
let escaneo = null;

function pintarEscaneo() {
  if (!escaneo) return;
  const { revisadas = 0, encontradas = 0, actual: ultimo = 0, hasta = 400, terminado } = escaneo;
  if (terminado) {
    capaEl.innerHTML = `
      <div class="capa-caja">
        <h2>No se encontró ninguna cámara</h2>
        <p>Ninguna imagen de <code>medellin.gov.co/SIMM/camaras-cctv/</code> respondió.</p>
        <p class="capa-nota">Revisa la conexión a internet. El sitio de la Alcaldía puede rechazar
        conexiones desde fuera de Colombia o desde algunas redes.</p>
        <p class="capa-nota">${chip('azul')} Reintentar · ${chip('atras')} Volver</p>
      </div>`;
    return;
  }
  const avance = Math.min(100, Math.round((ultimo / hasta) * 100));
  capaEl.innerHTML = `
    <div class="capa-caja">
      <h2>Buscando cámaras del SIMM…</h2>
      <p>Revisadas <b>${revisadas}</b> · encontradas <b>${encontradas}</b></p>
      <div class="progreso"><div class="progreso-barra" style="width:${avance}%"></div></div>
      <p class="capa-nota">Se hace una sola vez y se guarda en este navegador.
      ${camaras ? `${chip('atras')} cancela y conserva la lista anterior.` : ''}</p>
    </div>`;
}

function iniciarEscaneo() {
  if (vista === 'pantalla') return;
  if (vista === 'escaneo') {
    if (!escaneo || !escaneo.terminado) return; // ya está buscando
    escaneo = null; // reintento desde el aviso de "no se encontró"
  } else {
    history.pushState({ vista: 'escaneo' }, '');
    vista = 'escaneo';
  }
  const propio = { cancelado: false };
  escaneo = propio;
  capaEl.hidden = false;
  pintarEscaneo();
  descubrir({
    debeParar: () => propio.cancelado,
    alProgreso: (progreso) => {
      Object.assign(propio, progreso);
      if (escaneo === propio) pintarEscaneo();
    },
  }).then((numeros) => {
    if (propio.cancelado || escaneo !== propio) return;
    if (!numeros.length) {
      propio.terminado = true;
      pintarEscaneo();
      return;
    }
    camaras = { numeros, fecha: Date.now() };
    guardarPreferencia('lista', camaras);
    foco = 0;
    firmaPintada = '';
    history.back(); // cierra la capa (popstate → cerrarEscaneo)
  });
}

function cerrarEscaneo() {
  if (escaneo) escaneo.cancelado = true;
  escaneo = null;
  vista = 'grilla';
  capaEl.hidden = true;
  capaEl.innerHTML = '';
  pintarGrilla();
}

addEventListener('popstate', () => {
  if (vista === 'escaneo') cerrarEscaneo();
  else if (vista === 'pantalla') cerrarPantalla();
});
history.replaceState({ vista: 'grilla' }, '');

// ---------------------------------------------------------------------------
// Secciones: SIMM (tránsito) y SIATA
// ---------------------------------------------------------------------------
const necesitaEscaneo = () =>
  !camaras || !camaras.numeros.length || Date.now() - camaras.fecha > ESCANEO_VALIDO_MS;

/** Sección siguiente (+1) o anterior (-1) en el orden de las pestañas. */
function seccionVecina(sentido) {
  const i = SECCIONES.findIndex(([id]) => id === seccion);
  return SECCIONES[(i + sentido + SECCIONES.length) % SECCIONES.length][0];
}

/** Celda con la que se abre una sección por primera vez: en el mapa, la más cercana al centro. */
function focoInicial(cual) {
  if (cual !== 'mapa') return 0;
  const centro = [6.2476, -75.5658]; // Parque Berrío
  const l = lista();
  let mejor = 0;
  let menor = Infinity;
  l.forEach((id, i) => {
    const [lat, lon] = coordenadasCamara(id);
    const d = (lat - centro[0]) ** 2 + (lon - centro[1]) ** 2;
    if (d < menor) {
      menor = d;
      mejor = i;
    }
  });
  return mejor;
}

function cambiarSeccion(nueva) {
  if (nueva === seccion || vista !== 'grilla') return;
  focoPorSeccion[seccion] = foco;
  seccion = nueva;
  guardarPreferencia('seccion', seccion);
  foco = seccion in focoPorSeccion ? focoPorSeccion[seccion] : focoInicial(seccion);
  firmaPintada = '';
  pintarGrilla();
  if ((seccion === 'simm' || seccion === 'mapa') && necesitaEscaneo()) iniciarEscaneo();
}

// ---------------------------------------------------------------------------
// Favoritas
// ---------------------------------------------------------------------------
function alternarFavorita(numero) {
  if (numero == null) return;
  if (favoritas.has(numero)) favoritas.delete(numero);
  else favoritas.add(numero);
  guardarPreferencia('favoritas', [...favoritas]);
  pintarCamara(numero);
}

function alternarSoloFavoritas() {
  const enfocada = lista()[foco];
  soloFavoritas = !soloFavoritas;
  guardarPreferencia('soloFavoritas', soloFavoritas);
  const i = lista().indexOf(enfocada);
  foco = i >= 0 ? i : 0;
  firmaPintada = '';
  pintarGrilla();
}

// ---------------------------------------------------------------------------
// Control remoto y puntero
// ---------------------------------------------------------------------------
/** Con el foco en las pestañas: ← → cambian de sección; ↓ u OK vuelven a la grilla. */
function teclaEnPestanas(nombre) {
  if (nombre === 'izquierda' || nombre === 'derecha') return cambiarSeccion(seccionVecina(nombre === 'derecha' ? 1 : -1));
  if (nombre === 'arriba') return undefined;
  enPestanas = false;
  pintarGrilla();
  return nombre === 'abajo' || nombre === 'ok' ? undefined : teclaEnGrilla(nombre);
}

function teclaEnGrilla(nombre) {
  if (seccion === 'mapa' && teclaEnMapa(nombre)) return undefined;
  const total = lista().length;
  const mover = (delta) => {
    if (!total) return;
    foco = Math.max(0, Math.min(total - 1, foco + delta));
    pintarGrilla();
  };
  switch (nombre) {
    case 'izquierda':
      return mover(-1);
    case 'derecha':
      return mover(1);
    case 'arriba':
      // Desde la fila de arriba de la página se sube a las pestañas de sección.
      if (!total || foco % POR_PAGINA < COLUMNAS) {
        enPestanas = true;
        return pintarGrilla();
      }
      return mover(-COLUMNAS);
    case 'abajo':
      return mover(COLUMNAS);
    case 'paginaAnterior':
      return mover(-POR_PAGINA);
    case 'paginaSiguiente':
      return mover(POR_PAGINA);
    case 'ok':
      return abrirPantalla(foco);
    case 'play':
    case 'amarillo':
      return abrirPantalla(foco, true);
    case 'rojo': {
      const numero = lista()[foco];
      alternarFavorita(numero);
      if (soloFavoritas) {
        firmaPintada = '';
        pintarGrilla();
      }
      return undefined;
    }
    case 'verde':
      return alternarSoloFavoritas();
    case 'azul':
      if (seccion === 'mapa') return cambiarModoLluvia();
      return seccion === 'simm' ? iniciarEscaneo() : undefined;
    default:
      return undefined;
  }
}

function teclaEnPantalla(nombre) {
  switch (nombre) {
    case 'izquierda':
    case 'arriba':
    case 'paginaAnterior':
      return moverPantalla(-1);
    case 'derecha':
    case 'abajo':
    case 'paginaSiguiente':
      return moverPantalla(1);
    case 'ok':
      return history.back();
    case 'rojo':
      return alternarFavorita(lista()[actual]);
    case 'amarillo':
    case 'play':
    case 'pausa':
      return ponerRecorrido(nombre === 'play' ? true : nombre === 'pausa' ? false : !recorrido);
    default:
      return undefined;
  }
}

document.addEventListener('keydown', (evento) => {
  if (esAtrasDelPc(evento)) {
    if (vista !== 'grilla') {
      evento.preventDefault();
      history.back();
    }
    return;
  }
  const tecla = leerTecla(evento);
  if (!tecla) return;
  evento.preventDefault();
  if (tecla.nombre === 'ok' && !activacionPermitida()) return;

  if (vista === 'grilla' && tecla.nombre === 'numero') {
    const elegida = SECCIONES[tecla.numero - 1];
    if (elegida) cambiarSeccion(elegida[0]);
  } else if (vista === 'grilla' && enPestanas) teclaEnPestanas(tecla.nombre);
  else if (vista === 'grilla') teclaEnGrilla(tecla.nombre);
  else if (vista === 'pantalla') teclaEnPantalla(tecla.nombre);
  else if (vista === 'escaneo' && tecla.nombre === 'azul') iniciarEscaneo();
});

grillaEl.addEventListener('click', (evento) => {
  const celda = evento.target.closest('.celda');
  if (!celda || vista !== 'grilla' || !activacionPermitida()) return;
  const i = lista().indexOf(numerosDePagina()[Number(celda.dataset.i)]);
  if (i < 0) return;
  foco = i;
  enPestanas = false;
  pintarGrilla();
  abrirPantalla(foco);
});

// Con el puntero: un clic elige la cámara en el mapa; otro clic sobre la elegida la abre.
mapaEl.addEventListener('click', (evento) => {
  const punto = evento.target.closest('.punto');
  if (!punto || vista !== 'grilla' || !activacionPermitida()) return;
  const l = lista();
  const i = l.findIndex((id) => String(id) === punto.dataset.id);
  if (i < 0) return;
  if (i === foco && !enPestanas) return abrirPantalla(foco);
  foco = i;
  enPestanas = false;
  return pintarGrilla();
});

pestanasEl.addEventListener('click', (evento) => {
  const pestana = evento.target.closest('.pestana');
  if (pestana && activacionPermitida()) cambiarSeccion(pestana.dataset.seccion);
});

// En pantalla completa: tocar el tercio izquierdo o derecho pasa a la anterior o la
// siguiente; tocar el centro vuelve.
pantallaEl.addEventListener('click', (evento) => {
  if (vista !== 'pantalla' || !activacionPermitida()) return;
  const { x } = puntoEnEscenario(evento);
  if (x < 640) moverPantalla(-1);
  else if (x > 1280) moverPantalla(1);
  else history.back();
});

// ---------------------------------------------------------------------------
// Ratón y pantalla táctil (PWA): la leyenda de abajo son botones, la rueda pasa páginas
// (en el mapa hace zoom) y el mapa tiene botones + / −.
// ---------------------------------------------------------------------------
escenario.addEventListener(
  'click',
  (evento) => {
    const control = evento.target.closest('.control[data-control]');
    if (!control) return;
    evento.stopPropagation(); // que no lo tome también la pantalla completa
    const tecla = control.dataset.control;
    if (tecla === 'atras') {
      if (vista !== 'grilla') history.back();
      return;
    }
    if (vista === 'pantalla') {
      if (tecla === 'flechas') moverPantalla(1);
      else teclaEnPantalla(tecla);
      return;
    }
    if (vista !== 'grilla') return;
    if (tecla === 'canal' && seccion !== 'mapa') {
      // Siguiente página; desde la última, a la primera.
      const total = lista().length;
      const ultimaPagina = Math.floor(Math.max(0, total - 1) / POR_PAGINA);
      foco = Math.floor(foco / POR_PAGINA) >= ultimaPagina ? 0 : (Math.floor(foco / POR_PAGINA) + 1) * POR_PAGINA;
      enPestanas = false;
      pintarGrilla();
    } else if (['rojo', 'verde', 'amarillo', 'azul', 'ok'].includes(tecla)) {
      enPestanas = false;
      teclaEnGrilla(tecla);
    }
  },
  true,
);

let ultimaRueda = 0;
escenario.addEventListener(
  'wheel',
  (evento) => {
    if (vista !== 'grilla' || !evento.deltaY) return;
    evento.preventDefault();
    const ahora = performance.now();
    if (ahora - ultimaRueda < 350) return;
    ultimaRueda = ahora;
    if (seccion === 'mapa') cambiarZoom(evento.deltaY < 0 ? 1 : -1);
    else teclaEnGrilla(evento.deltaY < 0 ? 'paginaAnterior' : 'paginaSiguiente');
  },
  { passive: false },
);

const zoomEl = document.createElement('div');
zoomEl.className = 'mapa-zoom';
zoomEl.innerHTML = '<button type="button" data-zoom="1" aria-label="Acercar">+</button><button type="button" data-zoom="-1" aria-label="Alejar">−</button>';
mapaEl.appendChild(zoomEl);
zoomEl.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-zoom]');
  if (boton) cambiarZoom(Number(boton.dataset.zoom));
});

prepararInstalacion($('.control-instalar'));
registrarServiceWorker();

// ---------------------------------------------------------------------------
// Reloj: una vez por segundo renueva lo que toque y actualiza los textos.
// Con la app en segundo plano no se descarga nada.
// ---------------------------------------------------------------------------
function tic() {
  const ahora = Date.now();
  horaEl.textContent = new Date(ahora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (document.hidden) return;
  revisarRadar();
  revisarNiveles();
  revisarMeteo();
  revisarAlertas();
  revisarPluvios(); // confirman la lluvia del radar en todas las secciones
  if (seccion === 'mapa') {
    revisarAire();
    if (modoLluvia === 'animacion') revisarAnimacion();
  }

  if (vista === 'grilla') {
    for (const numero of numerosDePagina()) {
      if (estaVencida(estadoDe(numero), ahora)) cargar(numero);
      else pintarCamara(numero);
    }
  } else if (vista === 'pantalla') {
    const l = lista();
    const numero = l[actual];
    if (estaVencida(estadoDe(numero), ahora)) cargar(numero);
    else pintarCamara(numero);

    if (recorrido && l.length > 1) {
      const transcurrido = ahora - recorrido.inicio;
      barraEl.style.width = `${Math.min(100, (transcurrido / RECORRIDO_MS) * 100)}%`;
      const siguiente = l[(actual + 1) % l.length];
      if (transcurrido >= RECORRIDO_MS - PRECARGA_MS && estaVencida(estadoDe(siguiente), ahora)) cargar(siguiente);
      if (transcurrido >= RECORRIDO_MS) moverPantalla(1);
    }
  }
}

setInterval(tic, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (recorrido) recorrido.inicio = Date.now();
    tic();
  }
});

pintarGrilla();
tic();
if (seccion === 'mapa') foco = focoInicial('mapa');
// Cuando llegan datos nuevos del radar o de los niveles se repintan las marcas.
function repintarMarcas() {
  if (vista === 'pantalla') return pintarCamara(lista()[actual]);
  if (seccion === 'mapa') return pintarGrilla();
  numerosDePagina().forEach(pintarCamara);
  return pintarEstado();
}
alActualizarRadar(repintarMarcas);
alActualizarNiveles(repintarMarcas);
alActualizarPluvios(repintarMarcas);
alActualizarAire(repintarMarcas);
alActualizarMeteo(() => {
  pintarCabeceraClima();
  repintarMarcas();
});
alActualizarAlertas(pintarCabeceraClima);
alActualizarAnimacion(() => {
  if (vista === 'grilla' && seccion === 'mapa' && modoLluvia === 'animacion') mapa.pintarLluvia(capasLluvia());
});
setInterval(animarRadar, CUADRO_MS);
if ((seccion === 'simm' || seccion === 'mapa') && necesitaEscaneo()) iniciarEscaneo();

// Recarga automática al guardar cambios mientras se usa `npm run dev`.
if (location.hostname === 'localhost') {
  new EventSource('/esbuild').addEventListener('change', () => location.reload());
}
