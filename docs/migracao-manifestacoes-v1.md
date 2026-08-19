# Migração: Manifestações — Elogios, Reclamações e Sugestões (v1 → v2)

Port de `sgq_elogios`/`sgq_reclamacoes`/`sgq_sugestoes` do v1 para a
engrenagem única `Manifestacao` do v2 (plano de 5 fases aprovado em 04/08).
A criação nos módulos do v1 foi **desativada em 11/08**; as fases 1-3
(engrenagem + as três telas) já estavam implementadas e em produção — o que
faltava, e este documento registra, era a **carga do legado** (19/08).

## 1. Fontes no v1

- **`sgq_elo` — 96 (80 ativos)**: cliente, informante (`nome_elogio`),
  elogiados em TEXTO livre + 22 vínculos por id (`sgq_elo_col`), descrição
  HTML. `status` '' = recebido, 1 = tratado. `sgq_elo_arq/equ/set` vazias.
- **`sgq_rec` — 219 (91 ativas)**: o único com workflow: status 1-5
  (Aguardando Retorno / Aguardando Análise / Registrar Eficácia / Não
  Procedente / Finalizada), `tipo` 1/2 = Interna/Externa, `origem` = canal
  (lookup: E-mail, Telefone, Site, WhatsApp...), `classificacao` (lookup:
  Atendimento, Serviço Errado...), reclamante/email/telefone, área, causa,
  retorno ao cliente, justificativa, retorno final. O `hash` de 31 chars
  nunca foi usado (virou o protocolo no v2).
- **`sgq_sug` — 137 (101 ativas)**: título, sugestão, `identificar` 0/1
  (anonimato), `publicar` (mural), responsável/resposta/data. Status 1/2 =
  Recebida/Respondida (3 só em inativas).

## 2. Mapeamento na carga

Gerador: `scripts/legacy-v1-manifestacoes-import.js`, idempotente pelo par
**(`legacy_source`, `legacy_id`)** — os ids das três tabelas colidem entre
si (colunas adicionadas por convergência no `add_manifestacoes.sql`).

- **Protocolo** gerado na carga com o mesmo alfabeto do service
  (ELO-/REC-/SUG-XXXX-XXXX).
- **Elogios**: origem CLIENTE; elogiados casados por id (sgq_elo_col) E por
  nome a partir do texto solto — 84 vínculos; o que não casa fica em
  `elogiados_texto` (resíduo). '' → RECEBIDA, 1 → ENCERRADA.
- **Reclamações**: `tipo` → origem INTERNA/CLIENTE; canal do lookup;
  **classificação vira o título**; procede derivado do status (4 → não;
  3/5 → sim; 1/2 → nulo); cliente por CNPJ no destino; área por nome.
- **Sugestões**: `identificar=0` → **anônima e o autor NÃO é gravado** (o
  v1 gravava e escondia — o furo que o plano mandou fechar); `publicar` →
  mural.

## 3. Resultado

- **Dev e produção (19/08): 272 manifestações** — 80 elogios, 91
  reclamações, 101 sugestões; protocolos 100% únicos; 31 anônimas sem
  autor (invariante conferido); produção casou 158 clientes.
- Correção de produção no caminho: `manifestacoes.atualizado_em` sem
  default (tabela nascida do db push — §3.3 do runbook); `ALTER SET
  DEFAULT` aplicado e registrado no `add_manifestacoes.sql`.

## 4. O que resta do plano de 5 fases

- Fases 1-3 (engrenagem, Elogios, Sugestões, Reclamações): ✅ em produção.
- Fase 4 (Não Conformidades): ✅ (migrada em 19/08; reclamação procedente
  poderá voltar a gerar NC — o vínculo `legacy_reclamacao_id` já está nas
  NCs migradas).
- **Fase 5 (portal público) — PENDENTE**: `/manifestacao/nova` e
  `/manifestacao/{protocolo}` fora da área autenticada, com limite por IP e
  campo-isca. Hoje o `porProtocolo` é protectedProcedure — a consulta
  pública ainda não existe. É a única superfície exposta na internet do
  plano; tratar como entrega própria.

## 5. Desativação no v1

✅ Já feita em 11/08 (criação bloqueada com aviso + botão desabilitado +
bloqueio server-side nos três módulos).
