# Pendências do Pregar

## Dependem de Supabase / Vercel
- [ ] Sincronização na nuvem e troca de aparelho (Supabase: contas + banco)
- [ ] Publicar o app em HTTPS (Vercel) para instalar no celular
- [ ] IA para esboço, slides e leitura de foto de caderno (API da Claude via função no servidor; a chave não pode ficar no navegador)
- [ ] Controle do telão pelo celular por QR Code / código (tempo real via Supabase Realtime)

## Bíblia: checar depois
- [ ] **API.Bible (scripture.api.bible)**: verificar se tem NVT / NVI / ARA / NAA em português, qual o plano gratuito, limites de uso e se os termos permitem uso em app pessoal. Se sim, chamar via função no servidor (a chave não vai no navegador) e guardar cache local.
- [ ] Alternativa: licença direta com a Editora Mundo Cristão (NVT) ou outra editora.
- Hoje: Almeida Corrigida Fiel offline embutida + importação de versão própria (JSON) + Almeida/KJV online.

## Ideias do brainstorm (não feitas)
- ~~Banco de ilustrações e citações~~ (feito)
- ~~Referências cruzadas por versículo~~ (feito)
- ~~Slides com fundos, temas e logo no projetor~~ (feito)
- ~~Cartão de imagem da frase-chave para redes sociais~~ (feito)
- ~~Exportar para Word / Markdown~~ (feito)
- ~~Plano de leitura e diário~~ (feito)
- ~~Pedidos de oração e visitas~~ (feito)
- ~~Calendário de datas especiais~~ (feito)
- ~~Controle por teclado / pedal Bluetooth~~ (feito)
- ~~Importar Word / PDF~~ (feito) — falta: PowerPoint (.pptx), OCR de foto/PDF escaneado (precisa de IA/servidor), .doc antigo
- ~~Backup automático~~ (feito: pontos de restauração + pasta no Chrome/Edge)

## Uso no tablet (decisão pendente)
- [x] **Publicado em HTTPS** (Vercel, 2026-10-02): https://pregar-eight.vercel.app — projeto `pregar` na equipe `juntos-sim`. Para atualizar: `npx vercel deploy --prod --yes` na pasta do app (subir a versão do cache em `sw.js` antes). Ao ligar o login, usar essa URL como Site URL / Redirect URL no Supabase.
- [ ] **Levar as pregações para o tablet**: provisório = backup em pasta da nuvem no computador + Backup > Importar no tablet; definitivo = sincronização Supabase.
- [ ] Botão "Levar para o tablet" (exportar só uma pregação, com slides e imagens, para importar no tablet) — opcional, enquanto não houver sincronização.
- [ ] **Telão com o tablet**: espelhar a tela mostraria as anotações ao público; o correto é o tablet como controle remoto e outro aparelho no projetor (QR Code / Supabase Realtime).
- Feito: modo pregação para toque (botões de 52 px, barras fixas, deslizar para trocar de tópico/slide, tópicos em faixa no tablet em pé, tela cheia).

## Assistentes de IA (ideia de 2026-10-03)
- [x] Biblioteca de assistentes + perfil do pregador + materiais por pregação (v0.10.0), com "Abrir no Claude".
- [ ] **Enviar ao Claude os SEUS prompts**: importar em Assistentes > Importar prompts (gerar pregação, tutor, WhatsApp, Reels, análise teológica, estudo bíblico, pregação para mim… os que não estão em ~/.claude/skills). Os modelos iniciais são genéricos.
- [ ] **Teleprompter** (rolagem automática, letra grande, espelhado, contagem regressiva) para Reels e para pregar: ainda não feito.
- [ ] **"Gerar aqui dentro"** pela API da Claude via função no servidor (Vercel): precisa de conta/chave da Anthropic (pago por uso, a chave fica só na Vercel), do login (Supabase) e de limite de uso.
- [ ] Verificar o link `claude.ai/new?q=` (preenchimento automático do prompt) em uso real; a cópia para a área de transferência é o plano B.
- [ ] Atenção: a coleção `pastor-ai` (REACHRIGHT) tem a regra "nunca gerar pregação pronta"; os modelos do Pregar não seguem essa regra, a decisão é do pregador.
- [ ] Publicar a v0.10.0 na Vercel (o site publicado ainda é a v0.9.0).
