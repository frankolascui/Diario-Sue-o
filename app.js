// Diario de Sueño — datos en localStorage de este navegador; exportar/importar JSON para moverlos o analizarlos.
(() => {
  'use strict';
  const KEY = 'diario-sueno:noches';
  const DRAFT_KEY = 'diario-sueno:borrador';
  const SET_KEY = 'diario-sueno:ajustes';
  const PHASES = [
    { k: 'despierto', n: 'Despierto', c: 'var(--awake)' },
    { k: 'rem', n: 'REM', c: 'var(--rem)' },
    { k: 'ligero', n: 'Ligero', c: 'var(--core)' },
    { k: 'profundo', n: 'Profundo', c: 'var(--deep)' },
  ];
  // Metas del plan de sueño: latencia ≤30 min (regla de escalón), eficiencia ≥85 %, descanso ≥4/5,
  // acostarse y levantarse ±15 min de la hora objetivo y 8 h de sueño real.
  const META = { latencia: 30, eficiencia: 85, descanso: 4, regularidad: 15, sueno: 480, noches: 7 };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- tiempo ----------
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const toMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const span = (a, b) => { const x = toMin(a), y = toMin(b); if (x == null || y == null) return null; let d = y - x; if (d < 0) d += 1440; return d; };
  const diffClock = (a, b) => { const x = toMin(a), y = toMin(b); if (x == null || y == null) return null; let d = y - x; if (d > 720) d -= 1440; if (d < -720) d += 1440; return d; };
  const fromMin = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const fmt = (m) => (m == null || isNaN(m) ? '—' : `${m < 0 ? '-' : ''}${Math.floor(Math.abs(m) / 60)}h ${String(Math.round(Math.abs(m) % 60)).padStart(2, '0')}m`);
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const fechaLarga = (f) => { try { return new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }); } catch { return f; } };
  const fechaCorta = (f) => { try { return new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }); } catch { return f; } };
  const nextDay = (f) => { const d = new Date(f + 'T12:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  const prevDay = (f) => { const d = new Date(f + 'T12:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

  // ---------- limpieza de datos (importación y versiones antiguas) ----------
  const cTime = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
  const cNum = (v, max) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && isFinite(n) && n >= 0 && n <= max ? Math.round(n) : null; };
  const cScale = (v) => { const n = cNum(v, 5); return n >= 1 ? n : null; };
  const cOpt = (v, opts) => (opts.includes(v) ? v : null);
  function normalize(n) {
    const p = n.percibido || {}, w = n.reloj || {}, f = w.fases_min || {}, q = n.preguntas || {};
    const r = {
      fecha: n.fecha,
      percibido: { cama: cTime(p.cama), dormido: cTime(p.dormido), despertar: cTime(p.despertar), levantado: cTime(p.levantado) },
      reloj: {
        dormido: cTime(w.dormido), despertar: cTime(w.despertar), total_dormido_min: cNum(w.total_dormido_min, 1440),
        fases_min: Object.fromEntries(PHASES.map((ph) => [ph.k, cNum(f[ph.k], 1440)])),
      },
      preguntas: {
        calidad: cScale(q.calidad), descanso: cScale(q.descanso), estres: cScale(q.estres),
        entrenos_ayer: cNum(q.entrenos_ayer, 4), despertares: cNum(q.despertares, 30), despierto_noche_min: cNum(q.despierto_noche_min, 600), siesta_min: cNum(q.siesta_min, 300),
        ultima_cafeina: cTime(q.ultima_cafeina), ultima_comida: cTime(q.ultima_comida),
        pantalla_ultima_hora: cOpt(q.pantalla_ultima_hora, ['no', 'poco', 'si']), ejercicio: cOpt(q.ejercicio, ['no', 'manana', 'tarde', 'noche']),
        luz_natural: cOpt(q.luz_natural, ['poca', 'algo', 'mucha']), suenos: cOpt(q.suenos, ['no', 'si', 'pesadilla']),
        notas: typeof q.notas === 'string' && q.notas.trim() ? q.notas.trim().slice(0, 2000) : null,
      },
    };
    if (typeof n.actualizado === 'string') r.actualizado = n.actualizado;
    r.calculado = derive(r);
    return r;
  }
  const validNight = (n) => n && typeof n === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(n.fecha);

  // ---------- almacenamiento ----------
  const readKey = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
  const writeKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  let nights = load();
  function load() {
    const v = readKey(KEY, []);
    return Array.isArray(v) ? v.filter(validNight).map(normalize).sort((a, b) => b.fecha.localeCompare(a.fecha)) : [];
  }
  function persist() {
    nights.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return writeKey(KEY, nights);
  }
  let settings = { levantar: '06:00', horas: 9, entrenosPlan: 8, entrenosMin: 7, ultimaCopia: null, ...readKey(SET_KEY, {}) };
  const camaObjetivo = () => fromMin(toMin(settings.levantar) - settings.horas * 60);
  const saveSettings = () => writeKey(SET_KEY, settings);
  // Pide a Safari que no borre los datos por falta de uso (las webs añadidas a la pantalla de inicio ya están exentas).
  try { navigator.storage?.persist?.(); } catch {}

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
  $('nowGo').addEventListener('click', () => {
    const d = readKey(DRAFT_KEY, null), ex = nights.find((n) => n.fecha === today());
    if (d?.night?.fecha === today()) loadDraft(d);
    else if (ex) fillForm(ex);
    else { clearForm(); $('fecha').value = today(); updateLive(); }
    go('registrar');
  });

  // ---------- formulario ----------
  let origFecha = null; // fecha de la noche guardada que se está editando (para moverla si cambias la fecha)
  let confirmSig = null; // avisos ya mostrados: el segundo «Guardar» guarda igualmente
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
  const hm = (hId, mId) => { const h = num($(hId).value), m = num($(mId).value); return h == null && m == null ? null : (h || 0) * 60 + (m || 0); };
  const setHm = (hId, mId, v) => { $(hId).value = v == null ? '' : Math.floor(v / 60); $(mId).value = v == null ? '' : v % 60; };

  function readForm() {
    const fases = {};
    PHASES.forEach((p) => { fases[p.k] = hm(`ph-${p.k}-h`, `ph-${p.k}-m`); });
    const r = {
      fecha: $('fecha').value,
      percibido: { cama: $('cama').value || null, dormido: $('dormidoPerc').value || null, despertar: $('despertarPerc').value || null, levantado: $('levantado').value || null },
      reloj: { dormido: $('dormidoReal').value || null, despertar: $('despertarReal').value || null, total_dormido_min: hm('tot-h', 'tot-m'), fases_min: fases },
      preguntas: {
        calidad: scales.calidad, descanso: scales.descanso, estres: scales.estres,
        entrenos_ayer: num($('entrenos').value), despertares: num($('despertares').value), despierto_noche_min: num($('despiertoNoche').value), siesta_min: num($('siesta').value),
        ultima_cafeina: $('cafeina').value || null, ultima_comida: $('cena').value || null,
        pantalla_ultima_hora: $('pantalla').value || null, ejercicio: $('ejercicio').value || null,
        luz_natural: $('luz').value || null, suenos: $('suenos').value || null, notas: $('notas').value.trim() || null,
      },
    };
    r.calculado = derive(r);
    return r;
  }

  function derive(r) {
    const p = r.percibido || {}, w = r.reloj || {}, f = w.fases_min || {}, q = r.preguntas || {};
    const sum = (ks) => (ks.some((k) => f[k] != null) ? ks.reduce((s, k) => s + (f[k] || 0), 0) : null);
    const fasesDormido = sum(['rem', 'ligero', 'profundo']);
    const fasesTodas = sum(['despierto', 'rem', 'ligero', 'profundo']);
    const ventana = span(w.dormido, w.despertar);
    // Sueño real: el total de Salud si lo apuntaste; si no, REM + ligero + profundo; si no, ventana del reloj menos lo despierto.
    const sueno = w.total_dormido_min || fasesDormido || (ventana == null ? null : ventana - (f.despierto || 0));
    const enCama = span(p.cama, p.levantado);
    const percibido = span(p.dormido, p.despertar);
    const c = {
      sueno_real_min: sueno,
      tiempo_en_cama_min: enCama,
      eficiencia_pct: sueno && enCama ? Math.round((sueno / enCama) * 100) : null,
      latencia_real_min: span(p.cama, w.dormido),
      latencia_percibida_min: span(p.cama, p.dormido),
      sueno_percibido_min: percibido == null ? null : Math.max(0, percibido - (q.despierto_noche_min || 0)),
      error_hora_dormido_min: diffClock(w.dormido, p.dormido),
      error_hora_despertar_min: diffClock(w.despertar, p.despertar),
      pct: {},
      avisos: [],
    };
    PHASES.forEach((ph) => { c.pct[ph.k] = fasesTodas ? Math.round(((f[ph.k] || 0) / fasesTodas) * 100) : null; });

    // ---- coherencia ----
    const a = c.avisos;
    const chain = (pts) => {
      const xs = pts.filter(([, t]) => t);
      for (let i = 1; i < xs.length; i++) {
        // Margen de 20 min: el reloj y tus horas apuntadas a mano no coinciden al minuto.
        const d = span(xs[i - 1][1], xs[i][1]);
        if (d > 720 && d < 1440 - 20) a.push(`«${xs[i][0]}» (${xs[i][1]}) parece anterior a «${xs[i - 1][0]}» (${xs[i - 1][1]}). Revisa el orden o si es AM/PM.`);
      }
    };
    chain([['Me metí en la cama', p.cama], ['Me dormí (real)', w.dormido], ['Me desperté (real)', w.despertar], ['Me levanté', p.levantado]]);
    chain([['Me metí en la cama', p.cama], ['Creo que me dormí', p.dormido], ['Creo que me desperté', p.despertar], ['Me levanté', p.levantado]]);
    if (fasesTodas && ventana != null && Math.abs(ventana - fasesTodas) > 15) {
      a.push(`Las fases suman ${fmt(fasesTodas)}, pero de «me dormí» a «me desperté» hay ${fmt(ventana)} (${Math.abs(ventana - fasesTodas)} min de diferencia). Revisa en Salud que hayas copiado todas las fases.`);
    }
    if (w.total_dormido_min && fasesDormido && Math.abs(w.total_dormido_min - fasesDormido) > 5) {
      a.push(`El total de Salud (${fmt(w.total_dormido_min)}) no coincide con REM + ligero + profundo (${fmt(fasesDormido)}).`);
    }
    if (c.eficiencia_pct > 100) a.push('Sale más sueño que tiempo en la cama: revisa las horas de cama y de levantarte.');
    if (enCama != null && enCama > 14 * 60) a.push(`${fmt(enCama)} en la cama es mucho: ¿están bien las horas?`);
    return c;
  }

  function fillForm(r, fromDraft) {
    clearForm(true);
    $('fecha').value = r.fecha || today();
    const p = r.percibido || {}, w = r.reloj || {}, q = r.preguntas || {};
    $('cama').value = p.cama || ''; $('dormidoPerc').value = p.dormido || ''; $('despertarPerc').value = p.despertar || ''; $('levantado').value = p.levantado || '';
    $('dormidoReal').value = w.dormido || ''; $('despertarReal').value = w.despertar || '';
    setHm('tot-h', 'tot-m', w.total_dormido_min ?? null);
    PHASES.forEach((ph) => setHm(`ph-${ph.k}-h`, `ph-${ph.k}-m`, w.fases_min?.[ph.k] ?? null));
    ['calidad', 'descanso', 'estres'].forEach((n) => { scales[n] = q[n] ?? null; paintScale(n); });
    $('entrenos').value = q.entrenos_ayer ?? ''; $('despertares').value = q.despertares ?? ''; $('despiertoNoche').value = q.despierto_noche_min ?? ''; $('siesta').value = q.siesta_min ?? '';
    $('cafeina').value = q.ultima_cafeina || ''; $('cena').value = q.ultima_comida || '';
    $('pantalla').value = q.pantalla_ultima_hora || ''; $('ejercicio').value = q.ejercicio || '';
    $('luz').value = q.luz_natural || ''; $('suenos').value = q.suenos || ''; $('notas').value = q.notas || '';
    if (!fromDraft) origFecha = nights.some((n) => n.fecha === r.fecha) ? r.fecha : null;
    updateLive();
  }
  function loadDraft(d) {
    fillForm(d.night, true);
    origFecha = d.orig ?? null;
    $('draftNote').hidden = false;
    $('draftNote').textContent = 'Borrador recuperado: no se ha guardado todavía.';
    updateLive();
  }
  function clearForm(keepDraft) {
    const f = $('fecha').value; $('s-registrar').reset(); $('fecha').value = f || today();
    Object.keys(scales).forEach((n) => { scales[n] = null; paintScale(n); });
    origFecha = null; confirmSig = null; $('draftNote').hidden = true;
    toast('toast', '');
    if (keepDraft !== true) { try { localStorage.removeItem(DRAFT_KEY); } catch {} updateLive(); }
  }
  function saveDraft() { writeKey(DRAFT_KEY, { night: readForm(), orig: origFecha }); }

  function updateLive() {
    const c = readForm().calculado, e = c.error_hora_dormido_min;
    const cell = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
    $('live').innerHTML = [
      cell(fmt(c.sueno_real_min), 'sueño real'),
      cell(c.eficiencia_pct == null ? '—' : c.eficiencia_pct + '%', `eficiencia (meta ≥${META.eficiencia}%)`),
      cell(c.latencia_real_min == null ? '—' : c.latencia_real_min + ' min', `latencia (meta ≤${META.latencia})`),
      cell(fmt(c.sueno_percibido_min), 'lo que crees'),
      cell(e == null ? '—' : (e > 0 ? '+' : '') + e + ' min', 'error al dormirte'),
    ].join('');
    $('avisos').hidden = !c.avisos.length;
    $('avisos').innerHTML = c.avisos.map((t) => `<li>${esc(t)}</li>`).join('');
    renderDelete();
  }
  function renderDelete(ask) {
    $('delRow').innerHTML = !origFecha ? '' : ask
      ? '<button type="button" class="ghost danger" data-del="yes">Sí, borrar</button> <button type="button" class="ghost" data-del="no">No</button>'
      : '<button type="button" class="ghost danger" data-del="ask">Borrar noche</button>';
  }
  $('delRow').addEventListener('click', (e) => {
    const act = e.target.closest('[data-del]')?.dataset.del; if (!act) return;
    if (act === 'ask') return renderDelete(true);
    if (act === 'yes') {
      const f = origFecha;
      nights = nights.filter((n) => n.fecha !== f); persist(); clearForm(); renderAll();
      toast('toast', `Noche del ${f} borrada.`, 'ok');
      return;
    }
    renderDelete();
  });
  $('s-registrar').addEventListener('input', () => { confirmSig = null; updateLive(); saveDraft(); });
  $('s-registrar').addEventListener('click', (e) => { if (e.target.closest('.seg')) { updateLive(); saveDraft(); } });
  $('fecha').addEventListener('change', () => {
    const f = $('fecha').value, ex = nights.find((n) => n.fecha === f);
    if (ex) return fillForm(ex);
    if (origFecha && origFecha !== f) {
      $('draftNote').hidden = false;
      $('draftNote').textContent = `Al guardar, la noche del ${origFecha} pasará al ${f}. Para registrar otra noche, pulsa «Vaciar» primero.`;
    }
  });
  $('clearBtn').addEventListener('click', () => clearForm());
  $('s-registrar').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = readForm();
    if (!r.fecha) { toast('toast', 'Pon la fecha de la noche.', 'err'); return; }
    if (r.fecha > today()) { toast('toast', 'La fecha es del futuro. Pon la fecha del día en que te despertaste.', 'err'); return; }
    const sig = JSON.stringify(r.calculado.avisos);
    if (r.calculado.avisos.length && confirmSig !== sig) {
      confirmSig = sig;
      toast('toast', 'Hay datos que no cuadran (en amarillo). Corrígelos o pulsa «Guardar» otra vez para guardar igualmente.', 'err');
      $('avisos').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    r.actualizado = new Date().toISOString();
    const moved = origFecha && origFecha !== r.fecha ? origFecha : null;
    nights = nights.filter((n) => n.fecha !== r.fecha && n.fecha !== moved); nights.push(r);
    if (!persist()) { toast('toast', 'No se pudo guardar: este navegador bloquea el almacenamiento (¿modo privado?).', 'err'); return; }
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    origFecha = r.fecha; confirmSig = null; $('draftNote').hidden = true;
    renderAll(); renderDelete();
    toast('toast', moved ? `Noche movida del ${moved} al ${r.fecha}.` : `Noche del ${r.fecha} guardada.`, 'ok');
  });

  function toast(id, msg, kind) { const t = $(id); t.textContent = msg; t.className = 'toast ' + (kind || ''); }

  // ---------- render ----------
  function streak() {
    const set = new Set(nights.map((n) => n.fecha));
    let d = set.has(today()) ? today() : prevDay(today()), s = 0;
    while (set.has(d)) { s++; d = prevDay(d); }
    return s;
  }
  const avgOf = (arr, fn) => { const v = arr.map(fn).filter((x) => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  function renderStats() {
    const last = nights[0], week = nights.slice(0, 7), lc = last?.calculado || {};
    const d = avgOf(week, (n) => n.preguntas?.descanso);
    const dev = avgOf(week, (n) => (n.percibido?.cama ? Math.abs(diffClock(camaObjetivo(), n.percibido.cama)) : null));
    const ent = trainingWeek(0);
    const tiles = [
      { i: '☾', v: fmt(lc.sueno_real_min), l: `última noche (meta ${META.sueno / 60} h)`, bar: lc.sueno_real_min ? Math.min(100, (lc.sueno_real_min / META.sueno) * 100) : 0 },
      { i: '∑', v: fmt(avgOf(week, (n) => n.calculado?.sueno_real_min)), l: 'media (7 noches)' },
      { i: '◎', v: lc.eficiencia_pct == null ? '—' : lc.eficiencia_pct + '%', l: `eficiencia (≥${META.eficiencia}%)`, bar: lc.eficiencia_pct == null ? 0 : Math.min(100, lc.eficiencia_pct) },
      { i: '⏱', v: lc.latencia_real_min == null ? '—' : lc.latencia_real_min + ' min', l: `latencia (≤${META.latencia})` },
      { i: '★', v: d == null ? '—' : d.toFixed(1) + '/5', l: 'descanso (7 noches)', bar: d ? (d / 5) * 100 : 0 },
      { i: '⇆', v: dev == null ? '—' : `±${Math.round(dev)} min`, l: `hora de cama (meta ±${META.regularidad})` },
      { i: '⚡', v: `${ent.total}/${settings.entrenosPlan}`, l: `entrenos semana (meta ${settings.entrenosMin})`, bar: Math.min(100, (ent.total / settings.entrenosPlan) * 100) },
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

    const days = settings.ultimaCopia ? Math.floor((Date.now() - new Date(settings.ultimaCopia)) / 864e5) : null;
    const needBackup = nights.length >= 3 && (days == null || days >= 7);
    $('backupNote').hidden = !needBackup;
    $('backupNote').textContent = days == null
      ? `Tienes ${nights.length} noches y ninguna copia. Si Safari borra los datos, se pierden: Datos → Descargar JSON.`
      : `Tu última copia es de hace ${days} días. Datos → Descargar JSON.`;
  }

  // Entrenos de una semana (lunes a domingo). Cada noche guarda los entrenos del día anterior a su fecha.
  // offset 0 = esta semana, -1 = la pasada.
  function trainingWeek(offset) {
    const d = new Date(today() + 'T12:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    const start = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 6);
    const end = d.toISOString().slice(0, 10), hoy = today();
    let total = 0, dias = 0, sinDato = 0;
    const byDay = new Map(nights.map((n) => [prevDay(n.fecha), n.preguntas?.entrenos_ayer]));
    for (let x = start; x <= end && x < hoy; x = nextDay(x)) {
      dias++;
      const v = byDay.get(x);
      if (v == null) sinDato++; else total += v;
    }
    return { total, dias, sinDato };
  }

  // Comprueba una noche contra las metas del plan. null = falta el dato.
  function planCheck(n) {
    const c = n.calculado || {}, lev = n.percibido?.levantado;
    const reg = lev ? Math.abs(diffClock(settings.levantar, lev)) : null;
    const cama = n.percibido?.cama, regC = cama ? Math.abs(diffClock(camaObjetivo(), cama)) : null;
    const t = {
      cama: { v: cama || '—', ok: regC == null ? null : regC <= META.regularidad },
      levantado: { v: lev || '—', ok: reg == null ? null : reg <= META.regularidad },
      latencia: { v: c.latencia_real_min == null ? '—' : c.latencia_real_min + "'", ok: c.latencia_real_min == null ? null : c.latencia_real_min <= META.latencia },
      eficiencia: { v: c.eficiencia_pct == null ? '—' : c.eficiencia_pct + '%', ok: c.eficiencia_pct == null ? null : c.eficiencia_pct >= META.eficiencia },
      sueno: { v: c.sueno_real_min == null ? '—' : `${Math.floor(c.sueno_real_min / 60)}:${String(c.sueno_real_min % 60).padStart(2, '0')}`, ok: c.sueno_real_min == null ? null : c.sueno_real_min >= META.sueno },
      descanso: { v: n.preguntas?.descanso ?? '—', ok: n.preguntas?.descanso == null ? null : n.preguntas.descanso >= META.descanso },
    };
    t.todo = Object.values(t).every((x) => x.ok === true);
    return t;
  }
  function renderPlan() {
    const cama = camaObjetivo();
    $('objLevantar').value = settings.levantar; $('objHoras').value = settings.horas;
    $('objEntrenos').value = settings.entrenosPlan; $('objEntrenosMin').value = settings.entrenosMin;
    const w0 = trainingWeek(0), w1 = trainingWeek(-1);
    const miss = (w) => (w.sinDato ? ` (${w.sinDato} ${w.sinDato === 1 ? 'día' : 'días'} sin apuntar)` : '');
    $('training').innerHTML = `<b>Entrenos:</b> esta semana ${w0.total} de ${settings.entrenosPlan}${esc(miss(w0))}; la pasada ${w1.total}${esc(miss(w1))}` +
      ` <span class="${w1.total >= settings.entrenosMin ? 'ok' : 'no'}">${w1.total >= settings.entrenosMin ? '✓ meta cumplida' : w1.dias && !w1.sinDato ? '✗ por debajo de ' + settings.entrenosMin : ''}</span>`;
    $('objResumen').textContent = `Cama a las ${cama}, levantarte a las ${settings.levantar}.`;
    if (!nights.length) { $('planSub').textContent = `Horario ${cama}–${settings.levantar}.`; $('plan').innerHTML = '<p class="empty">Aparece con tu primera noche.</p>'; return; }
    let run = 0;
    for (let i = 0; i < nights.length; i++) {
      if (i > 0 && nights[i].fecha !== prevDay(nights[i - 1].fecha)) break;
      if (!planCheck(nights[i]).todo) break;
      run++;
    }
    $('planSub').textContent = `Horario ${cama}–${settings.levantar}. ${Math.min(run, META.noches)} de ${META.noches} noches seguidas cumpliendo todo` +
      (run >= META.noches ? ': puedes probar el siguiente paso del plan.' : '.') +
      ` Metas: acostarte y levantarte ±${META.regularidad} min, latencia ≤${META.latencia} min, eficiencia ≥${META.eficiencia}%, sueño ≥${META.sueno / 60} h, descanso ≥${META.descanso}/5.`;
    const mark = (x) => `<td class="${x.ok == null ? 'na' : x.ok ? 'ok' : 'no'}">${esc(x.v)}</td>`;
    $('plan').innerHTML = `<div class="plan-wrap"><table class="plan-table"><thead><tr><th>Noche</th><th>Cama</th><th>Levant.</th><th>Lat.</th><th>Efic.</th><th>Sueño</th><th>Desc.</th></tr></thead><tbody>` +
      nights.slice(0, 7).map((n) => { const t = planCheck(n); return `<tr><td>${esc(fechaCorta(n.fecha))}</td>${mark(t.cama)}${mark(t.levantado)}${mark(t.latencia)}${mark(t.eficiencia)}${mark(t.sueno)}${mark(t.descanso)}</tr>`; }).join('') +
      '</tbody></table></div>';
  }

  function nightCard(n, max) {
    const f = n.reloj?.fases_min || {}, q = n.preguntas || {}, c = n.calculado || {};
    const segs = PHASES.map((p) => (f[p.k] ? `<i style="width:${(f[p.k] / max) * 100}%;background:${p.c}" title="${p.n}: ${fmt(f[p.k])}"></i>` : '')).join('');
    const chips = [
      c.avisos?.length && ['revisar datos', 'bad'],
      c.eficiencia_pct != null && [`eficiencia ${c.eficiencia_pct}%`, c.eficiencia_pct >= META.eficiencia ? '' : 'warn'],
      c.latencia_real_min != null && [`latencia ${c.latencia_real_min}'`, c.latencia_real_min <= META.latencia ? '' : 'warn'],
      q.descanso != null && [`descanso ${q.descanso}/5`, ''],
      q.entrenos_ayer > 0 && [`${q.entrenos_ayer} ${q.entrenos_ayer === 1 ? 'entreno' : 'entrenos'}`, 'soft'],
      q.ultima_cafeina && [`café ${q.ultima_cafeina}`, toMin(q.ultima_cafeina) >= 12 * 60 ? 'warn' : 'soft'],
      q.pantalla_ultima_hora === 'si' && ['pantalla', 'warn'],
      q.ejercicio && q.ejercicio !== 'no' && [`ejercicio ${q.ejercicio === 'manana' ? 'mañana' : q.ejercicio}`, 'soft'],
      q.estres >= 4 && ['estrés alto', 'warn'],
    ].filter(Boolean);
    return `<div class="night"><div class="night-top"><span class="night-date">${esc(fechaLarga(n.fecha))}</span>
      <span class="night-meta">${esc(n.reloj?.dormido || '--:--')} → ${esc(n.reloj?.despertar || '--:--')} · ${fmt(c.sueno_real_min)}</span></div>
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
  function renderAll() { renderStats(); renderPlan(); renderLists(); }

  $('objLevantar').addEventListener('change', (e) => { if (cTime(e.target.value)) { settings.levantar = e.target.value; saveSettings(); renderAll(); } });
  const intSetting = (id, key, lo, hi) => $(id).addEventListener('change', (e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= lo && v <= hi) { settings[key] = v; saveSettings(); renderAll(); } });
  intSetting('objEntrenos', 'entrenosPlan', 1, 21); intSetting('objEntrenosMin', 'entrenosMin', 1, 21);
  $('objHoras').addEventListener('change', (e) => { const h = Number(e.target.value); if (h >= 6 && h <= 11) { settings.horas = h; saveSettings(); renderAll(); } });

  // ---------- exportar / importar ----------
  const sorted = () => [...nights].sort((a, b) => a.fecha.localeCompare(b.fecha));
  function exportJson() {
    return JSON.stringify({
      app: 'Diario de Sueño', version: 1, exportado: new Date().toISOString(),
      objetivo: { acostarse: camaObjetivo(), levantarse: settings.levantar, horas_en_cama: settings.horas, entrenos_semana: settings.entrenosPlan, entrenos_minimo: settings.entrenosMin, metas: META },
      unidades: {
        fases_min: 'minutos', horas: 'HH:MM local',
        sueno_real_min: 'total de Salud si existe; si no, REM + ligero + profundo',
        tiempo_en_cama_min: 'de «me metí en la cama» a «me levanté»',
        eficiencia_pct: 'sueño real / tiempo en cama × 100',
        latencia_real_min: 'de «me metí en la cama» a «me dormí» del reloj',
        sueno_percibido_min: 'de «creo que me dormí» a «creo que me desperté», menos los minutos despierto que crees',
        error_hora_dormido_min: 'percibido menos real; positivo = crees que te dormiste más tarde',
        avisos: 'incoherencias detectadas al guardar',
        entrenos_ayer: 'entrenos del día anterior a la fecha de la noche',
      },
      noches: sorted(),
    }, null, 2);
  }
  function exportCsv() {
    const cols = ['fecha', 'cama', 'dormido_percibido', 'despertar_percibido', 'levantado', 'dormido_real', 'despertar_real', 'total_dormido_salud_min', 'despierto_min', 'rem_min', 'ligero_min', 'profundo_min', 'sueno_real_min', 'tiempo_en_cama_min', 'eficiencia_pct', 'latencia_real_min', 'sueno_percibido_min', 'latencia_percibida_min', 'error_hora_dormido_min', 'error_hora_despertar_min', 'calidad', 'descanso', 'estres', 'entrenos_ayer', 'despertares', 'despierto_noche_min', 'siesta_min', 'ultima_cafeina', 'ultima_comida', 'pantalla_ultima_hora', 'ejercicio', 'luz_natural', 'suenos', 'notas', 'avisos'];
    const rows = sorted().map((n) => {
      const p = n.percibido || {}, r = n.reloj || {}, f = r.fases_min || {}, q = n.preguntas || {}, c = n.calculado || {};
      return [n.fecha, p.cama, p.dormido, p.despertar, p.levantado, r.dormido, r.despertar, r.total_dormido_min, f.despierto, f.rem, f.ligero, f.profundo, c.sueno_real_min, c.tiempo_en_cama_min, c.eficiencia_pct, c.latencia_real_min, c.sueno_percibido_min, c.latencia_percibida_min, c.error_hora_dormido_min, c.error_hora_despertar_min, q.calidad, q.descanso, q.estres, q.entrenos_ayer, q.despertares, q.despierto_noche_min, q.siesta_min, q.ultima_cafeina, q.ultima_comida, q.pantalla_ultima_hora, q.ejercicio, q.luz_natural, q.suenos, q.notas, (c.avisos || []).join(' | ')];
    });
    const cell = (v) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return '﻿' + [cols, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  }
  function markBackup() { settings.ultimaCopia = new Date().toISOString(); saveSettings(); renderStats(); }
  function download(name, text, type) {
    if (!nights.length) { toast('expToast', 'Todavía no hay noches que exportar.', 'err'); return; }
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('expToast', `${name} descargado.`, 'ok');
    if (type === 'application/json') markBackup();
  }
  $('dlJson').addEventListener('click', () => download(`sueno-${today()}.json`, exportJson(), 'application/json'));
  $('dlCsv').addEventListener('click', () => download(`sueno-${today()}.csv`, exportCsv(), 'text/csv'));
  $('copyJson').addEventListener('click', () => {
    if (!nights.length) { toast('expToast', 'Todavía no hay noches que exportar.', 'err'); return; }
    navigator.clipboard?.writeText(exportJson()).then(() => { toast('expToast', 'JSON copiado.', 'ok'); markBackup(); }, () => toast('expToast', 'No se pudo copiar. Usa «Descargar JSON».', 'err'));
  });
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data?.noches;
      if (!Array.isArray(list)) throw new Error('formato');
      const valid = list.filter(validNight).map(normalize);
      const skipped = list.length - valid.length;
      const byDate = new Map(nights.map((n) => [n.fecha, n]));
      valid.forEach((n) => byDate.set(n.fecha, n));
      nights = [...byDate.values()];
      if (!persist()) throw new Error('storage');
      renderAll();
      toast('impToast', `${valid.length} ${valid.length === 1 ? 'noche importada' : 'noches importadas'}${skipped ? ` (${skipped} sin fecha válida, ignoradas)` : ''}.`, 'ok');
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
  const draft = readKey(DRAFT_KEY, null);
  if (validNight(draft?.night)) loadDraft(draft); else updateLive();
  renderAll();
  const start = location.hash.slice(1);
  go(screens.includes(start) ? start : 'hoy');
})();
