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

const RECORRIDO_MS = 15 * 1000; // cuánto se ve cada cámara en el recorrido
const PRECARGA_MS = 4 * 1000; // antes de pasar a la siguiente, se pide su imagen
const CUADRO_MS = 450; // duración de cada cuadro de la animación del radar
const PAUSA_ULTIMO_CUADRO = 6; // el cuadro más reciente se queda 6 cuadros más
const RADIO_PLUVIOS_KM = 2.5; // pluviómetros que confirman o desmienten al radar

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
let seccion = leerPreferencia('seccion', 'simm');
if (!SECCIONES.some((s) => s.id === seccion)) seccion = 'simm';
const filtros = { favoritas: leerPreferencia('soloFavoritas', false), lluvia: false, alerta: false, texto: '' };
let modoLluvia = leerPreferencia('modoLluvia', 'radar');
if (!MODOS_LLUVIA.some((m) => m.id === modoLluvia)) modoLluvia = 'radar';
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
      ${SECCIONES.map(
        (s) => `<button class="seccion" type="button" data-seccion="${s.id}">${s.icono}<span>${s.titulo}</span></button>`,
      ).join('')}
    </nav>
    <div class="barra-derecha">
      <span class="clima-centro" title="Temperatura en el centro de Medellín"></span>
      <button class="boton boton-instalar" type="button" hidden>${ICONOS.instalar}<span>Instalar</span></button>
    </div>
  </header>
  <div class="alerta-siata" role="alert" hidden>${ICONOS.alerta}<span class="alerta-texto"></span></div>

  <main class="contenido">
    <section class="vista-lista">
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
        <div class="mapa-leyenda">
          <span class="mapa-leyenda-titulo"></span>
          <span class="escala"><span class="nivel-lluvia-1">Llovizna</span><span class="nivel-lluvia-2">Ligera</span><span class="nivel-lluvia-3">Moderada</span><span class="nivel-lluvia-4">Fuerte</span></span>
          <span class="leyenda-camaras">
            <span><span class="punto punto-simm"></span>Tránsito</span>
            <span><span class="punto punto-siata"></span>SIATA</span>
            <span><span class="punto punto-rios"></span>Ríos</span>
            <span><span class="punto punto-siata lluvia-2"></span>Llueve</span>
          </span>
          <span class="leyenda-frescura"></span>
        </div>
      </div>
      <aside class="panel" aria-live="polite">
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
const busquedaEl = $('.busqueda input');
const filtrosEl = $('.filtros');
const resumenEl = $('.resumen-texto');
const avisoDatosEl = $('.aviso-datos');
const leyendaFrescuraEl = $('.leyenda-frescura');
const grillaEl = $('.grilla');
const vacioEl = $('.lista-vacia');
const pieSimmEl = $('.pie-simm');
const capasEl = $('.capas-lluvia');
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
  if (seccion !== 'rios') filtros.alerta = false;
  pintarSeccion();
}

function pintarSeccion() {
  seccionesEl.querySelectorAll('.seccion').forEach((b) => {
    const activa = b.dataset.seccion === seccion;
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
  });
}

function elegirEnMapa(id) {
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

capasEl.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-modo]');
  if (!boton) return;
  modoLluvia = boton.dataset.modo;
  guardarPreferencia('modoLluvia', modoLluvia);
  cuadroAnimacion = 0;
  if (modoLluvia === 'animacion') revisarAnimacion();
  pintarLluviaMapa();
});

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
  panelVacioEl.hidden = hay;
  panelCamaraEl.hidden = !hay;
  panelEl.classList.toggle('abierto', hay);
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
  visor = null;
  visorEl.hidden = true;
  document.body.classList.remove('con-visor');
  if (seccion === 'mapa' && mapa && camarasDeSeccion('mapa').includes(id)) elegirEnMapa(id);
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
  } else if (/^[1-5]$/.test(evento.key)) {
    cambiarSeccion(SECCIONES[Number(evento.key) - 1].id);
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
  if (seccion === 'mapa') {
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
tic();
prepararInstalacion($('.boton-instalar'));
registrarServiceWorker();
