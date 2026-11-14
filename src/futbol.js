// Herramienta «Fútbol» de las utilidades: Liga colombiana (Primera A).
//   Fecha    los partidos de la fecha actual, con el marcador y el minuto en vivo
//   Tabla    la tabla de posiciones del torneo en curso
//   Mi equipo el próximo partido de tu equipo y su lugar en la tabla
// Con «Avisar goles», mientras la app esté abierta, una voz grabada canta cada gol de los
// partidos de tu equipo («¡Gol de Atlético Nacional!»).
//
// Datos: la API pública (sin clave, no oficial) de ESPN, que deja consultarse desde el navegador.
// Si cambia o falla, la herramienta lo dice y el resto de la app sigue igual.
import { voz } from './voz.js';
import { EQUIPOS_VOZ } from './frases-voz.js';
import './futbol.css';

const BASE = 'https://site.api.espn.com/apis';
const LIGA = 'col.1';
const VIVO_MS = 30 * 1000; // con un partido en juego
const CALMA_MS = 5 * 60 * 1000; // sin partidos en juego
const CLASIFICAN = 8; // los ocho primeros pasan a los cuadrangulares

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function pedir(ruta) {
  const respuesta = await fetch(`${BASE}${ruta}`);
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return respuesta.json();
}

/** Un partido del marcador de ESPN, con lo que hace falta. */
function leerPartido(evento) {
  const competencia = evento.competitions[0];
  const equipo = (lado) => {
    const c = competencia.competitors.find((x) => x.homeAway === lado) || {};
    const t = c.team || {};
    return { id: String(t.id || ''), nombre: t.shortDisplayName || t.displayName || '', logo: t.logo || '', goles: c.score != null && c.score !== '' ? Number(c.score) : null };
  };
  const estado = evento.status.type;
  return {
    id: evento.id,
    fecha: new Date(evento.date),
    local: equipo('home'),
    visitante: equipo('away'),
    estado: estado.state, // pre | in | post
    minuto: evento.status.displayClock || '',
    detalle: estado.shortDetail || '',
    estadio: (competencia.venue && competencia.venue.fullName) || '',
  };
}

const hora = (fecha) => fecha.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const dia = (fecha) => fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });

/** Monta la herramienta en `el`. `leer` y `guardar` son las preferencias. Devuelve { mostrar(visible) }. */
export function crearFutbol(el, { leer, guardar }) {
  const pref = { vista: 'fecha', equipo: '5264', goles: false, ...leer('futbol', {}) };
  const recordar = () => guardar('futbol', pref);
  let visible = false;
  let partidos = null; // fecha actual
  let tabla = null; // { nombre, filas }
  let proximo = undefined; // próximo partido de mi equipo (null = no hay)
  let error = '';
  let ultimaLectura = 0;
  let reloj = null;
  const marcadores = new Map(); // id del partido → "local-visitante" (para cantar los goles)

  const opcionesEquipos = Object.entries(EQUIPOS_VOZ)
    .sort((a, b) => a[1].localeCompare(b[1], 'es'))
    .map(([id, nombre]) => `<option value="${id}">${escapar(nombre)}</option>`)
    .join('');

  el.innerHTML = `
    <div class="futbol">
      <div class="util-fila futbol-pestanas">
        <button class="boton" type="button" data-vista="fecha">Fecha</button>
        <button class="boton" type="button" data-vista="tabla">Tabla</button>
        <button class="boton" type="button" data-vista="equipo">Mi equipo</button>
      </div>
      <div class="futbol-cuerpo"></div>
      <label class="futbol-goles"><input type="checkbox" name="goles"><span>Avisar con voz los goles de mi equipo (con la app abierta)</span></label>
      <p class="secundario futbol-pie"></p>
    </div>`;
  const $ = (selector) => el.querySelector(selector);
  $('[name="goles"]').checked = Boolean(pref.goles);

  const nombreMiEquipo = () => EQUIPOS_VOZ[pref.equipo] || 'tu equipo';
  const esMio = (p) => p.local.id === pref.equipo || p.visitante.id === pref.equipo;

  function htmlPartido(p) {
    const marcador = p.estado === 'pre' ? `<span class="futbol-hora">${hora(p.fecha)}</span>` : `<span class="futbol-marcador">${p.local.goles ?? 0} - ${p.visitante.goles ?? 0}</span>`;
    const estado = p.estado === 'in' ? `<span class="futbol-vivo">● ${escapar(p.minuto)}</span>` : p.estado === 'post' ? '<span class="futbol-final">Final</span>' : `<span class="futbol-dia">${escapar(dia(p.fecha))}</span>`;
    const equipo = (e, lado) => `<span class="futbol-equipo ${lado}">${e.logo ? `<img src="${escapar(e.logo)}" alt="" loading="lazy">` : ''}<span>${escapar(e.nombre)}</span></span>`;
    return `<li class="futbol-partido${esMio(p) ? ' mio' : ''}${p.estado === 'in' ? ' en-vivo' : ''}">
      ${equipo(p.local, 'local')}
      <span class="futbol-centro">${marcador}${estado}</span>
      ${equipo(p.visitante, 'visitante')}
    </li>`;
  }

  function pintar() {
    el.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === pref.vista)));
    let html = '';
    if (error && !partidos && !tabla) html = `<p class="futbol-error">No se pudieron leer los datos del fútbol (${escapar(error)}). Reintento en un momento.</p>`;
    else if (pref.vista === 'fecha') {
      if (!partidos) html = '<p class="secundario">Cargando la fecha…</p>';
      else if (!partidos.length) html = '<p class="secundario">No hay partidos en esta fecha.</p>';
      else {
        // en juego primero, luego por jugar y al final los terminados
        const orden = { in: 0, pre: 1, post: 2 };
        const lista = [...partidos].sort((a, b) => orden[a.estado] - orden[b.estado] || a.fecha - b.fecha);
        html = `<ul class="futbol-partidos">${lista.map(htmlPartido).join('')}</ul>`;
      }
    } else if (pref.vista === 'tabla') {
      if (!tabla) html = '<p class="secundario">Cargando la tabla…</p>';
      else {
        html = `<h3 class="futbol-titulo">${escapar(tabla.nombre)}</h3>
          <table class="futbol-tabla">
            <thead><tr><th>#</th><th class="izquierda">Equipo</th><th>PJ</th><th>DG</th><th>Pts</th></tr></thead>
            <tbody>${tabla.filas
              .map(
                (f) => `<tr class="${f.id === pref.equipo ? 'mio' : ''}${f.puesto === CLASIFICAN ? ' corte' : ''}">
                  <td>${f.puesto}</td>
                  <td class="izquierda"><span class="futbol-equipo">${f.logo ? `<img src="${escapar(f.logo)}" alt="" loading="lazy">` : ''}<span>${escapar(f.nombre)}</span></span></td>
                  <td>${f.pj}</td><td>${escapar(f.dg)}</td><td><strong>${f.pts}</strong></td>
                </tr>`,
              )
              .join('')}</tbody>
          </table>
          <p class="secundario">Los ${CLASIFICAN} primeros pasan a los cuadrangulares (la línea marca el corte).</p>`;
      }
    } else {
      const fila = tabla && tabla.filas.find((f) => f.id === pref.equipo);
      const enFecha = partidos && partidos.find(esMio);
      const siguiente = enFecha || proximo;
      html = `<label class="futbol-elegir"><span>Mi equipo</span><select name="equipo">${opcionesEquipos}</select></label>
        ${fila ? `<p class="futbol-posicion"><strong>${fila.puesto}.º</strong> en la tabla · ${fila.pts} puntos en ${fila.pj} partidos · diferencia ${escapar(fila.dg)}</p>` : ''}
        ${siguiente ? `<h3 class="futbol-titulo">${siguiente.estado === 'post' ? 'Último partido' : siguiente.estado === 'in' ? 'Jugando ahora' : 'Próximo partido'}</h3><ul class="futbol-partidos">${htmlPartido(siguiente)}</ul>${siguiente.estadio ? `<p class="secundario">${escapar(siguiente.estadio)}</p>` : ''}` : proximo === null ? '<p class="secundario">No hay un próximo partido programado.</p>' : '<p class="secundario">Buscando el próximo partido…</p>'}`;
    }
    $('.futbol-cuerpo').innerHTML = html;
    const elegir = $('[name="equipo"]');
    if (elegir) elegir.value = pref.equipo;
    $('.futbol-pie').textContent = ultimaLectura
      ? `Datos de ESPN · actualizado a las ${new Date(ultimaLectura).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`
      : 'Datos de ESPN';
  }

  /** Lee la fecha; si hay goles nuevos en los partidos de mi equipo, los canta. */
  async function leerFecha() {
    const datos = await pedir(`/site/v2/sports/soccer/${LIGA}/scoreboard`);
    partidos = (datos.events || []).map(leerPartido);
    for (const p of partidos) {
      const marcador = `${p.local.goles ?? 0}-${p.visitante.goles ?? 0}`;
      const antes = marcadores.get(p.id);
      marcadores.set(p.id, marcador);
      if (!antes || antes === marcador || !pref.goles || !esMio(p)) continue;
      const [l0, v0] = antes.split('-').map(Number);
      const anoto = (p.local.goles ?? 0) > l0 ? p.local : (p.visitante.goles ?? 0) > v0 ? p.visitante : null;
      if (anoto) {
        voz.decir([`gol-${anoto.id}`]);
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      }
    }
  }

  async function leerTabla() {
    const datos = await pedir(`/v2/sports/soccer/${LIGA}/standings`);
    const grupo = (datos.children || [])[0];
    if (!grupo) return;
    const valor = (stats, nombre) => (stats.find((s) => s.name === nombre) || {}).displayValue ?? '';
    tabla = {
      nombre: grupo.name === 'Clausura' ? 'Liga BetPlay · Clausura' : grupo.name === 'Apertura' ? 'Liga BetPlay · Apertura' : grupo.name,
      filas: grupo.standings.entries
        .map((e) => ({
          id: String(e.team.id),
          nombre: e.team.shortDisplayName || e.team.displayName,
          logo: (e.team.logos && e.team.logos[0] && e.team.logos[0].href) || '',
          puesto: Number(valor(e.stats, 'rank')) || 0,
          pj: valor(e.stats, 'gamesPlayed'),
          dg: valor(e.stats, 'pointDifferential'),
          pts: Number(valor(e.stats, 'points')) || 0,
        }))
        .sort((a, b) => a.puesto - b.puesto),
    };
  }

  async function leerProximo() {
    const datos = await pedir(`/site/v2/sports/soccer/${LIGA}/teams/${pref.equipo}/schedule?fixture=true`);
    const eventos = (datos.events || []).map((e) => leerPartido({ ...e, status: e.competitions[0].status }));
    proximo = eventos.find((p) => p.estado !== 'post') || null;
  }

  /** Lee lo que haga falta y programa la próxima lectura. */
  async function actualizar(todo = false) {
    clearTimeout(reloj);
    try {
      const tareas = [leerFecha()];
      if (todo || !tabla) tareas.push(leerTabla());
      if (todo || proximo === undefined) tareas.push(leerProximo().catch(() => (proximo = null)));
      await Promise.all(tareas);
      error = '';
      ultimaLectura = Date.now();
    } catch (e) {
      error = e.message;
    }
    if (visible) pintar();
    // se sigue leyendo mientras se ve la herramienta, o en segundo plano si hay que cantar goles
    const enJuego = partidos && partidos.some((p) => p.estado === 'in' && (visible || esMio(p)));
    if (visible || pref.goles) reloj = setTimeout(() => actualizar(), enJuego ? VIVO_MS : CALMA_MS);
  }

  el.addEventListener('click', (evento) => {
    const vista = evento.target.closest('[data-vista]');
    if (!vista) return;
    pref.vista = vista.dataset.vista;
    recordar();
    pintar();
  });
  el.addEventListener('change', (evento) => {
    if (evento.target.name === 'equipo') {
      pref.equipo = evento.target.value;
      proximo = undefined;
      recordar();
      pintar();
      actualizar();
    } else if (evento.target.name === 'goles') {
      pref.goles = evento.target.checked;
      recordar();
      if (pref.goles) voz.cargar('futbol');
      actualizar();
    }
  });

  // con «Avisar goles» encendido, se vigila desde que abre la app
  if (pref.goles) {
    voz.cargar('futbol');
    actualizar(true);
  }

  return {
    mostrar(ver) {
      visible = ver;
      if (!ver) return;
      pintar();
      if (Date.now() - ultimaLectura > VIVO_MS) actualizar(!tabla);
    },
  };
}
