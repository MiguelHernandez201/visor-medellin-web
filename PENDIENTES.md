# Pendientes

Cosas que quedaron por hacer o por comprobar, para retomarlas desde el computador. Lo que
está arriba es lo que más cambia el uso diario.

## 1. Probar en el carro

Nada de lo siguiente se ha probado en el Tesla; solo en un navegador de escritorio con el GPS
simulado. Conviene anotar qué falla para ajustarlo.

- [ ] **Motor Tesla**: ¿el volumen alcanza sin subirle mucho al carro? ¿El sonido convence?
- [ ] **Sonido en segundo plano**: ¿el motor y la radio siguen sonando al salir del navegador?
- [ ] **Aviso de fotomultas**: ¿habla («Cámara de fotomulta más adelante») o solo pita? Si solo
      pita, el navegador del carro no trae voz en español y hay que grabar o generar el audio.
- [ ] **Mapa con el rumbo arriba**: ¿gira fluido? ¿Molesta que los nombres de las calles giren?
- [ ] **Rutas**: ¿responden OSRM y Photon desde el navegador del carro? ¿Recalcula bien?
- [ ] **Radio La Mega**: ¿reproduce? ¿Se corta?
- [ ] **DJ música**: ¿suena desde el primer toque? ¿Responde rápido o tiene retraso?
- [ ] **Temporizador**: ¿la alarma suena justo al llegar a cero?

## 2. Cargadores: falta una fuente con las redes reales

OpenStreetMap solo tiene 17 cargadores en el Valle de Aburrá (5 de Terpel Voltex y 12 sin
red). No hay ninguno etiquetado como Celsia, EPM, Enel X o Evsy.

Opción recomendada: **Open Charge Map** (gratis, con clave).

- [ ] Crear una cuenta en <https://openchargemap.org> y pedir una clave de API (*My Profile →
      My Apps → Register an application*).
- [ ] Guardarla en GitHub: repositorio → *Settings → Secrets and variables → Actions → New
      repository secret*, con el nombre `OPENCHARGEMAP_KEY`.
- [ ] Avisar para conectar el relevo (`scripts/datos.mjs`) a esa fuente y combinarla con
      OpenStreetMap. La clave queda solo en GitHub; no llega a la página.
- [ ] Revisar cuántos cargadores trae de cada red. Si aún faltan, queda armar la lista a mano
      con los mapas de cada operador.

## 3. Comprobar el relevo diario

El relevo (`.github/workflows/datos.yml`) lee una vez al día las fotomultas, los cargadores y
los moteles. No se pudo probar en vivo desde aquí.

- [ ] Tras fusionar, mirar en *Actions → Datos del SIATA* la salida de una corrida: en el
      `estado` deben salir `fotomultas.json`, `cargadores.json` y `moteles.json` con `ok: true`.
- [ ] Si `fotomultas.json` falla (el servidor de la Alcaldía a veces rechaza conexiones desde
      fuera de Colombia), la app sigue con la lista incluida; habría que buscar otra vía.
- [ ] Si `cargadores.json` o `moteles.json` fallan (Overpass saturado), se reintenta solo al
      día siguiente.

## 4. Mejoras propuestas que no se han hecho

- [ ] **Voz en los giros de la ruta** («En 200 metros gira a la derecha»). Hoy solo se leen
      en la franja de abajo.
- [ ] **Pico y placa**: guardar la placa y avisar si hoy hay restricción; pintar las vías y
      zonas (la Alcaldía las publica en el mismo servidor de las fotomultas).
- [ ] **Tráfico real en las rutas**: OSRM y Photon son servidores gratuitos de demostración y
      no conocen el tráfico. Para depender de ellos a diario conviene un servicio con clave.
- [ ] **Abrir siempre en el mapa**: hoy la app recuerda la última pestaña.

## 5. Limpieza

- [ ] El entorno de Claude «visor-medellin-web» tiene dominios permitidos que se añadieron
      para estas tareas (teslasound.io, medellin.gov.co, OSRM, Photon y el de la radio). Se
      pueden quitar en la configuración del entorno si ya no hacen falta.
