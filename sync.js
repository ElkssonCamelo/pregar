'use strict';
/* Sincronização com o Supabase (login por e-mail + tabela "items"). Carregado depois de app.js e synccore.js.
   Offline-first: tudo continua funcionando sem conta/internet; ao entrar, o que mudou é enviado e o que veio de outro aparelho é aplicado. */

/* ---------- configuração e sessão ---------- */
const sbCfg = () => window.PREGAR_CONFIG || {};
const syncConfigured = () => !!(sbCfg().supabaseUrl && sbCfg().supabaseKey);
const getSession = () => JSON.parse(localStorage.getItem('sbSession') || 'null');
const setSession = s => s ? localStorage.setItem('sbSession', JSON.stringify(s)) : localStorage.removeItem('sbSession');
const sbUrl = p => sbCfg().supabaseUrl.replace(/\/$/, '') + p;
class SyncAuthError extends Error {}

async function refreshSession() {
  const s = getSession(); if (!s || !s.refresh_token) throw new SyncAuthError('sessão expirada');
  const r = await fetch(sbUrl('/auth/v1/token?grant_type=refresh_token'), { method: 'POST', headers: { apikey: sbCfg().supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
  if (!r.ok) { if (r.status === 400 || r.status === 401) { setSession(null); throw new SyncAuthError('sessão expirada'); } throw new Error('falha ao renovar sessão (' + r.status + ')'); }
  const j = await r.json(); const n = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: j.user ? { id: j.user.id, email: j.user.email } : s.user };
  setSession(n); return n;
}
async function freshSession() { const s = getSession(); if (!s) return null; return s.expires_at - Date.now() / 1000 < 60 ? refreshSession() : s; }
async function sbFetch(path, opt = {}, auth = true, retry = true) {
  const h = { apikey: sbCfg().supabaseKey, 'Content-Type': 'application/json', ...(opt.headers || {}) };
  if (auth) { const s = await freshSession(); if (!s) throw new SyncAuthError('sem login'); h.Authorization = 'Bearer ' + s.access_token; }
  const r = await fetch(sbUrl(path), { ...opt, headers: h });
  if (r.status === 401 && auth && retry) { await refreshSession(); return sbFetch(path, opt, auth, false); }
  return r;
}
async function sendLoginLink(email) {
  const redirect = location.origin + location.pathname;
  const r = await sbFetch('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', body: JSON.stringify({ email, create_user: true }) }, false);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).msg || 'não foi possível enviar o e-mail (' + r.status + ')');
}
async function verifyLoginCode(email, token) {
  const r = await sbFetch('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email, token }) }, false);
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.access_token) throw new Error(j.msg || j.error_description || 'código inválido ou expirado');
  await finishLogin({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id, email: j.user.email } });
}
async function consumeAuthHash() { // volta do link do e-mail: o Supabase devolve #access_token=...
  if (!/^#(access_token|error)=/.test(location.hash) || !syncConfigured()) return;
  const p = new URLSearchParams(location.hash.slice(1)); history.replaceState(null, '', location.pathname + '#/ajustes');
  if (p.get('error')) { toast('Login falhou: ' + (p.get('error_description') || p.get('error')).replace(/\+/g, ' ')); return; }
  try {
    const at = p.get('access_token'), r = await fetch(sbUrl('/auth/v1/user'), { headers: { apikey: sbCfg().supabaseKey, Authorization: 'Bearer ' + at } }), u = await r.json();
    if (!r.ok) throw new Error('usuário não confirmado');
    await finishLogin({ access_token: at, refresh_token: p.get('refresh_token'), expires_at: Math.floor(Date.now() / 1000) + (+p.get('expires_in') || 3600), user: { id: u.id, email: u.email } });
  } catch (e) { toast('Login falhou: ' + e.message); }
}
async function finishLogin(s) {
  if (localStorage.getItem('syncUser') !== s.user.id) { localStorage.removeItem('syncCursor'); localStorage.setItem('syncDirty', '{}'); } // outra conta: começa do zero
  localStorage.setItem('syncUser', s.user.id); setSession(s); markAllDirty(); toast('Conectado como ' + s.user.email);
  if (location.hash.startsWith('#/ajustes')) ajustes(); syncNow();
}
async function syncLogout() {
  try { await sbFetch('/auth/v1/logout', { method: 'POST' }); } catch { /* sem rede: sai assim mesmo */ }
  setSession(null); localStorage.removeItem('syncCursor'); localStorage.setItem('syncDirty', '{}'); setSyncStatus(); toast('Desconectado (seus dados continuam neste aparelho)');
}

/* ---------- o que mudou (itens "sujos") ---------- */
const dirtyGet = () => JSON.parse(localStorage.getItem('syncDirty') || '{}');
const dirtySet = d => localStorage.setItem('syncDirty', JSON.stringify(d));
let dirtySeq = +localStorage.getItem('syncSeq') || 0, remoteChanged = 0;
const nextSeq = () => { localStorage.setItem('syncSeq', ++dirtySeq); return dirtySeq; };
function syncMark(kind, item) { // chamado por dbPut: carimba a edição e agenda o envio
  if (!getSession()) return;
  item.updatedAt = Date.now(); const d = dirtyGet(); d[kind + '|' + item.id] = { kind, id: item.id, seq: nextSeq() }; dirtySet(d); syncSoon();
}
function syncMarkDel(kind, id) {
  if (!getSession()) return;
  const d = dirtyGet(); d[kind + '|' + id] = { kind, id, del: true, at: Date.now(), seq: nextSeq() }; dirtySet(d); syncSoon();
}
function syncList(kind, oldList, newList) { // planos e datas próprias vivem em localStorage como lista: compara item a item
  if (!getSession()) return;
  const old = new Map(oldList.map(x => [x.id, x])), strip = x => JSON.stringify({ ...x, updatedAt: 0 });
  for (const x of newList) { const o = old.get(x.id); if (!o || strip(o) !== strip(x)) syncMark(kind, x); old.delete(x.id); }
  for (const id of old.keys()) syncMarkDel(kind, id);
}
async function markAllDirty() { // ao entrar: tudo que existe neste aparelho vai para a conta (o mais novo vence; nada é apagado)
  const d = dirtyGet(), put = { sermon: 'sermons', ilus: 'ilus', pray: 'pray' };
  const all = [['sermon', sermons], ['ilus', ilus], ['pray', pray], ['plan', getPlans()], ['cdate', getCustomDates()], ['assist', getAssists()], ['profile', getProfileList()]];
  for (const [kind, list] of all) for (const it of list) {
    if (!it.updatedAt) { it.updatedAt = it.createdAt || Date.now(); if (put[kind]) await tx(put[kind], 'readwrite', o => o.put(it)); }
    d[kind + '|' + it.id] = { kind, id: it.id, seq: nextSeq() };
  }
  const pl = getPlans(), cd = getCustomDates(); if (pl.some(x => x.updatedAt)) localStorage.setItem('plans', JSON.stringify(pl)); if (cd.length) localStorage.setItem('customDates', JSON.stringify(cd));
  const as = getAssists(), pf = getProfileList(); if (as.length) localStorage.setItem('assistants', JSON.stringify(as)); if (pf.length) localStorage.setItem('profile', JSON.stringify(pf));
  dirtySet(d);
}

/* ---------- ligação do núcleo com o app ---------- */
const syncStore = {
  getDirty: dirtyGet,
  dropDirty: k => { const d = dirtyGet(); delete d[k]; dirtySet(d); },
  clearDirty: sent => { const d = dirtyGet(); sent.forEach(([k, s]) => { if (d[k] && d[k].seq === s) delete d[k]; }); dirtySet(d); },
  getCursor: () => localStorage.getItem('syncCursor'),
  setCursor: c => { if (c) localStorage.setItem('syncCursor', c); },
  get(kind, id) { return ({ sermon: sermons, ilus, pray, plan: getPlans(), cdate: getCustomDates(), assist: getAssists(), profile: getProfileList() })[kind].find(x => x.id === id); },
  async apply(kind, id, item) { // grava o que veio de outro aparelho SEM disparar nova sincronização (usa tx direto, não dbPut)
    remoteChanged++;
    const mem = { sermon: [sermons, 'sermons'], ilus: [ilus, 'ilus'], pray: [pray, 'pray'] }[kind];
    if (mem) {
      const [arr, store] = mem, i = arr.findIndex(x => x.id === id);
      if (item === null) { if (i >= 0) arr.splice(i, 1); await tx(store, 'readwrite', o => o.delete(id)); if (kind === 'sermon') await tx('audio', 'readwrite', o => o.delete(id)); }
      else { if (i >= 0) arr[i] = item; else arr.push(item); await tx(store, 'readwrite', o => o.put(item)); }
    } else {
      const key = { plan: 'plans', cdate: 'customDates', assist: 'assistants', profile: 'profile' }[kind], list = JSON.parse(localStorage.getItem(key) || '[]'), i = list.findIndex(x => x.id === id);
      if (item === null) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = item; else list.push(item);
      localStorage.setItem(key, JSON.stringify(list));
    }
  }
};
function makeRestTransport() {
  return {
    async push(rows) {
      const uid = getSession().user.id; let batch = [], size = 0;
      const send = async () => { if (!batch.length) return; const r = await sbFetch('/rest/v1/items?on_conflict=user_id,kind,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) }); if (!r.ok) throw new Error('envio falhou (' + r.status + '): ' + (await r.text()).slice(0, 200)); batch = []; size = 0; };
      for (const r of rows) { const row = { ...r, user_id: uid }, n = JSON.stringify(row).length; if (batch.length && size + n > 2e6) await send(); batch.push(row); size += n; }
      await send();
    },
    async pull(since, limit, offset) {
      let q = `/rest/v1/items?select=kind,id,data,deleted,updated_at,server_ts&order=server_ts.asc,kind.asc,id.asc&limit=${limit}&offset=${offset}`;
      if (since) q += '&server_ts=gt.' + encodeURIComponent(since);
      const r = await sbFetch(q); if (!r.ok) throw new Error('download falhou (' + r.status + ')'); return r.json();
    }
  };
}
let syncTransport = makeRestTransport();
const syncSetTransport = t => { syncTransport = t; }; // para testes
const syncCore = SyncCore.createSync({ store: syncStore, transport: { push: (...a) => syncTransport.push(...a), pull: (...a) => syncTransport.pull(...a) } });

/* ---------- execução, agendamento e estado ---------- */
let syncTimer = null, syncState = { kind: 'idle', at: null, error: '' };
const syncSoon = () => { if (!getSession()) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 2500); };
function setSyncStatus(kind, error) {
  syncState = { kind: kind || 'idle', at: kind === 'ok' ? Date.now() : syncState.at, error: error || '' };
  const el = $('#syncst'); if (!el) return;
  const t = { ok: '☁ sincronizado', busy: '⟳ sincronizando…', offline: '⚠ sem conexão', auth: '⚠ entre de novo', error: '⚠ erro de sincronização' }[syncState.kind];
  el.textContent = getSession() && t ? t : ''; el.title = syncState.error || '';
  const box = $('#syncbox'); if (box && location.hash.startsWith('#/ajustes')) renderSyncBox(box);
}
async function syncNow() {
  if (!syncConfigured() || !getSession()) return;
  if (!navigator.onLine) return setSyncStatus('offline');
  setSyncStatus('busy'); remoteChanged = 0;
  try {
    await syncCore.run(); setSyncStatus('ok');
    if (remoteChanged) { toast(`${remoteChanged} item(ns) atualizado(s) de outro aparelho`); refreshAfterRemote(); }
  } catch (e) {
    console.warn('sincronização', e);
    setSyncStatus(e instanceof SyncAuthError ? 'auth' : (e instanceof TypeError || !navigator.onLine) ? 'offline' : 'error', e.message);
  }
}
function refreshAfterRemote() { // não interrompe quem está pregando nem digitando
  const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (!/^#\/pregar\//.test(location.hash) && !typing && !$('.modal')) route();
}
function syncStart() {
  consumeAuthHash(); setSyncStatus(getSession() ? 'idle' : undefined);
  if (getSession()) syncNow();
  addEventListener('online', syncNow); addEventListener('offline', () => setSyncStatus('offline'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  setInterval(syncNow, 3 * 60 * 1000);
}

/* ---------- área "Conta e sincronização" (tela Ajustes) ---------- */
function renderSyncBox(box) {
  const s = getSession(), pending = Object.keys(dirtyGet()).length;
  if (!syncConfigured()) { box.innerHTML = '<p class="mute">A sincronização entre aparelhos ainda <b>não está ligada</b> neste app (falta configurar o projeto Supabase em <code>config.js</code>). Enquanto isso, use o backup para levar suas pregações de um aparelho para outro.</p>'; return; }
  if (!s) {
    box.innerHTML = `<p class="mute">Entre com seu e-mail para sincronizar suas pregações entre o computador e o tablet. Não há senha: você recebe um link no e-mail. ⚠ Ao entrar, o que está neste aparelho é enviado para a conta.</p>
     <div class="row"><input id="se" type="email" placeholder="seu@email.com" style="flex:1;min-width:220px" autocomplete="email"><button id="ss">Enviar link de acesso</button></div>
     <div class="row" style="margin-top:8px"><input id="sc" inputmode="numeric" placeholder="código de 6 dígitos (se vier no e-mail)" style="flex:1;min-width:220px"><button class="sec" id="sv">Entrar com o código</button></div>`;
    $('#ss', box).onclick = async () => { const e = $('#se', box).value.trim(); if (!e) return toast('Digite o e-mail'); try { await sendLoginLink(e); toast('Link enviado. Abra o e-mail NESTE aparelho.'); } catch (err) { toast(err.message); } };
    $('#sv', box).onclick = async () => { try { await verifyLoginCode($('#se', box).value.trim(), $('#sc', box).value.trim()); } catch (err) { toast(err.message); } };
    return;
  }
  const st = { ok: 'sincronizado', busy: 'sincronizando…', offline: 'sem conexão (as mudanças ficam guardadas e seguem quando voltar)', auth: 'precisa entrar de novo', error: 'erro: ' + syncState.error, idle: 'aguardando' }[syncState.kind];
  box.innerHTML = `<div class="row"><span>✅ Conectado como <b>${esc(s.user.email)}</b></span></div>
   <p class="mute">Estado: ${esc(st)}${syncState.at ? ' · última sincronização ' + new Date(syncState.at).toLocaleTimeString('pt-BR') : ''} · ${pending} mudança(s) para enviar.<br>Sincroniza: pregações (com seus materiais), ilustrações, pedidos de oração, planos de leitura, datas próprias, seus assistentes e o perfil do pregador. Não sincroniza: gravações de áudio e as configurações do aparelho (teclas, tema).</p>
   <div class="row"><button id="sn2">Sincronizar agora</button><button class="sec" id="sa">Reenviar tudo</button><button class="sec" id="so">Sair</button></div>`;
  $('#sn2', box).onclick = syncNow;
  $('#sa', box).onclick = async () => { await markAllDirty(); syncNow(); };
  $('#so', box).onclick = async () => { if (confirm('Sair da conta neste aparelho? Seus dados continuam aqui.')) { await syncLogout(); renderSyncBox(box); } };
}
