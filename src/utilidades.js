// Sección «Utilidades»: herramientas rápidas para el carro, pensadas para tocar con el dedo.
//   Moneda · Ruleta · Dados y número al azar · Temporizador · Cronómetro · Reloj · DJ música · Radio
// Todo corre en el navegador. El temporizador, el cronómetro y la radio siguen andando al
// cambiar de pestaña; la música del DJ se detiene al salir de él.
import { crearPads, PADS, RITMOS } from './pads.js';

const RADIO = {
  nombre: 'La Mega',
  detalle: 'RCN Radio · Medellín',
  url: 'https://us-b4-p-e-qg12-audio.cdn.mdstrm.com/live-audio-aw/632cb48f613bac0856b931ab',
};

const HERRAMIENTAS = [
  { id: 'moneda', nombre: 'Lanzar moneda', detalle: 'Cara o cruz', emoji: '🪙' },
  { id: 'ruleta', nombre: 'Ruleta', detalle: 'Tus opciones, a girar', emoji: '🎡' },
  { id: 'dados', nombre: 'Dados y número', detalle: 'Para juegos y sorteos', emoji: '🎲' },
  { id: 'temporizador', nombre: 'Temporizador', detalle: '5, 10, 15, 30, 45 min', emoji: '⏳' },
  { id: 'cronometro', nombre: 'Cronómetro', detalle: 'Con vueltas', emoji: '⏱️' },
  { id: 'reloj', nombre: 'Reloj gigante', detalle: 'Con modo noche', emoji: '🕒' },
  { id: 'launchpad', nombre: 'DJ música', detalle: 'Pads y ritmos para tocar', emoji: '🎛️' },
  { id: 'radio', nombre: 'Radio', detalle: RADIO.nombre, emoji: '📻' },
];

const RULETAS_INICIALES = [
  { nombre: '¿Dónde comemos?', opciones: ['Hamburguesa', 'Pizza', 'Sushi', 'Pollo', 'Mexicana', 'Típica'] },
  { nombre: '¿Quién conduce?', opciones: ['Yo', 'Tú'] },
  { nombre: '¿Qué plan?', opciones: ['Cine', 'Mirador', 'Helado', 'Centro comercial', 'Casa', 'Rapidín', 'Motelear'] },
];
const COLORES = ['#36c5ff', '#ff6fb1', '#ffd23f', '#3ddc84', '#ff8a1f', '#b388ff', '#ff4d5e', '#2ec7f0', '#7ac143', '#e040c8'];
const ATAJOS = [5, 10, 15, 30, 45]; // minutos del temporizador

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Entero al azar entre 0 y n − 1, sin sesgo (con el generador seguro del navegador). */
function azar(n) {
  if (!window.crypto || !crypto.getRandomValues) return Math.floor(Math.random() * n);
  const tope = Math.floor(0x100000000 / n) * n;
  const caja = new Uint32Array(1);
  do crypto.getRandomValues(caja);
  while (caja[0] >= tope);
  return caja[0] % n;
}

const dosCifras = (n) => String(n).padStart(2, '0');
/** "12:05" o "1:02:05" para una duración en milisegundos (redondea hacia arriba al segundo). */
function textoCuenta(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h}:${dosCifras(m)}:${dosCifras(total % 60)}` : `${m}:${dosCifras(total % 60)}`;
}
/** "1:02.34" para el cronómetro (centésimas). */
function textoCrono(ms) {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  return `${m}:${dosCifras(Math.floor(cs / 100) % 60)}.${dosCifras(cs % 100)}`;
}

/**
 * Monta la sección en `el`. `leer` y `guardar` son las preferencias de la app;
 * `alTemporizador(texto | null, terminado)` avisa lo que le falta al temporizador, para
 * mostrarlo en la barra de arriba aunque se esté en otra pestaña.
 * Devuelve { mostrar(visible), abrir(id), tecla(evento) }.
 */
export function crearUtilidades(el, { leer, guardar, alTemporizador = () => {} }) {
  const pref = {
    herramienta: null,
    ruletas: RULETAS_INICIALES,
    ruleta: 0,
    dados: 2,
    desde: 1,
    hasta: 100,
    noche: false,
    volumen: 80,
    bpm: 95,
    ritmo: RITMOS[0].id,
    temporizador: null, // { fin } corriendo | { resta } en pausa
    cronometro: { base: 0, desde: null, vueltas: [] },
    ...leer('utilidades', {}),
  };
  if (!Array.isArray(pref.ruletas) || !pref.ruletas.length) pref.ruletas = RULETAS_INICIALES;
  // Quien ya tenía guardada la ruleta «¿Qué plan?» recibe una vez las dos opciones nuevas.
  if (!pref.planConNuevas) {
    pref.planConNuevas = true;
    const plan = pref.ruletas.find((r) => r && r.nombre === '¿Qué plan?' && Array.isArray(r.opciones));
    if (plan) for (const opcion of ['Rapidín', 'Motelear']) if (!plan.opciones.includes(opcion)) plan.opciones.push(opcion);
  }
  if (!HERRAMIENTAS.some((h) => h.id === pref.herramienta)) pref.herramienta = null;
  if (!pref.cronometro || !Array.isArray(pref.cronometro.vueltas)) pref.cronometro = { base: 0, desde: null, vueltas: [] };
  const recordar = () => guardar('utilidades', pref);

  el.innerHTML = `
    <div class="utilidades">
      <div class="util-inicio">
        <h1 class="util-titulo">Utilidades</h1>
        <div class="util-grilla">
          ${HERRAMIENTAS.map(
            (h) => `<button class="util-tarjeta" type="button" data-abrir="${h.id}"><span class="util-emoji" aria-hidden="true">${h.emoji}</span><strong>${h.nombre}</strong><span>${h.detalle}</span><span class="util-estado" data-estado="${h.id}"></span></button>`,
          ).join('')}
        </div>
      </div>

      <div class="util-vista" hidden>
        <div class="util-cabeza">
          <button class="boton util-volver" type="button">‹ Utilidades</button>
          <h1 class="util-nombre"></h1>
        </div>

        <section class="util-herramienta" data-herramienta="moneda">
          <button class="moneda" type="button" aria-label="Lanzar la moneda"><span class="moneda-cuerpo"><span class="moneda-lado moneda-cara">CARA</span><span class="moneda-lado moneda-cruz">CRUZ</span></span></button>
          <p class="util-resultado moneda-resultado" aria-live="polite">Toca la moneda</p>
          <button class="boton boton-principal util-grande" type="button" data-accion="lanzar">Lanzar</button>
          <p class="secundario moneda-cuenta"></p>
        </section>

        <section class="util-herramienta" data-herramienta="ruleta">
          <div class="util-fila ruleta-listas"></div>
          <div class="ruleta-caja">
            <span class="ruleta-flecha" aria-hidden="true"></span>
            <svg class="ruleta-rueda" viewBox="-104 -104 208 208" role="img" aria-label="Ruleta"></svg>
          </div>
          <p class="util-resultado ruleta-resultado" aria-live="polite">Gírala con el dedo</p>
          <div class="util-fila">
            <button class="boton boton-principal util-grande" type="button" data-accion="girar">Girar</button>
            <button class="boton" type="button" data-accion="editar-ruleta">Editar opciones</button>
          </div>
          <form class="ruleta-editor" hidden>
            <label>Nombre<input type="text" name="nombre" maxlength="40" autocomplete="off"></label>
            <label>Opciones, una por línea<textarea name="opciones" rows="7" spellcheck="false"></textarea></label>
            <div class="util-fila">
              <button class="boton boton-principal" type="submit">Guardar</button>
              <button class="boton" type="button" data-accion="nueva-ruleta">Nueva ruleta</button>
              <button class="boton" type="button" data-accion="borrar-ruleta">Borrar esta</button>
              <button class="boton" type="button" data-accion="cerrar-editor">Cancelar</button>
            </div>
          </form>
        </section>

        <section class="util-herramienta" data-herramienta="dados">
          <div class="util-fila dados-cuantos" role="group" aria-label="Cuántos dados">
            ${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" data-dados="${n}" aria-pressed="false">${n}</button>`).join('')}
          </div>
          <button class="dados-mesa" type="button" aria-label="Lanzar los dados"></button>
          <p class="util-resultado dados-total" aria-live="polite">Toca los dados</p>
          <button class="boton boton-principal util-grande" type="button" data-accion="lanzar-dados">Lanzar dados</button>
          <div class="numero-azar">
            <h2>Número al azar</h2>
            <div class="util-fila">
              <label>Desde<input type="number" inputmode="numeric" name="desde"></label>
              <label>Hasta<input type="number" inputmode="numeric" name="hasta"></label>
              <button class="boton boton-principal" type="button" data-accion="numero">Sacar número</button>
            </div>
            <p class="util-resultado numero-resultado" aria-live="polite">–</p>
          </div>
        </section>

        <section class="util-herramienta" data-herramienta="temporizador">
          <p class="util-cifra temporizador-cifra">0:00</p>
          <div class="temporizador-barra"><div></div></div>
          <div class="util-fila temporizador-atajos">
            ${ATAJOS.map((m) => `<button class="boton util-grande" type="button" data-minutos="${m}">${m} min</button>`).join('')}
          </div>
          <div class="util-fila">
            <button class="boton" type="button" data-sumar="-1">− 1 min</button>
            <button class="boton" type="button" data-sumar="1">+ 1 min</button>
            <button class="boton" type="button" data-sumar="5">+ 5 min</button>
            <button class="boton boton-principal" type="button" data-accion="pausar-temporizador">Pausar</button>
            <button class="boton" type="button" data-accion="detener-temporizador">Quitar</button>
          </div>
          <p class="secundario">Al terminar suena una alarma, estés en la pestaña que estés. Lo que falta también se ve arriba, junto a la temperatura.</p>
        </section>

        <section class="util-herramienta" data-herramienta="cronometro">
          <p class="util-cifra cronometro-cifra">0:00.00</p>
          <div class="util-fila">
            <button class="boton boton-principal util-grande" type="button" data-accion="crono-iniciar">Iniciar</button>
            <button class="boton util-grande" type="button" data-accion="crono-vuelta">Vuelta</button>
            <button class="boton util-grande" type="button" data-accion="crono-reiniciar">Reiniciar</button>
          </div>
          <ol class="cronometro-vueltas"></ol>
        </section>

        <section class="util-herramienta" data-herramienta="reloj">
          <div class="reloj-gigante">
            <p class="reloj-hora"><span class="reloj-hm">0:00</span><span class="reloj-extra"><span class="reloj-seg">00</span><span class="reloj-ampm"></span></span></p>
            <p class="reloj-fecha"></p>
          </div>
          <div class="util-fila">
            <button class="boton" type="button" data-accion="noche" aria-pressed="false">Modo noche</button>
            <button class="boton" type="button" data-accion="pantalla">Pantalla completa</button>
          </div>
        </section>

        <section class="util-herramienta" data-herramienta="launchpad">
          <div class="pads">
            ${PADS.map((pad, i) => `<button class="pad pad-${pad.color}" type="button" data-pad="${i}"><span>${pad.nombre}</span></button>`).join('')}
          </div>
          <div class="util-fila pads-base">
            <button class="boton boton-principal util-grande" type="button" data-accion="base" aria-pressed="false">▶ Base</button>
            <div class="segmento" role="group" aria-label="Ritmo">
              ${RITMOS.map((r) => `<button type="button" data-ritmo="${r.id}" aria-pressed="false">${r.nombre}</button>`).join('')}
            </div>
            <label class="pads-tempo"><span class="pads-bpm"></span><input type="range" name="bpm" min="70" max="150" step="1"></label>
          </div>
          <p class="secundario">Toca varios pads a la vez. La base es un ritmo que suena debajo para tocar encima; se detiene al salir del DJ. Los sonidos se generan en el navegador.</p>
        </section>

        <section class="util-herramienta" data-herramienta="radio">
          <div class="radio-caja">
            <span class="util-emoji" aria-hidden="true">📻</span>
            <h2>${RADIO.nombre}</h2>
            <p class="secundario">${RADIO.detalle}</p>
            <button class="boton boton-principal util-grande" type="button" data-accion="radio" aria-pressed="false">▶ Escuchar</button>
            <p class="util-resultado radio-estado" aria-live="polite"></p>
            <label class="radio-volumen"><span>Volumen</span><input type="range" name="volumen" min="0" max="100" step="1"></label>
          </div>
          <p class="secundario">Es la transmisión en vivo de la emisora; gasta datos mientras suena. Sigue sonando al cambiar de pestaña.</p>
        </section>
      </div>
    </div>`;

  const $ = (selector) => el.querySelector(selector);
  const vistaEl = $('.util-vista');
  const inicioEl = $('.util-inicio');
  let visible = false;

  // -------------------------------------------------------------------------
  // Sonido: un solo contexto de audio para la alarma y el DJ
  // -------------------------------------------------------------------------
  let ctx = null;
  let pads = null;
  function audio() {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return null;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      // sin audioSession no hace falta
    }
    if (!ctx) ctx = new Contexto({ latencyHint: 'interactive' });
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  }
  const losPads = () => {
    const c = audio();
    if (c && !pads) pads = crearPads(c);
    return pads;
  };

  /**
   * Llama a `fn` cuando el audio esté sonando de verdad. Un contexto recién creado tarda un
   * momento en arrancar, y lo que se dispare antes se pierde: por eso el primer toque no sonaba.
   */
  function cuandoSuene(fn) {
    const c = audio();
    if (!c) return;
    if (c.state === 'running') return void fn();
    let hecho = false;
    const listo = () => {
      if (hecho || c.state !== 'running') return;
      hecho = true;
      c.removeEventListener('statechange', listo);
      fn();
    };
    c.addEventListener('statechange', listo);
    c.resume().then(listo, () => {});
  }

  // Mientras hace falta (el DJ abierto, o un temporizador a punto de acabar) suena un tono
  // inaudible: mantiene despierta la salida de audio, que si se duerme tarda en volver a sonar.
  let vigilia = null;
  const motivos = new Set();
  function despierto(motivo, si) {
    if (si) motivos.add(motivo);
    else motivos.delete(motivo);
    if (motivos.size && !vigilia && ctx) {
      const oscilador = ctx.createOscillator();
      const ganancia = ctx.createGain();
      oscilador.frequency.value = 30;
      ganancia.gain.value = 0.0004;
      oscilador.connect(ganancia).connect(ctx.destination);
      oscilador.start();
      vigilia = oscilador;
    } else if (!motivos.size && vigilia) {
      vigilia.stop();
      vigilia = null;
    }
  }

  function pitido(hz, cuando, dura, nivel = 0.5) {
    if (!ctx) return null;
    const oscilador = ctx.createOscillator();
    const ganancia = ctx.createGain();
    oscilador.type = 'triangle';
    oscilador.frequency.value = hz;
    ganancia.gain.setValueAtTime(0, cuando);
    ganancia.gain.linearRampToValueAtTime(nivel, cuando + 0.01);
    ganancia.gain.setValueAtTime(nivel, cuando + dura - 0.03);
    ganancia.gain.linearRampToValueAtTime(0, cuando + dura);
    oscilador.connect(ganancia).connect(ctx.destination);
    oscilador.start(cuando);
    oscilador.stop(cuando + dura + 0.02);
    return oscilador;
  }

  // -------------------------------------------------------------------------
  // Navegación entre herramientas
  // -------------------------------------------------------------------------
  function abrir(id) {
    pref.herramienta = HERRAMIENTAS.some((h) => h.id === id) ? id : null;
    recordar();
    pintar();
  }

  function pintar() {
    const actual = HERRAMIENTAS.find((h) => h.id === pref.herramienta);
    inicioEl.hidden = Boolean(actual);
    vistaEl.hidden = !actual;
    el.querySelectorAll('.util-herramienta').forEach((seccion) => {
      seccion.hidden = !actual || seccion.dataset.herramienta !== actual.id;
    });
    if (actual) $('.util-nombre').textContent = actual.nombre;
    cuidarDj();
    pintarEstados();
    if (!actual) return;
    if (actual.id === 'ruleta') pintarRuleta();
    if (actual.id === 'dados') pintarDados();
    if (actual.id === 'temporizador') pintarTemporizador();
    if (actual.id === 'cronometro') pintarCronometro(true);
    if (actual.id === 'reloj') pintarReloj();
    if (actual.id === 'launchpad') pintarBase();
    if (actual.id === 'radio') pintarRadio();
  }

  /** En las tarjetas del inicio, lo que está andando (temporizador, cronómetro, radio, base). */
  function pintarEstados() {
    const estados = {
      temporizador: pref.temporizador ? (pref.temporizador.fin ? textoCuenta(pref.temporizador.fin - Date.now()) : 'En pausa') : '',
      cronometro: pref.cronometro.desde != null ? 'Corriendo' : '',
      radio: radioSonando ? 'Sonando' : '',
    };
    el.querySelectorAll('[data-estado]').forEach((marca) => {
      const texto = estados[marca.dataset.estado] || '';
      if (marca.textContent !== texto) marca.textContent = texto;
    });
  }

  // -------------------------------------------------------------------------
  // Moneda
  // -------------------------------------------------------------------------
  const monedaEl = $('.moneda');
  const monedaCuerpo = $('.moneda-cuerpo');
  let giroMoneda = 0;
  let lanzando = false;
  const cuentaMoneda = { cara: 0, cruz: 0 };

  function lanzarMoneda() {
    if (lanzando) return;
    lanzando = true;
    const cara = azar(2) === 0;
    // varias vueltas completas y termina mostrando el lado que salió (cruz = media vuelta más)
    const vueltas = 5 + azar(3);
    const base = Math.ceil(giroMoneda / 360) * 360;
    giroMoneda = base + vueltas * 360 + (cara ? 0 : 180);
    monedaCuerpo.style.transform = `rotateY(${giroMoneda}deg)`;
    $('.moneda-resultado').textContent = '…';
    setTimeout(() => {
      lanzando = false;
      cuentaMoneda[cara ? 'cara' : 'cruz'] += 1;
      $('.moneda-resultado').textContent = cara ? 'Cara' : 'Cruz';
      $('.moneda-cuenta').textContent = `Caras ${cuentaMoneda.cara} · Cruces ${cuentaMoneda.cruz}`;
    }, 1150);
  }
  monedaEl.addEventListener('click', lanzarMoneda);

  // -------------------------------------------------------------------------
  // Ruleta
  // -------------------------------------------------------------------------
  const ruedaEl = $('.ruleta-rueda');
  const editorEl = $('.ruleta-editor');
  let angulo = 0; // grados que lleva girada la rueda
  let velocidad = 0; // grados por segundo
  let girando = false;
  let arrastre = null; // { ultimo: ángulo del dedo, t, v }
  let ruedaPintada = '';

  const ruletaActual = () => pref.ruletas[Math.min(pref.ruleta, pref.ruletas.length - 1)] || pref.ruletas[0];

  function pintarRuleta() {
    const actual = ruletaActual();
    $('.ruleta-listas').innerHTML = pref.ruletas
      .map((r, i) => `<button class="boton" type="button" data-ruleta="${i}" aria-pressed="${r === actual}">${escapar(r.nombre)}</button>`)
      .join('');
    const opciones = actual.opciones;
    const firma = JSON.stringify(opciones);
    if (firma !== ruedaPintada) {
      ruedaPintada = firma;
      const n = opciones.length;
      const paso = 360 / n;
      const punto = (grados, radio) => [radio * Math.cos((grados * Math.PI) / 180), radio * Math.sin((grados * Math.PI) / 180)];
      ruedaEl.innerHTML =
        opciones
          .map((opcion, i) => {
            const [x1, y1] = punto(i * paso, 100);
            const [x2, y2] = punto((i + 1) * paso, 100);
            const medio = i * paso + paso / 2;
            const texto = opcion.length > 16 ? `${opcion.slice(0, 15)}…` : opcion;
            const sector = n === 1 ? '<circle r="100"' : `<path d="M0 0L${x1.toFixed(2)} ${y1.toFixed(2)}A100 100 0 ${paso > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z"`;
            // en la mitad izquierda el texto se voltea, para que no quede de cabeza
            const alReves = medio > 90 && medio < 270;
            const giro = alReves ? `rotate(${(medio + 180).toFixed(2)}) translate(-94 0)` : `rotate(${medio.toFixed(2)}) translate(94 0)`;
            return `${sector} fill="${COLORES[i % COLORES.length]}"/><text transform="${giro}" text-anchor="${alReves ? 'start' : 'end'}" dominant-baseline="central" font-size="${n > 10 ? 7 : n > 6 ? 9 : 11}">${escapar(texto)}</text>`;
          })
          .join('') + '<circle r="9" class="ruleta-eje"/>';
    }
    ruedaEl.style.transform = `rotate(${angulo}deg)`;
  }

  /** La opción que queda bajo la flecha (arriba) con la rueda en `angulo`. */
  function opcionArriba() {
    const opciones = ruletaActual().opciones;
    const local = (((270 - angulo) % 360) + 360) % 360;
    return opciones[Math.floor(local / (360 / opciones.length)) % opciones.length];
  }

  let cuadroRuleta = 0;
  function girarRuleta(inicial) {
    velocidad = inicial;
    if (girando) return;
    girando = true;
    $('.ruleta-resultado').textContent = '…';
    let antes = performance.now();
    const paso = (ahora) => {
      const dt = Math.min(0.05, (ahora - antes) / 1000);
      antes = ahora;
      angulo += velocidad * dt;
      velocidad *= Math.exp(-dt * 0.85);
      ruedaEl.style.transform = `rotate(${angulo}deg)`;
      if (Math.abs(velocidad) < 9) {
        girando = false;
        $('.ruleta-resultado').textContent = opcionArriba();
        return;
      }
      cuadroRuleta = requestAnimationFrame(paso);
    };
    cuadroRuleta = requestAnimationFrame(paso);
  }

  const anguloDelDedo = (evento) => {
    const caja = ruedaEl.getBoundingClientRect();
    return (Math.atan2(evento.clientY - (caja.top + caja.height / 2), evento.clientX - (caja.left + caja.width / 2)) * 180) / Math.PI;
  };
  ruedaEl.addEventListener('pointerdown', (evento) => {
    evento.preventDefault();
    ruedaEl.setPointerCapture(evento.pointerId);
    cancelAnimationFrame(cuadroRuleta);
    girando = false;
    velocidad = 0;
    arrastre = { ultimo: anguloDelDedo(evento), t: performance.now(), v: 0 };
  });
  ruedaEl.addEventListener('pointermove', (evento) => {
    if (!arrastre) return;
    const aqui = anguloDelDedo(evento);
    const delta = ((aqui - arrastre.ultimo + 540) % 360) - 180;
    const ahora = performance.now();
    const dt = Math.max(1, ahora - arrastre.t) / 1000;
    arrastre.v = arrastre.v * 0.5 + (delta / dt) * 0.5;
    arrastre.ultimo = aqui;
    arrastre.t = ahora;
    angulo += delta;
    ruedaEl.style.transform = `rotate(${angulo}deg)`;
  });
  const soltarRueda = () => {
    if (!arrastre) return;
    const impulso = performance.now() - arrastre.t < 120 ? arrastre.v : 0;
    arrastre = null;
    // un empujón suave no cuenta como giro: tiene que salir con ganas
    // con un toque de azar: si no, dos empujones igual de fuertes caerían en el mismo sitio
    if (Math.abs(impulso) > 200) girarRuleta(Math.sign(impulso) * Math.min(2400, Math.max(500, Math.abs(impulso))) * (0.75 + azar(500) / 1000));
    else $('.ruleta-resultado').textContent = 'Gírala con más fuerza, o toca Girar';
  };
  ruedaEl.addEventListener('pointerup', soltarRueda);
  ruedaEl.addEventListener('pointercancel', soltarRueda);

  function abrirEditor(abrirlo) {
    editorEl.hidden = !abrirlo;
    if (!abrirlo) return;
    const actual = ruletaActual();
    editorEl.elements.nombre.value = actual.nombre;
    editorEl.elements.opciones.value = actual.opciones.join('\n');
  }
  editorEl.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const opciones = editorEl.elements.opciones.value
      .split('\n')
      .map((linea) => linea.trim())
      .filter(Boolean)
      .slice(0, 24);
    if (opciones.length < 2) {
      $('.ruleta-resultado').textContent = 'Pon al menos dos opciones';
      return;
    }
    const actual = ruletaActual();
    actual.nombre = editorEl.elements.nombre.value.trim() || 'Ruleta';
    actual.opciones = opciones;
    recordar();
    abrirEditor(false);
    $('.ruleta-resultado').textContent = 'Gírala con el dedo';
    pintarRuleta();
  });

  // -------------------------------------------------------------------------
  // Dados y número al azar
  // -------------------------------------------------------------------------
  const mesaEl = $('.dados-mesa');
  let rodando = false;
  const PUNTOS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const htmlDado = (valor) => `<span class="dado" data-valor="${valor}">${Array.from({ length: 9 }, (_, i) => `<i${PUNTOS[valor].includes(i) ? ' class="punto-dado"' : ''}></i>`).join('')}</span>`;
  let valoresDados = [];

  function pintarDados() {
    el.querySelectorAll('[data-dados]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.dados) === pref.dados)));
    if (valoresDados.length !== pref.dados) valoresDados = Array.from({ length: pref.dados }, (_, i) => (i % 6) + 1);
    mesaEl.innerHTML = valoresDados.map(htmlDado).join('');
    const desde = el.querySelector('[name="desde"]');
    const hasta = el.querySelector('[name="hasta"]');
    if (document.activeElement !== desde) desde.value = pref.desde;
    if (document.activeElement !== hasta) hasta.value = pref.hasta;
  }

  function lanzarDados() {
    if (rodando) return;
    rodando = true;
    mesaEl.classList.add('rodando');
    $('.dados-total').textContent = '…';
    let cuadros = 0;
    const reloj = setInterval(() => {
      valoresDados = Array.from({ length: pref.dados }, () => azar(6) + 1);
      mesaEl.innerHTML = valoresDados.map(htmlDado).join('');
      cuadros += 1;
      if (cuadros < 9) return;
      clearInterval(reloj);
      rodando = false;
      mesaEl.classList.remove('rodando');
      const total = valoresDados.reduce((a, b) => a + b, 0);
      $('.dados-total').textContent = pref.dados === 1 ? `Salió ${total}` : `${valoresDados.join(' + ')} = ${total}`;
    }, 70);
  }
  mesaEl.addEventListener('click', lanzarDados);

  function sacarNumero() {
    let desde = Math.round(Number(el.querySelector('[name="desde"]').value));
    let hasta = Math.round(Number(el.querySelector('[name="hasta"]').value));
    if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return;
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    if (hasta - desde > 1e9) hasta = desde + 1e9;
    pref.desde = desde;
    pref.hasta = hasta;
    recordar();
    $('.numero-resultado').textContent = String(desde + azar(hasta - desde + 1));
  }

  // -------------------------------------------------------------------------
  // Temporizador
  // -------------------------------------------------------------------------
  let totalTemporizador = 0; // ms del último que se puso (para la barra)
  let alarma = null; // reloj de la alarma mientras suena

  const restaTemporizador = () => (!pref.temporizador ? 0 : pref.temporizador.fin ? pref.temporizador.fin - Date.now() : pref.temporizador.resta);

  // La alarma se deja programada en el reloj del audio unos segundos antes del final: así
  // suena en el instante exacto, sin esperar a que la página se entere de que acabó.
  let anticipo = null; // { fin, notas: [osciladores] }
  function quitarAnticipo() {
    if (anticipo) {
      for (const nota of anticipo.notas) {
        try {
          nota.stop();
        } catch {
          // ya había sonado
        }
      }
    }
    anticipo = null;
    despierto('temporizador', false);
  }
  const TANDA = [0, 0.22, 0.44];
  const sonarTanda = (cuando) => TANDA.map((d) => pitido(1175, cuando + d, 0.16, 0.7)).filter(Boolean);

  function anticiparAlarma() {
    const fin = pref.temporizador && pref.temporizador.fin;
    if (!fin || (anticipo && anticipo.fin === fin)) return;
    const falta = (fin - Date.now()) / 1000;
    if (falta > 5 || falta <= 0.05) return;
    quitarAnticipo();
    const c = audio();
    if (!c || c.state !== 'running') return; // sin audio listo: sonará al terminar, apenas se pueda
    despierto('temporizador', true);
    anticipo = { fin, notas: sonarTanda(c.currentTime + falta) };
  }

  function ponerTemporizador(ms) {
    audio(); // el toque que lo pone deja listo el sonido de la alarma
    callarAlarma();
    quitarAnticipo();
    if (ms <= 0) pref.temporizador = null;
    else pref.temporizador = { fin: Date.now() + ms };
    totalTemporizador = Math.max(ms, 0);
    recordar();
    pintarTemporizador();
  }

  /** `yaSono`: la primera tanda ya estaba programada y sonó sola al llegar a cero. */
  function sonarAlarma(yaSono) {
    callarAlarma();
    despierto('alarma', true);
    let veces = 0;
    const tanda = () => {
      cuandoSuene(() => sonarTanda(ctx.currentTime + 0.01));
      veces += 1;
      if (veces >= 20) callarAlarma(); // medio minuto y se calla sola
    };
    if (yaSono) veces = 1;
    else tanda();
    alarma = setInterval(tanda, 1500);
  }
  function callarAlarma() {
    if (alarma) clearInterval(alarma);
    alarma = null;
    despierto('alarma', false);
  }

  let terminado = false;
  function pintarTemporizador() {
    const resta = restaTemporizador();
    const corre = Boolean(pref.temporizador && pref.temporizador.fin);
    const texto = pref.temporizador ? textoCuenta(resta) : terminado ? '¡Tiempo!' : '0:00';
    const cifra = $('.temporizador-cifra');
    if (cifra.textContent !== texto) cifra.textContent = texto;
    cifra.classList.toggle('terminado', terminado);
    $('.temporizador-barra div').style.width = `${pref.temporizador && totalTemporizador ? Math.min(100, Math.max(0, (resta / totalTemporizador) * 100)) : 0}%`;
    const pausa = el.querySelector('[data-accion="pausar-temporizador"]');
    pausa.textContent = corre ? 'Pausar' : 'Seguir';
    pausa.disabled = !pref.temporizador;
    el.querySelector('[data-accion="detener-temporizador"]').textContent = terminado ? 'Callar alarma' : 'Quitar';
    alTemporizador(pref.temporizador ? `${corre ? '' : '⏸ '}${textoCuenta(resta)}` : terminado ? '¡Tiempo!' : null, terminado);
  }

  // -------------------------------------------------------------------------
  // Cronómetro
  // -------------------------------------------------------------------------
  const tiempoCrono = () => pref.cronometro.base + (pref.cronometro.desde != null ? Date.now() - pref.cronometro.desde : 0);
  let vueltasPintadas = -1;

  function pintarCronometro(todo = false) {
    const crono = pref.cronometro;
    $('.cronometro-cifra').textContent = textoCrono(tiempoCrono());
    if (!todo && vueltasPintadas === crono.vueltas.length) return;
    vueltasPintadas = crono.vueltas.length;
    const corre = crono.desde != null;
    el.querySelector('[data-accion="crono-iniciar"]').textContent = corre ? 'Parar' : crono.base ? 'Seguir' : 'Iniciar';
    el.querySelector('[data-accion="crono-vuelta"]').disabled = !corre;
    // la más reciente arriba; cada una con su tiempo y el acumulado
    $('.cronometro-vueltas').innerHTML = crono.vueltas
      .map((total, i) => `<li><span>Vuelta ${i + 1}</span><strong>${textoCrono(total - (crono.vueltas[i - 1] || 0))}</strong><span>${textoCrono(total)}</span></li>`)
      .reverse()
      .join('');
  }

  // -------------------------------------------------------------------------
  // Reloj
  // -------------------------------------------------------------------------
  let bloqueo = null;
  function pintarReloj() {
    const ahora = new Date();
    const h = ahora.getHours();
    $('.reloj-hm').textContent = `${h % 12 || 12}:${dosCifras(ahora.getMinutes())}`;
    $('.reloj-seg').textContent = dosCifras(ahora.getSeconds());
    $('.reloj-ampm').textContent = h < 12 ? 'a. m.' : 'p. m.';
    const fecha = ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    if ($('.reloj-fecha').textContent !== fecha) $('.reloj-fecha').textContent = fecha;
    el.querySelector('[data-herramienta="reloj"]').classList.toggle('noche', Boolean(pref.noche));
    el.querySelector('[data-accion="noche"]').setAttribute('aria-pressed', String(Boolean(pref.noche)));
  }
  /** Con el reloj a la vista, la pantalla no se apaga. */
  function cuidarPantalla() {
    const quiere = visible && pref.herramienta === 'reloj' && !document.hidden;
    if (quiere && !bloqueo && navigator.wakeLock) {
      navigator.wakeLock.request('screen').then(
        (b) => {
          bloqueo = b;
          b.addEventListener('release', () => {
            if (bloqueo === b) bloqueo = null;
          });
        },
        () => {},
      );
    } else if (!quiere && bloqueo) {
      bloqueo.release().catch(() => {});
      bloqueo = null;
    }
  }

  // -------------------------------------------------------------------------
  // DJ música (launchpad)
  // -------------------------------------------------------------------------
  /**
   * Al entrar al DJ se deja el audio listo y despierto (el toque que lo abre da el permiso);
   * al salir —a otra herramienta, a la lista o a otra pestaña— se detiene la música.
   */
  function cuidarDj() {
    const dentro = visible && pref.herramienta === 'launchpad';
    if (dentro) {
      losPads();
      cuandoSuene(() => despierto('dj', visible && pref.herramienta === 'launchpad'));
    } else {
      if (pads && pads.baseSonando()) pads.base({ sonar: false });
      despierto('dj', false);
    }
  }

  function pintarBase() {
    const sonando = Boolean(pads && pads.baseSonando());
    const boton = el.querySelector('[data-accion="base"]');
    boton.textContent = sonando ? '■ Parar base' : '▶ Base';
    boton.setAttribute('aria-pressed', String(sonando));
    el.querySelectorAll('[data-ritmo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ritmo === pref.ritmo)));
    $('.pads-bpm').textContent = `${pref.bpm} bpm`;
    const entrada = el.querySelector('[name="bpm"]');
    if (document.activeElement !== entrada) entrada.value = pref.bpm;
  }

  el.querySelectorAll('.pad').forEach((pad) => {
    pad.addEventListener('pointerdown', (evento) => {
      evento.preventDefault();
      const p = losPads();
      // si el audio aún no arrancó, el golpe suena apenas arranque (no se pierde)
      if (p) cuandoSuene(() => p.tocar(Number(pad.dataset.pad)));
      pad.classList.add('tocado');
      setTimeout(() => pad.classList.remove('tocado'), 130);
    });
    // en pantallas táctiles el navegador da el permiso de sonido al levantar el dedo
    pad.addEventListener('pointerup', audio);
    pad.addEventListener('contextmenu', (evento) => evento.preventDefault());
  });

  // -------------------------------------------------------------------------
  // Radio
  // -------------------------------------------------------------------------
  let radio = null; // <audio>
  let radioSonando = false;
  let radioEstado = '';

  function pintarRadio() {
    const boton = el.querySelector('[data-accion="radio"]');
    boton.textContent = radioSonando ? '■ Detener' : '▶ Escuchar';
    boton.setAttribute('aria-pressed', String(radioSonando));
    $('.radio-estado').textContent = radioEstado;
    const entrada = el.querySelector('[name="volumen"]');
    if (document.activeElement !== entrada) entrada.value = pref.volumen;
  }

  function alternarRadio() {
    if (radioSonando) {
      radioSonando = false;
      radioEstado = '';
      radio.pause();
      radio.removeAttribute('src'); // corta la descarga: es una transmisión en vivo
      radio.load();
      pintarRadio();
      pintarEstados();
      return;
    }
    if (!radio) {
      radio = new Audio();
      radio.preload = 'none';
      radio.addEventListener('playing', () => {
        radioEstado = 'Al aire';
        pintarRadio();
      });
      radio.addEventListener('waiting', () => {
        if (radioSonando) radioEstado = 'Cargando…';
        pintarRadio();
      });
      radio.addEventListener('error', () => {
        if (!radioSonando) return;
        radioSonando = false;
        radioEstado = 'No se pudo conectar con la emisora. Inténtalo de nuevo.';
        pintarRadio();
        pintarEstados();
      });
    }
    radioSonando = true;
    radioEstado = 'Conectando…';
    radio.volume = pref.volumen / 100;
    radio.src = RADIO.url;
    radio.play().catch(() => {
      if (!radioSonando) return;
      radioSonando = false;
      radioEstado = 'El navegador no dejó reproducir. Toca de nuevo.';
      pintarRadio();
    });
    if (navigator.mediaSession && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: RADIO.nombre, artist: RADIO.detalle });
    }
    pintarRadio();
    pintarEstados();
  }

  // -------------------------------------------------------------------------
  // Toques
  // -------------------------------------------------------------------------
  el.addEventListener('click', (evento) => {
    const objetivo = evento.target;
    const tarjeta = objetivo.closest('[data-abrir]');
    if (tarjeta) return void abrir(tarjeta.dataset.abrir);
    if (objetivo.closest('.util-volver')) return void abrir(null);

    const lista = objetivo.closest('[data-ruleta]');
    if (lista) {
      pref.ruleta = Number(lista.dataset.ruleta);
      recordar();
      abrirEditor(false);
      $('.ruleta-resultado').textContent = 'Gírala con el dedo';
      return void pintarRuleta();
    }
    const cuantos = objetivo.closest('[data-dados]');
    if (cuantos) {
      pref.dados = Number(cuantos.dataset.dados);
      recordar();
      return void pintarDados();
    }
    const minutos = objetivo.closest('[data-minutos]');
    if (minutos) {
      terminado = false;
      return void ponerTemporizador(Number(minutos.dataset.minutos) * 60000);
    }
    const sumar = objetivo.closest('[data-sumar]');
    if (sumar) {
      terminado = false;
      const nuevo = restaTemporizador() + Number(sumar.dataset.sumar) * 60000;
      const pausado = pref.temporizador && !pref.temporizador.fin;
      ponerTemporizador(nuevo);
      if (pausado && pref.temporizador) pref.temporizador = { resta: nuevo };
      recordar();
      return void pintarTemporizador();
    }
    const ritmo = objetivo.closest('[data-ritmo]');
    if (ritmo) {
      pref.ritmo = ritmo.dataset.ritmo;
      recordar();
      if (pads) pads.base({ ritmo: pref.ritmo });
      return void pintarBase();
    }

    const accion = objetivo.closest('[data-accion]');
    if (!accion) return;
    switch (accion.dataset.accion) {
      case 'lanzar':
        lanzarMoneda();
        break;
      case 'girar':
        girarRuleta((900 + azar(900)) * (azar(2) ? 1 : -1));
        break;
      case 'editar-ruleta':
        abrirEditor(editorEl.hidden);
        break;
      case 'cerrar-editor':
        abrirEditor(false);
        break;
      case 'nueva-ruleta':
        pref.ruletas.push({ nombre: 'Ruleta nueva', opciones: ['Opción 1', 'Opción 2'] });
        pref.ruleta = pref.ruletas.length - 1;
        recordar();
        pintarRuleta();
        abrirEditor(true);
        break;
      case 'borrar-ruleta':
        if (pref.ruletas.length > 1) {
          pref.ruletas.splice(Math.min(pref.ruleta, pref.ruletas.length - 1), 1);
          pref.ruleta = 0;
          recordar();
          abrirEditor(false);
          pintarRuleta();
        } else $('.ruleta-resultado').textContent = 'Tiene que quedar al menos una ruleta';
        break;
      case 'lanzar-dados':
        lanzarDados();
        break;
      case 'numero':
        sacarNumero();
        break;
      case 'pausar-temporizador':
        if (!pref.temporizador) break;
        audio();
        pref.temporizador = pref.temporizador.fin ? { resta: Math.max(0, pref.temporizador.fin - Date.now()) } : { fin: Date.now() + pref.temporizador.resta };
        quitarAnticipo();
        recordar();
        pintarTemporizador();
        break;
      case 'detener-temporizador':
        terminado = false;
        ponerTemporizador(0);
        break;
      case 'crono-iniciar': {
        const crono = pref.cronometro;
        if (crono.desde != null) {
          crono.base += Date.now() - crono.desde;
          crono.desde = null;
        } else crono.desde = Date.now();
        recordar();
        pintarCronometro(true);
        break;
      }
      case 'crono-vuelta':
        if (pref.cronometro.desde != null) {
          pref.cronometro.vueltas.push(tiempoCrono());
          recordar();
          pintarCronometro(true);
        }
        break;
      case 'crono-reiniciar':
        pref.cronometro = { base: 0, desde: null, vueltas: [] };
        recordar();
        pintarCronometro(true);
        break;
      case 'noche':
        pref.noche = !pref.noche;
        recordar();
        pintarReloj();
        break;
      case 'pantalla': {
        const caja = el.querySelector('[data-herramienta="reloj"]');
        if (document.fullscreenElement) document.exitFullscreen();
        else if (caja.requestFullscreen) caja.requestFullscreen().catch(() => {});
        break;
      }
      case 'base': {
        const p = losPads();
        if (!p) break;
        if (p.baseSonando()) p.base({ sonar: false });
        else {
          cuandoSuene(() => {
            if (visible && pref.herramienta === 'launchpad' && !p.baseSonando()) p.base({ sonar: true, bpm: pref.bpm, ritmo: pref.ritmo });
            pintarBase();
          });
        }
        pintarBase();
        break;
      }
      case 'radio':
        alternarRadio();
        break;
      default:
    }
  });

  el.addEventListener('input', (evento) => {
    const entrada = evento.target;
    if (entrada.name === 'bpm') {
      pref.bpm = Number(entrada.value);
      recordar();
      if (pads) pads.base({ bpm: pref.bpm });
      pintarBase();
    } else if (entrada.name === 'volumen') {
      pref.volumen = Number(entrada.value);
      recordar();
      if (radio) radio.volume = pref.volumen / 100;
    }
  });

  // -------------------------------------------------------------------------
  // Reloj de la sección: el temporizador se revisa siempre; lo demás, solo si se ve
  // -------------------------------------------------------------------------
  setInterval(() => {
    if (pref.temporizador && pref.temporizador.fin && pref.temporizador.fin <= Date.now()) {
      const yaSono = Boolean(anticipo && anticipo.fin === pref.temporizador.fin);
      anticipo = null; // sus notas ya están sonando: no se cortan
      despierto('temporizador', false);
      pref.temporizador = null;
      terminado = true;
      recordar();
      sonarAlarma(yaSono);
      pintarTemporizador();
    } else if (pref.temporizador || terminado) {
      anticiparAlarma();
      pintarTemporizador();
    }
    if (!visible || document.hidden) return;
    if (pref.herramienta === 'reloj') pintarReloj();
    if (!pref.herramienta) pintarEstados();
  }, 250);

  // El cronómetro, con centésimas, va con los cuadros de la pantalla mientras se ve.
  const cuadroCrono = () => {
    if (visible && pref.herramienta === 'cronometro' && pref.cronometro.desde != null) pintarCronometro();
    requestAnimationFrame(cuadroCrono);
  };
  requestAnimationFrame(cuadroCrono);

  document.addEventListener('visibilitychange', cuidarPantalla);
  // tras recargar con un temporizador andando, el sonido queda bloqueado hasta el primer toque
  document.addEventListener('pointerdown', () => {
    if (pref.temporizador || terminado) audio();
  });

  if (pref.temporizador) totalTemporizador = Math.max(1, restaTemporizador());
  pintar();
  pintarTemporizador();

  return {
    mostrar(ver) {
      visible = ver;
      if (ver) pintar();
      else cuidarDj(); // al salir de la pestaña, la música del DJ se detiene
      cuidarPantalla();
    },
    abrir,
    /** Espacio lanza o gira en la herramienta abierta; Esc vuelve a la lista. Devuelve true si la usó. */
    tecla(evento) {
      if (evento.target.matches('input, textarea, button')) return false;
      if (evento.key === 'Escape' && pref.herramienta) {
        abrir(null);
        return true;
      }
      if (evento.key !== ' ') return false;
      if (pref.herramienta === 'moneda') lanzarMoneda();
      else if (pref.herramienta === 'ruleta') girarRuleta((900 + azar(900)) * (azar(2) ? 1 : -1));
      else if (pref.herramienta === 'dados') lanzarDados();
      else return false;
      return true;
    },
  };
}
