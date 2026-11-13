// Aviso de fotomultas: con el GPS, suena y muestra una franja cuando el carro se acerca a
// una cámara de fotodetección en el sentido que ella vigila.
//
// Se avisa una vez por cámara al entrar en su radio (300 m, o más si se va rápido: unos
// 12 s de recorrido) y no se repite hasta haberse alejado. Si además se va por encima del
// límite, suena un segundo aviso más agudo. La ubicación no sale del navegador.

const RADIO_MIN = 300; // metros
const SEGUNDOS = 12; // a qué distancia en tiempo se quiere el aviso
const RADIO_MAX = 600;
const VELOCIDAD_MIN = 2.5; // m/s: por debajo no se sabe hacia dónde va el carro
const TOLERANCIA = 75; // grados entre el rumbo y el sentido de la cámara

const RUMBOS = { 'sur a norte': 0, 'occidente a oriente': 90, 'norte a sur': 180, 'oriente a occidente': 270 };
const RAD = Math.PI / 180;

/** Metros entre dos puntos { latitud, longitud }. */
function metros(a, b) {
  const x = (b.longitud - a.longitud) * RAD * Math.cos(((a.latitud + b.latitud) / 2) * RAD);
  const y = (b.latitud - a.latitud) * RAD;
  return Math.hypot(x, y) * 6371000;
}

/** Rumbo en grados (0 = norte, 90 = oriente) para ir de `a` a `b`. */
function rumbo(a, b) {
  const x = (b.longitud - a.longitud) * Math.cos(((a.latitud + b.latitud) / 2) * RAD);
  const y = b.latitud - a.latitud;
  return (Math.atan2(x, y) / RAD + 360) % 360;
}

/** Diferencia entre dos rumbos, de 0 a 180. */
const giro = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * `camaras` = [{ id, nombre, limite, sentido, latitud, longitud }].
 * `alCambiar(estado)` se llama cuando cambia algo que mostrar:
 *   { activo, gps: 'apagado' | 'pidiendo' | 'activo' | 'denegado' | 'sin-soporte' | 'sin-senal',
 *     cerca: { camara, metros, exceso } | null }
 * Devuelve { activar(si), activo(), probar() }.
 */
export function crearAvisos({ camaras, alCambiar }) {
  const estado = { activo: false, gps: 'apagado', cerca: null };
  let vigilancia = null;
  let previo = null; // { latitud, longitud, t }
  let rumboActual = null;
  const avisadas = new Map(); // id de la cámara → { t: cuándo se avisó, exceso: ya se avisó el exceso }
  let ctx = null;
  let bloqueo = null;

  const publicar = () => alCambiar({ ...estado });

  // -------------------------------------------------------------------------
  // Sonido
  // -------------------------------------------------------------------------
  function abrirAudio() {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      // sin audioSession no hace falta
    }
    if (!ctx) ctx = new Contexto();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  /** Pitidos: `notas` = [[Hz, segundos], …], uno tras otro. */
  function pitar(notas) {
    if (!ctx || ctx.state !== 'running') return;
    let t = ctx.currentTime + 0.03;
    for (const [hz, dura] of notas) {
      const oscilador = ctx.createOscillator();
      const ganancia = ctx.createGain();
      oscilador.type = 'triangle';
      oscilador.frequency.value = hz;
      ganancia.gain.setValueAtTime(0, t);
      ganancia.gain.linearRampToValueAtTime(0.9, t + 0.015);
      ganancia.gain.setValueAtTime(0.9, t + dura - 0.04);
      ganancia.gain.linearRampToValueAtTime(0, t + dura);
      oscilador.connect(ganancia).connect(ctx.destination);
      oscilador.start(t);
      oscilador.stop(t + dura + 0.02);
      t += dura + 0.07;
    }
  }

  function decir(texto) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    try {
      const frase = new SpeechSynthesisUtterance(texto);
      frase.lang = 'es-CO';
      frase.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(frase);
    } catch {
      // sin voz quedan los pitidos
    }
  }

  const sonarAviso = (camara, distancia) => {
    pitar([[880, 0.16], [880, 0.16], [1175, 0.3]]);
    decir(`Fotomulta a ${Math.round(distancia / 50) * 50} metros. Límite ${camara.limite}.`);
  };
  const sonarExceso = (camara) => {
    pitar([[1568, 0.12], [1568, 0.12], [1568, 0.12], [1568, 0.12]]);
    decir(`Vas por encima de ${camara.limite}.`);
  };

  // -------------------------------------------------------------------------
  // GPS
  // -------------------------------------------------------------------------
  function alUbicar(posicion) {
    const { coords } = posicion;
    const aqui = { latitud: coords.latitude, longitud: coords.longitude, t: posicion.timestamp };
    let velocidad = coords.speed;
    if (previo) {
      const dt = (aqui.t - previo.t) / 1000;
      const paso = metros(previo, aqui);
      if (velocidad == null || Number.isNaN(velocidad)) velocidad = dt > 0.2 ? paso / dt : 0;
      // rumbo: el del GPS si lo da; si no, el del último tramo recorrido
      if (coords.heading != null && !Number.isNaN(coords.heading) && velocidad >= VELOCIDAD_MIN) rumboActual = coords.heading;
      else if (paso > 8) rumboActual = rumbo(previo, aqui);
      if (paso > 8 || dt > 5) previo = aqui;
    } else previo = aqui;
    velocidad = Math.max(0, velocidad || 0);
    estado.gps = 'activo';

    const radio = Math.min(RADIO_MAX, Math.max(RADIO_MIN, velocidad * SEGUNDOS));
    let cerca = null;
    for (const camara of camaras) {
      const distancia = metros(aqui, camara);
      const marca = avisadas.get(camara.id);
      if (distancia > radio + 250) {
        if (marca) avisadas.delete(camara.id); // ya se alejó: puede volver a avisar
        continue;
      }
      if (distancia > radio) continue;
      // Solo cuenta si el carro va hacia ella y en el sentido que vigila.
      const enMarcha = velocidad >= VELOCIDAD_MIN && rumboActual != null;
      const haciaElla = enMarcha && giro(rumboActual, rumbo(aqui, camara)) < 60 && giro(rumboActual, RUMBOS[camara.sentido]) < TOLERANCIA;
      if (!haciaElla && !marca) continue;
      const exceso = velocidad * 3.6 > camara.limite + 3;
      if (haciaElla && !marca) {
        avisadas.set(camara.id, { exceso: false, t: aqui.t });
        sonarAviso(camara, distancia);
      } else if (haciaElla && exceso && !marca.exceso && aqui.t - marca.t > 4000) {
        // sigue por encima del límite unos segundos después del aviso: segundo aviso, una vez
        marca.exceso = true;
        sonarExceso(camara);
      }
      if (haciaElla && (!cerca || distancia < cerca.metros)) cerca = { camara, metros: distancia, exceso };
    }
    estado.cerca = cerca;
    publicar();
  }

  function pedirBloqueo() {
    if (!estado.activo || bloqueo || !navigator.wakeLock || document.hidden) return;
    navigator.wakeLock.request('screen').then(
      (b) => {
        bloqueo = b;
        b.addEventListener('release', () => {
          if (bloqueo === b) bloqueo = null;
        });
        if (!estado.activo) b.release().catch(() => {});
      },
      () => {},
    );
  }

  function activar(si) {
    if (si === estado.activo) return;
    estado.activo = si;
    estado.cerca = null;
    previo = null;
    rumboActual = null;
    avisadas.clear();
    if (!si) {
      if (vigilancia != null) navigator.geolocation.clearWatch(vigilancia);
      vigilancia = null;
      estado.gps = 'apagado';
      if (bloqueo) bloqueo.release().catch(() => {});
      bloqueo = null;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } else if (!navigator.geolocation) {
      estado.gps = 'sin-soporte';
    } else {
      abrirAudio();
      estado.gps = 'pidiendo';
      vigilancia = navigator.geolocation.watchPosition(
        alUbicar,
        (error) => {
          estado.gps = error.code === 1 ? 'denegado' : 'sin-senal';
          estado.cerca = null;
          publicar();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
      pedirBloqueo();
    }
    publicar();
  }

  // El navegador no deja sonar hasta que haya un toque (pasa al abrir la app con el aviso ya
  // activado): cualquier toque suelta el audio.
  const soltar = () => {
    if (estado.activo) abrirAudio();
  };
  document.addEventListener('pointerdown', soltar);
  document.addEventListener('keydown', soltar);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pedirBloqueo();
  });

  return {
    activar,
    activo: () => estado.activo,
    /** Suena el aviso de muestra (al activarlo, para saber cómo suena y a qué volumen). */
    probar() {
      abrirAudio();
      const sonar = () => pitar([[880, 0.16], [880, 0.16], [1175, 0.3]]);
      if (ctx && ctx.state !== 'running') ctx.resume().then(sonar, () => {});
      else sonar();
    },
  };
}
