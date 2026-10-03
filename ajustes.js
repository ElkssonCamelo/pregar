'use strict';
/* Ajustes: controle por teclado/pedal e backup automático. Carregado depois de app.js (usa suas funções e estado). */

/* ========== teclado e pedal ========== */
const ACTIONS = { slideNext: 'Próximo slide', slidePrev: 'Slide anterior', topicNext: 'Próximo tópico', topicPrev: 'Tópico anterior', timerToggle: 'Iniciar / pausar cronômetro', black: 'Tela preta (liga / desliga)', bible: 'Abrir a Bíblia' };
const DEFAULT_KEYS = { slideNext: ['ArrowRight', 'PageDown'], slidePrev: ['ArrowLeft', 'PageUp'], topicNext: ['ArrowDown'], topicPrev: ['ArrowUp'], timerToggle: [' '], black: ['b'], bible: ['g'] };
const getKeys = () => ({ ...DEFAULT_KEYS, ...JSON.parse(localStorage.getItem('keymap') || '{}') });
const setKeys = k => localStorage.setItem('keymap', JSON.stringify(k));
const normKey = k => k.length === 1 ? k.toLowerCase() : k;
const keyLabel = k => ({ ' ': 'Espaço', ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓' }[k] || k);
const actionFor = key => { const km = getKeys(), k = normKey(key); return Object.keys(km).find(a => km[a].includes(k)); };
function handleKey(key) { const a = actionFor(key); if (a && kbActions[a]) { kbActions[a](); return true; } return false; }
let capturing = null; // ação que está "aprendendo" a próxima tecla
let lastKeyText = '—';
addEventListener('keydown', e => {
  lastKeyText = `${keyLabel(e.key)} (código: ${e.code || '—'})`; const lk = $('#lk'); if (lk) lk.textContent = lastKeyText;
  if (capturing) {
    e.preventDefault(); const a = capturing; capturing = null;
    if (e.key !== 'Escape') { const km = getKeys(), k = normKey(e.key); Object.keys(km).forEach(x => km[x] = km[x].filter(y => y !== k)); km[a] = [...km[a], k]; setKeys(km); toast(`${keyLabel(e.key)} → ${ACTIONS[a]}`); }
    ajustes(); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches && e.target.matches('input,textarea,select,[contenteditable="true"]')) return;
  const a = actionFor(e.key); if (a && kbActions[a]) { e.preventDefault(); kbActions[a](); }
});

/* ========== backup ========== */
const bkpCfg = () => ({ auto: true, freq: 'daily', keep: 7, ...JSON.parse(localStorage.getItem('bkpCfg') || '{}') });
const buildBackup = () => ({ app: 'pregar', at: new Date().toISOString(), sermons, ilus, pray, plans: getPlans(), customDates: getCustomDates(), assistants: getAssists(), profile: getProfileList() });
async function applyBackup(j) { // mescla por id (o que vem do backup substitui o igual)
  if (!j || !Array.isArray(j.sermons)) throw new Error('arquivo inválido');
  const merge = async (arr, list, store) => { for (const x of list || []) { const i = arr.findIndex(y => y.id === x.id); if (i >= 0) arr[i] = x; else arr.push(x); await dbPut(store, x); } };
  await merge(sermons, j.sermons, 'sermons'); await merge(ilus, j.ilus, 'ilus'); await merge(pray, j.pray, 'pray');
  if (Array.isArray(j.customDates)) { const cur = getCustomDates(); j.customDates.forEach(d => { if (!cur.some(x => x.id === d.id)) cur.push(d); }); setCustomDates(cur); }
  if (Array.isArray(j.assistants)) { const cur = getAssists(); j.assistants.forEach(x => { const k = cur.findIndex(y => y.id === x.id); if (k >= 0) cur[k] = x; else cur.push(x); }); setAssists(cur); }
  if (Array.isArray(j.profile) && j.profile[0] && !getProfileList().length) setProfile(j.profile[0]);
  if (Array.isArray(j.plans)) { const cur = getPlans(); j.plans.forEach(p => { const k = cur.findIndex(x => x.id === p.id); if (k >= 0) cur[k] = p; else cur.push(p); }); setPlans(cur); }
  return j.sermons.length;
}
function downloadJSON(obj, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })); a.download = name; a.click(); }
function downloadBackup() { downloadJSON(buildBackup(), `pregar-backup-${todayISO()}.json`); localStorage.setItem('lastDownload', new Date().toISOString()); toast('Backup baixado'); }

const snaps = async () => (await dbAll('backup')).filter(v => v && v.kind === 'snap').sort((a, b) => b.at.localeCompare(a.at));
async function makeSnapshot() {
  const data = buildBackup(), snap = { id: 'snap|' + Date.now(), kind: 'snap', at: data.at, counts: { s: data.sermons.length, i: data.ilus.length, p: data.pray.length }, data };
  await dbPut('backup', snap, snap.id);
  const old = (await snaps()).slice(bkpCfg().keep); for (const o of old) await dbDel('backup', o.id);
  return snap;
}
async function folderHandle() { return dbGet('backup', 'dir'); }
async function writeToFolder(name, text) { // 'ok' | 'none' (sem pasta) | 'perm' (precisa autorizar) | 'error'
  try {
    const h = await folderHandle(); if (!h) return 'none';
    if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return 'perm';
    const w = await (await h.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
    const names = []; for await (const [n] of h.entries()) if (/^pregar-backup-.*\.json$/.test(n)) names.push(n);
    for (const n of names.sort().reverse().slice(bkpCfg().keep)) await h.removeEntry(n).catch(() => {});
    return 'ok';
  } catch (e) { console.warn('backup em pasta falhou', e); return 'error'; }
}
async function autoBackup(force) {
  const c = bkpCfg(); if (!c.auto && !force) return null;
  if (!sermons.length && !ilus.length && !pray.length) return null;
  const last = localStorage.getItem('lastAuto') || '';
  const due = force || !last || (c.freq === 'daily' ? last.slice(0, 10) !== todayISO() : Date.now() - new Date(last) >= 7 * 864e5);
  if (!due) return null;
  const snap = await makeSnapshot(); localStorage.setItem('lastAuto', new Date().toISOString());
  const folder = await writeToFolder(`pregar-backup-${todayISO()}.json`, JSON.stringify(snap.data));
  localStorage.setItem('folderPending', folder === 'perm' ? '1' : '');
  return { snap, folder };
}
function backupBanners() { // avisos na tela inicial
  const out = [], days = Math.floor((Date.now() - new Date(localStorage.getItem('lastDownload') || localStorage.getItem('firstUse') || Date.now())) / 864e5);
  if (localStorage.getItem('folderPending')) out.push(`<div class="banner" style="background:#a0522d"><span>💾 O backup em pasta precisa da sua autorização.</span><a class="btn" id="bkperm">Autorizar</a></div>`);
  else if (!localStorage.getItem('hasFolder') && days >= 14 && (sermons.length || ilus.length)) out.push(`<div class="banner" style="background:#a0522d"><span>💾 Faz ${days} dias sem baixar um backup.</span><a class="btn" id="bknow">Baixar agora</a></div>`);
  return out.join('');
}
function bindBackupBanners() {
  const n = $('#bknow'); if (n) n.onclick = () => { downloadBackup(); route(); };
  const p = $('#bkperm'); if (p) p.onclick = async () => { const h = await folderHandle(); if (h && (await h.requestPermission({ mode: 'readwrite' })) === 'granted') { await autoBackup(true); toast('Backup salvo na pasta'); } route(); };
}
if (!localStorage.getItem('firstUse')) localStorage.setItem('firstUse', new Date().toISOString());

/* ========== tela Ajustes ========== */
async function ajustes() {
  const km = getKeys(), c = bkpCfg(), list = await snaps(), h = await folderHandle(), canPick = !!window.showDirectoryPicker;
  let perm = ''; if (h) { try { perm = await h.queryPermission({ mode: 'readwrite' }); } catch { perm = 'erro'; } }
  const last = localStorage.getItem('lastAuto');
  app.innerHTML = `<h1>Ajustes</h1>
  <h2>Teclado e pedal</h2><div class="card">
   <p class="mute">Valem no modo pregação e na tela de slides. Pedais e controles Bluetooth costumam enviar setas ou PageUp/PageDown: pareie no sistema, clique em “+ tecla” e aperte o pedal. Funciona também com a janela do projetor em foco.</p>
   ${Object.entries(ACTIONS).map(([a, n]) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1;min-width:170px">${n}</span>
     ${km[a].map(k => `<span class="tag">${esc(keyLabel(k))} <a data-rk="${a}|${esc(k)}" style="cursor:pointer">✕</a></span>`).join('') || '<span class="mute">sem tecla</span>'}
     <button class="sec sm" data-ck="${a}">${capturing === a ? 'aperte uma tecla…' : '+ tecla'}</button></div>`).join('')}
   <div class="row" style="margin-top:10px"><span class="mute">Última tecla detectada: <b id="lk">${esc(lastKeyText)}</b></span><button class="sec sm" id="kr" style="margin-left:auto">Restaurar padrão</button></div></div>
  <h2>Perfil do pregador</h2><div class="card" id="profilebox"></div>
  <h2>Conta e sincronização</h2><div class="card" id="syncbox"></div>
  <h2>Backup automático</h2><div class="card">
   <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="ba" style="width:auto" ${c.auto ? 'checked' : ''}> Criar pontos de restauração automaticamente ao abrir o app</label>
   <div class="grid"><div><label>Frequência</label><select id="bf"><option value="daily" ${c.freq === 'daily' ? 'selected' : ''}>Diária</option><option value="weekly" ${c.freq === 'weekly' ? 'selected' : ''}>Semanal</option></select></div>
   <div><label>Quantos guardar</label><select id="bk2">${[3, 7, 14, 30].map(n => `<option ${c.keep === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
   <p class="mute">Último automático: ${last ? new Date(last).toLocaleString('pt-BR') : 'nunca'}. ⚠ Os pontos de restauração ficam <b>no mesmo navegador</b>: protegem de apagões e erros, mas não se você limpar os dados do site ou trocar de aparelho. Para isso use a pasta abaixo ou baixe o arquivo.</p>
   <h3 style="margin:12px 0 4px">Pasta de backup (cópia fora do navegador)</h3>
   ${canPick ? `<div class="row"><span>${h ? `📁 <b>${esc(h.name)}</b> — ${perm === 'granted' ? 'autorizada' : 'precisa autorizar'}` : 'Nenhuma pasta escolhida'}</span>
     <button class="sec sm" id="bp">${h ? 'Trocar pasta' : 'Escolher pasta'}</button>${h && perm !== 'granted' ? '<button class="sm" id="bg">Autorizar</button>' : ''}${h ? '<button class="sec sm" id="br">Remover</button>' : ''}</div>
     <p class="mute">Ideal: uma pasta do OneDrive, Google Drive ou Dropbox. O app grava um arquivo por dia e apaga os mais antigos. O navegador pode pedir autorização de novo a cada sessão.</p>`
     : '<p class="mute">Este navegador não permite escolher uma pasta (disponível no Chrome e Edge, no computador). Use o botão “Baixar backup”.</p>'}
   <div class="row" style="margin-top:10px"><button id="bn">Fazer backup agora</button><button class="sec" id="bd">⬇ Baixar backup</button></div>
   <h3 style="margin:14px 0 4px">Pontos de restauração (${list.length})</h3>
   ${list.length ? list.map(s => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1">${new Date(s.at).toLocaleString('pt-BR')} <span class="mute">· ${s.counts.s} pregações, ${s.counts.i} ilustrações, ${s.counts.p} pedidos</span></span>
     <button class="sm sec" data-rs="${s.id}">Restaurar</button><button class="sm sec" data-dl="${s.id}">Baixar</button><button class="sm del" data-rm="${s.id}">Excluir</button></div>`).join('') : '<p class="mute">Nenhum ainda.</p>'}</div>`;
  $$('[data-ck]').forEach(b => b.onclick = () => { capturing = b.dataset.ck; ajustes(); });
  $$('[data-rk]').forEach(b => b.onclick = () => { const [a, k] = b.dataset.rk.split('|'), m = getKeys(); m[a] = m[a].filter(x => x !== k); setKeys(m); ajustes(); });
  $('#kr').onclick = () => { localStorage.removeItem('keymap'); ajustes(); };
  if (typeof renderProfileBox === 'function') renderProfileBox($('#profilebox'));
  if (typeof renderSyncBox === 'function') renderSyncBox($('#syncbox'));
  const save = () => { localStorage.setItem('bkpCfg', JSON.stringify({ auto: $('#ba').checked, freq: $('#bf').value, keep: +$('#bk2').value })); };
  ['ba', 'bf', 'bk2'].forEach(i => $('#' + i).onchange = save);
  if ($('#bp')) $('#bp').onclick = async () => { try { const d = await showDirectoryPicker({ mode: 'readwrite' }); await dbPut('backup', d, 'dir'); localStorage.setItem('hasFolder', '1'); localStorage.setItem('folderPending', ''); toast('Pasta definida'); } catch { /* cancelado */ } ajustes(); };
  if ($('#bg')) $('#bg').onclick = async () => { await h.requestPermission({ mode: 'readwrite' }); localStorage.setItem('folderPending', ''); ajustes(); };
  if ($('#br')) $('#br').onclick = async () => { await dbDel('backup', 'dir'); localStorage.removeItem('hasFolder'); localStorage.setItem('folderPending', ''); ajustes(); };
  $('#bn').onclick = async () => { const r = await autoBackup(true); toast(r ? `Ponto criado${r.folder === 'ok' ? ' e salvo na pasta' : r.folder === 'perm' ? ' (pasta precisa de autorização)' : ''}` : 'Nada para salvar ainda'); ajustes(); };
  $('#bd').onclick = downloadBackup;
  app.onclick = async e => {
    const rs = e.target.dataset.rs, dl = e.target.dataset.dl, rm = e.target.dataset.rm; if (!rs && !dl && !rm) return;
    const s = list.find(x => x.id === (rs || dl || rm));
    if (dl) downloadJSON(s.data, `pregar-ponto-${s.at.slice(0, 10)}.json`);
    if (rm && confirm('Excluir este ponto de restauração?')) { await dbDel('backup', s.id); ajustes(); }
    if (rs && confirm(`Restaurar o ponto de ${new Date(s.at).toLocaleString('pt-BR')}? O conteúdo dele será mesclado e substituirá itens com o mesmo identificador (itens criados depois não são apagados).`)) { const n = await applyBackup(s.data); toast(n + ' pregações restauradas'); ajustes(); }
  };
}
