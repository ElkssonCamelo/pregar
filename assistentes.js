'use strict';
/* Assistentes: biblioteca de prompts com variáveis, perfil do pregador e materiais por pregação.
   A IA roda fora (Claude): o app monta o prompt com os dados da pregação, você cola o resultado e ele fica guardado em "Materiais".
   Os prompts do usuário ficam nos DADOS dele (localStorage, sincronizáveis); aqui no código só há modelos iniciais genéricos. */

const MAT_TYPES = { manuscrito: 'Pregação completa', tutor: 'Feedback do tutor', analise: 'Análise teológica', estudo: 'Estudo bíblico', pessoal: 'Pregação para mim', celula: 'Estudo de célula', whatsapp: 'Mensagem de WhatsApp', reels: 'Roteiro de Reels', devocional: 'Devocional', serie: 'Série de pregações', outro: 'Outro' };

/* ---------- dados: assistentes do usuário e perfil (listas em localStorage, prontas para sincronizar) ---------- */
const getAssists = () => JSON.parse(localStorage.getItem('assistants') || '[]');
const setAssists = l => { if (typeof syncList === 'function') syncList('assist', getAssists(), l); localStorage.setItem('assistants', JSON.stringify(l)); };
const getProfileList = () => JSON.parse(localStorage.getItem('profile') || '[]');
const getProfile = () => getProfileList()[0] || { id: 'main' };
const setProfile = p => { const l = [{ ...p, id: 'main' }]; if (typeof syncList === 'function') syncList('profile', getProfileList(), l); localStorage.setItem('profile', JSON.stringify(l)); };

/* ---------- variáveis ---------- */
const VARS = [
  ['titulo', 'título da pregação'], ['texto_base', 'texto-base (referência)'], ['texto_biblico', 'texto do texto-base na Bíblia do app'], ['versiculos', 'todas as referências citadas'],
  ['serie', 'série'], ['publico', 'público'], ['data', 'data'], ['local', 'igreja/local'], ['duracao', 'tempo planejado'],
  ['introducao', 'introdução'], ['topicos', 'esboço completo dos tópicos'], ['conclusao', 'conclusão/apelo'],
  ['perfil', 'bloco do perfil do pregador'], ['igreja', 'igreja'], ['pastor', 'pregador'], ['cidade', 'cidade'], ['denominacao', 'denominação'], ['traducao', 'tradução preferida'], ['tom', 'tom de voz'], ['regras', 'regras teológicas e de estilo'], ['data_hoje', 'data de hoje'],
  ...Object.keys(MAT_TYPES).map(k => ['material_' + k, `último material "${MAT_TYPES[k]}" desta pregação`])
];
function profileBlock(pf) {
  const L = [['Igreja', pf.igreja], ['Pregador', pf.pastor], ['Cidade', pf.cidade], ['Denominação/tradição', pf.denominacao], ['Tradução da Bíblia', pf.traducao], ['Público habitual', pf.publico], ['Tom de voz', pf.tom], ['Regras teológicas e de estilo', pf.regras]].filter(x => x[1] && String(x[1]).trim());
  return L.length ? 'PERFIL DO PREGADOR\n' + L.map(([k, v]) => `- ${k}: ${String(v).trim()}`).join('\n') : '';
}
async function buildCtx(s) {
  const pf = getProfile(); let texto = '';
  if (s.baseText) { try { texto = (await versesFor(s.baseText)).map(v => `${v.ref}: ${v.text}`).join('\n'); } catch { /* sem Bíblia local */ } }
  const topicos = s.topics.map((t, i) => [`${i + 1}. ${t.title || 'Tópico'}`, t.min && `   Tempo: ${t.min} min`, t.verses && `   Versículos: ${t.verses}`, t.keyphrase && `   Frase-chave: ${t.keyphrase}`, t.quote && `   Citação: ${t.quote}`,
    t.list && `   Lista: ${String(t.list).split('\n').filter(Boolean).join('; ')}`, t.notes && `   Observações: ${t.notes}`, t.application && `   Aplicação: ${t.application}`, t.illustration && `   Ilustração: ${t.illustration}`].filter(Boolean).join('\n')).join('\n\n');
  const refs = [...new Set((s.baseText ? [s.baseText] : []).concat(s.topics.flatMap(t => String(t.verses || '').split(/[;\n]/).map(x => x.trim()).filter(Boolean))))].join('; ');
  const mat = type => { const m = (s.materials || []).filter(x => x.type === type).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]; return m ? m.text : ''; };
  return {
    titulo: s.title || '', texto_base: s.baseText || '', texto_biblico: texto, versiculos: refs, serie: s.series || '', publico: s.audience || pf.publico || '', data: s.date ? fmtDate(s.date) : '', local: s.place || pf.igreja || '',
    duracao: s.planned ? `${s.planned} minutos` : '', introducao: s.intro || '', topicos, conclusao: s.conclusion || '',
    perfil: profileBlock(pf), igreja: pf.igreja || '', pastor: pf.pastor || '', cidade: pf.cidade || '', denominacao: pf.denominacao || '', traducao: pf.traducao || '', tom: pf.tom || '', regras: pf.regras || '', data_hoje: fmtDate(todayISO()),
    ...Object.fromEntries(Object.keys(MAT_TYPES).map(k => ['material_' + k, mat(k)]))
  };
}
function fillTemplate(tpl, ctx) { // devolve o texto pronto e a lista de variáveis vazias/desconhecidas
  const empty = new Set(), unknown = new Set();
  const text = tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => { k = k.toLowerCase(); if (!(k in ctx)) { unknown.add(k); return m; } if (!String(ctx[k]).trim()) empty.add(k); return ctx[k]; });
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), empty: [...empty], unknown: [...unknown] };
}

/* ---------- modelos iniciais (genéricos, em português; edite ou substitua pelos seus) ---------- */
const HEAD = 'Você é um assistente de preparação de mensagens para um pregador cristão evangélico. Escreva em português do Brasil, com linguagem natural e pastoral.\n\n{{perfil}}';
const REGRAS = '- Cite sempre livro, capítulo e versículo. Cite o texto bíblico na tradução {{traducao}}; se não tiver certeza do texto exato, indique só a referência.\n- Não use versículo fora do contexto; se um texto costuma ser mal usado, sinalize.\n- Não invente dados, estatísticas, citações de autores ou fatos históricos; se for sugerir algum, marque como [conferir].';
const CONTEXTO = 'Título: {{titulo}}\nTexto-base: {{texto_base}}\nPúblico: {{publico}}\nDuração prevista: {{duracao}}\n\nTexto bíblico (para conferência):\n{{texto_biblico}}\n\nIntrodução:\n{{introducao}}\n\nEsboço e anotações:\n{{topicos}}\n\nConclusão:\n{{conclusao}}';
const BUILTINS = [
  { id: 'b-manuscrito', builtin: true, group: 'Preparação', name: 'Gerar pregação (manuscrito)', type: 'manuscrito', desc: 'Escreve o manuscrito completo a partir do seu esboço, para você revisar, orar e adaptar.',
    template: `${HEAD}\n\nTAREFA: escreva o manuscrito completo da pregação abaixo. É um rascunho para o pregador revisar, orar e adaptar.\n\n${CONTEXTO}\n\nCOMO ESCREVER:\n- Siga o esboço e a ordem dos tópicos; não acrescente pontos novos.\n- Linguagem falada, frases curtas, parágrafos de até 3 frases. Marque pausas com [pausa].\n- Use as ilustrações e aplicações do pregador; sugira no máximo uma ilustração nova por tópico, marcada como [sugestão].\n- Respeite o tempo: cerca de 130 palavras por minuto falado.\n${REGRAS}\n\nENTREGUE: o manuscrito completo e, no fim, uma lista "Pontos para o pregador conferir" (citações, dados e afirmações doutrinárias).` },
  { id: 'b-tutor', builtin: true, group: 'Preparação', name: 'Tutor de pregação (feedback)', type: 'tutor', desc: 'Avalia o seu esboço como um professor de homilética: clareza, estrutura, aplicação e tempo.',
    template: `${HEAD}\n\nTAREFA: aja como um tutor de homilética. Avalie o esboço abaixo com franqueza e respeito, ajudando o pregador a melhorar. Não reescreva a pregação.\n\n${CONTEXTO}\n\nENTREGUE:\n1. A grande ideia da mensagem em uma frase (se não estiver clara, diga).\n2. O que está funcionando (até 3 pontos).\n3. Os 5 pontos que mais precisam melhorar, em ordem de importância, cada um com um exemplo concreto de ajuste.\n4. Coerência entre texto bíblico, pontos e aplicação.\n5. Ajuste ao tempo previsto.\n6. Três perguntas para o pregador responder antes de pregar.\n7. Um exercício prático para a próxima pregação.\n\nRegras: seja específico (cite trechos do esboço), sem elogios vazios.` },
  { id: 'b-analise', builtin: true, group: 'Preparação', name: 'Análise teológica', type: 'analise', desc: 'Confere o esboço contra o texto bíblico: fidelidade ao contexto, versículos mal usados e afirmações doutrinárias.',
    template: `${HEAD}\n\nTAREFA: faça uma análise teológica e exegética do esboço abaixo, dentro da tradição indicada no perfil (se não houver, use o centro evangélico). Não tome partido em temas secundários; apenas sinalize.\n\n${CONTEXTO}\n\nENTREGUE:\n1. O que o texto-base diz no contexto original (autor, destinatários, contexto imediato).\n2. Para cada tópico: o texto sustenta o ponto? (sustenta / sustenta em parte / não sustenta), com justificativa.\n3. Versículos usados fora de contexto ou de forma duvidosa, e como corrigir.\n4. Afirmações doutrinárias que merecem cuidado ou nuance.\n5. Pontos em que cristãos sérios discordam, apresentados com equilíbrio.\n6. Sugestões de ajuste mantendo a intenção do pregador.\n${REGRAS}` },
  { id: 'b-estudo', builtin: true, group: 'Estudo', name: 'Estudo bíblico do texto-base', type: 'estudo', desc: 'Estudo indutivo: observação, interpretação e aplicação, com contexto e palavras-chave.',
    template: `${HEAD}\n\nTAREFA: monte um estudo bíblico indutivo do texto abaixo, para o pregador estudar antes de preparar a mensagem.\n\nTexto-base: {{texto_base}}\nTexto bíblico:\n{{texto_biblico}}\n\nENTREGUE:\n1. Contexto: autor, destinatários, situação, lugar na estrutura do livro.\n2. Observação: o que o texto diz (personagens, sequência, repetições, palavras-chave).\n3. Interpretação: o que significa para os primeiros leitores; termos importantes (explique de forma simples, sem exigir grego/hebraico).\n4. Conexões: outros textos que iluminam este (com referências).\n5. Aplicação: princípios atemporais e aplicações práticas.\n6. Cuidados: interpretações comuns que não se sustentam.\n7. Perguntas para meditar.\n${REGRAS}` },
  { id: 'b-pessoal', builtin: true, group: 'Estudo', name: 'Pregação para mim (devocional pessoal)', type: 'pessoal', desc: 'Aplica o texto à vida do próprio pregador, antes de pregar para os outros.',
    template: `${HEAD}\n\nTAREFA: escreva uma meditação pessoal, dirigida ao próprio pregador ("você"), sobre o texto abaixo. A ideia é que ele seja ministrado pela Palavra antes de ministrar aos outros.\n\nTexto-base: {{texto_base}}\nTexto bíblico:\n{{texto_biblico}}\nTema da mensagem: {{titulo}}\n\nENTREGUE (cerca de 500 palavras, tom caloroso e honesto):\n1. O que Deus parece dizer a você neste texto.\n2. Uma pergunta que confronta com carinho.\n3. Uma área da vida e do ministério onde isso se aplica esta semana.\n4. Uma oração curta baseada no texto.\n5. Um passo prático para hoje.\n${REGRAS}` },
  { id: 'b-celula', builtin: true, group: 'Reaproveitamento', name: 'Estudo de célula', type: 'celula', desc: 'Roteiro para o líder da célula/pequeno grupo, em cima da pregação: quebra-gelo, perguntas e oração.',
    template: `${HEAD}\n\nTAREFA: transforme a pregação abaixo em um roteiro de estudo para célula/pequeno grupo de 60 a 90 minutos.\n\n${CONTEXTO}\n\nFORMATO:\n- Grande ideia em uma frase (tirada da pregação, não de um tema genérico).\n- Quebra-gelo: duas opções, uma leve e uma mais reflexiva.\n- Leitura do texto (indique a passagem, sem copiar o texto inteiro).\n- Perguntas de observação (2), interpretação (3) e aplicação (3, uma ligada ao trabalho ou à família), mais 2 para aprofundar (uma com referência cruzada).\n- Oração: direção específica ligada à mensagem.\n- Desafio da semana: um passo concreto.\n\nREGRAS: perguntas abertas (nunca sim/não); sem exigir conhecimento de grego ou hebraico; cada pergunta deve funcionar mesmo para quem não ouviu a pregação; no máximo 10 perguntas.\n${REGRAS}` },
  { id: 'b-whatsapp', builtin: true, group: 'Reaproveitamento', name: 'Mensagem para WhatsApp', type: 'whatsapp', desc: 'Resumo curto da mensagem para enviar à igreja, com um versículo e um convite.',
    template: `${HEAD}\n\nTAREFA: escreva uma mensagem curta de WhatsApp resumindo a pregação abaixo para enviar à igreja.\n\nTítulo: {{titulo}}\nTexto-base: {{texto_base}}\nEsboço:\n{{topicos}}\nTexto bíblico:\n{{texto_biblico}}\n\nENTREGUE duas versões:\nA) Curta: até 350 caracteres.\nB) Média: até 900 caracteres.\n\nREGRAS: tom caloroso e direto; comece pelo ponto, não por saudação longa; inclua o versículo-chave com a referência; no máximo 2 emojis; sem hashtags; termine com um convite ou uma ação simples (por exemplo, orar por algo específico).` },
  { id: 'b-reels', builtin: true, group: 'Reaproveitamento', name: 'Roteiro de Reels (teleprompter)', type: 'reels', desc: 'Roteiro vertical de 30 a 60 segundos para ler em voz alta, com texto na tela.',
    template: `${HEAD}\n\nTAREFA: escreva um roteiro de vídeo vertical (Reels) de 45 a 60 segundos com base na pregação abaixo, para ser lido em teleprompter.\n\nTítulo: {{titulo}}\nTexto-base: {{texto_base}}\nEsboço:\n{{topicos}}\n\nFORMATO:\n- GANCHO (primeiros 3 segundos): uma frase que prende, sem clichê.\n- DESENVOLVIMENTO: no máximo 3 blocos curtos.\n- VERSÍCULO: referência e texto na tradução {{traducao}} (ou só a referência, se não tiver certeza).\n- FECHAMENTO com um chamado simples.\n- Texto na tela: sugestão de 3 a 5 legendas curtas.\n- Escreva só a fala em linhas curtas, uma ideia por linha, para facilitar a leitura. Cerca de 130 palavras por minuto.\n${REGRAS}` },
  { id: 'b-devocional', builtin: true, group: 'Reaproveitamento', name: 'Devocional de meio de semana', type: 'devocional', desc: 'Texto de 200 a 300 palavras para enviar na quarta-feira, ligado à pregação.',
    template: `${HEAD}\n\nTAREFA: escreva um devocional de 200 a 300 palavras para enviar no meio da semana, ligado à pregação abaixo.\n\nTítulo: {{titulo}}\nTexto-base: {{texto_base}}\nTexto bíblico:\n{{texto_biblico}}\nEsboço:\n{{topicos}}\n\nESTRUTURA: versículo (com referência) → uma ideia central → uma aplicação para esta semana → uma frase de oração.\nREGRAS: tom pessoal e simples; parágrafos de até 3 frases; sem frases feitas; não repita a pregação, continue a conversa.\n${REGRAS}` },
  { id: 'b-serie', builtin: true, group: 'Preparação', name: 'Série de pregações', type: 'serie', desc: 'Planeja uma série de semanas a partir de um tema ou livro.',
    template: `${HEAD}\n\nTAREFA: proponha uma série de pregações.\n\nTema/livro/texto de partida: {{titulo}} {{texto_base}}\nSérie atual: {{serie}}\nNúmero de semanas: (informe aqui, por exemplo 4)\nPúblico: {{publico}}\n\nENTREGUE:\n- 3 opções de nome para a série, com uma linha de justificativa.\n- Para cada semana: passagem, título, grande ideia em uma frase e a aplicação central.\n- Como as semanas se conectam e como a série termina.\n- Datas especiais ou épocas do ano que combinam com a série.\n${REGRAS}` }
];
const allAssists = () => [...BUILTINS, ...getAssists()];

/* ---------- utilitários ---------- */
function copyText(t) {
  const done = () => toast('Copiado');
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(done).catch(() => { fallbackCopy(t); done(); });
  fallbackCopy(t); done(); return Promise.resolve();
}
function fallbackCopy(t) { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch { /* ignorar */ } a.remove(); }
function openClaude(prompt) { // abre na hora (gesto do clique) e copia por garantia
  copyText(prompt); const url = 'https://claude.ai/new?q=' + encodeURIComponent(prompt);
  if (url.length < 6500) window.open(url, '_blank', 'noopener'); else { window.open('https://claude.ai/new', '_blank', 'noopener'); toast('Prompt longo: copiado. No Claude, cole com Ctrl+V.'); }
}
function shareWhatsApp(text) { // o wa.me tem limite de tamanho (emojis contam muito depois de codificados): mensagem longa vai pela área de transferência
  const enc = encodeURIComponent(text);
  if (enc.length <= 1800) window.open('https://wa.me/?text=' + enc, '_blank', 'noopener'); else { copyText(text); window.open('https://wa.me/', '_blank', 'noopener'); toast('Mensagem longa: copiada. Cole na conversa.'); }
}
function textToBlocks(title, text) { // texto simples/markdown leve → blocos do docx.js
  const B = [{ type: 'title', text: title || 'Material' }];
  String(text).split(/\n{2,}/).forEach(par => {
    const lines = par.split('\n').filter(l => l.trim());
    if (lines.length && lines.every(l => /^\s*[-*•]\s+/.test(l))) lines.forEach(l => B.push({ type: 'li', text: l.replace(/^\s*[-*•]\s+/, '') }));
    else if (/^#{1,3}\s/.test(par)) B.push({ type: 'h', level: par.startsWith('# ') ? 1 : 2, text: par.replace(/^#{1,3}\s+/, '').split('\n')[0] }, ...(lines.length > 1 ? [{ type: 'p', text: lines.slice(1).join('\n') }] : []));
    else B.push({ type: 'p', text: lines.join('\n').replace(/\*\*(.+?)\*\*/g, '$1') });
  });
  return B;
}
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
const slug = s => norm(s).slice(0, 40) || 'material';

/* ---------- perfil do pregador (aparece em Ajustes) ---------- */
function renderProfileBox(box) {
  const pf = getProfile(), F = [['igreja', 'Igreja', 'input'], ['pastor', 'Nome do pregador', 'input'], ['cidade', 'Cidade', 'input'], ['denominacao', 'Denominação / tradição', 'input'], ['traducao', 'Tradução da Bíblia preferida', 'input'], ['publico', 'Público habitual', 'input']];
  box.innerHTML = `<p class="mute">Entra automaticamente em todos os assistentes (variável <code>{{perfil}}</code>). Preencha só o que quiser.</p><div class="grid">
    ${F.map(([k, l]) => `<div><label>${l}</label><input data-pf="${k}" value="${esc(pf[k] || '')}"></div>`).join('')}</div>
    <label>Tom de voz (como você fala)</label><textarea data-pf="tom" style="min-height:60px" placeholder="ex.: simples, direto, caloroso; sem termos acadêmicos">${esc(pf.tom || '')}</textarea>
    <label>Regras teológicas e de estilo (valem para todos os assistentes)</label><textarea data-pf="regras" style="min-height:90px" placeholder="ex.: não tomar partido em temas secundários; nunca usar versículo fora do contexto; frases curtas…">${esc(pf.regras || '')}</textarea>`;
  const save = debounce(() => { const p = { ...getProfile() }; $$('[data-pf]', box).forEach(i => p[i.dataset.pf] = i.value); setProfile(p); toast('Perfil salvo'); });
  box.oninput = e => { if (e.target.dataset.pf) save(); };
}

/* ---------- biblioteca de assistentes (#/assistentes) ---------- */
function assistEditModal(a, done) {
  const isNew = !a || !getAssists().some(z => z.id === a.id), x = a || { id: uid(), name: '', group: 'Meus', type: 'outro', desc: '', template: '' };
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div style="max-width:760px"><h2>${isNew ? 'Novo' : 'Editar'} assistente</h2>
   <label>Nome</label><input id="an" value="${esc(x.name)}"><div class="grid"><div><label>Grupo</label><input id="ag" value="${esc(x.group)}" list="agl"><datalist id="agl">${[...new Set(allAssists().map(z => z.group))].map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
   <div><label>O resultado vira o material do tipo</label><select id="at">${Object.entries(MAT_TYPES).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
   <label>Descrição curta</label><input id="ad" value="${esc(x.desc)}">
   <label>Prompt (use variáveis entre {{ }})</label><textarea id="ap" style="min-height:260px;font-family:ui-monospace,Consolas,monospace;font-size:14px">${esc(x.template)}</textarea>
   <details style="margin-top:6px"><summary class="mute">Variáveis disponíveis (clique para inserir)</summary><div style="margin-top:6px">${VARS.map(([k, d]) => `<span class="tag" data-v="${k}" title="${esc(d)}" style="cursor:pointer">{{${k}}}</span>`).join('')}</div></details>
   <div class="row" style="margin-top:12px"><button id="as">Salvar</button><button class="sec" id="ax">Cancelar</button></div></div>`;
  document.body.appendChild(m); $('#ax', m).onclick = () => m.remove();
  m.onclick = e => { const v = e.target.dataset.v; if (!v) return; const t = $('#ap', m), i = t.selectionStart ?? t.value.length; t.value = t.value.slice(0, i) + `{{${v}}}` + t.value.slice(t.selectionEnd ?? i); t.focus(); };
  $('#as', m).onclick = () => {
    const name = $('#an', m).value.trim(), template = $('#ap', m).value; if (!name || !template.trim()) return toast('Informe o nome e o prompt');
    Object.assign(x, { name, group: $('#ag', m).value.trim() || 'Meus', type: $('#at', m).value, desc: $('#ad', m).value.trim(), template });
    setAssists(isNew ? [...getAssists(), x] : getAssists().map(z => z.id === x.id ? x : z)); m.remove(); toast('Assistente salvo'); done && done();
  };
  $('#an', m).focus();
}
function parsePromptFile(name, text) { // aceita SKILL.md (com cabeçalho "---") ou texto puro
  let body = text.replace(/^\uFEFF/, ''), n = name.replace(/\.[^.]+$/, ''), d = '';
  const m = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (m) { const nm = m[1].match(/^name:\s*(.+)$/m), ds = m[1].match(/^description:\s*(.+)$/m); if (nm) n = nm[1].trim().replace(/^["']|["']$/g, ''); if (ds) d = ds[1].trim().replace(/^["']|["']$/g, ''); body = body.slice(m[0].length); }
  return { id: uid(), name: n, group: 'Importados', type: 'outro', desc: d, template: body.trim() };
}
function assistLibrary() {
  const mine = getAssists(), groups = [...new Set(allAssists().map(a => a.group))];
  app.innerHTML = `<div class="row"><h1 style="flex:1">Assistentes</h1><a class="btn sec" href="#/ajustes">Perfil do pregador</a><label class="btn sec" style="margin:0">⬆ Importar prompts<input type="file" id="af" accept=".md,.txt" multiple hidden></label><button id="an2">+ Novo assistente</button></div>
   <p class="mute">Cada assistente é um <b>prompt</b> que o app preenche com os dados da pregação (e o seu perfil). Abra uma pregação e clique em <b>✨ Assistentes</b> para usar. Os modelos “iniciais” são genéricos: <b>duplique e adapte</b>, ou importe os seus prompts (arquivos .md ou .txt, inclusive no formato SKILL.md). Os seus ficam só nos seus dados.</p>
   ${groups.map(g => `<h2>${esc(g)}</h2>${allAssists().filter(a => a.group === g).map(a => `<div class="card" data-id="${a.id}"><div class="row"><b style="flex:1">${esc(a.name)}</b><span class="st">${a.builtin ? 'modelo inicial' : 'meu'}</span><span class="st">→ ${MAT_TYPES[a.type] || 'Outro'}</span></div>
     <div class="mute">${esc(a.desc)}</div><div class="row" style="margin-top:8px"><button class="sm sec" data-a="view">Ver prompt</button><button class="sm sec" data-a="dup">Duplicar para editar</button>${a.builtin ? '' : '<button class="sm" data-a="edit">Editar</button><button class="sm del" data-a="del">Excluir</button>'}</div></div>`).join('')}`).join('')}`;
  $('#an2').onclick = () => assistEditModal(null, assistLibrary);
  $('#af').onchange = async e => {
    const added = []; for (const f of e.target.files) added.push(parsePromptFile(f.name, await f.text()));
    if (added.length) { setAssists([...getAssists(), ...added]); toast(added.length + ' assistente(s) importado(s)'); assistLibrary(); }
  };
  app.onclick = e => {
    const a = e.target.dataset.a, el = e.target.closest('[data-id]'); if (!a || !el) return; const x = allAssists().find(z => z.id === el.dataset.id);
    if (a === 'view') { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div style="max-width:760px"><div class="row"><b style="flex:1">${esc(x.name)}</b><button class="sec" id="vx">Fechar</button></div><textarea readonly style="min-height:340px;margin-top:8px;font-family:ui-monospace,Consolas,monospace;font-size:14px">${esc(x.template)}</textarea></div>`; document.body.appendChild(m); $('#vx', m).onclick = () => m.remove(); }
    if (a === 'dup') assistEditModal({ ...x, id: uid(), builtin: undefined, name: x.name + ' (meu)', group: x.builtin ? 'Meus' : x.group }, assistLibrary);
    if (a === 'edit') assistEditModal(x, assistLibrary);
    if (a === 'del' && confirm('Excluir este assistente?')) { setAssists(getAssists().filter(z => z.id !== x.id)); assistLibrary(); }
  };
}

/* ---------- área de trabalho da pregação (#/assist/<pregação>/<assistente>) ---------- */
async function assistWorkspace(id, aid) {
  const s = getS(id); if (!s) { location.hash = '#/'; return; }
  s.materials = s.materials || [];
  const list = allAssists(), cur = list.find(a => a.id === aid);
  const groups = [...new Set(list.map(a => a.group))];
  app.innerHTML = `<div class="row"><a class="btn sec" href="#/s/${s.id}">← Editor</a><h1 style="flex:1;margin:0">✨ Assistentes — ${esc(s.title) || '(sem título)'}</h1><a class="btn sec" href="#/assistentes">Gerenciar</a></div>
   <p class="mute">1) Escolha um assistente. 2) <b>Abrir no Claude</b> (o prompt vai preenchido; se for longo, ele é copiado e você cola). 3) Traga o resultado de volta e salve como material desta pregação.</p>
   <div class="row" style="align-items:flex-start;gap:14px"><div style="flex:0 0 250px;max-width:100%">${groups.map(g => `<div class="mute" style="margin:8px 0 4px">${esc(g)}</div>${list.filter(a => a.group === g).map(a => `<a class="btn ${cur && cur.id === a.id ? '' : 'sec'}" style="display:block;margin-bottom:6px;text-align:left" href="#/assist/${s.id}/${a.id}">${esc(a.name)}</a>`).join('')}`).join('')}</div>
   <div style="flex:1;min-width:280px" id="aw"></div></div><h2>Materiais desta pregação (${s.materials.length})</h2><div id="mats"></div>`;
  const drawMats = () => {
    $('#mats').innerHTML = s.materials.length ? s.materials.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(m => `<details class="card" data-m="${m.id}"><summary><b>${esc(m.title)}</b> <span class="st">${MAT_TYPES[m.type] || 'Outro'}</span> <span class="mute">${fmtDate(new Date(m.updatedAt).toISOString().slice(0, 10))} · ${m.text.length} caracteres</span></summary>
      <textarea data-t style="min-height:220px;margin-top:8px">${esc(m.text)}</textarea><div class="row" style="margin-top:8px"><button class="sm" data-k="copy">Copiar</button><button class="sm sec" data-k="tp">Teleprompter</button><button class="sm sec" data-k="wa">WhatsApp</button><button class="sm sec" data-k="docx">Word</button><button class="sm sec" data-k="md">Markdown</button><button class="sm del" data-k="del">Excluir</button></div></details>`).join('') : '<p class="mute">Nenhum material ainda. Gere um com um assistente acima ou cole um texto seu.</p>';
  };
  drawMats();
  const saveM = debounce(() => saveS(s).then(() => toast('Salvo')), 600);
  $('#mats').oninput = e => { if (e.target.dataset.t === undefined) return; const m = s.materials.find(x => x.id === e.target.closest('[data-m]').dataset.m); m.text = e.target.value; m.updatedAt = Date.now(); saveM(); };
  $('#mats').onclick = async e => {
    const k = e.target.dataset.k, el = e.target.closest('[data-m]'); if (!k || !el) return; const m = s.materials.find(x => x.id === el.dataset.m);
    if (k === 'copy') copyText(m.text); if (k === 'wa') shareWhatsApp(m.text); if (k === 'tp') location.hash = `#/teleprompter/${s.id}/${m.id}`;
    if (k === 'docx') downloadBlob(new Blob([DocxLib.makeDocx(textToBlocks(m.title, m.text))]), slug(m.title) + '.docx');
    if (k === 'md') downloadBlob(new Blob([`# ${m.title}\n\n${m.text}\n`], { type: 'text/markdown' }), slug(m.title) + '.md');
    if (k === 'del' && confirm('Excluir este material?')) { s.materials = s.materials.filter(x => x.id !== m.id); await saveS(s); drawMats(); }
  };
  const aw = $('#aw');
  if (!cur) { aw.innerHTML = '<div class="card"><p class="mute">Escolha um assistente na lista.</p><p class="mute">Quanto mais completo o esboço (texto-base, tópicos, versículos, aplicação), melhor o resultado. O <a href="#/ajustes">perfil do pregador</a> também entra em todos os prompts.</p></div>'; return; }
  const ctx = await buildCtx(s);
  aw.innerHTML = `<div class="card"><b>${esc(cur.name)}</b> <span class="st">→ ${MAT_TYPES[cur.type] || 'Outro'}</span><div class="mute">${esc(cur.desc)}</div>
    <label>Instruções extras para este pedido (opcional)</label><textarea id="ex" style="min-height:60px" placeholder="ex.: foco em jovens; no máximo 300 palavras; incluir uma ilustração do futebol"></textarea>
    <div id="warn"></div><label>Prompt pronto</label><textarea id="pp" readonly style="min-height:240px;font-family:ui-monospace,Consolas,monospace;font-size:13px"></textarea>
    <div class="row" style="margin-top:8px"><button id="oc">Abrir no Claude</button><button class="sec" id="cp">Copiar prompt</button></div></div>
    <div class="card"><b>Resultado</b><label>Cole aqui a resposta do Claude</label><textarea id="rs" style="min-height:200px"></textarea>
    <div class="grid"><div><label>Título do material</label><input id="rt" value="${esc(cur.name)} — ${esc(s.title)}"></div><div><label>Tipo</label><select id="ry">${Object.entries(MAT_TYPES).map(([k, v]) => `<option value="${k}" ${cur.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
    <div class="row" style="margin-top:8px"><button id="sv">Salvar como material</button></div></div>`;
  let prompt = '';
  const build = () => {
    const r = fillTemplate(cur.template, ctx), ex = $('#ex').value.trim();
    prompt = r.text + (ex ? `\n\nINSTRUÇÕES EXTRAS DO PREGADOR:\n${ex}` : ''); $('#pp').value = prompt;
    const w = []; if (r.empty.length) w.push(`Sem dados para: ${r.empty.map(k => '{{' + k + '}}').join(', ')} (preencha na pregação ou no perfil).`); if (r.unknown.length) w.push(`Variável desconhecida no prompt: ${r.unknown.map(k => '{{' + k + '}}').join(', ')}.`);
    $('#warn').innerHTML = w.map(t => `<div style="color:var(--warn);margin-top:6px">⚠ ${esc(t)}</div>`).join('') + `<div class="mute" style="margin-top:4px">${prompt.length} caracteres</div>`;
  };
  $('#ex').oninput = build; build();
  $('#oc').onclick = () => openClaude(prompt); $('#cp').onclick = () => copyText(prompt);
  $('#sv').onclick = async () => {
    const text = $('#rs').value.trim(); if (!text) return toast('Cole o resultado primeiro');
    s.materials.push({ id: uid(), type: $('#ry').value, title: $('#rt').value.trim() || cur.name, text, assistantId: cur.id, createdAt: Date.now(), updatedAt: Date.now() });
    await saveS(s); $('#rs').value = ''; toast('Material salvo'); drawMats();
  };
}
