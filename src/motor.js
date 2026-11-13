// Sección «Motor»: sonido de motor de gasolina para un carro eléctrico (o cualquiera).
// El sonido se sintetiza en vivo (motor-audio.js) y sigue la velocidad del GPS; también hay
// un modo de prueba con pedales para oírlo sin moverse.
//
// Aquí va lo que no es audio: la velocidad (GPS o pedales), una caja de cambios automática
// imaginaria que convierte velocidad y aceleración en revoluciones y carga, y la interfaz.
import { crearSonido } from './motor-audio.js';
import { ICONOS } from './iconos.js';

// res: resonancias [Hz, Q, ganancia]; marchas: km/h al corte en cada marcha.
const MOTORES = [
  {
    id: 'v8',
    nombre: 'V8 americano',
    detalle: 'Plano cruzado · borboteo grave',
    pesos: [1, 0.62, 0.7, 1, 0.66, 1, 0.95, 0.6],
    ralenti: 700,
    corte: 6500,
    marchas: [68, 115, 165, 220, 285],
    res: [[95, 3, 1.2], [210, 4, 0.9], [520, 3, 0.5], [1500, 2, 0.25]],
    ancho: 1.3,
    ruido: 0.25,
    brillo: 3200,
  },
  {
    id: 'v8d',
    nombre: 'V8 deportivo',
    detalle: 'Plano · agudo y rabioso',
    pesos: [1, 0.94, 1, 0.92, 1, 0.95, 0.98, 0.93],
    ralenti: 950,
    corte: 8500,
    marchas: [72, 118, 160, 205, 255, 320],
    res: [[160, 3, 0.8], [420, 4, 0.9], [900, 3, 0.7], [2400, 2, 0.4]],
    ancho: 0.9,
    ruido: 0.3,
    brillo: 4800,
  },
  {
    id: 'v12',
    nombre: 'V12',
    detalle: 'Doce cilindros · aullido suave',
    pesos: [1, 0.97, 1, 0.96, 1, 0.98, 1, 0.97, 0.99, 0.96, 1, 0.98],
    ralenti: 900,
    corte: 9000,
    marchas: [75, 122, 168, 215, 268, 340],
    res: [[220, 3, 0.6], [640, 4, 0.8], [1300, 3, 0.7], [3000, 2, 0.45]],
    ancho: 0.8,
    ruido: 0.22,
    brillo: 5600,
  },
  {
    id: 'boxer',
    nombre: 'Bóxer 6',
    detalle: 'Seis opuestos · metálico',
    pesos: [1, 0.85, 0.95, 0.8, 1, 0.9],
    ralenti: 850,
    corte: 9000,
    marchas: [70, 118, 162, 208, 258, 318],
    res: [[180, 4, 0.8], [480, 5, 1], [1100, 4, 0.8], [2600, 3, 0.5]],
    ancho: 1,
    ruido: 0.35,
    brillo: 5000,
  },
  {
    id: 'turbo',
    nombre: '4 cilindros turbo',
    detalle: 'Cuatro en línea · silbido del turbo',
    pesos: [1, 0.9, 0.95, 0.88],
    ralenti: 850,
    corte: 7000,
    marchas: [55, 95, 140, 185, 230, 275],
    res: [[130, 3, 1], [330, 4, 0.8], [800, 3, 0.5], [2000, 2, 0.3]],
    ancho: 1.1,
    ruido: 0.3,
    brillo: 3800,
    turbo: true,
  },
  {
    id: 'electrico',
    nombre: 'Eléctrico',
    detalle: 'Zumbido que sube con la velocidad',
    pesos: [],
    ralenti: 0,
    corte: 16000,
    marchas: [300],
    res: [],
    ancho: 1,
    ruido: 0,
    brillo: 4000,
    electrico: true,
  },
];

const POR_DEFECTO = {
  motor: 'v8',
  modo: 'gps',
  volumen: 100,
  intensidad: 50,
  caracter: 50,
  petardeo: 15,
  tono: 0,
  silbido: 0,
  unidades: 'kmh',
  auto: false,
};

const AJUSTES = [
  { clave: 'intensidad', titulo: 'Intensidad', min: 0, max: 100, ayuda: 'Qué tan fácil la aceleración se vuelve acelerador y qué tan tarde cambia de marcha.' },
  { clave: 'caracter', titulo: 'Carácter', min: 0, max: 100, ayuda: 'De motor de serie y silenciado a leva brava con escape libre.' },
  { clave: 'petardeo', titulo: 'Petardeo', min: 0, max: 100, ayuda: 'Cuánto explota el escape al soltar el acelerador; 0 % es un motor limpio.' },
  { clave: 'tono', titulo: 'Tono del silbido', min: -100, max: 100, ayuda: 'Más grave o más agudo (turbo, compresor o motor eléctrico).' },
  { clave: 'silbido', titulo: 'Volumen del silbido', min: -100, max: 100, ayuda: 'Súbelo para añadir un silbido de compresor a cualquier motor.' },
];

// Demostración: [segundos, acelerador (0 a 1, -1 = suelto), freno, acelerar en neutro]
const DEMO = [
  [0.9, -1, 0, 1],
  [0.7, -1, 0, 0],
  [0.8, -1, 0, 1],
  [1.0, -1, 0, 0],
  [8.5, 1, 0, 0],
  [2.5, 0, 0, 0],
  [2.5, -1, 0, 0],
  [3.5, 0.8, 0, 0],
  [2.0, -1, 0, 0],
  [6.5, -1, 0.7, 0],
  [1.2, -1, 1, 0],
];

const limitar = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mezclar = (a, b, t) => a + (b - a) * t;

/** Metros entre dos puntos (para la velocidad cuando el GPS no la da). */
function distancia(a, b) {
  const rad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
  const y = (b.latitude - a.latitude) * rad;
  return Math.hypot(x, y) * 6371000;
}

// Reloj: arco de 270° con las revoluciones.
const RADIO = 120;
const VUELTA = 2 * Math.PI * RADIO;
const ARCO = VUELTA * 0.75;

/**
 * Monta la sección en `el`. `leer(clave, porDefecto)` y `guardar(clave, valor)` son las
 * preferencias de la app. Devuelve { mostrar(visible), tecla(evento, abajo) }.
 */
export function crearMotor(el, { leer, guardar }) {
  const pref = { ...POR_DEFECTO, ...leer('motor', {}) };
  if (!MOTORES.some((m) => m.id === pref.motor)) pref.motor = POR_DEFECTO.motor;
  // El volumen cambió de escala (100 % es ahora el máximo real): se parte de ahí una vez.
  if (pref.escala !== 2) {
    pref.escala = 2;
    pref.volumen = 100;
  }
  if (pref.modo !== 'gps' && pref.modo !== 'prueba') pref.modo = 'gps';
  const recordar = () => guardar('motor', pref);
  let motor = MOTORES.find((m) => m.id === pref.motor);

  el.innerHTML = `
    <div class="motor">
      <div class="motor-tablero">
        <div class="motor-reloj">
          <svg viewBox="0 0 300 300" aria-hidden="true">
            <g transform="rotate(135 150 150)" fill="none" stroke-width="16" stroke-linecap="round">
              <circle class="reloj-fondo" cx="150" cy="150" r="${RADIO}" stroke-dasharray="${ARCO} ${VUELTA}"/>
              <circle class="reloj-rojo" cx="150" cy="150" r="${RADIO}" stroke-linecap="butt"/>
              <circle class="reloj-valor" cx="150" cy="150" r="${RADIO}" stroke-dasharray="0 ${VUELTA}"/>
            </g>
          </svg>
          <div class="reloj-centro">
            <span class="reloj-marcha">–</span>
            <span class="reloj-velocidad">0</span>
            <span class="reloj-unidad">km/h</span>
            <span class="reloj-rpm">Motor apagado</span>
          </div>
        </div>
        <button class="boton boton-principal motor-encender" type="button" aria-pressed="false">${ICONOS.encender}<span>Encender motor</span></button>
        <p class="motor-estado" aria-live="polite"></p>
      </div>

      <div class="motor-controles">
        <h1 class="motor-titulo">Motor</h1>
        <p class="motor-intro">Ponle sonido de motor de gasolina a tu carro eléctrico: se genera en vivo y sigue tu velocidad por GPS. Suena por los parlantes, como la música.</p>

        <div class="motor-lista" role="radiogroup" aria-label="Motor">
          ${MOTORES.map(
            (m) => `<button class="motor-opcion" type="button" role="radio" data-motor="${m.id}" aria-checked="false"><strong>${m.nombre}</strong><span>${m.detalle}</span></button>`,
          ).join('')}
        </div>

        <div class="segmento motor-modos" role="group" aria-label="Modo">
          <button type="button" data-modo="gps" aria-pressed="false">Con GPS</button>
          <button type="button" data-modo="prueba" aria-pressed="false">Prueba con pedales</button>
        </div>

        <div class="motor-gps">
          <button class="boton motor-rev" type="button">${ICONOS.motor}<span>Acelerar en neutro</span></button>
          <p class="secundario">Con el carro detenido, deja presionado para dar un acelerón. En marcha, el motor sigue tu velocidad con cerca de un segundo de retraso (lo que tarda el GPS).</p>
        </div>

        <div class="motor-prueba" hidden>
          <div class="pedales">
            <button class="pedal pedal-freno" type="button" data-pedal="freno" aria-label="Freno: más abajo frena más fuerte"><span class="pedal-nivel"></span><span class="pedal-nombre">Freno</span></button>
            <button class="pedal pedal-gas" type="button" data-pedal="gas" aria-label="Acelerador: arriba mantiene la velocidad, más abajo acelera más"><span class="pedal-nivel"></span><span class="pedal-nombre">Acelerador</span></button>
          </div>
          <div class="motor-fila">
            <button class="boton motor-demo" type="button">${ICONOS.reproducir}<span>Demostración</span></button>
            <button class="boton motor-rev" type="button">${ICONOS.motor}<span>Acelerar en neutro</span></button>
          </div>
          <p class="secundario">Presiona los pedales: más abajo es más fuerte, y la parte de arriba del acelerador mantiene la velocidad. Con teclado: ↑ acelera, ↓ frena.</p>
        </div>

        <label class="deslizador"><span>Volumen</span><input type="range" data-ajuste="volumen" min="0" max="100" step="1"><output></output></label>

        <details class="motor-mas">
          <summary>Más ajustes</summary>
          ${AJUSTES.map(
            (a) => `<label class="deslizador" title="${a.ayuda}"><span>${a.titulo}</span><input type="range" data-ajuste="${a.clave}" min="${a.min}" max="${a.max}" step="1"><output></output></label>`,
          ).join('')}
          <div class="motor-fila motor-opciones">
            <span>Unidades</span>
            <div class="segmento" role="group" aria-label="Unidades">
              <button type="button" data-unidades="kmh" aria-pressed="false">km/h</button>
              <button type="button" data-unidades="mph" aria-pressed="false">mph</button>
            </div>
          </div>
          <div class="motor-fila motor-opciones">
            <span>Encender al abrir esta pestaña</span>
            <div class="segmento" role="group" aria-label="Encender al abrir">
              <button type="button" data-auto="1" aria-pressed="false">Sí</button>
              <button type="button" data-auto="0" aria-pressed="false">No</button>
            </div>
          </div>
          <button class="enlace motor-restablecer" type="button">Restablecer ajustes</button>
        </details>

        <details class="motor-mas">
          <summary>Cómo usarlo en el carro</summary>
          <ol>
            <li>Con el carro parqueado, abre esta página en el navegador del carro (o en el celular conectado por Bluetooth).</li>
            <li>Toca <b>Encender motor</b> y permite el acceso a la ubicación: sin GPS no hay cómo saber la velocidad. La ubicación no sale de este navegador.</li>
            <li>Sube el volumen de medios y maneja. Puedes dejar la música puesta: el motor suena encima.</li>
            <li>Deja la página abierta: el sonido se detiene si el navegador pasa a segundo plano.</li>
          </ol>
          <p class="secundario">Suena dentro del carro; una página web no puede usar el parlante exterior.</p>
        </details>

        <p class="motor-aviso">${ICONOS.alerta}<span>Mantén la atención en la vía. El sonido del motor puede tapar sirenas y avisos: usa un volumen prudente.</span></p>
      </div>
    </div>`;

  const $ = (selector) => el.querySelector(selector);
  const encenderEl = $('.motor-encender');
  const estadoEl = $('.motor-estado');
  const valorEl = $('.reloj-valor');
  const rojoEl = $('.reloj-rojo');
  const marchaEl = $('.reloj-marcha');
  const velocidadEl = $('.reloj-velocidad');
  const unidadEl = $('.reloj-unidad');
  const rpmEl = $('.reloj-rpm');
  const demoEl = $('.motor-demo');

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------
  let visible = false;
  let encendido = false;
  let sonido = null; // salida de audio (se crea al encender por primera vez)
  let abriendo = null;
  let errorAudio = '';
  let bloqueo = null; // para que la pantalla no se apague
  const pedales = { gas: -1, freno: 0 }; // -1 = sin pisar
  const teclas = { gas: false, freno: false };
  let rev = false;
  let demo = null; // { paso, hasta }
  const gps = { id: null, estado: 'apagado', v: 0, a: 0, t: 0, previo: null };
  const sim = { v: 0, a: 0, rpm: 0, marcha: 0, carga: 0, cambio: 0, corteHasta: 0, arranque: 0, spool: 0, vRev: 0, t: 0 };

  // -------------------------------------------------------------------------
  // Audio
  // -------------------------------------------------------------------------
  /** Parámetros del sintetizador para el motor y los ajustes actuales. */
  function configuracion() {
    const c = pref.caracter / 100;
    const p = pref.petardeo / 100;
    return {
      pesos: motor.pesos.map((peso) => 1 + (peso - 1) * (0.5 + c)),
      // Ningún motor reparte las explosiones perfectamente parejas: cada cilindro llega al
      // escape con un pequeño adelanto o atraso fijo. Eso da el timbre de motor y no de zumbador.
      desfases: motor.pesos.map((_, i, lista) => (i + 0.09 * (0.6 + 0.8 * c) * Math.sin(i * 2.4 + 1)) / lista.length),
      res: motor.res.map(([f, q, g]) => [f, q * 0.6, g]),
      ancho: motor.ancho * (1.25 - 0.5 * c),
      ruido: motor.ruido * (0.3 + 0.5 * c),
      directo: 0.25 + 0.5 * c,
      irregular: 0.01 + 0.04 * c,
      falla: p * 0.02,
      petardeo: p,
      dureza: 0.15 + 0.85 * c,
      brillo: motor.brillo * (0.45 + 0.9 * c),
      ralenti: motor.ralenti || 1,
      corte: motor.corte,
      nivelMotor: motor.electrico ? 0 : 1,
    };
  }

  const configurar = () => sonido && sonido.configurar(configuracion());

  async function encender() {
    if (encendido) return;
    encendido = true;
    errorAudio = '';
    pintarControles();
    try {
      if (!sonido) {
        abriendo = abriendo || crearSonido();
        sonido = await abriendo;
        abriendo = null;
      }
      sonido.volumen(pref.volumen / 100);
      configurar();
      await sonido.reanudar();
    } catch (error) {
      abriendo = null;
      encendido = false;
      errorAudio = 'No se pudo abrir el audio en este navegador.';
      pintarControles();
      return;
    }
    if (!encendido) return; // lo apagaron mientras abría
    sim.rpm = motor.electrico ? 0 : 250;
    sim.arranque = sim.t + 0.9; // acelerón de arranque: se oye que encendió
    if (pref.modo === 'gps') iniciarGps();
    pedirBloqueo();
    if (navigator.mediaSession && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: `Motor · ${motor.nombre}`, artist: 'Visor Medellín' });
      navigator.mediaSession.setActionHandler('pause', apagar);
      navigator.mediaSession.setActionHandler('stop', apagar);
    }
    pintarControles();
  }

  function apagar() {
    if (!encendido) return;
    encendido = false;
    demo = null;
    rev = false;
    detenerGps();
    if (bloqueo) bloqueo.release().catch(() => {});
    bloqueo = null;
    if (sonido) {
      sonido.fijar({ rpm: sim.rpm, carga: 0, gan: 0, fSil: 400, nSil: 0 });
      // apagado del todo, el audio se pausa (no gasta batería ni figura como «reproduciendo»)
      setTimeout(() => {
        if (!encendido && sonido) sonido.pausar();
      }, 900);
    }
    pintarControles();
  }

  function pedirBloqueo() {
    if (!encendido || bloqueo || !navigator.wakeLock || document.hidden) return;
    navigator.wakeLock.request('screen').then(
      (b) => {
        bloqueo = b;
        b.addEventListener('release', () => {
          if (bloqueo === b) bloqueo = null;
        });
        if (!encendido) b.release().catch(() => {});
      },
      () => {},
    );
  }

  // Sin un toque previo el navegador deja el audio en pausa (pasa al encender solo al abrir):
  // cualquier toque lo suelta.
  const soltarAudio = () => {
    if (encendido && sonido && sonido.suspendido()) sonido.reanudar().catch(() => {});
  };
  document.addEventListener('pointerdown', soltarAudio);
  document.addEventListener('keydown', soltarAudio);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      pedirBloqueo();
      soltarAudio();
    }
  });

  // -------------------------------------------------------------------------
  // GPS
  // -------------------------------------------------------------------------
  function iniciarGps() {
    if (gps.id != null) return;
    if (!navigator.geolocation) {
      gps.estado = 'sin-soporte';
      return;
    }
    gps.estado = 'pidiendo';
    gps.previo = null;
    gps.v = 0;
    gps.a = 0;
    gps.id = navigator.geolocation.watchPosition(
      (posicion) => {
        const ahora = performance.now();
        const { coords } = posicion;
        let v = coords.speed;
        const previo = gps.previo;
        if ((v == null || Number.isNaN(v)) && previo) {
          const dt = (posicion.timestamp - previo.marca) / 1000;
          // sin velocidad del GPS: de la distancia entre dos posiciones (si no es puro ruido)
          v = dt > 0.2 ? distancia(previo.coords, coords) / dt : gps.v;
          if (distancia(previo.coords, coords) < Math.max(3, (coords.accuracy || 0) * 0.3)) v = gps.v * 0.5;
        }
        v = Math.max(0, v || 0);
        if (v < 0.5) v = 0; // el GPS quieto «camina» un poco
        if (previo) {
          const dt = Math.max(0.2, (ahora - gps.t) / 1000);
          gps.a = mezclar(gps.a, limitar((v - gps.v) / dt, -9, 7), 0.7);
        }
        gps.v = v;
        gps.t = ahora;
        gps.previo = { coords: { latitude: coords.latitude, longitude: coords.longitude }, marca: posicion.timestamp };
        gps.estado = 'activo';
      },
      (error) => {
        gps.estado = error.code === 1 ? 'denegado' : 'sin-senal';
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  function detenerGps() {
    if (gps.id != null) navigator.geolocation.clearWatch(gps.id);
    gps.id = null;
    gps.estado = 'apagado';
    gps.v = 0;
    gps.a = 0;
  }

  function textoEstado() {
    if (errorAudio) return errorAudio;
    if (!encendido) return pref.modo === 'gps' ? 'Al encender se pedirá permiso de ubicación para medir la velocidad.' : '';
    if (sonido && sonido.suspendido()) return 'Toca la pantalla para que empiece a sonar.';
    if (pref.modo !== 'gps') return demo ? 'Demostración en curso…' : 'Modo de prueba: usa los pedales.';
    if (gps.estado === 'pidiendo') return 'Buscando señal GPS… permite el acceso a la ubicación si el navegador lo pide.';
    if (gps.estado === 'denegado')
      return 'La ubicación está bloqueada: actívala para este sitio en el candado de la barra de direcciones y vuelve a encender. O usa «Prueba con pedales».';
    if (gps.estado === 'sin-soporte') return 'Este navegador no da la ubicación. Usa «Prueba con pedales».';
    if (gps.estado === 'sin-senal' || performance.now() - gps.t > 6000) return 'Sin señal GPS por ahora…';
    if (sim.v < 0.3) return 'GPS activo. Detenido solo se oye el ralentí: para oírlo sin moverte usa «Prueba con pedales» o «Acelerar en neutro».';
    return 'GPS activo: el motor sigue tu velocidad.';
  }

  // -------------------------------------------------------------------------
  // Simulación: velocidad → marcha, revoluciones y carga
  // -------------------------------------------------------------------------
  function entradas() {
    if (demo) {
      const [, gas, freno, neutro] = DEMO[demo.paso];
      return { gas, freno, rev: Boolean(neutro) };
    }
    return {
      gas: teclas.gas ? 0.85 : pedales.gas,
      freno: teclas.freno ? 0.6 : pedales.freno,
      rev,
    };
  }

  function paso(dt) {
    sim.t += dt;
    if (demo && sim.t >= demo.hasta) {
      demo.paso += 1;
      if (demo.paso >= DEMO.length) {
        demo = null;
        pintarControles();
      } else demo.hasta = sim.t + DEMO[demo.paso][0];
    }
    const entrada = entradas();
    const intensidad = pref.intensidad / 100;
    const crucero = (v) => 0.07 + 0.25 * (v / 60) * (v / 60);
    let acelerador = 0;

    if (!encendido) {
      sim.v = Math.max(0, sim.v - 12 * dt);
      sim.a = 0;
    } else if (pref.modo === 'prueba') {
      const v = sim.v;
      if (entrada.freno > 0) sim.a = -(1.5 + entrada.freno * 8.5);
      else if (entrada.gas >= 0) sim.a = entrada.gas * 6.5 * Math.max(0.12, 1 - v / 85);
      else sim.a = -(0.45 + 0.00045 * v * v);
      sim.v = Math.max(0, v + sim.a * dt);
      if (sim.v === 0 && sim.a < 0) sim.a = 0;
      if (entrada.gas >= 0 && !(entrada.freno > 0)) acelerador = limitar(crucero(v) + entrada.gas * (1 - crucero(v)));
      if (sim.v < 0.2 && entrada.gas <= 0) acelerador = 0;
    } else {
      const edad = (performance.now() - gps.t) / 1000;
      const activo = gps.estado === 'activo' && edad < 8;
      const a = activo && edad < 2.5 ? gps.a : 0;
      const previsto = activo ? Math.max(0, gps.v + a * Math.min(edad, 1.2)) : 0;
      sim.v += (previsto - sim.v) * Math.min(1, dt * 6);
      if (sim.v < 0.05) sim.v = 0;
      sim.a = a;
      const referencia = mezclar(3.2, 1.1, intensidad); // m/s² que equivalen a acelerador a fondo
      acelerador = a < -0.35 || sim.v < 0.3 ? 0 : limitar(crucero(sim.v) + a / referencia);
    }

    const enNeutro = encendido && entrada.rev && sim.v < 2;
    const kmh = sim.v * 3.6;
    const { marchas, corte, ralenti } = motor;
    if (sim.marcha >= marchas.length) sim.marcha = marchas.length - 1;
    const rpmEn = (g) => (kmh / marchas[g]) * corte;

    // Caja automática: cambia más tarde cuanto más acelerador e intensidad.
    if (sim.t - sim.cambio > 0.5 && !enNeutro) {
      const arriba = corte * mezclar(0.42, 0.97, limitar(acelerador * 0.75 + intensidad * 0.35));
      const abajo = corte * mezclar(0.2, 0.52, limitar(acelerador * 0.8 + intensidad * 0.25));
      if (sim.marcha < marchas.length - 1 && rpmEn(sim.marcha) > arriba) {
        sim.marcha += 1;
        sim.cambio = sim.t;
        sim.corteHasta = sim.t + 0.09; // corte de encendido breve: el «golpe» del cambio
      } else if (sim.marcha > 0 && rpmEn(sim.marcha) < abajo && rpmEn(sim.marcha - 1) < corte * 0.92) {
        sim.marcha -= 1;
        sim.cambio = sim.t;
      }
    }

    let objetivo = Math.max(rpmEn(sim.marcha), ralenti);
    // al arrancar en primera el embrague patina: las vueltas suben antes que la velocidad
    if (sim.marcha === 0) objetivo = Math.max(objetivo, ralenti + acelerador * corte * 0.28);
    if (enNeutro) {
      objetivo = corte * 0.82;
      acelerador = 1;
    }
    if (encendido && sim.t < sim.arranque) {
      objetivo = Math.max(objetivo, motor.electrico ? 0 : corte * 0.42);
      acelerador = Math.max(acelerador, 0.6);
    }
    if (!encendido) objetivo = 0;
    else if (!motor.electrico && objetivo <= ralenti * 1.05) {
      // ralentí: con más carácter, más irregular (leva brava)
      objetivo += Math.sin(sim.t * 8.2) * Math.sin(sim.t * 2.9) * 45 * (pref.caracter / 100);
    }
    const sube = enNeutro ? 9000 : 14000;
    const baja = sim.v < 2 ? 4200 : 9000;
    sim.rpm += limitar(objetivo - sim.rpm, -baja * dt, sube * dt);
    let enCorte = sim.t < sim.corteHasta;
    if (sim.rpm >= corte - 40 && acelerador > 0.5) enCorte = enCorte || Math.floor(sim.t * 24) % 2 === 0; // limitador
    sim.carga += (acelerador - sim.carga) * Math.min(1, dt * 12);

    // Silbido: turbo (sigue la carga con retraso), compresor (sigue las vueltas) o motor eléctrico.
    const tono = 2 ** (pref.tono / 100);
    const extra = pref.silbido / 100;
    let fSil = 400;
    let nSil = 0;
    const fraccion = limitar(sim.rpm / corte);
    if (motor.electrico) {
      sim.vRev = enNeutro || (encendido && sim.t < sim.arranque) ? Math.min(45, sim.vRev + 30 * dt) : Math.max(0, sim.vRev - 40 * dt);
      const v = Math.max(sim.v, sim.vRev);
      fSil = (170 + v * 48) * tono;
      nSil = encendido ? limitar((v > 0.2 ? 0.16 + 0.34 * sim.carga : 0.06) * (1 + extra)) : 0;
    } else if (motor.turbo) {
      sim.spool += (sim.carga * fraccion - sim.spool) * Math.min(1, dt * (sim.carga * fraccion > sim.spool ? 2.5 : 5));
      fSil = (2200 + 7500 * sim.spool) * tono;
      nSil = limitar(sim.spool * 0.2 * (1 + extra * 1.5), 0, 0.5);
    } else {
      fSil = (300 + sim.rpm * 0.42) * tono;
      nSil = limitar(extra, 0, 1) * 0.22 * (0.25 + 0.75 * sim.carga) * fraccion;
    }

    if (sonido) {
      sonido.fijar({ rpm: sim.rpm, carga: enCorte ? 0 : sim.carga, gan: encendido ? 1 : 0, fSil, nSil: encendido ? nSil : 0 });
    }
  }

  // -------------------------------------------------------------------------
  // Pintar
  // -------------------------------------------------------------------------
  let textoPintado = {};
  const poner = (elemento, clave, texto) => {
    if (textoPintado[clave] !== texto) {
      textoPintado[clave] = texto;
      elemento.textContent = texto;
    }
  };

  function pintarReloj() {
    const enMph = pref.unidades === 'mph';
    const velocidad = Math.round(sim.v * (enMph ? 2.23694 : 3.6));
    poner(velocidadEl, 'velocidad', String(velocidad));
    poner(unidadEl, 'unidad', enMph ? 'mph' : 'km/h');
    const fraccion = motor.electrico ? limitar(sim.v / 70) : limitar(sim.rpm / motor.corte);
    valorEl.setAttribute('stroke-dasharray', `${(fraccion * ARCO).toFixed(1)} ${VUELTA}`);
    valorEl.classList.toggle('al-corte', !motor.electrico && fraccion > 0.9);
    let marcha = '–';
    if (encendido) marcha = motor.electrico ? 'D' : sim.v < 0.3 ? 'N' : `${sim.marcha + 1}ª`;
    poner(marchaEl, 'marcha', marcha);
    let rpm = 'Motor apagado';
    if (encendido) rpm = motor.electrico ? `${Math.round(sim.carga * 100)} % de potencia` : `${(Math.round(sim.rpm / 50) * 50).toLocaleString('es-CO')} rpm`;
    poner(rpmEl, 'rpm', rpm);
    poner(estadoEl, 'estado', textoEstado());
    for (const nombre of ['gas', 'freno']) {
      const valor = demo ? (nombre === 'gas' ? DEMO[demo.paso][1] : DEMO[demo.paso][2]) : teclas[nombre] ? 0.85 : pedales[nombre];
      const pisado = nombre === 'gas' ? valor >= 0 : valor > 0;
      const texto = `${pisado ? Math.round(8 + Math.max(0, valor) * 92) : 0}%`;
      if (textoPintado[nombre] !== texto) {
        textoPintado[nombre] = texto;
        const pedal = el.querySelector(`.pedal-${nombre}`);
        pedal.querySelector('.pedal-nivel').style.height = texto;
        pedal.classList.toggle('pisado', pisado);
      }
    }
  }

  function pintarControles() {
    encenderEl.setAttribute('aria-pressed', String(encendido));
    encenderEl.querySelector('span').textContent = encendido ? 'Apagar motor' : 'Encender motor';
    encenderEl.classList.toggle('encendido', encendido);
    el.querySelectorAll('[data-motor]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.motor === pref.motor)));
    el.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === pref.modo)));
    el.querySelectorAll('[data-unidades]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unidades === pref.unidades)));
    el.querySelectorAll('[data-auto]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.auto === '1') === Boolean(pref.auto))));
    $('.motor-gps').hidden = pref.modo !== 'gps';
    $('.motor-prueba').hidden = pref.modo !== 'prueba';
    el.querySelectorAll('[data-ajuste]').forEach((entrada) => {
      const valor = pref[entrada.dataset.ajuste];
      entrada.value = valor;
      entrada.nextElementSibling.textContent = `${Number(entrada.min) < 0 && valor > 0 ? '+' : ''}${valor}${Number(entrada.min) < 0 ? '' : ' %'}`;
    });
    demoEl.querySelector('span').textContent = demo ? 'Detener' : 'Demostración';
    demoEl.setAttribute('aria-pressed', String(Boolean(demo)));
    // zona roja del reloj: el último 12 % de las revoluciones
    const rojo = motor.electrico ? 0 : 0.12;
    rojoEl.setAttribute('stroke-dasharray', `${rojo * ARCO} ${VUELTA}`);
    rojoEl.setAttribute('stroke-dashoffset', String(-(1 - rojo) * ARCO));
    pintarReloj();
  }

  // -------------------------------------------------------------------------
  // Controles
  // -------------------------------------------------------------------------
  function cambiarModo(modo) {
    if (pref.modo === modo) return;
    pref.modo = modo;
    recordar();
    demo = null;
    pedales.gas = -1;
    pedales.freno = 0;
    if (modo === 'gps') {
      if (encendido) iniciarGps();
    } else detenerGps();
    pintarControles();
  }

  el.addEventListener('click', (evento) => {
    const objetivo = evento.target;
    if (objetivo.closest('.motor-encender')) {
      if (encendido) apagar();
      else encender();
      return;
    }
    const opcion = objetivo.closest('[data-motor]');
    if (opcion) {
      pref.motor = opcion.dataset.motor;
      motor = MOTORES.find((m) => m.id === pref.motor);
      sim.marcha = 0;
      sim.spool = 0;
      recordar();
      configurar();
      pintarControles();
      return;
    }
    const modo = objetivo.closest('[data-modo]');
    if (modo) return void cambiarModo(modo.dataset.modo);
    const unidades = objetivo.closest('[data-unidades]');
    if (unidades) {
      pref.unidades = unidades.dataset.unidades;
      recordar();
      pintarControles();
      return;
    }
    const auto = objetivo.closest('[data-auto]');
    if (auto) {
      pref.auto = auto.dataset.auto === '1';
      recordar();
      pintarControles();
      return;
    }
    if (objetivo.closest('.motor-demo')) {
      if (demo) demo = null;
      else {
        sim.v = 0;
        demo = { paso: 0, hasta: sim.t + DEMO[0][0] + 0.8 };
        if (!encendido) encender();
      }
      pintarControles();
      return;
    }
    if (objetivo.closest('.motor-restablecer')) {
      for (const clave of ['volumen', 'intensidad', 'caracter', 'petardeo', 'tono', 'silbido']) pref[clave] = POR_DEFECTO[clave];
      recordar();
      configurar();
      if (sonido) sonido.volumen(pref.volumen / 100);
      pintarControles();
    }
  });

  el.addEventListener('input', (evento) => {
    const entrada = evento.target.closest('[data-ajuste]');
    if (!entrada) return;
    pref[entrada.dataset.ajuste] = Number(entrada.value);
    recordar();
    if (entrada.dataset.ajuste === 'volumen') {
      if (sonido) sonido.volumen(pref.volumen / 100);
    } else configurar();
    pintarControles();
  });

  // Pedales: cuanto más abajo se presiona, más fuerte.
  el.querySelectorAll('.pedal').forEach((pedal) => {
    const nombre = pedal.dataset.pedal;
    const suelto = nombre === 'gas' ? -1 : 0;
    const medir = (evento) => {
      const caja = pedal.getBoundingClientRect();
      pedales[nombre] = limitar(((evento.clientY - caja.top) / caja.height) * 1.2 - 0.1);
    };
    pedal.addEventListener('pointerdown', (evento) => {
      evento.preventDefault();
      pedal.setPointerCapture(evento.pointerId);
      demo = null;
      if (!encendido) encender();
      medir(evento);
      pintarControles();
    });
    pedal.addEventListener('pointermove', (evento) => {
      if (pedal.hasPointerCapture(evento.pointerId)) medir(evento);
    });
    const soltar = () => {
      pedales[nombre] = suelto;
    };
    pedal.addEventListener('pointerup', soltar);
    pedal.addEventListener('pointercancel', soltar);
    pedal.addEventListener('lostpointercapture', soltar);
    pedal.addEventListener('contextmenu', (evento) => evento.preventDefault());
  });

  // Acelerar en neutro: mientras se mantenga presionado.
  el.querySelectorAll('.motor-rev').forEach((boton) => {
    const fijar = (valor) => () => {
      rev = valor;
      boton.classList.toggle('pisado', valor);
    };
    boton.addEventListener('pointerdown', (evento) => {
      boton.setPointerCapture(evento.pointerId);
      if (!encendido) encender();
      fijar(true)();
    });
    for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) boton.addEventListener(tipo, fijar(false));
    boton.addEventListener('keydown', (evento) => {
      if ((evento.key === ' ' || evento.key === 'Enter') && !evento.repeat) fijar(true)();
    });
    boton.addEventListener('keyup', fijar(false));
    boton.addEventListener('blur', fijar(false));
    boton.addEventListener('contextmenu', (evento) => evento.preventDefault());
  });

  // -------------------------------------------------------------------------
  // Reloj de la simulación (30 veces por segundo mientras haga falta)
  // -------------------------------------------------------------------------
  let anterior = performance.now();
  setInterval(() => {
    const ahora = performance.now();
    // En segundo plano el navegador llama este reloj solo una vez por segundo: el tiempo
    // que pasó se recorre en pasos cortos para que el motor siga la velocidad igual.
    let dt = Math.min(1.5, (ahora - anterior) / 1000);
    anterior = ahora;
    const quieto = !encendido && sim.rpm < 1 && sim.v === 0;
    for (; !quieto && dt > 0.0005; dt -= 0.05) paso(Math.min(0.05, dt));
    if (visible && !document.hidden) pintarReloj();
  }, 33);

  pintarControles();

  return {
    /** Se llama al entrar o salir de la pestaña. El motor sigue sonando en las otras. */
    mostrar(ver) {
      const primera = !visible && ver;
      visible = ver;
      if (ver) pintarControles();
      return primera;
    },
    /** Al abrir la app en esta pestaña, si así se pidió en los ajustes. */
    encenderSiAuto() {
      if (pref.auto) encender();
    },
    /** Flechas arriba y abajo como pedales en el modo de prueba. Devuelve true si la usó. */
    tecla(evento, abajo) {
      if (pref.modo !== 'prueba' || evento.target.matches('input, summary')) return false;
      const nombre = evento.key === 'ArrowUp' ? 'gas' : evento.key === 'ArrowDown' ? 'freno' : null;
      if (!nombre) return false;
      if (abajo && !teclas[nombre]) {
        demo = null;
        if (!encendido) encender();
      }
      teclas[nombre] = abajo;
      return true;
    },
    encendido: () => encendido,
  };
}
