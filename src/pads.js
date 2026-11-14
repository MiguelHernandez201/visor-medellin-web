// Launchpad: 16 pads con sonidos generados en vivo con Web Audio (sin archivos de audio), y
// una base de batería que suena debajo para tocar encima.

/** Los pads, de arriba a la izquierda hacia abajo: nombre, color y sonido. */
export const PADS = [
  { nombre: 'Bombo', color: 'rojo', voz: 'bombo' },
  { nombre: 'Caja', color: 'naranja', voz: 'caja' },
  { nombre: 'Palma', color: 'naranja', voz: 'palma' },
  { nombre: 'Aro', color: 'amarillo', voz: 'aro' },
  { nombre: 'Hi-hat', color: 'amarillo', voz: 'hat' },
  { nombre: 'Hat abierto', color: 'amarillo', voz: 'hatAbierto' },
  { nombre: 'Tom bajo', color: 'verde', voz: 'tom', nota: 90 },
  { nombre: 'Tom alto', color: 'verde', voz: 'tom', nota: 150 },
  { nombre: 'Bajo Mi', color: 'azul', voz: 'bajo', nota: 41.2 },
  { nombre: 'Bajo Sol', color: 'azul', voz: 'bajo', nota: 49 },
  { nombre: 'Bajo La', color: 'azul', voz: 'bajo', nota: 55 },
  { nombre: 'Bajo Do', color: 'azul', voz: 'bajo', nota: 65.4 },
  { nombre: 'Acorde La m', color: 'morado', voz: 'acorde', notas: [220, 261.6, 329.6] },
  { nombre: 'Acorde Fa', color: 'morado', voz: 'acorde', notas: [174.6, 220, 261.6] },
  { nombre: 'Campana', color: 'rosado', voz: 'campana' },
  { nombre: 'Bocina', color: 'rosado', voz: 'bocina' },
];

/** Ritmos de la base: en qué semicorcheas (0 a 15) de cada compás suena cada cosa. */
export const RITMOS = [
  { id: 'dembow', nombre: 'Dembow', bombo: [0, 4, 8, 12], caja: [3, 6, 11, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  { id: 'house', nombre: 'House', bombo: [0, 4, 8, 12], caja: [4, 12], hat: [2, 6, 10, 14] },
  { id: 'rock', nombre: 'Rock', bombo: [0, 8, 10], caja: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
];

/** `ctx` es el AudioContext. Devuelve { tocar(i), base({ sonar, bpm, ritmo }), baseSonando() }. */
export function crearPads(ctx) {
  const salida = ctx.createGain();
  salida.gain.value = 0.9;
  const limitador = ctx.createDynamicsCompressor();
  limitador.threshold.value = -10;
  limitador.ratio.value = 6;
  salida.connect(limitador).connect(ctx.destination);

  // un segundo de ruido blanco, que comparten la caja, los platillos y la palma
  const ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const datos = ruido.getChannelData(0);
  for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;

  /** Envolvente: sube de golpe a `nivel` y cae en `dura` segundos. */
  function golpe(cuando, nivel, dura) {
    const ganancia = ctx.createGain();
    ganancia.gain.setValueAtTime(0.0001, cuando);
    ganancia.gain.exponentialRampToValueAtTime(nivel, cuando + 0.004);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, cuando + dura);
    ganancia.connect(salida);
    return ganancia;
  }

  function tono(tipo, hz, cuando, dura, nivel, hasta) {
    const oscilador = ctx.createOscillator();
    oscilador.type = tipo;
    oscilador.frequency.setValueAtTime(hz, cuando);
    if (hasta) oscilador.frequency.exponentialRampToValueAtTime(hasta, cuando + dura);
    oscilador.connect(golpe(cuando, nivel, dura));
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
    fuente.start(cuando, Math.random() * 0.5, dura + 0.05);
  }

  const VOCES = {
    bombo: (t) => {
      tono('sine', 150, t, 0.32, 1, 42);
      tono('triangle', 90, t, 0.05, 0.4);
    },
    caja: (t) => {
      soplo(t, 0.18, 0.7, 'bandpass', 1900, 0.7);
      tono('triangle', 190, t, 0.1, 0.5, 140);
    },
    palma: (t) => {
      [0, 0.012, 0.024].forEach((d) => soplo(t + d, 0.05, 0.5, 'bandpass', 1300, 1.2));
      soplo(t + 0.03, 0.18, 0.5, 'bandpass', 1300, 1.2);
    },
    aro: (t) => {
      tono('square', 830, t, 0.03, 0.35);
      soplo(t, 0.02, 0.3, 'highpass', 3000);
    },
    hat: (t) => soplo(t, 0.05, 0.4, 'highpass', 7500),
    hatAbierto: (t) => soplo(t, 0.32, 0.38, 'highpass', 7000),
    tom: (t, pad) => tono('sine', pad.nota * 1.6, t, 0.3, 0.9, pad.nota),
    bajo: (t, pad) => {
      const oscilador = ctx.createOscillator();
      oscilador.type = 'sawtooth';
      oscilador.frequency.value = pad.nota;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.setValueAtTime(900, t);
      filtro.frequency.exponentialRampToValueAtTime(180, t + 0.4);
      oscilador.connect(filtro).connect(golpe(t, 0.9, 0.55));
      oscilador.start(t);
      oscilador.stop(t + 0.6);
      tono('sine', pad.nota, t, 0.55, 0.7);
    },
    acorde: (t, pad) => {
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.setValueAtTime(2600, t);
      filtro.frequency.exponentialRampToValueAtTime(500, t + 0.6);
      filtro.connect(golpe(t, 0.32, 0.7));
      for (const nota of pad.notas) {
        for (const desafino of [-5, 5]) {
          const oscilador = ctx.createOscillator();
          oscilador.type = 'sawtooth';
          oscilador.frequency.value = nota;
          oscilador.detune.value = desafino;
          oscilador.connect(filtro);
          oscilador.start(t);
          oscilador.stop(t + 0.75);
        }
      }
    },
    campana: (t) => {
      tono('square', 540, t, 0.28, 0.22);
      tono('square', 800, t, 0.28, 0.22);
    },
    bocina: (t) => {
      // tres notas con vibrato, como la bocina de aire de las fiestas
      [0, 0.16, 0.32].forEach((d, i) => {
        for (const hz of [440, 554, 660]) {
          const o = tono('sawtooth', hz, t + d, i === 2 ? 0.55 : 0.13, 0.13);
          o.detune.setValueAtTime(-20, t + d);
          o.detune.linearRampToValueAtTime(20, t + d + 0.1);
        }
      });
    },
  };

  function tocar(indice, cuando = ctx.currentTime + 0.005) {
    const pad = PADS[indice];
    if (pad) VOCES[pad.voz](cuando, pad);
  }

  // -------------------------------------------------------------------------
  // Base: se programa un poco por adelantado con el reloj del audio, que no se atrasa
  // -------------------------------------------------------------------------
  let reloj = null;
  let bpm = 95;
  let ritmo = RITMOS[0];
  let paso = 0;
  let proximo = 0;

  function programar() {
    const cadaPaso = 60 / bpm / 4;
    while (proximo < ctx.currentTime + 0.15) {
      if (ritmo.bombo.includes(paso)) VOCES.bombo(proximo);
      if (ritmo.caja.includes(paso)) VOCES.caja(proximo);
      if (ritmo.hat.includes(paso)) VOCES.hat(proximo);
      paso = (paso + 1) % 16;
      proximo += cadaPaso;
    }
  }

  function base({ sonar, bpm: nuevoBpm, ritmo: nuevoRitmo } = {}) {
    if (nuevoBpm) bpm = Math.min(200, Math.max(40, nuevoBpm));
    if (nuevoRitmo) ritmo = RITMOS.find((r) => r.id === nuevoRitmo) || ritmo;
    if (sonar === true && !reloj) {
      paso = 0;
      proximo = ctx.currentTime + 0.06;
      programar();
      reloj = setInterval(programar, 40);
    } else if (sonar === false && reloj) {
      clearInterval(reloj);
      reloj = null;
    }
  }

  return { tocar, base, baseSonando: () => reloj != null };
}
