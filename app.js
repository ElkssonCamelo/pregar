'use strict';
/* ========== utilidades ========== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const fmtDate = d => d ? new Date(d + 'T12:00').toLocaleDateString('pt-BR') : '';
const mmss = s => String(Math.floor(Math.abs(s) / 60)).padStart(2, '0') + ':' + String(Math.abs(s) % 60).padStart(2, '0');
const todayISO = () => new Date().toISOString().slice(0, 10);
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); }
const debounce = (f, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

/* ========== armazenamento (IndexedDB) ========== */
const DB = new Promise((res, rej) => {
  const r = indexedDB.open('pregar', 4);
  r.onupgradeneeded = () => {
    const d = r.result, has = n => d.objectStoreNames.contains(n);
    if (!has('sermons')) d.createObjectStore('sermons', { keyPath: 'id' });
    if (!has('audio')) d.createObjectStore('audio');
    if (!has('bible')) d.createObjectStore('bible');
    if (!has('ilus')) d.createObjectStore('ilus', { keyPath: 'id' });
    if (!has('pray')) d.createObjectStore('pray', { keyPath: 'id' });
    if (!has('backup')) d.createObjectStore('backup');
  };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (s, m, f) => { const d = await DB; return new Promise((res, rej) => { const t = d.transaction(s, m); const r = f(t.objectStore(s)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
const dbAll = s => tx(s, 'readonly', o => o.getAll());
const dbGet = (s, k) => tx(s, 'readonly', o => o.get(k));
const SYNC_KIND = { sermons: 'sermon', ilus: 'ilus', pray: 'pray' }; // lojas que sincronizam (sync.js)
const dbPut = (s, v, k) => { if (SYNC_KIND[s] && typeof syncMark === 'function') syncMark(SYNC_KIND[s], v); return tx(s, 'readwrite', o => k === undefined ? o.put(v) : o.put(v, k)); };
const dbDel = (s, k) => { if (SYNC_KIND[s] && typeof syncMarkDel === 'function') syncMarkDel(SYNC_KIND[s], k); return tx(s, 'readwrite', o => o.delete(k)); };

let sermons = [], ilus = [], pray = [];
const getS = id => sermons.find(s => s.id === id);
async function saveS(s) { s.updatedAt = Date.now(); if (!getS(s.id)) sermons.push(s); await dbPut('sermons', s); }
const blank = () => ({ id: uid(), title: '', baseText: '', series: '', folder: '', tags: [], date: todayISO(), time: '', place: '', audience: '', planned: 30, real: null, status: 'rascunho', intro: '', topics: [], conclusion: '', postNotes: '', slides: [], checks: {}, createdAt: Date.now() });
const blankTopic = () => ({ id: uid(), title: '', verses: '', min: null, keyphrase: '', quote: '', list: '', notes: '', application: '', illustration: '' });

/* ========== Bíblia (bible-api.com, cache offline no IndexedDB) ========== */
const BOOKS = [['Gênesis','Genesis'],['Êxodo','Exodus'],['Levítico','Leviticus'],['Números','Numbers'],['Deuteronômio','Deuteronomy'],['Josué','Joshua'],['Juízes','Judges'],['Rute','Ruth'],['1 Samuel','1 Samuel'],['2 Samuel','2 Samuel'],['1 Reis','1 Kings'],['2 Reis','2 Kings'],['1 Crônicas','1 Chronicles'],['2 Crônicas','2 Chronicles'],['Esdras','Ezra'],['Neemias','Nehemiah'],['Ester','Esther'],['Jó','Job'],['Salmos','Psalms'],['Provérbios','Proverbs'],['Eclesiastes','Ecclesiastes'],['Cantares','Song of Solomon'],['Isaías','Isaiah'],['Jeremias','Jeremiah'],['Lamentações','Lamentations'],['Ezequiel','Ezekiel'],['Daniel','Daniel'],['Oseias','Hosea'],['Joel','Joel'],['Amós','Amos'],['Obadias','Obadiah'],['Jonas','Jonah'],['Miqueias','Micah'],['Naum','Nahum'],['Habacuque','Habakkuk'],['Sofonias','Zephaniah'],['Ageu','Haggai'],['Zacarias','Zechariah'],['Malaquias','Malachi'],['Mateus','Matthew'],['Marcos','Mark'],['Lucas','Luke'],['João','John'],['Atos','Acts'],['Romanos','Romans'],['1 Coríntios','1 Corinthians'],['2 Coríntios','2 Corinthians'],['Gálatas','Galatians'],['Efésios','Ephesians'],['Filipenses','Philippians'],['Colossenses','Colossians'],['1 Tessalonicenses','1 Thessalonians'],['2 Tessalonicenses','2 Thessalonians'],['1 Timóteo','1 Timothy'],['2 Timóteo','2 Timothy'],['Tito','Titus'],['Filemom','Philemon'],['Hebreus','Hebrews'],['Tiago','James'],['1 Pedro','1 Peter'],['2 Pedro','2 Peter'],['1 João','1 John'],['2 João','2 John'],['3 João','3 John'],['Judas','Jude'],['Apocalipse','Revelation']];
const BOOKMAP = {}; BOOKS.forEach(([pt, en]) => { BOOKMAP[norm(pt)] = [pt, en]; BOOKMAP[norm(en)] = [pt, en]; });
'Gn Ex Lv Nm Dt Js Jz Rt 1Sm 2Sm 1Rs 2Rs 1Cr 2Cr Ed Ne Et Job Sl Pv Ec Ct Is Jr Lm Ez Dn Os Jl Am Ob Jn Mq Na Hc Sf Ag Zc Ml Mt Mc Lc Jo At Rm 1Co 2Co Gl Ef Fp Cl 1Ts 2Ts 1Tm 2Tm Tt Fm Hb Tg 1Pe 2Pe 1Jo 2Jo 3Jo Jd Ap'.split(' ').forEach((a, i) => BOOKMAP[norm(a)] = BOOKS[i]);
BOOKMAP[norm('Salmo')] = BOOKMAP[norm('Salmos')]; BOOKMAP[norm('Cântico dos Cânticos')] = BOOKMAP[norm('Cantares')];
const bibleVer = () => localStorage.getItem('ver') || 'acf';
const LOCAL = {}; // versão → [livro][capítulo][versículo]; texto local, sem internet
const customVers = () => JSON.parse(localStorage.getItem('customVers') || '[]'); // [{id, name}] importadas pelo usuário
const isLocalVer = v => v === 'acf' || v.startsWith('c:');
async function loadLocal(v) {
  if (!LOCAL[v]) LOCAL[v] = v === 'acf' ? await fetch('data/acf.json').then(r => r.json()) : (await dbGet('bible', 'custom|' + v)).data;
  return LOCAL[v];
}
function normalizeBible(j) { // aceita [{chapters:[[...]]}], [[[...]]] ou {"Gênesis":{"1":{"1":"..."}}}
  const num = (a, b) => a - b, vs = o => Array.isArray(o) ? o : Object.keys(o).sort(num).map(k => o[k]);
  let books;
  if (Array.isArray(j)) books = j.map(b => Array.isArray(b) ? b : b && b.chapters);
  else books = BOOKS.map(([pt, en]) => { const k = Object.keys(j).find(x => [norm(pt), norm(en)].includes(norm(x))); return k && vs(j[k]).map(vs); });
  if (books.length !== 66 || books.some(b => !Array.isArray(b))) throw new Error('Esperados 66 livros na ordem bíblica.');
  const out = books.map(b => b.map(ch => vs(ch).map(String)));
  if (!out[42][2] || !out[42][2][15]) throw new Error('João 3:16 não encontrado — formato inesperado.');
  return out;
}
function localPassage(p, data) {
  const bi = BOOKS.findIndex(b => b[0] === p.pt), chap = data[bi] && data[bi][+p.ch - 1];
  if (!chap) throw new Error(`${p.pt} ${p.ch} não existe.`);
  let want = [];
  if (!p.v) want = chap.map((_, i) => i + 1);
  else p.v.split(',').forEach(part => { const [a, b] = part.split('-').map(Number); for (let n = a; n <= (b || a); n++) want.push(n); });
  const verses = want.filter(n => chap[n - 1]).map(n => ({ n, t: chap[n - 1].trim() }));
  if (!verses.length) throw new Error(`Versículo não encontrado em ${p.pt} ${p.ch}.`);
  return { ref: `${p.pt} ${p.ch}${p.v ? ':' + p.v : ''}`, verses };
}
function parseRef(ref) {
  const m = String(ref).match(/^\s*(\d?\s*[A-Za-zÀ-ÿ ]+?)\s*(\d+)(?:\s*[:.]\s*([\d,\s–-]+))?\s*$/);
  if (!m) return null;
  const b = m[1].trim().toLowerCase() === 'jó' ? BOOKS[17] : BOOKMAP[norm(m[1])]; if (!b) return null;
  const v = m[3] ? m[3].replace(/[–\s]/g, c => c === '–' ? '-' : '') : '';
  return { pt: b[0], en: b[1], ch: m[2], v };
}
async function getPassage(ref) {
  const p = parseRef(ref); if (!p) throw new Error('Referência não reconhecida: ' + ref);
  if (isLocalVer(bibleVer())) return localPassage(p, await loadLocal(bibleVer()));
  const ver = bibleVer(), q = `${p.en} ${p.ch}${p.v ? ':' + p.v : ''}`, key = ver + '|' + q;
  const hit = await dbGet('bible', key); if (hit) return hit;
  const r = await fetch(`https://bible-api.com/${encodeURIComponent(q)}?translation=${ver}`);
  if (!r.ok) throw new Error('Passagem não encontrada (precisa de internet na primeira consulta).');
  const j = await r.json();
  const data = { ref: `${p.pt} ${p.ch}${p.v ? ':' + p.v : ''}`, verses: j.verses.map(v => ({ n: v.verse, t: v.text.trim().replace(/\s+/g, ' ') })) };
  await dbPut('bible', data, key); return data;
}
const passageText = d => d.verses.map(v => `${v.n} ${v.t}`).join(' ');
async function versesFor(str) { // "Jo 3:16; Rm 8:1" → [{ref, text}]
  const out = [];
  for (const r of String(str).split(/[;\n]/).map(x => x.trim()).filter(Boolean)) {
    try { const d = await getPassage(r); out.push({ ref: d.ref, text: passageText(d) }); } catch (e) { out.push({ ref: r, text: '⚠ ' + e.message }); }
  }
  return out;
}

/* ========== referências cruzadas (OpenBible.info, CC-BY, base: Treasury of Scripture Knowledge) ========== */
let XREF = null; // "livro.cap.vers" → ["livro.cap.vers[-fim]", …] ordenado por relevância
const loadX = () => XREF ? Promise.resolve(XREF) : fetch('data/xref.json').then(r => r.json()).then(j => XREF = j);
function codeToRef(code) {
  const [b, c, v] = code.split('.'), [v1, v2] = v.split('-');
  return `${BOOKS[+b][0]} ${c}:${v1}${v2 ? '-' + v2 : ''}`;
}
async function xrefModal(ref, onAdd) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><div class="row"><input id="xr" value="${esc(ref || '')}" placeholder="ex.: João 3:16" style="flex:1"><button id="xg">Buscar</button><button class="sec" id="xx">Fechar</button></div>
    <div id="xo"></div><p class="mute" style="font-size:12px">Referências cruzadas: OpenBible.info (CC-BY), baseadas no Treasury of Scripture Knowledge. Texto: Almeida Corrigida Fiel.</p></div>`;
  document.body.appendChild(m);
  const go = async () => {
    const out = $('#xo', m); out.innerHTML = '<p class="mute">Carregando…</p>';
    try {
      const first = String($('#xr', m).value).split(/[;\n]/)[0], p = parseRef(first); if (!p) throw new Error('Referência não reconhecida.');
      const [xr, acf] = await Promise.all([loadX(), loadLocal('acf')]);
      const v = p.v ? parseInt(p.v) : 1, key = `${BOOKS.findIndex(b => b[0] === p.pt)}.${p.ch}.${v}`;
      const L = xr[key] || [];
      out.innerHTML = `<h3>${esc(p.pt)} ${p.ch}:${v}</h3>` + (L.length ? L.map((code, i) => {
        const r = codeToRef(code); let t = ''; try { t = passageText(localPassage(parseRef(r), acf)); } catch (e) { t = ''; }
        return `<div class="card"><b>${esc(r)}</b> ${onAdd ? `<button class="sm" data-a="${i}" style="float:right">+ Adicionar</button>` : ''}<div class="mute">${esc(t)}</div></div>`;
      }).join('') : '<p class="mute">Sem referências cruzadas para este versículo.</p>');
      out.onclick = e => { const i = e.target.dataset.a; if (i === undefined) return; onAdd(codeToRef(L[+i])); toast('Adicionada'); e.target.disabled = true; };
    } catch (e) { out.innerHTML = `<p>${esc(e.message)}</p>`; }
  };
  $('#xg', m).onclick = go; $('#xr', m).onkeydown = e => e.key === 'Enter' && go(); $('#xx', m).onclick = () => m.remove();
  if (ref) go();
}

/* ========== projeção (outra janela, via BroadcastChannel) ========== */
const proj = new BroadcastChannel('pregar-proj');
let projWin = null, lastSent = null, blackOn = false, kbActions = {}; // kbActions: ações de teclado da tela atual
const toggleBlack = () => { blackOn = !blackOn; if (blackOn) proj.postMessage({ type: 'black' }); else if (lastSent) proj.postMessage(lastSent); };
const openProjector = () => { projWin = window.open('projetor.html', 'pregar-projetor', 'width=900,height=520'); };
/* temas dos slides */
const THEMES = {
  classico: { name: 'Clássico', bg: '#0b0b0b', text: '#ffffff', accent: '#f4e4b0' },
  claro: { name: 'Claro', bg: '#faf7f0', text: '#1d2433', accent: '#8a6d1d' },
  azul: { name: 'Azul', bg: 'linear-gradient(135deg,#0f2a4d,#1f5a9c)', text: '#ffffff', accent: '#f4e4b0' },
  aurora: { name: 'Aurora', bg: 'linear-gradient(135deg,#3a1c71,#d76d77,#ffaf7b)', text: '#ffffff', accent: '#fff2c2' },
  floresta: { name: 'Floresta', bg: 'linear-gradient(160deg,#0f3d2e,#2e7d5b)', text: '#ffffff', accent: '#e6f4c8' },
  papel: { name: 'Papel', bg: 'radial-gradient(circle at 30% 20%,#f7edd6,#e8d8b4)', text: '#3b2a14', accent: '#7a4b12' },
  ouro: { name: 'Preto e ouro', bg: 'linear-gradient(135deg,#0d0d0d,#2a2210)', text: '#f6f1e3', accent: '#d4af37' }
};
const FONTS = { 'Georgia, serif': 'Clássica (Georgia)', 'system-ui, sans-serif': 'Moderna', "'Palatino Linotype', Palatino, serif": 'Palatino', "'Arial Black', Impact, sans-serif": 'Impacto' };
const defTheme = () => JSON.parse(localStorage.getItem('defTheme') || 'null') || { preset: 'classico' };
const sermonTheme = s => s.theme || defTheme();
function themeStyle(th, sl) { // valores concretos de estilo (enviados ao projetor)
  const pr = THEMES[th.preset] || THEMES.classico, img = (sl && sl.img) || th.bgImage, ov = th.overlay ?? 0.45;
  return {
    bg: img ? `linear-gradient(rgba(0,0,0,${ov}),rgba(0,0,0,${ov})), url("${img}") center / cover no-repeat` : pr.bg,
    text: img ? '#ffffff' : pr.text, accent: img ? '#f4e4b0' : pr.accent, font: th.font || 'Georgia, serif',
    align: th.align || 'center', scale: th.scale || 1, logo: th.logo || null
  };
}
function applyStyle(el, ts) {
  if (!el) return;
  Object.assign(el.style, { background: ts.bg, color: ts.text, fontFamily: ts.font, textAlign: ts.align, alignItems: ts.align === 'left' ? 'flex-start' : 'center' });
  el.style.setProperty('--sc', ts.scale);
  const h = $('h3', el); if (h) h.style.color = ts.accent;
  let lg = $('.lg', el); if (ts.logo) { if (!lg) { lg = document.createElement('img'); lg.className = 'lg'; el.appendChild(lg); } lg.src = ts.logo; } else if (lg) lg.remove();
}
async function imgData(file, max = 1920, type = 'image/jpeg') { // reduz a imagem antes de guardar
  const bm = await createImageBitmap(file), r = Math.min(1, max / bm.width), cv = document.createElement('canvas');
  cv.width = Math.round(bm.width * r); cv.height = Math.round(bm.height * r); cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
  return cv.toDataURL(type, 0.82);
}
let projSermon = null; // pregação cujo tema vale para o que está sendo projetado
async function sendSlide(sl) {
  blackOn = false;
  let body = sl.body || '';
  if (sl.kind === 'verse' && !body) { const v = await versesFor(sl.title); body = v.map(x => x.text).join('\n'); }
  lastSent = { type: 'slide', kind: sl.kind, title: sl.title, body, theme: themeStyle(projSermon ? sermonTheme(projSermon) : defTheme(), sl) }; proj.postMessage(lastSent);
}
proj.onmessage = e => { if (e.data.type === 'hello' && lastSent) proj.postMessage(lastSent); if (e.data.type === 'key') handleKey(e.data.key); };

/* ========== slides (gerados a partir do esboço — sem IA externa) ========== */
function genSlides(s) {
  const out = [{ id: uid(), kind: 'title', title: s.title || 'Mensagem', body: [s.baseText, s.series].filter(Boolean).join(' · '), topicId: '' }];
  if (s.baseText) out.push({ id: uid(), kind: 'verse', title: s.baseText, body: '', topicId: '' });
  s.topics.forEach((t, i) => {
    out.push({ id: uid(), kind: 'point', title: `${i + 1}. ${t.title || 'Tópico'}`, body: t.keyphrase || '', topicId: t.id });
    String(t.verses).split(/[;\n]/).map(x => x.trim()).filter(Boolean).forEach(v => out.push({ id: uid(), kind: 'verse', title: v, body: '', topicId: t.id }));
  });
  out.push({ id: uid(), kind: 'title', title: 'Obrigado', body: s.conclusion ? s.conclusion.split('\n')[0] : '', topicId: '' });
  return out;
}

/* ========== modelos e checklist ========== */
const TEMPLATES = {
  '3 pontos com aplicação': ['Ponto 1', 'Ponto 2', 'Ponto 3', 'Aplicação'],
  'Expositivo (observação, interpretação, aplicação)': ['O que o texto diz (observação)', 'O que o texto significa (interpretação)', 'O que fazer com isso (aplicação)'],
  'Narrativo': ['Cenário', 'Conflito', 'Clímax', 'Resolução', 'Lição'],
  'Temático': ['O problema', 'A resposta bíblica', 'Como viver isso'],
  'Ceia do Senhor': ['Lembrar (a cruz)', 'Examinar-se', 'Comungar'],
  'Casamento': ['Aliança', 'Amor que serve', 'Perseverança'],
  'Funeral / consolo': ['A dor é real', 'A esperança em Cristo', 'Como seguir em frente']
};
const CHECKS = ['Oração', 'Estudo do texto', 'Esboço pronto', 'Ilustrações escolhidas', 'Slides prontos', 'Ensaio com cronômetro'];

/* ========== banco de ilustrações e citações ========== */
const ITYPES = ['ilustração', 'citação', 'história', 'estatística', 'testemunho', 'outro'];
const saveI = async i => { if (!ilus.find(x => x.id === i.id)) ilus.push(i); await dbPut('ilus', i); };
const usedIn = i => (i.uses || []).map(u => getS(u.sid)).filter(Boolean).map(s => s.title || '(sem título)').filter((t, k, a) => a.indexOf(t) === k);
const ilusMatch = (i, q, ty, tg) => (!ty || i.type === ty) && (!tg || i.tags.includes(tg)) && (!q || norm(JSON.stringify([i.title, i.text, i.source, i.tags])).includes(q));
const allTags = () => [...new Set(ilus.flatMap(i => i.tags))].sort();
function ilusModal(item, done) {
  const i = item || { id: uid(), type: 'ilustração', title: '', text: '', source: '', tags: [], uses: [], createdAt: Date.now() };
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><h2>${item ? 'Editar' : 'Nova'} ilustração / citação</h2>
   <label>Tipo</label><select id="it">${ITYPES.map(t => `<option ${i.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
   <label>Título (para achar depois)</label><input id="ii" value="${esc(i.title)}">
   <label>Texto</label><textarea id="ix" style="min-height:140px">${esc(i.text)}</textarea>
   <label>Fonte (autor, livro, link)</label><input id="is" value="${esc(i.source)}">
   <label>Tags (vírgula)</label><input id="ig" list="tg" value="${esc(i.tags.join(', '))}"><datalist id="tg">${allTags().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
   <div class="row" style="margin-top:12px"><button id="isv">Salvar</button><button class="sec" id="icx">Cancelar</button></div></div>`;
  document.body.appendChild(m);
  $('#icx', m).onclick = () => m.remove();
  $('#isv', m).onclick = async () => {
    const text = $('#ix', m).value.trim(); if (!text) { toast('Escreva o texto'); return; }
    Object.assign(i, { type: $('#it', m).value, title: $('#ii', m).value.trim(), text, source: $('#is', m).value.trim(), tags: $('#ig', m).value.split(',').map(x => x.trim()).filter(Boolean) });
    await saveI(i); m.remove(); toast('Salvo no banco'); done && done(i);
  };
  $('#ix', m).focus();
}
function ilusPicker(onPick) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><div class="row"><input id="pq" placeholder="Buscar no banco…" style="flex:1"><button class="sec" id="px">Fechar</button></div><div id="pl"></div></div>`;
  document.body.appendChild(m);
  const draw = () => {
    const q = norm($('#pq', m).value), L = ilus.filter(i => ilusMatch(i, q, '', ''));
    $('#pl', m).innerHTML = L.length ? L.map(i => { const u = usedIn(i); return `<div class="card"><b>${esc(i.title || i.type)}</b> <span class="st">${i.type}</span>
      <div class="mute">${esc(i.text.slice(0, 160))}${i.text.length > 160 ? '…' : ''}</div>${u.length ? `<div style="color:var(--warn)">⚠ já usada em: ${u.map(esc).join(', ')}</div>` : ''}
      <button class="sm" data-p="${i.id}" style="margin-top:6px">Inserir</button></div>`; }).join('') : '<p class="mute">Nada encontrado. Cadastre itens em Ilustrações.</p>';
  };
  $('#pq', m).oninput = draw; draw(); $('#px', m).onclick = () => m.remove();
  $('#pl', m).onclick = e => { const i = ilus.find(x => x.id === e.target.dataset.p); if (i) { m.remove(); onPick(i); } };
}
function ilustracoes() {
  app.innerHTML = `<div class="row"><h1 style="flex:1">Ilustrações e citações</h1><button id="in">+ Nova</button></div>
   <div class="card"><div class="grid"><div><label>Buscar</label><input id="iq" placeholder="texto, título, fonte, tag"></div>
   <div><label>Tipo</label><select id="ity"><option value="">Todos</option>${ITYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
   <div><label>Tag</label><select id="itg"><option value="">Todas</option>${allTags().map(t => `<option>${esc(t)}</option>`).join('')}</select></div></div></div><div id="il"></div>`;
  const draw = () => {
    const L = ilus.filter(i => ilusMatch(i, norm($('#iq').value), $('#ity').value, $('#itg').value)).sort((a, b) => b.createdAt - a.createdAt);
    $('#il').innerHTML = L.length ? L.map(i => { const u = usedIn(i); return `<div class="card"><div class="row"><b style="flex:1">${esc(i.title || '(sem título)')}</b><span class="st">${i.type}</span></div>
      <div style="white-space:pre-wrap;margin:6px 0">${esc(i.text)}</div>${i.source ? `<div class="mute">Fonte: ${esc(i.source)}</div>` : ''}
      <div>${i.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>${u.length ? `<div class="mute">Usada em: ${u.map(esc).join(', ')}</div>` : '<div class="mute">Ainda não usada</div>'}
      <div class="row" style="margin-top:8px"><button class="sec sm" data-e="${i.id}">Editar</button><button class="del sm" data-d="${i.id}">Excluir</button></div></div>`; }).join('') : '<p class="mute">Nenhum item ainda. Clique em “+ Nova” ou guarde uma ilustração direto do editor de pregação.</p>';
  };
  ['iq', 'ity', 'itg'].forEach(k => $('#' + k).oninput = draw); draw();
  $('#in').onclick = () => ilusModal(null, () => ilustracoes());
  $('#il').onclick = async e => {
    const ed = ilus.find(x => x.id === e.target.dataset.e); if (ed) return ilusModal(ed, () => ilustracoes());
    const id = e.target.dataset.d; if (id && confirm('Excluir do banco?')) { ilus = ilus.filter(x => x.id !== id); await dbDel('ilus', id); ilustracoes(); }
  };
}

/* ========== cartão de imagem (frase-chave → PNG para redes sociais) ========== */
const CARD_FORMATS = { 'Quadrado (feed) 1080×1080': [1080, 1080], 'Stories / Reels 1080×1920': [1080, 1920], 'Paisagem (link) 1200×630': [1200, 630] };
function paintBg(ctx, w, h, bg) { // converte o fundo CSS dos temas (cor, linear ou radial) para canvas
  const cols = bg.match(/#[0-9a-fA-F]{3,8}/g) || ['#000'];
  if (cols.length === 1) { ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, w, h); return; }
  let g;
  if (bg.startsWith('radial')) g = ctx.createRadialGradient(w * .3, h * .2, 0, w * .3, h * .2, Math.max(w, h) * .9);
  else { const a = (parseFloat((bg.match(/(\d+)deg/) || [])[1]) || 135) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), L = Math.abs(w * dx) + Math.abs(h * dy);
    g = ctx.createLinearGradient(w / 2 - dx * L / 2, h / 2 - dy * L / 2, w / 2 + dx * L / 2, h / 2 + dy * L / 2); }
  cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
function wrapLines(ctx, text, maxW) {
  const out = [];
  String(text).split('\n').forEach(par => { let line = ''; par.split(/\s+/).filter(Boolean).forEach(word => { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t; }); out.push(line); });
  return out;
}
async function drawCard(cv, o) {
  const [w, h] = CARD_FORMATS[o.format], ctx = cv.getContext('2d'), pr = THEMES[o.preset] || THEMES.classico;
  cv.width = w; cv.height = h;
  const img = o.bgImage ? await loadImg(o.bgImage).catch(() => null) : null;
  let text = pr.text, accent = pr.accent;
  if (img) {
    const r = Math.max(w / img.width, h / img.height); ctx.drawImage(img, (w - img.width * r) / 2, (h - img.height * r) / 2, img.width * r, img.height * r);
    ctx.fillStyle = `rgba(0,0,0,${o.overlay})`; ctx.fillRect(0, 0, w, h); text = '#ffffff'; accent = '#f4e4b0';
  } else paintBg(ctx, w, h, pr.bg);
  const pad = Math.round(Math.min(w, h) * 0.1), left = o.align === 'left', x = left ? pad : w / 2, maxW = w - pad * 2, footer = o.sign ? Math.round(h * 0.07) : 0;
  ctx.textAlign = left ? 'left' : 'center'; ctx.textBaseline = 'alphabetic';
  const refSize = Math.round(Math.min(w, h) * 0.04), availH = h - pad * 2 - footer - (o.ref ? refSize * 2.2 : 0) - Math.min(w, h) * 0.12;
  let size = Math.min(w, h) * 0.095 * o.scale, lines;
  for (;;) { ctx.font = `bold ${size}px ${o.font}`; lines = wrapLines(ctx, o.text || ' ', maxW); if (lines.length * size * 1.28 <= availH || size < 18) break; size -= 2; }
  const blockH = lines.length * size * 1.28, top = pad + Math.min(w, h) * 0.12 + Math.max(0, (availH - blockH) / 2);
  ctx.fillStyle = accent; ctx.globalAlpha = 0.9; ctx.font = `bold ${Math.min(w, h) * 0.2}px Georgia, serif`; ctx.fillText('“', x, pad + Math.min(w, h) * 0.13); ctx.globalAlpha = 1;
  ctx.fillStyle = text; ctx.font = `bold ${size}px ${o.font}`;
  lines.forEach((l, i) => ctx.fillText(l, x, top + size * (i + 0.9) * 1.28 - size * 0.28));
  let y = top + blockH + refSize * 1.3;
  if (o.ref) { ctx.fillStyle = accent; ctx.fillRect(left ? x : x - pad * 0.5, y - refSize * 1.3, pad, 4); ctx.font = `600 ${refSize}px ${o.font}`; ctx.fillText('— ' + o.ref, x, y + refSize * 0.6); }
  if (o.sign) { ctx.fillStyle = text; ctx.globalAlpha = 0.75; ctx.font = `${Math.round(Math.min(w, h) * 0.028)}px system-ui, sans-serif`; ctx.fillText(o.sign, x, h - pad * 0.7); ctx.globalAlpha = 1; }
  if (o.logo) { const lg = await loadImg(o.logo).catch(() => null); if (lg) { const lh = h * 0.08, lw = lg.width * lh / lg.height; ctx.drawImage(lg, w - pad * 0.7 - lw, h - pad * 0.7 - lh, lw, lh); } }
}
function cardModal(init, s) {
  const th = s ? sermonTheme(s) : defTheme();
  const o = { text: '', ref: '', format: Object.keys(CARD_FORMATS)[0], preset: th.preset || 'classico', font: th.font || 'Georgia, serif', align: th.align === 'left' ? 'left' : 'center', scale: 1, overlay: th.overlay ?? 0.45, useImg: !!th.bgImage, useLogo: !!th.logo, sign: localStorage.getItem('assinatura') || '', ...init };
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div style="max-width:760px"><div class="row"><b style="flex:1">Cartão de imagem</b><button class="sec" id="cx">Fechar</button></div>
   <label>Frase</label><textarea id="ct" style="min-height:70px">${esc(o.text)}</textarea>
   <div class="grid"><div><label>Referência / autor</label><input id="cr" value="${esc(o.ref)}"></div><div><label>Assinatura (igreja, @, nome)</label><input id="cs" value="${esc(o.sign)}"></div>
    <div><label>Formato</label><select id="cf">${Object.keys(CARD_FORMATS).map(k => `<option>${k}</option>`).join('')}</select></div>
    <div><label>Tema</label><select id="cp">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${o.preset === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
    <div><label>Fonte</label><select id="cn">${Object.entries(FONTS).map(([k, n]) => `<option value="${esc(k)}" ${o.font === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div><label>Alinhamento</label><select id="ca"><option value="center" ${o.align === 'center' ? 'selected' : ''}>Centro</option><option value="left" ${o.align === 'left' ? 'selected' : ''}>Esquerda</option></select></div>
    <div><label>Tamanho do texto</label><input type="range" id="cz" min="0.6" max="1.4" step="0.05" value="1"></div></div>
   ${th.bgImage || th.logo ? `<div class="row" style="margin-top:6px">${th.bgImage ? `<label style="margin:0"><input type="checkbox" id="ci" style="width:auto" ${o.useImg ? 'checked' : ''}> usar imagem de fundo da pregação</label>` : ''}${th.logo ? `<label style="margin:0"><input type="checkbox" id="cl" style="width:auto" ${o.useLogo ? 'checked' : ''}> logo</label>` : ''}</div>` : ''}
   <canvas id="cv" style="width:100%;max-height:50vh;object-fit:contain;border-radius:8px;margin-top:10px;background:#000"></canvas>
   <div class="row" style="margin-top:10px"><button id="cd">⬇ Baixar PNG</button><button class="sec" id="csh">Compartilhar</button></div></div>`;
  document.body.appendChild(m);
  const cv = $('#cv', m);
  const draw = debounce(() => { o.text = $('#ct', m).value; o.ref = $('#cr', m).value; o.sign = $('#cs', m).value; o.format = $('#cf', m).value; o.preset = $('#cp', m).value; o.font = $('#cn', m).value; o.align = $('#ca', m).value; o.scale = +$('#cz', m).value;
    o.bgImage = $('#ci', m) && $('#ci', m).checked ? th.bgImage : null; o.logo = $('#cl', m) && $('#cl', m).checked ? th.logo : null; localStorage.setItem('assinatura', o.sign); drawCard(cv, o); }, 120);
  m.oninput = draw; m.onchange = draw; draw();
  $('#cx', m).onclick = () => m.remove();
  const blob = () => new Promise(r => cv.toBlob(r, 'image/png'));
  $('#cd', m).onclick = async () => { await drawCard(cv, o); const a = document.createElement('a'); a.href = URL.createObjectURL(await blob()); a.download = 'cartao-' + (norm(o.text).slice(0, 24) || 'pregar') + '.png'; a.click(); };
  $('#csh', m).onclick = async () => {
    await drawCard(cv, o); const f = new File([await blob()], 'cartao.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], text: o.text }).catch(() => {}); else toast('Este navegador não compartilha arquivos; use Baixar PNG');
  };
}

/* ========== oração e visitas (dados pastorais: ficam só neste aparelho) ========== */
const PCAT = ['oração', 'visita', 'enfermo', 'aconselhamento', 'família', 'outro'];
const savePr = async p => { if (!pray.find(x => x.id === p.id)) pray.push(p); await dbPut('pray', p); };
const dueFollow = () => pray.filter(p => p.status === 'aberto' && p.followUp && p.followUp <= todayISO());
function askText(title, init, ok) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><b>${esc(title)}</b><textarea id="at" style="min-height:110px;margin-top:8px">${esc(init || '')}</textarea><div class="row" style="margin-top:10px"><button id="ao">Salvar</button><button class="sec" id="ac">Cancelar</button></div></div>`;
  document.body.appendChild(m); $('#at', m).focus(); $('#ac', m).onclick = () => m.remove();
  $('#ao', m).onclick = () => { const v = $('#at', m).value.trim(); m.remove(); ok(v); };
}
function prayModal(item, done) {
  const p = item || { id: uid(), person: '', category: 'oração', text: '', date: todayISO(), followUp: '', status: 'aberto', notes: [], answer: '', createdAt: Date.now() };
  const people = [...new Set(pray.map(x => x.person).filter(Boolean))];
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><h2>${item ? 'Editar' : 'Novo'} pedido</h2>
   <label>Pessoa / família</label><input id="pp" list="ppl" value="${esc(p.person)}"><datalist id="ppl">${people.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
   <div class="grid"><div><label>Tipo</label><select id="pc">${PCAT.map(k => `<option ${p.category === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
   <div><label>Data do pedido</label><input type="date" id="pd" value="${p.date}"></div>
   <div><label>Retornar em (lembrete)</label><input type="date" id="pf" value="${p.followUp || ''}"></div></div>
   <label>Pedido / situação</label><textarea id="px" style="min-height:110px">${esc(p.text)}</textarea>
   <div class="row" style="margin-top:12px"><button id="ps">Salvar</button><button class="sec" id="pcx">Cancelar</button></div></div>`;
  document.body.appendChild(m); $('#pcx', m).onclick = () => m.remove(); $('#pp', m).focus();
  $('#ps', m).onclick = async () => {
    const person = $('#pp', m).value.trim(), text = $('#px', m).value.trim(); if (!person && !text) return toast('Informe a pessoa ou o pedido');
    Object.assign(p, { person, text, category: $('#pc', m).value, date: $('#pd', m).value || todayISO(), followUp: $('#pf', m).value });
    await savePr(p); m.remove(); toast('Salvo'); done && done();
  };
}
function prayMode() {
  const L = pray.filter(p => p.status === 'aberto'); if (!L.length) return toast('Nenhum pedido aberto');
  let i = 0; const m = document.createElement('div'); m.className = 'modal'; document.body.appendChild(m);
  const draw = () => { const p = L[i]; m.innerHTML = `<div><div class="row"><span class="mute" style="flex:1">${i + 1} / ${L.length}</span><button class="sec sm" id="mx">Fechar</button></div>
    <h2>🙏 ${esc(p.person) || '(sem nome)'} <span class="st">${p.category}</span></h2><div class="big" style="white-space:pre-wrap">${esc(p.text)}</div>
    ${p.notes.length ? `<h3 class="mute">Acompanhamento</h3>${p.notes.map(n => `<div class="mute">${fmtDate(n.date)} — ${esc(n.text)}</div>`).join('')}` : ''}
    <div class="row" style="margin-top:14px"><button class="sec" id="mp">◀ Anterior</button><button id="mn2">Próximo ▶</button></div></div>`;
    $('#mx', m).onclick = () => m.remove(); $('#mp', m).onclick = () => { i = (i - 1 + L.length) % L.length; draw(); }; $('#mn2', m).onclick = () => { i = (i + 1) % L.length; draw(); }; };
  draw();
}
function oracao() {
  const due = dueFollow();
  app.innerHTML = `<div class="row"><h1 style="flex:1">Oração e visitas</h1><button class="sec" id="om">🙏 Modo oração</button><button id="on">+ Novo pedido</button></div>
   <p class="mute">🔒 Estes registros ficam somente neste aparelho (e no seu backup).</p>
   ${due.length ? `<div class="banner" style="background:#7a4b9c"><span>${due.length} retorno(s) pendente(s): ${due.map(p => esc(p.person || p.category)).join(', ')}</span></div>` : ''}
   <div class="card"><div class="grid"><div><label>Buscar</label><input id="oq" placeholder="pessoa, pedido, anotação"></div>
   <div><label>Situação</label><select id="os"><option value="aberto">Abertos</option><option value="respondido">Respondidos</option><option value="arquivado">Arquivados</option><option value="">Todos</option></select></div>
   <div><label>Tipo</label><select id="oc"><option value="">Todos</option>${PCAT.map(k => `<option>${k}</option>`).join('')}</select></div></div></div><div id="ol"></div>`;
  const draw = () => {
    const q = norm($('#oq').value), st = $('#os').value, ct = $('#oc').value;
    const L = pray.filter(p => (!st || p.status === st) && (!ct || p.category === ct) && (!q || norm(JSON.stringify([p.person, p.text, p.notes, p.answer])).includes(q)))
      .sort((a, b) => (a.followUp || '9999').localeCompare(b.followUp || '9999') || b.createdAt - a.createdAt);
    $('#ol').innerHTML = L.length ? L.map(p => `<div class="card" data-id="${p.id}"><div class="row"><b style="flex:1">${esc(p.person) || '(sem nome)'}</b><span class="st">${p.category}</span><span class="st ${p.status === 'respondido' ? 'pregada' : ''}">${p.status}</span></div>
      <div class="mute">${fmtDate(p.date)}${p.followUp ? ` · retorno ${fmtDate(p.followUp)}${p.status === 'aberto' && p.followUp <= todayISO() ? ' ⚠' : ''}` : ''}</div>
      <div style="white-space:pre-wrap;margin:6px 0">${esc(p.text)}</div>
      ${p.notes.map(n => `<div class="mute">• ${fmtDate(n.date)} — ${esc(n.text)}</div>`).join('')}${p.answer ? `<div class="verse"><b>Resposta:</b> ${esc(p.answer)}${p.answeredAt ? ' (' + fmtDate(p.answeredAt) + ')' : ''}</div>` : ''}
      <div class="row" style="margin-top:8px">${p.status === 'aberto' ? '<button class="sm" data-a="note">+ Acompanhamento</button><button class="sm sec" data-a="ans">✔ Respondido</button><button class="sm sec" data-a="w7">Retorno +7 dias</button>' : '<button class="sm sec" data-a="reopen">Reabrir</button>'}
      <button class="sm sec" data-a="edit">Editar</button>${p.status !== 'arquivado' ? '<button class="sm sec" data-a="arch">Arquivar</button>' : ''}<button class="sm del" data-a="del">Excluir</button></div></div>`).join('') : '<p class="mute">Nenhum pedido nesta lista.</p>';
  };
  ['oq', 'os', 'oc'].forEach(k => $('#' + k).oninput = draw); draw();
  $('#on').onclick = () => prayModal(null, oracao); $('#om').onclick = prayMode;
  $('#ol').onclick = async e => {
    const a = e.target.dataset.a, el = e.target.closest('[data-id]'); if (!a || !el) return;
    const p = pray.find(x => x.id === el.dataset.id), after = async () => { await savePr(p); oracao(); };
    if (a === 'note') askText('Acompanhamento / visita realizada', '', v => { if (v) { p.notes.push({ date: todayISO(), text: v }); after(); } });
    if (a === 'ans') askText('Como Deus respondeu? (testemunho)', '', v => { p.status = 'respondido'; p.answer = v; p.answeredAt = todayISO(); p.followUp = ''; after(); });
    if (a === 'w7') { p.followUp = addDays(todayISO(), 7); after(); }
    if (a === 'reopen') { p.status = 'aberto'; after(); }
    if (a === 'arch') { p.status = 'arquivado'; after(); }
    if (a === 'edit') prayModal(p, oracao);
    if (a === 'del' && confirm('Excluir este pedido?')) { pray = pray.filter(x => x.id !== p.id); await dbDel('pray', p.id); oracao(); }
  };
}

/* ========== roteador ========== */
const app = $('#app');
let cleanup = null;
async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const [, r = '', id, id2] = location.hash.replace('#', '').split('/');
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (r === 'assist' ? 'assistentes' : r || 'home')));
  const views = { '': home, teleprompter, assist: assistWorkspace, assistentes: assistLibrary, ajustes, agenda, biblia, stats, backup, ilus: ilustracoes, plano, oracao, datas, s: editor, pregar: preach, slides: slidesView };
  scrollTo(0, 0); projSermon = null; app.onclick = null; kbActions = {};
  await (views[r] || home)(id, id2);
}

/* ========== Acervo ========== */
function home() {
  const series = [...new Set(sermons.map(s => s.series).filter(Boolean))];
  const folders = [...new Set(sermons.map(s => s.folder).filter(Boolean))];
  const nx = sermons.filter(s => s.date >= todayISO() && s.status !== 'pregada').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const tr = todayReading(), pdue = dueFollow().length, sp = nextSpecial(30);
  app.innerHTML = `${backupBanners()}${sp ? `<div class="banner" style="background:#2c7a7b"><span>🗓 <b>${esc(sp.name)}</b> — ${fmtDate(sp.date)}. Ainda sem pregação planejada.</span><a class="btn" href="#/datas">Planejar</a></div>` : ''}${pdue ? `<div class="banner" style="background:#7a4b9c"><span>🙏 ${pdue} retorno(s) de oração/visita pendente(s)</span><a class="btn" href="#/oracao">Ver</a></div>` : ''}${tr ? `<div class="banner" style="background:#4a6b3d"><span>📖 Leitura de hoje (${esc(tr.pl.name)}): <b>${esc(dayLabel(tr.pl.days[tr.i]))}</b></span><a class="btn" href="#/plano/${tr.pl.id}">Abrir</a></div>` : ''}${nx ? `<div class="banner"><span>Próxima mensagem: <b>${esc(nx.title) || '(sem título)'}</b> — ${fmtDate(nx.date)} ${esc(nx.time)}</span><a class="btn" href="#/pregar/${nx.id}">▶ Abrir e pregar</a></div>` : ''}<div class="row"><h1 style="flex:1">Acervo de pregações</h1><button class="sec" id="imp">⬆ Importar Word/PDF</button><a class="btn" href="#/s/novo">+ Nova pregação</a></div>
  <div class="card"><div class="grid">
    <div><label>Buscar (título, versículo, tema, ilustração…)</label><input id="q" placeholder="ex.: Romanos 8, graça, ovelha"></div>
    <div><label>Status</label><select id="fs"><option value="">Todos</option><option>rascunho</option><option>pronta</option><option>pregada</option></select></div>
    <div><label>Pasta</label><select id="fd"><option value="">Todas</option>${folders.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
    <div><label>Série</label><select id="fr"><option value="">Todas</option>${series.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
  </div></div><div id="list"></div>`;
  const draw = () => {
    const q = norm($('#q').value), fs = $('#fs').value, fr = $('#fr').value, fd = $('#fd').value;
    const L = sermons.filter(s => (!fd || s.folder === fd) && (!fs || s.status === fs) && (!fr || s.series === fr) && (!q || norm(JSON.stringify([s.title, s.baseText, s.series, s.folder, s.tags, s.place, s.intro, s.topics, s.conclusion, s.postNotes])).includes(q)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    $('#list').innerHTML = L.length ? L.map(s => `<a class="card item" href="#/s/${s.id}"><div class="row"><b style="flex:1">${esc(s.title) || '(sem título)'}</b><span class="st ${s.status}">${s.status}</span></div>
      <div class="mute">${s.folder ? '📁 ' + esc(s.folder) + ' · ' : ''}${esc(s.baseText)} · ${fmtDate(s.date)}${s.place ? ' · ' + esc(s.place) : ''}${s.series ? ' · Série: ' + esc(s.series) : ''}${s.real ? ' · ' + s.real + ' min' : ''}</div>
      <div>${s.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></a>`).join('') : '<p class="mute">Nenhuma pregação encontrada. Clique em “Nova pregação”.</p>';
  };
  ['q', 'fs', 'fd', 'fr'].forEach(i => $('#' + i).oninput = draw); draw();
  $('#imp').onclick = importModal; bindBackupBanners();
}

/* ========== Editor ========== */
async function editor(id) {
  let s = id === 'novo' ? blank() : getS(id);
  if (!s) { location.hash = '#/'; return; }
  if (id === 'novo') { await saveS(s); history.replaceState(null, '', '#/s/' + s.id); }
  const topicHTML = (t, i) => `<div class="card topic" data-tid="${t.id}"><div class="row"><b style="flex:1">Tópico ${i + 1}</b>
    <button class="sec sm" data-act="up">↑</button><button class="sec sm" data-act="down">↓</button><button class="del sm" data-act="rm">Remover</button></div>
    <label>Título do tópico</label><input data-f="title" value="${esc(t.title)}">
    <label>Tempo planejado deste tópico (min)</label><input type="number" data-f="min" value="${t.min ?? ''}">
    <div class="row"><label style="flex:1">Versículos (separe com ;)</label><button class="sec sm" data-act="xref">🔗 Ref. cruzadas</button></div><input data-f="verses" value="${esc(t.verses)}" placeholder="Jo 3:16; Rm 5:8">
    <div class="row"><label style="flex:1">Frase-chave</label><button class="sec sm" data-act="card">🖼 Cartão de imagem</button></div><input data-f="keyphrase" value="${esc(t.keyphrase)}">
    <label>Citação</label><input data-f="quote" value="${esc(t.quote)}">
    <label>Lista (um item por linha)</label><textarea data-f="list">${esc(t.list)}</textarea>
    <label>Observações</label><textarea data-f="notes">${esc(t.notes)}</textarea>
    <label>Aplicação</label><textarea data-f="application">${esc(t.application)}</textarea>
    <div class="row"><label style="flex:1">Ilustração</label><button class="sec sm" data-act="ilpick">📚 Do banco</button><button class="sec sm" data-act="ilsave">💾 Guardar no banco</button></div><textarea data-f="illustration">${esc(t.illustration)}</textarea></div>`;
  app.innerHTML = `<div class="row"><h1 style="flex:1">Editar pregação</h1>
    <a class="btn sec" href="#/assist/${s.id}">✨ Assistentes</a><a class="btn sec" href="#/teleprompter/${s.id}/esboco">Teleprompter</a><a class="btn sec" href="#/slides/${s.id}">Slides</a><a class="btn" href="#/pregar/${s.id}">▶ Pregar</a><button class="sec" id="dup">Duplicar</button><button class="sec" id="exp">Word / Markdown</button><button class="sec" id="pdf">PDF / Imprimir</button><button class="del" id="del">Excluir</button></div>
  <div class="card"><label>Título</label><input data-m="title" value="${esc(s.title)}">
   <div class="grid"><div><label>Texto-base</label><input data-m="baseText" value="${esc(s.baseText)}" placeholder="Salmos 23:1-6"></div>
   <div><label>Pasta</label><input data-m="folder" list="folders" value="${esc(s.folder || '')}"><datalist id="folders">${[...new Set(sermons.map(x => x.folder).filter(Boolean))].map(f => `<option value="${esc(f)}">`).join('')}</datalist></div>
   <div><label>Série</label><input data-m="series" value="${esc(s.series)}"></div>
   <div><label>Tags (vírgula)</label><input data-m="tags" value="${esc(s.tags.join(', '))}"></div>
   <div><label>Data</label><input type="date" data-m="date" value="${s.date}"></div>
   <div><label>Horário</label><input type="time" data-m="time" value="${s.time}"></div>
   <div><label>Igreja / local</label><input data-m="place" value="${esc(s.place)}"></div>
   <div><label>Público</label><input data-m="audience" value="${esc(s.audience)}"></div>
   <div><label>Tempo planejado (min)</label><input type="number" data-m="planned" value="${s.planned}"></div>
   <div><label>Duração real (min)</label><input type="number" data-m="real" value="${s.real ?? ''}"></div>
   <div><label>Status</label><select data-m="status">${['rascunho', 'pronta', 'pregada'].map(x => `<option ${s.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div></div>
  <div class="card"><div class="row"><b>Preparação:</b>${CHECKS.map(k => `<label style="display:inline-flex;gap:4px;align-items:center;margin:0"><input type="checkbox" style="width:auto" data-ck="${k}" ${s.checks && s.checks[k] ? 'checked' : ''}>${k}</label>`).join('')}</div>
   <div class="row" style="margin-top:8px"><select id="tpl" style="flex:1"><option value="">Aplicar modelo de esboço…</option>${Object.keys(TEMPLATES).map(k => `<option>${esc(k)}</option>`).join('')}</select><button class="sec" id="tplb">Adicionar tópicos do modelo</button></div></div>
  <div class="card"><label>Introdução</label><textarea data-m="intro">${esc(s.intro)}</textarea></div>
  <h2>Tópicos</h2><div id="topics">${s.topics.map(topicHTML).join('')}</div>
  <button id="addT" class="sec">+ Adicionar tópico</button>
  <div class="card" style="margin-top:12px"><label>Conclusão / apelo</label><textarea data-m="conclusion">${esc(s.conclusion)}</textarea></div>
  <div class="card"><label>Notas pós-pregação (o que funcionou, o que ajustar)</label><textarea data-m="postNotes">${esc(s.postNotes)}</textarea></div>
  ${s.importedText ? `<details class="card"><summary><b>Texto original importado</b> (somente leitura)</summary><textarea readonly style="min-height:260px;margin-top:8px">${esc(s.importedText)}</textarea></details>` : ''}
  <div class="card"><b>Gravação de áudio</b><div class="row" style="margin-top:8px"><button id="rec">● Gravar</button><span id="recst" class="mute"></span></div><div id="aud"></div></div>`;
  const save = debounce(() => saveS(s).then(() => toast('Salvo')));
  app.oninput = e => {
    const el = e.target;
    if (el.dataset.m) { let v = el.value; const k = el.dataset.m; if (k === 'tags') v = v.split(',').map(x => x.trim()).filter(Boolean); if (k === 'planned' || k === 'real') v = v === '' ? null : +v; s[k] = v; }
    else if (el.dataset.ck) { s.checks = s.checks || {}; s.checks[el.dataset.ck] = el.checked; }
    else if (el.dataset.f) { const t = s.topics.find(x => x.id === el.closest('[data-tid]').dataset.tid); t[el.dataset.f] = el.dataset.f === 'min' ? (el.value === '' ? null : +el.value) : el.value; }
    save();
  };
  const redrawTopics = () => { $('#topics').innerHTML = s.topics.map(topicHTML).join(''); save(); };
  $('#addT').onclick = () => { s.topics.push(blankTopic()); redrawTopics(); };
  $('#topics').onclick = e => {
    const a = e.target.dataset.act; if (!a) return;
    const i = s.topics.findIndex(x => x.id === e.target.closest('[data-tid]').dataset.tid), tp = s.topics[i];
    if (a === 'card') return cardModal({ text: tp.keyphrase || tp.quote || '', ref: String(tp.verses).split(/[;\n]/)[0].trim() }, s);
    if (a === 'xref') return xrefModal(tp.verses.split(/[;\n]/)[0] || '', r => { tp.verses = (tp.verses ? tp.verses + '; ' : '') + r; redrawTopics(); });
    if (a === 'ilpick') return ilusPicker(it => {
      tp.illustration = (tp.illustration ? tp.illustration + '\n\n' : '') + it.text + (it.source ? ` (${it.source})` : '');
      it.uses = it.uses || []; if (!it.uses.some(u => u.sid === s.id && u.tid === tp.id)) it.uses.push({ sid: s.id, tid: tp.id });
      saveI(it); redrawTopics(); toast('Inserida');
    });
    if (a === 'ilsave') { if (!tp.illustration.trim()) return toast('A ilustração está vazia'); return ilusModal({ id: uid(), type: 'ilustração', title: '', text: tp.illustration.trim(), source: '', tags: [], uses: [{ sid: s.id, tid: tp.id }], createdAt: Date.now() }, () => {}); }
    if (a === 'rm' && confirm('Remover este tópico?')) s.topics.splice(i, 1);
    if (a === 'up' && i > 0) [s.topics[i - 1], s.topics[i]] = [s.topics[i], s.topics[i - 1]];
    if (a === 'down' && i < s.topics.length - 1) [s.topics[i + 1], s.topics[i]] = [s.topics[i], s.topics[i + 1]];
    redrawTopics();
  };
  $('#tplb').onclick = () => { const k = $('#tpl').value; if (!k) return; TEMPLATES[k].forEach(n => { const t = blankTopic(); t.title = n; s.topics.push(t); }); redrawTopics(); };
  $('#dup').onclick = async () => { const n = JSON.parse(JSON.stringify(s)); Object.assign(n, { id: uid(), title: (s.title || '') + ' (cópia)', status: 'rascunho', real: null, date: todayISO(), postNotes: '', checks: {}, createdAt: Date.now() }); n.slides.forEach(x => x.id = uid()); await saveS(n); location.hash = '#/s/' + n.id; toast('Duplicada como rascunho'); };
  $('#del').onclick = async () => { if (confirm('Excluir esta pregação definitivamente?')) { sermons = sermons.filter(x => x.id !== s.id); await dbDel('sermons', s.id); await dbDel('audio', s.id); location.hash = '#/'; } };
  $('#pdf').onclick = () => printSermon(s);
  $('#exp').onclick = () => exportModal(s);
  // áudio
  const showAudio = async () => { const b = await dbGet('audio', s.id); $('#aud').innerHTML = b ? `<audio controls src="${URL.createObjectURL(b)}" style="width:100%;margin-top:8px"></audio><button class="sec sm" id="rma">Apagar áudio</button>` : ''; if (b) $('#rma').onclick = async () => { await dbDel('audio', s.id); showAudio(); }; };
  showAudio();
  let mr = null, chunks = [];
  $('#rec').onclick = async () => {
    if (mr && mr.state === 'recording') { mr.stop(); return; }
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true }); mr = new MediaRecorder(st); chunks = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = async () => { st.getTracks().forEach(t => t.stop()); await dbPut('audio', new Blob(chunks, { type: mr.mimeType }), s.id); $('#rec').textContent = '● Gravar'; $('#recst').textContent = ''; showAudio(); toast('Áudio salvo'); };
      mr.start(); $('#rec').textContent = '■ Parar'; $('#recst').textContent = 'Gravando…';
    } catch (e) { toast('Microfone indisponível'); }
  };
  cleanup = () => { app.oninput = null; if (mr && mr.state === 'recording') mr.stop(); };
}
/* ========== exportar (Word .docx e Markdown) ========== */
async function sermonBlocks(s, o) {
  const B = [], meta = [s.baseText, fmtDate(s.date), s.place, s.series && 'Série: ' + s.series, s.audience].filter(Boolean).join(' · ');
  B.push({ type: 'title', text: s.title || 'Pregação' }); if (meta) B.push({ type: 'meta', text: meta });
  const addVerses = async str => {
    if (!str) return;
    if (o.verses) (await versesFor(str)).forEach(v => B.push({ type: 'verse', ref: v.ref, text: v.text })); else B.push({ type: 'p', text: str, i: true });
  };
  if (o.verses && s.baseText) await addVerses(s.baseText);
  if (s.intro) { B.push({ type: 'h', level: 1, text: 'Introdução' }, { type: 'p', text: s.intro }); }
  for (const [i, t] of s.topics.entries()) {
    B.push({ type: 'h', level: 1, text: `${i + 1}. ${t.title || 'Tópico'}` });
    if (t.keyphrase) B.push({ type: 'p', text: t.keyphrase, b: true });
    await addVerses(t.verses);
    if (t.quote) B.push({ type: 'p', text: '“' + t.quote + '”', i: true });
    String(t.list || '').split('\n').filter(Boolean).forEach(x => B.push({ type: 'li', text: x }));
    if (o.details) {
      if (t.notes) B.push({ type: 'p', text: t.notes });
      if (t.application) B.push({ type: 'label', label: 'Aplicação', text: t.application });
      if (t.illustration) B.push({ type: 'label', label: 'Ilustração', text: t.illustration });
    }
  }
  if (s.conclusion) B.push({ type: 'h', level: 1, text: 'Conclusão' }, { type: 'p', text: s.conclusion });
  if (o.post && s.postNotes) B.push({ type: 'h', level: 1, text: 'Notas pós-pregação' }, { type: 'p', text: s.postNotes });
  return B;
}
function exportModal(s) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><b>Exportar “${esc(s.title) || 'pregação'}”</b>
   <div style="margin:10px 0"><label style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="checkbox" id="ev" style="width:auto" checked> incluir o texto dos versículos</label>
   <label style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="checkbox" id="ed" style="width:auto" checked> incluir observações, aplicação e ilustração</label>
   <label style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="checkbox" id="ep" style="width:auto"> incluir notas pós-pregação</label></div>
   <div class="row"><button id="ew">⬇ Word (.docx)</button><button class="sec" id="em">⬇ Markdown (.md)</button><button class="sec" id="ex">Fechar</button></div></div>`;
  document.body.appendChild(m); $('#ex', m).onclick = () => m.remove();
  const go = async kind => {
    const B = await sermonBlocks(s, { verses: $('#ev', m).checked, details: $('#ed', m).checked, post: $('#ep', m).checked });
    const name = (norm(s.title).slice(0, 40) || 'pregacao') + (kind === 'docx' ? '.docx' : '.md');
    const blob = kind === 'docx' ? new Blob([DocxLib.makeDocx(B)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) : new Blob([DocxLib.makeMarkdown(B)], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); toast('Arquivo gerado'); m.remove();
  };
  $('#ew', m).onclick = () => go('docx'); $('#em', m).onclick = () => go('md');
}
function printSermon(s) {
  let p = $('#print'); if (!p) { p = document.createElement('div'); p.id = 'print'; document.body.appendChild(p); }
  p.innerHTML = `<h1>${esc(s.title)}</h1><p>${esc(s.baseText)} · ${fmtDate(s.date)} · ${esc(s.place)} ${s.series ? '· Série: ' + esc(s.series) : ''}</p>
   ${s.intro ? `<h3>Introdução</h3><p>${esc(s.intro).replace(/\n/g, '<br>')}</p>` : ''}
   ${s.topics.map((t, i) => `<div class="t"><h3>${i + 1}. ${esc(t.title)}</h3><p><i>${esc(t.verses)}</i></p>${t.keyphrase ? `<p><b>${esc(t.keyphrase)}</b></p>` : ''}${t.quote ? `<p><i>“${esc(t.quote)}”</i></p>` : ''}${t.list ? `<ul>${t.list.split('\n').filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p>${esc(t.notes).replace(/\n/g, '<br>')}</p>${t.application ? `<p><b>Aplicação:</b> ${esc(t.application)}</p>` : ''}${t.illustration ? `<p><b>Ilustração:</b> ${esc(t.illustration)}</p>` : ''}</div>`).join('')}
   ${s.conclusion ? `<h3>Conclusão</h3><p>${esc(s.conclusion).replace(/\n/g, '<br>')}</p>` : ''}`;
  window.print();
}

/* ========== Slides ========== */
async function slidesView(id) {
  const s = getS(id); if (!s) { location.hash = '#/'; return; }
  projSermon = s;
  let cur = 0;
  const T = () => s.theme || (s.theme = JSON.parse(JSON.stringify(defTheme())));
  const saveT = debounce(() => saveS(s), 500);
  const restyle = () => { const sl = s.slides[cur]; applyStyle($('.slide'), themeStyle(sermonTheme(s), sl)); if (sl && lastSent && lastSent.title === sl.title) sendSlide(sl); };
  const draw = () => {
    const sl = s.slides[cur];
    app.innerHTML = `<div class="row"><h1 style="flex:1">Slides — ${esc(s.title)}</h1><a class="btn sec" href="#/s/${s.id}">← Editor</a><button id="gen">${s.slides.length ? 'Regerar do esboço' : 'Gerar do esboço'}</button><button class="sec" id="op">Abrir projetor</button></div>
    <p class="mute">Os slides são montados a partir dos tópicos e versículos (o texto bíblico é buscado na hora). Abra o projetor em outra janela/tela e arraste-a para o telão.</p>
    ${sl ? `<div class="slide"><h3>${esc(sl.title)}</h3><p>${esc(sl.body || (sl.kind === 'verse' ? '(texto do versículo aparece ao projetar)' : ''))}</p></div>
    <div class="row" style="margin:10px 0"><button class="sec" id="pv">◀</button><span>${cur + 1} / ${s.slides.length}</span><button class="sec" id="nx">▶</button><button id="pj">Projetar</button><button class="sec" id="bk">Tela preta</button></div>
    <div class="card"><label>Tipo</label><select id="k">${['title', 'point', 'verse', 'text'].map(k => `<option ${sl.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
    <label>Título (para tipo verse: a referência)</label><input id="tt" value="${esc(sl.title)}"><label>Texto</label><textarea id="bd">${esc(sl.body)}</textarea>
    <div class="row" style="margin-top:8px"><label class="btn sec sm" style="margin:0">🖼 Imagem só deste slide<input type="file" accept="image/*" hidden id="si"></label>${sl.img ? '<button class="sec sm" id="sx">Tirar imagem</button>' : ''}</div>
    <div class="row" style="margin-top:8px"><button class="sec sm" id="ad">+ Slide depois</button><button class="del sm" id="rm">Remover</button></div></div>` : '<p>Nenhum slide ainda.</p>'}
    <details class="card"><summary><b>🎨 Tema e fundo</b></summary>
     <div class="row" style="margin:8px 0">${Object.entries(THEMES).map(([k, t]) => `<button class="sm ${(sermonTheme(s).preset || 'classico') === k ? '' : 'sec'}" data-pr="${k}">${t.name}</button>`).join('')}</div>
     <div class="grid"><div><label>Fonte</label><select id="thf">${Object.entries(FONTS).map(([k, n]) => `<option value="${esc(k)}" ${(sermonTheme(s).font || 'Georgia, serif') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label>Alinhamento</label><select id="tha"><option value="center" ${sermonTheme(s).align !== 'left' ? 'selected' : ''}>Centro</option><option value="left" ${sermonTheme(s).align === 'left' ? 'selected' : ''}>Esquerda</option></select></div>
      <div><label>Tamanho do texto</label><input type="range" id="ths" min="0.7" max="1.6" step="0.05" value="${sermonTheme(s).scale || 1}"></div>
      <div><label>Escurecer imagem de fundo</label><input type="range" id="tho" min="0" max="0.85" step="0.05" value="${sermonTheme(s).overlay ?? 0.45}"></div></div>
     <div class="row" style="margin-top:8px"><label class="btn sec sm" style="margin:0">🖼 Imagem de fundo (todos)<input type="file" accept="image/*" hidden id="thi"></label>${sermonTheme(s).bgImage ? '<button class="sec sm" id="thx">Remover</button>' : ''}
      <label class="btn sec sm" style="margin:0">🏷 Logo<input type="file" accept="image/*" hidden id="thl"></label>${sermonTheme(s).logo ? '<button class="sec sm" id="thlx">Remover logo</button>' : ''}</div>
     <div class="row" style="margin-top:8px"><button class="sec sm" id="thd">Usar como padrão das novas pregações</button></div></details>
    <div class="row">${s.slides.map((x, i) => `<button class="sm ${i === cur ? '' : 'sec'}" data-i="${i}">${i + 1}</button>`).join('')}</div>`;
    $('#gen').onclick = async () => { if (!s.slides.length || confirm('Substituir os slides atuais?')) { s.slides = genSlides(s); cur = 0; await saveS(s); draw(); } };
    $('#op').onclick = openProjector;
    $$('[data-i]').forEach(b => b.onclick = () => { cur = +b.dataset.i; draw(); });
    $$('[data-pr]').forEach(b => b.onclick = () => { T().preset = b.dataset.pr; delete T().bgImage; saveS(s); draw(); });
    $('#thf').onchange = e => { T().font = e.target.value; saveS(s); restyle(); };
    $('#tha').onchange = e => { T().align = e.target.value; saveS(s); restyle(); };
    $('#ths').oninput = e => { T().scale = +e.target.value; saveT(); restyle(); };
    $('#tho').oninput = e => { T().overlay = +e.target.value; saveT(); restyle(); };
    $('#thi').onchange = async e => { if (e.target.files[0]) { T().bgImage = await imgData(e.target.files[0]); await saveS(s); draw(); } };
    $('#thl').onchange = async e => { if (e.target.files[0]) { T().logo = await imgData(e.target.files[0], 400, 'image/png'); await saveS(s); draw(); } };
    if ($('#thx')) $('#thx').onclick = () => { delete T().bgImage; saveS(s); draw(); };
    if ($('#thlx')) $('#thlx').onclick = () => { delete T().logo; saveS(s); draw(); };
    $('#thd').onclick = () => { localStorage.setItem('defTheme', JSON.stringify({ ...T(), logo: undefined })); toast('Tema definido como padrão'); };
    if (!sl) return;
    applyStyle($('.slide'), themeStyle(sermonTheme(s), sl));
    $('#si').onchange = async e => { if (e.target.files[0]) { sl.img = await imgData(e.target.files[0]); await saveS(s); draw(); } };
    if ($('#sx')) $('#sx').onclick = () => { delete sl.img; saveS(s); draw(); };
    $('#pv').onclick = () => { cur = Math.max(0, cur - 1); draw(); sendSlide(s.slides[cur]); };
    $('#nx').onclick = () => { cur = Math.min(s.slides.length - 1, cur + 1); draw(); sendSlide(s.slides[cur]); };
    $('#pj').onclick = () => sendSlide(sl); $('#bk').onclick = toggleBlack;
    const upd = debounce(() => saveS(s));
    $('#k').onchange = e => { sl.kind = e.target.value; upd(); };
    $('#tt').oninput = e => { sl.title = e.target.value; upd(); }; $('#bd').oninput = e => { sl.body = e.target.value; upd(); };
    $('#ad').onclick = () => { s.slides.splice(cur + 1, 0, { id: uid(), kind: 'text', title: 'Novo slide', body: '', topicId: '' }); cur++; saveS(s); draw(); };
    $('#rm').onclick = () => { s.slides.splice(cur, 1); cur = Math.max(0, cur - 1); saveS(s); draw(); };
  };
  kbActions = { slideNext: () => { if (s.slides.length) { cur = Math.min(s.slides.length - 1, cur + 1); draw(); sendSlide(s.slides[cur]); } }, slidePrev: () => { if (s.slides.length) { cur = Math.max(0, cur - 1); draw(); sendSlide(s.slides[cur]); } }, black: toggleBlack };
  draw();
}

/* ========== Modo pregação ========== */
async function preach(id) {
  const s = getS(id); if (!s) { location.hash = '#/'; return; }
  projSermon = s;
  let ti = -1, sec = 0, run = false, si = 0, iv = null;
  const planned = (s.planned || 30) * 60;
  const wake = navigator.wakeLock ? await navigator.wakeLock.request('screen').catch(() => null) : null;
  document.body.classList.add('preaching');
  app.innerHTML = `<div class="pbar"><a class="btn sec" href="#/s/${s.id}">← Sair</a><b class="ptitle">${esc(s.title)}</b>
    <span id="ck" class="mute"></span><div class="timer" id="tm">00:00</div><button id="tg" aria-label="Iniciar ou pausar o cronômetro">▶</button><button class="sec" id="tr" aria-label="Zerar cronômetro">↺</button>${document.documentElement.requestFullscreen ? '<button class="sec" id="fsb" aria-label="Tela cheia">⛶</button>' : ''}<button class="del" id="end">Encerrar</button></div>
    <div id="pace" class="mute"></div>
    <div class="preach"><div class="tnav" id="tn"></div><div class="card big" id="mn"></div></div>
    <div class="pfoot"><button class="sec" id="sp" aria-label="Slide anterior">◀ Slide</button><span id="sn" class="mute">–</span><button class="sec" id="sx" aria-label="Próximo slide">Slide ▶</button>
      <button class="sec" id="sb">Tela preta</button><button class="sec" id="op">📽 Projetor</button><button class="sec" id="bb">📖 Bíblia</button><button class="sec" id="fm">A−</button><button class="sec" id="fp">A+</button></div>`;
  let opened = 0, fs = matchMedia('(pointer:coarse)').matches ? 26 : 20;
  $('#mn').style.fontSize = fs + 'px';
  const pace = () => {
    const el = $('#pace'); if (!el || !s.topics.some(t => t.min)) return;
    let acc = 0, exp = s.topics.length - 1;
    for (let i = 0; i < s.topics.length; i++) { acc += (s.topics[i].min || 0) * 60; if (sec < acc) { exp = i; break; } }
    const cur = ti - 1; // ti 0 = introdução
    el.textContent = cur < 0 ? 'Ritmo: na introdução' : cur > exp ? `Ritmo: adiantado (agora seria o tópico ${exp + 1})` : cur < exp ? `Ritmo: atrasado (agora deveria estar no tópico ${exp + 1})` : 'Ritmo: no tempo ✔';
  };
  const tick = () => {
    if (!run && sec === 0 && ++opened >= 180) { run = true; $('#tg').textContent = '⏸'; toast('Cronômetro iniciado automaticamente'); }
    if (run) sec++;
    $('#ck').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.body.classList.toggle('over', sec > planned);
    pace();
    const t = $('#tm'); t.textContent = mmss(sec) + ' / ' + mmss(planned);
    t.className = 'timer' + (sec > planned ? ' r' : sec > planned * .75 ? ' y' : '');
  };
  iv = setInterval(tick, 1000); tick();
  const items = [{ k: 'Introdução', body: s.intro, t: null }, ...s.topics.map((t, i) => ({ k: `${i + 1}. ${t.title || 'Tópico'}`, t })), { k: 'Conclusão', body: s.conclusion, t: null }];
  $('#tn').innerHTML = items.map((x, i) => `<button data-n="${i}">${esc(x.k)}</button>`).join('');
  const sNum = () => $('#sn').textContent = s.slides.length ? `${si + 1}/${s.slides.length}` : 'sem slides';
  const go = async n => {
    ti = n; $$('#tn button').forEach((b, i) => b.classList.toggle('on', i === n));
    const it = items[n], t = it.t;
    if (!t) { $('#mn').innerHTML = `<h2>${esc(it.k)}</h2><div>${esc(it.body || '—').replace(/\n/g, '<br>')}</div>`; return; }
    $('#mn').innerHTML = `<h2>${esc(it.k)}</h2>${t.keyphrase ? `<div class="key">${esc(t.keyphrase)}</div>` : ''}${t.quote ? `<div class="quote">${esc(t.quote)}</div>` : ''}${t.list ? `<ul>${t.list.split('\n').filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<div id="vs" class="mute">carregando versículos…</div>
      <div>${esc(t.notes).replace(/\n/g, '<br>')}</div>${t.application ? `<p><b>Aplicação:</b> ${esc(t.application)}</p>` : ''}${t.illustration ? `<p><b>Ilustração:</b> ${esc(t.illustration)}</p>` : ''}`;
    const i = s.slides.findIndex(x => x.topicId === t.id); if (i >= 0) { si = i; sNum(); sendSlide(s.slides[si]); }
    const v = await versesFor(t.verses); if (ti === n) $('#vs').outerHTML = v.map(x => `<div class="verse"><b>${esc(x.ref)}</b> ${esc(x.text)}</div>`).join('');
  };
  $('#tn').onclick = e => { if (e.target.dataset.n !== undefined) go(+e.target.dataset.n); };
  $('#tg').onclick = () => { run = !run; $('#tg').textContent = run ? '⏸' : '▶'; };
  $('#tr').onclick = () => { sec = 0; opened = 0; tick(); };
  $('#fm').onclick = () => $('#mn').style.fontSize = (fs = Math.max(14, fs - 2)) + 'px';
  $('#fp').onclick = () => $('#mn').style.fontSize = (fs = Math.min(60, fs + 2)) + 'px';
  $('#op').onclick = openProjector;
  $('#sp').onclick = () => { if (s.slides.length) { si = Math.max(0, si - 1); sNum(); sendSlide(s.slides[si]); } };
  $('#sx').onclick = () => { if (s.slides.length) { si = Math.min(s.slides.length - 1, si + 1); sNum(); sendSlide(s.slides[si]); } };
  $('#sb').onclick = toggleBlack;
  $('#bb').onclick = () => bibleModal();
  $('#end').onclick = async () => {
    if (!confirm('Encerrar e registrar esta pregação como “pregada”?')) return;
    s.real = Math.max(1, Math.round(sec / 60)); s.status = 'pregada'; await saveS(s); toast('Registrada: ' + s.real + ' min'); location.hash = '#/s/' + s.id;
  };
  kbActions = { slideNext: () => $('#sx').click(), slidePrev: () => $('#sp').click(), black: toggleBlack, timerToggle: () => $('#tg').click(), bible: () => { if (!$('.modal')) bibleModal(); },
    topicNext: () => go(Math.min(items.length - 1, ti + 1)), topicPrev: () => go(Math.max(0, ti - 1)) };
  const swipe = (el, onLeft, onRight) => { // deslizar horizontalmente (ignora rolagem vertical)
    let x0 = 0, y0 = 0, t0 = 0;
    el.addEventListener('touchstart', e => { const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); }, { passive: true });
    el.addEventListener('touchend', e => { const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 < 800 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)(); }, { passive: true });
  };
  swipe($('#mn'), () => kbActions.topicNext(), () => kbActions.topicPrev());   // no conteúdo: troca de tópico
  swipe($('.pfoot'), () => kbActions.slideNext(), () => kbActions.slidePrev()); // na barra de baixo: troca de slide
  if ($('#fsb')) $('#fsb').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => toast('Tela cheia indisponível aqui; instale o app na tela inicial'));
  if (matchMedia('(pointer:coarse)').matches && !localStorage.getItem('swipeHint')) { localStorage.setItem('swipeHint', '1'); toast('Deslize no texto para trocar de tópico; na barra de baixo, para trocar de slide'); }
  sNum(); go(0);
  cleanup = () => { document.body.classList.remove('over', 'preaching'); clearInterval(iv); wake && wake.release(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
}
function bibleModal() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><div class="row"><input id="br" placeholder="ex.: Salmos 23 ou João 3:16-18" style="flex:1"><button id="bg">Buscar</button><button class="sec" id="bx">Fechar</button></div><div id="bo"></div></div>`;
  document.body.appendChild(m);
  const go = async () => {
    $('#bo', m).innerHTML = '<p class="mute">Carregando…</p>';
    try { const d = await getPassage($('#br', m).value); $('#bo', m).innerHTML = `<h3>${esc(d.ref)}</h3><button class="sm" id="bp">Projetar tudo</button>` + d.verses.map(v => `<p class="vv" data-n="${v.n}"><b>${v.n}</b> ${esc(v.t)}</p>`).join('');
      $('#bp', m).onclick = () => sendSlide({ kind: 'verse', title: d.ref, body: passageText(d) });
      $$('.vv', m).forEach(p => p.onclick = () => sendSlide({ kind: 'verse', title: d.ref.split(':')[0] + ':' + p.dataset.n, body: p.textContent.replace(/^\d+\s/, '') })); }
    catch (e) { $('#bo', m).innerHTML = `<p>${esc(e.message)}</p>`; }
  };
  $('#bg', m).onclick = go; $('#br', m).onkeydown = e => e.key === 'Enter' && go(); $('#bx', m).onclick = () => m.remove(); $('#br', m).focus();
}

/* ========== Bíblia ========== */
function biblia() {
  app.innerHTML = `<h1>Bíblia</h1><div class="card"><div class="row"><select id="ver" style="width:auto"><option value="acf">Almeida Corrigida Fiel (offline)</option>${customVers().map(v => `<option value="${esc(v.id)}">${esc(v.name)} (importada)</option>`).join('')}<option value="almeida">Almeida (online)</option><option value="kjv">King James (EN)</option></select>
   <input id="br" placeholder="ex.: João 3:16-18 ou Salmos 23" style="flex:1;min-width:200px"><button id="bg">Buscar</button></div><p class="mute">A Almeida Corrigida Fiel está embutida e funciona sem internet. As versões online precisam de internet na primeira consulta. Clique em um versículo para projetá-lo.</p></div>
   <details class="card"><summary><b>Importar minha versão da Bíblia</b></summary>
    <p class="mute">Use somente texto que você tem direito de usar (ex.: NVT, NVI). O arquivo é lido no seu aparelho e <b>não é enviado a lugar nenhum</b>. Formato JSON com os 66 livros em ordem bíblica: <code>[{"chapters":[["v1","v2"],…]},…]</code>, <code>[[["v1"]]]</code> ou <code>{"Gênesis":{"1":{"1":"texto"}}}</code>.</p>
    <div class="row"><input id="vn" placeholder="Nome (ex.: NVT)" style="flex:1"><label class="btn" style="margin:0">Escolher arquivo<input type="file" id="vf" accept=".json" hidden></label></div>
    <div id="vl">${customVers().map(v => `<div class="row" style="margin-top:6px"><span style="flex:1">${esc(v.name)}</span><button class="del sm" data-rm="${esc(v.id)}">Remover</button></div>`).join('')}</div></details>
   <div id="bo"></div>`;
  $('#vf').onchange = async e => {
    const name = $('#vn').value.trim(), f = e.target.files[0]; if (!f) return;
    if (!name) { toast('Digite o nome da versão antes'); e.target.value = ''; return; }
    try {
      const data = normalizeBible(JSON.parse((await f.text()).replace(/^﻿/, '')));
      const id = 'c:' + uid(); await dbPut('bible', { data }, 'custom|' + id);
      localStorage.setItem('customVers', JSON.stringify([...customVers(), { id, name }])); localStorage.setItem('ver', id); toast(name + ' importada'); biblia();
    } catch (err) { toast('Falhou: ' + err.message); }
  };
  $('#vl').onclick = async e => {
    const id = e.target.dataset.rm; if (!id || !confirm('Remover esta versão do aparelho?')) return;
    await dbDel('bible', 'custom|' + id); localStorage.setItem('customVers', JSON.stringify(customVers().filter(v => v.id !== id)));
    if (bibleVer() === id) localStorage.setItem('ver', 'acf'); biblia();
  };
  $('#ver').value = bibleVer(); $('#ver').onchange = e => localStorage.setItem('ver', e.target.value);
  const go = async () => {
    $('#bo').innerHTML = '<p class="mute">Carregando…</p>';
    try { const d = await getPassage($('#br').value); $('#bo').innerHTML = `<div class="card"><h2>${esc(d.ref)}</h2>` + d.verses.map(v => `<p class="vv" data-n="${v.n}" style="cursor:pointer"><b>${v.n}</b> ${esc(v.t)} <button class="sec sm" data-x="${v.n}" title="Referências cruzadas">🔗</button></p>`).join('') + '</div>';
      $$('.vv').forEach(p => p.onclick = e => { const bp = parseRef(d.ref); if (e.target.dataset.x) return xrefModal(`${bp.pt} ${bp.ch}:${p.dataset.n}`); sendSlide({ kind: 'verse', title: d.ref.split(':')[0] + ':' + p.dataset.n, body: p.textContent.replace(/^\d+\s/, '').replace(/\s*🔗$/, '') }); }); }
    catch (e) { $('#bo').innerHTML = `<p>${esc(e.message)}</p>`; }
  };
  $('#bg').onclick = go; $('#br').onkeydown = e => e.key === 'Enter' && go();
}

/* ========== Agenda + lembretes ========== */
function agenda() {
  const t = todayISO(), L = sermons.filter(s => s.date && s.date >= t && s.status !== 'pregada').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  app.innerHTML = `<h1>Agenda</h1><div class="card row"><span style="flex:1">Lembretes no dia da pregação (enquanto o app estiver aberto).</span><button id="nt">Ativar notificações</button></div>
  ${L.length ? L.map(s => `<a class="card item" href="#/s/${s.id}"><b>${fmtDate(s.date)} ${esc(s.time)}</b> — ${esc(s.title) || '(sem título)'}<div class="mute">${esc(s.baseText)} ${s.place ? '· ' + esc(s.place) : ''}</div></a>`).join('') : '<p class="mute">Nenhuma pregação agendada. Defina a data no editor.</p>'}`;
  $('#nt').onclick = async () => toast((await Notification.requestPermission()) === 'granted' ? 'Notificações ativadas' : 'Permissão negada');
}
function reminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const done = JSON.parse(localStorage.getItem('notified') || '{}'), now = new Date();
  sermons.forEach(s => {
    if (s.status === 'pregada' || s.date !== todayISO()) return;
    const at = s.time ? new Date(s.date + 'T' + s.time) : null, k = s.id + (at ? 'h' : 'd');
    const due = at ? (at - now < 3600e3 && at - now > 0) : now.getHours() >= 7;
    if (due && !done[k]) { new Notification('Pregação hoje: ' + (s.title || ''), { body: (s.time ? s.time + ' · ' : '') + s.baseText }); done[k] = 1; }
  });
  dueFollow().forEach(p => { const k = 'p' + p.id + todayISO(); if (!done[k]) { new Notification('Retorno: ' + (p.person || p.category), { body: p.text.slice(0, 100) }); done[k] = 1; } });
  localStorage.setItem('notified', JSON.stringify(done));
}

/* ========== Plano de leitura + diário ========== */
const getPlans = () => JSON.parse(localStorage.getItem('plans') || '[]');
const setPlans = p => { if (typeof syncList === 'function') syncList('plan', JSON.parse(localStorage.getItem('plans') || '[]'), p); localStorage.setItem('plans', JSON.stringify(p)); };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dayIndex = pl => Math.floor((new Date(todayISO() + 'T12:00') - new Date(pl.start + 'T12:00')) / 864e5);
function dayLabel(day) {
  const out = [];
  day.forEach(([b, c]) => { const l = out[out.length - 1]; if (l && l.b === b && l.e === c - 1) l.e = c; else out.push({ b, s: c, e: c }); });
  return out.map(g => `${BOOKS[g.b][0]} ${g.s}${g.e > g.s ? '–' + g.e : ''}`).join('; ');
}
async function splitDays(chs, n) { // divide capítulos em n dias, equilibrando pelo nº de versículos
  const acf = await loadLocal('acf'), w = chs.map(([b, c]) => acf[b][c - 1].length), total = w.reduce((a, x) => a + x, 0);
  const days = [[]]; let d = 0, acc = 0;
  chs.forEach((x, i) => {
    if (days[d].length && d < n - 1 && (acc >= total * (d + 1) / n || chs.length - i <= n - 1 - d)) { d++; days[d] = []; }
    days[d].push(x); acc += w[i];
  });
  return days;
}
async function buildPlan(kind, start, n, from, to) {
  const acf = await loadLocal('acf'), range = (a, z) => { const r = []; for (let b = a; b <= z; b++) for (let ch = 1; ch <= acf[b].length; ch++) r.push([b, ch]); return r; };
  const T = {
    ano: ['Bíblia em 1 ano', () => range(0, 65), 365], nt: ['Novo Testamento em 90 dias', () => range(39, 65), 90], ev: ['Evangelhos em 30 dias', () => range(39, 42), 30],
    cust: [`${BOOKS[from][0]} a ${BOOKS[to][0]}`, () => range(from, to), n]
  };
  if (kind === 'sp') { // Salmos (5 por dia) + Provérbios (capítulo do dia)
    const days = []; for (let d = 1; d <= 30; d++) { const day = []; for (let k = 0; k < 5; k++) day.push([18, (d - 1) * 5 + k + 1]); day.push([19, d]); if (d === 30) day.push([19, 31]); days.push(day); }
    return { id: uid(), name: 'Salmos e Provérbios em 30 dias', start, days, done: {}, notes: {} };
  }
  const [name, f, def] = T[kind], chs = f(), nn = Math.max(1, Math.min(n || def, chs.length));
  return { id: uid(), name, start, days: await splitDays(chs, nn), done: {}, notes: {} };
}
const streak = pl => { let s = 0, i = dayIndex(pl); if (!pl.done[i]) i--; while (i >= 0 && pl.done[i]) { s++; i--; } return s; };
async function readModal(day) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><div class="row"><b style="flex:1">${esc(dayLabel(day))}</b><button class="sec" id="rx">Fechar</button></div><div id="ro"><p class="mute">Carregando…</p></div></div>`;
  document.body.appendChild(m); $('#rx', m).onclick = () => m.remove();
  let html = '';
  for (const [b, ch] of day) {
    try { const d = await getPassage(`${BOOKS[b][0]} ${ch}`); html += `<h3>${esc(d.ref)}</h3>` + d.verses.map(v => `<p style="margin:4px 0"><b>${v.n}</b> ${esc(v.t)}</p>`).join(''); }
    catch (e) { html += `<p>${esc(e.message)}</p>`; }
  }
  $('#ro', m).innerHTML = html;
}
function todayReading() { // para a tela inicial
  const L = getPlans().map(pl => ({ pl, i: dayIndex(pl) })).filter(x => x.i >= 0 && x.i < x.pl.days.length && !x.pl.done[x.i]);
  return L[0];
}
async function plano(id) {
  const plans = getPlans(), pl = plans.find(x => x.id === id);
  if (id && !pl) { location.hash = '#/plano'; return; }
  if (!pl) { // lista + novo plano
    app.innerHTML = `<h1>Plano de leitura</h1>
     <details class="card" ${plans.length ? '' : 'open'}><summary><b>+ Novo plano</b></summary>
      <label>Modelo</label><select id="pk"><option value="ano">Bíblia em 1 ano</option><option value="nt">Novo Testamento em 90 dias</option><option value="ev">Evangelhos em 30 dias</option><option value="sp">Salmos e Provérbios em 30 dias</option><option value="cust">Personalizado (de um livro a outro)</option></select>
      <div id="pc" class="grid" style="display:none"><div><label>Do livro</label><select id="pf">${BOOKS.map((b, i) => `<option value="${i}">${b[0]}</option>`).join('')}</select></div>
       <div><label>Até o livro</label><select id="pt">${BOOKS.map((b, i) => `<option value="${i}" ${i === 65 ? 'selected' : ''}>${b[0]}</option>`).join('')}</select></div>
       <div><label>Em quantos dias</label><input id="pn" type="number" min="1" value="60"></div></div>
      <label>Data de início</label><input id="ps" type="date" value="${todayISO()}"><div style="margin-top:10px"><button id="pg">Criar plano</button></div></details>
     <div id="pls">${plans.length ? plans.map(p => { const done = Object.values(p.done).filter(Boolean).length, i = dayIndex(p.start ? p : p);
       return `<a class="card item" href="#/plano/${p.id}"><b>${esc(p.name)}</b><div class="mute">${done}/${p.days.length} dias lidos · início ${fmtDate(p.start)}${streak(p) ? ' · 🔥 ' + streak(p) + ' dia(s) seguidos' : ''}</div>
       <div style="background:var(--line);border-radius:5px;margin-top:6px"><div class="bar" style="width:${Math.round(done / p.days.length * 100)}%"></div></div>${i >= 0 && i < p.days.length ? `<div style="margin-top:6px">Hoje: ${esc(dayLabel(p.days[i]))}</div>` : ''}</a>`; }).join('') : '<p class="mute">Nenhum plano ainda.</p>'}</div>`;
    $('#pk').onchange = e => $('#pc').style.display = e.target.value === 'cust' ? 'grid' : 'none';
    $('#pg').onclick = async () => {
      const k = $('#pk').value, from = +$('#pf').value, to = +$('#pt').value;
      if (k === 'cust' && from > to) return toast('O livro inicial vem depois do final');
      const np = await buildPlan(k, $('#ps').value || todayISO(), +$('#pn').value, from, to);
      setPlans([...getPlans(), np]); location.hash = '#/plano/' + np.id;
    };
    return;
  }
  let sel = Math.max(0, Math.min(pl.days.length - 1, dayIndex(pl)));
  const save = () => setPlans(getPlans().map(x => x.id === pl.id ? pl : x));
  const draw = () => {
    const done = Object.values(pl.done).filter(Boolean).length, ti = dayIndex(pl), exp = Math.max(0, Math.min(pl.days.length, ti + 1));
    const behind = exp - Object.keys(pl.done).filter(k => pl.done[k] && +k < exp).length;
    app.innerHTML = `<div class="row"><a class="btn sec" href="#/plano">← Planos</a><h1 style="flex:1;margin:0">${esc(pl.name)}</h1><button class="del sm" id="dp">Excluir plano</button></div>
     <div class="card"><div class="row"><b>${done}/${pl.days.length} dias lidos (${Math.round(done / pl.days.length * 100)}%)</b><span>${streak(pl) ? '🔥 ' + streak(pl) + ' seguido(s)' : ''}</span><span class="mute">${ti < 0 ? 'começa em ' + fmtDate(pl.start) : behind > 0 ? `${behind} dia(s) em atraso` : 'em dia ✔'}</span></div>
      <div style="background:var(--line);border-radius:5px;margin-top:8px"><div class="bar" style="width:${Math.round(done / pl.days.length * 100)}%"></div></div></div>
     <div class="card"><div class="row"><b style="flex:1">Dia ${sel + 1} · ${fmtDate(addDays(pl.start, sel))}${sel === ti ? ' (hoje)' : ''}</b><button class="sec" id="rd">📖 Ler</button><button id="mk">${pl.done[sel] ? '✔ Lido (desmarcar)' : 'Marcar como lido'}</button></div>
      <div style="margin:6px 0">${esc(dayLabel(pl.days[sel]))}</div><label>Diário — o que Deus falou comigo hoje</label><textarea id="dn" style="min-height:110px">${esc(pl.notes[sel] || '')}</textarea></div>
     <h2>Todos os dias</h2><div id="dl">${pl.days.map((d, i) => `<div class="card row" data-i="${i}" style="padding:8px 12px;cursor:pointer;${i === sel ? 'border-color:var(--acc)' : ''}"><input type="checkbox" style="width:auto" data-ck="${i}" ${pl.done[i] ? 'checked' : ''}><span style="flex:1">Dia ${i + 1} · ${fmtDate(addDays(pl.start, i))} — ${esc(dayLabel(d))}</span>${pl.notes[i] ? '📝' : ''}</div>`).join('')}</div>`;
    $('#rd').onclick = () => readModal(pl.days[sel]);
    $('#mk').onclick = () => { pl.done[sel] = !pl.done[sel]; save(); draw(); };
    $('#dn').oninput = debounce(e => { pl.notes[sel] = e.target.value; save(); toast('Diário salvo'); });
    $('#dp').onclick = () => { if (confirm('Excluir este plano e o diário dele?')) { setPlans(getPlans().filter(x => x.id !== pl.id)); location.hash = '#/plano'; } };
    $('#dl').onclick = e => { const k = e.target.dataset.ck; if (k !== undefined) { pl.done[k] = e.target.checked; save(); draw(); return; } const r = e.target.closest('[data-i]'); if (r) { sel = +r.dataset.i; draw(); scrollTo(0, 0); } };
  };
  draw();
}

/* ========== calendário de datas especiais (calculado no aparelho) ========== */
const iso = d => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const plusDays = (d, n) => new Date(d.getTime() + n * 864e5);
function easter(y) { // algoritmo de Meeus/Jones/Butcher
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}
const nthSunday = (y, m, n) => { const first = utc(y, m, 1); return plusDays(first, (7 - first.getUTCDay()) % 7 + (n - 1) * 7); };
function specialDates(y) {
  const E = easter(y), xmas = utc(y, 12, 25), adv4 = plusDays(xmas, -(xmas.getUTCDay() || 7)), adv1 = plusDays(adv4, -21);
  const L = [
    [utc(y, 1, 1), 'Ano Novo', 'Renovo e esperança para o novo ano', 'Lamentações 3:22-23'],
    [plusDays(E, -46), 'Quarta-feira de Cinzas (início da Quaresma)', 'Arrependimento e volta para Deus', 'Joel 2:12-13'],
    [utc(y, 3, 8), 'Dia Internacional da Mulher', 'A mulher de valor', 'Provérbios 31:10-31'],
    [plusDays(E, -7), 'Domingo de Ramos', 'O Rei que entra em Jerusalém', 'Mateus 21:1-11'],
    [plusDays(E, -2), 'Sexta-feira da Paixão', 'A cruz: tudo está consumado', 'João 19:16-30'],
    [E, 'Páscoa', 'Ressurreição: ele vive!', 'Lucas 24:1-12'],
    [nthSunday(y, 5, 2), 'Dia das Mães', 'O amor e a fé de uma mãe', 'Provérbios 31:25-31'],
    [plusDays(E, 49), 'Pentecostes', 'O Espírito Santo derramado', 'Atos 2:1-13'],
    [utc(y, 6, 12), 'Dia dos Namorados', 'Amor forte como a morte', 'Cantares 8:6-7'],
    [nthSunday(y, 8, 2), 'Dia dos Pais', 'O Pai que nos ensina a ser pais', 'Salmos 103:13'],
    [utc(y, 9, 1), 'Setembro Amarelo (início)', 'Esperança para quem sofre', 'Salmos 34:18'],
    [utc(y, 10, 1), 'Dia do Idoso', 'Honrar quem tem cabelos brancos', 'Salmos 71:17-18'],
    [utc(y, 10, 12), 'Dia das Crianças', 'Deixai vir a mim as crianças', 'Marcos 10:13-16'],
    [utc(y, 10, 31), 'Dia da Reforma', 'Somente a graça, somente a fé', 'Romanos 1:16-17'],
    [adv1, 'Advento (1º domingo)', 'Esperança: o Rei vem', 'Isaías 9:6-7'],
    [nthSunday(y, 12, 2), 'Dia Nacional da Bíblia', 'A Palavra é lâmpada para os pés', 'Salmos 119:105'],
    [xmas, 'Natal', 'Deus conosco', 'Lucas 2:1-20'],
    [utc(y, 12, 31), 'Culto de Virada / Fim de Ano', 'Gratidão: até aqui nos ajudou o Senhor', '1 Samuel 7:12']
  ].map(([d, name, theme, ref]) => ({ date: iso(d), name, theme, ref, custom: false }));
  getCustomDates().forEach(cd => L.push({ date: `${y}-${cd.md}`, name: cd.name, theme: cd.theme || '', ref: cd.ref || '', custom: true, id: cd.id }));
  return L.sort((a, b) => a.date.localeCompare(b.date));
}
const getCustomDates = () => JSON.parse(localStorage.getItem('customDates') || '[]');
const setCustomDates = l => { if (typeof syncList === 'function') syncList('cdate', JSON.parse(localStorage.getItem('customDates') || '[]'), l); localStorage.setItem('customDates', JSON.stringify(l)); };
const sermonOn = (date, name) => sermons.find(s => s.date === date && (norm(s.title).includes(norm(name).slice(0, 8)) || (s.tags || []).includes('data especial')));
function nextSpecial(maxDays) { // próxima data especial sem pregação planejada
  const t = todayISO(), lim = addDays(t, maxDays);
  return [...specialDates(+t.slice(0, 4)), ...specialDates(+t.slice(0, 4) + 1)].find(e => e.date >= t && e.date <= lim && !sermons.some(s => s.date === e.date));
}
function datas(yr) {
  const y = +yr || new Date().getFullYear(), L = specialDates(y), t = todayISO();
  const wd = d => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long' });
  app.innerHTML = `<div class="row"><h1 style="flex:1">Datas especiais ${y}</h1><a class="btn sec" href="#/datas/${y - 1}">◀</a><a class="btn sec" href="#/datas/${y + 1}">▶</a><button id="dn">+ Data própria</button></div>
   <p class="mute">Datas móveis (Páscoa, Pentecostes, Advento, Dia das Mães…) calculadas automaticamente. Clique em “Planejar” para criar a pregação já com data, tema e texto sugeridos.</p>
   ${L.map(e => { const s = sermonOn(e.date, e.name), d = Math.round((new Date(e.date + 'T12:00') - new Date(t + 'T12:00')) / 864e5);
     return `<div class="card" ${d >= 0 && d <= 30 ? 'style="border-color:var(--acc)"' : ''}><div class="row"><b style="flex:1">${fmtDate(e.date)} <span class="mute">(${wd(e.date)})</span> — ${esc(e.name)}</b><span class="mute">${d === 0 ? 'hoje' : d > 0 ? 'em ' + d + ' dia(s)' : 'passou'}</span></div>
      ${e.theme ? `<div class="mute">Tema sugerido: ${esc(e.theme)}${e.ref ? ' · ' + esc(e.ref) : ''}</div>` : ''}
      <div class="row" style="margin-top:6px">${s ? `<a class="btn sm sec" href="#/s/${s.id}">✔ Pregação: ${esc(s.title) || '(sem título)'}</a>` : `<button class="sm" data-p="${esc(e.date)}|${esc(e.name)}|${esc(e.theme)}|${esc(e.ref)}">Planejar pregação</button>`}${e.custom ? `<button class="sm del" data-x="${e.id}">Remover data</button>` : ''}</div></div>`; }).join('')}`;
  app.onclick = async ev => {
    const p = ev.target.dataset.p, x = ev.target.dataset.x;
    if (p) { const [date, name, theme, ref] = p.split('|'), s = blank(); Object.assign(s, { title: name, baseText: ref, date, tags: ['data especial'] });
      if (theme) s.topics.push(Object.assign(blankTopic(), { title: theme, verses: ref })); await saveS(s); location.hash = '#/s/' + s.id; }
    if (x && confirm('Remover esta data própria?')) { setCustomDates(getCustomDates().filter(d => d.id !== x)); datas(y); }
  };
  $('#dn').onclick = () => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div><h2>Data própria (repete todo ano)</h2><label>Nome (ex.: Aniversário da igreja)</label><input id="cn"><div class="grid"><div><label>Dia/mês</label><input type="date" id="cd"></div><div><label>Texto sugerido (opcional)</label><input id="cr"></div></div><label>Tema sugerido (opcional)</label><input id="ct"><div class="row" style="margin-top:12px"><button id="cs">Salvar</button><button class="sec" id="cx">Cancelar</button></div></div>`;
    document.body.appendChild(m); $('#cx', m).onclick = () => m.remove();
    $('#cs', m).onclick = () => { const name = $('#cn', m).value.trim(), d = $('#cd', m).value; if (!name || !d) return toast('Informe nome e data');
      setCustomDates([...getCustomDates(), { id: uid(), name, md: d.slice(5), ref: $('#cr', m).value.trim(), theme: $('#ct', m).value.trim() }]); m.remove(); datas(y); };
  };
}

/* ========== Estatísticas ========== */
function stats() {
  const done = sermons.filter(s => s.status === 'pregada'), real = done.filter(s => s.real);
  const byBook = {}; sermons.forEach(s => { const p = parseRef(s.baseText); if (p) byBook[p.pt] = (byBook[p.pt] || 0) + 1; });
  const top = Object.entries(byBook).sort((a, b) => b[1] - a[1]), mx = top[0] ? top[0][1] : 1;
  const missing = BOOKS.map(b => b[0]).filter(b => !byBook[b]);
  app.innerHTML = `<h1>Estatísticas</h1><div class="grid">
   <div class="card"><div class="stat">${sermons.length}</div>pregações no acervo</div><div class="card"><div class="stat">${done.length}</div>já pregadas</div>
   <div class="card"><div class="stat">${real.length ? Math.round(real.reduce((a, s) => a + s.real, 0) / real.length) : '–'} min</div>duração média real</div></div>
   <h2>Livros mais pregados (pelo texto-base)</h2><div class="card">${top.length ? top.map(([b, n]) => `<div class="row"><span style="width:140px">${esc(b)}</span><div class="bar" style="width:${n / mx * 60}%"></div><span>${n}</span></div>`).join('') : '<span class="mute">Sem dados ainda.</span>'}</div>
   <h2>Livros ainda não pregados</h2><div class="card mute">${missing.length === 66 ? 'Todos ainda.' : missing.join(' · ')}</div>`;
}

/* ========== Backup ========== */
function backup() {
  app.innerHTML = `<h1>Backup</h1><div class="card"><p>Seus dados ficam <b>somente neste aparelho/navegador</b>. Exporte com frequência.</p>
   <div class="row"><button id="ex">⬇ Exportar tudo (JSON)</button><label class="btn sec" style="margin:0">⬆ Importar<input type="file" id="im" accept=".json" hidden></label><a class="btn sec" href="#/ajustes">Backup automático e pasta</a></div>
   <p class="mute">Nota: gravações de áudio não entram no JSON (ficam apenas no aparelho).</p></div>`;
  $('#ex').onclick = downloadBackup;
  $('#im').onchange = async e => { try { toast((await applyBackup(JSON.parse(await e.target.files[0].text()))) + ' pregações importadas'); } catch { toast('Arquivo inválido'); } };
}

/* ========== tema ========== */
const applyTheme = t => t ? document.documentElement.dataset.theme = t : delete document.documentElement.dataset.theme;
applyTheme(localStorage.getItem('theme'));
$('#th').onclick = () => { const dark = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')) === 'dark'; const n = dark ? 'light' : 'dark'; localStorage.setItem('theme', n); applyTheme(n); };

/* ========== início ========== */
(async () => {
  sermons = await dbAll('sermons'); ilus = await dbAll('ilus'); pray = await dbAll('pray');
  addEventListener('hashchange', route); route();
  reminders(); setInterval(reminders, 60000);
  if (typeof syncStart === 'function') syncStart();
  autoBackup().catch(e => console.warn('backup automático', e)); setInterval(() => autoBackup().catch(() => {}), 3600e3);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
})();
