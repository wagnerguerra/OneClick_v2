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

## 5. Produção — ✅ aplicada em 20/08

- IDs embutidos validados (31/31 usuários). DDL + carga **como
  `-U oneclick`** (owner conferido nas 3 tabelas). Resultado idêntico ao
  dev: **78 períodos, 197 gozos, 24 recibos**, 0 órfãos.
- Recibos copiados para o volume (`uploads/ferias-legado/`).
- O `add_controle_ferias.sql` segue no stage 4.5 do deploy. A UI entra no
  ar com o commit `e0f292e3`.

## 6. Desativação no v1 — ✅ aplicada em 20/08

Com `.bak-2026-08-20` de cada arquivo: os **17 modais de escrita**
bloqueados por redirect no topo (create, delete, lançamento, período,
pgto, movimento, pagamento e arquivos); banner + botão "Novo" desabilitado
no `index.asp` — a consulta segue viva.

## 6. Histórico completo e vínculo com o cadastro (25/08)

Três ajustes pedidos pelo Wagner depois do uso real:

1. **Históricos do v1 vieram junto.** A primeira carga trouxe só os 78 períodos
   com `ativo=1`. No v1, porém, **`ativo=0` é sempre `historico=1`** — não é
   lixo, é o arquivo morto (2014→2025). Os 65 restantes entraram como
   `historico=true`, com seus gozos e recibos: **143 períodos (94 históricos),
   305 gozos, 30 recibos** em dev e produção. Assim ninguém precisa voltar ao
   sistema antigo para consultar.
   O gerador passou a resolver colaborador/autor por **subselect de e-mail no
   destino** (antes embutia ids resolvidos contra o banco local) — a mesma carga
   vale em dev e produção.

2. **A lista segue o cadastro de usuários.** O payload passou a trazer
   `colaboradorAtivo` (`true` = ativo, `false` = desligado, `null` = nem existe
   mais no cadastro). Por padrão a listagem mostra **só colaboradores ativos**;
   o filtro "Incluir desligados" abre o resto, e os registros ganham o selo
   *desligado* / *fora do cadastro*. O seletor de colaborador (novo período)
   lista apenas ativos — não faz sentido abrir período para quem saiu.

3. **Ordenação por qualquer coluna.** Padrão **alfabético pelo colaborador**;
   clicar no cabeçalho ordena e o segundo clique inverte. Como três colunas são
   derivadas (nome resolvido, gozados, saldo), o service busca o conjunto
   filtrado, resolve, ordena e pagina em memória — o volume (centenas) permite.

## 7. Um registro por colaborador (25/08)

A listagem passou a mostrar **apenas o período mais recente de cada
colaborador** — os anteriores viram **histórico dentro do registro**:

- `listar` agrupa pela chave do colaborador (id ou, no resíduo do v1, o nome) e
  mantém o de maior `periodoInicial`/`periodoFinal`, devolvendo
  `periodosAnteriores` (contagem) — a linha ganha o selo "+N períodos".
  Filtrar por um colaborador específico **desagrupa** (drill-down natural).
- `getById` devolve `historicoColaborador` com os demais períodos (dias, saldo
  derivado, previsão, pago/histórico e quantos gozos/anexos), e o detalhe
  ganhou o card **"Períodos anteriores"** — cada linha abre aquele período.

Efeito prático: de 143 linhas para **67** (uma por colaborador), sem perder
nada — o arquivo morto continua a um clique.
