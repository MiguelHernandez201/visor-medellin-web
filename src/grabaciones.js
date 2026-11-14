// Grabaciones para los efectos y la voz: public/sonidos/*.mp3 (de Freesound con licencia CC0,
// ver el LEEME de esa carpeta) y public/voces/*.mp3 (las frases de frases-voz.js). Se bajan una
// vez, se decodifican y se igualan de volumen (el pico de cada una queda en el mismo nivel). Si alguna no llega, quien la usa sigue con su
// sonido sintetizado: por eso cada efecto pregunta `lista(nombre)` antes de usarla.

const PICO = 0.9; // nivel al que queda el pico de cada grabación

/**
 * `nombres`: archivos de public/<carpeta> sin el .mp3. `destino`: nodo al que suenan.
 * Devuelve { cargar(lista?), lista(nombre), duracion(nombre), sonar(nombre, cuando, opciones) }.
 */
export function crearGrabaciones(ctx, nombres, destino = ctx.destination, carpeta = 'sonidos') {
  const buferes = {};
  const bajando = new Map(); // nombre → promesa (cada archivo se baja una sola vez)
  const tandas = new Map(); // lista pedida → promesa

  async function una(nombre) {
    try {
      const respuesta = await fetch(`${carpeta}/${nombre}.mp3`);
      if (!respuesta.ok) return;
      const bufer = await ctx.decodeAudioData(await respuesta.arrayBuffer());
      let pico = 0;
      for (let c = 0; c < bufer.numberOfChannels; c++) {
        const datos = bufer.getChannelData(c);
        for (let i = 0; i < datos.length; i++) pico = Math.max(pico, Math.abs(datos[i]));
      }
      const factor = pico > 0 ? PICO / pico : 1;
      for (let c = 0; c < bufer.numberOfChannels; c++) {
        const datos = bufer.getChannelData(c);
        for (let i = 0; i < datos.length; i++) datos[i] *= factor;
      }
      buferes[nombre] = bufer;
    } catch {
      // sin esta grabación: se usa el sonido sintetizado
    }
  }

  /** Baja `lista` (por omisión, todas) una sola vez. Promesa: true si llegaron todas. */
  function cargar(lista = nombres) {
    const clave = lista.join('|');
    if (!tandas.has(clave)) {
      const promesas = lista.map((nombre) => {
        if (!bajando.has(nombre)) bajando.set(nombre, una(nombre));
        return bajando.get(nombre);
      });
      tandas.set(clave, Promise.all(promesas).then(() => lista.every((n) => buferes[n])));
    }
    return tandas.get(clave);
  }

  return {
    cargar,
    lista: (nombre) => Boolean(buferes[nombre]),
    duracion: (nombre) => (buferes[nombre] ? buferes[nombre].duration : 0),
    /**
     * Suena `nombre` en `cuando` (tiempo del contexto). Opciones: `nivel` (0 a 1), `desde`
     * (segundo de la grabación en el que empieza), `bucle` y `hasta` (cuándo se apaga, con un
     * desvanecido de 0,3 s). Devuelve el nodo que suena (para pararlo), o null si no está.
     */
    sonar(nombre, cuando, { nivel = 1, desde = 0, bucle = false, hasta = 0 } = {}) {
      const bufer = buferes[nombre];
      if (!bufer) return null;
      const fuente = ctx.createBufferSource();
      fuente.buffer = bufer;
      fuente.loop = bucle;
      const ganancia = ctx.createGain();
      ganancia.gain.value = nivel;
      if (hasta) {
        ganancia.gain.setValueAtTime(nivel, Math.max(cuando, hasta - 0.3));
        ganancia.gain.linearRampToValueAtTime(0, hasta);
      }
      fuente.connect(ganancia).connect(destino);
      fuente.start(cuando, desde);
      if (hasta) fuente.stop(hasta + 0.05);
      return fuente;
    },
  };
}
