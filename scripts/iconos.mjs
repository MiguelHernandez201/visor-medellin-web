// Exporta scripts/icono.svg a los PNG de la PWA (public/icons/):
//   icon-192.png, icon-512.png       íconos normales
//   icon-maskable-512.png            para Android: el dibujo en el 80 % central sobre fondo lleno
//   apple-touch-icon.png (180)       para iOS
//   favicon-48.png                   pestaña del navegador
// Uso: npm run iconos
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('./icono.svg', import.meta.url), 'utf8');
const salida = new URL('../public/icons/', import.meta.url);
mkdirSync(salida, { recursive: true });

// Versión "maskable": el contenido del ícono (130x130) reducido al 80 % y centrado sobre un
// fondo del mismo color, para que Android lo pueda recortar en círculo o en gota sin cortarlo.
const interior = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const escala = (512 * 0.8) / 130;
const desplazamiento = (512 - 130 * escala) / 2;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#05070d"/>
  <g transform="translate(${desplazamiento} ${desplazamiento}) scale(${escala})">${interior}</g>
</svg>`;

const exportar = (fuente, archivo, lado) => {
  const png = new Resvg(fuente, { fitTo: { mode: 'width', value: lado } }).render().asPng();
  writeFileSync(new URL(archivo, salida), png);
  console.log(`public/icons/${archivo} (${lado}x${lado})`);
};

exportar(svg, 'icon-192.png', 192);
exportar(svg, 'icon-512.png', 512);
exportar(maskable, 'icon-maskable-512.png', 512);
exportar(maskable, 'apple-touch-icon.png', 180);
exportar(svg, 'favicon-48.png', 48);
