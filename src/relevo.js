// Frescura del relevo de datos (GitHub Actions → rama "datos", ver scripts/datos.mjs).
// estado.json dice cuándo corrió el flujo por última vez ("generado"). Si deja de correr, la
// app seguiría mostrando la última copia (pluviómetros, niveles, clima, alertas) sin ningún
// error; con esto se puede avisar en pantalla que los datos están viejos.
import { fuenteJson } from './geoportal.js';

/** Desde cuántos minutos se avisa (el flujo corre cada 5-15 min). */
export const MINUTOS_VIEJO = 20;
/** Desde cuántos minutos el aviso pasa a rojo. */
export const MINUTOS_MUY_VIEJO = 60;

const fuente = fuenteJson('estado.json', 60 * 1000, (estado) => ({
  generado: Date.parse(estado && estado.generado) || null,
}));

export const revisarRelevo = fuente.revisar;
export const alActualizarRelevo = fuente.alActualizar;

function textoMinutos(minutos) {
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas} h`;
  return `${Math.floor(horas / 24)} días`;
}

/**
 * Estado de los datos del relevo:
 *   null                                   aún no se sabe (primera carga)
 *   { nivel: 'ok' | 'viejo' | 'muy-viejo', minutos, texto }
 * Si nunca llegó estado.json (rama borrada, sin conexión…) tras dos intentos, 'muy-viejo'
 * con minutos = null.
 */
export function frescuraRelevo(ahora = Date.now()) {
  const datos = fuente.datos();
  if (!datos || !datos.generado) {
    return fuente.fallos() >= 2 ? { nivel: 'muy-viejo', minutos: null, texto: 'no se pudieron cargar' } : null;
  }
  const minutos = Math.max(0, Math.floor((ahora - datos.generado) / 60000));
  const nivel = minutos >= MINUTOS_MUY_VIEJO ? 'muy-viejo' : minutos >= MINUTOS_VIEJO ? 'viejo' : 'ok';
  return { nivel, minutos, texto: `hace ${textoMinutos(minutos)}` };
}
