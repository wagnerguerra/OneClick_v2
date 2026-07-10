# Tratamento de Lançamentos → SCI — Visão Geral do Módulo (feito + pendente)

> **Doc de referência do módulo.** Consolida, num único lugar durável, os 4
> artefatos que antes ficavam espalhados: o **spec de origem** (pré-codebase), o
> **log de progresso por fases** (que vivia na memória do agente), o **resumo do
> que foi à produção na v1** (corpo do PR), e o **stream atual de PDF + Débito/
> Crédito**. Fonte viva — atualizar conforme o módulo avança.
>
> **Relacionados (mesma pasta `docs/tratamento-lancamentos/`):**
> `ENGINE-EXTRACAO-PDF.md` (como o extrator de PDF funciona por dentro) ·
> `PLANO-SUPORTE-A-PDFS.md` (plano detalhado do stream PDF/D-C) ·
> `_arquivo/CONCEPCAO-INICIAL.md` (o spec de origem, congelado — documento histórico).

Última atualização: 2026-07-10.

---

## 1. O que é o módulo

Módulo do **bloco Contábil** (SaaS ERP/CRM para escritórios contábeis). Fluxo:

1. **Importa** um arquivo de lançamentos do cliente (extrato/relatório bancário).
2. **Aplica um "Modelo de Tratamento"** (template de de/para de colunas + direção
   Débito/Crédito + conta(s) corrente(s) + contrapartida).
3. **Exporta um `.txt`** no layout importável pelo programa contábil **SCI**
   ("Exportação para o SCI").

Detecta **pendências** antes de gerar (conta/direção/conta corrente não mapeada,
coluna do De/Para não encontrada, campo vazio, data/valor inválidos) e as
apresenta num painel acionável (abas Pendências + Dados processados), com atalho
para editar o modelo.

**Slug/módulo:** `tratamento-lancamentos` (router key camel `tratamentoLancamentos`).
**Decisões travadas:** stateless (só Modelos são persistidos, sem histórico de
conversões na v1); participante opcional (omitido do histórico SCI se ausente);
entrega fase a fase com aprovação.

---

## 2. Especificação de origem (pré-codebase)

O `.md` do qual "partiu tudo", escrito **antes do acesso ao codebase**. Congelado
como documento histórico em `_arquivo/CONCEPCAO-INICIAL.md` — serve para conferir se
a visão inicial está sendo atingida, não para refletir o estado atual. Cobre, em prosa:

- **Fluxo principal:** seleção do arquivo → extração p/ tabela padrão → seleção do
  Modelo → processamento → download do `.txt`, com tratamento visual de pendências.
- **Modelos de Tratamento:** de/para de colunas (descrição, participante, valor,
  data, NF opcional, CNPJ/CPF opcional com pré-seleção de "CNPJ"); direção do
  lançamento (por coluna com SELECT DISTINCT, ou por descrição); conta corrente;
  contrapartida (por palavra-chave ou por descrição), com "Histórico fixo" opcional.
- **Pendências de aplicação:** contrapartida não mapeada, direção não mapeada,
  campo vazio, data inválida, valor não numérico.
- **Armazenamento:** 2 entidades (Modelo + Versão do Modelo, snapshot JSON completo
  por versão). Versionamento a cada save.
- **Formato SCI** (ver §6) e **extração dinâmica de tabelados** (detecção de aba,
  região da tabela, cabeçalho, confirmação implícita pela prévia).

---

## 3. Arquitetura e decisões (canônicas)

- **Entidades:** `TreatmentModel` + `TreatmentModelVersion` (snapshot JSON
  `definition`). `empresaId`/`clienteId`/`authorId` são ids soltos (sem FK) para
  não acoplar a Empresa/User/Cliente.
- **Tenancy:** padrão `scoped(tenantSchema, ...)` de `@saas/db` (schema-per-tenant),
  não o `prisma` global. Autor resolvido via `prisma.user` global (schema public).
- **Fronteira única de extração:** `extractTabela(input) → ExtractedTable` — qualquer
  fonte (xlsx/csv/pdf/futuro IA) devolve o mesmo `ExtractedTable`; nada a jusante muda.
- **Direção = Débito/Crédito** (renomeado de Entrada/Saída). Enum `DIRECAO` =
  `{ DEBITO, CREDITO }`; chave da definição `debitoCredito`; pendência `DC_NAO_MAPEADO`.
  Mapeamento: DÉBITO → RECEB / conta corrente no campo `<3>`; CRÉDITO → PGTO.
- **Sub-permissão `gerenciar_modelos`** (criar/editar/duplicar/excluir). Leitura,
  preview e conversão via `readProcedure` (qualquer um com leitura usa o fluxo e
  converte).
- **Rotas:** `/tratamento-lancamentos` = fluxo principal (upload → modelo → gerar
  `.txt`); `/tratamento-lancamentos/modelos` = gerenciar; `/modelos/new` e
  `/modelos/[id]` = wizard/editor (Voltar/Salvar context-aware via `?from=`).

---

## 4. FEITO ✅

### Fase 1 — Fundação (v1)
Types Zod (`packages/types/src/tratamento-lancamentos.ts`, contrato completo da
definição) + permissão no bloco Contábil (`user.ts`); 2 models Prisma + `db push`;
backend `apps/api/src/tratamento-lancamentos/` (service `scoped` + versionamento,
router, module) + wiring tRPC; NavItem + `MODULOS.md`; frontend (lista + modal).

### Fase 2 — Extração de tabelados
`lib/parsers.ts` (parseData serial/`dd/mm/aaaa`/ISO; parseValor BR/US; onlyDigits) e
`lib/extract-tabela.ts` (detecção de aba por maior bloco contíguo → região por linhas
"cheias" → cabeçalho = 1ª linha textual acima do corpo). Interface única
`extractTabela → ExtractedTable {headers, rows, meta}`.

### Fase 3 — Editor de Modelos
`_components/model-editor.tsx` (upload → preview; de/para com pré-seleção de CNPJ +
amostra; direção por coluna com SELECT DISTINCT ou por descrição; conta corrente;
contrapartida keyword/descrição) + páginas `new/` e `[id]/`. Lista navega ao editor.

### Fase 4 — Conversão SCI
`lib/sci-format.ts` (buildSciLine 10 campos, histórico RECEB/PGTO + NF + participante,
valor abs 2 casas, CRLF) + `lib/apply-model.ts` (`applyModel → {sciText|null,
pendencias[]}`). Endpoint `convert` (base64 + modelId → extrai → aplica → `.txt`
latin1 ou pendências). **Validação SCI real confirmada com a gestora do contábil**
(formato + mapeamento de contas/direção). Higienização anti-vírgula (backend
`sanitizeCampo` + enforce no front `semSeparador`).

### Histórico de versões (v1 → v3)
`getVersion`/`restoreVersion`; `_components/version-diff.ts` (diff por seção puro) +
`version-history-dialog.tsx` + `version-overview.tsx` (visão read-only com destaque
por campo, "Comparar com" default Nenhuma, remoções riscadas). Autor resolvido
(avatar + nome).

### Múltiplas contas correntes
`def.contasCorrentes` `{ modo: UNICA|MULTIPLAS, unica, coluna, mapa:[{valor,conta}] }`.
apply-model resolve conta corrente por linha + pendência `CONTA_CORRENTE_NAO_MAPEADA`.
`normalizeDefinition` migra modelo antigo (string → `contasCorrentes.unica`).

### Modo relatório na extração dinâmica
`extract-tabela.ts` auto-detecta **single** (maior região contígua) vs **report**
(cabeçalho repetido ≥2× → consolida todas as seções + carry-forward do rótulo de
seção, ex. "Caixa/Banco", como coluna sintética → alimenta múltiplas contas).

### Permissões
Sub-permissão `gerenciar_modelos` no backend (write/delete sub-procedures) e front
(`canManage`), com card "Acesso restrito" no editor.

### v1 em produção (mesclada na `main`)
13 commits de `5ade2d4` a `b50dc72`. O que entrou está resumido no corpo do PR da
v1 (era `scratchpad/PR_BODY.md`); pendências deixadas fora do PR migraram para §5.

### Stream PDF + Débito/Crédito (2026-07 — PR #9, OPEN)
- **Leitura determinística de PDF por coordenadas** (via `pdf-parse`), 9 bancos de
  exemplo lendo (ver `ENGINE-EXTRACAO-PDF.md`): Shape-1 (data por linha) e Shape-2
  (seção-agrupada / carry-forward). Reescrita estrutural da anexação em **dois modos
  de layout** (âncora-no-meio vs âncora-no-topo), detectados pela fração de âncoras
  com descrição vazia. Virada de página, rodapé/resumo e continuações tratados.
- **D/C modo `SINAL`** (negativo = débito, positivo = crédito) + parser de marcador
  (`C/CD/D/DB` → sinal, `*` = ruído) + **zero-skip** (valor `0,00` ignorado).
- **Itens de modelo:** pré-seleção do modo SINAL; "Pular linha" na contrapartida;
  **popup de competência** para datas sem ano (Sicoob `dd/mm`).
- **Visualizador de debug** (escondido — atalho `Ctrl/Cmd + Shift + E`): 3 abas
  (tabela crua / após de-para / pendências e puladas). Fonte única: o traço vem do
  próprio `applyModel`.
- Commits: `0a668cb` (leitura PDF) · `19b1c2a` (extração robusta) · `4410843`
  (D/C sinal + pular + competência + debug) · `f3bd028` (docs engine).
- **PR #9 mesclada na `main`** (2026-07).

### Stream UX/UI + pendências (2026-07)
- **Reuso da extração:** o `convert` recebe a tabela já extraída no `preview` e
  não re-extrai (1× no fluxo; fallback p/ arquivos acima do teto do preview).
- **Editor:** tabela de Contrapartida compartilhada entre os dois modos + busca,
  preenchimento em lote e paginação; `model-editor.tsx` dividido em
  `_components/model-editor/*`.
- **Painel de resultado** (colapsável) no lugar da lista simples: abas
  **Pendências** (origem color-codeada; expandir mostra a linha original com as
  células causadoras destacadas + tooltip) e **Dados processados** (trace
  por-linha; "Pulada" riscada; navegação até a pendência). No sucesso vira o card
  "arquivo gerado" com barra recolhível "sem erros".
- **Novas regras de pendência:** `COLUNA_NAO_ENCONTRADA` (coluna do De/Para
  ausente no arquivo → encerra antes do loop); `CAMPO_VAZIO` também nas colunas
  opcionais selecionadas (participante/NF/CNPJ-CPF); descrição vazia não gera
  mais "sem contrapartida".

---

## 5. PENDÊNCIAS 🚧

### Gerais do módulo
- [ ] **Extração via IA de PDF/imagem** — TODO na fronteira `extractTabela`
      (PDF escaneado/foto). Portas/TODOs mantidos em `extract-tabela.ts` /
      `pdf-extract.ts`. **Não remover.**
- [ ] **#2 — Destaque erro→campo no editor** — ao clicar "Editar modelo" a partir
      de uma pendência de **modelo**, abrir o editor com os campos causadores
      **destacados em vermelho** e o motivo. Hoje o botão só navega. É a parte que
      falta da "UX rica de pendências" (o restante — realce da célula na linha de
      origem, tooltip, navegação — já foi feito no painel remodelado, ver §4).
- [ ] **#9 — Descoberta do visualizador de debug** — hoje é só via atalho
      `Ctrl/Cmd+Shift+E` (escondido). Ideia: botão discreto abaixo do painel +
      botão flutuante no editor. A planejar.
- [x] ~~**UX rica de pendências**~~ — feita no painel remodelado (§4), exceto o
      destaque no editor (#2, acima).
- [x] ~~**Split do `model-editor.tsx`**~~ — feito (`_components/model-editor/*`).
- [ ] **`colaboradores`** — não existe `model Colaborador` no schema, mas
      `TENANT_TABLES` lista `colaboradores`/`colaborador_events`. `createTenantSchema`
      já foi tornado resiliente (pula tabelas-template ausentes com warn); falta
      **decidir o destino** de colaboradores.

### Stream PDF / Débito-Crédito
- ⏸️ **Bradesco (adiado, decisão 2026-07-06):** PDF tem duas estruturas num só doc
      (extrato principal data-agrupada + "SALDO INVEST FÁCIL" data-por-linha). Lê
      tudo; Invest Fácil perfeito; extrato principal agrupa por data. Como a
      **modelagem de duas colunas Crédito/Débito está fora de escopo**, o custo/risco
      não compensa. Reabrir só se essa modelagem entrar em escopo.
- [ ] **Modo D/C "Duas colunas"** (Crédito e Débito separados, estilo Bradesco) —
      fora de escopo por ora; ideia futura.
- **Pontas soltas (não bloqueiam):** Inter "Saldoportransação" (cosmético); Nubank
  ~18/90 linhas sem continuação completa da descrição; resíduo "RESUMO" grudando em
  "SALDO DO DIA" no Sicoob (aceito — usuários pulam linhas "Saldo"); redação do
  histórico SCI (PGTO/RECEB) é conversa à parte com a gestora (a direção está certa).
- **Mercado Pago 15.428 linhas** — volume **confirmado como real** (não é
  super-extração). ✔ resolvido.

### Entrega
- ✅ **PR #9 (stream PDF)** mesclada na `main` pelo **Wagner**.
- ✅ **UI/UX partes 1 e 2** (`feat/tratamento-lancamentos-ux`, `-ux-parte-2`)
  mescladas.
- ⏳ **UI/UX parte 3** (`feat/tratamento-lancamentos-ux-parte-3`): reuso da tabela
  do preview, painel de resultado remodelado e novas regras de pendência — 3
  commits locais (`8224840`, `ca1bc42`, `f697b29`), ainda a empurrar/abrir PR.
  Merge/deploy é exclusivo do Wagner.

---

## 6. Formato SCI (referência)

`.txt`, **ANSI/latin1**, quebra de linha **CRLF** (Windows). Cada linha =
lançamento, campos separados por vírgula:

```
"<1>,<2>,<3>,<4>,<5>,<VAZIO>,<6>,<7>,<VAZIO>,<8>"
```

- `<1>` nº da linha, 5 dígitos, começa em `00001` e incrementa.
- `<2>` data `YYYYMMDD`.
- `<3>` DÉBITO → conta corrente; CRÉDITO → conta de contrapartida.
- `<4>` DÉBITO → conta de contrapartida; CRÉDITO → conta corrente.
- `<5>` valor **sem sinal**, separador decimal `.`, sempre 2 casas.
- `<6>` histórico: se houver "Histórico fixo", é ele; senão
  `VR REF <RECEB|PGTO>[ NF Nº <n>] - <PARTICIPANTE EM UPPERCASE>`.
- `<7>` se houver NF → `DCTO<Número da NF>`; senão vazio.
- `<8>` CNPJ/CPF só dígitos; senão vazio.
- `<VAZIO>` = campo vazio puro (`,,`).

Layout oficial não disponível → **engenharia reversa dos exemplos**, validada em
importação real com a gestora.

---

## 7. Pontas soltas / observações (não bloqueiam)

- **Bradesco modelagem:** mesmo com extração corrigida, múltiplos valores por data +
  duas colunas de valor → modelagem completa fora de escopo.
- **Redação do histórico SCI** (PGTO/RECEB): a direção D/C está correta; rever a
  *palavra* é conversa à parte com a gestora.
- **Validação de extração de PDF:** rodar o extrator sobre a pasta
  `cc-tratamento-de-lancamentos-para-SCI/PDF`; **qualquer regressão nos 9 = parar.**
