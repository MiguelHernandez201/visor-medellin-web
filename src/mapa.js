// Mapa del Valle de Aburrá con Leaflet: se arrastra, se pellizca y se hace zoom como
// cualquier mapa web. Encima van:
// - las cámaras, como puntos de colores (divIcon con clases de CSS);
// - la lluvia: el radar (o un cuadro de la animación) o el mapa de calor, en un <canvas>
//   sobre el RECORTE del valle, y una gota en cada pluviómetro donde llueve.
// - las cámaras de fotodetección (fotomultas), como señales con el límite de velocidad.
// - capas de puntos con globo: los cargadores de carros eléctricos y los moteles.
// - el carro (flecha con el rumbo del GPS) y la ruta hasta un destino.
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
 * Crea el mapa en `contenedor`. Opciones: { vista: { centro, zoom }, alElegir(id), alMover(vista),
 * alTocar([lat, lon]): toque en el mapa, alArrastrar(): el usuario movió el mapa con el dedo }.
 * Devuelve { ponerCamaras, marcar, elegir, lluvia, fotomultas, vehiculo, ruta, encuadrar, centro,
 * acercar, girable, girar, invalidar }.
 */
export function crearMapa(contenedor, { vista, alElegir, alMover, alTocar = () => {}, alArrastrar = () => {} }) {
  const mapa = L.map(contenedor, {
    center: vista.centro,
    zoom: vista.zoom,
    minZoom: 10,
    maxZoom: 17,
    maxBounds: [
      [5.4, -76.4],
      [7.1, -74.7],
    ],
    // Sin controles propios de Leaflet: el mapa puede girar (ver `girar`) y los botones no deben
    // girar con él, así que el zoom y los créditos los pone la página, fuera del mapa.
    zoomControl: false,
    attributionControl: false,
  });

  mapa.createPane('lluvia').style.zIndex = 350;
  const panelNombres = mapa.createPane('nombres');
  panelNombres.style.zIndex = 380;
  panelNombres.style.pointerEvents = 'none';
  mapa.createPane('gotas').style.zIndex = 590;
  mapa.createPane('fotomultas').style.zIndex = 595; // debajo de las cámaras (600)
  mapa.createPane('ruta').style.zIndex = 420; // sobre la lluvia y los nombres, bajo los puntos
  mapa.createPane('vehiculo').style.zIndex = 640; // encima de todo lo demás
  mapa.getPane('vehiculo').style.pointerEvents = 'none';

  L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    maxNativeZoom: 16,
    maxZoom: 17,
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
  mapa.on('click', (evento) => alTocar([evento.latlng.lat, evento.latlng.lng]));
  mapa.on('dragstart', alArrastrar);
  // mientras hay zoom, el carro no se desliza (iría por detrás del mapa)
  mapa.on('zoomstart', () => contenedor.classList.add('en-zoom'));
  mapa.on('zoomend', () => contenedor.classList.remove('en-zoom'));
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
    if (!limitesVisibles().pad(-0.15).contains(punto)) mapa.panTo(punto);
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

  // -------------------------------------------------------------------------
  // Fotomultas
  // -------------------------------------------------------------------------
  let capaFotomultas = null;
  let versionFotomultas = 0;

  /**
   * Muestra u oculta las cámaras de fotodetección. lista = [{ latitud, longitud, limite }];
   * `html(camara)` da el contenido del globo que se abre al tocar una.
   */
  function fotomultas(lista, html, version = 0) {
    if (capaFotomultas && version !== versionFotomultas) {
      // llegó una lista nueva: se arma otra vez
      capaFotomultas.remove();
      capaFotomultas = null;
    }
    versionFotomultas = version;
    if (!lista) {
      if (capaFotomultas) capaFotomultas.remove();
      return;
    }
    if (!capaFotomultas) {
      capaFotomultas = L.layerGroup();
      for (const camara of lista) {
        L.marker([camara.latitud, camara.longitud], {
          pane: 'fotomultas',
          keyboard: false,
          title: `Fotomulta · ${camara.limite} km/h`,
          icon: L.divIcon({
            className: 'marcador',
            html: `<span class="fotomulta">${camara.limite}</span>`,
            iconSize: [0, 0],
          }),
        })
          .bindPopup(() => html(camara), { className: 'globo', maxWidth: 260, offset: [0, -8] })
          .addTo(capaFotomultas);
      }
    }
    if (!mapa.hasLayer(capaFotomultas)) capaFotomultas.addTo(mapa);
  }

  // -------------------------------------------------------------------------
  // El carro y la ruta
  // -------------------------------------------------------------------------
  let marcaVehiculo = null;
  let circuloVehiculo = null;
  let giroVehiculo = 0; // grados acumulados: así de 350° a 10° gira 20° y no da la vuelta entera

  /**
   * Pone el carro en el mapa. posicion = { latitud, longitud, precision, rumbo } o null para
   * quitarlo. Con `seguir`, el mapa se centra en él (y se acerca la primera vez).
   */
  function vehiculo(posicion, seguir = false) {
    if (!posicion) {
      if (marcaVehiculo) marcaVehiculo.remove();
      if (circuloVehiculo) circuloVehiculo.remove();
      marcaVehiculo = null;
      circuloVehiculo = null;
      return;
    }
    const lugar = [posicion.latitud, posicion.longitud];
    if (!marcaVehiculo) {
      circuloVehiculo = L.circle(lugar, { pane: 'ruta', radius: 1, interactive: false, className: 'vehiculo-precision' }).addTo(mapa);
      marcaVehiculo = L.marker(lugar, {
        pane: 'vehiculo',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'marcador vehiculo-marcador',
          html: '<span class="vehiculo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l7 17.5-7-4-7 4z"/></svg></span>',
          iconSize: [0, 0],
        }),
      }).addTo(mapa);
    } else {
      marcaVehiculo.setLatLng(lugar);
      circuloVehiculo.setLatLng(lugar);
    }
    circuloVehiculo.setRadius(Math.min(400, Math.max(5, posicion.precision || 0)));
    const figura = marcaVehiculo.getElement().querySelector('.vehiculo');
    figura.classList.toggle('sin-rumbo', posicion.rumbo == null);
    if (posicion.rumbo != null) {
      // (dentro de un mapa girado la flecha gira con él: con el rumbo arriba queda apuntando arriba)
      giroVehiculo += ((posicion.rumbo - giroVehiculo + 540) % 360) - 180;
      figura.style.transform = `translate(-50%, -50%) rotate(${Math.round(giroVehiculo)}deg)`;
    }
    if (seguir) {
      if (mapa.getZoom() < 15) mapa.setView(lugar, 16);
      else mapa.panTo(lugar, { animate: true, duration: 1, easeLinearity: 1 });
    }
  }

  // -------------------------------------------------------------------------
  // Cargadores de carros eléctricos
  // -------------------------------------------------------------------------
  const capasPuntos = new Map(); // clave → { capa, version }

  /**
   * Muestra u oculta una capa de puntos con globo (cargadores, moteles…). `lista` = [{ latitud,
   * longitud, … }] o null para ocultarla. `icono(p)` da el HTML de la marca, `titulo(p)` su
   * texto, `html(p)` el globo, y `alIr(p)` se llama al tocar su botón «Ir aquí» (.globo-ir).
   * Si cambia `version`, la capa se arma de nuevo (llegó otra lista o cambió el filtro).
   */
  function puntos(clave, lista, { icono, titulo, html, alIr }, version = 0) {
    if (!capasPuntos.has(clave)) capasPuntos.set(clave, { capa: null, version: 0 });
    const estado = capasPuntos.get(clave);
    if (estado.capa && version !== estado.version) {
      estado.capa.remove();
      estado.capa = null;
    }
    estado.version = version;
    if (!lista) {
      if (estado.capa) estado.capa.remove();
      return;
    }
    if (!estado.capa) {
      estado.capa = L.layerGroup();
      for (const punto of lista) {
        const marca = L.marker([punto.latitud, punto.longitud], {
          pane: 'fotomultas',
          keyboard: false,
          title: titulo(punto),
          icon: L.divIcon({ className: 'marcador', html: icono(punto), iconSize: [0, 0] }),
        }).bindPopup(() => html(punto), { className: 'globo', maxWidth: 270, offset: [0, -10] });
        // Leaflet no deja salir del globo los clics: el botón se conecta al abrirlo
        marca.on('popupopen', (evento) => {
          const boton = evento.popup.getElement().querySelector('.globo-ir');
          if (boton) {
            boton.onclick = () => {
              mapa.closePopup();
              alIr(punto);
            };
          }
        });
        marca.addTo(estado.capa);
      }
    }
    if (!mapa.hasLayer(estado.capa)) estado.capa.addTo(mapa);
  }

  let capaRuta = null;

  /** Dibuja la ruta (puntos = [[lat, lon]]) y el destino ([lat, lon]); null quita cada uno. */
  function ruta(puntos, destino) {
    if (capaRuta) capaRuta.remove();
    capaRuta = null;
    if (!puntos && !destino) return;
    capaRuta = L.layerGroup().addTo(mapa);
    if (puntos) {
      L.polyline(puntos, { pane: 'ruta', className: 'ruta-borde', interactive: false }).addTo(capaRuta);
      L.polyline(puntos, { pane: 'ruta', className: 'ruta-linea', interactive: false }).addTo(capaRuta);
    }
    if (destino) {
      L.marker(destino, {
        pane: 'vehiculo',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'marcador', html: '<span class="destino"></span>', iconSize: [0, 0] }),
      }).addTo(capaRuta);
    }
  }

  /** Acerca o aleja el mapa para que quepan todos los puntos [[lat, lon]]. */
  function encuadrar(puntos) {
    if (!puntos || !puntos.length) return;
    const [mx, my] = margen();
    mapa.fitBounds(L.latLngBounds(puntos), { padding: [mx + 48, my + 48], maxZoom: 16 });
  }

  // -------------------------------------------------------------------------
  // Giro del mapa (rumbo arriba)
  // -------------------------------------------------------------------------
  // Leaflet no gira mapas. Se gira el contenedor entero con CSS: para que al girar no queden
  // esquinas vacías, el contenedor pasa a ser un cuadrado del tamaño de la diagonal de la
  // caja visible, centrado en ella. Los puntos y globos se contragiran en el CSS (--giro).
  // Con el mapa girado Leaflet no sabe convertir un toque en coordenadas, así que el zoom se
  // hace alrededor del centro y quien arrastre o deba tocar un punto primero lo endereza.
  const caja = contenedor.parentElement;
  let esGirable = false;
  let giro = 0; // grados acumulados

  function medir() {
    if (!esGirable) return;
    const lado = Math.ceil(Math.hypot(caja.clientWidth, caja.clientHeight)) + 2;
    if (contenedor.style.getPropertyValue('--lado') !== `${lado}px`) {
      contenedor.style.setProperty('--lado', `${lado}px`);
      mapa.invalidateSize();
    }
  }
  if (window.ResizeObserver) new ResizeObserver(medir).observe(caja);

  /** Lo que sobra del mapa a cada lado de la caja visible: [horizontal, vertical] en px. */
  function margen() {
    const tamano = mapa.getSize();
    return [Math.max(0, (tamano.x - caja.clientWidth) / 2), Math.max(0, (tamano.y - caja.clientHeight) / 2)];
  }

  /** Límites geográficos de lo que se ve (sin lo que sobra del cuadrado). Vale sin giro. */
  function limitesVisibles() {
    const [mx, my] = margen();
    const tamano = mapa.getSize();
    return L.latLngBounds(mapa.containerPointToLatLng([mx, tamano.y - my]), mapa.containerPointToLatLng([tamano.x - mx, my]));
  }

  /** Prepara el mapa para poder girar (o lo devuelve a su tamaño normal). */
  function girable(si) {
    if (si === esGirable) return;
    esGirable = si;
    if (!si) girar(0, true);
    contenedor.classList.toggle('girable', si);
    if (si) medir();
    else {
      contenedor.style.removeProperty('--lado');
      mapa.invalidateSize();
    }
  }

  /** Gira el mapa para que `rumbo` (grados; 0 = norte) quede arriba. `yaMismo`: sin animación. */
  function girar(rumbo, yaMismo = false) {
    const destino = esGirable ? -rumbo : 0;
    giro += ((destino - giro + 540) % 360) - 180; // por el lado corto
    if (!esGirable) giro = 0;
    contenedor.classList.toggle('sin-animar', yaMismo);
    contenedor.style.setProperty('--giro', `${giro.toFixed(1)}deg`);
    const girado = Math.abs(((giro % 360) + 360) % 360) > 0.5;
    const modo = girado ? 'center' : true;
    mapa.options.scrollWheelZoom = modo;
    mapa.options.touchZoom = modo;
    mapa.options.doubleClickZoom = modo;
    return girado;
  }

  return {
    acercar: (pasos) => mapa.setZoom(mapa.getZoom() + pasos),
    girable,
    girar,
    ponerCamaras,
    marcar,
    elegir,
    lluvia,
    fotomultas,
    puntos,
    vehiculo,
    ruta,
    encuadrar,
    centro: () => [mapa.getCenter().lat, mapa.getCenter().lng],
    invalidar: () => mapa.invalidateSize(),
  };
}
