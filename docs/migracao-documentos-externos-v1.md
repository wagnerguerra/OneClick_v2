# Migração: Documentos Externos (v1 → v2)

Port do módulo `sgq_externos` do OneClick v1 (dados em `sgq_docext`) para o
v2, no bloco Qualidade. São as normas, leis e documentos de terceiros que o
SGQ controla (ABNT, Receita, prefeituras...), versionados.

## 1. O que o levantamento mostrou

- **`sgq_docext` — 52 linhas = 38 cadeias (35 vivas)**, no MESMO desenho do
  `sgq_reg` (Tabelas de Registros): todas as revisões na mesma tabela,
  encadeadas por `id_mestre`, exatamente 1 linha `ativo=1` por cadeia viva.
- Campos por revisão: revisão, data, **emissor** (ABNT, Receita...), **local**
  (pasta de rede/arquivo físico), **link** (URL ou caminho), observação,
  usuário que registrou e responsável.
- `situacao` é sempre 1 (campo morto); `sgq_docext_arq` está **vazia** (nunca
  houve upload — o documento é de terceiro); `sgq_docext_log` tem 10 frases
  prontas (não migradas — o histórico relevante são as próprias revisões).
- `processo` = `sgq_proc` → reutiliza `documento_processos`.

## 2. Modelo no v2

`DocumentoExterno` + `DocumentoExternoVersao` + `versaoAtualId` — o mesmo
blueprint das Tabelas de Registros. Sem upload (registra onde o documento
mora); link http(s) vira botão "Abrir no emissor"; revisão não é única
(legado repete; v2 numera última+1); só o cabeçalho (nome/processo) se edita;
registrador e responsável por ID com resíduo de nome.

SQL: `packages/db/prisma/sql/add_documentos_externos.sql` (idempotente; a
ordem alfabética garante que `add_documentos_internos.sql` roda antes).

## 3. Backend / UI

- `apps/api/src/documento-externo/` — service + router (`documentoExterno`),
  slug `documentos-externos`, sem sub-permissões.
- `apps/web/src/app/(dashboard)/documentos-externos/` — listagem (filtro por
  processo, busca por nome/emissor, link externo na linha), `/new` (nasce com
  a revisão 0) e `/[id]` (histórico de revisões + modal "Nova revisão"
  pré-preenchido com a vigente). Sem tela de config (processos são os dos
  Documentos Internos).

## 4. Carga dos dados

Gerador: `scripts/legacy-v1-docext-import.js` (read-only; SQL idempotente por
`legacy_id`; processo resolvido no destino por `legacy_id`).

Resultado (dev, 19/08): **35 documentos + 49 revisões**, 0 sem vigente, 0 sem
processo, 0 órfãs; 3 cadeias mortas ficam no v1. Muitos autores são
ex-colaboradores — nome preservado no resíduo.

## 5. Produção — ✅ aplicada em 19/08

- IDs embutidos validados (3/3 usuários). DDL + carga **como `-U oneclick`**
  (owner conferido). Resultado idêntico ao dev: **35 documentos + 49
  revisões**, 0 pendências.
- O `add_documentos_externos.sql` segue no stage 4.5 do deploy. A UI entra no
  ar com o commit `46c4a857`.

## 6. Desativação no v1 — ✅ aplicada em 19/08

Com `.bak-2026-08-19` de cada arquivo: `create.asp`, `excluir.asp` e
`arquivo_excluir.asp` bloqueados por inteiro; o branch de POST do
`details.asp` guardado (o INSERT de lá é revisão nova — a consulta segue
viva, com banner); banner + "Novo Registro" desabilitado no `index.asp`.
