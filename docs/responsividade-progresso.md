# Responsividade — controle da varredura

Acompanhamento da adequação do sistema a celular, tablet e notebook (1366×768).
O que fazer em cada tela está em [`PADRAO_RESPONSIVIDADE.md`](PADRAO_RESPONSIVIDADE.md) —
**aqui só se dá baixa**.

**Ordem definida pelo Wagner (26/08/2026):** Agenda → Coleta → HelpDesk → Orçamentos.

## Como usar

- `[ ]` pendente · `[x]` feito · `[—]` não se aplica (com o motivo na linha)
- Ao concluir um módulo, anote o commit na coluna e passe ao próximo da ordem.
- Item que virar decisão de produto (o que esconder no celular) sobe para
  "Decisões pendentes" em vez de ficar travando a fila.

## Base já concluída (vale para todo o sistema)

| Item | Commit |
|---|---|
| [x] Sidebar recolhida: blocos cortados em telas de 768px de altura | `12ec0691` |
| [x] Sub-abas: conteúdo sem `min-w-0` empurrando o card para fora | `12ec0691` |
| [x] Permissões do usuário: grade por largura + barra de grupos que quebra | `12ec0691` |
| [x] Dashboard: widgets viram pilha abaixo de 640px | `1bc8d748` |
| [x] Painéis laterais (Sheet): largura total no celular | `1bc8d748` |
| [x] 32 grades de cartões com colunas fixas → responsivas (21 telas) | `8a8543d8` |
| [x] Hook `useIsMobile` para trocas de estrutura | `1bc8d748` |
| [—] Modais e tabelas: os componentes base do `@saas/ui` já são seguros | verificado |

## Por módulo

Cada módulo passa pelos mesmos seis pontos.

### 1. Agenda — `em andamento`

| Item | Status |
|---|---|
| Cabeçalho e ações da página | [ ] |
| Barra de filtros (quebra em vez de rolar; selects largura total no celular) | [ ] |
| Listagem / tabela (colunas secundárias somem antes de espremer) | [ ] |
| Calendário: mês/semana/dia em tela estreita | [ ] |
| Modais e painéis laterais do módulo | [ ] |
| Ações que só existem no hover | [ ] |

### 2. Coleta e Recebimento — `na fila`

| Item | Status |
|---|---|
| Cabeçalho e ações da página | [ ] |
| Barra de filtros | [ ] |
| Tabela de registros | [ ] |
| Kanban em tela estreita | [ ] |
| Modais (novo registro, categorias) | [ ] |
| Ações que só existem no hover | [ ] |

### 3. HelpDesk — `na fila`

| Item | Status |
|---|---|
| Cabeçalho e ações da página | [ ] |
| Barra de filtros | [ ] |
| Lista de tickets | [ ] |
| Painel de detalhe do ticket | [ ] |
| Modais do módulo | [ ] |
| Ações que só existem no hover | [ ] |

### 4. Orçamentos — `na fila`

| Item | Status |
|---|---|
| Cabeçalho e ações da página | [ ] |
| Barra de filtros | [ ] |
| Listagem e kanban | [ ] |
| Página de detalhe (abas, cards laterais) | [ ] |
| Impressão / proposta | [ ] |
| Ações que só existem no hover | [ ] |

## Decisões pendentes

_(o que precisa da palavra do Wagner antes de virar código)_

- Nada por enquanto.

## Achados que não são responsividade

_(o que aparecer no caminho e merecer conserto à parte)_

- Nada por enquanto.
