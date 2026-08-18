# Migração: Tabelas de Registros (v1 → v2)

Port do módulo `sgq_tabelas` do OneClick v1 (fonte de dados: `sgq_reg` no
`db_intranet`) para o v2, no bloco Qualidade. É o controle de registros da ISO:
para cada registro, **armazenamento, proteção, recuperação, retenção e
disposição** — versionado.

## 1. O que o levantamento mostrou (sgq_reg)

- **108 linhas = 79 cadeias** de versão, encadeadas por `id_mestre`:
  - a **raiz** aponta para si mesma (43) ou para `0` (36);
  - as **versões** apontam para a raiz (29).
- **68 cadeias vivas** — cada uma com **exatamente 1 linha `ativo=1`** (a
  vigente). As **11 cadeias mortas** (nenhuma ativa) são registros descartados
  no v1 e **ficam de fora** da carga.
- Os 5 campos ISO são `longtext` e estão 100% preenchidos nas ativas.
- `sgq_reg_arq` está **vazia** (o módulo nunca teve arquivos) e `sgq_reg_log`
  tem 28 linhas de frase pronta — nada a migrar de nenhuma das duas.
- O **processo** vem da `sgq_proc` — a MESMA tabela que os Documentos Internos
  usam. Por isso o v2 **reutiliza `documento_processos`** (não existe um
  segundo cadastro de processos).
- Sujeira encontrada nos textos: **caracteres NUL (0x00)** no meio do conteúdo
  (Postgres rejeita em TEXT) e mistura de **texto plano com HTML de editor
  rico na mesma coluna** (o v1 trocou de editor no meio da vida do módulo).

## 2. Modelo no v2

`TabelaRegistro` (identidade) + `TabelaRegistroVersao` (conteúdo) +
`versaoAtualId` (ponteiro para a vigente, FK `SET NULL`) — o mesmo desenho de
Documentos Internos, **sem** arquivos e **sem** fluxo de aprovação (o v1 não
tinha nenhum dos dois).

- `versao` **não** é único por tabela (o legado repete números); o v2 numera
  `última + 1`.
- Só o **cabeçalho** (nome, processo) se edita; conteúdo de versão publicada
  não se reescreve — mudou o controle, publica-se versão nova.
- `registradoPorNome` é o resíduo do autor do v1 quando a pessoa não existe
  mais no v2 (ex-colaborador) — mesmo padrão das Capacitações.

SQL de estrutura: `packages/db/prisma/sql/add_tabelas_registros.sql`
(idempotente; a ordem alfabética garante que `add_documentos_internos.sql`
roda antes e a FK de processo encontra a tabela).

## 3. Backend / UI

- `apps/api/src/tabela-registro/` — service + router tRPC (`tabelaRegistro`),
  slug de permissão `tabelas-registros`, **sem sub-permissões** (o v1 não
  tinha níveis). Processos listados de `documento_processos` (gerenciados na
  configuração dos Documentos Internos — este módulo não tem tela própria de
  config).
- `apps/web/src/app/(dashboard)/tabelas-registros/` — listagem, cadastro
  (`/new`, nasce com a versão 0) e detalhe (`/[id]`, histórico + modal "Nova
  versão" pré-preenchido com a vigente).

## 4. Carga dos dados

Gerador: `scripts/legacy-v1-tabelas-import.js` (read-only no v1; produz
`scripts/out/v1-tabelas-registros.sql`, idempotente por `legacy_id`).

Decisões da carga:

- **Cadeia → 1 `tabelas_registros`** (legacy_id = id da raiz) + **1 versão por
  linha**; o ponteiro `versao_atual_id` aponta a linha `ativo=1`.
- Nome e processo do cabeçalho vêm da **linha vigente** (é o que o v1 exibia).
- **Processo resolvido no destino** por `documento_processos.legacy_id` —
  nenhum id de processo do snapshot de dev viaja no SQL.
- **NUL e demais caracteres de controle são removidos**; texto plano é
  escapado e embrulhado em `<p>`, HTML legado passa como está (o
  `RichContent` renderiza os dois iguais).
- Autor: id do v2 quando casa por e-mail/nome; senão o **nome fica em
  `registrado_por_nome`** (83 das 95 versões são de ex-colaboradores,
  principalmente Lindalva Cavalcanti).

Resultado (dev, 18/08): **68 tabelas, 95 versões**, 0 sem vigente, 0 sem
processo, 0 órfãs.

## 5. Produção

Mesmo runbook dos módulos anteriores (`docs/deploy-2026-08-18.md`):
1. Deploy leva `add_tabelas_registros.sql` no stage 4.5.
2. Carga manual: copiar `scripts/out/v1-tabelas-registros.sql` para a VPS e
   aplicar **como `-U oneclick`** no `n8n-postgres-1`, db `oneclick`
   (ON_ERROR_STOP=1). Validar os mesmos contadores do §4.
3. A carga exige que a carga de **documentos** já tenha rodado (processos com
   `legacy_id` populado) — em produção isso já aconteceu em 18/08.

## 6. Desativação no v1

`\\192.168.0.7\wwwroot\central\modules\sgq_tabelas\` — **dois** pontos de
gravação, ambos bloqueados (aviso + botão desabilitado + `Response.Redirect`
server-side, padrão dos demais módulos):
- `create.asp` — INSERT do registro novo;
- `details.asp` — o INSERT de lá é **nova versão** (mesmo precedente dos
  Documentos, onde o revisar também criava registro novo).
