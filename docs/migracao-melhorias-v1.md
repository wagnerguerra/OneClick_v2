# Migração — Melhorias (OneClick v1 `sgq_melhorias` → v2)

Levantamento de 19/08/2026 sobre o módulo em
`https://oneclick.central-rnc.com.br/central/modules/sgq_melhorias/` (banco `db_intranet`).
Bloco **Qualidade**.

---

## 1. O tamanho real do módulo

Três arquivos ASP, **uma tabela sem satélites** (nem log, nem anexo, nem mensagem) e
**2 registros ativos** — ambos de 09/12/2021, saídas de uma análise crítica, registrados por
"Janda" (ex-colaboradora, inativa no próprio v1).

A parte **viva** do assunto está em outro lugar: o índice do v1 soma as **compras marcadas
como melhoria** (`sgq_com.melhoria = 1`, **46 registros**), que já foram migradas com o módulo
de Aquisições e moram em `Compra.melhoria` / `melhoriaObs`.

Existe ainda uma `sgq_mel_old` (6 linhas de um fluxo antigo com status/justificativa/
implementação) que **o v1 não lê de lugar nenhum** — fica fora da migração.

## 2. O desenho no v2 — deliberadamente pequeno

- **Um model** (`Melhoria`): título, descrição rica, área de aplicação (FK em `Area`, casada
  pelo nome do setor), data prevista, autor (id solto).
- **Um acréscimo de comportamento**, o único: `status` (Registrada / Implementada / Cancelada)
  com carimbo `implementadaEm`. O v1 tinha data prevista e nenhum jeito de dizer "feito".
- **Uma página** (`/melhorias`): tabela das registradas com criar/editar em modal, e abaixo o
  card "Vindas das aquisições" — leitura de `Compra.melhoria`, com link para o pedido. É a
  mesma soma que o índice do v1 fazia.
- **Sem sub-permissões**: leitura/escrita/exclusão do próprio módulo. O v1 não tinha níveis e
  não há fluxo a proteger.

## 3. Situação

| Fase | |
|---|---|
| Schema (`add_melhorias.sql`, 1 tabela) | ✅ aplicado 2× no dev |
| Backend (service + router) | ✅ |
| Interface (página única) | ✅ |
| Dados (2 melhorias, com área; autor nulo — "Janda" não tem usuário no v2) | ✅ dev |
| Produção + desativação do v1 | ver `docs/deploy-2026-08-18.md` §3 para o rito |
