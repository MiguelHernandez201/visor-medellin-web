// Servidor de desarrollo (npm run dev):
//   http://localhost:8084  la app, compilada y recargada al guardar (esbuild)
// Sirve public/ con el paquete en public/build/. En localhost no se registra el service
// worker (ver src/pwa.js), así que no hay cachés que estorben mientras se programa.
// Los datos del SIATA llegan del relevo (rama "datos", ver scripts/datos.mjs).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const contexto = await esbuild.context({
  entryPoints: [path.join(raiz, 'src', 'main.js')],
  bundle: true,
  target: 'chrome87',
  loader: { '.png': 'dataurl' }, // imágenes del CSS de Leaflet
  outdir: path.join(raiz, 'public', 'build'),
  sourcemap: true,
  logLevel: 'info',
});
await contexto.watch();
await contexto.serve({ servedir: path.join(raiz, 'public'), port: 8084 });
console.log('Visor Medellín (PWA) en http://localhost:8084');
