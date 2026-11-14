# Visor Medellín (PWA)

Versión web del [Visor Medellín para LG webOS TV](https://github.com/MiguelHernandez201/visor-medellin), con una interfaz propia para la web: las cámaras de tránsito del **SIMM** (Sistema Inteligente de Movilidad de Medellín) y las del **SIATA** (Sistema de Alerta Temprana del Valle de Aburrá), renovadas cada minuto, con la lluvia (radar y pluviómetros), el nivel de los ríos, el clima, las alertas del SIATA y un mapa de todas. Se instala como app en el computador, la tableta o el celular.

**App:** https://miguelhernandez201.github.io/visor-medellin-web/

> Las imágenes son de la Alcaldía de Medellín ([SIMM](https://www.medellin.gov.co/SIMM/mapas/index.html?map=camarasCctv)) y del [SIATA](https://siata.gov.co/siata_nuevo/). No son video: cada cámara publica una **foto fija** que se renueva cada minuto. Uso personal; revisa los términos de uso de esos sitios antes de redistribuir nada.

## Qué hace

- **Cinco secciones**: **Tránsito** (80 cámaras del SIMM), **SIATA** (deprimidos viales, panorámicas y cámaras de cielo), **Ríos** (72 cámaras del río Medellín, quebradas y drenajes, de norte a sur), **Mapa** y **Motor**. En el computador van arriba; en el celular, en una barra abajo, como en las apps.
- **Tarjetas con la foto** de cada cámara, en una grilla que se adapta al ancho (2 columnas en el celular). Solo se renuevan las que están a la vista.
- **Búsqueda y filtros**: por nombre o dirección, *Favoritas*, *Con lluvia* y, en Ríos, *En alerta*.
- **Lluvia en cada cámara**: etiqueta de llovizna, ligera, moderada o fuerte, del radar del SIATA (sin falsos ecos) confirmado con los pluviómetros a menos de 2,5 km.
- **Nivel de los ríos**: riesgo N1 a N4 y metros de agua de la estación del SIATA junto a cada cámara de río; en el visor, la gráfica de las últimas 3 horas con las franjas de riesgo.
- **Visor**: la cámara en grande, con anterior / siguiente (botones, flechas del teclado o deslizando el dedo), favorita y **recorrido automático** (15 s por cámara, con barra de progreso).
- **Mapa** (Leaflet: arrastrar, pellizcar, zoom): todas las cámaras con colores por fuente, anillo donde llueve y anillo que late en los ríos en alerta. Capas de lluvia: **Radar** (radar + gotas en los pluviómetros donde llueve), **Medida** (mapa de calor de los pluviómetros) y **Últimas 3 h** (animación del radar). Al tocar una cámara se abre un panel (al lado en el computador, desde abajo en el celular) con su foto, lluvia, nivel, clima y calidad del aire.
- **Fotomultas en el mapa**: las cámaras de fotodetección de la Secretaría de Movilidad, como señales con su límite de velocidad; al tocar una se ve el lugar, el sentido y qué detecta. Se ocultan con el botón «Fotomultas». Los datos son una copia de la capa oficial `Camaras_FDT` (ver `src/fotomultas.js`): no se actualizan solos y la Alcaldía puede mover cámaras.
- **Aviso sonoro de fotomultas**: con el botón «Aviso sonoro» del mapa, la app usa el GPS y avisa (tres pitidos, voz si el navegador la tiene y una franja amarilla en cualquier pestaña) al acercarse a una fotomulta en el sentido que vigila: a 300 m, o antes si se va rápido (unos 12 s de recorrido). Si unos segundos después se sigue por encima del límite, suena un segundo aviso y la franja se pone roja. No avisa en sentido contrario ni con el carro detenido. La página debe quedar abierta.
- **Mi carro en el mapa**: el botón de la flecha (arriba a la derecha del mapa) muestra el carro con el GPS, como una flecha que apunta hacia donde va, con su velocidad; el mapa lo sigue hasta que se arrastra con el dedo.
- **Rutas**: con el botón «Ruta» se busca un destino por nombre (lugares, barrios, centros comerciales y las cámaras de la app) o tocándolo en el mapa. Se dibuja la ruta en carro desde la ubicación, con distancia, tiempo sin tráfico, las fotomultas que tiene en ese sentido y la lista de giros. Al manejar muestra la siguiente maniobra y lo que falta, y recalcula si el carro se sale del trazado. Lugares de [Photon](https://photon.komoot.io) y rutas de [OSRM](https://project-osrm.org) sobre OpenStreetMap: no conocen el tráfico, el pico y placa ni los cierres, y para calcular la ruta se les envían las coordenadas de origen y destino.
- **Motor**: sonido de motor de gasolina para un carro eléctrico, generado en vivo (sin grabaciones) y que sigue la velocidad del GPS. Seis motores (V8 americano, V8 deportivo, V12, bóxer 6, 4 cilindros turbo y eléctrico), caja automática imaginaria con cambios, limitador y petardeo. **Prueba con pedales** (acelerador y freno, o ↑ ↓ en el teclado) y **Demostración** para oírlo sin moverse; **Acelerar en neutro** con el carro detenido. Ajustes: volumen, intensidad, carácter, petardeo, tono y volumen del silbido, km/h o mph y encender al abrir. La ubicación solo se usa para medir la velocidad y no sale del navegador. El motor sigue sonando al pasar a las otras secciones.
- **Clima y alertas**: temperatura del centro en la barra superior y franja roja si el SIATA tiene una alerta vigente.
- **Se instala como app** (botón «Instalar» en Chrome/Edge/Android, «Añadir a pantalla de inicio» en Safari) y abre rápido gracias al service worker. Favoritas, sección, filtros y vista del mapa se recuerdan en el navegador.

## Uso

| Acción | Ratón / táctil | Teclado |
|---|---|---|
| Cambiar de sección | Pestañas (arriba o abajo) | 1 a 5 |
| Acelerar / frenar (Motor, modo de prueba) | Pedales en pantalla | ↑ / ↓ |
| Buscar | Caja de búsqueda | `/` |
| Ver una cámara en grande | Tocar la foto | Tab hasta la foto y Enter |
| Anterior / siguiente en el visor | Flechas a los lados o deslizar | ← → |
| Recorrido automático | ▶ en la lista o en el visor | Espacio (en el visor) |
| Favorita | Estrella | F (en el visor) |
| Cerrar el visor | ✕ o el botón Atrás del celular | Esc |

## Cómo funciona en la web

La app del TV corre desde `file://` y puede leer cualquier sitio. En el navegador rige CORS, así que cada fuente se resuelve distinto:

| Dato | Cómo llega |
|---|---|
| Fotos del SIMM y del SIATA | `<img>` directo (las imágenes no necesitan CORS). Sin acceso a las cabeceras, se piden cada minuto sin sincronizar con la cámara. |
| Radar (última imagen) | `siata.gov.co/data/siata_app/ultima_imagen_radarDBZH.png`, que **sí** envía CORS: se lee píxel a píxel igual que en el TV. |
| Animación del radar | Lista en `siata.gov.co/data/siata_app/animacion_radar.json` (con CORS); las imágenes no tienen CORS, así que se muestran tal cual, sin quitar falsos ecos. |
| Niveles, pluviómetros, clima, aire, alertas, series de 3 h | La API del [geoportal del SIATA](https://geoportal.siata.gov.co) **no** envía CORS: pasan por el **relevo de datos** (abajo). |
| Mapa | [Leaflet](https://leafletjs.com) con teselas *World Dark Gray* de Esri. |

### Relevo de datos

`.github/workflows/datos.yml` corre cada 5 minutos en GitHub Actions: `scripts/datos.mjs` descarga del geoportal los niveles, pluviómetros, estaciones meteorológicas, PM2.5, alertas y las series de 3 h de las ~50 estaciones que tienen cámara, y los publica en la rama **`datos`** (un solo commit que se reemplaza cada vez). La app los lee de `raw.githubusercontent.com/MiguelHernandez201/visor-medellin-web/datos/…`, que sí envía CORS.

- Los datos llegan con **5 a 15 minutos de retraso** (GitHub no corre los flujos programados a la hora exacta, y raw.githubusercontent.com guarda 5 min en caché). En el TV llegan al minuto.
- La API a veces responde sin los umbrales de riesgo de las estaciones: el relevo guarda los últimos que llegaron (`umbrales.json`) y los rellena.
- Si una fuente falla, se conserva su archivo anterior; `estado.json` dice qué falló y cuándo se generó.
- GitHub desactiva los flujos programados de un repo público tras 60 días sin actividad: si pasa, se reactiva en la pestaña *Actions*.
- Para usar otro relevo (por ejemplo, un Cloudflare Worker que reenvíe al geoportal en tiempo real), abre la app con `?datos=<url>` o cambia `DATOS_POR_DEFECTO` en `src/geoportal.js`. La URL debe servir los mismos nombres de archivo.

### PWA

- `public/manifest.webmanifest` y los íconos de `public/icons/` (generados desde `scripts/icono.svg` con `npm run iconos`).
- `public/sw.js`: guarda la "cáscara" (HTML, JS, CSS, íconos) para abrir rápido; las fotos y los datos van siempre a la red. `npm run build` le pone la versión (el commit), así cada publicación reemplaza la caché anterior. En `localhost` no se registra.

### Publicación

`.github/workflows/pages.yml`: en cada push a `main` construye con `npm run build` (esbuild → `dist/`) y publica `dist/` en GitHub Pages.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:8084 (recarga al guardar)
npm run build    # dist/ listo para publicar
npm run datos    # prueba el relevo: deja los JSON en datos/
```

Para probar con datos locales: `npm run datos`, sirve la carpeta del proyecto y abre la app con `?datos=http://localhost:<puerto>/datos`.

| Parte | Qué hace |
|---|---|
| `src/main.js` | Interfaz: secciones, tarjetas, búsqueda y filtros, visor, recorrido, favoritas, panel del mapa |
| `src/motor.js` | Sección Motor: GPS, pedales, caja de cambios imaginaria (velocidad → revoluciones y carga) e interfaz |
| `src/motor-audio.js` | Sintetizador del motor (Web Audio, AudioWorklet): pulsos de escape por cilindro, resonancias, petardeo y silbido |
| `src/fotomultas.js` | Cámaras de fotodetección (copia de la capa oficial de la Alcaldía) |
| `src/avisos.js` | Aviso sonoro al acercarse a una fotomulta (GPS, rumbo y sentido de la cámara) |
| `src/ubicacion.js` | Posición, rumbo y velocidad del carro (GPS) para el mapa |
| `src/rutas.js` | Búsqueda de lugares (Photon), ruta en carro (OSRM), indicaciones en español y seguimiento de la ruta |
| `src/iconos.js` | Íconos SVG |
| `src/app.css` | Estilos adaptables (celular, tableta, computador) |
| `src/pwa.js` | Registro del service worker y botón «Instalar app» |
| `src/fuente.js` | Descarga de las fotos y búsqueda de cámaras del SIMM |
| `src/siata.js` | Cámaras del SIATA con sus coordenadas y estación de nivel |
| `src/nombres.js` | Nombre, dirección y coordenadas de las 80 cámaras del SIMM |
| `src/lluvia.js` | Radar: nivel de lluvia en cada punto, falsos ecos y animación |
| `src/geoportal.js` | Lectura periódica de los datos del relevo y utilidades |
| `src/niveles.js`, `src/pluvios.js`, `src/clima.js` | Niveles de los ríos, pluviómetros, clima, aire y alertas |
| `src/mapa.js`, `src/capas.js` | Mapa (Leaflet) y lienzos de las capas de lluvia (radar recortado, mapa de calor) |
| `src/grafica.js` | Gráfica del nivel de un río |
| `public/` | Página, manifiesto, service worker e íconos |
| `scripts/construir.mjs` | Construcción de `dist/` |
| `scripts/datos.mjs` | Relevo de datos del SIATA |
| `.github/workflows/` | Publicación en Pages y relevo cada 5 min |

### Si no aparecen las cámaras del SIMM

El sitio de la Alcaldía a veces rechaza conexiones (por ejemplo desde fuera de Colombia) o se cae; en ese caso las fotos del SIMM salen como «Sin imagen» y las del SIATA siguen funcionando.
