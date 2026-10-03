# Pendências do Pregar

## Dependem de Supabase / Vercel
- [x] Sincronização ligada (v0.12.0, 2026-10-03): projeto Supabase `pregar` (org zfezvvcqplasbjbqctwb, sa-east-1, id pedfhqffsqpuwkurziqy), esquema com RLS aplicado e testado. **Falta o usuário no painel do Supabase** (ver CHANGELOG 0.12.0): Site URL + Redirect URLs, modelo de e-mail com `{{ .Token }}`, desligar novos cadastros após o 1º login.
- [ ] Testar o login e a sincronização de verdade entre computador e tablet (só o usuário pode: depende do e-mail dele).
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
- [x] **Publicado em HTTPS** (Vercel, 2026-10-02): https://meupregar.vercel.app (endereço escolhido; `pregar.vercel.app` e `pregar-app` são de terceiros; o antigo pregar-eight.vercel.app continua respondendo, mas NÃO usar) — projeto `pregar` na equipe `juntos-sim`. Para atualizar: `npx vercel deploy --prod --yes` na pasta do app (subir a versão do cache em `sw.js` antes). Ao ligar o login, usar essa URL como Site URL / Redirect URL no Supabase.
- [ ] **Levar as pregações para o tablet**: provisório = backup em pasta da nuvem no computador + Backup > Importar no tablet; definitivo = sincronização Supabase.
- [ ] Botão "Levar para o tablet" (exportar só uma pregação, com slides e imagens, para importar no tablet) — opcional, enquanto não houver sincronização.
- [ ] **Telão com o tablet**: espelhar a tela mostraria as anotações ao público; o correto é o tablet como controle remoto e outro aparelho no projetor (QR Code / Supabase Realtime).
- Feito: modo pregação para toque (botões de 52 px, barras fixas, deslizar para trocar de tópico/slide, tópicos em faixa no tablet em pé, tela cheia).

## Assistentes de IA (ideia de 2026-10-03)
- [x] Biblioteca de assistentes + perfil do pregador + materiais por pregação (v0.10.0), com "Abrir no Claude".
- [ ] **Enviar ao Claude os SEUS prompts**: importar em Assistentes > Importar prompts (gerar pregação, tutor, WhatsApp, Reels, análise teológica, estudo bíblico, pregação para mim… os que não estão em ~/.claude/skills). Os modelos iniciais são genéricos.
- [x] **Teleprompter** (v0.11.0): rolagem por palavras/min, contagem, espelho, linha-guia, pausas, pedal. Falta testar num tablet/celular reais e com espelho de vidro refletor.
- [ ] **"Gerar aqui dentro"** pela API da Claude via função no servidor (Vercel): precisa de conta/chave da Anthropic (pago por uso, a chave fica só na Vercel), do login (Supabase) e de limite de uso.
- [ ] Verificar o link `claude.ai/new?q=` (preenchimento automático do prompt) em uso real; a cópia para a área de transferência é o plano B.
- [ ] Atenção: a coleção `pastor-ai` (REACHRIGHT) tem a regra "nunca gerar pregação pronta"; os modelos do Pregar não seguem essa regra, a decisão é do pregador.
- [x] Publicada a **v0.11.1** na Vercel (2026-10-03): https://meupregar.vercel.app. Antes de cada publicação: conferir backups na pasta (o `.vercelignore` os bloqueia) e testar com `node tests/slowserver.js` (internet lenta).

## Login com senha (v0.13.0, 2026-10-03) — feito e publicado
- [x] Tela de entrada obrigatória (e-mail e senha), criar conta, esqueci a senha, alterar senha, sair com segurança. Publicado em https://meupregar.vercel.app.
- [ ] **Painel do Supabase (usuário):** desligar "Confirm email" (Authentication > Sign In / Providers > Email) para entrar logo após criar a conta; configurar Site URL e Redirect URLs (para o e-mail de "esqueci a senha"); depois de criar a PRÓPRIA conta, desligar "Allow new users to sign up".
- [x] Testado de verdade pelo usuário em 2026-10-03: criar conta, entrar e sincronizar entre computador e tablet (confirmado no banco: 1 pregação + perfil, 1 conta).
- Emergência: para abrir o app sem a tela de login, em `config.js` trocar `requireLogin: true` por `false` (os dados locais continuam intactos).

## Sincronização automática (v0.14.0, 2026-10-03) — publicada
- [x] Envio em ~1,5 s, atualização ao vivo (Realtime), busca de reserva a cada 20 s, reconexão automática.
- [x] Testado pelo usuário com dois aparelhos logados em 2026-10-03: pregação criada no computador apareceu no tablet (sucesso).
- [ ] Aviso do Supabase: "Leaked password protection disabled" (proteção contra senhas vazadas): ligar em Authentication > Sign In / Providers > Password security, se estiver disponível no plano; senão usar senha longa e única.
- Limites conhecidos: edição da MESMA pregação nos dois aparelhos ao mesmo tempo = vale a mais recente (por documento); (áudio foi removido do app por decisão do usuário); iPad pode suspender o app em segundo plano (ao voltar ele sincroniza na hora).
