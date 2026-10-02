# Changelog

Formato: [versão] - data. Versão 0.x = em construção (a sincronização na nuvem ainda não está ligada).

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
