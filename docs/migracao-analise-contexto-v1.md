# Migração: Análise de Contexto (v1 → v2)

Port do módulo `sgq_contexto` do OneClick v1 (dados em `sgq_ctx`/`sgq_ctx_act`
no `db_intranet`) para o v2, no bloco Qualidade. É a SWOT do contexto da
organização (ISO 9001 §4.1): oportunidades, ameaças, forças e fraquezas, com
grau de risco, plano de ação e avaliação de eficácia.

## 1. O que o levantamento mostrou

- **`sgq_ctx` — 42 linhas (39 ativas)**: contexto 1/2 = Análise Externa/
  Interna; tipo 1-4 = Ext-Oportunidade / Ext-Ameaça / Int-Força / Int-Fraqueza;
  identificação; processo (TEXTO LIVRE: "Estratégico", "Trabalhista"... — não
  é o `sgq_proc`); partes interessadas (texto); gravidade/benefício ×
  probabilidade (1-3); responsável (user id); prazo; avaliação de eficácia
  (avaliador, data, texto, eficaz 0/1).
- **`sgq_ctx_act` — 48 linhas (46 ativas)**: ações do plano. Tipo 1-3 =
  Imediata/Corretiva/Avaliação de Eficácia; descrição em `acao` (o campo
  `oquefazer` está sempre nulo); **responsável é TEXTO LIVRE** (às vezes mais
  de um nome: "Fabiana Alves,Rose Munhão"); situacao 0/1 = aberta/finalizada;
  finalizador por user id ('0' = nenhum).
- **Datas em formato misto** na mesma coluna: `yyyy-mm-dd` E `d/m/yyyy`
  (`dt_avaliacao`, `dt_finalizado`) — o import trata os dois.
- `sgq_ctx_arq`, `sgq_ctx_log`, `sgq_ctx_msg` estão **vazias**.
- As `sgq_con_*` (5 linhas cada) são uma matriz SWOT antiga **abandonada** — o
  módulo `sgq_swot` atual também lê `sgq_ctx`, então nada a migrar delas.
- Estrutura do módulo: só `adm/` (o `usu/` está vazio) → **sem sub-permissões**
  no v2.

## 2. Modelo no v2

`AnaliseContexto` + `AnaliseContextoAcao` (cascade). Decisões:

- **Análise/tipo/tipo de ação são enums fixos** da metodologia (strings
  UPPER), não cadastros.
- **Grau de risco = gravidade × probabilidade, derivado no service** e
  entregue no payload (`grauRisco`) — o front não refaz a conta (padrão
  estados derivados).
- `processo` continua **texto livre**, como no v1.
- Responsáveis **por ID com resíduo de nome** (`responsavelNome`) para
  ex-colaboradores; na AÇÃO, o texto do v1 só vira ID quando casa exatamente
  com um usuário — senão o texto inteiro fica no resíduo.
- Exclusão é **soft-delete** (`ativo=false`), como o v1.
- Campos ricos (partes interessadas, descrição de ação, avaliação) são HTML de
  RichEditor; o texto plano do legado é embrulhado em `<p>` na carga.

SQL de estrutura: `packages/db/prisma/sql/add_analise_contexto.sql`
(idempotente, sem dependências).

## 3. Backend / UI

- `apps/api/src/analise-contexto/` — service + router (`analiseContexto`),
  slug `analise-contexto`, sem sub-permissões.
- `apps/web/src/app/(dashboard)/analise-contexto/` — listagem (filtros por
  análise/tipo/situação, farol de risco, progresso do plano) com cadastro em
  modal; detalhe (`/[id]`) com plano de ação (concluir/reabrir/editar/excluir),
  avaliação de eficácia (modal eficaz/não eficaz) e dados editáveis na
  sidebar.

## 4. Carga dos dados

Gerador: `scripts/legacy-v1-contexto-import.js` (read-only no v1; produz
`scripts/out/v1-analise-contexto.sql`, idempotente por `legacy_id`; a ação
resolve o pai por subselect no destino).

Resultado (dev, 19/08): **39 registros + 45 ações**, 0 órfãs; responsável 31
por id + 8 por resíduo; 11 avaliados; 31 ações concluídas. Registros e ações
inativos no v1 ficam lá.

## 5. Produção — ✅ aplicada em 19/08

- IDs embutidos validados antes (empresa + 6/6 usuários).
- DDL e carga aplicados **como `-U oneclick`** (owner conferido nas duas
  tabelas). Resultado idêntico ao dev: **39 registros + 45 ações**, 0 órfãs,
  31 responsáveis por id, 11 avaliados, 31 ações concluídas.
- O `add_analise_contexto.sql` segue no stage 4.5 do deploy (idempotente).
  A UI entra no ar com o commit `3ac67387`.

## 6. Desativação no v1 — ✅ aplicada em 19/08

Todos os arquivos editados ganharam **`.bak-2026-08-19`** ao lado antes da
edição (lição do incidente das Tabelas de Registros).

- `sgq_contexto/adm/`: os 15 modais de gravação (create, delete, ações,
  msg, arq, analise, finalizar) bloqueados por redirect no topo; no
  `details.asp` só os 2 branches de POST foram guardados (a página segue
  como consulta, com banner); `index.asp` com banner + botão Novo
  desabilitado.
- `sgq_swot/` (grava nas MESMAS tabelas): os 10 processadores
  (`acao_*.asp`, `edit.asp`, `modal-acao-*`) bloqueados por inteiro; em
  `index.asp`/`index2.asp` os 3 branches de POST (insert/update/delete)
  guardados + banner.
- Conferido logado: banner no topo, Novo esmaecido, listagem de consulta
  intacta.
