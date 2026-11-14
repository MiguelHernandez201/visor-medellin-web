// Frases de voz grabadas (public/voces/<id>.mp3). Las genera una vez `npm run voces` con
// ElevenLabs (scripts/voces.mjs) y quedan en el repositorio: la app nunca llama a ElevenLabs.
// Para cambiar una frase: se cambia aquí el texto y se corre `npm run voces -- --rehacer <id>`.
// Los números van en letras para que la voz no los lea raro.
//
// Lo usan la app (voz.js, avisos.js, bromas.js, la guía de la ruta) y el script, en Node: aquí
// no puede haber nada del navegador.

const NUMEROS = { 30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta', 80: 'ochenta', 90: 'noventa', 100: 'cien', 120: 'ciento veinte' };
/** Límites de velocidad con frase propia (los de las fotomultas de Medellín y alrededores). */
export const LIMITES = Object.keys(NUMEROS).map(Number);

/** Distancias con frase propia para la guía («En doscientos metros, …»). */
export const DISTANCIAS_VOZ = [1000, 500, 300, 200, 100];
const DISTANCIAS = { 1000: 'En un kilómetro,', 500: 'En quinientos metros,', 300: 'En trescientos metros,', 200: 'En doscientos metros,', 100: 'En cien metros,' };
const ORDINALES = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta'];

export const FRASES = {
  // Aviso de fotomultas
  'fotomulta-prueba': 'Cámara de fotomulta más adelante.',
  ...Object.fromEntries(LIMITES.map((l) => [`fotomulta-${l}`, `Cámara de fotomulta más adelante. Límite ${NUMEROS[l]} kilómetros por hora.`])),
  ...Object.fromEntries(LIMITES.map((l) => [`exceso-${l}`, `Reduce la velocidad. El límite es ${NUMEROS[l]}.`])),

  // Guía de la ruta: «En doscientos metros,» + la maniobra, o la maniobra sola al llegar a ella
  ...Object.fromEntries(DISTANCIAS_VOZ.map((d) => [`en-${d}`, DISTANCIAS[d]])),
  'giro-izquierda': 'gira a la izquierda.',
  'giro-derecha': 'gira a la derecha.',
  'leve-izquierda': 'mantente a la izquierda.',
  'leve-derecha': 'mantente a la derecha.',
  'cerrado-izquierda': 'gira cerrado a la izquierda.',
  'cerrado-derecha': 'gira cerrado a la derecha.',
  derecho: 'sigue derecho.',
  'giro-u': 'haz un giro en U.',
  glorieta: 'entra a la glorieta.',
  ...Object.fromEntries(ORDINALES.map((o, i) => [`glorieta-${i + 1}`, `en la glorieta, toma la ${o} salida.`])),
  'salir-glorieta': 'sal de la glorieta.',
  acceso: 'toma el acceso.',
  'acceso-izquierda': 'toma el acceso a la izquierda.',
  'acceso-derecha': 'toma el acceso a la derecha.',
  salida: 'toma la salida.',
  'salida-izquierda': 'toma la salida a la izquierda.',
  'salida-derecha': 'toma la salida a la derecha.',
  incorporate: 'incorpórate a la vía.',
  'incorporate-izquierda': 'incorpórate por la izquierda.',
  'incorporate-derecha': 'incorpórate por la derecha.',
  'bifurcacion-izquierda': 'en la bifurcación, mantente a la izquierda.',
  'bifurcacion-derecha': 'en la bifurcación, mantente a la derecha.',
  'bifurcacion-derecho': 'en la bifurcación, sigue derecho.',
  'final-izquierda': 'al final de la vía, gira a la izquierda.',
  'final-derecha': 'al final de la vía, gira a la derecha.',
  llegas: 'llegarás a tu destino.',
  llegada: 'Llegaste a tu destino.',
  recalculando: 'Recalculando la ruta.',

  // Bromas
  'quien-escanear': 'Iniciando escáner de olores.',
  'quien-0': '¡El que se cagó fue el conductor!',
  'quien-1': '¡El que se cagó fue el copiloto!',
  'quien-2': '¡El que se cagó fue el de atrás a la izquierda!',
  'quien-3': '¡El que se cagó fue el del medio!',
  'quien-4': '¡El que se cagó fue el de atrás a la derecha!',
  'mentira-analizando': 'Analizando respuesta.',
  'mentira-verdad': 'Dice la verdad.',
  'mentira-mentira': '¡Mentira! ¡Está mintiendo!',
  'choque-alerta': '¡Alerta! Colisión detectada. Llamando a emergencias.',
  'choque-broma': '¡Es broma!',
};

/** Grupos que se bajan juntos (cada parte de la app pide solo los suyos). */
export const GRUPOS = {
  fotomultas: Object.keys(FRASES).filter((id) => /^(fotomulta|exceso)-/.test(id)),
  ruta: Object.keys(FRASES).filter((id) => !/^(fotomulta|exceso|quien|mentira|choque)-/.test(id)),
  bromas: Object.keys(FRASES).filter((id) => /^(quien|mentira|choque)-/.test(id)),
};
