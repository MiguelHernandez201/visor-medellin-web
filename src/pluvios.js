// Lluvia medida en el suelo: los ~180 pluviómetros del SIATA, del geoportal (a través del
// relevo, ver geoportal.js; se renueva cada ~5 min):
//   https://geoportal.siata.gov.co/fastgeoapi/geodata/geodataJson/3/pluvios_v2 → pluvios.json
// De cada uno se usan:
//   codigo, nombre
//   acumulado_15min      mm de lluvia en los últimos 15 minutos
//   flag_precipitacion   "yes" si está lloviendo ahora
//   icono                sol/luna/nube…; "sol_negro" y "luna_negra" = sin datos
// A diferencia del radar (que estima la lluvia en el aire), esto es lo que cae de verdad,
// aunque solo en los puntos donde hay pluviómetro. Con ellos se dibuja el mapa de calor.
import { fuenteJson, puntos, masCercano, distanciaKm, horaDe } from './geoportal.js';

const SIN_DATOS = ['sol_negro', 'luna_negra'];

/**
 * Nivel de lluvia (0 a 4, como los del radar: llovizna, ligera, moderada, fuerte) según los
 * mm caídos en 15 minutos. 0,5 / 1,5 / 4 mm en 15 min ≈ 2 / 6 / 16 mm por hora.
 */
export function nivelPorMm(mm) {
  if (!(mm > 0)) return 0;
  if (mm < 0.5) return 1;
  if (mm < 1.5) return 2;
  if (mm < 4) return 3;
  return 4;
}

const fuente = fuenteJson('pluvios.json', 2 * 60 * 1000, (geojson) =>
  puntos(geojson)
    .filter(({ p }) => !SIN_DATOS.includes(p.icono) && typeof p.acumulado_15min === 'number' && p.acumulado_15min >= 0)
    .map(({ latitud, longitud, p }) => {
      const lloviendo = p.flag_precipitacion === 'yes';
      const mm = p.acumulado_15min;
      return {
        codigo: String(p.codigo),
        nombre: String(p.nombre || '').trim(),
        latitud,
        longitud,
        mm,
        lloviendo,
        // Solo cuenta como lluvia si el SIATA dice que está lloviendo (un solo golpe del
        // balancín, 0,13-0,25 mm, sin "lloviendo" suele ser lluvia que ya pasó).
        nivel: lloviendo ? Math.max(1, nivelPorMm(mm)) : 0,
        hora: horaDe(p.fecha_ultima_actualizacion),
      };
    }),
);

export const revisarPluvios = fuente.revisar;
export const alActualizarPluvios = fuente.alActualizar;

/** Todos los pluviómetros con datos, o null si aún no han llegado. */
export const pluviometros = () => fuente.datos();

/** Pluviómetro más cercano a un punto (a menos de 2 km), con su distancia `km`, o null. */
export const pluviometroCercano = (latitud, longitud) => masCercano(fuente.datos(), latitud, longitud, 2);

/** Pluviómetros a menos de `km` de un punto ([] si no hay), o null si aún no hay datos. */
export function pluviometrosCerca(latitud, longitud, km) {
  const todos = fuente.datos();
  if (!todos) return null;
  return todos.filter((p) => distanciaKm(latitud, longitud, p.latitud, p.longitud) <= km);
}
