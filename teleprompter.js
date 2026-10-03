'use strict';
/* Teleprompter: rolagem automática em palavras por minuto, contagem regressiva, espelho, linha-guia, pausas nas marcações [pausa].
   Abre a partir de um material, do esboço da pregação (#/teleprompter/<pregação>/esboco) ou de texto colado (#/teleprompter/_/texto). */

const TP_DEFAULTS = { wpm: 130, fs: 46, width: 78, lh: 1.5, theme: 'dark', mirror: false, guide: true, countdown: true, autoPause: false };
const tpSettings = () => ({ ...TP_DEFAULTS, ...JSON.parse(localStorage.getItem('tpSettings') || '{}') });
const tpSave = o => localStorage.setItem('tpSettings', JSON.stringify(o));

async function sermonScript(s) { // esboço → texto para ler (com o texto dos versículos)
  const L = [`# ${s.title || 'Pregação'}`]; if (s.baseText) L.push(`Texto-base: ${s.baseText}`);
  if (s.intro) L.push('# Introdução', s.intro);
  for (const [i, t] of s.topics.entries()) {
    L.push(`# ${i + 1}. ${t.title || 'Tópico'}`); if (t.keyphrase) L.push(`**${t.keyphrase}**`);
    if (t.verses) for (const v of await versesFor(t.verses)) L.push(`**${v.ref}** ${v.text}`);
    if (t.quote) L.push(`“${t.quote}”`); String(t.list || '').split('\n').filter(Boolean).forEach(x => L.push('- ' + x));
    if (t.notes) L.push(t.notes); if (t.application) L.push('Aplicação: ' + t.application); if (t.illustration) L.push('Ilustração: ' + t.illustration);
  }
  if (s.conclusion) L.push('# Conclusão', s.conclusion);
  return L.join('\n\n');
}
function tpHtml(text) { // texto simples/markdown leve → HTML seguro; [pausa] e [notas] viram marcadores
  const inline = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[pausa\]/gi, '<span class="tpm" data-pause>⏸ pausa</span>').replace(/\[([^\]]{1,60})\]/g, '<span class="tpn">[$1]</span>');
  return String(text).split(/\n{2,}/).map(par => {
    const lines = par.split('\n').filter(l => l.trim()); if (!lines.length) return '';
    if (/^#{1,3}\s/.test(lines[0])) return `<h2>${inline(lines[0].replace(/^#{1,3}\s+/, ''))}</h2>` + (lines.length > 1 ? `<p>${lines.slice(1).map(inline).join('<br>')}</p>` : '');
    return lines.every(l => /^\s*[-*•]\s+/.test(l)) ? lines.map(l => `<p class="tpli">• ${inline(l.replace(/^\s*[-*•]\s+/, ''))}</p>`).join('') : `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
const tpWords = t => (String(t).replace(/\[[^\]]{1,60}\]/g, ' ').replace(/[#*]/g, ' ').match(/\S+/g) || []).length;

/* ---------- entrada: escolher o que ler (#/teleprompter) ---------- */
function teleprompterLibrary() {
  const mats = sermons.flatMap(s => (s.materials || []).map(m => ({ s, m }))).sort((a, b) => b.m.updatedAt - a.m.updatedAt);
  app.innerHTML = `<h1>Teleprompter</h1><p class="mute">Leitura com rolagem automática no seu ritmo (palavras por minuto). Funciona offline, no computador e no tablet. Para Reels, deixe o aparelho em pé e use <b>espelho</b> se for gravar por vidro refletor.</p>
   <div class="card"><b>Colar um texto</b><textarea id="tt" style="min-height:140px;margin-top:6px" placeholder="Cole aqui o roteiro ou a mensagem…">${esc(sessionStorage.getItem('tpText') || '')}</textarea><div class="row" style="margin-top:8px"><button id="tgo">▶ Abrir no teleprompter</button></div></div>
   <h2>Materiais salvos (${mats.length})</h2>${mats.length ? mats.slice(0, 30).map(({ s, m }) => `<div class="card row"><span style="flex:1"><b>${esc(m.title)}</b> <span class="st">${MAT_TYPES[m.type] || 'Outro'}</span><br><span class="mute">${esc(s.title) || '(sem título)'} · ${tpWords(m.text)} palavras</span></span><a class="btn sm" href="#/teleprompter/${s.id}/${m.id}">▶ Ler</a></div>`).join('') : '<p class="mute">Nenhum material ainda. Gere um em ✨ Assistentes (por exemplo, Roteiro de Reels ou Pregação completa).</p>'}
   <h2>Pregações (ler o esboço)</h2>${sermons.filter(s => s.topics.length).slice(0, 30).map(s => `<div class="card row"><span style="flex:1"><b>${esc(s.title) || '(sem título)'}</b> <span class="mute">${esc(s.baseText)}</span></span><a class="btn sm sec" href="#/teleprompter/${s.id}/esboco">▶ Esboço</a></div>`).join('') || '<p class="mute">Nenhuma pregação com tópicos.</p>'}`;
  $('#tgo').onclick = () => { const t = $('#tt').value.trim(); if (!t) return toast('Cole um texto primeiro'); sessionStorage.setItem('tpText', t); location.hash = '#/teleprompter/_/texto'; };
}

/* ---------- o teleprompter ---------- */
async function teleprompter(sid, what) {
  if (!sid) return teleprompterLibrary();
  let title = 'Texto', text = '', planned = null;
  if (sid === '_') text = sessionStorage.getItem('tpText') || '';
  else { const s = getS(sid); if (!s) { location.hash = '#/teleprompter'; return; } planned = s.planned || null; if (what === 'esboco') { title = s.title || 'Pregação'; text = await sermonScript(s); } else { const m = (s.materials || []).find(x => x.id === what); if (m) { title = m.title; text = m.text; } } }
  if (!text.trim()) { toast('Nada para ler'); location.hash = '#/teleprompter'; return; }
  const cfg = tpSettings(), words = tpWords(text), wake = navigator.wakeLock ? await navigator.wakeLock.request('screen').catch(() => null) : null;
  document.body.classList.add('prompting'); document.body.style.overflow = 'hidden';
  app.innerHTML = `<div class="tp" id="tp" data-th="${cfg.theme}">
   <div class="tpbar" id="tpbar"><a class="btn sec" href="${sid === '_' ? '#/teleprompter' : '#/assist/' + sid}" id="tpx">← Sair</a><b class="tptitle">${esc(title)}</b>
    <button id="tpp" aria-label="Iniciar ou pausar">▶</button><button class="sec" id="tpr" aria-label="Voltar ao início">↺</button>
    <label class="tpl">Velocidade <input type="range" id="tpw" min="40" max="300" step="5"><b id="tpwl"></b></label>
    <label class="tpl">Durar <input type="number" id="tpd" min="1" max="180" style="width:64px"> min</label>
    <button class="sec" id="tpm1">A−</button><button class="sec" id="tpm2">A+</button>
    <select id="tpt"><option value="dark">Preto/branco</option><option value="amber">Preto/amarelo</option><option value="green">Preto/verde</option><option value="paper">Branco/preto</option></select>
    <button class="sec" id="tpmi" title="Espelho horizontal">⇋</button><button class="sec" id="tpg" title="Linha-guia">▬</button><button class="sec" id="tpo" title="Mais opções">⚙</button>${document.documentElement.requestFullscreen ? '<button class="sec" id="tpf" aria-label="Tela cheia">⛶</button>' : ''}</div>
   <div class="tpopt" id="tpopt" hidden><label class="tpl">Largura <input type="range" id="tpwd" min="40" max="100" step="2"></label><label class="tpl">Espaço entre linhas <input type="range" id="tplh" min="1.1" max="2.2" step="0.05"></label>
    <label class="tpl"><input type="checkbox" id="tpc" style="width:auto"> contagem 3-2-1</label><label class="tpl"><input type="checkbox" id="tpa" style="width:auto"> parar 2 s nas [pausa]</label>
    <span class="tpl">Atalhos: Espaço pausa · ↑/↓ velocidade · ←/→ ou PageUp/PageDown pulam · +/− letra · M espelho · G guia · R início · F tela cheia</span></div>
   <div class="tpwrap"><div class="tpview" id="tpview"><div class="tpcol" id="tpcol"><div id="tptext">${tpHtml(text)}</div></div></div><div id="tpguide"></div></div>
   <div class="tpfoot"><span id="tpel">00:00</span><div id="tpprog"><div id="tpbarp"></div></div><span id="tprem">--:--</span></div><div id="tpcount" hidden></div></div>`;
  const view = $('#tpview'), col = $('#tpcol'), txt = $('#tptext'), tp = $('#tp');
  let playing = false, pos = 0, last = 0, elapsed = 0, raf = 0, lastSet = 0, held = false, holdT = 0, hideT = 0, counting = false; const done = new Set();
  const apply = () => {
    tp.dataset.th = cfg.theme; col.style.setProperty('--fs', cfg.fs + 'px'); col.style.setProperty('--w', cfg.width + '%'); col.style.setProperty('--lh', cfg.lh); col.classList.toggle('mirror', cfg.mirror);
    $('#tpguide').style.display = cfg.guide ? 'block' : 'none'; $('#tpguide').style.setProperty('--fs', cfg.fs + 'px');
    $('#tpw').value = cfg.wpm; $('#tpwl').textContent = cfg.wpm + ' pal/min'; $('#tpd').value = Math.max(1, Math.round(words / cfg.wpm)); $('#tpwd').value = cfg.width; $('#tplh').value = cfg.lh; $('#tpc').checked = cfg.countdown; $('#tpa').checked = cfg.autoPause; $('#tpt').value = cfg.theme;
    col.style.paddingTop = Math.round(view.clientHeight * 0.34) + 'px'; col.style.paddingBottom = Math.round(view.clientHeight * 0.7) + 'px';
    $('#tpmi').classList.toggle('on', cfg.mirror); $('#tpg').classList.toggle('on', cfg.guide); tpSave(cfg); upd();
  };
  const textH = () => txt.offsetHeight, maxPos = () => Math.max(0, view.scrollHeight - view.clientHeight);
  const pxs = () => textH() / (words / cfg.wpm * 60); // pixels por segundo para ler o texto todo no ritmo escolhido
  const fmt = s => mmss(Math.max(0, Math.round(s)));
  function upd() { const frac = maxPos() ? Math.min(1, pos / maxPos()) : 0; $('#tpbarp').style.width = (frac * 100) + '%'; $('#tpel').textContent = fmt(elapsed); $('#tprem').textContent = 'faltam ' + fmt((maxPos() - pos) / Math.max(1, pxs())); }
  const setPos = p => { pos = Math.max(0, Math.min(maxPos(), p)); lastSet = pos; view.scrollTop = pos; upd(); };
  function frame(t) {
    if (!playing) return; const dt = Math.min(0.1, (t - last) / 1000); last = t; elapsed += dt; setPos(pos + pxs() * dt);
    if (cfg.autoPause && !held) { const line = pos + view.clientHeight * 0.36; for (const m of col.querySelectorAll('[data-pause]')) { if (!done.has(m) && m.offsetTop <= line + 2) { done.add(m); held = true; clearTimeout(holdT); holdT = setTimeout(() => { held = false; last = performance.now(); }, 2000); } } }
    if (held) last = t; if (pos >= maxPos() - 1) { stop(true); return; } raf = requestAnimationFrame(frame);
  }
  function play() { if (playing || counting) return; if (pos >= maxPos() - 1) { setPos(0); elapsed = 0; done.clear(); }
    const go = () => { counting = false; playing = true; $('#tpp').textContent = '⏸'; last = performance.now(); raf = requestAnimationFrame(frame); poke(); };
    if (cfg.countdown && pos < 5) { counting = true; let n = 3; const c = $('#tpcount'); c.hidden = false; c.textContent = n; const iv = setInterval(() => { n--; if (n <= 0 || !counting) { clearInterval(iv); c.hidden = true; if (counting) go(); } else c.textContent = n; }, 1000); } else go(); }
  function stop(end) { playing = false; counting = false; $('#tpcount').hidden = true; cancelAnimationFrame(raf); $('#tpp').textContent = '▶'; $('#tpbar').classList.remove('hide'); if (end) toast('Fim do texto'); }
  const toggle = () => playing || counting ? stop() : play();
  const poke = () => { $('#tpbar').classList.remove('hide'); clearTimeout(hideT); if (playing) hideT = setTimeout(() => { if (playing) $('#tpbar').classList.add('hide'); }, 3500); };
  const restart = () => { stop(); setPos(0); elapsed = 0; done.clear(); upd(); };
  const jump = d => { setPos(pos + d * view.clientHeight * 0.6); done.clear(); poke(); };
  const wpm = d => { cfg.wpm = Math.max(40, Math.min(300, cfg.wpm + d)); apply(); };

  $('#tpp').onclick = toggle; $('#tpr').onclick = restart;
  $('#tpw').oninput = e => { cfg.wpm = +e.target.value; apply(); };
  $('#tpd').onchange = e => { const m = Math.max(1, +e.target.value || 1); cfg.wpm = Math.max(40, Math.min(300, Math.round(words / m))); apply(); };
  $('#tpm1').onclick = () => { cfg.fs = Math.max(20, cfg.fs - 4); apply(); }; $('#tpm2').onclick = () => { cfg.fs = Math.min(140, cfg.fs + 4); apply(); };
  $('#tpt').onchange = e => { cfg.theme = e.target.value; apply(); };
  $('#tpmi').onclick = () => { cfg.mirror = !cfg.mirror; apply(); }; $('#tpg').onclick = () => { cfg.guide = !cfg.guide; apply(); };
  $('#tpo').onclick = () => { const o = $('#tpopt'); o.hidden = !o.hidden; };
  $('#tpwd').oninput = e => { cfg.width = +e.target.value; apply(); }; $('#tplh').oninput = e => { cfg.lh = +e.target.value; apply(); };
  $('#tpc').onchange = e => { cfg.countdown = e.target.checked; apply(); }; $('#tpa').onchange = e => { cfg.autoPause = e.target.checked; apply(); };
  if ($('#tpf')) $('#tpf').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => toast('Tela cheia indisponível aqui'));
  // toque no texto = pausa/continua; arrastar = rolar à mão (pausa)
  let down = null; view.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  view.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && Date.now() - down.t < 400) toggle(); down = null; });
  view.addEventListener('touchmove', () => { if (playing) stop(); }, { passive: true });
  view.addEventListener('scroll', () => { if (Math.abs(view.scrollTop - lastSet) > 2) { pos = view.scrollTop; lastSet = pos; upd(); } }); // rolagem manual (roda do mouse etc.)
  view.addEventListener('wheel', poke, { passive: true }); $('#tpbar').addEventListener('pointerdown', poke); addEventListener('mousemove', poke);
  const keys = e => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target.matches && e.target.matches('input[type=number],textarea,select'))) return;
    const k = e.key.toLowerCase(), m = { '+': () => $('#tpm2').click(), '=': () => $('#tpm2').click(), '-': () => $('#tpm1').click(), m: () => $('#tpmi').click(), g: () => $('#tpg').click(), r: restart, f: () => $('#tpf') && $('#tpf').click(), escape: () => $('#tpx').click() }[k];
    if (m) { e.preventDefault(); m(); }
  };
  addEventListener('keydown', keys);
  kbActions = { timerToggle: toggle, slideNext: () => jump(1), slidePrev: () => jump(-1), topicNext: () => wpm(5), topicPrev: () => wpm(-5) }; // ↓ mais rápido, ↑ mais devagar, pedal pula
  addEventListener('resize', apply); apply(); setPos(0);
  cleanup = () => { stop(); clearTimeout(holdT); clearTimeout(hideT); removeEventListener('keydown', keys); removeEventListener('mousemove', poke); removeEventListener('resize', apply); document.body.classList.remove('prompting'); document.body.style.overflow = ''; wake && wake.release(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
}
