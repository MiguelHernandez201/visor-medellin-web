# Visor Medellín (PWA)

Versión web del [Visor Medellín para LG webOS TV](https://github.com/MiguelHernandez201/visor-medellin): las cámaras de tránsito del **SIMM** (Sistema Inteligente de Movilidad de Medellín) y las del **SIATA** (Sistema de Alerta Temprana del Valle de Aburrá), renovadas cada minuto, con la lluvia (radar y pluviómetros), el nivel de los ríos, el clima, las alertas del SIATA y un mapa de todas. Se instala como app en el computador, la tableta o el celular.

**App:** https://miguelhernandez201.github.io/visor-medellin-web/

> Las imágenes son de la Alcaldía de Medellín ([SIMM](https://www.medellin.gov.co/SIMM/mapas/index.html?map=camarasCctv)) y del [SIATA](https://siata.gov.co/siata_nuevo/). No son video: cada cámara publica una **foto fija** que se renueva cada minuto. Uso personal; revisa los términos de uso de esos sitios antes de redistribuir nada.

## Qué hace

Lo mismo que la app del TV:

- **Cuatro secciones**, en pestañas arriba: **SIMM** (80 cámaras de tránsito), **SIATA** (6 deprimidos viales, 11 panorámicas y 3 cámaras de cielo), **Ríos** (72 cámaras del río Medellín, quebradas y drenajes, de norte a sur) y **Mapa**.
- **Lluvia en cada cámara:** etiqueta de llovizna, ligera, moderada o fuerte. Sale del radar del SIATA (sin falsos ecos) confirmado con los pluviómetros a menos de 2,5 km: si todos están secos, no se marca lluvia aunque el radar la muestre.
- **Nivel de los ríos:** riesgo N1 a N4 y metros de agua de la estación del SIATA junto a cada cámara de río; en pantalla completa, la gráfica de las últimas 3 horas con las franjas de riesgo.
- **Mapa:** todas las cámaras sobre el Valle de Aburrá. A la derecha, la foto de la elegida con su lluvia, clima y calidad del aire. Capas de lluvia (botón azul): *lluvia ahora* (radar + gotas en los pluviómetros donde llueve), *lluvia medida* (mapa de calor de los pluviómetros) y *radar de las últimas 3 horas* (animación).
- **Clima y alertas:** temperatura del centro en la cabecera y franja roja si el SIATA tiene una alerta vigente.
- **Favoritas**, **solo favoritas** y **recorrido automático** (cambia de cámara cada 15 s). Se guardan en el navegador.

## Controles

La interfaz es la del TV (un escenario de 1920x1080 que se escala a la ventana), con estos añadidos para ratón y pantalla táctil:

| Acción | Ratón / táctil | Teclado |
|---|---|---|
| Cambiar de sección | Tocar la pestaña | 1 a 4, o ↑ hasta las pestañas y ← → |
| Ver una cámara en grande | Tocar la foto (en el mapa: tocar el punto dos veces) | Flechas y Enter |
| Anterior / siguiente en pantalla completa | Tocar el tercio izquierdo / derecho | ← → |
| Volver | Tocar el centro de la foto o «Atrás» | Esc |
| Página siguiente | Rueda del ratón o tocar «CH ±» | Re Pág / Av Pág |
| Zoom del mapa | Rueda o botones + / − | Re Pág / Av Pág |
| Favorita, solo favoritas, recorrido, capa de lluvia | Tocar el botón de color en la leyenda de abajo | R, G, Y, B |
| Instalar como app | Botón «Instalar app» (Chrome, Edge, Android) o «Añadir a pantalla de inicio» (Safari) | — |

En un celular en vertical todo se ve pequeño: mejor en horizontal o en una tableta o computador.

## Cómo funciona en la web

La app del TV corre desde `file://` y puede leer cualquier sitio. En el navegador rige CORS, así que cada fuente se resuelve distinto:

| Dato | Cómo llega |
|---|---|
| Fotos del SIMM y del SIATA | `<img>` directo (las imágenes no necesitan CORS). Sin acceso a las cabeceras, se piden cada minuto sin sincronizar con la cámara. |
| Radar (última imagen) | `siata.gov.co/data/siata_app/ultima_imagen_radarDBZH.png`, que **sí** envía CORS: se lee píxel a píxel igual que en el TV. |
| Animación del radar | Lista en `siata.gov.co/data/siata_app/animacion_radar.json` (con CORS); las imágenes no tienen CORS, así que se muestran tal cual, sin quitar falsos ecos. |
| Niveles, pluviómetros, clima, aire, alertas, series de 3 h | La API del [geoportal del SIATA](https://geoportal.siata.gov.co) **no** envía CORS: pasan por el **relevo de datos** (abajo). |
| Mapa | Teselas *World Dark Gray* de Esri. |

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
| `src/main.js` | Secciones, grilla, pantalla completa, recorrido, favoritas, teclado, ratón y táctil |
| `src/pwa.js` | Registro del service worker y botón «Instalar app» |
| `src/fuente.js` | Descarga de las fotos y búsqueda de cámaras del SIMM |
| `src/siata.js` | Cámaras del SIATA con sus coordenadas y estación de nivel |
| `src/nombres.js` | Nombre, dirección y coordenadas de las 80 cámaras del SIMM |
| `src/lluvia.js` | Radar: nivel de lluvia en cada punto, falsos ecos y animación |
| `src/geoportal.js` | Lectura periódica de los datos del relevo y utilidades |
| `src/niveles.js`, `src/pluvios.js`, `src/clima.js` | Niveles de los ríos, pluviómetros, clima, aire y alertas |
| `src/mapa.js`, `src/grafica.js` | Mapa con sus capas y gráfica del nivel de un río |
| `src/visor.css` | Estilos (escenario de 1920x1080) |
| `public/` | Página, manifiesto, service worker e íconos |
| `scripts/construir.mjs` | Construcción de `dist/` |
| `scripts/datos.mjs` | Relevo de datos del SIATA |
| `.github/workflows/` | Publicación en Pages y relevo cada 5 min |

### Si no aparecen las cámaras del SIMM

El sitio de la Alcaldía a veces rechaza conexiones (por ejemplo desde fuera de Colombia) o se cae; en ese caso las fotos del SIMM salen como «Sin imagen» y las del SIATA siguen funcionando.
