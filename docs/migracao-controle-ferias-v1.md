# Migração: Controle de Férias (v1 → v2)

Port do módulo `crp_ferias` do OneClick v1 para o v2, no bloco Trabalhista
(`/controle-ferias`). Primeiro módulo migrado FORA da Qualidade, abrindo a
frente do Corporativo/Trabalhista.

## 1. O que o levantamento mostrou

- **`crp_ferias` — 143 (78 ativos, 38 colaboradores)**: um registro por
  PERÍODO AQUISITIVO (anos `periodo_inicial`/`periodo_final` em colunas
  YEAR), `dias` em varchar (sempre "30"), `saldo_anterior`, previsão, até
  **três datas de pagamento** (`dt_pagto`/2/3), flags `pago` e `historico`
  (94 consolidados). `id_empresa` é um hash de instalação — uma empresa só.
- **`crp_ferias_eventos` — 326 (312 ativos)**: os gozos (início/fim/descrição,
  ordem). 115 pertencem a períodos inativos e ficam no v1.
- **`crp_ferias_arquivos` — 32**: recibos/avisos em `/files/crp_ferias`
  (6 de períodos inativos ou sumidos do disco).

## 2. Modelo no v2

`FeriasPeriodo` + `FeriasEvento` (gozos) + `FeriasArquivo`. Decisões:

- **O saldo é DERIVADO no service** (dias + saldo anterior − gozados, com
  gozo contando fim − início + 1) e entregue pronto no payload — o v1
  guardava o dado espalhado e a conta era refeita em cada tela.
- `pago` acompanha as datas de pagamento (qualquer uma preenchida = pago);
  `historico` tira o período das pendências (filtro padrão = Em aberto).
- Colaborador por ID com resíduo de nome; exclusão hard (com confirmação) —
  a carga só traz os ativos do v1.
- Recibos legados servidos por `/api/upload/ferias-legado/:filename`;
  anexos novos entram pelo upload padrão.

SQL: `packages/db/prisma/sql/add_controle_ferias.sql` (idempotente).

## 3. Backend / UI

- `apps/api/src/controle-ferias/` — service + router (`controleFerias`),
  slug `controle-ferias`, sem sub-permissões.
- `apps/web/src/app/(dashboard)/controle-ferias/` — listagem (filtros por
  situação/colaborador, saldo com farol) com criação em modal; detalhe
  (`/[id]`) com gozos (lançar/excluir, saldo recalculado na hora), recibos
  com upload e os dados do período (pagamentos, previsão, histórico) na
  sidebar.

## 4. Carga dos dados

Gerador: `scripts/legacy-v1-ferias-import.js` (read-only; idempotente por
`legacy_id`; copia os arquivos físicos para `apps/api/uploads/ferias-legado/`).

Resultado (dev, 19/08): **78 períodos** (8 com colaborador só no resíduo —
ex-colaboradores), **197 gozos**, **24 arquivos**, 29 históricos; 0 órfãos.

## 5. Produção

Runbook padrão: DDL + carga **como `-U oneclick`**, copiar
`uploads/ferias-legado/` para o volume, validar os contadores do §4.

## 6. Desativação no v1

`\\192.168.0.7\wwwroot\central\modules\crp_ferias\` — bloquear com `.bak`:
todos os `modal-*.asp` de escrita (create, delete, lancamento, periodo,
pgto, movimento, pagamento, arq) + banner e botão desabilitado no index.
