// Visor Medellín (PWA): cámaras del SIMM y del SIATA, lluvia, nivel de los ríos, clima y
// alertas de Medellín y el Valle de Aburrá, con una interfaz web adaptable (celular, tableta
// y computador). Es la versión web de la app para LG webOS: comparte con ella la lógica de
// datos (fuente.js, lluvia.js, niveles.js, pluvios.js, clima.js…) pero no la interfaz.
//
// Vistas:
// - Lista (secciones SIMM, SIATA y Ríos): tarjetas con la foto, que se renuevan solo
//   mientras están a la vista; búsqueda y filtros (favoritas, con lluvia, en alerta).
// - Mapa: Leaflet con todas las cámaras, capas de lluvia y un panel con la elegida.
// - Visor: la cámara en grande, con anterior/siguiente (botones, flechas o deslizando),
//   favorita, recorrido automático y, en las de río, la gráfica del nivel.
// - Motor: sonido de motor de gasolina que sigue la velocidad del GPS (motor.js).
import './app.css';
import { descargar, descubrir } from './fuente.js';
import { CAMARAS as CAMARAS_SIMM, nombreDe, direccionDe, coordenadasDe } from './nombres.js';
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
import { decimal, revisarVersion } from './geoportal.js';
import { frescuraRelevo, revisarRelevo, alActualizarRelevo } from './relevo.js';
import { dibujarGraficaNivel } from './grafica.js';
import { crearMapa } from './mapa.js';
import { ICONOS } from './iconos.js';
import { registrarServiceWorker, prepararInstalacion } from './pwa.js';
import { crearMotor } from './motor.js';
import { FOTOMULTAS, revisarFotomultas, alActualizarFotomultas } from './fotomultas.js';
import { CARGADORES, REDES, nombreRed, revisarCargadores, alActualizarCargadores } from './cargadores.js';
import { crearAvisos } from './avisos.js';
import { crearUbicacion } from './ubicacion.js';
import {
  buscarLugares,
  calcularRuta as calcularRutaOsrm,
  seguirRuta,
  fotomultasEnRuta,
  muestrasDeRuta,
  cercaDeRuta,
  viaEn,
  metrosEntre,
  textoDistancia,
  textoDuracion,
} from './rutas.js';

const RECORRIDO_MS = 15 * 1000; // cuánto se ve cada cámara en el recorrido
const PRECARGA_MS = 4 * 1000; // antes de pasar a la siguiente, se pide su imagen
const CUADRO_MS = 450; // duración de cada cuadro de la animación del radar
const PAUSA_ULTIMO_CUADRO = 6; // el cuadro más reciente se queda 6 cuadros más
const RADIO_PLUVIOS_KM = 2.5; // pluviómetros que confirman o desmienten al radar

// Navegación principal: el mapa primero; las tres listas de cámaras van juntas en «Ver cámaras».
const NAVEGACION = [
  { id: 'mapa', titulo: 'Mapa', icono: ICONOS.mapa },
  { id: 'camaras', titulo: 'Ver cámaras', icono: ICONOS.camara },
  { id: 'motor', titulo: 'Motor Tesla', icono: ICONOS.motor },
];
const LISTAS = ['simm', 'siata', 'rios']; // las subopciones de «Ver cámaras»

const SECCIONES = [
  { id: 'simm', titulo: 'Tránsito', largo: 'Tránsito · SIMM', icono: ICONOS.transito },
  { id: 'siata', titulo: 'SIATA', largo: 'SIATA', icono: ICONOS.camara },
  { id: 'rios', titulo: 'Ríos', largo: 'Ríos y quebradas', icono: ICONOS.rio },
  { id: 'mapa', titulo: 'Mapa', largo: 'Mapa', icono: ICONOS.mapa },
  { id: 'motor', titulo: 'Motor', largo: 'Motor', icono: ICONOS.motor },
];

const MODOS_LLUVIA = [
  { id: 'radar', titulo: 'Radar', leyenda: 'Lluvia ahora · radar y pluviómetros' },
  { id: 'calor', titulo: 'Medida', leyenda: 'Lluvia medida · pluviómetros, últimos 15 min' },
  { id: 'animacion', titulo: 'Últimas 3 h', leyenda: 'Radar · últimas 3 horas' },
];

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Texto sin tildes y en minúsculas, para buscar. */
const normalizar = (texto) =>
  String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

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

// Cámaras del SIMM: se parte de las 80 conocidas (nombres.js); el botón "Buscar cámaras"
// prueba de nuevo qué números existen y guarda el resultado.
let camarasSimm = leerPreferencia('lista', null) || {
  numeros: Object.keys(CAMARAS_SIMM).map(Number).sort((a, b) => a - b),
};
const favoritas = new Set(leerPreferencia('favoritas', []));
// La app abre en el mapa. Quien venía de la versión anterior (que abría en Tránsito) pasa
// al mapa una vez; después se recuerda la última sección, como siempre.
if (leerPreferencia('inicioMapa', false) !== true) {
  guardarPreferencia('inicioMapa', true);
  guardarPreferencia('seccion', 'mapa');
}
let seccion = leerPreferencia('seccion', 'mapa');
if (!SECCIONES.some((s) => s.id === seccion)) seccion = 'mapa';
let listaCamaras = leerPreferencia('lista-camaras', 'simm'); // última subopción vista en «Ver cámaras»
if (!LISTAS.includes(listaCamaras)) listaCamaras = 'simm';
if (LISTAS.includes(seccion)) listaCamaras = seccion;
const filtros = { favoritas: leerPreferencia('soloFavoritas', false), lluvia: false, alerta: false, texto: '' };
let modoLluvia = leerPreferencia('modoLluvia', 'radar');
if (!MODOS_LLUVIA.some((m) => m.id === modoLluvia)) modoLluvia = 'radar';
let verFotomultas = leerPreferencia('fotomultas', true);
const vistaMapa = leerPreferencia('vistaMapa', { centro: [6.2476, -75.5758], zoom: 12 });

// ---------------------------------------------------------------------------
// Datos de cada cámara
// ---------------------------------------------------------------------------
const nombreCamara = (id) => (esSiata(id) ? camaraSiata(id).nombre : nombreDe(id));
const detalleCamara = (id) => (esSiata(id) ? camaraSiata(id).detalle : direccionDe(id));
const coordenadasCamara = (id) => (esSiata(id) ? camaraSiata(id).coordenadas : coordenadasDe(id));
/** 'simm', 'siata' o 'rios': de qué fuente es la cámara (para la forma del punto en el mapa). */
const fuenteDe = (id) => (esSiata(id) ? camaraSiata(id).seccion : 'simm');

/**
 * Lluvia en una cámara juntando el radar y los pluviómetros cercanos:
 * { nivel (0 a 4), fuente: texto de dónde sale, radar: nivel según el radar }.
 * Si hay pluviómetros a menos de 2,5 km, mandan ellos (miden lo que cae): si alguno mide
 * lluvia, llueve; si todos están secos, no, aunque el radar marque algo. Si no hay
 * pluviómetros cerca, vale el radar.
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
const lluviaCamara = (id) => lluviaDe(id).nivel;

/** Nivel del agua en la estación del SIATA de una cámara, o null si no tiene o no se sabe. */
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

/** Todas las cámaras de una sección. En el mapa, las que tienen coordenadas. */
function camarasDeSeccion(cual) {
  if (cual === 'simm') return camarasSimm.numeros;
  if (cual === 'siata' || cual === 'rios') return idsSiata(cual);
  return [...camarasSimm.numeros, ...CAMARAS_SIATA.map((c) => c.id)].filter((id) => coordenadasCamara(id));
}

/** Cámaras de la sección actual con los filtros y la búsqueda aplicados. */
function listaFiltrada() {
  const texto = normalizar(filtros.texto.trim());
  return camarasDeSeccion(seccion).filter((id) => {
    if (filtros.favoritas && !favoritas.has(id)) return false;
    if (filtros.lluvia && !lluviaCamara(id)) return false;
    if (filtros.alerta && seccion === 'rios' && !enAlerta(id)) return false;
    if (texto && !normalizar(`${nombreCamara(id)} ${detalleCamara(id)}`).includes(texto)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Fotos: una por cámara, renovada cuando la fuente la cambia, mientras esté a la vista
// ---------------------------------------------------------------------------
const estados = new Map(); // cámara → { src, tomada, validador, proxima, cargando, fallos }

function estadoDe(id) {
  let estado = estados.get(id);
  if (!estado) {
    estado = { src: null, tomada: 0, validador: null, proxima: 0, cargando: false, fallos: 0 };
    estados.set(id, estado);
  }
  return estado;
}

function cargar(id) {
  const estado = estadoDe(id);
  if (estado.cargando) return;
  estado.cargando = true;
  // Se descarga aparte y luego se cambia: la foto anterior sigue a la vista hasta que la
  // nueva está lista (sin parpadeo).
  descargar(id, estado).then(
    (resultado) => {
      estado.cargando = false;
      estado.fallos = 0;
      estado.proxima = resultado.proxima;
      if (resultado.sinCambio) return;
      const anterior = estado.src;
      estado.src = resultado.url;
      estado.tomada = resultado.tomada;
      estado.validador = resultado.validador || null;
      pintarCamara(id);
      if (anterior && anterior.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(anterior), 2000);
    },
    () => {
      estado.cargando = false;
      estado.fallos += 1;
      estado.proxima = Date.now() + Math.min(60000, 15000 * estado.fallos); // 15 s, 30 s… hasta 1 min
      pintarCamara(id);
    },
  );
}

const estaVencida = (estado, ahora) => !estado.cargando && ahora >= estado.proxima;
const revisarFoto = (id, ahora = Date.now()) => {
  if (estaVencida(estadoDe(id), ahora)) cargar(id);
};

function textoEdad(estado, ahora = Date.now()) {
  if (!estado || !estado.tomada) return '';
  const s = Math.max(0, Math.round((ahora - estado.tomada) / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.floor(s / 60)} min`;
}

function textoAviso(estado) {
  if (estado && estado.src) return '';
  return estado && estado.fallos ? 'Sin imagen' : 'Cargando…';
}

/** Pone la foto de un estado en un <img> (sin recargar si ya es la misma). */
function ponerFoto(img, estado) {
  if (estado && estado.src) {
    if (img.getAttribute('src') !== estado.src) img.src = estado.src;
    img.hidden = false;
  } else {
    img.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Estructura de la página
// ---------------------------------------------------------------------------
const app = document.getElementById('app');
app.innerHTML = `
  <header class="barra">
    <div class="marca">
      <img src="icons/icon-192.png" alt="" width="32" height="32">
      <span class="marca-nombre">Visor Medellín</span>
    </div>
    <nav class="secciones" aria-label="Secciones">
      ${NAVEGACION.map(
        (s) => `<button class="seccion" type="button" data-nav="${s.id}">${s.icono}<span>${s.titulo}</span></button>`,
      ).join('')}
    </nav>
    <div class="barra-derecha">
      <span class="clima-centro" title="Temperatura en el centro de Medellín"></span>
      <button class="boton boton-instalar" type="button" hidden>${ICONOS.instalar}<span>Instalar</span></button>
    </div>
  </header>
  <div class="alerta-siata" role="alert" hidden>${ICONOS.alerta}<span class="alerta-texto"></span></div>
  <div class="aviso-fotomulta" role="status" hidden><span class="fotomulta"></span><span class="aviso-fotomulta-texto"></span></div>

  <main class="contenido">
    <section class="vista-lista">
      <div class="segmento subsecciones" role="group" aria-label="Cámaras">
        ${LISTAS.map((id) => `<button type="button" data-seccion="${id}" aria-pressed="false">${SECCIONES.find((s) => s.id === id).titulo}</button>`).join('')}
      </div>
      <div class="herramientas">
        <h1 class="titulo-seccion"></h1>
        <label class="busqueda">
          ${ICONOS.buscar}
          <input type="search" placeholder="Buscar por nombre o dirección" aria-label="Buscar cámara" autocomplete="off">
        </label>
        <div class="filtros" role="group" aria-label="Filtros">
          <button class="filtro" type="button" data-filtro="favoritas" aria-pressed="false">${ICONOS.estrella}<span>Favoritas</span></button>
          <button class="filtro" type="button" data-filtro="lluvia" aria-pressed="false">${ICONOS.gota}<span>Con lluvia</span></button>
          <button class="filtro" type="button" data-filtro="alerta" aria-pressed="false">${ICONOS.alerta}<span>En alerta</span></button>
          <button class="boton boton-recorrido" type="button" title="Pasa por las cámaras de la lista, 15 s cada una">${ICONOS.reproducir}<span>Recorrido</span></button>
        </div>
        <p class="resumen"><span class="resumen-texto" aria-live="polite"></span><span class="aviso-datos" hidden></span></p>
      </div>
      <div class="grilla"></div>
      <p class="lista-vacia" hidden></p>
      <p class="pie-simm" hidden>¿Falta alguna cámara del SIMM? <button class="enlace boton-buscar" type="button">Buscar de nuevo</button></p>
    </section>

    <section class="vista-mapa" hidden>
      <div class="mapa-caja">
        <div class="mapa"></div>
        <div class="capas-lluvia" role="group" aria-label="Capa de lluvia">
          ${MODOS_LLUVIA.map((m) => `<button type="button" data-modo="${m.id}" aria-pressed="false">${m.titulo}</button>`).join('')}
        </div>
        <button class="boton-fotomultas" type="button" aria-pressed="false" title="Cámaras de fotodetección de la Secretaría de Movilidad"><span class="fotomulta">60</span><span>Fotomultas</span></button>
        <button class="boton-aviso" type="button" aria-pressed="false" title="Suena al acercarte a una fotomulta (usa el GPS)">${ICONOS.campana}<span>Aviso sonoro</span></button>
        <button class="boton-panel" type="button" aria-expanded="true"></button>
        <button class="boton-cargadores" type="button" aria-pressed="false" title="Cargadores públicos para carros eléctricos (OpenStreetMap)"><span class="cargador red-epm">${ICONOS.rayo}</span><span>Cargadores</span></button>
        <button class="boton-ruta" type="button" aria-pressed="false" title="Buscar una ruta en carro">${ICONOS.ruta}<span>Ruta</span></button>
        <button class="boton-icono boton-ubicar" type="button" aria-pressed="false" aria-label="Ver mi carro en el mapa" title="Ver mi carro en el mapa">${ICONOS.ubicar}</button>
        <span class="nota-ubicacion" hidden></span>
        <button class="boton-icono boton-norte" type="button" aria-pressed="false" hidden><span class="brujula">${ICONOS.brujula}</span></button>
        <div class="zoom-mapa" role="group" aria-label="Zoom">
          <button type="button" data-zoom="1" aria-label="Acercar" title="Acercar">+</button>
          <button type="button" data-zoom="-1" aria-label="Alejar" title="Alejar">−</button>
        </div>
        <span class="mapa-creditos">Esri, HERE, Garmin, © OpenStreetMap · radar y pluviómetros: SIATA</span>
        <div class="guia" aria-live="polite" hidden></div>
        <div class="mapa-leyenda">
          <span class="mapa-leyenda-titulo"></span>
          <span class="escala"><span class="nivel-lluvia-1">Llovizna</span><span class="nivel-lluvia-2">Ligera</span><span class="nivel-lluvia-3">Moderada</span><span class="nivel-lluvia-4">Fuerte</span></span>
          <span class="leyenda-camaras">
            <span><span class="punto punto-simm"></span>Tránsito</span>
            <span><span class="punto punto-siata"></span>SIATA</span>
            <span><span class="punto punto-rios"></span>Ríos</span>
            <span><span class="punto punto-siata lluvia-2"></span>Llueve</span>
            <span class="leyenda-fotomulta"><span class="fotomulta">60</span>Fotomulta y su límite</span>
            <span class="leyenda-cargador"><span class="cargador red-epm">${ICONOS.rayo}</span>Cargador</span>
          </span>
          <span class="leyenda-frescura"></span>
        </div>
      </div>
      <aside class="panel" aria-live="polite">
        <div class="panel-ruta" hidden>
          <div class="ruta-cabeza">
            <h2>Ruta</h2>
            <button class="boton-icono ruta-cerrar" type="button" aria-label="Cerrar">${ICONOS.cerrar}</button>
          </div>
          <form class="busqueda ruta-busqueda">
            ${ICONOS.buscar}
            <input type="search" placeholder="¿A dónde vas? Lugar o barrio" aria-label="Destino" autocomplete="off">
          </form>
          <button class="boton ruta-elegir" type="button">${ICONOS.destino}<span>Elegir el destino en el mapa</span></button>
          <p class="ruta-estado" hidden></p>
          <div class="ruta-contenido"></div>
          <p class="secundario ruta-pie">Sale desde tu ubicación. Rutas de OSRM y lugares de Photon sobre OpenStreetMap: no tienen en cuenta el tráfico, el pico y placa ni los cierres.</p>
        </div>
        <div class="panel-vacio">
          <p><strong>Toca una cámara en el mapa</strong> para ver su foto, la lluvia, el nivel del río y el clima en ese punto.</p>
          <p>Las cámaras van sin color: la forma dice de qué tipo son y el color solo aparece si llueve o un río está en alerta.</p>
          <ul class="convenciones">
            <li><span class="punto punto-simm"></span>Tránsito · SIMM</li>
            <li><span class="punto punto-siata"></span>SIATA</li>
            <li><span class="punto punto-rios"></span>Ríos y quebradas</li>
            <li><span class="punto punto-simm lluvia-2"></span>Llueve en la cámara (anillo con el color de la lluvia)</li>
            <li><span class="punto punto-rios nivel-3"></span>Río en alerta</li>
            <li><span class="gota nivel-2"></span>Pluviómetro: llueve</li>
            <li><span class="fotomulta">60</span>Fotomulta: el número es el límite de velocidad</li>
            <li class="convencion-cargadores"><span>Cargadores, por red:</span>${REDES.map((red) => `<span class="red"><span class="cargador red-${red.id}">${ICONOS.rayo}</span>${red.nombre}</span>`).join('')}</li>
          </ul>
        </div>
        <div class="panel-camara" hidden>
          <button class="panel-cerrar boton-icono" type="button" aria-label="Cerrar">${ICONOS.cerrar}</button>
          <button class="panel-foto" type="button" aria-label="Ver en grande">
            <img alt="">
            <span class="aviso"></span>
            <span class="panel-ampliar">${ICONOS.ampliar}</span>
          </button>
          <div class="panel-cabeza">
            <div>
              <h2 class="panel-nombre"></h2>
              <p class="panel-detalle"></p>
            </div>
            <button class="boton-estrella panel-estrella" type="button" aria-pressed="false" aria-label="Favorita">${ICONOS.estrella}</button>
          </div>
          <p class="panel-lluvia"></p>
          <p class="panel-nivel"></p>
          <p class="panel-clima"></p>
          <p class="panel-edad"></p>
        </div>
      </aside>
    </section>

    <section class="vista-motor" hidden></section>
  </main>

  <div class="visor" role="dialog" aria-modal="true" aria-label="Cámara" tabindex="-1" hidden>
    <header class="visor-barra">
      <div class="visor-titulo">
        <h2 class="visor-nombre"></h2>
        <p class="visor-detalle"></p>
      </div>
      <div class="visor-acciones">
        <button class="boton-estrella visor-estrella" type="button" aria-pressed="false" aria-label="Favorita">${ICONOS.estrella}</button>
        <button class="boton-icono visor-recorrido" type="button" aria-label="Recorrido automático" aria-pressed="false">${ICONOS.reproducir}</button>
        <button class="boton-icono visor-cerrar" type="button" aria-label="Cerrar">${ICONOS.cerrar}</button>
      </div>
    </header>
    <div class="visor-foto">
      <img alt="">
      <p class="aviso"></p>
      <button class="visor-flecha visor-anterior" type="button" aria-label="Anterior">${ICONOS.anterior}</button>
      <button class="visor-flecha visor-siguiente" type="button" aria-label="Siguiente">${ICONOS.siguiente}</button>
    </div>
    <div class="visor-progreso" hidden><div></div></div>
    <footer class="visor-pie">
      <div class="visor-datos"></div>
      <div class="visor-grafica" hidden><canvas></canvas></div>
    </footer>
  </div>

  <div class="capa" role="dialog" aria-modal="true" hidden></div>`;

const $ = (selector) => app.querySelector(selector);
const seccionesEl = $('.secciones');
const climaEl = $('.clima-centro');
const alertaEl = $('.alerta-siata');
const alertaTextoEl = $('.alerta-texto');
const vistaListaEl = $('.vista-lista');
const vistaMapaEl = $('.vista-mapa');
const vistaMotorEl = $('.vista-motor');
const tituloSeccionEl = $('.titulo-seccion');
const subseccionesEl = $('.subsecciones');
const busquedaEl = $('.busqueda input');
const filtrosEl = $('.filtros');
const resumenEl = $('.resumen-texto');
const avisoDatosEl = $('.aviso-datos');
const leyendaFrescuraEl = $('.leyenda-frescura');
const grillaEl = $('.grilla');
const vacioEl = $('.lista-vacia');
const pieSimmEl = $('.pie-simm');
const capasEl = $('.capas-lluvia');
const botonFotomultasEl = $('.boton-fotomultas');
const botonAvisoEl = $('.boton-aviso');
const botonRutaEl = $('.boton-ruta');
const botonCargadoresEl = $('.boton-cargadores');
const botonPanelEl = $('.boton-panel');
const botonUbicarEl = $('.boton-ubicar');
const notaUbicacionEl = $('.nota-ubicacion');
const botonNorteEl = $('.boton-norte');
const guiaEl = $('.guia');
const panelRutaEl = $('.panel-ruta');
const rutaBusquedaEl = $('.ruta-busqueda input');
const avisoFotomultaEl = $('.aviso-fotomulta');
const leyendaTituloEl = $('.mapa-leyenda-titulo');
const panelEl = $('.panel');
const panelVacioEl = $('.panel-vacio');
const panelCamaraEl = $('.panel-camara');
const visorEl = $('.visor');
const visorImg = $('.visor-foto img');
const visorGraficaEl = $('.visor-grafica');
const visorLienzo = $('.visor-grafica canvas');
const capaEl = $('.capa');

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------
const motor = crearMotor(vistaMotorEl, { leer: leerPreferencia, guardar: guardarPreferencia });

function cambiarSeccion(nueva) {
  if (!SECCIONES.some((s) => s.id === nueva)) return;
  seccion = nueva;
  guardarPreferencia('seccion', seccion);
  if (LISTAS.includes(seccion)) {
    listaCamaras = seccion;
    guardarPreferencia('lista-camaras', listaCamaras);
  }
  if (seccion !== 'rios') filtros.alerta = false;
  pintarSeccion();
}

function pintarSeccion() {
  const enNav = LISTAS.includes(seccion) ? 'camaras' : seccion;
  subseccionesEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seccion === seccion)));
  seccionesEl.querySelectorAll('.seccion').forEach((b) => {
    const activa = b.dataset.nav === enNav;
    b.classList.toggle('activa', activa);
    if (activa) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const enMapa = seccion === 'mapa';
  const enMotor = seccion === 'motor';
  vistaListaEl.hidden = enMapa || enMotor;
  vistaMapaEl.hidden = !enMapa;
  vistaMotorEl.hidden = !enMotor;
  document.body.classList.toggle('en-mapa', enMapa);
  motor.mostrar(enMotor);
  if (enMotor) {
    // sin tarjetas a la vista no se renueva ninguna foto
    observador.disconnect();
    visibles.clear();
    firmaLista = '';
  } else if (enMapa) {
    asegurarMapa();
    requestAnimationFrame(() => mapa.invalidar());
    pintarMapa();
  } else {
    tituloSeccionEl.textContent = SECCIONES.find((s) => s.id === seccion).largo;
    pintarLista(true);
  }
}

seccionesEl.addEventListener('click', (evento) => {
  const boton = evento.target.closest('.seccion');
  if (boton) cambiarSeccion(boton.dataset.nav === 'camaras' ? listaCamaras : boton.dataset.nav);
});

subseccionesEl.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-seccion]');
  if (boton) cambiarSeccion(boton.dataset.seccion);
});

// ---------------------------------------------------------------------------
// Lista de tarjetas
// ---------------------------------------------------------------------------
let tarjetas = new Map(); // id → elementos de la tarjeta
let firmaLista = '';
const visibles = new Set(); // tarjetas a la vista (solo esas renuevan su foto)

const observador = new IntersectionObserver(
  (entradas) => {
    for (const entrada of entradas) {
      const id = entrada.target.dataset.id;
      const clave = tarjetaPorClave.get(id);
      if (clave === undefined) continue;
      if (entrada.isIntersecting) {
        visibles.add(clave);
        revisarFoto(clave);
      } else visibles.delete(clave);
    }
  },
  { rootMargin: '200px 0px' },
);
const tarjetaPorClave = new Map(); // data-id (texto) → id real (número o "siata:…")

function htmlTarjeta(id) {
  return `
    <article class="tarjeta" data-id="${escapar(id)}">
      <button class="tarjeta-foto" type="button" aria-label="Ver ${escapar(nombreCamara(id))} en grande">
        <img alt="" hidden>
        <span class="aviso">Cargando…</span>
        <span class="insignias"><span class="insignia insignia-lluvia" hidden></span><span class="insignia insignia-nivel" hidden></span></span>
      </button>
      <div class="tarjeta-pie">
        <div class="tarjeta-textos">
          <h3>${escapar(nombreCamara(id))}</h3>
          <p><span class="tarjeta-detalle">${escapar(detalleCamara(id))}</span><span class="tarjeta-edad"></span></p>
        </div>
        <button class="boton-estrella" type="button" aria-pressed="false" aria-label="Favorita">${ICONOS.estrella}</button>
      </div>
    </article>`;
}

/** Dibuja la lista de la sección actual. `forzar` la reconstruye aunque no haya cambiado. */
function pintarLista(forzar = false) {
  if (seccion === 'mapa' || seccion === 'motor') return;
  const lista = listaFiltrada();
  const firma = `${seccion}|${lista.join(',')}`;
  if (forzar || firma !== firmaLista) {
    firmaLista = firma;
    observador.disconnect();
    visibles.clear();
    tarjetaPorClave.clear();
    grillaEl.innerHTML = lista.map(htmlTarjeta).join('');
    tarjetas = new Map();
    grillaEl.querySelectorAll('.tarjeta').forEach((el, i) => {
      const id = lista[i];
      tarjetaPorClave.set(el.dataset.id, id);
      tarjetas.set(id, {
        el,
        img: el.querySelector('img'),
        aviso: el.querySelector('.aviso'),
        lluvia: el.querySelector('.insignia-lluvia'),
        nivel: el.querySelector('.insignia-nivel'),
        edad: el.querySelector('.tarjeta-edad'),
        estrella: el.querySelector('.boton-estrella'),
      });
      observador.observe(el);
    });
    tarjetas.forEach((_, id) => pintarCamara(id));
  }
  pintarHerramientas(lista);
}

function pintarHerramientas(lista) {
  filtrosEl.querySelectorAll('.filtro').forEach((b) => {
    b.setAttribute('aria-pressed', String(Boolean(filtros[b.dataset.filtro])));
    if (b.dataset.filtro === 'alerta') b.hidden = seccion !== 'rios';
  });
  const todas = camarasDeSeccion(seccion);
  const partes = [lista.length === todas.length ? `${todas.length} cámaras` : `${lista.length} de ${todas.length} cámaras`];
  const conLluvia = todas.filter((id) => lluviaCamara(id) > 0).length;
  if (conLluvia) partes.push(`lluvia en ${conLluvia}`);
  const conAlerta = todas.filter(enAlerta).length;
  if (conAlerta) partes.push(`${conAlerta} ${conAlerta === 1 ? 'río en alerta' : 'ríos en alerta'}`);
  resumenEl.textContent = partes.join(' · ');
  vacioEl.hidden = lista.length > 0;
  if (!lista.length) {
    vacioEl.textContent = filtros.favoritas
      ? 'No hay favoritas aquí con estos filtros. Marca cámaras con la estrella.'
      : 'Ninguna cámara coincide con la búsqueda o los filtros.';
  }
  pieSimmEl.hidden = seccion !== 'simm';
  $('.boton-recorrido').disabled = !lista.length;
}

busquedaEl.addEventListener('input', () => {
  filtros.texto = busquedaEl.value;
  pintarLista();
});

filtrosEl.addEventListener('click', (evento) => {
  const filtro = evento.target.closest('.filtro');
  if (filtro) {
    const clave = filtro.dataset.filtro;
    filtros[clave] = !filtros[clave];
    if (clave === 'favoritas') guardarPreferencia('soloFavoritas', filtros.favoritas);
    pintarLista();
    return;
  }
  if (evento.target.closest('.boton-recorrido')) {
    const lista = listaFiltrada();
    if (lista.length) abrirVisor(lista, 0, true);
  }
});

grillaEl.addEventListener('click', (evento) => {
  const tarjeta = evento.target.closest('.tarjeta');
  if (!tarjeta) return;
  const id = tarjetaPorClave.get(tarjeta.dataset.id);
  if (evento.target.closest('.boton-estrella')) {
    alternarFavorita(id);
    return;
  }
  if (evento.target.closest('.tarjeta-foto')) {
    const lista = [...tarjetas.keys()];
    abrirVisor(lista, lista.indexOf(id));
  }
});

// ---------------------------------------------------------------------------
// Pintar una cámara donde se esté viendo (tarjeta, panel del mapa, visor)
// ---------------------------------------------------------------------------
function pintarInsignias(id, lluviaEl, nivelEl) {
  const lluvia = lluviaCamara(id);
  lluviaEl.hidden = !lluvia;
  if (lluvia) {
    lluviaEl.textContent = NIVELES[lluvia];
    lluviaEl.className = `insignia insignia-lluvia nivel-lluvia-${lluvia}`;
  }
  const agua = nivelCamara(id);
  nivelEl.hidden = !agua;
  if (agua) {
    nivelEl.textContent = textoNivel(agua);
    nivelEl.className = `insignia insignia-nivel nivel-rio-${agua.riesgo}`;
  }
}

function pintarCamara(id) {
  const estado = estados.get(id);
  const tarjeta = tarjetas.get(id);
  if (tarjeta) {
    ponerFoto(tarjeta.img, estado);
    tarjeta.aviso.textContent = textoAviso(estado);
    tarjeta.aviso.hidden = !tarjeta.aviso.textContent;
    const edad = textoEdad(estado);
    tarjeta.edad.textContent = edad;
    tarjeta.el.classList.toggle('con-fallos', Boolean(estado && estado.fallos));
    const favorita = favoritas.has(id);
    tarjeta.estrella.setAttribute('aria-pressed', String(favorita));
    tarjeta.estrella.setAttribute('aria-label', favorita ? 'Quitar de favoritas' : 'Marcar como favorita');
    pintarInsignias(id, tarjeta.lluvia, tarjeta.nivel);
  }
  if (seccion === 'mapa' && id === elegida) pintarPanel();
  if (ruta && rutaAbierta && ruta.camaras.some((c) => c.lugar.id === id)) pintarFotosRuta();
  if (visor && visor.lista[visor.indice] === id) pintarVisor();
}

function alternarFavorita(id) {
  if (id == null) return;
  if (favoritas.has(id)) favoritas.delete(id);
  else favoritas.add(id);
  guardarPreferencia('favoritas', [...favoritas]);
  pintarCamara(id);
  if (filtros.favoritas) pintarLista();
  if (mapa) marcarMapa();
}

// ---------------------------------------------------------------------------
// Mapa
// ---------------------------------------------------------------------------
let mapa = null;
let elegida = null;
let cuadroAnimacion = 0;

function asegurarMapa() {
  if (mapa) return;
  mapa = crearMapa($('.mapa'), {
    vista: vistaMapa,
    alElegir: elegirEnMapa,
    alMover: (vista) => guardarPreferencia('vistaMapa', vista),
    alTocar: tocarMapa,
    alArrastrar: () => {
      if (!siguiendo) return;
      siguiendo = false;
      giroYa = true; // girado, Leaflet arrastraría torcido: se endereza de una
      pintarUbicar();
    },
  });
  // el carro vuelve a verse si así quedó la última vez
  if (leerPreferencia('verVehiculo', false)) activarUbicacion(true);
}

function elegirEnMapa(id) {
  if (eligiendoDestino) {
    // se está eligiendo destino: la cámara tocada lo es
    const [latitud, longitud] = coordenadasCamara(id);
    fijarDestino({ nombre: nombreCamara(id), detalle: `Cámara · ${detalleCamara(id)}`, latitud, longitud });
    return;
  }
  rutaAbierta = false;
  mostrarPanel(true);
  elegida = id;
  mapa.elegir(id);
  revisarFoto(id);
  pintarMapa();
}

/** Capas de lluvia del mapa según el modo elegido. */
function capasLluvia() {
  const pluvios = pluviometros();
  const modo = MODOS_LLUVIA.find((m) => m.id === modoLluvia);
  if (modoLluvia === 'calor') return { calor: pluvios, gotas: pluvios, titulo: modo.leyenda };
  if (modoLluvia === 'animacion') {
    const cuadros = cuadrosRadar();
    if (!cuadros.length) return { radar: imagenRadar(), titulo: `${modo.leyenda} · cargando…` };
    const cuadro = cuadros[Math.min(cuadroAnimacion, cuadros.length - 1)];
    return { radar: cuadro, titulo: `${modo.leyenda} · ${cuadro.hora}` };
  }
  return { radar: imagenRadar(), gotas: pluvios, titulo: modo.leyenda };
}

function pintarLluviaMapa() {
  if (!mapa) return;
  const capas = capasLluvia();
  mapa.lluvia(capas);
  leyendaTituloEl.textContent = capas.titulo;
  capasEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === modoLluvia)));
  pintarFotomultas();
}

function marcarMapa() {
  mapa.marcar((id) => {
    const clases = [`punto-${fuenteDe(id)}`, `lluvia-${lluviaCamara(id)}`];
    if (enAlerta(id)) clases.push(`nivel-${nivelCamara(id).riesgo}`);
    if (favoritas.has(id)) clases.push('favorita');
    if (id === elegida) clases.push('elegido');
    return { clase: clases.join(' '), titulo: id === elegida ? nombreCamara(id) : '' };
  });
}

function pintarMapa() {
  if (!mapa || seccion !== 'mapa') return;
  mapa.ponerCamaras(
    camarasDeSeccion('mapa').map((id) => {
      const [latitud, longitud] = coordenadasCamara(id);
      return { id, latitud, longitud };
    }),
  );
  marcarMapa();
  pintarLluviaMapa();
  pintarPanel();
}

botonFotomultasEl.addEventListener('click', () => {
  verFotomultas = !verFotomultas;
  guardarPreferencia('fotomultas', verFotomultas);
  pintarFotomultas();
});

capasEl.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-modo]');
  if (!boton) return;
  modoLluvia = boton.dataset.modo;
  guardarPreferencia('modoLluvia', modoLluvia);
  cuadroAnimacion = 0;
  if (modoLluvia === 'animacion') revisarAnimacion();
  pintarLluviaMapa();
});

/** Globo de una fotomulta: lugar, sentido, límite y qué detecta. */
function htmlFotomulta(camara) {
  const detecta = [];
  if (camara.detecta.includes('v')) detecta.push('exceso de velocidad');
  if (camara.detecta.includes('r')) detecta.push('semáforo en rojo');
  if (camara.detecta.includes('p')) detecta.push('pico y placa');
  detecta.push('SOAT y técnico-mecánica');
  return `<strong>Fotomulta · ${escapar(camara.nombre)}</strong>
    <span>${escapar(camara.direccion)} · de ${escapar(camara.sentido)}</span>
    <span class="globo-limite">Límite ${camara.limite} km/h</span>
    <span>Detecta: ${escapar(detecta.join(', '))}.</span>`;
}

// Cargadores de carros eléctricos (cargadores.js): capa del mapa que se puede ocultar.
let verCargadores = leerPreferencia('cargadores', true);
let versionCargadores = 0;

/** Globo de un cargador: red, lugar, conectores, potencia y botón para trazar la ruta. */
function htmlCargador(c) {
  const red = c.red === 'otra' && c.operador ? c.operador : nombreRed(c.red);
  const operador = c.operador && c.red !== 'otra' && !new RegExp(c.operador, 'i').test(red) ? ` · ${c.operador}` : '';
  const datos = [];
  if (c.conectores.length) datos.push(c.conectores.join(', '));
  if (c.kw) datos.push(`hasta ${String(c.kw).replace('.', ',')} kW`);
  if (c.plazas) datos.push(c.plazas === 1 ? '1 puesto' : `${c.plazas} puestos`);
  const extra = [];
  if (c.pago != null) extra.push(c.pago ? 'De pago' : 'Gratis');
  if (c.horario) extra.push(c.horario);
  return `<strong>${escapar(c.nombre)}</strong>
    <span>${escapar(red + operador)}</span>
    ${c.direccion ? `<span>${escapar(c.direccion)}</span>` : ''}
    ${datos.length ? `<span class="globo-limite">${escapar(datos.join(' · '))}</span>` : ''}
    ${extra.length ? `<span>${escapar(extra.join(' · '))}</span>` : ''}
    <button class="boton boton-principal globo-ir" type="button">${ICONOS.ruta}<span>Ir aquí</span></button>`;
}

const destinoCargador = (c) => ({ nombre: c.nombre, detalle: `Cargador · ${nombreRed(c.red)}`, latitud: c.latitud, longitud: c.longitud });

function pintarCargadores() {
  botonCargadoresEl.setAttribute('aria-pressed', String(verCargadores));
  $('.leyenda-cargador').hidden = !verCargadores;
  if (mapa) mapa.cargadores(verCargadores ? CARGADORES : null, htmlCargador, (c) => fijarDestino(destinoCargador(c)), versionCargadores);
}

botonCargadoresEl.addEventListener('click', () => {
  verCargadores = !verCargadores;
  guardarPreferencia('cargadores', verCargadores);
  pintarCargadores();
});

alActualizarCargadores(() => {
  versionCargadores += 1;
  pintarCargadores();
});

// La lista de fotomultas se renueva sola desde el relevo (una vez al día).
let versionFotomultas = 0;
alActualizarFotomultas(() => {
  versionFotomultas += 1;
  pintarFotomultas();
  if (ruta) {
    ruta.fotomultas = fotomultasEnRuta(ruta, FOTOMULTAS);
    pintarRuta();
  }
});

function pintarFotomultas() {
  if (!mapa) return;
  mapa.fotomultas(verFotomultas ? FOTOMULTAS : null, htmlFotomulta, versionFotomultas);
  pintarCargadores();
  botonFotomultasEl.setAttribute('aria-pressed', String(verFotomultas));
  $('.leyenda-fotomulta').hidden = !verFotomultas;
}

// El panel de la derecha del mapa se puede recoger para ver el mapa a todo lo ancho (se
// recuerda). En el celular no aplica: allí el panel solo sale cuando hay algo que mostrar.
let verPanel = leerPreferencia('panelMapa', true);

function mostrarPanel(ver) {
  if (ver !== verPanel) {
    verPanel = ver;
    guardarPreferencia('panelMapa', ver);
  }
  vistaMapaEl.classList.toggle('sin-panel', !ver);
  botonPanelEl.innerHTML = ver ? ICONOS.siguiente : ICONOS.anterior;
  botonPanelEl.setAttribute('aria-expanded', String(ver));
  const texto = ver ? 'Ocultar el panel' : 'Mostrar el panel';
  botonPanelEl.setAttribute('aria-label', texto);
  botonPanelEl.title = texto;
  if (mapa) requestAnimationFrame(() => mapa.invalidar()); // el mapa cambió de ancho
}

botonPanelEl.addEventListener('click', () => mostrarPanel(!verPanel));
mostrarPanel(verPanel);

// Aviso sonoro al acercarse a una fotomulta (avisos.js). La franja se ve en todas las pestañas.
const avisos = crearAvisos({ camaras: FOTOMULTAS, alCambiar: pintarAviso });

function pintarAviso({ activo, gps, cerca }) {
  botonAvisoEl.setAttribute('aria-pressed', String(activo));
  let texto = '';
  let numero = '';
  if (cerca) {
    const distancia = Math.max(50, Math.round(cerca.metros / 50) * 50);
    texto = `Fotomulta a ${distancia} m · ${cerca.camara.nombre} · límite ${cerca.camara.limite} km/h${cerca.exceso ? ' · vas por encima' : ''}`;
    numero = String(cerca.camara.limite);
  } else if (activo && gps === 'denegado') {
    texto = 'Aviso de fotomultas: la ubicación está bloqueada. Actívala para este sitio en el candado de la barra de direcciones.';
  } else if (activo && gps === 'sin-soporte') {
    texto = 'Aviso de fotomultas: este navegador no da la ubicación.';
  }
  avisoFotomultaEl.hidden = !texto;
  avisoFotomultaEl.classList.toggle('exceso', Boolean(cerca && cerca.exceso));
  avisoFotomultaEl.classList.toggle('sin-camara', !cerca);
  avisoFotomultaEl.querySelector('.fotomulta').textContent = numero;
  avisoFotomultaEl.querySelector('.aviso-fotomulta-texto').textContent = texto;
  const etiqueta = !activo ? 'Aviso sonoro' : gps === 'pidiendo' ? 'Aviso: buscando GPS…' : gps === 'activo' ? 'Aviso sonoro activo' : 'Aviso: sin GPS';
  botonAvisoEl.querySelector('span').textContent = etiqueta;
}

botonAvisoEl.addEventListener('click', () => {
  const activar = !avisos.activo();
  guardarPreferencia('avisoFotomultas', activar);
  avisos.activar(activar);
  if (activar) avisos.probar(); // suena una vez: así se sabe cómo es y a qué volumen
});

// ---------------------------------------------------------------------------
// El carro en el mapa y las rutas (ubicacion.js, rutas.js)
// ---------------------------------------------------------------------------
let siguiendo = false; // el mapa se mueve con el carro
let rumboArriba = leerPreferencia('rumboArriba', true); // siguiendo al carro, el mapa gira con él
let girando = false;
let giroYa = false; // el próximo cambio de giro va sin animación (lo pide un arrastre)
let rutaAbierta = false; // el panel muestra la búsqueda de ruta
let eligiendoDestino = false; // el próximo toque en el mapa es el destino
let destino = null; // { nombre, detalle, latitud, longitud }
let ruta = null; // la de rutas.js, más { fotomultas }
let rutaEstado = ''; // aviso bajo el buscador
let resultados = null; // lugares encontrados (null = no se ha buscado)
let esperandoOrigen = false; // hay destino pero aún no se sabe dónde está el carro
let llegada = false;
let fueraDeRuta = 0; // lecturas seguidas lejos del trazado
let ultimoCalculo = 0;
let busquedaLugares = null;
let calculoRuta = null;
let esperaBusqueda = 0;

const ubicacion = crearUbicacion(({ estado, posicion }) => {
  if (mapa) mapa.vehiculo(posicion, siguiendo && seccion === 'mapa' && !visor);
  pintarUbicar(estado, posicion);
  if (!destino) return;
  if (esperandoOrigen && (posicion || estado === 'denegada' || estado === 'sin-soporte')) calcularRuta();
  else if (posicion && ruta) guiar(posicion);
});

function activarUbicacion(activar) {
  guardarPreferencia('verVehiculo', activar);
  if (!activar) siguiendo = false;
  ubicacion.activar(activar);
}

function pintarUbicar(estado = ubicacion.estado(), posicion = ubicacion.posicion()) {
  botonUbicarEl.setAttribute('aria-pressed', String(ubicacion.activa()));
  botonUbicarEl.classList.toggle('siguiendo', siguiendo);
  botonUbicarEl.setAttribute('aria-label', !ubicacion.activa() ? 'Ver mi carro en el mapa' : siguiendo ? 'Dejar de ver mi carro' : 'Centrar en mi carro');
  let nota = '';
  if (estado === 'pidiendo') nota = 'Buscando GPS…';
  else if (estado === 'denegada') nota = 'Ubicación bloqueada: actívala en el candado de la barra de direcciones';
  else if (estado === 'sin-soporte') nota = 'Este navegador no da la ubicación';
  else if (estado === 'sin-senal' && !posicion) nota = 'Sin señal GPS';
  else if (posicion) nota = `${Math.round(posicion.velocidad * 3.6)} km/h`;
  if (notaUbicacionEl.textContent !== nota) notaUbicacionEl.textContent = nota;
  notaUbicacionEl.hidden = !nota;
  pintarGiro(posicion);
}

/**
 * Gira el mapa con el rumbo del carro mientras se le sigue (si así se eligió). Al dejar de
 * seguirlo o al ir a tocar un destino, vuelve al norte arriba.
 */
function pintarGiro(posicion = ubicacion.posicion()) {
  const activa = ubicacion.activa();
  botonNorteEl.hidden = !activa;
  botonNorteEl.setAttribute('aria-pressed', String(rumboArriba));
  const texto = rumboArriba ? 'Rumbo arriba: el mapa gira con el carro. Toca para dejar el norte arriba' : 'Norte arriba. Toca para que el mapa gire con el carro';
  botonNorteEl.title = texto;
  botonNorteEl.setAttribute('aria-label', texto);
  if (!mapa) return;
  mapa.girable(rumboArriba && activa);
  const debe = rumboArriba && activa && siguiendo && !eligiendoDestino && Boolean(posicion) && posicion.rumbo != null;
  if (debe) {
    // detenido, el rumbo del GPS baila: se conserva el último giro
    if (!girando || posicion.velocidad > 1.5) mapa.girar(posicion.rumbo);
    botonNorteEl.querySelector('.brujula').style.rotate = `${-Math.round(posicion.rumbo)}deg`;
  } else if (girando || giroYa) {
    mapa.girar(0, giroYa);
    botonNorteEl.querySelector('.brujula').style.rotate = '0deg';
  }
  girando = debe;
  giroYa = false;
}

botonNorteEl.addEventListener('click', () => {
  rumboArriba = !rumboArriba;
  guardarPreferencia('rumboArriba', rumboArriba);
  pintarGiro();
});

$('.zoom-mapa').addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-zoom]');
  if (boton && mapa) mapa.acercar(Number(boton.dataset.zoom));
});

botonUbicarEl.addEventListener('click', () => {
  if (!ubicacion.activa()) {
    siguiendo = true;
    activarUbicacion(true);
  } else if (!siguiendo) {
    siguiendo = true;
    mapa.vehiculo(ubicacion.posicion(), true);
    pintarUbicar();
  } else activarUbicacion(false);
});

/** Lugares que coinciden con el texto: cámaras de la app y, después, los de Photon. */
async function buscarDestino(texto) {
  if (busquedaLugares) busquedaLugares.abort();
  busquedaLugares = null;
  if (texto.trim().length < 3) {
    resultados = null;
    rutaEstado = '';
    pintarRuta();
    return;
  }
  const buscado = normalizar(texto.trim());
  const camaras = camarasDeSeccion('mapa')
    .filter((id) => normalizar(`${nombreCamara(id)} ${detalleCamara(id)}`).includes(buscado))
    .slice(0, 3)
    .map((id) => {
      const [latitud, longitud] = coordenadasCamara(id);
      return { nombre: nombreCamara(id), detalle: `Cámara · ${detalleCamara(id)}`, latitud, longitud };
    });
  const control = new AbortController();
  busquedaLugares = control;
  rutaEstado = 'Buscando…';
  pintarRuta();
  let lugares = [];
  let fallo = false;
  try {
    lugares = await buscarLugares(texto.trim(), mapa ? mapa.centro() : null, control.signal);
  } catch (error) {
    if (error.name === 'AbortError') return;
    fallo = true;
  }
  if (busquedaLugares !== control) return;
  busquedaLugares = null;
  // los cargadores también se pueden buscar, por nombre o por red
  const cargadores = CARGADORES.filter((c) => normalizar(`${c.nombre} ${nombreRed(c.red)} ${c.operador} cargador`).includes(buscado))
    .slice(0, 4)
    .map(destinoCargador);
  resultados = [...lugares, ...cargadores, ...camaras];
  rutaEstado = resultados.length ? '' : fallo ? 'No se pudo buscar. Revisa la conexión o elige el destino en el mapa.' : 'No encontré ese lugar. Prueba con otro nombre o elige el destino en el mapa.';
  pintarRuta();
}

function fijarDestino(lugar) {
  destino = lugar;
  ruta = null;
  resultados = null;
  llegada = false;
  eligiendoDestino = false;
  rutaAbierta = true;
  mostrarPanel(true);
  rutaBusquedaEl.value = lugar.nombre;
  recordarDestino(lugar);
  mapa.ruta(null, [lugar.latitud, lugar.longitud]);
  calcularRuta();
}

function quitarRuta() {
  if (calculoRuta) calculoRuta.abort();
  calculoRuta = null;
  destino = null;
  ruta = null;
  resultados = null;
  esperandoOrigen = false;
  llegada = false;
  rutaEstado = '';
  rutaBusquedaEl.value = '';
  if (mapa) mapa.ruta(null, null);
  pintarPanel();
}

/** Calcula la ruta desde el carro hasta el destino. `recalculo`: el carro se salió del trazado. */
async function calcularRuta(recalculo = false) {
  if (!destino) return;
  let origen = ubicacion.posicion();
  let desdeCentro = false;
  if (!origen) {
    const estado = ubicacion.estado();
    if (estado === 'denegada' || estado === 'sin-soporte') {
      // sin GPS: la ruta sale del centro del mapa
      const [latitud, longitud] = mapa.centro();
      origen = { latitud, longitud };
      desdeCentro = true;
    } else {
      esperandoOrigen = true;
      rutaEstado = 'Buscando tu ubicación para trazar la ruta…';
      if (!ubicacion.activa()) activarUbicacion(true);
      pintarPanel();
      return;
    }
  }
  esperandoOrigen = false;
  if (calculoRuta) calculoRuta.abort();
  const control = new AbortController();
  calculoRuta = control;
  ultimoCalculo = Date.now();
  fueraDeRuta = 0;
  if (!recalculo) rutaEstado = 'Calculando la ruta…';
  pintarPanel();
  try {
    const nueva = await calcularRutaOsrm([origen.latitud, origen.longitud], [destino.latitud, destino.longitud], control.signal);
    if (calculoRuta !== control) return;
    nueva.fotomultas = fotomultasEnRuta(nueva, FOTOMULTAS);
    nueva.muestras = muestrasDeRuta(nueva, 250); // para mirar la lluvia a lo largo del trazado
    nueva.camaras = cercaDeRuta(
      nueva,
      camarasDeSeccion('mapa').map((id) => ({ id, latitud: coordenadasCamara(id)[0], longitud: coordenadasCamara(id)[1] })),
      60,
    ).slice(0, 12);
    nueva.recorrido = 0;
    nueva.camaras.forEach((c) => revisarFoto(c.lugar.id));
    ruta = nueva;
    rutaEstado = desdeCentro ? 'Sin GPS: la ruta sale del centro del mapa.' : '';
    mapa.ruta(ruta.puntos, [destino.latitud, destino.longitud]);
    if (!recalculo) {
      siguiendo = false;
      mapa.encuadrar(ruta.puntos);
      pintarUbicar();
    }
  } catch (error) {
    if (error.name === 'AbortError' || calculoRuta !== control) return;
    if (!recalculo) {
      ruta = null;
      rutaEstado = error.sinRuta ? 'No hay ruta en carro hasta ese punto.' : 'No se pudo calcular la ruta. Revisa la conexión e inténtalo de nuevo.';
    }
  }
  calculoRuta = null;
  pintarPanel();
  if (ruta && ubicacion.posicion()) guiar(ubicacion.posicion());
}

/** Con cada lectura del GPS: siguiente maniobra, lo que falta y recálculo si se salió. */
function guiar(posicion) {
  if (!ruta || llegada) return;
  const avance = seguirRuta(ruta, [posicion.latitud, posicion.longitud]);
  ruta.recorrido = avance.recorrido;
  if (avance.restante < 35 && avance.fuera < 60) {
    llegada = true;
    pintarGuia(null);
    return;
  }
  fueraDeRuta = avance.fuera > 70 && posicion.precision < 60 ? fueraDeRuta + 1 : 0;
  if (fueraDeRuta >= 3 && Date.now() - ultimoCalculo > 8000 && !calculoRuta) calcularRuta(true);
  pintarGuia(avance);
}

let guiaPintada = '';
function pintarGuia(avance) {
  let html = '';
  if (eligiendoDestino) html = '<strong>Toca el mapa en tu destino</strong><button class="enlace" type="button" data-guia="cancelar">Cancelar</button>';
  else if (llegada) html = '<strong>Llegaste a tu destino</strong><button class="enlace" type="button" data-guia="quitar">Quitar ruta</button>';
  else if (ruta && avance) {
    const fuera = fueraDeRuta >= 3 ? '<span class="guia-nota">Fuera de la ruta: recalculando…</span>' : '';
    const lluvia = lluviaEnRuta();
    const aviso = lluvia && lluvia.nivel ? `<span class="nivel-lluvia-texto-${lluvia.nivel}">${NIVELES[lluvia.nivel]} ${lluvia.en < 150 ? 'en este tramo' : `en ${textoDistancia(lluvia.en)}`}</span>` : '';
    html = `<strong>En ${textoDistancia(avance.metrosAlPaso)} · ${escapar(avance.paso.texto)}</strong>
      <span>Faltan ${textoDistancia(avance.restante)} · ${textoDuracion(avance.segundos)}</span>${aviso}${fuera}`;
  } else if (ruta) {
    html = `<strong>${escapar(destino.nombre)}</strong><span>${textoDistancia(ruta.metros)} · ${textoDuracion(ruta.segundos)} sin tráfico</span>`;
  }
  if (html !== guiaPintada) {
    guiaPintada = html;
    guiaEl.innerHTML = html;
  }
  guiaEl.hidden = !html;
  $('.mapa-caja').classList.toggle('con-guia', Boolean(html));
}

// Destinos guardados: casa, trabajo y los últimos buscados (solo en este navegador).
const guardados = { casa: null, trabajo: null, recientes: [], ...leerPreferencia('destinos', {}) };
if (!Array.isArray(guardados.recientes)) guardados.recientes = [];
const GUARDADOS = [
  { clave: 'casa', titulo: 'Casa', icono: ICONOS.casa },
  { clave: 'trabajo', titulo: 'Trabajo', icono: ICONOS.trabajo },
];
const mismoLugar = (a, b) => Boolean(a && b) && Math.abs(a.latitud - b.latitud) < 0.0002 && Math.abs(a.longitud - b.longitud) < 0.0002;

function recordarDestino(lugar) {
  if (mismoLugar(lugar, guardados.casa) || mismoLugar(lugar, guardados.trabajo)) return;
  guardados.recientes = [lugar, ...guardados.recientes.filter((r) => !mismoLugar(r, lugar))].slice(0, 6);
  guardarPreferencia('destinos', guardados);
}

/**
 * Lluvia que le queda a la ruta por delante, según el radar: { nivel (el peor), en (metros
 * hasta donde empieza), via, metros (tramo con lluvia) }, o null si no hay radar.
 */
function lluviaEnRuta() {
  if (!ruta || !imagenRadar()) return null;
  const desdeAqui = ruta.recorrido || 0;
  let nivel = 0;
  let inicio = null;
  let muestras = 0;
  for (const muestra of ruta.muestras) {
    if (muestra.desde < desdeAqui) continue;
    const aqui = lluviaEn(muestra.latitud, muestra.longitud) || 0;
    if (!aqui) continue;
    muestras += 1;
    if (inicio == null) inicio = muestra.desde;
    if (aqui > nivel) nivel = aqui;
  }
  if (!nivel) return { nivel: 0, en: 0, via: '', metros: 0 };
  return { nivel, en: Math.max(0, inicio - desdeAqui), via: viaEn(ruta, inicio), metros: muestras * 250 };
}

/** Pone en las miniaturas de «Cámaras en la ruta» la foto que ya se tenga de cada una. */
function pintarFotosRuta() {
  if (!ruta) return;
  panelRutaEl.querySelectorAll('[data-camara-ruta]').forEach((boton) => {
    const camara = ruta.camaras[Number(boton.dataset.camaraRuta)];
    if (camara) ponerFoto(boton.querySelector('img'), estados.get(camara.lugar.id));
  });
}

let rutaPintada = '';
function pintarRuta() {
  botonRutaEl.setAttribute('aria-pressed', String(rutaAbierta || Boolean(destino)));
  $('.ruta-estado').textContent = rutaEstado;
  $('.ruta-estado').hidden = !rutaEstado;
  let html = '';
  if (resultados) {
    html = `<ul class="ruta-resultados">${resultados
      .map((r, i) => `<li><button type="button" data-resultado="${i}"><strong>${escapar(r.nombre)}</strong><span>${escapar(r.detalle)}</span></button></li>`)
      .join('')}</ul>`;
  } else if (ruta) {
    const camaras = ruta.fotomultas;
    const fotos = camaras.length
      ? `<p class="ruta-fotomultas"><span class="fotomulta">${camaras.length}</span><span>${camaras.length === 1 ? 'Una fotomulta' : `${camaras.length} fotomultas`} en la ruta: ${escapar(camaras.map((c) => `${c.camara.nombre} (${c.camara.limite} km/h)`).join(', '))}</span></p>`
      : '<p class="ruta-fotomultas secundario">Sin fotomultas conocidas en la ruta.</p>';
    const lluvia = lluviaEnRuta();
    let textoLluviaRuta = '';
    if (lluvia && lluvia.nivel) {
      const donde = lluvia.en < 150 ? 'desde aquí' : `empieza a ${textoDistancia(lluvia.en)}`;
      textoLluviaRuta = `<p class="ruta-lluvia nivel-lluvia-texto-${lluvia.nivel}">${ICONOS.gota}<span>${NIVELES[lluvia.nivel]} en la ruta: ${donde}${lluvia.via ? `, por ${escapar(lluvia.via)}` : ''} · unos ${textoDistancia(lluvia.metros)} con lluvia, según el radar</span></p>`;
    } else if (lluvia) {
      textoLluviaRuta = `<p class="ruta-lluvia secundario">Sin lluvia en la ruta, según el radar.</p>`;
    }
    const guardar = GUARDADOS.map(({ clave, titulo, icono }) =>
      mismoLugar(guardados[clave], destino)
        ? `<span class="ruta-guardada">${icono}<span>Guardado como ${titulo.toLowerCase()}</span></span>`
        : `<button class="boton" type="button" data-ruta="${clave}">${icono}<span>Guardar como ${titulo.toLowerCase()}</span></button>`,
    ).join('');
    const tira = ruta.camaras.length
      ? `<div class="ruta-camaras"><h4>Cámaras en la ruta</h4><div class="ruta-tira">${ruta.camaras
          .map(
            (c, i) =>
              `<button type="button" data-camara-ruta="${i}" title="${escapar(nombreCamara(c.lugar.id))}"><span class="ruta-foto"><img alt="" hidden></span><strong>${escapar(nombreCamara(c.lugar.id))}</strong><small>a ${textoDistancia(c.desde)}</small></button>`,
          )
          .join('')}</div></div>`
      : '';
    html = `<div class="ruta-resumen">
        <h3>${escapar(destino.nombre)}</h3>
        <p class="ruta-cifras">${textoDistancia(ruta.metros)} · ${textoDuracion(ruta.segundos)} <span>sin tráfico</span></p>
        ${textoLluviaRuta}
        ${fotos}
        <div class="ruta-acciones">
          <button class="boton boton-principal" type="button" data-ruta="seguir">${ICONOS.ubicar}<span>Seguir mi carro</span></button>
          <button class="boton" type="button" data-ruta="ver">Ver toda</button>
          <button class="boton" type="button" data-ruta="quitar">Quitar ruta</button>
        </div>
        <div class="ruta-acciones">${guardar}</div>
      </div>
      ${tira}
      <ol class="ruta-pasos">${ruta.pasos.map((p) => `<li><span>${escapar(p.texto)}</span><span class="ruta-metros">${p.metros >= 10 ? textoDistancia(p.metros) : ''}</span></li>`).join('')}</ol>`;
  } else if (destino) {
    html = `<div class="ruta-resumen"><h3>${escapar(destino.nombre)}</h3><div class="ruta-acciones"><button class="boton" type="button" data-ruta="reintentar">${ICONOS.recargar}<span>Reintentar</span></button><button class="boton" type="button" data-ruta="quitar">Quitar destino</button></div></div>`;
  } else {
    // sin destino: los guardados y los recientes, a un toque
    const fijos = GUARDADOS.map(({ clave, titulo, icono }) => {
      const lugar = guardados[clave];
      return lugar
        ? `<li><button type="button" data-guardado="${clave}">${icono}<span><strong>${titulo}</strong><small>${escapar(lugar.nombre)}</small></span></button><button class="guardado-quitar" type="button" data-olvidar="${clave}" aria-label="Quitar ${titulo}">${ICONOS.cerrar}</button></li>`
        : `<li class="guardado-vacio">${icono}<span><strong>${titulo}</strong><small>Traza una ruta y toca «Guardar como ${titulo.toLowerCase()}»</small></span></li>`;
    }).join('');
    const recientes = guardados.recientes
      .map(
        (lugar, i) =>
          `<li><button type="button" data-guardado="${i}">${ICONOS.reloj}<span><strong>${escapar(lugar.nombre)}</strong><small>${escapar(lugar.detalle || '')}</small></span></button><button class="guardado-quitar" type="button" data-olvidar="${i}" aria-label="Quitar de recientes">${ICONOS.cerrar}</button></li>`,
      )
      .join('');
    html = `<button class="boton ruta-cargador" type="button" data-ruta="cargador"><span class="cargador red-epm">${ICONOS.rayo}</span><span>Ir al cargador más cercano</span></button><ul class="ruta-guardados">${fijos}</ul>${recientes ? `<h4 class="ruta-subtitulo">Recientes</h4><ul class="ruta-guardados">${recientes}</ul>` : ''}`;
  }
  if (html !== rutaPintada) {
    rutaPintada = html;
    $('.ruta-contenido').innerHTML = html;
  }
  pintarFotosRuta();
  pintarGuia(ruta && ubicacion.posicion() && !llegada ? seguirRuta(ruta, [ubicacion.posicion().latitud, ubicacion.posicion().longitud]) : null);
}

function abrirRuta(abrir) {
  rutaAbierta = abrir;
  if (abrir) mostrarPanel(true);
  eligiendoDestino = false;
  pintarPanel();
  if (abrir && !destino && matchMedia('(min-width: 721px)').matches) rutaBusquedaEl.focus();
}

botonRutaEl.addEventListener('click', () => abrirRuta(!rutaAbierta));

rutaBusquedaEl.addEventListener('input', () => {
  clearTimeout(esperaBusqueda);
  const texto = rutaBusquedaEl.value;
  esperaBusqueda = setTimeout(() => buscarDestino(texto), 450);
});
$('.ruta-busqueda').addEventListener('submit', (evento) => {
  evento.preventDefault();
  clearTimeout(esperaBusqueda);
  buscarDestino(rutaBusquedaEl.value);
});

panelRutaEl.addEventListener('click', (evento) => {
  const objetivo = evento.target;
  if (objetivo.closest('.ruta-cerrar')) return void abrirRuta(false);
  if (objetivo.closest('.ruta-elegir')) {
    // en el celular el panel tapa el mapa: se cierra mientras se elige
    rutaAbierta = false;
    eligiendoDestino = true;
    elegida = null;
    marcarMapa();
    pintarPanel();
    pintarGiro(); // norte arriba mientras se toca el destino
    return;
  }
  const resultado = objetivo.closest('[data-resultado]');
  if (resultado) return void fijarDestino(resultados[Number(resultado.dataset.resultado)]);
  const olvidar = objetivo.closest('[data-olvidar]');
  if (olvidar) {
    const clave = olvidar.dataset.olvidar;
    if (clave === 'casa' || clave === 'trabajo') guardados[clave] = null;
    else guardados.recientes.splice(Number(clave), 1);
    guardarPreferencia('destinos', guardados);
    return void pintarRuta();
  }
  const guardado = objetivo.closest('[data-guardado]');
  if (guardado) {
    const clave = guardado.dataset.guardado;
    const lugar = clave === 'casa' || clave === 'trabajo' ? guardados[clave] : guardados.recientes[Number(clave)];
    if (lugar) fijarDestino(lugar);
    return;
  }
  const camaraRuta = objetivo.closest('[data-camara-ruta]');
  if (camaraRuta && ruta) {
    abrirVisor(ruta.camaras.map((c) => c.lugar.id), Number(camaraRuta.dataset.camaraRuta));
    visor.deRuta = true;
    return;
  }
  const accion = objetivo.closest('[data-ruta]');
  if (!accion) return;
  if (accion.dataset.ruta === 'cargador') {
    // el más cercano al carro; sin GPS, al centro del mapa
    const posicion = ubicacion.posicion();
    const aqui = posicion ? [posicion.latitud, posicion.longitud] : mapa.centro();
    let cercano = null;
    let menor = Infinity;
    for (const c of CARGADORES) {
      const d = metrosEntre(aqui, [c.latitud, c.longitud]);
      if (d < menor) {
        menor = d;
        cercano = c;
      }
    }
    if (cercano) fijarDestino(destinoCargador(cercano));
    return;
  }
  if (accion.dataset.ruta === 'casa' || accion.dataset.ruta === 'trabajo') {
    const clave = accion.dataset.ruta;
    // un punto tocado en el mapa no tiene nombre propio: toma el de la casilla
    const nombre = destino.nombre === 'Punto en el mapa' ? (clave === 'casa' ? 'Casa' : 'Trabajo') : destino.nombre;
    guardados[clave] = { ...destino, nombre };
    guardados.recientes = guardados.recientes.filter((r) => !mismoLugar(r, destino));
    guardarPreferencia('destinos', guardados);
    pintarRuta();
  } else if (accion.dataset.ruta === 'quitar') quitarRuta();
  else if (accion.dataset.ruta === 'reintentar') calcularRuta();
  else if (accion.dataset.ruta === 'ver') {
    siguiendo = false;
    mapa.encuadrar(ruta.puntos);
    pintarUbicar();
    if (matchMedia('(max-width: 720px)').matches) abrirRuta(false);
  } else if (accion.dataset.ruta === 'seguir') {
    siguiendo = true;
    if (!ubicacion.activa()) activarUbicacion(true);
    else mapa.vehiculo(ubicacion.posicion(), true);
    pintarUbicar();
    if (matchMedia('(max-width: 720px)').matches) abrirRuta(false);
  }
});

guiaEl.addEventListener('click', (evento) => {
  const accion = evento.target.closest('[data-guia]');
  if (!accion) return;
  if (accion.dataset.guia === 'quitar') quitarRuta();
  else abrirRuta(true);
});

/** Toque en el mapa: si se está eligiendo destino, ese punto lo es. */
function tocarMapa([latitud, longitud]) {
  if (!eligiendoDestino) return;
  fijarDestino({ nombre: 'Punto en el mapa', detalle: `${latitud.toFixed(5)}, ${longitud.toFixed(5)}`, latitud, longitud });
}

/** Avanza la animación del radar (si se está viendo). */
function animarRadar() {
  if (document.hidden || seccion !== 'mapa' || modoLluvia !== 'animacion' || visor) return;
  const total = cuadrosRadar().length;
  if (!total) return;
  cuadroAnimacion = (cuadroAnimacion + 1) % (total + PAUSA_ULTIMO_CUADRO);
  pintarLluviaMapa();
}

/** "19 °C · humedad 89 % · viento 3 km/h SSE · aire aceptable (ICA 78)" cerca de un punto (HTML). */
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
    const punto = aire.color ? `<span class="punto-aire" style="background:${aire.color}"></span>` : '';
    partes.push(`${punto}aire ${escapar(aire.categoria)} (ICA ${Math.round(aire.ica)})`);
  }
  return partes.join(' · ');
}

/** Texto de la lluvia en una cámara (HTML): radar/pluviómetros y el pluviómetro más cercano. */
function textoLluvia(id) {
  const lluvia = lluviaDe(id);
  const coordenadas = coordenadasCamara(id);
  const pluvio = coordenadas ? pluviometroCercano(coordenadas[0], coordenadas[1]) : null;
  let texto = '';
  if (lluvia.nivel) texto = `${NIVELES[lluvia.nivel]} ${lluvia.fuente}`;
  else if (lluvia.radar) texto = `Sin lluvia: el radar marca ${NIVELES[lluvia.radar].toLowerCase()}, pero los pluviómetros cercanos están secos`;
  else if (imagenRadar() || pluvio) texto = 'Sin lluvia';
  const detalle = pluvio
    ? `Pluviómetro a ${decimal(pluvio.km)} km: ${pluvio.lloviendo ? `llueve, ${decimal(pluvio.mm)} mm en 15 min` : 'no llueve'}`
    : '';
  return { html: `${escapar(texto)}${detalle ? `<span class="secundario">${escapar(detalle)}</span>` : ''}`, nivel: lluvia.nivel };
}

/** Texto del nivel del río (HTML), o '' si la cámara no tiene estación. */
function textoRio(id) {
  const agua = nivelCamara(id);
  if (!agua) return { html: '', riesgo: 0 };
  const siguiente = agua.siguiente == null ? '' : ` · N${agua.riesgo + 1} desde ${agua.siguiente.toFixed(2).replace('.', ',')} m`;
  return {
    html: `Río: ${escapar(textoNivel(agua))}<span class="secundario">Estación ${escapar(agua.codigo)} · ${escapar(agua.nombre)}${agua.hora ? ` · ${escapar(agua.hora)}` : ''}${siguiente}</span>`,
    riesgo: agua.riesgo,
  };
}

function pintarPanel() {
  const hay = elegida != null;
  panelRutaEl.hidden = !rutaAbierta;
  panelVacioEl.hidden = hay || rutaAbierta;
  panelCamaraEl.hidden = !hay || rutaAbierta;
  panelEl.classList.toggle('abierto', hay || rutaAbierta);
  pintarRuta();
  if (!hay) return;
  const estado = estados.get(elegida);
  ponerFoto(panelCamaraEl.querySelector('.panel-foto img'), estado);
  panelCamaraEl.querySelector('.panel-foto .aviso').textContent = textoAviso(estado);
  panelCamaraEl.querySelector('.panel-nombre').textContent = nombreCamara(elegida);
  panelCamaraEl.querySelector('.panel-detalle').textContent = detalleCamara(elegida);
  const estrella = panelCamaraEl.querySelector('.panel-estrella');
  estrella.setAttribute('aria-pressed', String(favoritas.has(elegida)));
  const lluvia = textoLluvia(elegida);
  const lluviaEl = panelCamaraEl.querySelector('.panel-lluvia');
  lluviaEl.innerHTML = lluvia.html;
  lluviaEl.className = `panel-lluvia nivel-lluvia-texto-${lluvia.nivel}`;
  const rio = textoRio(elegida);
  const rioEl = panelCamaraEl.querySelector('.panel-nivel');
  rioEl.innerHTML = rio.html;
  rioEl.className = `panel-nivel nivel-rio-texto-${rio.riesgo}`;
  panelCamaraEl.querySelector('.panel-clima').innerHTML = textoClima(coordenadasCamara(elegida));
  const edad = textoEdad(estado);
  panelCamaraEl.querySelector('.panel-edad').textContent = edad ? `Foto de ${edad}` : '';
}

panelCamaraEl.addEventListener('click', (evento) => {
  if (elegida == null) return;
  if (evento.target.closest('.panel-cerrar')) {
    elegida = null;
    marcarMapa();
    pintarPanel();
  } else if (evento.target.closest('.panel-estrella')) {
    alternarFavorita(elegida);
  } else if (evento.target.closest('.panel-foto')) {
    const lista = camarasDeSeccion('mapa');
    abrirVisor(lista, lista.indexOf(elegida));
  }
});

// ---------------------------------------------------------------------------
// Visor: una cámara en grande
// ---------------------------------------------------------------------------
let visor = null; // { lista, indice, recorrido: { inicio } | null }

function abrirVisor(lista, indice, conRecorrido = false) {
  if (!lista.length) return;
  if (!visor) history.pushState({ visor: true }, '');
  visor = { lista, indice: Math.max(0, indice), recorrido: conRecorrido ? { inicio: Date.now() } : null };
  visorEl.hidden = false;
  document.body.classList.add('con-visor');
  visorImg.removeAttribute('src');
  mostrarEnVisor();
  visorEl.focus(); // para que las flechas y Esc vayan al visor
}

function cerrarVisor() {
  if (!visor) return;
  const id = visor.lista[visor.indice];
  const deRuta = visor.deRuta;
  visor = null;
  visorEl.hidden = true;
  document.body.classList.remove('con-visor');
  if (deRuta) pintarPanel(); // se abrió desde las cámaras de la ruta: el panel sigue en la ruta
  else if (seccion === 'mapa' && mapa && camarasDeSeccion('mapa').includes(id)) elegirEnMapa(id);
  else {
    const tarjeta = tarjetas.get(id);
    if (tarjeta) tarjeta.el.scrollIntoView({ block: 'nearest' });
  }
}

function mostrarEnVisor() {
  const id = visor.lista[visor.indice];
  visorImg.removeAttribute('src');
  revisarFoto(id);
  pintarVisor();
}

function moverVisor(sentido) {
  if (!visor) return;
  const total = visor.lista.length;
  visor.indice = (visor.indice + sentido + total) % total;
  if (visor.recorrido) visor.recorrido.inicio = Date.now();
  mostrarEnVisor();
}

function alternarRecorrido() {
  if (!visor) return;
  visor.recorrido = visor.recorrido ? null : { inicio: Date.now() };
  pintarVisor();
}

function pintarVisor() {
  const id = visor.lista[visor.indice];
  const estado = estados.get(id);
  ponerFoto(visorImg, estado);
  visorEl.querySelector('.visor-foto .aviso').textContent = textoAviso(estado);
  visorEl.querySelector('.visor-nombre').textContent = nombreCamara(id);
  visorEl.querySelector('.visor-detalle').textContent = `${detalleCamara(id)} · ${visor.indice + 1} de ${visor.lista.length}`;
  visorEl.querySelector('.visor-estrella').setAttribute('aria-pressed', String(favoritas.has(id)));
  const recorrido = visorEl.querySelector('.visor-recorrido');
  recorrido.innerHTML = visor.recorrido ? ICONOS.pausa : ICONOS.reproducir;
  recorrido.setAttribute('aria-pressed', String(Boolean(visor.recorrido)));
  recorrido.setAttribute('aria-label', visor.recorrido ? 'Pausar recorrido' : 'Recorrido automático');
  visorEl.querySelector('.visor-progreso').hidden = !visor.recorrido;
  const multiples = visor.lista.length > 1;
  visorEl.querySelectorAll('.visor-flecha').forEach((b) => {
    b.hidden = !multiples;
  });

  const edad = textoEdad(estado);
  const lluvia = textoLluvia(id);
  const rio = textoRio(id);
  const fallo = estado && estado.src && estado.fallos ? '<span class="dato dato-fallo">No se pudo renovar</span>' : '';
  visorEl.querySelector('.visor-datos').innerHTML = `
    ${edad ? `<span class="dato">Foto de ${edad}</span>` : ''}${fallo}
    ${lluvia.html ? `<p class="dato-lluvia nivel-lluvia-texto-${lluvia.nivel}">${lluvia.html}</p>` : ''}
    ${rio.html ? `<p class="dato-rio nivel-rio-texto-${rio.riesgo}">${rio.html}</p>` : ''}`;

  // Gráfica del nivel del río (cámaras con estación)
  const camara = esSiata(id) && camaraSiata(id);
  const serie =
    camara && camara.estacion
      ? serieNivel(camara.estacion, () => {
          if (visor && visor.lista[visor.indice] === id) pintarVisor();
        })
      : null;
  visorGraficaEl.hidden = !serie;
  if (serie) {
    const ancho = visorLienzo.clientWidth || 480;
    const escala = window.devicePixelRatio || 1;
    visorLienzo.width = Math.round(ancho * escala);
    visorLienzo.height = Math.round(((ancho * 300) / 640) * escala);
    dibujarGraficaNivel(visorLienzo, serie, estacion(camara.estacion));
  }
}

visorEl.addEventListener('click', (evento) => {
  if (!visor) return;
  if (evento.target.closest('.visor-cerrar')) history.back();
  else if (evento.target.closest('.visor-anterior')) moverVisor(-1);
  else if (evento.target.closest('.visor-siguiente')) moverVisor(1);
  else if (evento.target.closest('.visor-estrella')) alternarFavorita(visor.lista[visor.indice]);
  else if (evento.target.closest('.visor-recorrido')) alternarRecorrido();
});

// Deslizar el dedo sobre la foto pasa a la anterior o la siguiente.
let toque = null;
const visorFotoEl = $('.visor-foto');
visorFotoEl.addEventListener('pointerdown', (evento) => {
  if (evento.pointerType !== 'mouse') toque = { x: evento.clientX, y: evento.clientY };
});
visorFotoEl.addEventListener('pointerup', (evento) => {
  if (!toque || !visor) return;
  const dx = evento.clientX - toque.x;
  const dy = evento.clientY - toque.y;
  toque = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) moverVisor(dx < 0 ? 1 : -1);
});
visorFotoEl.addEventListener('pointercancel', () => {
  toque = null;
});

// ---------------------------------------------------------------------------
// Búsqueda de cámaras del SIMM
// ---------------------------------------------------------------------------
let escaneo = null;

function pintarEscaneo() {
  if (!escaneo) return;
  const { revisadas = 0, encontradas = 0, actual = 0, hasta = 400, terminado } = escaneo;
  if (terminado) {
    capaEl.innerHTML = `
      <div class="dialogo">
        <h2>No se encontró ninguna cámara</h2>
        <p>Ninguna imagen de <code>medellin.gov.co/SIMM/camaras-cctv/</code> respondió. Revisa la conexión; el sitio de la Alcaldía a veces no responde o rechaza conexiones desde fuera de Colombia.</p>
        <div class="dialogo-acciones">
          <button class="boton" type="button" data-accion="cerrar">Cerrar</button>
          <button class="boton boton-principal" type="button" data-accion="reintentar">${ICONOS.recargar}<span>Reintentar</span></button>
        </div>
      </div>`;
    return;
  }
  const avance = Math.min(100, Math.round((actual / hasta) * 100));
  capaEl.innerHTML = `
    <div class="dialogo">
      <h2>Buscando cámaras del SIMM…</h2>
      <p>Revisadas <b>${revisadas}</b> · encontradas <b>${encontradas}</b></p>
      <div class="progreso"><div style="width:${avance}%"></div></div>
      <p class="secundario">Se prueba qué números de imagen existen y se guarda el resultado en este navegador.</p>
      <div class="dialogo-acciones"><button class="boton" type="button" data-accion="cerrar">Cancelar</button></div>
    </div>`;
}

function iniciarEscaneo() {
  if (!escaneo) history.pushState({ escaneo: true }, '');
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
    camarasSimm = { numeros, fecha: Date.now() };
    guardarPreferencia('lista', camarasSimm);
    history.back();
    pintarSeccion();
  });
}

function cerrarEscaneo() {
  if (escaneo) escaneo.cancelado = true;
  escaneo = null;
  capaEl.hidden = true;
  capaEl.innerHTML = '';
}

capaEl.addEventListener('click', (evento) => {
  const accion = evento.target.closest('[data-accion]');
  if (!accion) return;
  if (accion.dataset.accion === 'cerrar') history.back();
  if (accion.dataset.accion === 'reintentar') {
    escaneo = null;
    history.back();
    setTimeout(iniciarEscaneo, 0);
  }
});
$('.boton-buscar').addEventListener('click', iniciarEscaneo);

// El botón Atrás (del navegador o de Android) cierra el visor o el diálogo.
addEventListener('popstate', () => {
  if (escaneo) cerrarEscaneo();
  else if (visor) cerrarVisor();
});

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------
document.addEventListener('keydown', (evento) => {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
  const escribiendo = evento.target.matches('input, textarea');
  if (visor) {
    if (evento.key === 'Escape') history.back();
    else if (evento.key === 'ArrowLeft') moverVisor(-1);
    else if (evento.key === 'ArrowRight') moverVisor(1);
    else if (evento.key === ' ' && !evento.target.closest('button')) alternarRecorrido();
    else if (evento.key === 'f' || evento.key === 'F') alternarFavorita(visor.lista[visor.indice]);
    else return;
    evento.preventDefault();
    return;
  }
  if (escaneo) {
    if (evento.key === 'Escape') history.back();
    return;
  }
  if (escribiendo) {
    if (evento.key === 'Escape') evento.target.blur();
    return;
  }
  if (seccion === 'motor' && motor.tecla(evento, true)) {
    evento.preventDefault();
  } else if (evento.key === '/' && seccion !== 'mapa' && seccion !== 'motor') {
    evento.preventDefault();
    busquedaEl.focus();
  } else if (/^[1-3]$/.test(evento.key)) {
    const destinoNav = NAVEGACION[Number(evento.key) - 1].id;
    cambiarSeccion(destinoNav === 'camaras' ? listaCamaras : destinoNav);
  }
});
document.addEventListener('keyup', (evento) => {
  motor.tecla(evento, false);
});

// ---------------------------------------------------------------------------
// Cabecera: temperatura y alertas del SIATA
// ---------------------------------------------------------------------------
function pintarCabecera() {
  const temperatura = temperaturaCentro();
  climaEl.textContent = temperatura == null ? '' : `${Math.round(temperatura)} °C`;
  const alertas = alertasVigentes();
  alertaEl.hidden = !alertas.length;
  alertaTextoEl.textContent = alertas.map((a) => [a.titulo, a.texto].filter(Boolean).join(': ')).join('  ·  ');
}

// ---------------------------------------------------------------------------
// Reloj: una vez por segundo renueva lo que toque. Con la página oculta no se descarga nada.
// ---------------------------------------------------------------------------
function tic() {
  if (document.hidden) return;
  const ahora = Date.now();
  revisarVersion();
  revisarRelevo();
  pintarFrescura(ahora);
  revisarRadar();
  revisarNiveles();
  revisarMeteo();
  revisarAlertas();
  revisarPluvios();
  revisarFotomultas();
  revisarCargadores();
  if (seccion === 'mapa') {
    // las fotos de las cámaras de la ruta, mientras su panel está a la vista
    if (ruta && rutaAbierta && !visor) ruta.camaras.forEach((c) => revisarFoto(c.lugar.id, ahora));
    revisarAire();
    if (modoLluvia === 'animacion') revisarAnimacion();
  }

  if (visor) {
    const { lista, indice, recorrido } = visor;
    const id = lista[indice];
    revisarFoto(id, ahora);
    pintarVisor();
    if (recorrido && lista.length > 1) {
      const transcurrido = ahora - recorrido.inicio;
      visorEl.querySelector('.visor-progreso div').style.width = `${Math.min(100, (transcurrido / RECORRIDO_MS) * 100)}%`;
      if (transcurrido >= RECORRIDO_MS - PRECARGA_MS) revisarFoto(lista[(indice + 1) % lista.length], ahora);
      if (transcurrido >= RECORRIDO_MS) moverVisor(1);
    }
    return;
  }
  if (seccion === 'mapa') {
    if (elegida != null) {
      revisarFoto(elegida, ahora);
      pintarPanel();
    }
  } else if (seccion !== 'motor') {
    visibles.forEach((id) => {
      revisarFoto(id, ahora);
      pintarCamara(id);
    });
  }
}

/**
 * Aviso de qué tan recientes son los datos del relevo (pluviómetros, niveles, clima): en la
 * leyenda del mapa siempre, y en las listas solo cuando están viejos.
 */
function pintarFrescura(ahora = Date.now()) {
  const frescura = frescuraRelevo(ahora);
  let leyenda = '';
  let aviso = '';
  let nivel = 'ok';
  if (frescura) {
    nivel = frescura.nivel;
    if (frescura.minutos == null) {
      leyenda = '⚠ No se pudieron cargar los pluviómetros ni los ríos';
      aviso = leyenda;
    } else if (nivel === 'ok') {
      leyenda = `Pluviómetros y ríos: ${frescura.texto}`;
    } else {
      leyenda = `⚠ Pluviómetros y ríos sin actualizar: ${frescura.texto}`;
      aviso = `⚠ Lluvia y ríos sin actualizar: ${frescura.texto}`;
    }
  }
  if (leyendaFrescuraEl.textContent !== leyenda) leyendaFrescuraEl.textContent = leyenda;
  leyendaFrescuraEl.hidden = !leyenda;
  leyendaFrescuraEl.dataset.nivel = nivel;
  if (avisoDatosEl.textContent !== aviso) avisoDatosEl.textContent = aviso;
  avisoDatosEl.hidden = !aviso;
  avisoDatosEl.dataset.nivel = nivel;
}

/** Cuando llegan datos nuevos (radar, niveles, pluviómetros…) se repintan las marcas. */
function repintarDatos() {
  if (seccion === 'mapa') pintarMapa();
  if (seccion === 'mapa' && ruta) pintarRuta(); // la lluvia en la ruta cambia con el radar
  else if (seccion !== 'motor') {
    tarjetas.forEach((_, id) => pintarCamara(id));
    if (filtros.lluvia || filtros.alerta) pintarLista();
    else pintarHerramientas(listaFiltrada());
  }
  if (visor) pintarVisor();
}

alActualizarRadar(repintarDatos);
alActualizarNiveles(repintarDatos);
alActualizarPluvios(repintarDatos);
alActualizarAire(repintarDatos);
alActualizarMeteo(() => {
  pintarCabecera();
  repintarDatos();
});
alActualizarAlertas(pintarCabecera);
alActualizarRelevo(() => pintarFrescura());
alActualizarAnimacion(() => {
  if (seccion === 'mapa' && modoLluvia === 'animacion') pintarLluviaMapa();
});

setInterval(tic, 1000);
setInterval(animarRadar, CUADRO_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (visor && visor.recorrido) visor.recorrido.inicio = Date.now();
    tic();
  }
});

pintarSeccion();
if (seccion === 'motor') motor.encenderSiAuto();
if (leerPreferencia('avisoFotomultas', false)) avisos.activar(true);
tic();
prepararInstalacion($('.boton-instalar'));
registrarServiceWorker();
