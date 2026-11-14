// Moteles del Valle de Aburrá. Fuente: OpenStreetMap (amenity=love_hotel y tourism=motel), que
// mantienen voluntarios: puede faltar alguno o haber datos viejos. El relevo de datos
// (scripts/datos.mjs) lo consulta una vez al día y deja moteles.json; la app lo toma de ahí.
// La lista de abajo (leída el 14 de noviembre de 2026) es la de respaldo.
// © Colaboradores de OpenStreetMap, licencia ODbL.
import { fuenteJson } from './geoportal.js';

/** La lista vigente (siempre el mismo arreglo): { id, nombre, direccion, latitud, longitud, telefono, web }. */
export const MOTELES = [
  ["W126386667", "Best", "Calle 64, Medellín", 6.27801, -75.60219],
  ["N3388696511", "Brisas del estadio", "Avenida Colombia, Medellín", 6.25851, -75.58537],
  ["W126386668", "Clasic", "Calle 63, Medellín", 6.2782, -75.60341],
  ["N3811578828", "Collins", "Calle 50 67-108, Medellín", 6.25802, -75.58417],
  ["W151945970", "El Bosque", "Calle 80 Sur, La Estrella", 6.15455, -75.63747],
  ["N3811599525", "Eva Suites", "Calle 51, Medellín", 6.25845, -75.58509],
  ["N12097361090", "HOT", "Carrera 25, Marinilla", 6.17074, -75.33128],
  ["N3811578585", "Hotel 3D suites", "Calle 51 69-47, Medellín", 6.2588, -75.58582],
  ["N3811599022", "Hotel D´lusso", "Calle 50 68-38, Medellín", 6.25809, -75.58456],
  ["N14066142108", "Hotel Moet", "Calle 10 36-22, Medellín", 6.20864, -75.5659],
  ["W760130576", "Kuboz", "Ciclorruta La Picacha, Medellín", 6.23895, -75.58829],
  ["N3811594980", "Le Blanc", "Calle 50 67-66, Medellín", 6.25787, -75.58414],
  ["W1193574777", "Motel Aires", "Calle 79C Sur, La Estrella", 6.15306, -75.63252],
  ["W573797715", "Motel Complicidades", "Autopista Bello - El Hatillo, Bello", 6.34601, -75.52215],
  ["W151945971", "Motel Los Chalets", "Calle 80 Sur, La Estrella", 6.15432, -75.63706],
  ["W1367958501", "Motel Los Ángeles", "Carrera 52, La Estrella", 6.15314, -75.63312],
  ["N5867581212", "Motel Natalia", "Calle 57, Medellín", 6.25679, -75.57136],
  ["W189253234", "Motel Penhouse", "Motel Penhouse, Medellín", 6.27672, -75.62345],
  ["W621152796", "Punto Cero", "Carrera 65, Medellín", 6.26836, -75.57623],
  ["W126389546", "Siesta", "Carrera 91, Medellín", 6.27846, -75.6005],
  ["N9112341431", "Suite 66", "Carrera 66, Medellín", 6.24828, -75.58435],
  ["N9112460707", "Suites 44", "Carrera 70A, Medellín", 6.2492, -75.58991],
  ["N3811578829", "Thematics Suites", "Calle 51 67B-27, Medellín", 6.25811, -75.58437],
].map(([id, nombre, direccion, latitud, longitud]) => ({ id, nombre, direccion, latitud, longitud, telefono: '', web: '' }));

const fuente = fuenteJson('moteles.json', 6 * 60 * 60 * 1000, (json) => {
  const lista = (json && json.moteles) || [];
  const validos = lista.filter((m) => m && m.id && typeof m.latitud === 'number' && typeof m.longitud === 'number' && m.nombre);
  if (validos.length < 5 || validos.length !== lista.length) return null; // respuesta rara: se queda la que había
  MOTELES.splice(
    0,
    MOTELES.length,
    ...validos.map((m) => ({
      id: String(m.id),
      nombre: String(m.nombre),
      direccion: String(m.direccion || ''),
      latitud: m.latitud,
      longitud: m.longitud,
      telefono: String(m.telefono || ''),
      web: /^https?:\/\//.test(m.web || '') ? String(m.web) : '',
    })),
  );
  return true;
});

export const revisarMoteles = fuente.revisar;
/** `fn()` se llama cuando llega una lista nueva del relevo. */
export const alActualizarMoteles = (fn) => fuente.alActualizar(() => fuente.datos() && fn());
