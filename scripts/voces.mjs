// Genera con ElevenLabs las frases de src/frases-voz.js y las deja en public/voces/<id>.mp3
// (npm run voces). Solo pide las que faltan, así no se gastan créditos dos veces; para volver a
// hacer una: npm run voces -- --rehacer <id> [<id> …]  (o --rehacer todas). Para probar con
// unas pocas sin generar el resto: npm run voces -- --solo <id> [<id> …].
//
// Lee la clave, la voz y el modelo de .env (ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID,
// ELEVENLABS_MODEL). Ese archivo está en .gitignore: la clave no sale de este computador ni
// llega a la app, que solo usa los MP3 ya hechos.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FRASES } from '../src/frases-voz.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpeta = path.join(raiz, 'public', 'voces');

// .env sencillo: CLAVE=valor por línea, # para comentarios
const entorno = { ...process.env };
const archivoEnv = path.join(raiz, '.env');
if (existsSync(archivoEnv)) {
  for (const linea of readFileSync(archivoEnv, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m && !linea.trim().startsWith('#')) entorno[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}
const clave = entorno.ELEVENLABS_API_KEY;
const voz = entorno.ELEVENLABS_VOICE_ID;
const modelo = entorno.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
if (!clave || !voz) {
  console.error('Faltan ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID en .env');
  process.exit(1);
}

const argumentos = process.argv.slice(2);
const lista = (opcion) => {
  const i = argumentos.indexOf(opcion);
  return new Set(i >= 0 ? argumentos.slice(i + 1).filter((a) => !a.startsWith('--')) : []);
};
const rehacer = lista('--rehacer');
const solo = lista('--solo');
const todas = rehacer.has('todas');

mkdirSync(carpeta, { recursive: true });
const pendientes = Object.entries(FRASES)
  .filter(([id]) => !solo.size || solo.has(id))
  .filter(([id]) => todas || rehacer.has(id) || !existsSync(path.join(carpeta, `${id}.mp3`)));
const desconocidas = [...rehacer, ...solo].filter((id) => id !== 'todas' && !FRASES[id]);
if (desconocidas.length) console.warn(`No hay frases con estos id: ${desconocidas.join(', ')}`);
if (!pendientes.length) {
  console.log('Todas las voces ya están en public/voces/. Nada que generar.');
  process.exit(0);
}
const caracteres = pendientes.reduce((suma, [, texto]) => suma + texto.length, 0);
console.log(`Generando ${pendientes.length} frases (${caracteres} caracteres) con ${modelo}…`);

async function generar(id, texto, intentos = 3) {
  for (let intento = 1; ; intento++) {
    const respuesta = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': clave, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: texto,
        model_id: modelo,
        language_code: 'es',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      }),
    });
    if (respuesta.ok) return Buffer.from(await respuesta.arrayBuffer());
    const detalle = (await respuesta.text()).slice(0, 300);
    // 429: demasiadas a la vez; 5xx: falla de ellos. Se espera y se reintenta.
    if (intento < intentos && (respuesta.status === 429 || respuesta.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * intento));
      continue;
    }
    throw new Error(`HTTP ${respuesta.status}: ${detalle}`);
  }
}

let hechas = 0;
let fallas = 0;
// de a 2 en paralelo: las cuentas gratuitas y las pequeñas limitan las peticiones simultáneas
for (let k = 0; k < pendientes.length; k += 2) {
  await Promise.all(
    pendientes.slice(k, k + 2).map(async ([id, texto]) => {
      try {
        const mp3 = await generar(id, texto);
        writeFileSync(path.join(carpeta, `${id}.mp3`), mp3);
        hechas += 1;
        console.log(`  ✓ ${id}  «${texto}»  (${Math.round(mp3.length / 1024)} KB)`);
      } catch (error) {
        fallas += 1;
        console.error(`  ✗ ${id}: ${error.message}`);
      }
    }),
  );
}
console.log(`Listo: ${hechas} generadas${fallas ? `, ${fallas} con error (vuelve a correr npm run voces para reintentarlas)` : ''}.`);
if (fallas) process.exitCode = 1;
