// Herramienta «Spotify» de las utilidades: la música suena dentro de la app (Web Playback SDK),
// así se mezcla con la voz, las bromas y el motor. Con el Spotify propio del Tesla no pasa: el
// carro deja sonar una fuente a la vez y el navegador queda callado.
//
// Pide Spotify Premium y un navegador con contenido protegido (DRM Widevine). El inicio de
// sesión es OAuth con PKCE, todo en el navegador: no hay servidor ni «client secret». Los
// tokens quedan solo en este navegador (localStorage).
import './spotify.css';

const CLIENT_ID = '87465514b1fa4689bf9a1935dbc4dc7a';
const PERMISOS = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');
const CLAVE = 'visor-spotify'; // tokens en localStorage
const CLAVE_INICIO = 'visor-spotify-inicio'; // verificador PKCE mientras se va a Spotify y vuelve
const API = 'https://api.spotify.com/v1';
const NO_PREMIUM = 'Para escuchar música dentro de la app, Spotify pide una cuenta Premium.';

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** La dirección de vuelta registrada en Spotify: la de la app, sin index.html ni parámetros. */
const direccionDeVuelta = () => `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;

function leer(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave) || 'null');
  } catch {
    return null;
  }
}
function escribir(clave, valor) {
  try {
    if (valor == null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin almacenamiento: habrá que iniciar sesión cada vez
  }
}

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const azar = (n) => base64url(crypto.getRandomValues(new Uint8Array(n)));

/** Va a Spotify a pedir permiso; vuelve a la app con ?code=… (ver completarInicioSesion). */
async function iniciarSesion() {
  const verificador = azar(48);
  const reto = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))));
  const estado = azar(12);
  escribir(CLAVE_INICIO, { verificador, estado });
  const parametros = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: direccionDeVuelta(),
    code_challenge_method: 'S256',
    code_challenge: reto,
    scope: PERMISOS,
    state: estado,
  });
  location.assign(`https://accounts.spotify.com/authorize?${parametros}`);
}

async function pedirToken(cuerpo) {
  const respuesta = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...cuerpo }),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !datos.access_token) throw new Error(datos.error_description || datos.error || `HTTP ${respuesta.status}`);
  const anterior = leer(CLAVE) || {};
  const tokens = {
    acceso: datos.access_token,
    refresco: datos.refresh_token || anterior.refresco,
    vence: Date.now() + (datos.expires_in - 60) * 1000,
  };
  escribir(CLAVE, tokens);
  return tokens;
}

/**
 * Si la app acaba de volver de Spotify (?code=…&state=…), cambia el código por los tokens y
 * limpia la dirección. Devuelve true si volvió de Spotify (con o sin éxito), para abrir la
 * herramienta. Se llama una vez al arrancar la app.
 */
export async function completarInicioSesion() {
  const parametros = new URLSearchParams(location.search);
  const codigo = parametros.get('code');
  const error = parametros.get('error');
  const estado = parametros.get('state');
  const inicio = leer(CLAVE_INICIO);
  if ((!codigo && !error) || !inicio || estado !== inicio.estado) return false;
  history.replaceState(null, '', direccionDeVuelta() + location.hash);
  escribir(CLAVE_INICIO, null);
  if (error) return true; // canceló en Spotify
  try {
    await pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: direccionDeVuelta(), code_verifier: inicio.verificador });
  } catch {
    // queda sin sesión; la herramienta muestra el botón de nuevo
  }
  return true;
}

/** Un token válido (lo renueva si venció), o null si no hay sesión. */
async function token() {
  const tokens = leer(CLAVE);
  if (!tokens) return null;
  if (Date.now() < tokens.vence) return tokens.acceso;
  if (!tokens.refresco) return null;
  try {
    return (await pedirToken({ grant_type: 'refresh_token', refresh_token: tokens.refresco })).acceso;
  } catch {
    escribir(CLAVE, null);
    return null;
  }
}

/** Llamada a la API web de Spotify. */
async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const acceso = await token();
  if (!acceso) throw new Error('sin sesión');
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${acceso}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (respuesta.status === 204) return null;
  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    // Spotify a veces responde texto plano (p. ej. el 403 de una cuenta no registrada)
  }
  if (!respuesta.ok) {
    const mensaje = (datos && datos.error && datos.error.message) || texto || `HTTP ${respuesta.status}`;
    if (respuesta.status === 403) {
      // 403: Spotify no deja usar esta cuenta aquí. Se muestra una pantalla clara, no el reproductor.
      const error = new Error(
        /registered|dashboard/i.test(mensaje)
          ? 'Esta cuenta todavía no tiene permiso para usar Spotify en la app. Pídele al dueño de la app que la agregue en el panel de Spotify.'
          : NO_PREMIUM,
      );
      error.bloquea = true;
      throw error;
    }
    throw new Error(mensaje);
  }
  return datos;
}

let sdk = null;
/** Carga el reproductor de Spotify (sdk.scdn.co) una sola vez. */
function cargarSdk() {
  if (!sdk) {
    sdk = new Promise((listo, falla) => {
      if (window.Spotify) return listo(window.Spotify);
      window.onSpotifyWebPlaybackSDKReady = () => listo(window.Spotify);
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.onerror = () => {
        sdk = null;
        falla(new Error('No se pudo cargar el reproductor de Spotify. Revisa la conexión.'));
      };
      document.head.append(script);
    });
  }
  return sdk;
}

/** Monta la herramienta en `el`. Devuelve { mostrar(visible) }. */
export function crearSpotify(el) {
  let reproductor = null;
  let dispositivo = null; // id del reproductor de la app en Spotify Connect
  let estadoActual = null; // último estado del reproductor
  let aviso = '';
  let bloqueo = ''; // por qué no se puede usar Spotify con esta cuenta (403, sin Premium, sin DRM)
  let listas = null;
  let resultados = null;
  let arrancando = false;

  el.innerHTML = `
    <div class="spotify">
      <div class="spotify-sesion" hidden>
        <p>Pon tu música de Spotify dentro de la app: así suena junto con la voz de la ruta, las fotomultas, las bromas y el motor.</p>
        <button class="boton boton-principal util-grande" type="button" data-spotify="entrar">Iniciar sesión con Spotify</button>
        <p class="secundario">Necesita Spotify Premium. Mientras la app de Spotify esté en modo de desarrollo, solo entran las cuentas agregadas en su panel.</p>
      </div>
      <div class="spotify-bloqueo" hidden>
        <span class="util-emoji" aria-hidden="true">🎧</span>
        <h2>No se pudo conectar con Spotify</h2>
        <p class="spotify-bloqueo-texto"></p>
        <div class="util-fila">
          <button class="boton boton-principal" type="button" data-spotify="otra">Usar otra cuenta</button>
          <button class="boton" type="button" data-spotify="reintentar">Reintentar</button>
        </div>
      </div>
      <div class="spotify-reproductor" hidden>
        <div class="spotify-ahora">
          <img class="spotify-portada" alt="" hidden>
          <div class="spotify-cancion"><strong></strong><span></span></div>
        </div>
        <div class="spotify-barra"><span></span></div>
        <div class="util-fila spotify-controles">
          <button class="boton" type="button" data-spotify="anterior" aria-label="Anterior">⏮</button>
          <button class="boton boton-principal util-grande" type="button" data-spotify="pausa" aria-label="Reproducir">▶</button>
          <button class="boton" type="button" data-spotify="siguiente" aria-label="Siguiente">⏭</button>
        </div>
        <label class="spotify-volumen"><span>Volumen</span><input type="range" min="0" max="100" step="1" value="80"></label>
        <button class="boton" type="button" data-spotify="traer" hidden>Pasar la música a esta pantalla</button>
        <form class="spotify-buscar" role="search">
          <input type="search" name="q" placeholder="Buscar canción, artista o lista" autocomplete="off">
          <button class="boton" type="submit">Buscar</button>
        </form>
        <div class="spotify-resultados"></div>
        <h3 class="spotify-subtitulo">Tus listas</h3>
        <div class="spotify-listas"></div>
        <button class="enlace spotify-salir" type="button" data-spotify="salir">Cerrar sesión de Spotify</button>
      </div>
      <p class="secundario spotify-aviso" aria-live="polite"></p>
    </div>`;

  const $ = (selector) => el.querySelector(selector);

  function pintar() {
    const conSesion = Boolean(leer(CLAVE));
    $('.spotify-sesion').hidden = conSesion;
    $('.spotify-bloqueo').hidden = !conSesion || !bloqueo;
    $('.spotify-reproductor').hidden = !conSesion || Boolean(bloqueo);
    $('.spotify-bloqueo-texto').textContent = bloqueo;
    $('.spotify-aviso').textContent = bloqueo ? '' : aviso;
    if (!conSesion || bloqueo) return;
    const pista = estadoActual && estadoActual.track_window && estadoActual.track_window.current_track;
    $('.spotify-cancion strong').textContent = pista ? pista.name : dispositivo ? 'Elige qué escuchar' : 'Conectando…';
    $('.spotify-cancion span').textContent = pista ? pista.artists.map((a) => a.name).join(', ') : '';
    const portada = pista && pista.album && pista.album.images && pista.album.images[0];
    $('.spotify-portada').hidden = !portada;
    if (portada && $('.spotify-portada').src !== portada.url) $('.spotify-portada').src = portada.url;
    const pausado = !estadoActual || estadoActual.paused;
    $('[data-spotify="pausa"]').textContent = pausado ? '▶' : '⏸';
    $('[data-spotify="pausa"]').setAttribute('aria-label', pausado ? 'Reproducir' : 'Pausar');
    // si la música está sonando en otro aparato (el celular, el Spotify del carro…), se ofrece traerla
    $('[data-spotify="traer"]').hidden = !dispositivo || Boolean(estadoActual);
    pintarBarra();
    $('.spotify-listas').innerHTML = listas
      ? listas.length
        ? listas.map((l, i) => `<button class="spotify-item" type="button" data-lista="${i}">${l.imagen ? `<img src="${escapar(l.imagen)}" alt="">` : '<span class="spotify-sin-imagen">♪</span>'}<span>${escapar(l.nombre)}</span></button>`).join('')
        : '<p class="secundario">No tienes listas guardadas.</p>'
      : '';
    $('.spotify-resultados').innerHTML = resultados
      ? resultados.length
        ? resultados.map((r, i) => `<button class="spotify-item" type="button" data-resultado="${i}">${r.imagen ? `<img src="${escapar(r.imagen)}" alt="">` : '<span class="spotify-sin-imagen">♪</span>'}<span><strong>${escapar(r.nombre)}</strong><small>${escapar(r.detalle)}</small></span></button>`).join('')
        : '<p class="secundario">Sin resultados.</p>'
      : '';
  }

  function pintarBarra() {
    const barra = $('.spotify-barra span');
    if (!estadoActual || !estadoActual.duration) return void (barra.style.width = '0%');
    const avance = estadoActual.paused ? estadoActual.position : estadoActual.position + (Date.now() - estadoActual.recibido);
    barra.style.width = `${Math.min(100, (avance / estadoActual.duration) * 100)}%`;
  }
  setInterval(() => {
    if (estadoActual && !estadoActual.paused && !el.closest('[hidden]')) pintarBarra();
  }, 1000);

  async function arrancar() {
    if (reproductor || arrancando || bloqueo || !leer(CLAVE)) return;
    arrancando = true;
    aviso = '';
    pintar();
    try {
      // antes del reproductor, la cuenta: así un «no registrada» o «no es Premium» se explica claro
      const cuenta = await api('/me');
      if (cuenta && cuenta.product && cuenta.product !== 'premium') {
        const error = new Error(NO_PREMIUM);
        error.bloquea = true;
        throw error;
      }
      const Spotify = await cargarSdk();
      reproductor = new Spotify.Player({
        name: 'Visor Medellín',
        getOAuthToken: (dar) => token().then((t) => t && dar(t)),
        volume: Number($('.spotify-volumen input').value) / 100,
      });
      reproductor.addListener('ready', ({ device_id: id }) => {
        dispositivo = id;
        aviso = '';
        pintar();
      });
      reproductor.addListener('not_ready', () => {
        dispositivo = null;
        aviso = 'Se perdió la conexión con Spotify. Reintentando…';
        pintar();
      });
      reproductor.addListener('player_state_changed', (estado) => {
        estadoActual = estado ? { ...estado, recibido: Date.now() } : null;
        pintar();
      });
      reproductor.addListener('initialization_error', () => {
        bloquear('Este navegador no puede reproducir Spotify: no tiene el contenido protegido (DRM) que Spotify exige.');
      });
      reproductor.addListener('authentication_error', () => {
        escribir(CLAVE, null);
        aviso = 'La sesión de Spotify venció. Inicia sesión otra vez.';
        reproductor = null;
        pintar();
      });
      reproductor.addListener('account_error', () => {
        bloquear(NO_PREMIUM);
      });
      reproductor.addListener('playback_error', ({ message }) => {
        aviso = `Spotify no pudo reproducir: ${message}`;
        pintar();
      });
      await reproductor.connect();
      cargarListas();
    } catch (error) {
      if (error.bloquea) bloquear(error.message);
      else if (error instanceof TypeError) aviso = 'No se pudo conectar con Spotify. Revisa la conexión y toca Reintentar.';
      else aviso = error.message.charAt(0).toUpperCase() + error.message.slice(1);
      if (reproductor) reproductor.disconnect();
      reproductor = null;
    }
    arrancando = false;
    pintar();
  }

  /** Deja de intentar y muestra la pantalla de «No se pudo conectar» con `motivo`. */
  function bloquear(motivo) {
    bloqueo = motivo;
    if (reproductor) reproductor.disconnect();
    reproductor = null;
    dispositivo = null;
    estadoActual = null;
    pintar();
  }

  async function cargarListas() {
    try {
      const datos = await api('/me/playlists?limit=30');
      listas = (datos.items || []).filter(Boolean).map((l) => ({ nombre: l.name, uri: l.uri, imagen: l.images && l.images.length ? l.images[l.images.length - 1].url : '' }));
    } catch (error) {
      listas = [];
      if (error.bloquea) bloquear(error.message);
      else aviso = `No se pudieron leer tus listas: ${error.message}`;
    }
    pintar();
  }

  async function buscar(texto) {
    if (!texto.trim()) return;
    try {
      const datos = await api(`/search?${new URLSearchParams({ q: texto, type: 'track,playlist', limit: '8' })}`);
      const imagen = (imagenes) => (imagenes && imagenes.length ? imagenes[imagenes.length - 1].url : '');
      resultados = [
        ...((datos.tracks && datos.tracks.items) || []).filter(Boolean).map((t) => ({ nombre: t.name, detalle: t.artists.map((a) => a.name).join(', '), uris: [t.uri], imagen: imagen(t.album && t.album.images) })),
        ...((datos.playlists && datos.playlists.items) || []).filter(Boolean).map((l) => ({ nombre: l.name, detalle: 'Lista', contexto: l.uri, imagen: imagen(l.images) })),
      ];
    } catch (error) {
      resultados = [];
      aviso = `No se pudo buscar: ${error.message}`;
    }
    pintar();
  }

  /** Pone a sonar en la app `{ contexto }` (lista) o `{ uris }` (canciones). */
  async function poner(que) {
    if (!dispositivo) return;
    reproductor.activateElement(); // Safari y algunos navegadores lo piden dentro del toque
    try {
      await api(`/me/player/play?device_id=${dispositivo}`, { metodo: 'PUT', cuerpo: que.contexto ? { context_uri: que.contexto } : { uris: que.uris } });
      aviso = '';
    } catch (error) {
      aviso = `No se pudo reproducir: ${error.message}`;
    }
    pintar();
  }

  async function traer() {
    if (!dispositivo) return;
    reproductor.activateElement();
    try {
      await api('/me/player', { metodo: 'PUT', cuerpo: { device_ids: [dispositivo], play: true } });
    } catch (error) {
      aviso = `No se pudo pasar la música: ${error.message}`;
      pintar();
    }
  }

  el.addEventListener('click', async (evento) => {
    const objetivo = evento.target;
    const lista = objetivo.closest('[data-lista]');
    if (lista && listas) return void poner({ contexto: listas[Number(lista.dataset.lista)].uri });
    const resultado = objetivo.closest('[data-resultado]');
    if (resultado && resultados) return void poner(resultados[Number(resultado.dataset.resultado)]);
    const boton = objetivo.closest('[data-spotify]');
    if (!boton) return;
    const accion = boton.dataset.spotify;
    if (accion === 'entrar') {
      try {
        await iniciarSesion();
      } catch {
        aviso = 'No se pudo iniciar sesión en este navegador.';
        pintar();
      }
      return;
    }
    if (accion === 'reintentar') {
      bloqueo = '';
      aviso = '';
      return void arrancar();
    }
    if (accion === 'salir' || accion === 'otra') {
      bloqueo = '';
      if (reproductor) reproductor.disconnect();
      reproductor = null;
      dispositivo = null;
      estadoActual = null;
      listas = null;
      resultados = null;
      escribir(CLAVE, null);
      if (accion === 'otra') return void iniciarSesion().catch(() => pintar());
      return void pintar();
    }
    if (!reproductor) return;
    reproductor.activateElement();
    if (accion === 'pausa') {
      if (estadoActual) reproductor.togglePlay();
      else traer();
    } else if (accion === 'anterior') reproductor.previousTrack();
    else if (accion === 'siguiente') reproductor.nextTrack();
    else if (accion === 'traer') traer();
  });
  $('.spotify-volumen input').addEventListener('input', (evento) => {
    if (reproductor) reproductor.setVolume(Number(evento.target.value) / 100);
  });
  $('.spotify-buscar').addEventListener('submit', (evento) => {
    evento.preventDefault();
    buscar(evento.target.q.value);
  });

  pintar();
  return {
    /** Al abrir la herramienta se conecta el reproductor (si hay sesión). */
    mostrar(visible) {
      if (visible) arrancar();
      pintar();
    },
  };
}
