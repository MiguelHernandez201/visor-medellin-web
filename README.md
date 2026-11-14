# Visor Medellín (PWA)

Versión web del [Visor Medellín para LG webOS TV](https://github.com/MiguelHernandez201/visor-medellin), con una interfaz propia para la web: las cámaras de tránsito del **SIMM** (Sistema Inteligente de Movilidad de Medellín) y las del **SIATA** (Sistema de Alerta Temprana del Valle de Aburrá), renovadas cada minuto, con la lluvia (radar y pluviómetros), el nivel de los ríos, el clima, las alertas del SIATA y un mapa de todas. Se instala como app en el computador, la tableta o el celular.

**App:** https://miguelhernandez201.github.io/visor-medellin-web/

> Las imágenes son de la Alcaldía de Medellín ([SIMM](https://www.medellin.gov.co/SIMM/mapas/index.html?map=camarasCctv)) y del [SIATA](https://siata.gov.co/siata_nuevo/). No son video: cada cámara publica una **foto fija** que se renueva cada minuto. Uso personal; revisa los términos de uso de esos sitios antes de redistribuir nada.

## Qué hace

- **Cuatro secciones**: **Mapa** (la primera y con la que abre la app), **Ver cámaras** —con las subopciones **Tránsito** (80 cámaras del SIMM), **SIATA** (deprimidos viales, panorámicas y cámaras de cielo) y **Ríos** (72 cámaras del río Medellín, quebradas y drenajes, de norte a sur)—, **Motor Tesla** y **Utilidades**. En el computador van arriba; en el celular, en una barra abajo, como en las apps.
- **Tarjetas con la foto** de cada cámara, en una grilla que se adapta al ancho (2 columnas en el celular). Solo se renuevan las que están a la vista.
- **Búsqueda y filtros**: por nombre o dirección, *Favoritas*, *Con lluvia* y, en Ríos, *En alerta*.
- **Lluvia en cada cámara**: etiqueta de llovizna, ligera, moderada o fuerte, del radar del SIATA (sin falsos ecos) confirmado con los pluviómetros a menos de 2,5 km.
- **Nivel de los ríos**: riesgo N1 a N4 y metros de agua de la estación del SIATA junto a cada cámara de río; en el visor, la gráfica de las últimas 3 horas con las franjas de riesgo.
- **Visor**: la cámara en grande, con anterior / siguiente (botones, flechas del teclado o deslizando el dedo), favorita y **recorrido automático** (15 s por cámara, con barra de progreso).
- **Mapa** (Leaflet: arrastrar, pellizcar, zoom): todas las cámaras con colores por fuente, anillo donde llueve y anillo que late en los ríos en alerta. Capas de lluvia: **Radar** (radar + gotas en los pluviómetros donde llueve), **Medida** (mapa de calor de los pluviómetros) y **Últimas 3 h** (animación del radar). Al tocar una cámara se abre un panel (al lado en el computador, desde abajo en el celular) con su foto, lluvia, nivel, clima y calidad del aire.
- **Fotomultas en el mapa**: las cámaras de fotodetección de la Secretaría de Movilidad, como señales con su límite de velocidad; al tocar una se ve el lugar, el sentido y qué detecta. Los datos son la capa oficial `Camaras_FDT` de la Alcaldía: el relevo de datos la lee una vez al día y la app la toma de ahí (con una copia de respaldo en `src/fotomultas.js` por si el relevo no responde).
- **Filtros del mapa**: el botón «Filtros» abre un panel para elegir qué marcas se ven: cámaras de Tránsito, SIATA y Ríos, fotomultas, cargadores (y cada red por separado), moteles y pluviómetros, con el conteo de cada una y atajos «Todo», «Solo cámaras» y «Nada». Se recuerda.
- **Moteles**: capa del mapa con los moteles de la zona (de OpenStreetMap, leídos una vez al día por el relevo); al tocar uno se ve la dirección y un botón **Ir aquí**.
- **Aviso de fotomultas por voz**: con el botón «Aviso sonoro» del mapa, la app usa el GPS y, al acercarse a una fotomulta en el sentido que vigila (a 300 m, o antes si se va rápido), dice «Cámara de fotomulta más adelante» y el límite, con un timbre antes y una franja amarilla en cualquier pestaña. Si unos segundos después se sigue por encima del límite, dice «Reduce la velocidad» y la franja se pone roja. Si el navegador no tiene voz en español, suenan pitidos en su lugar. No avisa en sentido contrario ni con el carro detenido. La página debe quedar abierta.
- **Mapa a todo lo ancho**: la pestaña del borde derecho del mapa recoge el panel lateral y lo vuelve a mostrar; se recuerda. Al tocar una cámara o abrir una ruta, el panel vuelve solo.
- **Mi carro en el mapa**: el botón de la flecha (arriba a la derecha del mapa) muestra el carro con el GPS, como una flecha que apunta hacia donde va, con su velocidad; el mapa lo sigue hasta que se arrastra con el dedo.
- **Rutas**: con el botón «Ruta» se busca un destino por nombre (lugares, barrios, centros comerciales, cargadores, moteles y las cámaras de la app) o tocándolo en el mapa. Se dibuja la ruta en carro desde la ubicación, con distancia y tiempo sin tráfico. El panel no lista los giros (esos van en la guía de abajo, uno a la vez): muestra **Tráfico en la ruta**, las cámaras que quedan sobre el recorrido, una a la vez y en orden, con **Siguiente** y **Anterior** para ver cómo está la vía, y **En la ruta**, la lista ordenada de lo que el trazado se encuentra (cámaras, fotomultas en ese sentido, cargadores y lluvia) con lo que falta para cada punto. Al manejar recalcula si el carro se sale del trazado. Lugares de [Photon](https://photon.komoot.io) y rutas de [OSRM](https://project-osrm.org) sobre OpenStreetMap: no conocen el tráfico, el pico y placa ni los cierres, y para calcular la ruta se les envían las coordenadas de origen y destino.
- **Rumbo arriba**: mientras el mapa sigue al carro, gira con él para que la vía quede hacia arriba, como en un navegador. La brújula (junto a la flecha) lo cambia a norte arriba. Al arrastrar el mapa o al ir a tocar un destino vuelve al norte arriba. Los nombres de las calles son parte de la imagen del mapa, así que giran con él.
- **Destinos guardados**: Casa, Trabajo y los seis últimos destinos quedan a un toque en el panel de rutas (se guardan solo en este navegador).
- **Lluvia en la ruta**: el resumen dice si llueve en el recorrido según el radar (qué tan fuerte, dónde empieza y cuánto tramo) y lo repite la guía al manejar.
- **Cargadores para carros eléctricos**: capa del mapa con los cargadores públicos, cada uno con el color de su red (Terpel Voltex, Celsia, EPM, Enel X, Evsy, Tesla, centros comerciales y otras). Al tocar uno se ven la red, los conectores, la potencia y los puestos que estén registrados, y un botón **Ir aquí** que traza la ruta. También se pueden buscar por nombre o red, y el panel de rutas ofrece **Ir al cargador más cercano**. Los datos son de [OpenStreetMap](https://www.openstreetmap.org/copyright) (voluntarios; pueden faltar cargadores o detalles): el relevo los lee una vez al día. No muestra disponibilidad ni precios en vivo.
- **Motor**: sonido de motor de gasolina para un carro eléctrico, generado en vivo (sin grabaciones) y que sigue la velocidad del GPS. Cinco motores (V8 americano, V8 deportivo, V12, bóxer 6 y 4 cilindros turbo), caja automática imaginaria con cambios, limitador y petardeo. **Prueba con pedales** (acelerador y freno, o ↑ ↓ en el teclado) y **Demostración** para oírlo sin moverse; **Acelerar en neutro** con el carro detenido. Ajustes: volumen, intensidad, carácter, petardeo, tono y volumen del silbido, km/h o mph y encender al abrir. La ubicación solo se usa para medir la velocidad y no sale del navegador. El motor sigue sonando al pasar a las otras secciones.
- **Utilidades**: herramientas rápidas para tocar con el dedo. La moneda, los dados y la ruleta tienen su sonido (tintineo y rebotes, traqueteo, y chasquidos con una campanita al parar), generado en el navegador. **Lanzar moneda** (cara o cruz); **Ruleta** con listas propias que se guardan (dónde comer, quién conduce…) y que se gira con el dedo; **Dados** (de 1 a 6) y **número al azar** entre dos valores; **Temporizador** con atajos de 5, 10, 15, 30 y 45 minutos, que suena al terminar y muestra lo que falta en la barra de arriba desde cualquier pestaña; **Cronómetro** con vueltas; **Reloj gigante** con modo noche y pantalla completa; **DJ música**, 16 pads con sonidos generados en el navegador y una base de ritmo (dembow, house o rock) con tempo ajustable, que se detiene al salir del DJ; y **Radio** con la transmisión en vivo de La Mega. El temporizador, el cronómetro y la radio siguen andando al cambiar de pestaña.
- **Clima y alertas**: temperatura del centro en la barra superior y franja roja si el SIATA tiene una alerta vigente.
- **Se instala como app** (botón «Instalar» en Chrome/Edge/Android, «Añadir a pantalla de inicio» en Safari) y abre rápido gracias al service worker. Favoritas, sección, filtros y vista del mapa se recuerdan en el navegador.

## Uso

| Acción | Ratón / táctil | Teclado |
|---|---|---|
| Cambiar de sección | Pestañas (arriba o abajo) | 1 a 4 |
| Lanzar la moneda, girar la ruleta o tirar los dados (Utilidades) | Tocar | Espacio |
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

- El mismo relevo lee una vez al día las cámaras de fotodetección del servidor de mapas de la Alcaldía (`fotomultas.json`); si falla o llega algo raro, se conserva la lista anterior.
- También una vez al día consulta en OpenStreetMap (Overpass) los cargadores de carros eléctricos de la zona (`cargadores.json`), con la misma regla: si falla, queda la lista anterior.
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
| `src/moteles.js` | Moteles (OpenStreetMap) |
| `src/cargadores.js`, `src/redes-carga.js` | Cargadores de carros eléctricos (OpenStreetMap) y las redes que se distinguen |
| `src/utilidades.js` | Sección Utilidades: moneda, ruleta, dados, temporizador, cronómetro, reloj y radio |
| `src/efectos.js` | Sonidos de la moneda, los dados y la ruleta (Web Audio) |
| `src/pads.js` | DJ música: sonidos de los pads y base de ritmo (Web Audio) |
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
