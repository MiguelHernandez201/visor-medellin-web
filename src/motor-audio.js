// Sonido del motor: se sintetiza en vivo con Web Audio (no hay grabaciones).
//
// Modelo: cada cilindro da un pulso de escape por ciclo (dos vueltas del cigüeñal). La suma
// de los pulsos, con su ruido de escape, pasa por unas resonancias fijas (tubo y carrocería),
// una saturación y un filtro que se abre con el acelerador. Cilindros con distinto peso dan
// el borboteo del V8 de plano cruzado; al soltar el acelerador a altas vueltas hay petardeo.
// Aparte va un silbido (turbo, compresor o motor eléctrico) que es un oscilador simple.
//
// `nucleoMotor` corre en un AudioWorklet: su texto se pasa tal cual al hilo de audio, así
// que NO puede usar nada de fuera de la función (ni importaciones ni constantes del módulo).

/* eslint-disable no-var */
export function nucleoMotor(sr) {
  var PI2 = Math.PI * 2;
  var n = 0;
  var des = [];
  var peso = [];
  var amp = [];
  var previo = [];
  var res = [];
  var cfg = {
    ancho: 1,
    ruido: 0.2,
    directo: 0.5,
    irregular: 0.05,
    falla: 0,
    petardeo: 0,
    dureza: 0.5,
    brillo: 3000,
    ralenti: 800,
    corte: 7000,
    nivelMotor: 1,
    pulso: 0.006,
    deriva: 0.004,
  };
  var rpm = 0;
  var rpmObj = 0;
  var carga = 0;
  var cargaObj = 0;
  var gan = 0;
  var ganObj = 0;
  var fSil = 400;
  var fSilObj = 400;
  var nSil = 0;
  var nSilObj = 0;
  var fase = 0;
  var faseSil = 0;
  var lp1 = 0;
  var lp2 = 0;
  var dcX = 0;
  var dcY = 0;
  var pop = 0;
  var popAmp = 0;
  var ruidoLp = 0;
  var der = 0;
  var derObj = 0;
  var derCuenta = 0;
  var kR = 1 - Math.exp(-1 / (0.03 * sr));
  var kC = 1 - Math.exp(-1 / (0.025 * sr));
  var kG = 1 - Math.exp(-1 / (0.08 * sr));
  var kS = 1 - Math.exp(-1 / (0.05 * sr));
  var decPop = Math.exp(-1 / (0.02 * sr));
  // el ruido del escape es un soplido grave, no un siseo: se filtra a unos 900 Hz
  var kN = 1 - Math.exp((-PI2 * 900) / sr);
  var kD = 1 - Math.exp(-1 / (0.3 * sr));

  function configurar(c) {
    var i;
    var k;
    for (k in cfg) if (typeof c[k] === 'number') cfg[k] = c[k];
    if (c.pesos) {
      if (c.pesos.length !== n) {
        n = c.pesos.length;
        des = [];
        amp = [];
        previo = [];
        for (i = 0; i < n; i++) {
          des.push(i / n);
          amp.push(1);
          previo.push(0);
        }
      }
      peso = c.pesos.slice();
      if (c.desfases && c.desfases.length === n) des = c.desfases.slice();
    }
    if (c.res) {
      var viejas = res;
      res = [];
      for (i = 0; i < c.res.length; i++) {
        var f = Math.min(c.res[i][0], sr * 0.45);
        var w0 = (PI2 * f) / sr;
        var alfa = Math.sin(w0) / (2 * c.res[i][1]);
        var a0 = 1 + alfa;
        var v = viejas[i] || { x1: 0, x2: 0, y1: 0, y2: 0 };
        res.push({
          b0: alfa / a0,
          a1: (-2 * Math.cos(w0)) / a0,
          a2: (1 - alfa) / a0,
          g: c.res[i][2],
          x1: v.x1,
          x2: v.x2,
          y1: v.y1,
          y2: v.y2,
        });
      }
    }
  }

  function fijar(e) {
    rpmObj = e.rpm;
    cargaObj = e.carga;
    ganObj = e.gan;
    fSilObj = e.fSil;
    nSilObj = e.nSil;
  }

  function procesar(sal) {
    var largo = sal.length;
    var nRes = res.length;
    var rango = cfg.corte - cfg.ralenti || 1;
    var fc = cfg.brillo * (0.4 + 0.6 * carga) + rpm * 0.12;
    if (fc > sr * 0.45) fc = sr * 0.45;
    var kL = 1 - Math.exp((-PI2 * fc) / sr);
    var w = (cfg.ancho * (1 - 0.4 * carga)) / (n || 1);
    if (w > 1) w = 1;
    // Un pulso de escape dura pocos milisegundos aunque el motor gire despacio: a bajas
    // vueltas se acorta, y así el ralentí tiene armónicos que se oyen en parlantes pequeños.
    var realce = 1;
    var tope = (cfg.pulso * rpm) / 120;
    if (tope > 0.002 && w > tope) {
      realce = Math.min(1.5, Math.sqrt(w / tope));
      w = tope;
    }
    var empuje = 1 + cfg.dureza * 2.2 * (0.35 + 0.65 * carga);
    var norma = 1 / Math.tanh(empuje * 0.8);
    var sobre = cargaObj < 0.04 && rpm > cfg.ralenti * 1.8;
    var pPop = sobre ? (cfg.petardeo * 5 * ((rpm - cfg.ralenti) / rango)) / sr : 0;
    var falla = sobre ? cfg.falla : 0;
    var bajo = 1 - rpm / (cfg.ralenti * 2);
    var irr = cfg.irregular * (1 + 2 * (bajo > 0 ? bajo : 0));
    var hayMotor = n > 0 && cfg.nivelMotor > 0;
    var i;
    var j;
    for (i = 0; i < largo; i++) {
      rpm += (rpmObj - rpm) * kR;
      carga += (cargaObj - carga) * kC;
      gan += (ganObj - gan) * kG;
      fSil += (fSilObj - fSil) * kS;
      nSil += (nSilObj - nSil) * kS;
      var y = 0;
      if (hayMotor) {
        // las vueltas nunca son perfectamente estables: una deriva lenta quita el tono de máquina
        if (--derCuenta <= 0) {
          derCuenta = sr * (0.15 + Math.random() * 0.3);
          derObj = Math.random() * 2 - 1;
        }
        der += (derObj - der) * kD;
        fase += (rpm * (1 + der * cfg.deriva)) / (120 * sr);
        if (fase >= 1) fase -= 1;
        var s = 0;
        for (j = 0; j < n; j++) {
          var x = fase - des[j];
          if (x < 0) x += 1;
          if (x < previo[j]) {
            // empieza la combustión de este cilindro: no todas salen iguales
            var a = 1 + (Math.random() * 2 - 1) * irr;
            if (falla > 0 && Math.random() < falla) a = Math.random() < 0.5 ? 0 : 1.7;
            amp[j] = a * peso[j];
          }
          previo[j] = x;
          if (x < w) {
            var u = x / w;
            var q = 1 - u;
            s += amp[j] * u * q * q * q * 9.48;
          }
        }
        var blanco = Math.random() * 2 - 1;
        ruidoLp += (blanco - ruidoLp) * kN;
        var e = s * realce * (0.65 + 0.35 * carga) * 0.5 + ruidoLp * s * realce * cfg.ruido * (0.3 + carga);
        if (pPop > 0 && Math.random() < pPop) {
          pop = 1;
          popAmp = 0.5 + Math.random() * 1.1;
        }
        if (pop > 0.0005) {
          e += ruidoLp * 3 * pop * popAmp; // golpe sordo, no chasquido
          pop *= decPop;
        }
        var mezcla = cfg.directo * e;
        for (j = 0; j < nRes; j++) {
          var r = res[j];
          var o = r.b0 * (e - r.x2) - r.a1 * r.y1 - r.a2 * r.y2;
          r.x2 = r.x1;
          r.x1 = e;
          r.y2 = r.y1;
          r.y1 = o;
          mezcla += o * r.g;
        }
        var sat = Math.tanh(mezcla * empuje * 0.8) * norma;
        lp1 += (sat - lp1) * kL;
        lp2 += (lp1 - lp2) * kL;
        dcY = lp2 - dcX + 0.995 * dcY;
        dcX = lp2;
        y = dcY * cfg.nivelMotor * 0.9;
      }
      if (nSil > 0.0005) {
        faseSil += fSil / sr;
        if (faseSil >= 1) faseSil -= 1;
        var t = faseSil * PI2;
        y += (Math.sin(t) * 0.6 + Math.sin(2 * t) * 0.25 + Math.sin(3 * t + 1) * 0.15) * nSil;
      }
      // más nivel con tope suave: en el carro compite con el ruido de rodadura y la música
      var z = y * gan * 1.7;
      var az = z < 0 ? -z : z;
      // limpio hasta 0,6 y redondeado de ahí en adelante (recortar más ensucia el sonido)
      if (az > 0.6) z = (z < 0 ? -1 : 1) * (0.6 + 0.38 * Math.tanh((az - 0.6) / 0.38));
      sal[i] = z;
    }
    // por si una resonancia se desboca (no debería): se reinicia en vez de dejar un pitido
    if (!(dcY > -50 && dcY < 50)) {
      lp1 = lp2 = dcX = dcY = 0;
      for (j = 0; j < nRes; j++) res[j].x1 = res[j].x2 = res[j].y1 = res[j].y2 = 0;
    }
  }

  return { configurar: configurar, fijar: fijar, procesar: procesar };
}
/* eslint-enable no-var */

const NOMBRE_PROCESADOR = 'motor-visor';

function fuenteDelProcesador() {
  return `const nucleoMotor=${nucleoMotor.toString()};
class Procesador extends AudioWorkletProcessor{
  constructor(){super();this.n=nucleoMotor(sampleRate);this.port.onmessage=(e)=>{const d=e.data;if(d.cfg)this.n.configurar(d.cfg);if(d.est)this.n.fijar(d.est);};}
  process(entradas,salidas){const c=salidas[0];this.n.procesar(c[0]);for(let k=1;k<c.length;k++)c[k].set(c[0]);return true;}
}
registerProcessor('${NOMBRE_PROCESADOR}',Procesador);`;
}

/**
 * Abre la salida de audio con el motor. Hay que llamarla desde un toque o un clic (los
 * navegadores no dejan sonar antes). Devuelve { configurar, fijar, volumen, reanudar, cerrar }.
 */
export async function crearSonido() {
  const Contexto = window.AudioContext || window.webkitAudioContext;
  if (!Contexto) throw new Error('Este navegador no tiene Web Audio');
  // iPhone y iPad: sin esto el interruptor de silencio también calla el audio de la página.
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // navegadores sin audioSession: no hace falta
  }
  const ctx = new Contexto({ latencyHint: 'interactive' });
  // Se reanuda ya mismo, todavía dentro del toque: Safari no deja hacerlo después de esperar
  // a que cargue el procesador.
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const salida = ctx.createGain();
  salida.gain.value = 0.9;
  const limitador = ctx.createDynamicsCompressor();
  limitador.threshold.value = -4;
  limitador.ratio.value = 12;
  salida.connect(limitador).connect(ctx.destination);

  let enviar;
  let nodo = null;
  if (ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
    try {
      const url = URL.createObjectURL(new Blob([fuenteDelProcesador()], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      nodo = new AudioWorkletNode(ctx, NOMBRE_PROCESADOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
      enviar = (mensaje) => nodo.port.postMessage(mensaje);
    } catch {
      nodo = null;
    }
  }
  if (!nodo) {
    // Navegadores sin AudioWorklet: el mismo núcleo en el hilo principal.
    const nucleo = nucleoMotor(ctx.sampleRate);
    nodo = ctx.createScriptProcessor(1024, 0, 1);
    nodo.onaudioprocess = (evento) => nucleo.procesar(evento.outputBuffer.getChannelData(0));
    enviar = (mensaje) => {
      if (mensaje.cfg) nucleo.configurar(mensaje.cfg);
      if (mensaje.est) nucleo.fijar(mensaje.est);
    };
  }
  nodo.connect(salida);

  return {
    configurar: (cfg) => enviar({ cfg }),
    fijar: (est) => enviar({ est }),
    volumen: (v) => salida.gain.setTargetAtTime(v * 1.3, ctx.currentTime, 0.03),
    reanudar: () => (ctx.state === 'running' ? Promise.resolve() : ctx.resume()),
    suspendido: () => ctx.state !== 'running',
    pausar: () => ctx.suspend(),
    cerrar: () => {
      nodo.disconnect();
      return ctx.close();
    },
  };
}
