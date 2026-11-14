// Voz grabada de la app: las frases de frases-voz.js (public/voces/<id>.mp3, generadas una vez
// con ElevenLabs). Una sola salida de audio para toda la app; una frase nueva corta la que esté
// sonando. Cada parte baja su grupo de frases cuando lo va a necesitar (cargar).
//
// `decir` devuelve false si no puede hablar (no han llegado las frases, el audio aún no tiene
// permiso o el navegador no tiene Web Audio): quien la llama sigue con su plan B (la voz del
// navegador, pitidos o nada).
import { crearGrabaciones } from './grabaciones.js';
import { FRASES, GRUPOS } from './frases-voz.js';

const PAUSA = 0.06; // segundos entre los trozos de una frase («En doscientos metros,» + «gira…»)

let ctx = null;
let grabaciones = null;
let sonando = []; // nodos de la frase actual, para cortarla

function contexto() {
  if (ctx) return ctx;
  const Contexto = window.AudioContext || window.webkitAudioContext;
  if (!Contexto) return null;
  try {
    // iPhone: sin esto el interruptor de silencio también calla la voz
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // sin audioSession no hace falta
  }
  ctx = new Contexto();
  grabaciones = crearGrabaciones(ctx, Object.keys(FRASES), ctx.destination, 'voces');
  // el navegador no deja sonar hasta que haya un toque: cualquiera suelta el audio
  const soltar = () => {
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  };
  document.addEventListener('pointerdown', soltar);
  document.addEventListener('keydown', soltar);
  soltar();
  return ctx;
}

export const voz = {
  /** Baja las frases de un grupo de GRUPOS (fotomultas, ruta, bromas). Promesa: true si llegaron. */
  cargar(grupo) {
    if (!contexto()) return Promise.resolve(false);
    return grabaciones.cargar(GRUPOS[grupo] || []); // cada archivo se baja una sola vez
  },

  /** true si todas las frases `ids` están listas para sonar. */
  tiene(ids) {
    return Boolean(grabaciones) && ids.every((id) => grabaciones.lista(id));
  },

  /**
   * Dice los trozos `ids` uno tras otro, `antes` segundos después de ahora. Corta lo que
   * estuviera diciendo. Devuelve false (sin decir nada) si falta algún trozo o no hay audio.
   */
  decir(ids, { antes = 0 } = {}) {
    if (!ctx || ctx.state !== 'running' || !this.tiene(ids)) return false;
    this.callar();
    let t = ctx.currentTime + 0.02 + antes;
    for (const id of ids) {
      const nodo = grabaciones.sonar(id, t);
      if (nodo) sonando.push(nodo);
      t += grabaciones.duracion(id) + PAUSA;
    }
    return true;
  },

  /** Corta la frase que esté sonando. */
  callar() {
    for (const nodo of sonando) {
      try {
        nodo.stop();
      } catch {
        // ya había terminado
      }
    }
    sonando = [];
  },
};
