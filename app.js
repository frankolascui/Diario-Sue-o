// Diario de Sueño — datos en localStorage de este navegador; exportar/importar JSON para moverlos o analizarlos.
(() => {
  'use strict';
  const KEY = 'diario-sueno:noches';
  const PHASES = [
    { k: 'despierto', n: 'Despierto', c: 'var(--awake)' },
    { k: 'rem', n: 'REM', c: 'var(--rem)' },
    { k: 'ligero', n: 'Ligero', c: 'var(--core)' },
    { k: 'profundo', n: 'Profundo', c: 'var(--deep)' },
  ];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- almacenamiento ----------
  let nights = load();
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  function persist() {
    nights.sort((a, b) => b.fecha.localeCompare(a.fecha));
    try { localStorage.setItem(KEY, JSON.stringify(nights)); return true; } catch { return false; }
  }

  // ---------- tiempo ----------
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const toMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const span = (a, b) => { const x = toMin(a), y = toMin(b); if (x == null || y == null) return null; let d = y - x; if (d < 0) d += 1440; return d; };
  const diffClock = (a, b) => { const x = toMin(a), y = toMin(b); if (x == null || y == null) return null; let d = y - x; if (d > 720) d -= 1440; if (d < -720) d += 1440; return d; };
  const fmt = (m) => (m == null || isNaN(m) ? '—' : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`);
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const fechaLarga = (f) => { try { return new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }); } catch { return f; } };

  // ---------- navegación ----------
  const screens = ['hoy', 'registrar', 'historial', 'datos'];
  function go(name) {
    screens.forEach((s) => { $('s-' + s).hidden = s !== name; });
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.screen === name));
    window.scrollTo(0, 0);
    try { history.replaceState(null, '', '#' + name); } catch {}
  }
  document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.screen)));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
  $('nowHist').addEventListener('click', () => go('historial'));
  $('nowGo').addEventListener('click', () => { const ex = nights.find((n) => n.fecha === today()); if (ex) fillForm(ex); else { clearForm(); $('fecha').value = today(); } go('registrar'); });

  // ---------- formulario ----------
  $('phases').innerHTML = PHASES.map((p) => `<div class="phase"><span class="dot" style="background:${p.c}"></span><span>${p.n}</span>
    <input type="number" id="ph-${p.k}-h" min="0" max="14" inputmode="numeric" placeholder="0" aria-label="${p.n}, horas">
    <input type="number" id="ph-${p.k}-m" min="0" max="59" inputmode="numeric" placeholder="0" aria-label="${p.n}, minutos"></div>`).join('');
  const scales = {};
  document.querySelectorAll('.segmented').forEach((s) => {
    const n = s.dataset.name; scales[n] = null;
    s.innerHTML = [1, 2, 3, 4, 5].map((v) => `<button type="button" class="seg" data-v="${v}" aria-pressed="false">${v}</button>`).join('');
    s.addEventListener('click', (e) => {
      const b = e.target.closest('.seg'); if (!b) return;
      const v = Number(b.dataset.v); scales[n] = scales[n] === v ? null : v; paintScale(n);
    });
  });
  function paintScale(n) {
    document.querySelectorAll(`.segmented[data-name="${n}"] .seg`).forEach((b) => {
      const on = Number(b.dataset.v) === scales[n]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
  }

  function readForm() {
    const fases = {};
    PHASES.forEach((p) => { const h = num($(`ph-${p.k}-h`).value), m = num($(`ph-${p.k}-m`).value); fases[p.k] = h == null && m == null ? null : (h || 0) * 60 + (m || 0); });
    const r = {
      fecha: $('fecha').value,
      percibido: { cama: $('cama').value || null, dormido: $('dormidoPerc').value || null, despertar: $('despertarPerc').value || null, levantado: $('levantado').value || null },
      reloj: { dormido: $('dormidoReal').value || null, despertar: $('despertarReal').value || null, fases_min: fases },
      preguntas: {
        calidad: scales.calidad, descanso: scales.descanso, estres: scales.estres,
        despertares: num($('despertares').value), siesta_min: num($('siesta').value),
        ultima_cafeina: $('cafeina').value || null, ultima_comida: $('cena').value || null,
        pantalla_ultima_hora: $('pantalla').value || null, ejercicio: $('ejercicio').value || null,
        luz_natural: $('luz').value || null, suenos: $('suenos').value || null, notas: $('notas').value.trim() || null,
      },
    };
    r.calculado = derive(r);
    return r;
  }
  function derive(r) {
    const f = r.reloj.fases_min;
    const dormidoFases = ['rem', 'ligero', 'profundo'].reduce((s, k) => s + (f[k] || 0), 0) || null;
    const porHoras = span(r.reloj.dormido, r.reloj.despertar);
    const c = {
      sueno_real_min: dormidoFases ?? (porHoras == null ? null : porHoras - (f.despierto || 0)),
      sueno_percibido_min: span(r.percibido.dormido, r.percibido.despertar),
      latencia_percibida_min: span(r.percibido.cama, r.percibido.dormido),
      error_hora_dormido_min: diffClock(r.reloj.dormido, r.percibido.dormido),
      error_hora_despertar_min: diffClock(r.reloj.despertar, r.percibido.despertar),
      pct: {},
    };
    const tot = PHASES.reduce((s, p) => s + (f[p.k] || 0), 0);
    PHASES.forEach((p) => { c.pct[p.k] = tot ? Math.round(((f[p.k] || 0) / tot) * 100) : null; });
    return c;
  }
  function fillForm(r) {
    clearForm();
    $('fecha').value = r.fecha;
    const p = r.percibido || {}, w = r.reloj || {}, q = r.preguntas || {};
    $('cama').value = p.cama || ''; $('dormidoPerc').value = p.dormido || ''; $('despertarPerc').value = p.despertar || ''; $('levantado').value = p.levantado || '';
    $('dormidoReal').value = w.dormido || ''; $('despertarReal').value = w.despertar || '';
    PHASES.forEach((ph) => { const v = w.fases_min?.[ph.k]; $(`ph-${ph.k}-h`).value = v == null ? '' : Math.floor(v / 60); $(`ph-${ph.k}-m`).value = v == null ? '' : v % 60; });
    ['calidad', 'descanso', 'estres'].forEach((n) => { scales[n] = q[n] ?? null; paintScale(n); });
    $('despertares').value = q.despertares ?? ''; $('siesta').value = q.siesta_min ?? '';
    $('cafeina').value = q.ultima_cafeina || ''; $('cena').value = q.ultima_comida || '';
    $('pantalla').value = q.pantalla_ultima_hora || ''; $('ejercicio').value = q.ejercicio || '';
    $('luz').value = q.luz_natural || ''; $('suenos').value = q.suenos || ''; $('notas').value = q.notas || '';
    updateLive();
  }
  function clearForm() {
    const f = $('fecha').value; $('s-registrar').reset(); $('fecha').value = f || today();
    Object.keys(scales).forEach((n) => { scales[n] = null; paintScale(n); });
    toast('toast', ''); updateLive();
  }
  function updateLive() {
    const c = readForm().calculado, e = c.error_hora_dormido_min;
    $('live').innerHTML = `<div><b>${fmt(c.sueno_real_min)}</b><small>sueño real</small></div>
      <div><b>${fmt(c.sueno_percibido_min)}</b><small>lo que crees</small></div>
      <div><b>${e == null ? '—' : (e > 0 ? '+' : '') + e + ' min'}</b><small>error al dormirte</small></div>`;
  }
  $('s-registrar').addEventListener('input', updateLive);
  $('s-registrar').addEventListener('click', (e) => { if (e.target.closest('.seg')) updateLive(); });
  $('fecha').addEventListener('change', () => { const ex = nights.find((n) => n.fecha === $('fecha').value); if (ex) fillForm(ex); });
  $('clearBtn').addEventListener('click', clearForm);
  $('s-registrar').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = readForm();
    if (!r.fecha) { toast('toast', 'Pon la fecha de la noche.', 'err'); return; }
    r.actualizado = new Date().toISOString();
    nights = nights.filter((n) => n.fecha !== r.fecha); nights.push(r);
    if (!persist()) { toast('toast', 'No se pudo guardar: este navegador bloquea el almacenamiento (¿modo privado?).', 'err'); return; }
    renderAll();
    toast('toast', `Noche del ${r.fecha} guardada.`, 'ok');
  });

  function toast(id, msg, kind) { const t = $(id); t.textContent = msg; t.className = 'toast ' + (kind || ''); }

  // ---------- render ----------
  function streak() {
    const set = new Set(nights.map((n) => n.fecha));
    const d = new Date(today() + 'T12:00');
    if (!set.has(today())) d.setDate(d.getDate() - 1);
    let s = 0;
    while (set.has(d.toISOString().slice(0, 10))) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }
  const avgOf = (arr, fn) => { const v = arr.map(fn).filter((x) => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  function renderStats() {
    const last = nights[0], week = nights.slice(0, 7);
    const deepPct = last?.calculado?.pct?.profundo;
    const q = avgOf(week, (n) => n.preguntas?.calidad);
    const tiles = [
      { i: '☾', v: fmt(last?.calculado?.sueno_real_min), l: 'última noche', bar: last?.calculado?.sueno_real_min ? Math.min(100, (last.calculado.sueno_real_min / 480) * 100) : 0 },
      { i: '◆', v: deepPct == null ? '—' : deepPct + '%', l: 'sueño profundo' },
      { i: '★', v: q == null ? '—' : q.toFixed(1) + '/5', l: 'calidad (7 noches)', bar: q ? (q / 5) * 100 : 0 },
      { i: '⏱', v: fmt(avgOf(week, (n) => n.calculado?.sueno_real_min)), l: 'media (7 noches)' },
      { i: '🔥', v: String(streak()), l: 'días seguidos' },
    ];
    $('stats').innerHTML = tiles.map((t) => `<div class="stat"><span class="stat-icon" aria-hidden="true">${t.i}</span><div class="stat-body">
      <span class="stat-value">${esc(t.v)}</span><span class="stat-label">${t.l}</span>${t.bar != null ? `<div class="stat-bar"><i style="width:${t.bar}%"></i></div>` : ''}</div></div>`).join('');
    $('navCount').textContent = `${nights.length} ${nights.length === 1 ? 'noche' : 'noches'}`;

    const done = nights.some((n) => n.fecha === today());
    $('nowTitle').textContent = done ? 'Noche de hoy registrada' : 'Registrar la noche de hoy';
    $('nowSub').textContent = done
      ? (nights.length >= 7 ? 'Ya tienes datos suficientes: exporta el JSON y pide a Claude que lo analice.' : `Llevas ${nights.length} de 7 noches para el primer análisis. Mañana, otra.`)
      : 'Copia del Apple Watch las horas y las fases, y responde a las preguntas. Te lleva un minuto.';
    $('nowGo').textContent = done ? '✎ Editar noche de hoy' : '▷ Registrar noche';
  }

  function nightCard(n, max) {
    const f = n.reloj?.fases_min || {}, q = n.preguntas || {};
    const segs = PHASES.map((p) => (f[p.k] ? `<i style="width:${(f[p.k] / max) * 100}%;background:${p.c}" title="${p.n}: ${fmt(f[p.k])}"></i>` : '')).join('');
    const chips = [
      q.calidad != null && [`calidad ${q.calidad}/5`, ''],
      q.ultima_cafeina && [`café ${q.ultima_cafeina}`, toMin(q.ultima_cafeina) >= 14 * 60 ? 'warn' : 'soft'],
      q.pantalla_ultima_hora === 'si' && ['pantalla', 'warn'],
      q.ejercicio && q.ejercicio !== 'no' && [`ejercicio ${q.ejercicio === 'manana' ? 'mañana' : q.ejercicio}`, 'soft'],
      q.estres >= 4 && ['estrés alto', 'warn'],
    ].filter(Boolean);
    return `<div class="night"><div class="night-top"><span class="night-date">${esc(fechaLarga(n.fecha))}</span>
      <span class="night-meta">${esc(n.reloj?.dormido || '--:--')} → ${esc(n.reloj?.despertar || '--:--')} · ${fmt(n.calculado?.sueno_real_min)}</span></div>
      <div class="bar">${segs}</div>
      <div class="night-foot"><div class="chips">${chips.map(([t, k]) => `<span class="chip ${k}">${esc(t)}</span>`).join('')}</div>
      <button class="link" data-edit="${esc(n.fecha)}">Editar</button></div></div>`;
  }
  function renderLists() {
    const max = Math.max(1, ...nights.map((n) => PHASES.reduce((s, p) => s + (n.reloj?.fases_min?.[p.k] || 0), 0)));
    const empty = '<p class="empty">Aún no hay noches. Registra la de hoy y aparecerá aquí.</p>';
    $('recent').innerHTML = nights.length ? nights.slice(0, 3).map((n) => nightCard(n, max)).join('') : empty;
    $('history').innerHTML = nights.length ? nights.map((n) => nightCard(n, max)).join('') : empty;
    document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { fillForm(nights.find((x) => x.fecha === b.dataset.edit)); go('registrar'); }));

    const week = nights.slice(0, 7);
    const avgs = PHASES.map((p) => ({ ...p, v: avgOf(week, (n) => n.reloj?.fases_min?.[p.k]) }));
    const top = Math.max(1, ...avgs.map((a) => a.v || 0));
    $('phaseAvg').innerHTML = week.length
      ? avgs.map((a) => `<div class="avg-row"><span>${a.n}</span><div class="avg-track"><i style="width:${((a.v || 0) / top) * 100}%;background:${a.c}"></i></div><span class="mono">${fmt(a.v)}</span></div>`).join('')
      : '<p class="empty">Las medias aparecen con tu primera noche.</p>';
  }
  function renderAll() { renderStats(); renderLists(); }

  // ---------- exportar / importar ----------
  const sorted = () => [...nights].sort((a, b) => a.fecha.localeCompare(b.fecha));
  function exportJson() {
    return JSON.stringify({
      app: 'Diario de Sueño', version: 1, exportado: new Date().toISOString(),
      unidades: { fases_min: 'minutos', horas: 'HH:MM local', error_hora_dormido_min: 'percibido menos real; positivo = crees que te dormiste más tarde' },
      noches: sorted(),
    }, null, 2);
  }
  function exportCsv() {
    const cols = ['fecha', 'cama', 'dormido_percibido', 'despertar_percibido', 'levantado', 'dormido_real', 'despertar_real', 'despierto_min', 'rem_min', 'ligero_min', 'profundo_min', 'sueno_real_min', 'sueno_percibido_min', 'latencia_percibida_min', 'error_hora_dormido_min', 'calidad', 'descanso', 'estres', 'despertares', 'siesta_min', 'ultima_cafeina', 'ultima_comida', 'pantalla_ultima_hora', 'ejercicio', 'luz_natural', 'suenos', 'notas'];
    const rows = sorted().map((n) => {
      const p = n.percibido || {}, r = n.reloj || {}, f = r.fases_min || {}, q = n.preguntas || {}, c = n.calculado || {};
      return [n.fecha, p.cama, p.dormido, p.despertar, p.levantado, r.dormido, r.despertar, f.despierto, f.rem, f.ligero, f.profundo, c.sueno_real_min, c.sueno_percibido_min, c.latencia_percibida_min, c.error_hora_dormido_min, q.calidad, q.descanso, q.estres, q.despertares, q.siesta_min, q.ultima_cafeina, q.ultima_comida, q.pantalla_ultima_hora, q.ejercicio, q.luz_natural, q.suenos, q.notas];
    });
    const cell = (v) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return '﻿' + [cols, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  }
  function download(name, text, type) {
    if (!nights.length) { toast('expToast', 'Todavía no hay noches que exportar.', 'err'); return; }
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('expToast', `${name} descargado.`, 'ok');
  }
  $('dlJson').addEventListener('click', () => download(`sueno-${today()}.json`, exportJson(), 'application/json'));
  $('dlCsv').addEventListener('click', () => download(`sueno-${today()}.csv`, exportCsv(), 'text/csv'));
  $('copyJson').addEventListener('click', () => {
    navigator.clipboard?.writeText(exportJson()).then(() => toast('expToast', 'JSON copiado.', 'ok'), () => toast('expToast', 'No se pudo copiar. Usa «Descargar JSON».', 'err'));
  });
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.noches;
      if (!Array.isArray(list)) throw new Error('formato');
      const valid = list.filter((n) => n && /^\d{4}-\d{2}-\d{2}$/.test(n.fecha) && n.reloj && n.preguntas);
      const byDate = new Map(nights.map((n) => [n.fecha, n]));
      valid.forEach((n) => { n.calculado = derive({ percibido: n.percibido || {}, reloj: { ...n.reloj, fases_min: n.reloj.fases_min || {} } }); byDate.set(n.fecha, n); });
      nights = [...byDate.values()];
      if (!persist()) throw new Error('storage');
      renderAll();
      toast('impToast', `${valid.length} ${valid.length === 1 ? 'noche importada' : 'noches importadas'}.`, 'ok');
    } catch (err) {
      toast('impToast', err.message === 'storage' ? 'No se pudo guardar en este navegador.' : 'Ese archivo no es un JSON del Diario de Sueño.', 'err');
    }
  });
  const WIPE_IDLE = '<button class="ghost danger" data-wipe="ask">Borrar todas las noches</button>';
  const WIPE_ASK = '<span class="hint">¿Seguro? Se borran todas las noches de este navegador.</span><button class="ghost danger" data-wipe="yes">Sí, borrar</button><button class="ghost" data-wipe="no">Cancelar</button>';
  $('wipeRow').innerHTML = WIPE_IDLE;
  $('wipeRow').addEventListener('click', (e) => {
    const act = e.target.closest('[data-wipe]')?.dataset.wipe; if (!act) return;
    if (act === 'yes') { nights = []; persist(); renderAll(); }
    $('wipeRow').innerHTML = act === 'ask' ? WIPE_ASK : WIPE_IDLE;
  });

  // ---------- arranque ----------
  $('fecha').value = today();
  updateLive();
  renderAll();
  const start = location.hash.slice(1);
  go(screens.includes(start) ? start : 'hoy');
})();
