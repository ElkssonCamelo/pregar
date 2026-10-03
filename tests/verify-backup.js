'use strict';
// Uso: node tests/verify-backup.js caminho\do\pregar-backup-AAAA-MM-DD.json
// Confere se o backup do Pregar está íntegro e mostra o que há dentro (não altera nada).
const fs = require('fs'), path = require('path'), file = process.argv[2];
if (!file) { console.log('Uso: node tests/verify-backup.js <arquivo.json>'); process.exit(2); }
const problems = [], notes = [];
let raw; try { raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch (e) { console.log('✖ não consegui ler o arquivo:', e.message); process.exit(1); }
let j; try { j = JSON.parse(raw); } catch (e) { console.log('✖ o arquivo NÃO é um JSON válido (cortado ou corrompido):', e.message); process.exit(1); }

if (j.app !== 'pregar') problems.push('não tem a marca "app: pregar" (talvez seja outro arquivo)');
if (!Array.isArray(j.sermons)) problems.push('não tem a lista "sermons"');
const S = j.sermons || [], I = j.ilus || [], P = j.pray || [], PL = j.plans || [], CD = j.customDates || [];
const dup = (arr, n) => { const seen = new Set(); arr.forEach(x => { if (seen.has(x.id)) problems.push(`${n}: id repetido ${x.id}`); seen.add(x.id); }); };
dup(S, 'pregação'); dup(I, 'ilustração'); dup(P, 'pedido de oração');

console.log(`Arquivo: ${path.basename(file)}  (${(raw.length / 1024).toFixed(0)} KB)${j.at ? '  criado em ' + new Date(j.at).toLocaleString('pt-BR') : '  (sem data interna: backup de versão antiga)'}`);
console.log(`Pregações: ${S.length} | Ilustrações: ${I.length} | Pedidos de oração: ${P.length} | Planos de leitura: ${PL.length} | Datas próprias: ${CD.length}\n`);

let vazias = 0, comTopicos = 0, comSlides = 0, imgs = 0;
S.forEach(s => {
  const tituloOk = (s.title || '').trim(); const t = (s.topics || []).length;
  const conteudo = tituloOk || s.baseText || s.intro || t;
  if (!conteudo) vazias++; if (t) comTopicos++; if ((s.slides || []).length) comSlides++;
  if (s.theme && (s.theme.bgImage || s.theme.logo)) imgs++;
  if (!s.id) problems.push('há pregação sem id');
});
S.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12).forEach(s =>
  console.log(`  • ${(s.title || '(sem título)').slice(0, 44).padEnd(44)} ${String(s.baseText || '').slice(0, 20).padEnd(20)} ${String((s.topics || []).length).padStart(2)} tópico(s)  ${s.status || ''}`));
if (S.length > 12) console.log(`  … e mais ${S.length - 12}`);
console.log(`\nCom tópicos: ${comTopicos}/${S.length} | com slides: ${comSlides} | com imagem de fundo/logo: ${imgs}`);
if (vazias) notes.push(`${vazias} pregação(ões) completamente vazia(s) (provavelmente "Nova pregação" aberta e abandonada; dá para apagar)`);
if (!S.length && !I.length && !P.length) problems.push('o backup está VAZIO: foi exportado de um lugar sem dados (ex.: o endereço novo da Vercel, que começa vazio)');
if (comTopicos === 0 && S.length) notes.push('nenhuma pregação tem tópicos ainda');
notes.push('lembrete: gravações de áudio NÃO entram neste arquivo (ficam só no aparelho)');

console.log('');
notes.forEach(n => console.log('ℹ', n));
if (problems.length) { console.log(''); problems.forEach(p => console.log('✖', p)); console.log('\nRESULTADO: há problemas.'); process.exit(1); }
console.log('\n✔ RESULTADO: arquivo íntegro e importável.');
