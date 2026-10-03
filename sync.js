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
const sessionFrom = j => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id, email: j.user.email } });
async function authError(r, fallback) { // mensagens do Supabase em português
  const j = await r.json().catch(() => ({})), raw = String(j.msg || j.error_description || j.message || '').toLowerCase(), code = String(j.error_code || '');
  if (/invalid login|invalid credentials/.test(raw) || code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
  if (/not confirmed/.test(raw) || code === 'email_not_confirmed') return 'Este e-mail ainda não foi confirmado: abra o e-mail de confirmação e clique no link.';
  if (/signups? (not allowed|disabled)|signup is disabled/.test(raw) || code === 'signup_disabled') return 'Novos cadastros estão desativados neste app. Use uma conta que já existe.';
  if (/already registered|already been registered/.test(raw) || code === 'user_already_exists') return 'Este e-mail já tem conta: use "Já tenho conta".';
  if (/password/.test(raw) && /(least|short|weak|characters)/.test(raw)) return 'A senha é curta ou fraca demais. Use pelo menos 8 caracteres.';
  if (/rate limit|too many|over_.*rate/.test(raw) || r.status === 429) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  return fallback + (j.msg ? ' (' + j.msg + ')' : '');
}
async function passwordSignIn(email, password) {
  const r = await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
  if (!r.ok) throw new Error(await authError(r, 'Não foi possível entrar.'));
  await finishLogin(sessionFrom(await r.json()));
}
async function passwordSignUp(email, password) { // 'ok' = já entrou; 'confirm' = precisa clicar no e-mail de confirmação
  const r = await sbFetch('/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', body: JSON.stringify({ email, password }) }, false);
  if (!r.ok) throw new Error(await authError(r, 'Não foi possível criar a conta.'));
  const j = await r.json(); if (j.access_token) { await finishLogin(sessionFrom(j)); return 'ok'; } return 'confirm';
}
async function sendPasswordReset(email) {
  const r = await sbFetch('/auth/v1/recover?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', body: JSON.stringify({ email }) }, false);
  if (!r.ok) throw new Error(await authError(r, 'Não foi possível enviar o e-mail.'));
}
async function setNewPassword(password) {
  const r = await sbFetch('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password }) });
  if (!r.ok) throw new Error(await authError(r, 'Não foi possível trocar a senha.'));
}
function newPasswordModal(title) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div style="max-width:420px"><h2>${esc(title || 'Nova senha')}</h2><form id="npf"><label>Nova senha (mínimo 8 caracteres)</label><input id="np1" type="password" autocomplete="new-password"><label>Repita a nova senha</label><input id="np2" type="password" autocomplete="new-password">
   <div id="npe" role="alert" style="color:var(--bad);min-height:1.3em;margin:6px 0"></div><div class="row"><button id="nps">Salvar senha</button><button type="button" class="sec" id="npx">Cancelar</button></div></form></div>`;
  document.body.appendChild(m); $('#npx', m).onclick = () => m.remove(); $('#np1', m).focus();
  $('#npf', m).onsubmit = async e => {
    e.preventDefault(); const a = $('#np1', m).value, b = $('#np2', m).value, err = t => $('#npe', m).textContent = t;
    if (a.length < 8) return err('Use pelo menos 8 caracteres.'); if (a !== b) return err('As duas senhas não são iguais.');
    try { await setNewPassword(a); m.remove(); toast('Senha alterada'); } catch (x) { err(x.message); }
  };
}
async function consumeAuthHash() { // volta do link do e-mail: o Supabase devolve #access_token=...
  if (!/^#(access_token|error)=/.test(location.hash) || !syncConfigured()) return;
  const p = new URLSearchParams(location.hash.slice(1)); history.replaceState(null, '', location.pathname + '#/ajustes');
  if (p.get('error')) { toast('Login falhou: ' + (p.get('error_description') || p.get('error')).replace(/\+/g, ' ')); return; }
  try {
    const at = p.get('access_token'), r = await fetch(sbUrl('/auth/v1/user'), { headers: { apikey: sbCfg().supabaseKey, Authorization: 'Bearer ' + at } }), u = await r.json();
    if (!r.ok) throw new Error('usuário não confirmado');
    await finishLogin({ access_token: at, refresh_token: p.get('refresh_token'), expires_at: Math.floor(Date.now() / 1000) + (+p.get('expires_in') || 3600), user: { id: u.id, email: u.email } });
    if (p.get('type') === 'recovery') setTimeout(() => newPasswordModal('Defina a sua nova senha'), 400);
  } catch (e) { toast('Login falhou: ' + e.message); }
}
async function wipeLocalData() { // apaga os dados DESTE aparelho (usa tx direto: não vira "exclusão" a enviar para a nuvem)
  for (const st of ['sermons', 'ilus', 'pray', 'audio']) for (const k of await tx(st, 'readonly', o => o.getAllKeys())) await tx(st, 'readwrite', o => o.delete(k));
  if (typeof snaps === 'function') for (const sn of await snaps()) await tx('backup', 'readwrite', o => o.delete(sn.id));
  ['plans', 'customDates', 'assistants', 'profile', 'syncDirty', 'syncCursor', 'syncSeq', 'syncUser', 'notified', 'lastAuto', 'lastDownload', 'folderPending'].forEach(k => localStorage.removeItem(k));
  sermons.length = 0; ilus.length = 0; pray.length = 0;
}
const hasLocalData = () => !!(sermons.length || ilus.length || pray.length || getPlans().length || getAssists().length || getCustomDates().length);
async function finishLogin(s) {
  const prev = localStorage.getItem('syncUser');
  if (prev && prev !== s.user.id && hasLocalData() && confirm('Este aparelho tem dados de OUTRA conta.\n\nOK = apagar os dados deste aparelho e entrar limpo (recomendado).\nCancelar = manter e juntar tudo à conta que está entrando.')) await wipeLocalData();
  if (localStorage.getItem('syncUser') !== s.user.id) { localStorage.removeItem('syncCursor'); localStorage.setItem('syncDirty', '{}'); } // outra conta: começa do zero
  localStorage.setItem('syncUser', s.user.id); setSession(s); await markAllDirty(); toast('Conectado como ' + s.user.email);
  route(); syncNow(); // route() também tira a tela de entrada
}
async function syncLogout() {
  try { await sbFetch('/auth/v1/logout', { method: 'POST' }); } catch { /* sem rede: sai assim mesmo */ }
  setSession(null); localStorage.removeItem('syncCursor'); localStorage.setItem('syncDirty', '{}'); setSyncStatus();
}

/* ---------- tela de entrada (e-mail e senha) ---------- */
const gateNeeded = () => syncConfigured() && sbCfg().requireLogin !== false && !getSession();
function showLoginGate(optional) {
  document.body.classList.add('gated'); let mode = 'in', busy = false, email = '';
  const T = { in: ['Entrar', 'Entre para abrir o seu acervo.'], up: ['Criar conta', 'Crie a sua conta (e-mail e senha).'], forgot: ['Enviar e-mail', 'Vamos enviar um e-mail para você definir uma nova senha.'], link: ['Enviar link', 'Receba um link de acesso por e-mail, sem senha.'] };
  const draw = (msg, ok) => {
    const pw = mode === 'in' || mode === 'up';
    app.innerHTML = `<div class="card gate"><h1 style="text-align:center;margin-top:0">✝ Pregar</h1><p class="mute" style="text-align:center">${T[mode][1]}</p>
     <form id="gf" novalidate><label for="ge">E-mail</label><input id="ge" type="email" autocomplete="username" inputmode="email" value="${esc(email)}">
     ${pw ? `<label for="gp">Senha</label><div class="row" style="flex-wrap:nowrap"><input id="gp" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}"><button type="button" class="sec" id="gs" aria-label="Mostrar ou esconder a senha">👁</button></div>` : ''}
     ${mode === 'up' ? '<label for="gp2">Repita a senha</label><input id="gp2" type="password" autocomplete="new-password"><p class="mute" style="font-size:13px">Mínimo de 8 caracteres.</p>' : ''}
     <div id="gerr" role="alert" style="margin:8px 0;min-height:1.3em;color:${ok ? 'var(--ok)' : 'var(--bad)'}">${esc(msg || '')}</div>
     <button id="gb" style="width:100%">${T[mode][0]}</button></form>
     <div class="row" style="justify-content:center;margin-top:12px;gap:8px">${mode !== 'in' ? '<button type="button" class="sec sm" data-m="in">Já tenho conta</button>' : ''}${mode !== 'up' ? '<button type="button" class="sec sm" data-m="up">Criar conta</button>' : ''}${mode === 'in' ? '<button type="button" class="sec sm" data-m="forgot">Esqueci a senha</button><button type="button" class="sec sm" data-m="link">Entrar por link</button>' : ''}${optional ? '<button type="button" class="sec sm" data-m="x">Voltar</button>' : ''}</div>
     <p class="mute" style="text-align:center;font-size:12px;margin-top:14px">Depois de entrar uma vez, o app abre também sem internet.</p></div>`;
    const f = $('#gf'), e = $('#ge'); (email ? $('#gp') || e : e).focus();
    $$('[data-m]').forEach(b => b.onclick = () => { email = e.value.trim(); if (b.dataset.m === 'x') { document.body.classList.remove('gated'); return route(); } mode = b.dataset.m; draw(); });
    if ($('#gs')) $('#gs').onclick = () => { const t = $('#gp').type === 'password' ? 'text' : 'password'; $('#gp').type = t; if ($('#gp2')) $('#gp2').type = t; };
    f.onsubmit = async ev => {
      ev.preventDefault(); if (busy) return; email = e.value.trim(); const pw1 = $('#gp') ? $('#gp').value : '', pw2 = $('#gp2') ? $('#gp2').value : '';
      if (!/^\S+@\S+\.\S+$/.test(email)) return draw('Digite um e-mail válido.');
      if (pw && !pw1) return draw('Digite a senha.');
      if (mode === 'up') { if (pw1.length < 8) return draw('Use pelo menos 8 caracteres na senha.'); if (pw1 !== pw2) return draw('As duas senhas não são iguais.'); }
      if (!navigator.onLine) return draw('Sem internet. Para entrar é preciso estar conectado.');
      busy = true; $('#gb').disabled = true; $('#gb').textContent = 'Aguarde…';
      try {
        if (mode === 'in') await passwordSignIn(email, pw1);
        else if (mode === 'up') { if (await passwordSignUp(email, pw1) === 'confirm') { busy = false; mode = 'in'; return draw('Conta criada. Enviamos um e-mail de confirmação: clique no link dele e depois entre aqui.', true); } }
        else if (mode === 'forgot') { await sendPasswordReset(email); busy = false; return draw('Se esse e-mail tiver conta, o link para definir a nova senha foi enviado. Olhe também o spam.', true); }
        else { await sendLoginLink(email); busy = false; return draw('Link enviado. Abra o e-mail neste aparelho e clique nele.', true); }
      } catch (x) { busy = false; draw(x.message); }
    };
  };
  draw();
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
    box.innerHTML = `<p class="mute">Entre com e-mail e senha para sincronizar suas pregações entre o computador e o tablet. ⚠ Ao entrar, o que está neste aparelho é enviado para a conta.</p><button id="sgo">Entrar ou criar conta</button>`;
    $('#sgo', box).onclick = () => showLoginGate(true); return;
  }
  const st = { ok: 'sincronizado', busy: 'sincronizando…', offline: 'sem conexão (as mudanças ficam guardadas e seguem quando voltar)', auth: 'precisa entrar de novo', error: 'erro: ' + syncState.error, idle: 'aguardando' }[syncState.kind];
  box.innerHTML = `<div class="row"><span>✅ Conectado como <b>${esc(s.user.email)}</b></span></div>
   <p class="mute">Estado: ${esc(st)}${syncState.at ? ' · última sincronização ' + new Date(syncState.at).toLocaleTimeString('pt-BR') : ''} · ${pending} mudança(s) para enviar.<br>Sincroniza: pregações (com seus materiais), ilustrações, pedidos de oração, planos de leitura, datas próprias, seus assistentes e o perfil do pregador. Não sincroniza: gravações de áudio e as configurações do aparelho (teclas, tema).</p>
   <div class="row"><button id="sn2">Sincronizar agora</button><button class="sec" id="sa">Reenviar tudo</button><button class="sec" id="spw">Alterar senha</button><button class="sec" id="so">Sair</button></div>`;
  $('#spw', box).onclick = () => newPasswordModal('Alterar senha');
  $('#sn2', box).onclick = syncNow;
  $('#sa', box).onclick = async () => { await markAllDirty(); syncNow(); };
  $('#so', box).onclick = async () => {
    if (!confirm('Sair da conta neste aparelho?\n\nO app voltará a pedir e-mail e senha.')) return;
    let wipe = hasLocalData() && confirm('Apagar também as pregações e dados guardados NESTE aparelho?\n\nOK = apagar (recomendado se o aparelho é compartilhado; tudo continua na nuvem).\nCancelar = manter os dados aqui.');
    if (wipe) { try { await syncCore.run(); } catch { /* sem rede */ } if (Object.keys(dirtyGet()).length) { alert('Há mudanças que ainda NÃO foram enviadas para a nuvem (sem internet?). Por segurança não vou apagar nada. Tente de novo com internet.'); wipe = false; } }
    await syncLogout(); if (wipe) await wipeLocalData(); toast(wipe ? 'Saiu e apagou os dados deste aparelho' : 'Saiu (os dados continuam neste aparelho)'); route();
  };
}
