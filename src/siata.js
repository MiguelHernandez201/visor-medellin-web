// Cámaras del SIATA (Sistema de Alerta Temprana de Medellín y el Valle de Aburrá).
// Cada una es una foto fija que el SIATA renueva más o menos cada minuto:
//   https://siata.gov.co/ultimasFotosCamaras/ultimacam_dep_bulerias.jpg
// La lista y las coordenadas salen de las capas "Cámaras" del mapa de siata.gov.co
// (siata_nuevo/index.php/capa_service/consultar_capa_carga) y del geoportal
// (geoportal.siata.gov.co/fastgeoapi/cameras/). Solo están las que funcionaban en
// noviembre de 2026 (foto de hace menos de 15 minutos). Las de cielo son ojo de pez (casi cuadradas): en
// la grilla se ve el centro y en pantalla completa, entera. La de Bello es la única
// cámara pública de ese municipio.
//
// Van en dos secciones de la app: "siata" (deprimidos, panorámicas y cielo) y "rios".
// Los identificadores llevan el prefijo "siata:" para no chocar con los números del SIMM.

export const URL_SIATA = 'https://siata.gov.co/ultimasFotosCamaras/ultimacam_';

const DEPRIMIDO = 'Deprimido vial · SIATA';
const PANORAMICA = 'Panorámica · SIATA';
const CIELO = 'Cámara de cielo · SIATA';
const RIO = 'Nivel del agua · SIATA';

const TORRE = [6.2589, -75.5889];
const SANTA_ELENA = [6.1906, -75.5291];

// [archivo, nombre, detalle, sección, [latitud, longitud], estación de nivel]
// La estación de nivel del SIATA (ver niveles.js) es la que está en el mismo punto o sobre
// la misma corriente a pocos cientos de metros. Algunas cámaras de río usan la del río
// más cercana aguas arriba o abajo: La Asunción (140, Puente Fundadores, 2 km), EAFIT
// (687, metro Aguacatala, 400 m), La Estrella (834, La Inmaculada, 2 km) y Pérgolas
// (584, metro Ayurá, 500-700 m). Las que no tienen ninguna cerca no llevan estación.
export const CAMARAS_SIATA = [
  ['terminal_norte', 'Deprimido Terminal del Norte', DEPRIMIDO, 'siata', [6.27607, -75.57255]],
  ['dep_suramericana', 'Deprimido Suramericana', DEPRIMIDO, 'siata', [6.25336, -75.57854]],
  ['dep_bulerias', 'Deprimido Bulerías', DEPRIMIDO, 'siata', [6.23951, -75.5899]],
  ['dep_feria_ganado', 'Deprimido Feria de Ganado', DEPRIMIDO, 'siata', [6.30416, -75.56178]],
  ['dep_san_juan_con_80', 'Deprimido San Juan con la 80', DEPRIMIDO, 'siata', [6.25056, -75.60228]],
  ['puente_musicos_2', 'Deprimido Los Músicos', DEPRIMIDO, 'siata', [6.2469, -75.5819], 648],
  ['81_TORRESIATA_oriente', 'Torre SIATA · oriente', PANORAMICA, 'siata', TORRE],
  ['82_TORRESIATA_suroriente', 'Torre SIATA · suroriente', PANORAMICA, 'siata', TORRE],
  ['86_TORRESIATA_nororiente', 'Torre SIATA · nororiente', PANORAMICA, 'siata', TORRE],
  ['88_TORRESIATA_noroccidente', 'Torre SIATA · noroccidente', PANORAMICA, 'siata', TORRE],
  ['89_TORRESIATA_occidente', 'Torre SIATA · occidente', PANORAMICA, 'siata', TORRE],
  ['96_RADAR', 'Santa Elena · noroccidente', PANORAMICA, 'siata', SANTA_ELENA],
  ['97_RADAR', 'Santa Elena · suroccidente', PANORAMICA, 'siata', SANTA_ELENA],
  ['98_SAN_NICOLAS_suroriente', 'San Nicolás · suroriente', PANORAMICA, 'siata', SANTA_ELENA],
  ['99_SAN_NICOLAS_nororiente', 'San Nicolás · nororiente', PANORAMICA, 'siata', SANTA_ELENA],
  ['capa_limite_la_estrella', 'La Estrella · capa límite', PANORAMICA, 'siata', [6.1608, -75.64516]],
  ['capa_limite_santo_domingo', 'Santo Domingo · capa límite', PANORAMICA, 'siata', [6.2871, -75.53819]],
  ['FishEye_Bello', 'Bello · cielo', CIELO, 'siata', [6.33717, -75.55819]],
  ['FishEye_SIATA', 'Torre SIATA · cielo', CIELO, 'siata', TORRE],
  ['FishEye_Itagui', 'Itagüí · cielo', CIELO, 'siata', [6.168, -75.6446]],
  // Ríos y quebradas, de norte a sur
  ['nivel_quebrada_la_lopez', 'Quebrada La López · Barbosa', RIO, 'rios', [6.4341, -75.3286], 251],
  ['nivel_rio_medellin_isaza', 'Río Medellín · Isaza (Barbosa)', RIO, 'rios', [6.421, -75.3595], 668],
  ['nivel_primavera', 'Primavera (Barbosa)', RIO, 'rios', [6.41493, -75.40369]],
  ['nivel_el_hatillo', 'Río Medellín · El Hatillo (Barbosa)', RIO, 'rios', [6.41249, -75.394], 342],
  ['nivel_molinal_la_holanda', 'Quebrada Telésfora · La Holanda (Girardota)', RIO, 'rios', [6.3983, -75.4816], 671],
  ['nivel_el_limonar', 'Quebrada El Limonar · El Zarzal', RIO, 'rios', [6.3954, -75.4887], 821],
  ['nivel_la_chosca_el_zarzal', 'Quebrada La Chosca · El Zarzal', RIO, 'rios', [6.392, -75.49662]],
  ['nivel_puente_fundadores', 'Río Medellín · Puente Fundadores', RIO, 'rios', [6.35797, -75.49881], 140],
  ['drenaje_urbano_asuncion', 'Drenaje urbano · Guadalajara (Copacabana)', RIO, 'rios', [6.34627, -75.51333]],
  ['nivel_la_asuncion', 'Río Medellín · La Asunción (Copacabana)', RIO, 'rios', [6.34594, -75.51375], 140],
  ['nivel_convento_azulita', 'Quebrada La Azulita · Copacabana', RIO, 'rios', [6.3456, -75.5137]],
  ['nivel_avelina', 'Quebrada La Avelina · Hato Viejo (Bello)', RIO, 'rios', [6.33761, -75.57247], 317],
  ['nivel_la_garcia_rio', 'Quebrada La García · Bello', RIO, 'rios', [6.33306, -75.54518], 674],
  ['nivel_potrerito_1', 'Quebrada La Ortega · Potrerito (Bello)', RIO, 'rios', [6.33057, -75.58253], 552],
  ['nivel_q_la_madera_cabanas', 'Quebrada La Madera · Cabañas (Bello)', RIO, 'rios', [6.3121, -75.5636]],
  ['nivel_quebrada_la_madera', 'Quebrada La Madera · José Antonio Galán (Bello)', RIO, 'rios', [6.31085, -75.57521], 593],
  ['dep_la_toscana', 'La Toscana · Feria de Ganado', RIO, 'rios', [6.30375, -75.5613], 663],
  ['nivel_manantiales_3', 'Quebrada Cañada Negra · Manantiales', RIO, 'rios', [6.2992, -75.5352], 853],
  ['nivel_la_tinaja', 'Quebrada La Tinaja', RIO, 'rios', [6.2957, -75.5621]],
  ['inundacion_la_paralela', 'Inundación · La Paralela', RIO, 'rios', [6.2957, -75.5621]],
  ['nivel_quebrada_despoblada', 'Quebrada La Despoblada', RIO, 'rios', [6.29371, -75.5968]],
  ['nivel_malpaso_chispero', 'Quebrada Malpaso · El Chispero', RIO, 'rios', [6.2936, -75.5968]],
  ['nivel_cantera', 'Quebrada La Cantera', RIO, 'rios', [6.29352, -75.58405]],
  ['nivel_miramar', 'Quebrada Cantera Sur · Miramar', RIO, 'rios', [6.29319, -75.58635], 875],
  ['nivel_la_rosa', 'Quebrada La Rosa · Moscú', RIO, 'rios', [6.2893, -75.5552], 158],
  ['nivel_quebrada_la_minita', 'Quebrada La Minita', RIO, 'rios', [6.2886, -75.5697]],
  ['nivel_malpaso', 'Quebrada Malpaso · El Diamante', RIO, 'rios', [6.2823, -75.5871], 273],
  ['nivel_quebrada_la_honda_comuna_3', 'Quebrada La Bermejala · Las Esmeraldas', RIO, 'rios', [6.2801, -75.555], 883],
  ['nivel_caracoli_la_honda', 'Quebrada La Honda · Caracolí', RIO, 'rios', [6.2771, -75.6314], 876],
  ['nivel_iguana', 'Quebrada La Iguaná', RIO, 'rios', [6.27631, -75.60524], 238],
  ['nivel_san_francisca', 'Quebrada San Francisca · La Palma', RIO, 'rios', [6.2728, -75.653], 630],
  ['drenaje_urbano_punto_cero', 'Drenaje urbano · Punto Cero', RIO, 'rios', [6.26583, -75.57543]],
  ['099_NIVEL', 'Río Medellín · Aula Ambiental', RIO, 'rios', [6.26411, -75.57253], 99],
  ['nivel_nueva_villa', 'Quebrada La Iguaná · Nueva Villa', RIO, 'rios', [6.25986, -75.58145]],
  ['nivel_la_loca_golondrinas', 'Quebrada La Loca · Golondrinas', RIO, 'rios', [6.2571, -75.538], 909],
  ['nivel_q_chorro_hondo_altos_de_la_torre', 'Quebrada Chorro Hondo · Altos de la Torre', RIO, 'rios', [6.25133, -75.54049], 807],
  ['color_33', 'Río Medellín · Puente de la 33', RIO, 'rios', [6.2396, -75.5775], 93],
  ['nivel_la_estrechura_santa_elena', 'Quebrada Santa Elena · La Estrechura', RIO, 'rios', [6.2394, -75.5446], 859],
  ['nivel_q_la_gallinaza_villatina_la_torre', 'Quebrada La Gallinaza · Villatina', RIO, 'rios', [6.239, -75.5369], 815],
  ['nivel_el_hoyo', 'El Hoyo (Belén)', RIO, 'rios', [6.23679, -75.6205]],
  ['socavacion_santa_elena_AE', 'Quebrada Santa Elena · Alejandro Echavarría', RIO, 'rios', [6.23517, -75.54135]],
  ['nivel_las_violetas', 'Quebrada La Picacha · Las Violetas', RIO, 'rios', [6.2346, -75.6125], 382],
  ['nivel_guanteros', 'Quebrada La Picacha · Guanteros', RIO, 'rios', [6.23395, -75.62923], 760],
  ['nivel_estancias', 'Quebrada Santa Elena · Las Estancias', RIO, 'rios', [6.23178, -75.53588], 804],
  ['nivel_picacha_aguas_frias', 'Quebrada La Picacha · Aguas Frías', RIO, 'rios', [6.23148, -75.63952], 173],
  ['nivel_quebrada_santa_elena', 'Quebrada Santa Elena · Santa Lucía', RIO, 'rios', [6.23065, -75.53246]],
  ['nivel_presidenta_exito', 'Quebrada La Presidenta · Éxito Poblado', RIO, 'rios', [6.21296, -75.57553], 819],
  ['nivel_la_presidenta_parque_lineal', 'Quebrada La Presidenta · Parque Lineal', RIO, 'rios', [6.20779, -75.56938], 101],
  ['nivel_vizcaya', 'Quebrada La Presidenta · Vizcaya', RIO, 'rios', [6.20761, -75.56346], 333],
  ['nivel_eafit', 'Río Medellín · EAFIT', RIO, 'rios', [6.19778, -75.57977], 687],
  ['nivel_donamaria_encanto', 'Quebrada Doña María · El Encanto', RIO, 'rios', [6.1954, -75.6613], 905],
  ['nivel_rio_aguacatala', 'Río Medellín · Aguacatala', RIO, 'rios', [6.1948, -75.5816], 687],
  ['nivel_quebrada_dona_maria', 'Quebrada Doña María · Santa Rita', RIO, 'rios', [6.19042, -75.6516], 108],
  ['nivel_la_harenala', 'Quebrada La Harenala · Santa María', RIO, 'rios', [6.184, -75.60394], 344],
  ['nivel_rio_medellin_pergolas_1', 'Río Medellín · Pérgolas 1', RIO, 'rios', [6.1835, -75.5889], 584],
  ['nivel_rio_medellin_pergolas_2', 'Río Medellín · Pérgolas 2', RIO, 'rios', [6.1823, -75.5898], 584],
  ['nivel_aguacatala', 'Quebrada La Aguacatala', RIO, 'rios', [6.18217, -75.55145]],
  ['nivel_la_chorrera_palo_blanco', 'Quebrada La Chorrera · Palo Blanco', RIO, 'rios', [6.18196, -75.66193], 811],
  ['nivel_la_maria_barrio_escobar', 'Quebrada La María · Barrio Escobar', RIO, 'rios', [6.1538, -75.6382]],
  ['nivel_quebrada_la_canuela', 'Quebrada La Canuela · La Estrella', RIO, 'rios', [6.15303, -75.65265], 644],
  ['nivel_la_honda', 'Quebrada La Honda · Sabaneta', RIO, 'rios', [6.15231, -75.60659], 431],
  ['nivel_plebicito', 'Quebrada La Sabanetica · El Plebiscito', RIO, 'rios', [6.1522, -75.62157], 406],
  ['nivel_dona_ana_capitana', 'Quebrada Doña Ana · Los Capitanes', RIO, 'rios', [6.13895, -75.6111], 810],
  ['nivel_playas_placer_parte_baja', 'Playas de Placer · parte baja', RIO, 'rios', [6.13791, -75.61194]],
  ['nivel_la_inmaculada', 'Río Medellín · La Inmaculada', RIO, 'rios', [6.1367, -75.6336], 834],
  ['color_pis', 'Río Medellín · La Estrella', RIO, 'rios', [6.11934, -75.63229], 834],
  ['nivel_la_raya', 'Quebrada La Raya · La Estrella', RIO, 'rios', [6.11199, -75.64041], 888],
  ['nivel_tres_aguas', 'Río Medellín · Tres Aguas (Caldas)', RIO, 'rios', [6.09551, -75.6355], 106],
  ['nivel_la_planta_caldas', 'La Planta (Caldas)', RIO, 'rios', [6.0916, -75.6424]],
  ['nivel_la_playita_caldas', 'Río Medellín · La Playita (Caldas)', RIO, 'rios', [6.08834, -75.6331], 124],
  ['nivel_cristo_rey_caldas', 'Quebrada La Reventona · Cristo Rey (Caldas)', RIO, 'rios', [6.08553, -75.63684], 698],
  ['nivel_la_clara', 'Río Medellín · La Clara (Caldas)', RIO, 'rios', [6.0487, -75.6198], 169],
].map(([archivo, nombre, detalle, seccion, coordenadas, estacion = null]) => ({
  id: `siata:${archivo}`,
  archivo,
  nombre,
  detalle,
  seccion,
  coordenadas,
  estacion,
}));

const porId = new Map(CAMARAS_SIATA.map((camara) => [camara.id, camara]));

export const esSiata = (id) => typeof id === 'string' && id.startsWith('siata:');
export const camaraSiata = (id) => porId.get(id);
/** Identificadores de las cámaras del SIATA de una sección ('siata' o 'rios'). */
export const idsSiata = (seccion) => CAMARAS_SIATA.filter((c) => c.seccion === seccion).map((c) => c.id);
