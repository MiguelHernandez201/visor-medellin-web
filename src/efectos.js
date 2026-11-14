// Efectos de sonido de las utilidades (moneda, dados y ruleta), generados con Web Audio:
// no hay archivos de audio. `ctx` es el AudioContext, ya sonando.

export function crearEfectos(ctx) {
  const salida = ctx.createGain();
  salida.gain.value = 0.8;
  salida.connect(ctx.destination);

  // medio segundo de ruido blanco, para los golpes
  const ruido = ctx.createBuffer(1, Math.floor(ctx.sampleRate / 2), ctx.sampleRate);
  const datos = ruido.getChannelData(0);
  for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;

  /** Envolvente: sube de golpe a `nivel` y cae en `dura` segundos. */
  function golpe(cuando, nivel, dura) {
    const ganancia = ctx.createGain();
    ganancia.gain.setValueAtTime(0.0001, cuando);
    ganancia.gain.exponentialRampToValueAtTime(nivel, cuando + 0.002);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, cuando + dura);
    ganancia.connect(salida);
    return ganancia;
  }

  function tono(tipo, hz, cuando, dura, nivel, destino) {
    const oscilador = ctx.createOscillator();
    oscilador.type = tipo;
    oscilador.frequency.setValueAtTime(hz, cuando);
    oscilador.connect(destino || golpe(cuando, nivel, dura));
    oscilador.start(cuando);
    oscilador.stop(cuando + dura + 0.05);
    return oscilador;
  }

  function soplo(cuando, dura, nivel, tipo, hz, q = 1) {
    const fuente = ctx.createBufferSource();
    fuente.buffer = ruido;
    const filtro = ctx.createBiquadFilter();
    filtro.type = tipo;
    filtro.frequency.value = hz;
    filtro.Q.value = q;
    fuente.connect(filtro).connect(golpe(cuando, nivel, dura));
    fuente.start(cuando, Math.random() * 0.3, dura + 0.03);
  }

  /** Tintineo metálico: varios parciales agudos que no son múltiplos entre sí. */
  function tintineo(cuando, nivel, dura) {
    for (const [hz, peso] of [[3950, 1], [5400, 0.7], [7250, 0.5], [9100, 0.3]]) tono('sine', hz, cuando, dura * (0.6 + 0.4 * peso), nivel * peso);
  }

  return {
    /**
     * Moneda: el «ting» del pulgar, el zumbido mientras gira en el aire y los rebotes al caer.
     * `vuelo` = segundos que dura la animación.
     */
    moneda(vuelo = 1.1) {
      const t = ctx.currentTime + 0.01;
      tintineo(t, 0.3, 0.9);
      // en el aire: el mismo timbre, entrecortado por el giro, cada vez más lento
      const tremolo = ctx.createGain();
      tremolo.gain.setValueAtTime(0.0001, t);
      const vibra = ctx.createOscillator();
      const fondo = ctx.createGain();
      vibra.type = 'sine';
      vibra.frequency.setValueAtTime(26, t);
      vibra.frequency.linearRampToValueAtTime(12, t + vuelo);
      fondo.gain.value = 0.05;
      vibra.connect(fondo).connect(tremolo.gain);
      tremolo.gain.setValueAtTime(0.06, t + 0.02);
      tremolo.gain.linearRampToValueAtTime(0.02, t + vuelo);
      tremolo.gain.linearRampToValueAtTime(0.0001, t + vuelo + 0.02);
      tremolo.connect(salida);
      for (const hz of [4300, 6100]) tono('sine', hz, t, vuelo, 1, tremolo);
      vibra.start(t);
      vibra.stop(t + vuelo + 0.05);
      // cae: tres rebotes cada vez más bajitos y seguidos
      [0, 0.13, 0.22].forEach((d, i) => {
        tintineo(t + vuelo + d, 0.26 / (i + 1), 0.25);
        soplo(t + vuelo + d, 0.03, 0.2 / (i + 1), 'bandpass', 2600, 1.5);
      });
    },

    /** Un golpe de dado contra la mesa. `fuerza` de 0 a 1. */
    dado(fuerza = 1) {
      const t = ctx.currentTime + 0.005;
      const tonoMadera = 1500 + Math.random() * 1400;
      soplo(t, 0.035, 0.5 * fuerza, 'bandpass', tonoMadera, 2.5);
      tono('triangle', 240 + Math.random() * 120, t, 0.05, 0.35 * fuerza);
    },

    /** El chasquido de la lengüeta de la ruleta al pasar por un tope. */
    tic() {
      const t = ctx.currentTime + 0.003;
      soplo(t, 0.012, 0.35, 'highpass', 2500);
      tono('square', 1750, t, 0.014, 0.12);
    },

    /** La ruleta se detuvo: una campanita. */
    campanita() {
      const t = ctx.currentTime + 0.01;
      tono('sine', 1318.5, t, 0.7, 0.3);
      tono('sine', 1975.5, t + 0.09, 0.7, 0.22);
      tono('sine', 2637, t + 0.09, 0.4, 0.08);
    },
  };
}
