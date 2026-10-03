# Menu principal do Pregar: barra de ações + "Mais"

Data: 2026-10-03 · Status: **implementado** na v0.15.0 (2026-10-03) · Teste de toque real em tablet: pendente com o usuário

## 1. Objetivo
Hoje o menu de cima tem 12 itens (Acervo, Agenda, Assistentes, Teleprompter, Ilustrações, Datas, Oração, Leitura, Bíblia, Estatísticas, Backup, Ajustes). No tablet ele quebra em 2 ou 3 linhas e rouba espaço da tela. O usuário pediu: deixar **na barra principal só os módulos que se executam** e mover o resto para **Configurações/Mais**.

Critérios de sucesso:
- A barra principal cabe em **uma linha** no computador, no tablet em pé e no tablet deitado.
- Os 5 módulos de ação ficam sempre à vista; o resto está a um toque, dentro de "Mais".
- No tablet a barra fica **embaixo** (alcance do polegar). Telas imersivas (pregar, teleprompter, entrada com senha) continuam sem nenhuma barra.
- Nenhum endereço (`#/…`) deixa de funcionar; nenhum dado muda.

## 2. Decisões já tomadas com o usuário
- Divisão: barra principal = **Acervo, Teleprompter, Oração, Leitura, Bíblia** + **Mais**.
- Abordagem **A**: uma barra responsiva única. Topo no computador (ponteiro de mouse e largura ≥ 900 px); **embaixo** em telas de toque (`pointer: coarse`) ou largura < 900 px.
- **Backup** deixa de ser item de menu: vira seção dentro de **Configurações** (o item "Ajustes" passa a se chamar "Configurações").
- Fora de escopo: barra lateral, ícones personalizados, mudar o conteúdo das telas existentes.

## 3. Estrutura da navegação

### 3.1 Barra principal (`<nav id="tabs">`)
Seis botões, nesta ordem: Acervo · Teleprompter · Oração · Leitura · Bíblia · Mais.
Cada um tem ícone (emoji, como no resto do app) e rótulo curto ("Telepr." na barra de baixo estreita). Item ativo recebe `aria-current="page"` e destaque visual.

### 3.2 Painel "Mais" (`<div id="more">`)
Grupos e itens:
- **Preparar:** Assistentes (`#/assistentes`), Ilustrações (`#/ilus`), Datas especiais (`#/datas`).
- **Acompanhar:** Agenda (`#/agenda`), Estatísticas (`#/stats`).
- **Sistema:** Configurações (`#/ajustes`).
Comportamento: abre ao tocar em "Mais"; fecha ao tocar fora, ao apertar Esc, ao escolher um item e ao trocar de tela. Computador: menu suspenso ancorado ao botão. Toque/estreito: folha acima da barra de baixo. Itens com no mínimo 52 px de altura em toque. O botão "Mais" fica ativo quando a tela atual é uma das do painel.

### 3.3 Cabeçalho fino (`<header id="top">`)
Uma linha: nome do app, estado da sincronização (`#syncst`) e botão de tema. Sem links de navegação. Mantém `position: sticky` no topo.

### 3.4 Qual item fica ativo
| Rota (`#/…`) | Item aceso |
|---|---|
| (vazio), `s/…`, `slides/…`, `assist/…` | Acervo |
| `teleprompter`, `teleprompter/…` | Teleprompter |
| `oracao` | Oração |
| `plano`, `plano/…` | Leitura |
| `biblia` | Bíblia |
| `assistentes`, `ilus`, `datas`, `datas/…`, `agenda`, `stats`, `ajustes`, `backup` | Mais |

Implementação: uma função `navActive(rota)` em `app.js`, usada pelo roteador. Substitui o destaque atual por `data-r`.

## 4. Telas imersivas
As classes de corpo `preaching`, `prompting` e `gated` escondem `#top`, `#tabs` e `#more` (CSS). Nada mais é imersivo. Os atalhos de teclado e do pedal não mudam.

## 5. Configurações (antigo Ajustes)
- Título passa a "Configurações".
- Ganha a seção **Backup e restauração** (id `sec-backup`) com os botões atuais de Exportar, Importar e o aviso. A seção "Backup automático" já existente fica logo abaixo.
- A rota `#/backup` continua existindo e redireciona para `#/ajustes`, rolando até `sec-backup`. A tela `backup()` é removida depois de seu conteúdo ser movido.
- Ordem das seções: Perfil do pregador, Teclado e pedal, Conta e sincronização, Backup e restauração, Backup automático.

## 6. Visual e toque
- Barra de baixo: `position: fixed; bottom: 0`, altura mínima 56 px + `env(safe-area-inset-bottom)`; alvo de cada botão ≥ 52 px; ícone em cima, rótulo embaixo, uma linha.
- `main` ganha `padding-bottom` igual à altura da barra de baixo (em toque/estreito) para que nada fique escondido.
- Sem rolagem horizontal em 360, 768, 1024 e 1366 px de largura.
- Mantém o tema claro/escuro e as variáveis de cor existentes.

## 7. Arquivos afetados
- `index.html`: cabeçalho fino, `<nav id="tabs">`, `<div id="more">`; remove `#nav`.
- `style.css`: estilos da barra (topo e embaixo), do painel Mais e do padding.
- `app.js`: `navActive`, abertura/fechamento do Mais, rota `#/backup`, remoção de `backup()` e do destaque por `data-r`.
- `ajustes.js`: título "Configurações" e a seção Backup e restauração.
- `sw.js`: versão do cache; `CHANGELOG.md`, `VERSION`, `PENDENCIAS.md`.

## 8. Plano de teste (navegador, com capturas)
1. Larguras 360, 768 (em pé), 1024 (deitado) e 1366: a barra principal ocupa uma linha; nada sai da tela.
2. Posição: topo no computador (largura ≥ 900 e mouse), embaixo em toque (simulado por `matchMedia`).
3. Item ativo correto para cada rota da tabela do item 3.4, inclusive rotas internas (`#/s/ID`, `#/assist/ID/…`).
4. Mais: abre, fecha ao tocar fora, com Esc e ao escolher item; navega para cada um dos 6 destinos.
5. Imersivas: modo pregação, teleprompter e tela de entrada sem barra nenhuma; ao sair, a barra volta.
6. `#/backup` redireciona para Configurações e rola até a seção; exportar e importar continuam funcionando.
7. Regressão: login, sincronização, atalhos de teclado, banners da tela inicial e as 14 provas do núcleo de sincronização.
8. Depois de publicar: conferir no site real, em aba limpa, sem erros no console.

## 9. Riscos e cuidados
- A barra de baixo pode cobrir o fim das telas: coberto pelo `padding-bottom` e pelo teste 1.
- iPad e área segura: usar `env(safe-area-inset-bottom)` e `viewport-fit=cover` (já presente).
- O navegador de teste se diz "oculto" e não simula toque de verdade: usar `matchMedia` simulado e capturas; o toque real fica com o usuário.
- Quem tinha `#/backup` salvo nos favoritos: coberto pelo redirecionamento.

## 10. Fora de escopo (por agora)
Reordenar a barra pelo usuário, notificações na barra, barra lateral, e qualquer mudança de conteúdo das telas.
