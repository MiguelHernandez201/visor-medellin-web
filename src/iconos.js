// Íconos SVG en línea (trazos de 24x24, color = currentColor).
const svg = (cuerpo) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;

export const ICONOS = {
  transito: svg('<path d="M5 17h14M6 17l1.5-6h9L18 17"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/><path d="M9 11V7h6v4"/>'),
  camara: svg('<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>'),
  rio: svg('<path d="M3 8c2 0 2-1.5 4.5-1.5S10 8 12 8s2-1.5 4.5-1.5S19 8 21 8"/><path d="M3 13c2 0 2-1.5 4.5-1.5S10 13 12 13s2-1.5 4.5-1.5S19 13 21 13"/><path d="M3 18c2 0 2-1.5 4.5-1.5S10 18 12 18s2-1.5 4.5-1.5S19 18 21 18"/>'),
  mapa: svg('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  buscar: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  estrella: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  gota: svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
  alerta: svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>'),
  reproducir: svg('<path d="M7 4.5v15l13-7.5z"/>'),
  pausa: svg('<path d="M8 4.5v15M16 4.5v15"/>'),
  cerrar: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  anterior: svg('<path d="M15 5l-7 7 7 7"/>'),
  siguiente: svg('<path d="M9 5l7 7-7 7"/>'),
  ampliar: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  instalar: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  motor: svg('<path d="M4.5 18a9 9 0 1 1 15 0"/><path d="M12 14l4-5"/><circle cx="12" cy="14" r="1.4"/>'),
  encender: svg('<path d="M12 3v8"/><path d="M7 6.3a8 8 0 1 0 10 0"/>'),
  recargar: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
};
