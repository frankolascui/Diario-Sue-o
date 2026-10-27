// Batería de pruebas del Diario de Sueño (Playwright + Chromium).
// Uso: sirve la carpeta (p. ej. `python3 -m http.server 8765`) y ejecuta `node tests/pruebas.mjs http://localhost:8765/`.
import { chromium } from 'playwright';
const URL_ = process.argv[2] || 'http://localhost:8765/';
const NOW = '2026-10-27T18:00:00+01:00'; // martes, hora de Madrid
const results = [];
let cur = '';
const ok = (cond, name, extra = '') => results.push({ grp: cur, name, pass: !!cond, extra: cond ? '' : String(extra) });
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);

const browser = await chromium.launch();
async function fresh({ time = NOW, width = 390, seed = null, settings = { novedadesVistas: '1.5' }, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Europe/Madrid', locale: 'es-ES', acceptDownloads: true, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/fonts\.googleapis|ERR_|Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
  await p.clock.install({ time: new Date(time) });
  await p.addInitScript(([s, st]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (s) localStorage.setItem('diario-sueno:noches', JSON.stringify(s));
    if (st) localStorage.setItem('diario-sueno:ajustes', JSON.stringify(st));
  }, [seed, settings]);
  await p.goto(URL_);
  return p;
}
const night = (fecha, o = {}) => ({
  fecha,
  percibido: { cama: '21:00', dormido: '21:10', despertar: '05:55', levantado: '06:00', ...(o.p || {}) },
  reloj: { dormido: '21:15', despertar: '05:55', total_dormido_min: 500, fases_min: { despierto: 20, rem: 110, ligero: 315, profundo: 75 }, ...(o.r || {}) },
  preguntas: { calidad: 4, descanso: 4, estres: 2, entrenos_ayer: 1, ...(o.q || {}) },
  cuerpo: { peso_kg: 72, mismas_condiciones: true, ...(o.c || {}) },
});
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('diario-sueno:noches') || '[]'));
// Los campos opcionales están en «Más detalles», que se abre antes de escribir en ellos.
const setT = async (p, id, v) => { await p.evaluate((i) => { const el = document.getElementById(i); const d = el.closest('details'); if (d) d.open = true; }, id); await p.fill('#' + id, v); };
async function fillNight(p, d) {
  for (const [k, v] of Object.entries(d)) await setT(p, k, v);
}
const live = async (p) => (await p.innerText('#live')).split('\n').filter((x, i) => i % 2 === 0);
const avisos = async (p) => ((await p.isVisible('#avisos')) ? (await p.innerText('#avisos')).split('\n') : []);

// ---------- A. Cálculos ----------
cur = 'Cálculos';
{
  const p = await fresh();
  await p.click('#nowGo');
  await fillNight(p, { cama: '21:00', dormidoPerc: '21:20', despertarPerc: '05:50', levantado: '06:00', dormidoReal: '21:15', despertarReal: '05:55', 'tot-h': '8', 'tot-m': '20', 'ph-despierto-h': '0', 'ph-despierto-m': '20', 'ph-rem-h': '1', 'ph-rem-m': '50', 'ph-ligero-h': '5', 'ph-ligero-m': '15', 'ph-profundo-h': '1', 'ph-profundo-m': '15', despiertoNoche: '10' });
  const l = await live(p);
  eq(l[0], '8h 20m', 'Sueño real = total de Salud');
  eq(l[1], '93%', 'Eficiencia = 500 / 540 = 93 %');
  eq(l[2], '15 min', 'Latencia = cama 21:00 → dormido reloj 21:15');
  eq(l[3], '8h 20m', 'Sueño percibido = 21:20→05:50 (510) − 10 min despierto');
  eq(l[4], '+5 min', 'Error al dormirte = percibido − real');
  eq(await avisos(p), [], 'Noche coherente: sin avisos');
  await setT(p, 'tot-h', ''); await setT(p, 'tot-m', '');
  eq((await live(p))[0], '8h 20m', 'Sin total: REM + ligero + profundo');
  for (const k of ['rem', 'ligero', 'profundo']) { await setT(p, `ph-${k}-h`, ''); await setT(p, `ph-${k}-m`, ''); }
  eq((await live(p))[0], '8h 20m', 'Sin fases: ventana del reloj (8 h 40) − despierto (20)');
  ok(!p.errs.length, 'Sin errores de JavaScript', p.errs);
}
{
  const p = await fresh();
  await p.click('#nowGo');
  await fillNight(p, { cama: '23:40', levantado: '07:40', dormidoReal: '00:05', despertarReal: '07:30', 'tot-h': '7', 'tot-m': '0' });
  const l = await live(p);
  eq(l[2], '25 min', 'Latencia cruzando medianoche (23:40 → 00:05)');
  eq(l[1], '88%', 'Eficiencia cruzando medianoche (420 / 480)');
  eq(await avisos(p), [], 'Acostarse antes y dormirse después de medianoche no da aviso');
}

// ---------- B. Avisos ----------
cur = 'Avisos de coherencia';
{
  const p = await fresh();
  await p.click('#nowGo');
  // Los datos reales de la noche del 21 al 22 de octubre.
  await fillNight(p, { fecha: '2026-10-22', cama: '22:10', dormidoPerc: '22:35', despertarPerc: '07:50', levantado: '07:57', dormidoReal: '22:50', despertarReal: '07:59', 'ph-despierto-m': '21', 'ph-rem-h': '1', 'ph-rem-m': '35', 'ph-ligero-h': '4', 'ph-ligero-m': '50', 'ph-profundo-m': '49' });
  const a = await avisos(p);
  ok(a.some((x) => x.includes('94 min de diferencia')), 'Detecta los 94 min que faltaban en las fases', a);
  ok(!a.some((x) => x.includes('parece anterior')), 'Levantarse 2 min antes de lo que marca el reloj no da aviso (margen de 20 min)', a);
  await fillNight(p, { 'tot-h': '7', 'tot-m': '40' });
  ok((await avisos(p)).some((x) => x.includes('no coincide con REM')), 'Avisa si el total de Salud no cuadra con las fases');
  await fillNight(p, { dormidoReal: '21:40' });
  ok((await avisos(p)).some((x) => x.includes('parece anterior')), 'Avisa si «me dormí» va 30 min antes de «me metí en la cama»');
  await fillNight(p, { dormidoReal: '22:50', levantado: '06:00', 'tot-h': '9', 'tot-m': '30' });
  ok((await avisos(p)).some((x) => x.includes('más sueño que tiempo en la cama')), 'Avisa si la eficiencia pasa del 100 %');
  await p.click('button[type=submit]');
  ok((await p.innerText('#toast')).includes('Guardar» otra vez'), 'Con avisos, el primer «Guardar» no guarda');
  eq((await stored(p)).length, 0, 'Nada guardado tras el primer intento');
  await p.click('button[type=submit]');
  eq((await stored(p)).length, 1, 'El segundo «Guardar» guarda igualmente');
  ok((await stored(p))[0].calculado.avisos.length >= 2, 'Los avisos se guardan con la noche');
  await setT(p, 'fecha', '2026-12-01');
  await p.click('button[type=submit]');
  ok((await p.innerText('#toast')).includes('futuro'), 'Bloquea fechas futuras');
  await setT(p, 'fecha', '2026-10-27');
  await setT(p, 'ph-rem-m', '75');
  await p.click('button[type=submit]');
  ok(await p.evaluate(() => !document.getElementById('ph-rem-m').checkValidity()), 'No acepta 75 minutos en una fase (máximo 59)');
  eq((await stored(p)).length, 1, 'Un campo inválido impide guardar');
}

// ---------- C. Peso ----------
cur = 'Peso';
{
  const p = await fresh({ seed: [night('2026-10-26', { c: { peso_kg: 72.4 } })] });
  await p.click('#nowGo');
  await setT(p, 'peso', '72,8');
  eq(await avisos(p), [], 'Acepta coma decimal y un cambio de 0,4 kg sin aviso');
  await setT(p, 'peso', '75');
  ok((await avisos(p)).some((x) => x.includes('más de 2 kg')), 'Avisa si cambia más de 2 kg respecto al día anterior');
  await setT(p, 'peso', '300');
  ok((await avisos(p)).some((x) => x.includes('entre 25 y 250')), 'Avisa si el peso está fuera de rango');
  await setT(p, 'peso', '72.6'); await p.uncheck('#pesoCond');
  ok((await avisos(p)).some((x) => x.includes('condiciones distintas')), 'Avisa de que un pesaje en otras condiciones no cuenta');
}
{
  const seed = [
    night('2026-10-27', { c: { peso_kg: 73.0 } }), night('2026-10-25', { c: { peso_kg: 72.6 } }),
    night('2026-10-24', { c: { peso_kg: 76.0, mismas_condiciones: false } }),
    night('2026-10-19', { c: { peso_kg: 72.0 } }), night('2026-10-15', { c: { peso_kg: 72.2 } }),
  ];
  const p = await fresh({ seed });
  const t = await p.innerText('#stats');
  ok(t.includes('72.8 kg'), 'Media de 7 días (73,0 y 72,6) sin el pesaje en otras condiciones', t);
  ok(t.includes('+0.7 kg/sem'), 'Cambio frente a los 7 días anteriores (72,1)', t);
}

// ---------- D. Formulario ----------
cur = 'Formulario';
{
  const p = await fresh({ seed: [night('2026-10-25'), night('2026-10-26', { q: { notas: 'original' } })] });
  await p.click('#nowGo');
  await setT(p, 'cama', '21:05'); await setT(p, 'notas', 'borrador sin guardar');
  await p.reload();
  eq(await p.inputValue('#notas'), 'borrador sin guardar', 'El borrador sobrevive a recargar (volver de la app Salud)');
  ok(await p.isVisible('#draftNote'), 'Muestra «Borrador recuperado»');
  await p.click('#clearBtn');
  eq(await p.evaluate(() => localStorage.getItem('diario-sueno:borrador')), null, '«Vaciar» borra el borrador');
  await setT(p, 'fecha', '2026-10-26'); await p.dispatchEvent('#fecha', 'change');
  eq(await p.inputValue('#notas'), 'original', 'Elegir una fecha guardada carga esa noche');
  await setT(p, 'fecha', '2026-10-20'); await p.dispatchEvent('#fecha', 'change');
  ok((await p.innerText('#draftNote')).includes('pasará al'), 'Avisa antes de mover una noche de fecha');
  await p.click('button[type=submit]');
  eq((await stored(p)).map((n) => n.fecha), ['2026-10-25', '2026-10-20'], 'Mover la noche no deja un duplicado');
  await p.click('[data-del=ask]'); await p.click('[data-del=no]');
  eq((await stored(p)).length, 2, '«Borrar noche» pide confirmación y se puede cancelar');
  await p.click('[data-del=ask]'); await p.click('[data-del=yes]');
  eq((await stored(p)).map((n) => n.fecha), ['2026-10-25'], 'Borrar una noche solo borra esa');
  await p.click('.segmented[data-name=descanso] .seg[data-v="3"]');
  await p.click('.segmented[data-name=descanso] .seg[data-v="3"]');
  eq(await p.evaluate(() => document.querySelectorAll('.segmented[data-name=descanso] .seg.on').length), 0, 'Pulsar otra vez una nota la deselecciona');
}

// ---------- E. Panel del plan y entrenos ----------
cur = 'Objetivos del plan';
{
  const seed = [
    night('2026-10-27', { p: { cama: '21:15' } }),
    night('2026-10-26', { p: { cama: '20:45' } }),
    night('2026-10-25', { p: { cama: '21:16' } }),
    night('2026-10-24'),
    night('2026-10-22'),
  ];
  const p = await fresh({ seed });
  const rows = await p.$$eval('#plan tbody tr', (trs) => trs.map((tr) => [...tr.children].slice(1).map((td) => td.className)));
  eq(rows[0][0], 'ok', 'Cama 15 min tarde: dentro del margen');
  eq(rows[1][0], 'ok', 'Cama 15 min antes: dentro del margen');
  eq(rows[2][0], 'no', 'Cama 16 min tarde: fuera');
  ok((await p.innerText('#planSub')).includes('2 de 7 noches seguidas'), 'La racha se corta en la primera noche que falla', await p.innerText('#planSub'));
  await p.click('[data-screen=datos]');
  await setT(p, 'objLevantar', '06:30'); await p.dispatchEvent('#objLevantar', 'change');
  eq(await p.innerText('#objResumen'), 'Cama a las 21:30, levantarte a las 06:30.', 'Cambiar la hora de levantarte recalcula la de cama');
  await setT(p, 'objHoras', '8.5'); await p.dispatchEvent('#objHoras', 'change');
  eq(await p.innerText('#objResumen'), 'Cama a las 22:00, levantarte a las 06:30.', 'Horas en cama con medias horas');
  await setT(p, 'objHoras', '15'); await p.dispatchEvent('#objHoras', 'change');
  eq(await p.evaluate(() => JSON.parse(localStorage.getItem('diario-sueno:ajustes')).horas), 8.5, 'Ignora horas en cama fuera de 6–11');
}
{
  // Hoy es martes 27: la semana empieza el lunes 26. El lunes 26 por la mañana se apuntan los entrenos del domingo 25.
  const seed = [
    night('2026-10-27', { q: { entrenos_ayer: 2 } }), // lunes 26
    night('2026-10-26', { q: { entrenos_ayer: 1 } }), // domingo 25 (semana pasada)
    night('2026-10-25', { q: { entrenos_ayer: 1 } }),
    night('2026-10-24', { q: { entrenos_ayer: 2 } }),
    night('2026-10-23', { q: { entrenos_ayer: 1 } }),
    night('2026-10-22', { q: { entrenos_ayer: 1 } }),
    night('2026-10-21', { q: { entrenos_ayer: 0 } }),
    night('2026-10-20', { q: { entrenos_ayer: 1 } }), // lunes 19
  ];
  const p = await fresh({ seed });
  const t = await p.innerText('#training');
  ok(t.includes('esta semana 2 de 8'), 'Entrenos de esta semana (solo el lunes 26)', t);
  ok(t.includes('la pasada 7') && t.includes('meta cumplida'), 'Semana pasada completa: 7 de 8, meta cumplida', t);
  const p2 = await fresh({ seed: seed.filter((n) => n.fecha !== '2026-10-23') });
  const t2 = await p2.innerText('#training');
  ok(t2.includes('1 día sin apuntar') && !t2.includes('por debajo'), 'Un día sin apuntar no cuenta como fallo', t2);
}

// ---------- F. Reloj ----------
cur = 'Reloj';
for (const [hora, cuenta, etiqueta, tip] of [
  ['05:59:00', '1 min', 'para levantarte', 'Hora de dormir'],
  ['06:10:00', '14 h 50', 'para acostarte', 'Luz intensa'],
  ['10:00:00', '11 h 00', 'para acostarte', 'antes de las 12:00'],
  ['15:00:00', '6 h 00', 'para acostarte', 'Sin café desde las 12:00'],
  ['19:30:00', '1 h 30', 'para acostarte', 'Luces bajas'],
  ['20:15:00', '45 min', 'para acostarte', 'sin pantallas'],
  ['20:45:00', '15 min', 'para acostarte', 'rutina'],
  ['21:00:00', '9 h 00', 'para levantarte', 'Hora de dormir'],
  ['23:30:00', '6 h 30', 'para levantarte', 'Hora de dormir'],
]) {
  const p = await fresh({ time: `2026-10-27T${hora}+01:00` });
  const c = await p.innerText('#countdown'), l = await p.innerText('#countLabel'), t = await p.innerText('#clockTip');
  ok(c === cuenta && l === etiqueta && t.includes(tip), `${hora.slice(0, 5)} → ${cuenta} ${etiqueta}`, `${c} ${l} · ${t}`);
  await p.context().close();
}
{
  const p = await fresh({ time: '2026-10-27T20:59:58+01:00' });
  await p.clock.runFor(3000);
  eq(await p.innerText('#countLabel'), 'para levantarte', 'El reloj avanza solo y cambia a modo noche a las 21:00');
}

// ---------- G. Exportar e importar ----------
cur = 'Datos';
{
  const tricky = night('2026-10-26', { q: { notas: 'Examen, "mates" y\nruido; <img src=x onerror=alert(1)>' } });
  const p = await fresh({ seed: [tricky, night('2026-10-25')] });
  let dialog = false; p.on('dialog', (d) => { dialog = true; d.dismiss(); });
  await p.click('[data-screen=historial]');
  ok(!dialog && (await p.innerText('#history')).length > 0, 'Las notas con HTML no ejecutan código');
  await p.click('[data-screen=datos]');
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('#dlJson')]);
  const json = JSON.parse(await (await dj.createReadStream()).toArray().then((b) => Buffer.concat(b).toString()));
  eq(json.noches.map((n) => n.fecha), ['2026-10-25', '2026-10-26'], 'JSON en orden cronológico');
  ok(json.objetivo?.acostarse === '21:00' && json.unidades?.eficiencia_pct, 'JSON incluye objetivos y unidades');
  ok(!(await p.isVisible('#backupNote')), 'Descargar el JSON quita el recordatorio de copia');
  const [dc] = await Promise.all([p.waitForEvent('download'), p.click('#dlCsv')]);
  const csv = (await (await dc.createReadStream()).toArray().then((b) => Buffer.concat(b).toString())).replace(/^﻿/, '');
  // Parser CSV mínimo con comillas para comprobar que las columnas cuadran.
  const parse = (s) => { const rows = [[]]; let f = '', q = false; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (q) { if (ch === '"' && s[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; } else if (ch === '"') q = true; else if (ch === ',') { rows.at(-1).push(f); f = ''; } else if (ch === '\n') { rows.at(-1).push(f); f = ''; rows.push([]); } else f += ch; } rows.at(-1).push(f); return rows; };
  const rows = parse(csv);
  eq(rows.length, 3, 'CSV: cabecera + 2 noches (la nota con salto de línea no rompe filas)');
  ok(rows.every((r) => r.length === rows[0].length), 'CSV: todas las filas tienen las mismas columnas', rows.map((r) => r.length));
  eq(rows[2][rows[0].indexOf('notas')], tricky.preguntas.notas, 'CSV: comillas, comas y saltos de línea intactos');

  // Importar en un navegador limpio el JSON exportado: mismo resultado.
  const p2 = await fresh();
  await p2.click('[data-screen=datos]');
  await p2.setInputFiles('#importFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
  await p2.waitForTimeout(200);
  const a = json.noches, b = (await stored(p2)).sort((x, y) => x.fecha.localeCompare(y.fecha));
  eq(b.map((n) => [n.fecha, n.calculado.sueno_real_min, n.cuerpo.peso_kg]), a.map((n) => [n.fecha, n.calculado.sueno_real_min, n.cuerpo.peso_kg]), 'Exportar → importar conserva las noches');
  await p2.setInputFiles('#importFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') });
  await p2.waitForTimeout(200);
  ok((await p2.innerText('#impToast')).includes('no es un JSON'), 'Rechaza un JSON que no es del diario');
  await p2.setInputFiles('#importFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('no es json') });
  await p2.waitForTimeout(200);
  ok((await p2.innerText('#impToast')).includes('no es un JSON'), 'Rechaza un archivo roto');
  eq((await stored(p2)).length, 2, 'Un import fallido no toca los datos');
  await p2.setInputFiles('#importFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ fecha: '2026-10-10', reloj: { dormido: '25:99', total_dormido_min: -5 }, preguntas: { descanso: 9, notas: 42 }, cuerpo: { peso_kg: '72,5' } }])) });
  await p2.waitForTimeout(200);
  const bad = (await stored(p2)).find((n) => n.fecha === '2026-10-10');
  ok(bad && bad.reloj.dormido === null && bad.reloj.total_dormido_min === null && bad.preguntas.descanso === null && bad.preguntas.notas === null, 'Limpia horas, números y notas inválidos al importar', JSON.stringify(bad));
  await p2.click('[data-wipe=ask]'); await p2.click('[data-wipe=no]');
  eq((await stored(p2)).length, 3, '«Borrar todas» se puede cancelar');
  await p2.click('[data-wipe=ask]'); await p2.click('[data-wipe=yes]');
  eq((await stored(p2)).length, 0, '«Borrar todas» borra tras confirmar');
}
{
  // Datos antiguos (v1.0, sin campos nuevos) se cargan y recalculan.
  const old = { fecha: '2026-10-22', percibido: { cama: '22:10', dormido: '22:35', despertar: '07:50', levantado: '07:57' }, reloj: { dormido: '22:50', despertar: '07:59', fases_min: { despierto: 21, rem: 95, ligero: 290, profundo: 49 } }, preguntas: { calidad: 4, descanso: 3, estres: 2 }, calculado: { sueno_real_min: 434 } };
  const p = await fresh({ seed: [old] });
  ok((await p.innerText('#stats')).includes('74%'), 'Datos de la v1.0 se recalculan (eficiencia 74 %)');
  ok(!p.errs.length, 'Datos antiguos sin errores', p.errs);
}
{
  // Almacenamiento bloqueado (modo privado o lleno).
  const p = await fresh();
  await p.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('QuotaExceeded'); }; });
  await p.click('#nowGo');
  await fillNight(p, { cama: '21:00', levantado: '06:00', dormidoReal: '21:10', despertarReal: '05:50', 'tot-h': '8', 'tot-m': '20' });
  await p.click('button[type=submit]');
  ok((await p.innerText('#toast')).includes('No se pudo guardar'), 'Si el navegador no deja guardar, lo dice');
}

// ---------- G2. Versión 1.5 ----------
cur = 'Versión 1.5';
{
  const p = await fresh({ settings: null, seed: [night('2026-10-26')] });
  ok(await p.isVisible('#news'), 'La bandeja de novedades se abre la primera vez');
  await p.click('#newsOk');
  ok(!(await p.isVisible('#news')), '«Entendido» la cierra');
  await p.reload();
  ok(!(await p.isVisible('#news')), 'No vuelve a salir al recargar');
  await p.click('[data-screen=datos]'); await p.click('#s-datos [data-news]');
  ok(await p.isVisible('#news'), 'Se puede volver a abrir desde Datos');
  await p.keyboard.press('Escape');
  ok(!(await p.isVisible('#news')), 'Escape la cierra');
}
{
  const p = await fresh();
  await p.click('#nowGo');
  const visibles = await p.$$eval('#s-registrar input, #s-registrar select, #s-registrar textarea', (els) => els.filter((e) => e.checkVisibility()).length);
  ok(visibles <= 11, `Formulario rápido: ${visibles} campos visibles (antes 33)`, visibles);
  ok(!(await p.evaluate(() => document.getElementById('more').open)), '«Más detalles» empieza cerrado');
  ok(!(await p.$('#suenos')) && !(await p.$('.segmented[data-name=calidad]')), '«Sueños» y «Calidad» ya no están');
  await fillNight(p, { cama: '21:00', levantado: '06:00', dormidoReal: '21:12', despertarReal: '05:52', 'tot-h': '8', 'tot-m': '20', peso: '72,5', entrenos: '1' });
  await p.click('.segmented[data-name=descanso] .seg[data-v="4"]');
  await p.click('button[type=submit]');
  const n = (await stored(p))[0];
  ok(n && n.calculado.eficiencia_pct === 93 && n.cuerpo.mismas_condiciones === true && n.preguntas.entrenos_ayer === 1, 'Se guarda una noche solo con lo esencial', JSON.stringify(n?.calculado));
}
{
  const seed = [night('2026-10-26', { q: { calidad: 3, suenos: 'si', notas: 'antigua' } })];
  const p = await fresh({ seed });
  await p.click('[data-screen=historial]'); await p.click('#history [data-edit="2026-10-26"]');
  ok(await p.evaluate(() => document.getElementById('more').open), 'Editar una noche con detalles abre «Más detalles»');
  await p.click('.segmented[data-name=descanso] .seg[data-v="5"]');
  await p.click('button[type=submit]');
  const n = (await stored(p))[0];
  ok(n.preguntas.calidad === 3 && n.preguntas.suenos === 'si', 'Editar una noche antigua conserva su calidad y sueños', JSON.stringify(n.preguntas));
}
{
  const mk = (k) => { const d = new Date('2026-10-26T12:00'); d.setDate(d.getDate() - k); return night(d.toISOString().slice(0, 10)); };
  const p13 = await fresh({ seed: Array.from({ length: 13 }, (_, k) => mk(k)) });
  await p13.click('#nowGo'); await p13.evaluate(() => { document.getElementById('more').open = true; });
  ok(await p13.isVisible('#dormidoPerc'), 'Con 13 noches aún pregunta «lo que tú crees»');
  const p14 = await fresh({ seed: Array.from({ length: 14 }, (_, k) => mk(k)) });
  await p14.click('#nowGo'); await p14.evaluate(() => { document.getElementById('more').open = true; });
  ok(!(await p14.isVisible('#dormidoPerc')), 'Con 14 noches deja de preguntarlo');
}
{
  // Semana actual (lun 26–) frente a la pasada (lun 19–dom 25).
  const seed = [
    night('2026-10-27', { c: { peso_kg: 73 }, r: { total_dormido_min: 490 } }),
    night('2026-10-26', { c: { peso_kg: 73 }, r: { total_dormido_min: 470 } }),
    night('2026-10-25', { c: { peso_kg: 72 }, r: { total_dormido_min: 440 } }),
    night('2026-10-24', { c: { peso_kg: 72 }, r: { total_dormido_min: 460 } }),
  ];
  const p = await fresh({ seed });
  const rows = await p.$$eval('#week tbody tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent + '|' + td.className)));
  eq(rows[0], ['Sueño real|', '8h 00m|', '7h 30m|', '+30 min|ok'], 'Resumen: sueño de esta semana frente a la anterior');
  eq(rows[5], ['Peso medio|', '73.0 kg|', '72.0 kg|', '+1.0 kg|na'], 'Resumen: peso medio sin juzgar si es bueno o malo');
  ok((await p.innerText('#weekSub')).includes('2 noches apuntadas. La pasada: 2'), 'Resumen: noches apuntadas por semana');
}
{
  const p = await fresh({ seed: [night('2026-10-27')] });
  eq(await p.innerText('#nowSub'), '✓ Noche de hoy registrada', 'El reloj dice si la noche de hoy ya está registrada');
  await p.click('#nowGo');
  eq(await p.inputValue('#fecha'), '2026-10-27', 'El botón del reloj abre la noche de hoy');
}

// ---------- H. Diseño y accesibilidad ----------
cur = 'Diseño';
for (const w of [320, 390, 768, 1280]) {
  const p = await fresh({ width: w, seed: [night('2026-10-27'), night('2026-10-26')] });
  const over = [];
  for (const s of ['hoy', 'registrar', 'historial', 'datos']) {
    await p.click(`[data-screen=${s}]`);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) over.push(`${s}: ${sw}px`);
  }
  ok(!over.length, `Sin scroll horizontal a ${w} px`, over);
  ok(!p.errs.length, `Sin errores a ${w} px`, p.errs);
  await p.context().close();
}
{
  const p = await fresh({ reduced: true, seed: [night('2026-10-27')] });
  const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.stat')).animationName);
  eq(anim, 'none', 'Con «Reducir movimiento» no hay animaciones');
  const inputs = await p.$$eval('#s-registrar input, #s-registrar select, #s-registrar textarea', (els) => els.filter((e) => !e.closest('label') && !e.getAttribute('aria-label')).map((e) => e.id));
  eq(inputs, [], 'Todos los campos del formulario tienen etiqueta');
}

await browser.close();
const fails = results.filter((r) => !r.pass);
let g = '';
for (const r of results) { if (r.grp !== g) { g = r.grp; console.log(`\n## ${g}`); } console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '  → ' + r.extra}`); }
console.log(`\n${results.length - fails.length}/${results.length} pruebas superadas`);
process.exit(fails.length ? 1 : 0);
