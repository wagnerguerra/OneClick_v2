# Migração: Não Conformidades (v1 → v2)

Port do módulo `sgq_rnc` do OneClick v1 (dados em `sgq_nc` e satélites no
`db_intranet`) para o v2, no bloco Qualidade. É o workflow mais completo da
Qualidade do v1: registro → análise da causa → plano de ação → forma de
avaliação → avaliação de eficácia, com **reincidência automática** quando o
tratamento não foi eficaz.

## 1. O que o levantamento mostrou

- **`sgq_nc` — 235 linhas (88 ativas)**. Situações (sgq_nc_sit): Aguardando
  Ações(1) / Em Tratamento(2) / Aguardando Conclusão(3) / NC Finalizada(4) /
  NC Cancelada(5) / Aguardando Causa(6) — ativas: 32 em Aguardando Ações e 56
  Finalizadas. `tipo` 1/2 (NC / Oportunidade de Melhoria — o 2 parou de ser
  usado em 2023; o form atual nem tem o campo, default 1).
- **Campos-chave**: cliente (100% das ativas), área (= `ger_cad_set`),
  **processo = `sgq_proc`** (o mesmo mapa dos Documentos Internos!), origem
  (lookup `sgq_nc_ori`, 7 itens), responsável, prazo, detalhamento, NC
  similar (id + texto), reincidência + `id_nc_anterior`, causa
  (texto/data/autor), forma de avaliação (`eficacia_*`), avaliação final
  (texto/eficaz/autor/data), pós-avaliação (`at_swot`/`at_rev` + descrições),
  `id_reclamacao` (vínculo com `sgq_rec`, módulo ainda não migrado).
- **Fluxo de reincidência do v1** (`details.asp`): avaliação com EFICAZ=0
  insere uma NC NOVA copiando os dados, com `reincidencia=1` e
  `id_nc_anterior` — portado 1:1 no service do v2.
- **`sgq_nc_aca` — 458 (428 ativas, 127 de NCs ativas)**: tipo 1-3 =
  Imediata/Corretiva/Avaliação de Eficácia; **responsável em texto livre**;
  situacao 0/1; datas de finalização em formato misto (`d/m/yyyy`).
- `sgq_nc_msg` (3), `sgq_nc_arq` (4 — só 2 arquivos ainda existem em
  `/files/sgq_rnc`), `sgq_nc_log` (535 frases prontas — migradas como
  histórico).
- **`sgq_nc_old` (138) NÃO entra**: nenhuma página do v1 a lê (fluxo
  abandonado, mesmo precedente da `sgq_mel_old`).

## 2. Modelo no v2

`NaoConformidade` + `NaoConformidadeOrigem` (cadastro) + `Acao` + `Mensagem`
+ `Arquivo` + `Log`. Decisões:

- **Situações e tipos de ação são enums fixos**; **origens viram cadastro**
  gerenciável (`/nao-conformidades/configuracoes`).
- **Transições de situação moram no service** (`recalcularSituacao`): criar
  ação → Em Tratamento; plano concluído + forma de avaliação registrada →
  Aguardando Conclusão; avaliar → Finalizada; **não eficaz → Finalizada +
  nova NC por reincidência** (o front nunca decide transição).
- Processo reutiliza `documento_processos`; cliente/área/usuários por ID com
  resíduo de nome; exclusão soft-delete; `legacy_reclamacao_id` guarda o
  vínculo com a reclamação do v1 até o módulo existir no v2.
- Arquivos legados servidos por `/api/upload/nc-legado/:filename`.

SQL de estrutura: `packages/db/prisma/sql/add_nao_conformidades.sql`.

## 3. Backend / UI

- `apps/api/src/nao-conformidade/` — service + router (`naoConformidade`),
  slug `nao-conformidades`, sem sub-permissões.
- `apps/web/src/app/(dashboard)/nao-conformidades/` — listagem (filtros por
  situação/origem/área/reincidência), `/new` (causa opcional: sem ela a NC
  nasce Aguardando Causa), `/[id]` (fato gerador, causa, plano de ação,
  eficácia em duas etapas, atualização do sistema da qualidade, mensagens,
  arquivos, histórico) e `/configuracoes` (origens).

## 4. Carga dos dados

Gerador: `scripts/legacy-v1-nc-import.js` (read-only; SQL idempotente por
`legacy_id`; cliente por CNPJ no destino; processo/origem por `legacy_id`;
vínculos NC→NC em segunda passada; copia os arquivos físicos para
`apps/api/uploads/nc-legado/`).

Resultado (dev, 19/08): **7 origens, 88 NCs** (32 Aguardando Ações + 56
Finalizadas), **127 ações**, 2 arquivos, 465 logs, 1 vínculo NC→NC; 0 órfãos;
área e processo 100% resolvidos; 15 NCs sem cliente casado no snapshot de dev
(razão social preservada no resíduo — produção tende a casar mais).

## 5. Produção

Runbook padrão: validar IDs embutidos, DDL + carga **como `-U oneclick`**,
copiar os arquivos de `uploads/nc-legado/` para o volume da VPS, validar os
contadores do §4.

## 6. Desativação no v1

`\\192.168.0.7\wwwroot\central\modules\sgq_rnc\` (adm/ e usu/) — bloquear com
`.bak` antes: `create.asp`/`create-send.asp`, os branches de POST do
`details.asp`, os modais de ação/msg/arq/finalizar/delete, os `st_*.asp`
(transições) e `envia_fim.asp`; banner + botão Novo desabilitado nos index.
