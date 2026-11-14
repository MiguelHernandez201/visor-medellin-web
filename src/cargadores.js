// Cargadores públicos para carros eléctricos (Terpel Voltex, Celsia, EPM, Enel X, Evsy, Tesla,
// centros comerciales…). No hay un listado oficial que junte todas las redes: el relevo de datos
// (scripts/datos.mjs) junta una vez al día OpenStreetMap (amenity=charging_station) y Open
// Charge Map, que mantienen voluntarios y pueden estar incompletos o desactualizados, y deja
// cargadores.json; la app lo toma de ahí. La lista de abajo (leída el 14 de noviembre de 2026,
// solo nombre y lugar) es la de respaldo mientras el relevo no responda.
// © Colaboradores de OpenStreetMap, licencia ODbL.
import { fuenteJson } from './geoportal.js';
import { REDES, redDe } from './redes-carga.js';

export { REDES, redDe, nombreRed } from './redes-carga.js';

/**
 * La lista vigente (siempre el mismo arreglo). Cada cargador:
 * { id, nombre, red, operador, direccion, latitud, longitud, conectores: [texto], kw, plazas, pago, horario }
 */
export const CARGADORES = [
  ["N13009989241", "Audi Colwagen (Medellín)", "Avenida Calle 10, Medellín", 6.21425, -75.58103],
  ["N13009955750", "CDA Los Álamos", "Ciclorruta Carabobo, Medellín", 6.26311, -75.56678],
  ["N13009967299", "Chevrolet Andar - Megataller", "Calle 27, Medellín", 6.22671, -75.57063],
  ["N13009954348", "Chevrolet Autolarte Sur", "Calle 85, Itagüí", 6.18759, -75.586],
  ["N13009929876", "Chevrolet Ayurá Las Vegas", "Calle 26 Sur, Envigado", 6.18336, -75.58552],
  ["N13009974014", "EDS Santa María (Sabaneta)", "Avenida Las Vegas, Sabaneta", 6.15328, -75.61951],
  ["N13009981390", "EDS Texaco Vegas (Envigado)", "Avenida Las Vegas, Envigado", 6.17908, -75.58842],
  ["N13009954415", "Exposiciones EDS Colibrí", "Carrera 54, Medellín", 6.23795, -75.5756],
  ["N13009631797", "Localiza Sabaneta", "Calle 61 Sur, Sabaneta", 6.15658, -75.6122],
  ["N3811577575", "Primax Nutibara", "Avenida Nutibara, Medellín", 6.24796, -75.59816],
  ["N13009960814", "Texaco Combuscol Aeropuerto José María Córdova", "Conexión Vial Aburrá - Oriente, Sajonia", 6.1795, -75.44213],
  ["N13009999858", "Universidad de Antioquia", "Circunvalar Ciudad Universitaria, Medellín", 6.26924, -75.56824],
  ["N9918156574", "Voltex Ancón Sur", "Troncal de Occidente, Sabaneta", 6.13915, -75.63243],
  ["N13009470546", "Voltex Autopista Norte", "Autopista Norte, Medellín", 6.3012, -75.56433],
  ["N10069022269", "Voltex EDS Garota", "Autopista Medellín - Bogotá, Guarne", 6.30241, -75.45712],
  ["N9902522850", "Voltex El Encierro (Medellín)", "Calle 25, Medellín", 6.2246, -75.569],
  ["N13009483977", "Voltex Popalito", "Vía Porcesito - Barbosa, Popalito", 6.47025, -75.28807],
].map(([id, nombre, direccion, latitud, longitud]) => ({
  id,
  nombre,
  red: redDe(nombre),
  operador: '',
  direccion,
  latitud,
  longitud,
  conectores: [],
  kw: null,
  plazas: null,
  pago: null,
  horario: '',
}));

const fuente = fuenteJson('cargadores.json', 6 * 60 * 60 * 1000, (json) => {
  const lista = (json && json.cargadores) || [];
  const validos = lista.filter((c) => c && c.id && typeof c.latitud === 'number' && typeof c.longitud === 'number' && c.nombre);
  if (validos.length < 5 || validos.length !== lista.length) return null; // respuesta rara: se queda la que había
  CARGADORES.splice(
    0,
    CARGADORES.length,
    ...validos.map((c) => ({
      id: String(c.id),
      nombre: String(c.nombre),
      red: REDES.some((red) => red.id === c.red) ? c.red : 'otra',
      operador: String(c.operador || ''),
      direccion: String(c.direccion || ''),
      latitud: c.latitud,
      longitud: c.longitud,
      conectores: Array.isArray(c.conectores) ? c.conectores.map(String) : [],
      kw: c.kw > 0 ? c.kw : null,
      plazas: c.plazas > 0 ? c.plazas : null,
      pago: typeof c.pago === 'boolean' ? c.pago : null,
      horario: String(c.horario || ''),
    })),
  );
  return true;
});

export const revisarCargadores = fuente.revisar;
/** `fn()` se llama cuando llega una lista nueva del relevo. */
export const alActualizarCargadores = (fn) => fuente.alActualizar(() => fuente.datos() && fn());
