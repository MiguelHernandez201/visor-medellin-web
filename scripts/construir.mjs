// Construye la PWA lista para publicar en dist/ (npm run build):
//   dist/              copia de public/ (HTML, manifiesto, íconos)
//   dist/build/        main.js y main.css empaquetados y minificados por esbuild
//   dist/sw.js         service worker con la versión de esta construcción
//   dist/.nojekyll     para que GitHub Pages sirva los archivos tal cual
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publico = path.join(raiz, 'public');
const salida = path.join(raiz, 'dist');

rmSync(salida, { recursive: true, force: true });
cpSync(publico, salida, {
  recursive: true,
  filter: (origen) => !origen.startsWith(path.join(publico, 'build')) && path.basename(origen) !== 'sw.js',
});

await esbuild.build({
  entryPoints: [path.join(raiz, 'src', 'main.js')],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['chrome87', 'firefox90', 'safari15', 'edge90'],
  loader: { '.png': 'dataurl' }, // imágenes del CSS de Leaflet
  outdir: path.join(salida, 'build'),
  logLevel: 'info',
});

// Versión: el commit (en GitHub Actions) o la hora de la construcción.
const version = (process.env.GITHUB_SHA || '').slice(0, 12) || Date.now().toString(36);
const sw = readFileSync(path.join(publico, 'sw.js'), 'utf8').replace('__VERSION__', version);
writeFileSync(path.join(salida, 'sw.js'), sw);
writeFileSync(path.join(salida, '.nojekyll'), '');

if (!existsSync(path.join(salida, 'icons', 'icon-192.png'))) {
  console.warn('Faltan los íconos: ejecuta npm run iconos');
  process.exitCode = 1;
}
console.log(`dist/ listo (versión ${version})`);
