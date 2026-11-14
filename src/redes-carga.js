// Redes de carga que se distinguen en el mapa y cómo reconocerlas. Va aparte de cargadores.js
// porque también lo usa el relevo de datos (scripts/datos.mjs), que corre en Node.

/** Redes que se distinguen en el mapa; `patron` se busca en nombre, operador, red y marca. */
export const REDES = [
  { id: 'voltex', nombre: 'Terpel Voltex', patron: /voltex|terpel/i },
  { id: 'celsia', nombre: 'Celsia', patron: /celsia/i },
  { id: 'epm', nombre: 'EPM', patron: /\bepm\b|empresas p[uú]blicas de medell[ií]n/i },
  { id: 'enel', nombre: 'Enel X', patron: /enel/i },
  { id: 'evsy', nombre: 'Evsy', patron: /evsy/i },
  { id: 'tesla', nombre: 'Tesla', patron: /tesla/i },
  {
    id: 'comercial',
    nombre: 'Centro comercial',
    patron:
      /centro comercial|\bc\.? ?c\.?\b|\bmall\b|parque comercial|unicentro|santa ?f[eé]|oviedo|el tesoro|premium plaza|\bviva\b|mayorca|molinos|san diego|florida|aventura|arkadia|la central|city plaza|puerta del norte|terminal del sur/i,
  },
  { id: 'otra', nombre: 'Otra red', patron: /^/ },
];

/** id de la red de un cargador, por los textos que lo describen. */
export const redDe = (...textos) => REDES.find((red) => red.patron.test(textos.filter(Boolean).join(' · '))).id;
export const nombreRed = (id) => (REDES.find((red) => red.id === id) || REDES[REDES.length - 1]).nombre;

