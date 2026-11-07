// Mapa del Valle de Aburrá con Leaflet: se arrastra, se pellizca y se hace zoom como
// cualquier mapa web. Encima van:
// - las cámaras, como puntos de colores (divIcon con clases de CSS);
// - la lluvia: el radar (o un cuadro de la animación) o el mapa de calor, en un <canvas>
//   sobre el RECORTE del valle, y una gota en cada pluviómetro donde llueve.
// Fondo: teselas "World Dark Gray" de Esri (base y, encima de la lluvia, los nombres).
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RECORTE, recortarRadar, pintarCalor } from './capas.js';

const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas';
const SEPARACION = 18; // px entre puntos que comparten coordenadas (p. ej. las 5 de la Torre SIATA)
const LIMITES_RECORTE = [
  [RECORTE.sur, RECORTE.oeste],
  [RECORTE.norte, RECORTE.este],
];

/** Capa con un <canvas> estirado sobre un rectángulo geográfico (como L.ImageOverlay). */
const CapaLienzo = L.Layer.extend({
  initialize(limites, opciones) {
    this._limites = L.latLngBounds(limites);
    L.setOptions(this, opciones);
    this._el = L.DomUtil.create('canvas', 'capa-lienzo leaflet-zoom-animated');
  },
  onAdd() {
    this.getPane().appendChild(this._el);
    this._reset();
  },
  onRemove() {
    L.DomUtil.remove(this._el);
  },
  getEvents() {
    const eventos = { zoom: this._reset, viewreset: this._reset };
    if (this._zoomAnimated) eventos.zoomanim = this._animar;
    return eventos;
  },
  _animar(e) {
    const escala = this._map.getZoomScale(e.zoom);
    const desplazamiento = this._map._latLngBoundsToNewLayerBounds(this._limites, e.zoom, e.center).min;
    L.DomUtil.setTransform(this._el, desplazamiento, escala);
  },
  _reset() {
    const caja = L.bounds(
      this._map.latLngToLayerPoint(this._limites.getNorthWest()),
      this._map.latLngToLayerPoint(this._limites.getSouthEast()),
    );
    const tamano = caja.getSize();
    L.DomUtil.setPosition(this._el, caja.min);
    this._el.style.width = `${tamano.x}px`;
    this._el.style.height = `${tamano.y}px`;
  },
  /** Copia `fuente` (un canvas) en el lienzo de la capa. */
  dibujar(fuente) {
    this._el.width = fuente.width;
    this._el.height = fuente.height;
    const contexto = this._el.getContext('2d');
    contexto.clearRect(0, 0, fuente.width, fuente.height);
    contexto.drawImage(fuente, 0, 0);
  },
});

/**
 * Crea el mapa en `contenedor`. Opciones: { vista: { centro, zoom }, alElegir(id), alMover(vista) }.
 * Devuelve { ponerCamaras, marcar, elegir, lluvia, invalidar }.
 */
export function crearMapa(contenedor, { vista, alElegir, alMover }) {
  const mapa = L.map(contenedor, {
    center: vista.centro,
    zoom: vista.zoom,
    minZoom: 10,
    maxZoom: 17,
    maxBounds: [
      [5.4, -76.4],
      [7.1, -74.7],
    ],
    zoomControl: false,
  });
  L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
  mapa.attributionControl.setPrefix(false);

  mapa.createPane('lluvia').style.zIndex = 350;
  const panelNombres = mapa.createPane('nombres');
  panelNombres.style.zIndex = 380;
  panelNombres.style.pointerEvents = 'none';
  mapa.createPane('gotas').style.zIndex = 590;

  L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    maxNativeZoom: 16,
    maxZoom: 17,
    attribution: 'Esri, HERE, Garmin, © OpenStreetMap · radar y pluviómetros: SIATA',
  }).addTo(mapa);
  L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
    pane: 'nombres',
    maxNativeZoom: 16,
    maxZoom: 17,
  }).addTo(mapa);

  const capaRadar = new CapaLienzo(LIMITES_RECORTE, { pane: 'lluvia' });
  const capaCalor = new CapaLienzo(LIMITES_RECORTE, { pane: 'lluvia' });
  const capaGotas = L.layerGroup([], { pane: 'gotas' }).addTo(mapa);
  capaRadar._el.classList.add('capa-radar');

  const actualizarCifras = () => contenedor.classList.toggle('con-cifras', mapa.getZoom() >= 13);
  mapa.on('zoomend', actualizarCifras);
  actualizarCifras();
  mapa.on('moveend', () => {
    const c = mapa.getCenter();
    alMover({ centro: [c.lat, c.lng], zoom: mapa.getZoom() });
  });

  // -------------------------------------------------------------------------
  // Cámaras
  // -------------------------------------------------------------------------
  let marcadores = new Map(); // id → { marcador, punto (span), etiqueta }
  let firma = '';

  /** camaras = [{ id, latitud, longitud }]. Se reconstruye solo si cambia la lista. */
  function ponerCamaras(camaras) {
    const nueva = camaras.map((c) => c.id).join(',');
    if (nueva === firma) return;
    firma = nueva;
    marcadores.forEach(({ marcador }) => marcador.remove());
    marcadores = new Map();
    // Las que comparten coordenadas se reparten en un círculo pequeño (en píxeles).
    const grupos = new Map();
    for (const camara of camaras) {
      const clave = `${camara.latitud},${camara.longitud}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(camara);
    }
    for (const grupo of grupos.values()) {
      grupo.forEach((camara, i) => {
        let dx = 0;
        let dy = 0;
        if (grupo.length > 1) {
          const angulo = (2 * Math.PI * i) / grupo.length - Math.PI / 2;
          const radio = (SEPARACION * grupo.length) / (2 * Math.PI) + 4;
          dx = radio * Math.cos(angulo);
          dy = radio * Math.sin(angulo);
        }
        const icono = L.divIcon({
          className: 'marcador',
          html: '<span class="punto"><span class="punto-etiqueta"></span></span>',
          iconSize: [0, 0],
          iconAnchor: [-dx, -dy],
        });
        const marcador = L.marker([camara.latitud, camara.longitud], { icon: icono, keyboard: false });
        marcador.on('click', () => alElegir(camara.id));
        marcador.addTo(mapa);
        const elemento = marcador.getElement();
        marcadores.set(camara.id, {
          marcador,
          punto: elemento.querySelector('.punto'),
          etiqueta: elemento.querySelector('.punto-etiqueta'),
        });
      });
    }
  }

  /** Pone a cada cámara las clases y el título que devuelve `datos(id)` → { clase, titulo }. */
  function marcar(datos) {
    marcadores.forEach(({ marcador, punto, etiqueta }, id) => {
      const { clase, titulo } = datos(id);
      const nueva = `punto ${clase}`;
      if (punto.className !== nueva) punto.className = nueva;
      if (etiqueta.textContent !== titulo) {
        etiqueta.textContent = titulo;
        marcador.setZIndexOffset(titulo ? 1000 : 0);
      }
    });
  }

  /** Lleva el mapa hasta una cámara si no está a la vista (con margen). */
  function elegir(id) {
    const datos = marcadores.get(id);
    if (!datos) return;
    const punto = datos.marcador.getLatLng();
    if (!mapa.getBounds().pad(-0.15).contains(punto)) mapa.panTo(punto);
  }

  // -------------------------------------------------------------------------
  // Lluvia
  // -------------------------------------------------------------------------
  let radarPintado = null;
  let calorPintado = null;
  let gotasPintadas = null;

  /** { radar: { lienzo } | null, calor: [pluviómetros] | null, gotas: [pluviómetros] | null } */
  function lluvia({ radar = null, calor = null, gotas = null } = {}) {
    if (radar) {
      if (radarPintado !== radar.lienzo) {
        radarPintado = radar.lienzo;
        capaRadar.dibujar(recortarRadar(radar.lienzo));
      }
      if (!mapa.hasLayer(capaRadar)) capaRadar.addTo(mapa);
    } else if (mapa.hasLayer(capaRadar)) capaRadar.remove();

    if (calor) {
      if (calorPintado !== calor) {
        calorPintado = calor;
        capaCalor.dibujar(pintarCalor(calor));
      }
      if (!mapa.hasLayer(capaCalor)) capaCalor.addTo(mapa);
    } else if (mapa.hasLayer(capaCalor)) capaCalor.remove();

    if (gotasPintadas !== gotas) {
      gotasPintadas = gotas;
      capaGotas.clearLayers();
      for (const p of gotas || []) {
        if (!p.nivel) continue;
        const mm = p.mm.toFixed(1).replace('.', ',');
        L.marker([p.latitud, p.longitud], {
          pane: 'gotas',
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: 'marcador',
            html: `<span class="gota nivel-${p.nivel}"><span class="gota-mm">${mm}</span></span>`,
            iconSize: [0, 0],
          }),
        }).addTo(capaGotas);
      }
    }
  }

  return { ponerCamaras, marcar, elegir, lluvia, invalidar: () => mapa.invalidateSize() };
}
