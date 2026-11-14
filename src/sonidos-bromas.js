// Sonidos de las bromas (escáner, pedo, detector de mentiras y choque), generados con Web
// Audio. El choque usa además grabaciones reales (public/sonidos/), con los sintetizados de
// respaldo. `ctx` es el AudioContext, ya sonando.

import { crearGrabaciones } from './grabaciones.js';

const ARCHIVOS = ['choque-accidente', 'choque-vidrio', 'choque-alarma'];
/** Segundos desde que arranca choque-accidente.mp3 hasta el golpe (medido en la grabación). */
export const IMPACTO_GRABADO = 1.4;

export function crearSonidosBromas(ctx) {
  const salida = ctx.createGain();
  salida.gain.value = 0.9;
  salida.connect(ctx.destination);

  // dos segundos de ruido blanco: para el pedo, el frenazo, el golpe y el vidrio
  const ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const datos = ruido.getChannelData(0);
  for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;

  /** Ganancia que sube a `nivel` en `ataque` s y cae a cero al cabo de `dura` s. */
  function envolvente(cuando, nivel, dura, ataque = 0.005, destino = salida) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, cuando);
    g.gain.exponentialRampToValueAtTime(nivel, cuando + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, cuando + dura);
    g.connect(destino);
    return g;
  }

  function tono(tipo, hz, cuando, dura, nivel, { hasta, ataque } = {}) {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(hz, cuando);
    if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, cuando + dura);
    o.connect(envolvente(cuando, nivel, dura, ataque));
    o.start(cuando);
    o.stop(cuando + dura + 0.05);
    return o;
  }

  function soplo(cuando, dura, nivel, tipo, hz, q = 1, { hasta, ataque } = {}) {
    const fuente = ctx.createBufferSource();
    fuente.buffer = ruido;
    const filtro = ctx.createBiquadFilter();
    filtro.type = tipo;
    filtro.frequency.setValueAtTime(hz, cuando);
    if (hasta) filtro.frequency.exponentialRampToValueAtTime(hasta, cuando + dura);
    filtro.Q.value = q;
    fuente.connect(filtro).connect(envolvente(cuando, nivel, dura, ataque));
    fuente.start(cuando, Math.random() * 1.2, dura + 0.05);
  }

  /** Oscilador lento que mueve `parametro` ± `cuanto` a `hz` veces por segundo. */
  function vaiven(parametro, hz, cuanto, cuando, dura) {
    const lfo = ctx.createOscillator();
    const fondo = ctx.createGain();
    lfo.frequency.value = hz;
    fondo.gain.value = cuanto;
    lfo.connect(fondo).connect(parametro);
    lfo.start(cuando);
    lfo.stop(cuando + dura + 0.05);
  }

  const ahora = () => ctx.currentTime + 0.01;

  // Grabaciones reales del choque (grabaciones.js). Se bajan la primera vez que se abre la
  // broma; si no llegan (sin conexión), el choque usa los sonidos sintetizados.
  const grabaciones = crearGrabaciones(ctx, ARCHIVOS, salida);
  const grabacion = (nombre, cuando, nivel, opciones = {}) => grabaciones.sonar(nombre, cuando, { nivel, ...opciones });

  return {
    /** Baja y prepara las grabaciones del choque. Promesa: true si están todas. */
    cargar: grabaciones.cargar,

    /**
     * El choque con grabaciones reales: chillido de llantas y golpe (el golpe cae a los
     * IMPACTO_GRABADO s), vidrio que estalla encima, un retumbo grave y la alarma del carro.
     */
    choqueGrabado() {
      const t = ahora();
      const golpe = t + IMPACTO_GRABADO;
      grabacion('choque-accidente', t, 1);
      grabacion('choque-vidrio', golpe - 0.1, 0.8); // su golpe está a 0,1 s del comienzo
      tono('sine', 75, golpe, 0.7, 0.9, { hasta: 28, ataque: 0.003 });
      grabacion('choque-alarma', golpe + 0.9, 0.55, { bucle: true, hasta: golpe + 4 });
    },

    /** Pitido corto del escáner al pasar por un puesto. */
    bip(hz = 900) {
      const t = ahora();
      tono('square', hz, t, 0.07, 0.12);
      tono('sine', hz * 2, t, 0.05, 0.05);
    },

    /** Barrido del radar al empezar a escanear. */
    barrido() {
      const t = ahora();
      tono('sine', 300, t, 0.6, 0.25, { hasta: 1500, ataque: 0.05 });
      tono('sine', 450, t + 0.05, 0.55, 0.1, { hasta: 2250, ataque: 0.05 });
    },

    /** Un pedo: tono grave que tiembla, pasa por un filtro y se va apagando con aleteos. */
    pedo(dura = 1.2) {
      const t = ahora();
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(110 + Math.random() * 30, t);
      o.frequency.exponentialRampToValueAtTime(70, t + dura * 0.8);
      o.frequency.exponentialRampToValueAtTime(140, t + dura); // el «prrt» final sube
      vaiven(o.frequency, 18 + Math.random() * 12, 28, t, dura);
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 650;
      filtro.Q.value = 5;
      const aleteo = ctx.createGain();
      aleteo.gain.value = 0.6;
      vaiven(aleteo.gain, 11, 0.4, t, dura);
      o.connect(filtro).connect(aleteo).connect(envolvente(t, 0.8, dura, 0.03));
      o.start(t);
      o.stop(t + dura + 0.05);
      soplo(t, dura, 0.15, 'bandpass', 220, 2, { ataque: 0.03 });
    },

    /** Alarma de dos tonos, `veces` idas y vueltas. */
    alarma(veces = 4, desde = 0) {
      const t = ahora() + desde;
      for (let i = 0; i < veces * 2; i++) tono('square', i % 2 ? 770 : 960, t + i * 0.2, 0.19, 0.12, { ataque: 0.01 });
    },

    /** Un latido: dos golpes graves (lub-dub). */
    latido() {
      const t = ahora();
      tono('sine', 70, t, 0.16, 0.6, { hasta: 40 });
      tono('sine', 60, t + 0.17, 0.14, 0.4, { hasta: 35 });
    },

    /** El tic de la aguja del polígrafo. */
    aguja() {
      soplo(ahora(), 0.015, 0.12, 'highpass', 3000);
    },

    /** VERDAD: acorde alegre que sube. */
    verdad() {
      const t = ahora();
      [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => tono('triangle', hz, t + i * 0.09, 0.9 - i * 0.1, 0.22));
    },

    /** MENTIRA: zumbador de concurso y alarma (a los `alarmaEn` s, para dejar hablar al locutor). */
    mentira(alarmaEn = 1) {
      const t = ahora();
      for (const hz of [110, 116.5]) tono('sawtooth', hz, t, 0.9, 0.3, { ataque: 0.01 });
      this.alarma(3, alarmaEn);
    },

    /** Frenazo: el chillido de las llantas, con un temblor, que se corta en `dura` s. */
    frenazo(dura = 1.3) {
      const t = ahora();
      for (const [hz, nivel] of [[1150, 0.18], [1720, 0.1]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(hz, t);
        o.frequency.linearRampToValueAtTime(hz * 0.85, t + dura);
        vaiven(o.frequency, 7, hz * 0.04, t, dura);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'bandpass';
        filtro.frequency.value = hz * 1.5;
        filtro.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(nivel, t + 0.12);
        g.gain.setValueAtTime(nivel, t + dura - 0.02);
        g.gain.linearRampToValueAtTime(0, t + dura);
        o.connect(filtro).connect(g).connect(salida);
        o.start(t);
        o.stop(t + dura + 0.05);
      }
      soplo(t, dura, 0.25, 'bandpass', 2600, 6, { ataque: 0.1 });
    },

    /** El choque: golpe grave, latas que suenan, crujidos y vidrio que cae. */
    choque() {
      const t = ahora();
      tono('sine', 80, t, 0.6, 1, { hasta: 30, ataque: 0.002 });
      soplo(t, 1.2, 0.9, 'lowpass', 1200, 0.7, { hasta: 150, ataque: 0.002 });
      // lata: parciales que no son múltiplos entre sí, cada uno con su caída
      [180, 431, 697, 1123, 1580, 2210].forEach((hz, i) => tono('triangle', hz * (0.95 + Math.random() * 0.1), t + Math.random() * 0.02, 0.6 + Math.random() * 0.9, 0.18 / (1 + i * 0.3)));
      // crujidos
      for (let i = 0; i < 8; i++) soplo(t + Math.random() * 0.35, 0.04 + Math.random() * 0.06, 0.35, 'bandpass', 1200 + Math.random() * 2500, 3);
      // vidrio: un estallido agudo y muchos pedacitos que tintinean al caer
      soplo(t + 0.03, 0.5, 0.45, 'highpass', 4500, 0.7);
      for (let i = 0; i < 30; i++) {
        const cuando = t + 0.08 + Math.random() * 1.1;
        tono('sine', 2800 + Math.random() * 5500, cuando, 0.05 + Math.random() * 0.12, 0.05 + Math.random() * 0.06);
      }
    },

    /** Alarma de carro: un aullido que sube y baja, `veces` veces. */
    alarmaCarro(veces = 6) {
      const t = ahora();
      for (let i = 0; i < veces; i++) tono('square', 650, t + i * 0.42, 0.38, 0.1, { hasta: 1300, ataque: 0.02 });
    },
  };
}
