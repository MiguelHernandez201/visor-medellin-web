// Herramienta «Bromas» de las utilidades: tres bromas para hacer en el carro.
//   ¿Quién fue?          escáner de olores que señala al culpable (se puede elegir en secreto)
//   Detector de mentiras  con el dedo en la pantalla; el resultado se puede decidir en secreto
//   Simulador de choque   frenazo, golpe, vidrio roto y alerta… y «¡Es broma!». Solo detenidos.
import { crearSonidosBromas, IMPACTO_GRABADO } from './sonidos-bromas.js';
import { voz } from './voz.js';
import './bromas.css';

const PUESTOS = [
  { corto: 'Conductor', culpable: 'el conductor', x: 70, y: 138 },
  { corto: 'Copiloto', culpable: 'el copiloto', x: 130, y: 138 },
  { corto: 'Atrás izq.', culpable: 'el de atrás a la izquierda', x: 60, y: 222 },
  { corto: 'Medio', culpable: 'el del medio', x: 100, y: 222 },
  { corto: 'Atrás der.', culpable: 'el de atrás a la derecha', x: 140, y: 222 },
];
const DURA_MENTIRA = 5000; // ms con el dedo puesto
const DETENIDO = 10 / 3.6; // m/s: por encima, el carro va andando

/** Entero al azar entre 0 y n − 1. */
const azar = (n) => Math.floor(Math.random() * n);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** El carro visto desde arriba, con los cinco puestos. */
function svgCarro() {
  const puestos = PUESTOS.map(
    (p, i) => `<g class="quien-puesto" data-puesto="${i}" transform="translate(${p.x} ${p.y})" role="button" tabindex="0" aria-label="${p.corto}">
      <rect class="puesto-silla" x="-19" y="-24" width="38" height="46" rx="10"/>
      <rect class="puesto-cabecera" x="-11" y="-31" width="22" height="9" rx="4"/>
      <text class="puesto-nombre" y="4">${p.corto}</text>
      <text class="puesto-humo" y="-2">💨</text>
      <circle class="puesto-marca" cx="14" cy="17" r="2.6"/>
    </g>`,
  ).join('');
  return `<svg class="quien-svg" viewBox="0 0 200 320" aria-hidden="false">
    <rect class="carro-rueda" x="14" y="58" width="16" height="44" rx="6"/>
    <rect class="carro-rueda" x="170" y="58" width="16" height="44" rx="6"/>
    <rect class="carro-rueda" x="14" y="222" width="16" height="44" rx="6"/>
    <rect class="carro-rueda" x="170" y="222" width="16" height="44" rx="6"/>
    <path class="carro-cuerpo" d="M100 8C150 8 178 26 180 70V262C178 300 150 312 100 312S22 300 20 262V70C22 26 50 8 100 8z"/>
    <path class="carro-vidrio" d="M42 92C70 78 130 78 158 92L150 108C120 100 80 100 50 108z"/>
    <path class="carro-vidrio" d="M48 270C78 280 122 280 152 270L146 256C118 262 82 262 54 256z"/>
    <path class="carro-espejo" d="M20 104l-12 4v10l12-2zM180 104l12 4v10l-12-2z"/>
    ${puestos}
    <rect class="quien-rayo" x="26" y="0" width="148" height="6" rx="3"/>
  </svg>`;
}

/** Huella digital: óvalos concéntricos cortados a trozos, como las líneas de un dedo. */
const svgHuella = () =>
  `<svg viewBox="0 0 100 120" aria-hidden="true">${[6, 13, 20, 27, 34, 41]
    .map((r, i) => `<ellipse cx="50" cy="62" rx="${r}" ry="${(r * 1.3).toFixed(1)}" stroke-dasharray="${[`${r * 3} ${r}`, `${r * 2} 6 ${r} 8`, `${r * 4} 9`][i % 3]}" transform="rotate(${i * 23} 50 62)"/>`)
    .join('')}<rect class="huella-rayo" x="6" y="0" width="88" height="4" rx="2"/></svg>`;

/**
 * Grietas de vidrio roto desde el punto (x, y) en un lienzo de ancho × alto: rayos quebrados
 * hasta el borde y anillos que los unen.
 */
function svgGrietas(ancho, alto, x, y) {
  const rayos = 13 + azar(5);
  const lejos = Math.hypot(ancho, alto);
  const puntos = []; // por rayo, los puntos del quiebre
  let trazos = '';
  for (let i = 0; i < rayos; i++) {
    const angulo = (i / rayos) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const lista = [[x, y]];
    let r = 0;
    while (r < lejos) {
      r += 30 + Math.random() * 70;
      const a = angulo + (Math.random() - 0.5) * 0.25;
      lista.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    puntos.push(lista);
    trazos += `M${lista.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join('L')}`;
  }
  // anillos: unen el punto k de cada rayo con el del siguiente
  for (const k of [1, 2, 3, 5]) {
    for (let i = 0; i < rayos; i++) {
      const a = puntos[i][k];
      const b = puntos[(i + 1) % rayos][k];
      if (a && b && Math.random() > 0.2) trazos += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
    }
  }
  return `<svg class="choque-grietas" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${trazos}" class="grieta-sombra"/><path d="${trazos}" class="grieta"/>
    <circle cx="${x}" cy="${y}" r="16" class="grieta-golpe"/>
  </svg>`;
}

/**
 * Monta las bromas en `el`. `sonar(fn)` llama a fn(sonidos) cuando el audio esté listo;
 * `velocidad()` da los m/s del GPS, o null si no se sabe.
 * Devuelve { detener() } para cortar lo que esté andando al salir de la herramienta.
 */
export function crearBromas(el, { sonar, velocidad = () => null }) {
  let sonidos = null;
  const sonido = (fn) => sonar((ctx) => fn(sonidos || (sonidos = crearSonidosBromas(ctx))));
  let broma = 'quien';

  el.innerHTML = `
    <div class="util-fila bromas-pestanas">
      <button class="boton" type="button" data-broma="quien">💨 ¿Quién fue?</button>
      <button class="boton" type="button" data-broma="mentira">🤥 Detector de mentiras</button>
      <button class="boton" type="button" data-broma="choque">💥 Choque</button>
    </div>

    <div class="broma" data-panel="quien">
      <p class="broma-subtitulo">Escáner de olores</p>
      <div class="quien-carro">${svgCarro()}</div>
      <div class="quien-medidor" aria-hidden="true"><span></span></div>
      <p class="util-resultado quien-resultado" aria-live="polite">¿Quién se tiró el pedo?</p>
      <button class="boton boton-principal util-grande" type="button" data-quien="escanear">Escanear</button>
      <p class="secundario">Truco: antes de escanear, toca en secreto el puesto del «culpable» (queda con un punto pequeño). Si no tocas ninguno, sale al azar.</p>
    </div>

    <div class="broma" data-panel="mentira">
      <div class="mentira-monitor">
        <div class="mentira-datos">
          <button class="mentira-pulso" type="button" aria-label="Pulso"><span class="mentira-corazon">♥</span><b>--</b><small>lpm</small><i class="mentira-marca"></i></button>
          <span class="mentira-estado">Listo para la pregunta</span>
        </div>
        <svg class="mentira-grafica" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true"><polyline points=""/></svg>
        <div class="mentira-barra" aria-hidden="true"><span></span></div>
      </div>
      <p class="util-resultado mentira-resultado" aria-live="polite"></p>
      <button class="mentira-huella" type="button">${svgHuella()}<span>Pon el dedo aquí y no lo quites</span></button>
      <p class="secundario">Truco: toca el corazón para decidir en secreto. Punto verde = verdad, rojo = mentira, sin punto = al azar. También sirve mientras analiza.</p>
    </div>

    <div class="broma" data-panel="choque">
      <p class="choque-texto">Llena la pantalla con un choque: frenazo, golpe, vidrio roto y alerta de emergencia… hasta que sale <b>«¡Es broma!»</b>. Con el volumen alto.</p>
      <div class="util-fila choque-esperas">
        <span>Empieza:</span>
        <button class="boton" type="button" data-espera="0" aria-pressed="true">Ya</button>
        <button class="boton" type="button" data-espera="5" aria-pressed="false">En 5 s</button>
        <button class="boton" type="button" data-espera="10" aria-pressed="false">En 10 s</button>
      </div>
      <button class="boton boton-principal util-grande" type="button" data-choque="simular">💥 Simular choque</button>
      <div class="choque-confirmar" hidden>
        <p>No sé si el carro está detenido (el GPS está apagado). <b>Esta broma es solo con el carro quieto</b>: en movimiento puede asustar a quien maneja.</p>
        <div class="util-fila">
          <button class="boton boton-principal" type="button" data-choque="confirmar">Está detenido</button>
          <button class="boton" type="button" data-choque="cancelar">Cancelar</button>
        </div>
      </div>
      <p class="secundario choque-nota" aria-live="polite">Solo funciona con el carro detenido. Toca la pantalla al final para cerrar.</p>
    </div>`;

  const $ = (selector) => el.querySelector(selector);
  let vivo = 0; // sube al detener: lo que estaba andando con un número viejo se corta

  function pintarPestanas() {
    el.querySelectorAll('[data-broma]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.broma === broma)));
    el.querySelectorAll('[data-panel]').forEach((p) => {
      p.hidden = p.dataset.panel !== broma;
    });
  }

  // -------------------------------------------------------------------------
  // ¿Quién fue?
  // -------------------------------------------------------------------------
  let elegido = null; // puesto elegido en secreto
  let escaneando = false;
  const puestosEl = [...el.querySelectorAll('.quien-puesto')];
  const carroEl = $('.quien-carro');

  function marcarPuesto(i) {
    if (escaneando) return;
    elegido = elegido === i ? null : i;
    puestosEl.forEach((p, j) => p.classList.toggle('marcado', j === elegido));
  }

  async function escanear() {
    if (escaneando) return;
    escaneando = true;
    const turno = vivo;
    const culpable = elegido ?? azar(PUESTOS.length);
    elegido = null;
    puestosEl.forEach((p) => p.classList.remove('marcado', 'activo', 'culpable'));
    carroEl.classList.add('escaneando');
    $('.quien-resultado').textContent = 'Escaneando olores…';
    $('[data-quien="escanear"]').disabled = true;
    const medidor = $('.quien-medidor span');
    sonido((s) => s.barrido());
    voz.decir(['quien-escanear'], { antes: 0.3 });
    await espera(600);
    // saltos de puesto en puesto, cada vez más lentos, hasta el culpable
    const saltos = 14 + azar(5);
    let actual = azar(PUESTOS.length);
    for (let i = 0; i < saltos && turno === vivo; i++) {
      if (i === saltos - 1) actual = culpable;
      else {
        let otro = azar(PUESTOS.length - 1);
        if (otro >= actual) otro += 1;
        actual = otro;
      }
      puestosEl.forEach((p, j) => p.classList.toggle('activo', j === actual));
      medidor.style.width = `${Math.min(99, 20 + (i / saltos) * 80 + azar(8))}%`;
      sonido((s) => s.bip(700 + i * 45));
      await espera(70 + (i / saltos) ** 2.2 * 420);
    }
    carroEl.classList.remove('escaneando');
    escaneando = false;
    $('[data-quien="escanear"]').disabled = false;
    if (turno !== vivo) return;
    puestosEl.forEach((p, j) => {
      p.classList.remove('activo');
      p.classList.toggle('culpable', j === culpable);
    });
    medidor.style.width = '100%';
    $('.quien-resultado').textContent = `¡El que se cagó fue ${PUESTOS[culpable].culpable}! 💨`;
    sonido((s) => {
      s.pedo();
      // con voz: «¡Fue el copiloto!» al terminar el pedo, y la alarma después
      s.alarma(3, voz.decir([`quien-${culpable}`], { antes: 1.15 }) ? 3.5 : 1.3);
    });
    if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
  }

  // -------------------------------------------------------------------------
  // Detector de mentiras
  // -------------------------------------------------------------------------
  let modoMentira = null; // null = al azar · 'verdad' · 'mentira' (elegido en secreto)
  let analisis = null; // { inicio, puntero, latido, pulso, turno }
  const huellaEl = $('.mentira-huella');
  const lineaEl = $('.mentira-grafica polyline');
  let senal = Array(60).fill(40);

  function pintarMarca() {
    $('.mentira-marca').className = `mentira-marca${modoMentira ? ` ${modoMentira}` : ''}`;
  }

  function cambiarModo() {
    modoMentira = modoMentira === null ? 'verdad' : modoMentira === 'verdad' ? 'mentira' : null;
    pintarMarca();
  }

  function pintarSenal(fuerza) {
    senal.shift();
    senal.push(40 + (Math.random() - 0.5) * fuerza * 70);
    lineaEl.setAttribute('points', senal.map((v, i) => `${(i * 300) / (senal.length - 1)},${v.toFixed(1)}`).join(' '));
  }

  function empezarAnalisis(evento) {
    if (analisis) return;
    evento.preventDefault();
    try {
      huellaEl.setPointerCapture(evento.pointerId);
    } catch {
      // sin captura funciona igual
    }
    const resultadoEl = $('.mentira-resultado');
    resultadoEl.textContent = '';
    resultadoEl.className = 'util-resultado mentira-resultado';
    el.querySelector('[data-panel="mentira"]').classList.remove('verdad', 'mentira');
    huellaEl.classList.add('leyendo');
    analisis = { inicio: performance.now(), puntero: evento.pointerId, pulso: 72 + azar(10), proximoLatido: 0, turno: vivo };
    $('.mentira-estado').textContent = 'Analizando…';
    voz.decir(['mentira-analizando'], { antes: 0.4 });
    const cuadro = (ahora) => {
      if (!analisis || analisis.turno !== vivo) return;
      const avance = Math.min(1, (ahora - analisis.inicio) / DURA_MENTIRA);
      // el pulso sube con los nervios, con saltos
      analisis.pulso = Math.max(65, Math.min(135, analisis.pulso + (Math.random() - 0.35) * 1.6));
      $('.mentira-pulso b').textContent = Math.round(analisis.pulso);
      $('.mentira-barra span').style.width = `${avance * 100}%`;
      pintarSenal(0.25 + avance * 0.75);
      if (ahora >= analisis.proximoLatido) {
        analisis.proximoLatido = ahora + 60000 / analisis.pulso;
        sonido((s) => s.latido());
        $('.mentira-corazon').classList.remove('late');
        void $('.mentira-corazon').offsetWidth;
        $('.mentira-corazon').classList.add('late');
      }
      if (Math.random() < 0.18) sonido((s) => s.aguja());
      if (avance >= 1) return void terminarAnalisis(true);
      requestAnimationFrame(cuadro);
    };
    requestAnimationFrame(cuadro);
  }

  function terminarAnalisis(completo) {
    if (!analisis) return;
    analisis = null;
    huellaEl.classList.remove('leyendo');
    $('.mentira-barra span').style.width = '0%';
    const resultadoEl = $('.mentira-resultado');
    if (!completo) {
      $('.mentira-estado').textContent = 'Lectura interrumpida';
      resultadoEl.textContent = '¡No quites el dedo! Otra vez';
      return;
    }
    const miente = modoMentira ? modoMentira === 'mentira' : azar(2) === 1;
    modoMentira = null;
    pintarMarca();
    $('.mentira-estado').textContent = miente ? 'Alteración detectada' : 'Lectura estable';
    resultadoEl.textContent = miente ? '🚨 ¡MENTIRA! 🚨' : '✅ VERDAD';
    resultadoEl.classList.add(miente ? 'mentira' : 'verdad');
    el.querySelector('[data-panel="mentira"]').classList.add(miente ? 'mentira' : 'verdad');
    // el efecto y enseguida el locutor («¡Mentira! ¡Está mintiendo!» / «Dice la verdad»)
    const habla = voz.decir([miente ? 'mentira-mentira' : 'mentira-verdad'], { antes: miente ? 0.85 : 0.5 });
    sonido((s) => (miente ? s.mentira(habla ? 2.8 : 1) : s.verdad()));
    if (miente && navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
  }

  huellaEl.addEventListener('pointerdown', empezarAnalisis);
  for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    huellaEl.addEventListener(tipo, (evento) => {
      if (analisis && evento.pointerId === analisis.puntero) terminarAnalisis(false);
    });
  }
  huellaEl.addEventListener('contextmenu', (evento) => evento.preventDefault()); // el toque largo no abre menú

  // -------------------------------------------------------------------------
  // Simulador de choque
  // -------------------------------------------------------------------------
  let esperaChoque = 0;
  let choqueEnCurso = false;

  /** Prepara las grabaciones del choque. Promesa: true si están (a los 2,5 s se rinde). */
  const cargarGrabaciones = () =>
    new Promise((listo) => {
      sonido((s) => s.cargar().then(listo));
      setTimeout(() => listo(false), 2500);
    });

  function pedirChoque() {
    if (choqueEnCurso) return;
    const v = velocidad();
    $('.choque-confirmar').hidden = true;
    if (v != null && v > DETENIDO) {
      $('.choque-nota').textContent = `El carro va a ${Math.round(v * 3.6)} km/h. El choque solo funciona con el carro detenido.`;
      return;
    }
    if (v == null) {
      $('.choque-confirmar').hidden = false;
      return;
    }
    simularChoque();
  }

  async function simularChoque() {
    $('.choque-confirmar').hidden = true;
    choqueEnCurso = true;
    const turno = vivo;
    // el primer toque da el permiso de sonido: se prepara ya, aunque suene más tarde
    $('.choque-nota').textContent = 'Preparando…';
    const grabado = await cargarGrabaciones();
    for (let s = esperaChoque; s > 0 && turno === vivo; s--) {
      $('.choque-nota').textContent = `El choque llega en ${s}…`;
      await espera(1000);
    }
    if (turno !== vivo) {
      choqueEnCurso = false;
      return;
    }
    $('.choque-nota').textContent = 'Solo funciona con el carro detenido. Toca la pantalla al final para cerrar.';
    await correrChoque(grabado);
    choqueEnCurso = false;
  }

  /**
   * La broma en sí: una capa sobre toda la app. Termina cuando se toca «¡Es broma!».
   * Con `grabado` suenan las grabaciones reales; si no, los sonidos sintetizados.
   */
  function correrChoque(grabado) {
    return new Promise((listo) => {
      const capa = document.createElement('div');
      capa.className = 'choque-capa fase-frenazo';
      capa.setAttribute('role', 'alert');
      capa.innerHTML = '<div class="choque-aviso">⚠ ¡FRENE!</div>';
      document.body.append(capa);
      const tiempos = [];
      let cerrable = false;
      const cerrar = () => {
        tiempos.forEach(clearTimeout);
        capa.remove();
        document.removeEventListener('keydown', alTeclado);
        listo();
      };
      const revelar = () => {
        tiempos.forEach(clearTimeout);
        cerrable = true;
        capa.className = 'choque-capa fase-broma';
        capa.querySelector('.choque-alerta')?.remove();
        capa.insertAdjacentHTML('beforeend', '<div class="choque-broma"><span>😜</span><strong>¡Es broma!</strong><small>Toca para cerrar</small></div>');
        sonido((s) => s.verdad());
        voz.decir(['choque-broma'], { antes: 0.35 });
      };
      const alTeclado = (evento) => {
        if (evento.key === 'Escape') cerrar();
      };
      document.addEventListener('keydown', alTeclado);
      capa.addEventListener('click', () => {
        if (cerrable) cerrar();
        else if (capa.classList.contains('fase-alerta')) revelar();
      });

      const impacto = grabado ? IMPACTO_GRABADO * 1000 : 1300;
      sonido((s) => (grabado ? s.choqueGrabado() : s.frenazo(1.3)));
      tiempos.push(
        setTimeout(() => {
          // el golpe
          const ancho = innerWidth;
          const alto = innerHeight;
          capa.className = 'choque-capa fase-golpe';
          capa.innerHTML = `<div class="choque-destello"></div>${svgGrietas(ancho, alto, ancho * (0.3 + Math.random() * 0.4), alto * (0.25 + Math.random() * 0.4))}`;
          // el destello se quita aparte: sin animaciones (movimiento reducido) se quedaría blanco
          tiempos.push(setTimeout(() => capa.querySelector('.choque-destello')?.remove(), 600));
          if (!grabado) sonido((s) => s.choque());
          if (navigator.vibrate) navigator.vibrate([500, 100, 300]);
        }, impacto),
        setTimeout(() => {
          capa.classList.replace('fase-golpe', 'fase-alerta');
          capa.insertAdjacentHTML(
            'beforeend',
            `<div class="choque-alerta"><strong>🚨 Colisión detectada</strong><span>Airbags activados</span><span>Llamando a emergencias en <b class="choque-cuenta">10</b>…</span></div>`,
          );
          if (!grabado) sonido((s) => s.alarmaCarro(8));
          voz.decir(['choque-alerta'], { antes: 0.3 });
          let cuenta = 10;
          const bajar = () => {
            cuenta -= 1;
            const marca = capa.querySelector('.choque-cuenta');
            if (marca) marca.textContent = String(cuenta);
            if (cuenta > 6) tiempos.push(setTimeout(bajar, 1000));
            else revelar();
          };
          tiempos.push(setTimeout(bajar, 1000));
        }, impacto + 900),
      );
    });
  }

  // -------------------------------------------------------------------------
  // Toques
  // -------------------------------------------------------------------------
  el.addEventListener('click', (evento) => {
    voz.cargar('bromas'); // el primer toque en las bromas baja las frases del locutor
    const objetivo = evento.target;
    const pestana = objetivo.closest('[data-broma]');
    if (pestana) {
      broma = pestana.dataset.broma;
      if (broma === 'choque') sonido((s) => s.cargar()); // las grabaciones se bajan de una vez
      return void pintarPestanas();
    }
    const puesto = objetivo.closest('[data-puesto]');
    if (puesto) return void marcarPuesto(Number(puesto.dataset.puesto));
    if (objetivo.closest('[data-quien="escanear"]')) return void escanear();
    if (objetivo.closest('.mentira-pulso')) return void cambiarModo();
    const esperaEl = objetivo.closest('[data-espera]');
    if (esperaEl) {
      esperaChoque = Number(esperaEl.dataset.espera);
      el.querySelectorAll('[data-espera]').forEach((b) => b.setAttribute('aria-pressed', String(b === esperaEl)));
      return;
    }
    const choque = objetivo.closest('[data-choque]');
    if (choque) {
      if (choque.dataset.choque === 'simular') pedirChoque();
      else if (choque.dataset.choque === 'confirmar') simularChoque();
      else $('.choque-confirmar').hidden = true;
    }
  });
  el.addEventListener('keydown', (evento) => {
    const puesto = evento.target.closest('[data-puesto]');
    if (puesto && (evento.key === 'Enter' || evento.key === ' ')) {
      evento.preventDefault();
      marcarPuesto(Number(puesto.dataset.puesto));
    }
  });

  pintarPestanas();
  pintarSenal(0);

  return {
    /** Al salir de la herramienta: se cortan el escaneo, el análisis y la cuenta del choque. */
    detener() {
      vivo += 1;
      if (analisis) terminarAnalisis(false);
      $('.mentira-resultado').textContent = '';
    },
  };
}
