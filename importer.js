'use strict';
/* Importador de pregações: Word (.docx), PDF (pdf.js em vendor/) e texto. Tudo no aparelho, sem enviar nada a servidor. */

/* ---------- leitura de arquivos ---------- */
async function inflateRaw(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function zipEntry(buf, wanted) { // lê uma entrada de um ZIP (store ou deflate)
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('não parece um arquivo .docx (ZIP inválido)');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if (name === wanted) {
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(start, start + csize);
      if (method === 0) return data; if (method === 8) return inflateRaw(data); throw new Error('compressão do .docx não suportada');
    }
  }
  throw new Error('conteúdo do Word não encontrado');
}
async function readDocx(buf) {
  const xml = new TextDecoder().decode(await zipEntry(buf, 'word/document.xml')), doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML do Word ilegível');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', raw = [];
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    let text = '', allBold = true, any = false, sz = 0;
    for (const r of p.getElementsByTagNameNS(W, 'r')) {
      const t = [...r.childNodes].map(n => n.localName === 't' ? n.textContent : n.localName === 'tab' ? ' ' : n.localName === 'br' ? ' ' : '').join('');
      text += t; if (!t.trim()) continue; any = true;
      const b = r.getElementsByTagNameNS(W, 'b')[0], bv = b && b.getAttributeNS(W, 'val'); if (!b || bv === '0' || bv === 'false') allBold = false;
      const z = r.getElementsByTagNameNS(W, 'sz')[0]; if (z && !sz) sz = +z.getAttributeNS(W, 'val') || 0;
    }
    const st = p.getElementsByTagNameNS(W, 'pStyle')[0], style = st ? st.getAttributeNS(W, 'val') : '';
    text = text.replace(/\s+/g, ' ').trim(); if (!text) continue;
    raw.push({ text, style, sz, allBold: any && allBold, list: !!p.getElementsByTagNameNS(W, 'numPr')[0] || /^(List|Lista|Bullet|Marcador)/i.test(style) });
  }
  const sizes = raw.map(r => r.sz).filter(Boolean).sort((a, b) => a - b), med = sizes[sizes.length >> 1] || 22;
  return raw.map(r => ({ text: r.text, list: r.list, head: /^(Heading|Ttulo|Título|Title|Subtitle)/i.test(r.style) || (r.allBold && r.text.length <= 90 && (r.sz > med || !/[.!?:]$/.test(r.text))) }));
}
let pdfReady = null;
function loadPdfJs() {
  return pdfReady || (pdfReady = new Promise((res, rej) => {
    if (window.pdfjsLib) return res();
    const s = document.createElement('script'); s.src = 'vendor/pdf.min.js';
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(); };
    s.onerror = () => rej(new Error('biblioteca de PDF não carregou')); document.head.appendChild(s);
  }));
}
async function readPdf(buf) {
  await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise, lines = [];
  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const tc = await (await pdf.getPage(pn)).getTextContent(), rows = [];
    tc.items.forEach(it => {
      if (!it.str) return; const y = it.transform[5], h = Math.abs(it.transform[3]) || it.height;
      let row = rows.find(r => Math.abs(r.y - y) < 2.5); if (!row) rows.push(row = { y, h: 0, items: [] });
      row.items.push({ x: it.transform[4], s: it.str, w: it.width }); row.h = Math.max(row.h, h);
    });
    rows.sort((a, b) => b.y - a.y).forEach(r => {
      r.items.sort((a, b) => a.x - b.x); let t = '';
      r.items.forEach((it, i) => { if (i && it.x - (r.items[i - 1].x + r.items[i - 1].w) > 1.5 && !t.endsWith(' ') && !it.s.startsWith(' ')) t += ' '; t += it.s; });
      t = t.replace(/\s+/g, ' ').trim(); if (t) lines.push({ text: t, y: r.y, h: r.h, page: pn });
    });
  }
  if (lines.reduce((a, l) => a + l.text.length, 0) < 30) throw new Error('PDF sem texto (provavelmente escaneado; o app não faz OCR)');
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const mh = med(lines.map(l => l.h)), gaps = lines.slice(1).map((l, i) => lines[i].page === l.page ? lines[i].y - l.y : 0).filter(g => g > 0), mg = gaps.length ? med(gaps) : mh * 1.3;
  const paras = []; let cur = null;
  lines.forEach((l, i) => {
    const prev = lines[i - 1], big = l.h > mh * 1.15, bullet = /^[•\-–*·]\s/.test(l.text), num = /^(\d{1,2}|[IVX]{1,5})[.)]\s/.test(l.text);
    const label = /^(aplica[cç][aã]o|ilustra[cç][aã]o|observa[cç][aã]o|observa[cç][õo]es|frase[- ]chave|cita[cç][aã]o|conclus[aã]o|introdu[cç][aã]o|texto)\s*[:\-–]/i.test(l.text);
    if (!cur || big || cur.head || bullet || num || label || (prev && prev.page === l.page && prev.y - l.y > mg * 1.45)) paras.push(cur = { text: l.text, head: big && l.text.length <= 100, list: bullet });
    else cur.text += ' ' + l.text;
  });
  return paras;
}
const readPlain = txt => txt.split(/\r?\n/).map(t => t.trim()).filter(Boolean).map(t => ({ text: t.replace(/^#+\s*/, ''), head: /^#+\s/.test(t), list: /^[-*•]\s/.test(t) }));

/* ---------- reconhecimento da estrutura ---------- */
const REFRE = /(?:\b[123]\s?)?[A-Za-zÀ-ÿ]{2,}\.?\s*\d{1,3}\s*[:.]\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?/g;
function findRefs(text) {
  const out = []; (String(text).match(REFRE) || []).forEach(m => { const p = parseRef(m); if (p) { const r = `${p.pt} ${p.ch}${p.v ? ':' + p.v : ''}`; if (!out.includes(r)) out.push(r); } }); return out;
}
function refOnly(text) { // o parágrafo é só uma ou mais referências?
  const t = text.trim(), whole = parseRef(t.replace(/[.;,]+$/, '')); if (whole) return [`${whole.pt} ${whole.ch}${whole.v ? ':' + whole.v : ''}`];
  const refs = findRefs(t); return refs.length && !t.replace(REFRE, '').replace(/[\s;,.()\-–]+/g, '') ? refs : null;
}
function structure(paras, fname) {
  const warn = [], first = paras[0], s = { title: '', baseText: '', intro: '', conclusion: '', topics: [] };
  let list = paras;
  if (first && first.text.length <= 140 && !first.list) { s.title = first.text; list = paras.slice(1); } else s.title = fname.replace(/\.[^.]+$/, '');
  const hasHeads = list.some(p => p.head), bullet = /^[•\-–*·]\s*/;
  const numbered = t => /^(\d{1,2}|[IVX]{1,5})\s*[.)\-–:]\s*\S/.test(t), caps = t => t.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 4 && t === t.toUpperCase() && !/[.!?]$/.test(t);
  const isHead = p => !p.list && p.text.length <= 100 && (p.head || (!hasHeads && (numbered(p.text) || caps(p.text))));
  const secRe = { intro: /^(introdu[cç][aã]o|abertura)\s*(?:[:\-–]\s*(.*))?$/i, conclusion: /^(conclus[aã]o|apelo|encerramento|considera[cç][õo]es finais)\s*(?:[:\-–]\s*(.*))?$/i };
  const labelRe = /^(aplica[cç][aã]o|ilustra[cç][aã]o|observa[cç][aã]o|observa[cç][õo]es|frase[- ]chave|cita[cç][aã]o)\s*[:\-–]\s*(.+)$/i;
  const fieldOf = k => { k = k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return k.startsWith('aplic') ? 'application' : k.startsWith('ilus') ? 'illustration' : k.startsWith('obs') ? 'notes' : k.startsWith('frase') ? 'keyphrase' : 'quote'; };
  let kind = 'intro', cur = null; const intro = [], concl = [], add = (o, k, v) => { o[k] = o[k] ? o[k] + '\n' + v : v; };
  for (const p of list) {
    const t = p.text; let m;
    if (!s.baseText && !s.topics.length && !p.list) {
      const lab = t.match(/^(texto(?:[ -]base|[ -]b[ií]blico)?|leitura|passagem|base b[ií]blica)\s*[:\-–]\s*(.+)$/i), r = refOnly(lab ? lab[2] : t);
      if (r && (lab || t.length <= 60)) { s.baseText = (lab ? lab[2] : t).trim().replace(/[.;]+$/, ''); continue; }
      const seg = t.split(' · ')[0]; // linha de metadados do próprio app: "Salmos 23 · 02/10/2026 · local"
      if (t.includes(' · ') && refOnly(seg)) { s.baseText = seg.trim(); continue; }
    }
    if (s.baseText && !s.topics.length && t.startsWith(s.baseText)) continue; // bloco do versículo-base repetido (exportação do app)
    if ((m = t.match(secRe.intro)) && t.length <= 60) { kind = 'intro'; cur = null; if (m[2]) intro.push(m[2]); continue; }
    if ((m = t.match(secRe.conclusion)) && (t.length <= 60 || p.head)) { kind = 'conclusion'; cur = null; if (m[2]) concl.push(m[2]); continue; }
    if (cur && (m = t.match(labelRe))) { add(cur, fieldOf(m[1]), m[2]); continue; }
    if (isHead(p)) { cur = { id: uid(), title: t.replace(/^(\d{1,2}|[IVX]{1,5}|t[óo]pico\s*\d*)\s*[.)\-–:]?\s*/i, '').trim() || t, verses: '', min: null, keyphrase: '', quote: '', list: '', notes: '', application: '', illustration: '', _v: [] }; s.topics.push(cur); kind = 'topic'; continue; }
    if (kind === 'conclusion') { concl.push(t); continue; }
    if (!cur) { intro.push(t); continue; }
    const refs = refOnly(t);
    if (p.list || bullet.test(t)) add(cur, 'list', t.replace(bullet, '')); else if (refs) cur._v.push(...refs); else add(cur, 'notes', t);
  }
  s.intro = intro.join('\n\n'); s.conclusion = concl.join('\n\n');
  s.topics.forEach(t => { const v = [...t._v]; findRefs([t.title, t.notes, t.list, t.application].join(' ')).forEach(r => { if (!v.includes(r)) v.push(r); }); t.verses = v.join('; '); delete t._v; });
  if (!s.topics.length) warn.push('não encontrei tópicos; todo o texto foi para a Introdução (confira o texto original)');
  if (!s.baseText) warn.push('texto-base não identificado');
  return { s, warn };
}
async function parseFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase(), buf = await file.arrayBuffer();
  let paras;
  if (ext === 'docx') paras = await readDocx(buf);
  else if (ext === 'pdf') paras = await readPdf(buf);
  else if (ext === 'txt' || ext === 'md') paras = readPlain(new TextDecoder().decode(buf));
  else if (ext === 'doc') throw new Error('formato .doc antigo; abra no Word e salve como .docx');
  else throw new Error('tipo de arquivo não suportado (use .docx, .pdf ou .txt)');
  if (!paras.length) throw new Error('arquivo sem texto');
  const r = structure(paras, file.name); r.s.importedText = paras.map(p => p.text).join('\n\n'); return r;
}

/* ---------- tela de importação ---------- */
function importModal() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div style="max-width:720px"><div class="row"><b style="flex:1">Importar pregações (Word, PDF ou texto)</b><button class="sec" id="ix">Fechar</button></div>
   <p class="mute">Escolha um ou vários arquivos. O app tenta reconhecer título, texto-base, introdução, tópicos, versículos, aplicação, ilustração e conclusão; o texto original fica guardado em cada pregação para você conferir. Tudo é lido neste aparelho. PDFs escaneados (imagem) não funcionam.</p>
   <label class="btn" style="margin:0">Escolher arquivos<input type="file" id="if" accept=".docx,.pdf,.txt,.md,.doc" multiple hidden></label><div id="ir" style="margin-top:12px"></div></div>`;
  document.body.appendChild(m); $('#ix', m).onclick = () => m.remove();
  $('#if', m).onchange = async e => {
    const out = $('#ir', m), results = []; out.innerHTML = '<p class="mute">Lendo arquivos…</p>';
    for (const f of e.target.files) { try { results.push({ f, ...(await parseFile(f)) }); } catch (err) { results.push({ f, error: err.message }); } }
    out.innerHTML = results.map((r, i) => r.error ? `<div class="card"><b>${esc(r.f.name)}</b><div style="color:var(--bad)">✖ ${esc(r.error)}</div></div>` :
      `<div class="card"><label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" data-i="${i}" style="width:auto" checked> <b>${esc(r.f.name)}</b></label>
       <label>Título</label><input data-t="${i}" value="${esc(r.s.title)}"><div class="mute" style="margin-top:6px">Texto-base: ${esc(r.s.baseText) || '—'} · ${r.s.topics.length} tópico(s) · ${r.s.topics.reduce((a, t) => a + (t.verses ? t.verses.split(';').length : 0), 0)} versículo(s)${r.s.conclusion ? ' · conclusão ✔' : ''}</div>
       ${r.warn.map(w => `<div style="color:var(--warn)">⚠ ${esc(w)}</div>`).join('')}</div>`).join('') + (results.some(r => !r.error) ? '<button id="ig">Importar selecionadas</button>' : '');
    const g = $('#ig', m); if (!g) return;
    g.onclick = async () => {
      let n = 0, last = null;
      for (const [i, r] of results.entries()) {
        const cb = $(`[data-i="${i}"]`, m); if (!cb || !cb.checked) continue;
        const s = Object.assign(blank(), r.s, { title: $(`[data-t="${i}"]`, m).value.trim() || r.s.title, date: '', status: 'rascunho', folder: 'Importadas', tags: ['importada'] });
        s.topics = r.s.topics.map(t => Object.assign(blankTopic(), t)); await saveS(s); n++; last = s;
      }
      m.remove(); toast(n + ' pregação(ões) importada(s)'); location.hash = n === 1 ? '#/s/' + last.id : '#/'; if (n !== 1) route();
    };
  };
}
