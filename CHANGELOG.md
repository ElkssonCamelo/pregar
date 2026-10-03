# Changelog

Formato: [versão] - data. Versão 0.x = em construção (a sincronização na nuvem ainda não está ligada).

## [0.13.0] - 2026-10-03
### Adicionado
- **Tela de entrada obrigatória (e-mail e senha)**: ao abrir o app sem login neste aparelho. Criar conta, "esqueci a senha" (link por e-mail e tela de nova senha), entrar por link (alternativa), mostrar/esconder senha, mensagens de erro em português. `requireLogin` em `config.js` liga/desliga.
- **Depois de entrar uma vez, o app abre também sem internet** (a sessão fica guardada; a senha só é pedida de novo se a sessão for revogada).
- Ajustes > Conta: alterar senha e **sair com segurança**: opção de apagar os dados do aparelho (recomendado em aparelho compartilhado), **recusada se houver mudanças ainda não enviadas à nuvem**.
- Entrar com outra conta num aparelho que tem dados de uma conta anterior: o app pergunta se apaga os dados locais antes.

### Observações
- A tela de entrada protege o uso normal do app; os dados locais do navegador não são criptografados (a proteção real dos dados na nuvem é o login + RLS do banco).
- Supabase (painel, a cargo do usuário): para entrar logo após criar a conta, desligar "Confirm email" (Authentication > Sign In / Providers > Email). Depois de criar a própria conta, desligar "Allow new users to sign up".
- Testado com um servidor de mentira (nenhuma chamada real, nenhuma conta criada): entrada, senha errada, criar conta (erros), confirmar e-mail, senha esquecida, nova senha, link expirado, sair mantendo/apagando, proteção contra apagar sem enviar, troca de conta, abrir sem internet.

## [0.12.0] - 2026-10-03
### Adicionado
- **Sincronização ligada** ao Supabase (projeto `pregar`, região São Paulo, conta nova): login por e-mail em Ajustes > Conta e sincronização; pregações (com materiais), ilustrações, pedidos de oração, planos, datas, assistentes e perfil sincronizam entre aparelhos.
- Banco: tabela `items` com RLS por usuário aplicada e verificada (usuário A não vê/altera dados do B; anônimo bloqueado; "vale o mais novo" e lápides conferidos; verificador de segurança do Supabase sem alertas).

### Pendente para funcionar de ponta a ponta (painel do Supabase, feito pelo usuário)
- Authentication > URL Configuration: Site URL `https://meupregar.vercel.app` e Redirect URLs `https://meupregar.vercel.app/**` e `http://localhost:8123/**`.
- (Recomendado) incluir `{{ .Token }}` no modelo de e-mail "Magic Link" para entrar com código de 6 dígitos.
- Após o primeiro login: desligar "Allow new users to sign up" (impede que desconhecidos criem conta no seu projeto).

## [0.11.1] - 2026-10-03
### Corrigido
- **Tela em branco na primeira abertura do site publicado** (conexão mais lenta): o app começava a montar a tela antes de todos os scripts terminarem de carregar (`teleprompter is not defined`, `autoBackup is not defined`) e o modo offline nem chegava a ativar. Agora o início espera todos os scripts (DOMContentLoaded).
- Uma falha em tela ou recurso opcional (lembretes, sincronização, backup automático, modo offline) não derruba mais o app: vira aviso no console ou mensagem na tela com botão "Recarregar".
- `tests/slowserver.js`: servidor de teste que atrasa os scripts para reproduzir esse tipo de falha.

## [0.11.0] - 2026-10-03
### Adicionado
- **Teleprompter** (`teleprompter.js`): rolagem automática em palavras por minuto (40 a 300) ou por "durar N min", contagem regressiva 3-2-1, linha-guia, espelho, 4 temas de cor, tamanho da letra, largura e espaço entre linhas, barra de progresso com tempo decorrido e "faltam". Toque no texto pausa/continua; arrastar rola à mão; a barra some enquanto lê.
- Abre a partir de um **material** (botão no card), do **esboço da pregação** (com o texto dos versículos), de **texto colado** ou da tela Teleprompter (menu). Marcações `[pausa]` viram selos e podem parar a leitura por 2 s; `[notas]` ficam esmaecidas; `# títulos` e `**negrito**` funcionam.
- Atalhos e pedal: Espaço, ↑/↓ velocidade, setas/PageUp/PageDown pulam (as teclas de Ajustes valem), +/− letra, M espelho, G guia, R início, F tela cheia, Esc sai. Configurações lembradas.

### Corrigido
- Modo offline: o service worker agora **sempre revalida** com o servidor (`cache: 'no-cache'`); antes, uma atualização podia demorar a chegar ao aparelho por causa do cache do navegador.

## [0.10.0] - 2026-10-03
### Adicionado
- **Assistentes** (`assistentes.js`): biblioteca de prompts com variáveis (`{{titulo}}`, `{{topicos}}`, `{{texto_biblico}}`, `{{perfil}}`…) que o app preenche com os dados da pregação. Botões "Abrir no Claude" (prompt preenchido; se longo, copiado) e "Copiar prompt"; o resultado volta como **material** guardado na pregação.
- **10 modelos iniciais genéricos** (gerar pregação, tutor, análise teológica, estudo bíblico, pregação para mim, estudo de célula, WhatsApp, roteiro de Reels, devocional, série). Duplicar/editar/excluir; **importar prompts do usuário** (.md/.txt, inclusive formato SKILL.md com cabeçalho).
- **Perfil do pregador** (Ajustes): igreja, denominação, tradução, público, tom e regras, usado em todos os assistentes.
- **Materiais por pregação**: editar, copiar, enviar por WhatsApp (mensagens longas vão pela área de transferência), exportar Word/Markdown.
- Backup e sincronização passam a incluir assistentes e perfil (esquema do banco atualizado: tipos `assist` e `profile`).

### Decisões
- A IA roda fora do app (Claude), sem custo de API. "Gerar aqui dentro" (API pelo servidor, pago por uso, com login) fica para depois do Supabase.
- Os prompts do usuário ficam nos dados dele, não no código público. Nenhum texto da coleção pastor-ai (terceiros, licença desconhecida) foi copiado.

### Corrigido
- Duplicar um modelo inicial não salvava a cópia.

## [0.9.0] - 2026-10-02
Primeira versão completa do Pregar (PWA 100% local, sem servidor).

### Adicionado
- **Acervo** de pregações: busca, pastas, séries, tags, status; editor em tópicos (versículos, frase-chave, citação, lista, observações, aplicação, ilustração), introdução, conclusão, notas pós-pregação, gravação de áudio, duplicar, modelos de esboço, checklist de preparação.
- **Modo pregação**: cronômetro com alerta (amarelo/vermelho, borda piscando), ritmo por tópico, relógio, Bíblia em janela, tela cheia; **layout para toque/tablet** (botões de 52 px, barras fixas, deslizar para trocar tópico/slide).
- **Slides** gerados do esboço, projetor em outra janela, **7 temas**, fundo com imagem (geral ou por slide), logo, fonte, tamanho, alinhamento.
- **Bíblia** offline (Almeida Corrigida Fiel embutida), Almeida/KJV online, importação de versão própria (JSON), abreviações; **referências cruzadas** (OpenBible.info, CC-BY).
- **Banco de ilustrações e citações** com tags e aviso de reuso; **cartão de imagem** da frase-chave (PNG); **exportar** para Word (.docx) e Markdown; **importar** Word/PDF/TXT com reconhecimento de estrutura (pdf.js 3.11.174, Apache-2.0).
- **Plano de leitura + diário**, **oração e visitas** (retornos agendados, modo oração), **datas especiais** (Páscoa, Pentecostes, Advento… calculadas), agenda com notificações, estatísticas.
- **Teclado e pedal** configuráveis (valem também com a janela do projetor em foco).
- **Backup automático**: pontos de restauração, pasta no Chrome/Edge, avisos; backup/restauração em JSON.
- **Sincronização** (preparada, desligada): núcleo testado (`synccore.js`, 14 testes), cliente Supabase (`sync.js`), esquema (`supabase/schema.sql`), tela Ajustes > Conta e sincronização.

### Corrigido
- Cor dos tópicos ilegível com tema claro/escuro manual.
- Paginação da sincronização travava com janela de segurança em envios grandes (agora por deslocamento com ordem estável).
- Importador: marcadores de lista do Word, rótulos "Aplicação:" no PDF, texto-base da exportação do próprio app.

### Pendente (ver PENDENCIAS.md)
- Criar o projeto Supabase `pregar` (limite de 2 projetos gratuitos ativos), aplicar `supabase/schema.sql`, preencher `config.js`.
- Publicar em HTTPS (Vercel) para uso no tablet; controle do telão pelo celular (QR Code); IA; OCR; PowerPoint; API.Bible.
