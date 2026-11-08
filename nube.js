// Cuenta (email + código) y copia de las noches en el Supabase común de Excelsior.
// Misma cuenta que Excelsior RPG; los datos van al esquema «health» (tablas nights y settings, con RLS por usuario).
// localStorage sigue siendo la fuente inmediata: la app funciona igual sin cuenta o sin conexión.
//
// Cómo se sincroniza, gastando poco:
// - Cada cambio hecho a mano (guardar, borrar, importar, horario) queda como pendiente con su hora.
// - Sincronizar = traer solo las filas que cambiaron en la nube desde la última vez (updated_at > cursor),
//   fusionarlas noche a noche (gana la edición más reciente) y subir los pendientes que siguen ganando.
// - Se sincroniza al abrir, al entrar, poco después de cada cambio y al volver a la app (como mucho cada 2 min).
// - La librería de Supabase (vendor/) solo se carga si hay sesión o al iniciarla: sin cuenta no se descarga nada.
(() => {
  'use strict';
  const URL_ = 'https://hvymuwscxxhsaymfkaup.supabase.co';
  // Clave pública: la seguridad la dan las reglas por fila (RLS) de las tablas.
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eW11d3NjeHhoc2F5bWZrYXVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyODk1ODQsImV4cCI6MjEwNjg2NTU4NH0.dqOBdJz2R4yTb7OszJxdq7bwmwpDX7FZsGpM7KxZ4nw';
  const AUTH_KEY = 'sb-hvymuwscxxhsaymfkaup-auth-token';
  const META_KEY = 'diario-sueno:nube';
  const LIB = 'vendor/supabase-2.117.2.js';
  const PAGE = 1000;
  const $ = (id) => document.getElementById(id);
  const App = window.DiarioApp;
  if (!App) return;

  // ---------- estado guardado de la sincronía ----------
  // uid: cuenta con la que se sincronizó este navegador. cursor: mayor updated_at visto en la nube.
  // pend: { fecha: hora del cambio local }. pendAjustes: hora del último cambio de horario sin subir.
  const blank = () => ({ uid: null, cursor: null, pend: {}, pendAjustes: null, ultima: null });
  const readMeta = () => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; } catch { return blank(); } };
  let meta = readMeta();
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {} };

  // Los cambios se apuntan siempre, haya sesión o no, para subirlos al entrar.
  document.addEventListener('diario:cambio', (e) => {
    const now = new Date().toISOString();
    (e.detail?.fechas || []).forEach((f) => { meta.pend[f] = now; });
    if (e.detail?.ajustes) meta.pendAjustes = now;
    saveMeta();
    if (user) schedule(1500);
  });

  // ---------- cliente ----------
  let clientP = null;
  function client() {
    clientP ??= new Promise((resolve, reject) => {
      // Las pruebas automáticas inyectan un cliente falso con la misma forma.
      if (window.__nubeFalsa) return resolve(window.__nubeFalsa);
      if (window.supabase?.createClient) return resolve(window.supabase.createClient(URL_, ANON));
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = () => resolve(window.supabase.createClient(URL_, ANON));
      s.onerror = () => { clientP = null; reject(new Error('No se pudo cargar la librería de la nube.')); };
      document.head.appendChild(s);
    });
    return clientP;
  }
  const db = async () => (await client()).schema('health');

  // ---------- interfaz ----------
  let user = null;
  let pendingEmail = '';
  const toast = (msg, kind) => { const t = $('nubeToast'); t.textContent = msg; t.className = 'toast ' + (kind || ''); };
  const hora = (iso) => { try { return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  function paint() {
    $('cuentaFuera').hidden = !!user;
    $('cuentaDentro').hidden = !user;
    $('emailForm').hidden = !!pendingEmail;
    $('codeForm').hidden = !pendingEmail;
    if (user) $('cuentaEmail').textContent = user.email || '';
  }
  function friendly(err, step) {
    const m = `${err?.code ?? ''} ${err?.message ?? err}`;
    let t;
    if (/rate|too many|seconds/i.test(m)) t = 'Has pedido demasiados códigos. Espera un poco y vuelve a intentarlo.';
    else if (step === 'verify' && /expired|invalid|token|otp/i.test(m)) t = 'Código incorrecto o caducado. Pide uno nuevo.';
    else if (step === 'send' && /invalid.*email|email.*invalid|validate email/i.test(m)) t = 'Ese email no parece válido.';
    else if (/fetch|network|load failed|librería/i.test(m)) t = 'No se pudo conectar. Revisa tu conexión.';
    else if (/schema|relation|permission|PGRST/i.test(m)) t = 'La nube del diario aún no está preparada en Supabase.';
    else t = 'Algo falló al conectar con la nube.';
    return `${t} (${err?.message ?? err})`;
  }

  $('emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    if (!email) return;
    $('sendCode').disabled = true; toast('Enviando el código…');
    try {
      const { error } = await (await client()).auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
      pendingEmail = email; paint(); $('code').value = ''; $('code').focus();
      toast(`Te hemos enviado un código a ${email}. Mira también en spam.`, 'ok');
    } catch (err) { toast(friendly(err, 'send'), 'err'); }
    $('sendCode').disabled = false;
  });
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('code').value.replace(/\s+/g, '');
    if (!token) return;
    $('verify').disabled = true; toast('Comprobando…');
    try {
      const { data, error } = await (await client()).auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
      if (error) throw error;
      pendingEmail = '';
      await signedIn(data?.user || data?.session?.user);
    } catch (err) { toast(friendly(err, 'verify'), 'err'); }
    $('verify').disabled = false;
  });
  $('otherEmail').addEventListener('click', () => { pendingEmail = ''; paint(); toast(''); });
  $('syncNow').addEventListener('click', () => sync(true));
  $('signOut').addEventListener('click', async () => {
    await sync();
    try { await (await client()).auth.signOut(); } catch {}
    user = null; paint();
    toast('Sesión cerrada. Tus noches siguen en este navegador.', 'ok');
  });

  async function signedIn(u) {
    if (!u?.id) return;
    user = { id: u.id, email: u.email };
    // Otra cuenta en este navegador: sus noches no se mezclan con las de la anterior.
    if (meta.uid && meta.uid !== u.id) {
      meta = { ...blank(), uid: u.id }; saveMeta();
      App.aplicar({ vaciar: true });
    }
    paint();
    await sync(true);
  }

  // ---------- sincronía ----------
  let timer = null, running = null, again = false, lastAuto = 0;
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => sync(), ms); }

  function sync(manual = false) {
    if (!user) return Promise.resolve();
    if (running) { again = true; return running; }
    running = (async () => {
      if (manual) toast('Sincronizando…');
      try {
        await syncOnce();
        meta.ultima = new Date().toISOString(); saveMeta();
        toast(`Sincronizado a las ${hora(meta.ultima)}.`, 'ok');
      } catch (err) {
        const left = Object.keys(meta.pend).length + (meta.pendAjustes ? 1 : 0);
        toast(friendly(err) + (left ? ' Los cambios se subirán cuando vuelva la conexión.' : ''), 'err');
      } finally {
        running = null; lastAuto = Date.now();
        if (again) { again = false; schedule(500); }
      }
    })();
    return running;
  }

  async function syncOnce() {
    const h = await db();
    const first = meta.uid !== user.id;
    if (first) { meta = { ...meta, uid: user.id, cursor: null }; saveMeta(); }
    // En la primera sincronía de este navegador, todas sus noches son candidatas a subir (migración).
    if (first) {
      const now = new Date(0).toISOString();
      App.noches().forEach((n) => { if (!meta.pend[n.fecha]) meta.pend[n.fecha] = n.actualizado || now; });
      if (!meta.pendAjustes) meta.pendAjustes = App.ajustes().actualizado || now;
    }

    // 1. Traer lo que cambió en la nube. Margen de 5 s por si dos escrituras casi coinciden.
    const since = meta.cursor ? new Date(Date.parse(meta.cursor) - 5000).toISOString() : null;
    let rows = [];
    for (let from = 0; ; from += PAGE) {
      let q = h.from('nights').select('fecha,data,deleted,updated_at');
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q.order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    const incoming = [];
    let cursor = meta.cursor;
    for (const r of rows) {
      if (!cursor || r.updated_at > cursor) cursor = r.updated_at;
      const remoteT = (r.deleted ? r.data?.borrado : r.data?.actualizado) || '';
      const localT = meta.pend[r.fecha];
      // Un cambio local pendiente gana si es más reciente; si no, manda la nube.
      if (localT && localT > remoteT) continue;
      delete meta.pend[r.fecha];
      incoming.push({ fecha: r.fecha, data: r.deleted ? null : r.data });
    }
    const { data: srow, error: serr } = await h.from('settings').select('data,updated_at').maybeSingle();
    if (serr) throw serr;
    let ajustes = null;
    if (srow?.data) {
      const remoteT = srow.data.actualizado || '';
      if (!meta.pendAjustes || meta.pendAjustes <= remoteT) { ajustes = srow.data; meta.pendAjustes = null; }
    }
    if (incoming.length || ajustes) App.aplicar({ noches: incoming, ajustes });
    meta.cursor = cursor; saveMeta();

    // 2. Subir lo pendiente.
    const pend = { ...meta.pend };
    const fechas = Object.keys(pend);
    if (fechas.length) {
      const byDate = new Map(App.noches().map((n) => [n.fecha, n]));
      const up = fechas.map((f) => {
        const n = byDate.get(f);
        if (n) { const { calculado, ...data } = n; return { user_id: user.id, fecha: f, data: { ...data, actualizado: n.actualizado || pend[f] }, deleted: false }; }
        return { user_id: user.id, fecha: f, data: { fecha: f, borrado: pend[f] }, deleted: true };
      });
      for (let i = 0; i < up.length; i += 200) {
        const { error } = await h.from('nights').upsert(up.slice(i, i + 200), { onConflict: 'user_id,fecha' });
        if (error) throw error;
      }
      // Solo se quitan los que no cambiaron mientras se subían.
      fechas.forEach((f) => { if (meta.pend[f] === pend[f]) delete meta.pend[f]; });
      saveMeta();
    }
    if (meta.pendAjustes) {
      const sent = meta.pendAjustes;
      const { error } = await h.from('settings').upsert({ user_id: user.id, data: { ...App.ajustes(), actualizado: App.ajustes().actualizado || sent } }, { onConflict: 'user_id' });
      if (error) throw error;
      if (meta.pendAjustes === sent) meta.pendAjustes = null;
      saveMeta();
    }
  }

  // Al volver a la app (p. ej. del iPhone al PC), trae lo nuevo, como mucho cada 2 minutos.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && user && Date.now() - lastAuto > 120000) sync();
  });

  // ---------- arranque ----------
  paint();
  let hasSession = false;
  try { hasSession = !!localStorage.getItem(AUTH_KEY) || !!window.__nubeFalsa; } catch {}
  if (hasSession) {
    client().then(async (c) => {
      const { data } = await c.auth.getSession();
      if (data?.session?.user) await signedIn(data.session.user);
    }).catch(() => toast('No se pudo conectar con la nube. Tus noches siguen en este navegador.', 'err'));
  }
})();
