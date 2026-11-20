// Cierre de la web: aviso, enlace con las noches y copia JSON.
// Uso: sirve la carpeta (python3 -m http.server 8765) y ejecuta
//   node tests/cierre.mjs http://localhost:8765/ [ruta a dist-single/index.html de Excelsior RPG para probar el viaje completo]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const URL_ = process.argv[2] || 'http://localhost:8765/';
const RPG = process.argv[3];
const browser = await chromium.launch();
let fails = 0;
const check = (c, m) => { console.log(`${c ? 'ok' : 'FALLO'}: ${m}`); if (!c) fails++; };
const night = (fecha) => ({ fecha, percibido: { cama: '23:00', levantado: '07:00' }, reloj: { dormido: '23:15', despertar: '06:50', total_dormido_min: 430, fases_min: { despierto: 10, rem: 90, ligero: 250, profundo: 90 } }, preguntas: { descanso: 4, entrenos_ayer: 1, notas: 'Café a las 17:00, mal' }, cuerpo: { peso_kg: 71.2, mismas_condiciones: true } });
const nights = Array.from({ length: 30 }, (_, i) => night(`2026-10-${String(i + 1).padStart(2, '0')}`));

async function open(seed, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.addInitScript((s) => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.clear(); if (s) localStorage.setItem('diario-sueno:noches', JSON.stringify(s)); } }, seed);
  await p.goto(URL_);
  return p;
}

// Sin noches
let p = await open(null);
check(await p.locator('#cierre').isVisible(), 'sin noches: sale el aviso de cierre');
check((await p.locator('#cierreGo').textContent()).trim() === 'Ir a Excelsior RPG', 'sin noches: botón «Ir a Excelsior RPG»');
check(!(await p.locator('#cierreJson').isVisible()), 'sin noches: no ofrece descargar');
check(await p.locator('#news[open]').count() === 0, 'las novedades de la v1.5 no se abren');
check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll horizontal en móvil');
await p.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/cierre-vacio.png` : '/dev/null' }).catch(() => {});

// Con noches
p = await open(nights);
await p.waitForFunction(() => document.getElementById('cierreGo').href.includes('#traer-salud='));
check((await p.locator('#cierreCount').textContent()).includes('30 noches'), 'cuenta las noches de este navegador');
check((await p.locator('#cierreGo').textContent()).includes('Llevar mis 30 noches'), 'botón «Llevar mis 30 noches»');
const href = await p.locator('#cierreGo').getAttribute('href');
check(href.length < 4000, `enlace corto (${href.length} caracteres)`);
const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#cierreJson').click()]);
check(/sueno-.*\.json/.test(dl.suggestedFilename()), 'descarga la copia JSON');
if (process.env.SHOT_DIR) await p.screenshot({ path: `${process.env.SHOT_DIR}/cierre-movil.png` });
await p.locator('#cierreStay').click();
check(!(await p.locator('#cierre').isVisible()), '«Ver mis datos aquí» cierra el aviso');
check(p.errs.length === 0, `sin errores ${p.errs.join(' | ')}`);

// Viaje completo hasta Excelsior RPG (opcional)
if (RPG) {
  const payload = href.slice(href.indexOf('#traer-salud='));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const r = await ctx.newPage();
  const url = pathToFileURL(RPG).href;
  await r.goto(url);
  await r.evaluate(() => { localStorage.setItem('excelsior:v1', JSON.stringify({ version: 5, profile: { name: 'Ana', createdAt: Date.now() - 864e5 }, quests: [], habits: [], habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [], xp: [], tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: '9.9', ascended: [] })); localStorage.setItem('excelsior:guest', '1'); });
  await r.goto(url + payload);
  await r.reload();
  const dlg = r.getByTestId('sure-dialog');
  await dlg.waitFor({ timeout: 8000 });
  check((await dlg.textContent()).includes('¿Traer 30 noches'), 'Excelsior RPG pregunta por las 30 noches');
  await dlg.getByRole('button', { name: 'Traer mis noches' }).click();
  await r.waitForTimeout(300);
  const h = await r.evaluate(() => JSON.parse(localStorage.getItem('excelsior:health')));
  check(h.nights.length === 30 && h.nights.some((n) => n.preguntas.notas === 'Café a las 17:00, mal' && n.cuerpo.peso_kg === 71.2), 'llegan las 30 noches con notas y peso');
}
await browser.close();
process.exit(fails ? 1 : 0);
