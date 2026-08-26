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

### 1. Agenda — `concluída` · commit `3f78a9f2`

| Item | Status |
|---|---|
| [x] Cabeçalho e ações da página | barra de ações do celular quebra em linhas, botões em `h-9` |
| [x] Barra de filtros | painel lateral já era `hidden xl:block`; o seletor de tipo passa a ocupar a largura toda no celular |
| [—] Listagem / tabela | a Agenda não tem tabela — a visão é o calendário |
| [x] Calendário: mês em tela estreita | célula compacta (número + bolinhas por tipo, `+N`), linha de 62px; o detalhe abre no modal do dia, que já existia |
| [x] Modais do módulo | as duas colunas do modal de evento empilham abaixo de `sm` (220px fixos não cabem num modal de ~358px) |
| [x] Ações que só existem no hover | anotações, anexos, participantes e tarefas: visíveis no toque, hover só a partir de `sm` |

### 2. Coleta e Recebimento — `concluída` · commit `e50aa466`

| Item | Status |
|---|---|
| [x] Cabeçalho e ações da página | já usava PageHeaderBar com ações que quebram |
| [x] Barra de filtros | já era `flex-wrap`; selects de 135/175px cabem lado a lado em 358px |
| [x] Tabela de registros | no celular ficam cliente, situação e ações; número e tipo descem para dentro da célula do cliente |
| [x] Kanban em tela estreita | rola na horizontal (`overflow-x-auto`), que é a forma natural do kanban |
| [x] Modais | os do módulo usam o DialogContent padrão, que já é responsivo |
| [—] Ações no hover | não há ação escondida em hover neste módulo |

### 3. HelpDesk — `concluída` · commit `28fcdb51`

| Item | Status |
|---|---|
| [x] Cabeçalho e ações da página | já quebrava em linhas |
| [x] Barra de filtros | `flex-wrap` já existia; busca dos indicadores deixou de ter 320px fixos |
| [x] Lista de tickets | no celular o módulo abre em lista, não em kanban (seis colunas de 240px = 1440px de rolagem) |
| [x] Painel de detalhe | painel lateral em largura total (base) + abas que não cortam a primeira quando não cabem |
| [x] Modais do módulo | DialogContent padrão |
| [x] Ações que só existem no hover | editar título do ticket passa a ficar visível no toque |

### 4. Orçamentos — `concluída` · commit `43f339d0`

| Item | Status |
|---|---|
| [x] Cabeçalho e ações da página | header inline já quebrava em linhas |
| [x] Barra de filtros | filtro de status em largura total no celular |
| [x] Listagem e kanban | tabela reduzida ao essencial em tela estreita; no celular o módulo abre em tabela, não em kanban (colunas de 340px) |
| [x] Página de detalhe | já empilhava abaixo de `lg` e as abas já rolavam sem cortar |
| [—] Impressão / proposta | a proposta impressa tem largura de papel por definição — não é caso de responsividade |
| [x] Ações que só existem no hover | cinco pontos entre listagem e detalhe agora visíveis no toque |

> `orcamentos/[id]/old` ficou de fora de propósito: é a cópia congelada da tela
> antiga, mantida só para consulta.

## Demais módulos — varredura na ordem do menu

Base aplicada a todo o sistema nesta fase:

| Item | Commit |
|---|---|
| [x] 68 ações escondidas em hover viram visíveis no toque (38 telas) | `7def7ff7` |
| [x] Medição em produção a 1351px: nenhuma tela da amostra vaza na horizontal | verificado |

> A janela do Chrome automatizado não desce abaixo de ~1350px de largura, então a
> conferência de celular continua sendo por código. Medição real só do notebook.

### Cadastros
- [x] Grupos de Serviço · `ba90bc4b`
- [x] Serviços e Obrigações — tabelas de catálogo e execuções adaptadas · `d087359c`
- [x] Áreas, Cargos, Contatos — já escondiam colunas; sem ajuste necessário
- [x] Clientes, Colaboradores, Usuários, Fornecedores, Sócios, Empresas — sem vazamento a 1351px; tabelas dentro do limite
- [ ] Grupos Empresariais — módulo ainda em construção (wip)

### Comercial
- [x] Painel Comercial, Gestão de Contratos, Custeio de Clientes, CRM (lista) · `ba90bc4b`
- [x] Orçamentos — Parâmetros · `588fb22b`
- [—] Relatórios do CRM e de Orçamentos — telas de análise, tabela larga com rolagem própria é o esperado

### Administrativo
- [x] Agenda · Coleta (fase anterior)
- [ ] Gerenciador de Serviços · Minhas Obrigações · Acessórias · Processos

### Legalização
- [x] Certificados Digitais — 9 colunas adaptadas · `d087359c`
- [ ] Benefícios Fiscais · Certidões e Alvarás

### Trabalhista
- [x] Controle de Férias (fases anteriores, já nasceu com colunas responsivas)
- [ ] Benefícios · Importação de Folha · Espelho da Folha

### Fiscal
- [x] DT-e, DANFE, NFS-e e Lotes de DANFE · `ba90bc4b` / `588fb22b`
- [x] Caixa Postal (regras) — já escondia colunas
- [ ] DCTFWeb · Situação Fiscal — conferir na próxima passada

### Contábil
- [ ] Categorias de Balancete · Dashboard Financeiro · Tratamento de Lançamentos

### TI
- [x] Gestão de Ativos — 8 colunas adaptadas · `d087359c`
- [x] HelpDesk (fase anterior)
- [x] Projetos (tarefas do projeto) · `ba90bc4b`
- [—] Relatórios da TI e Métricas — telas de análise, rolagem lateral aceitável

### Qualidade
- [ ] Aquisições · Capacitações · Documentos · Elogios · Melhorias · Não Conformidades · Reclamações · Reuniões · Sugestões · Tabelas de Registros

### Configurações e Admin
- [x] Painéis de TV · `588fb22b`
- [—] Design System, Erros de Cliente, Métricas — telas internas de análise
- [ ] Configurações Gerais e demais telas administrativas

## Decisões pendentes

_(o que precisa da palavra do Wagner antes de virar código)_

- Nada por enquanto.

## Achados que não são responsividade

_(o que aparecer no caminho e merecer conserto à parte)_

- Nada por enquanto.
