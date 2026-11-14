// Ubicación del carro para el mapa: posición, rumbo y velocidad del GPS del navegador.
// La ubicación no sale del navegador (salvo las coordenadas que se mandan al calcular una ruta).

const RAD = Math.PI / 180;

function metros(a, b) {
  const x = (b.longitud - a.longitud) * RAD * Math.cos(((a.latitud + b.latitud) / 2) * RAD);
  const y = (b.latitud - a.latitud) * RAD;
  return Math.hypot(x, y) * 6371000;
}

/**
 * `alCambiar({ estado, posicion })` se llama con cada lectura o cambio de estado:
 *   estado: 'apagada' | 'pidiendo' | 'activa' | 'denegada' | 'sin-soporte' | 'sin-senal'
 *   posicion: { latitud, longitud, precision (m), velocidad (m/s), rumbo (grados o null) } | null
 * Devuelve { activar(si), activa(), posicion() }.
 */
export function crearUbicacion(alCambiar) {
  let vigilancia = null;
  let estado = 'apagada';
  let posicion = null;
  let previo = null; // punto desde el que se mide el rumbo cuando el GPS no lo da
  let rumbo = null;

  const publicar = () => alCambiar({ estado, posicion });

  function alUbicar(lectura) {
    const { coords } = lectura;
    const aqui = { latitud: coords.latitude, longitud: coords.longitude, t: lectura.timestamp };
    let velocidad = coords.speed;
    if (previo) {
      const dt = (aqui.t - previo.t) / 1000;
      const paso = metros(previo, aqui);
      if (velocidad == null || Number.isNaN(velocidad)) velocidad = dt > 0.2 ? paso / dt : 0;
      if (coords.heading != null && !Number.isNaN(coords.heading) && velocidad > 1.5) rumbo = coords.heading;
      else if (paso > 8) {
        const x = (aqui.longitud - previo.longitud) * Math.cos(aqui.latitud * RAD);
        rumbo = (Math.atan2(x, aqui.latitud - previo.latitud) / RAD + 360) % 360;
      }
      if (paso > 8 || dt > 5) previo = aqui;
    } else previo = aqui;
    estado = 'activa';
    posicion = {
      latitud: aqui.latitud,
      longitud: aqui.longitud,
      precision: coords.accuracy || 0,
      velocidad: Math.max(0, velocidad || 0),
      rumbo,
    };
    publicar();
  }

  function activar(si) {
    if (si === (vigilancia != null || estado === 'sin-soporte')) return;
    if (!si) {
      if (vigilancia != null) navigator.geolocation.clearWatch(vigilancia);
      vigilancia = null;
      estado = 'apagada';
      posicion = null;
      previo = null;
      rumbo = null;
    } else if (!navigator.geolocation) {
      estado = 'sin-soporte';
    } else {
      estado = 'pidiendo';
      vigilancia = navigator.geolocation.watchPosition(
        alUbicar,
        (error) => {
          estado = error.code === 1 ? 'denegada' : 'sin-senal';
          if (error.code === 1) posicion = null;
          publicar();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    }
    publicar();
  }

  return { activar, activa: () => vigilancia != null, posicion: () => posicion, estado: () => estado };
}
