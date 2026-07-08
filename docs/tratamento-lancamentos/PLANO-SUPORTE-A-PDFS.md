# Plano — Tratamento de Lançamentos: leitura de PDF + Débito/Crédito

> **Documento vivo.** Mantê-lo atualizado a cada avanço. Escopo cresceu; este é o
> mapa canônico do que foi decidido, do que já está feito e do que falta.
> Docs relacionados: [ENGINE-EXTRACAO-PDF.md](./ENGINE-EXTRACAO-PDF.md) (como a
> extração funciona por dentro).

Última atualização: 2026-07-08.

---

## 1. Objetivo

Habilitar, no módulo **Tratamento de Lançamentos** (Contábil → importa lançamentos,
aplica um Modelo de Tratamento, exporta `.txt` no formato SCI):

1. **Leitura de extratos bancários em PDF** (determinística; IA só para imagem/scan no futuro).
2. **Definição correta de Débito/Crédito** para os diversos jeitos que os bancos codificam isso.

Sem tocar no restante do pipeline: **extração → de/para de colunas → pendências → geração SCI**.

---

## 2. Definições e arquitetura

- **Fronteira única de extração:** `extractTabela(input) → ExtractedTable`. Qualquer
  fonte (xlsx/csv/pdf/futuro IA) devolve o mesmo `ExtractedTable`; nada a jusante muda.
- **PDF determinístico:** reconstrução por coordenadas (x/y) via `pdf-parse`. Detalhes
  em [ENGINE-EXTRACAO-PDF.md](./ENGINE-EXTRACAO-PDF.md).
- **Portas para IA mantidas:** TODOs de fallback para PDF escaneado/imagem continuam
  abertos (`extract-tabela.ts`, `pdf-extract.ts`). NÃO remover.
- **Nomes genéricos de coluna:** colunas sem cabeçalho no documento recebem **letras**
  (`Coluna A`, `Coluna B`, …) — padrão único entre o leitor de planilhas e o de PDF
  (`colLetter` em `extract-tabela.ts`).

---

## 3. Regras e decisões (canônicas)

### Débito/Crédito
- **Três modos** (`debitoCredito.tipo`): `COLUNA`, `DESCRICAO`, `SINAL`.
- **`SINAL` ("Pelos sinais dos valores"):** negativo = **débito**, positivo = **crédito**.
- **Valor zero (`0,00`) → lançamento IGNORADO** (validado com a gestora do Contábil).
  Atenção: só para **valor zero**; vazio/nulo continua gerando pendência `CAMPO_VAZIO`.
- **Marcadores anexos ao valor** (BB/Sicoob: `C`/`CD` = crédito, `D`/`DB` = débito;
  `*` é ruído): o parser converte em **sinal**, e isso reflete na **prévia** do De/Para
  (`formatValorExibicao`). Assim o modo `SINAL` já atende BB/Sicoob.
- **Convenção do histórico SCI (NÃO é bug):** `DÉBITO → "VR REF RECEB"`,
  `CRÉDITO → "VR REF PGTO"` (validado em importação real com a gestora; documentado em
  `sci-format.ts`). Um valor positivo vira crédito e imprime "VR REF PGTO" — a redação é
  contraintuitiva, mas a direção está correta.
- **Magnitude no SCI é sempre positiva** (`Math.abs`); a direção carrega o sinal.

### Modos NÃO implementados (decisão)
- **Duas colunas** (Crédito e Débito separados, ex.: Bradesco): **fora de escopo por ora**
  (convoluto para caso específico). Fica como ideia futura.

### Extração PDF
- **Dois modos** (ver engine doc): **Shape-1** (data repetida por linha) e **Shape-2**
  (seção-agrupada: data encabeça o dia, carry-forward).
- **Datas textuais PT** ("2 de Março de 2026", "02 MAR 2026", inclusive com caracteres
  colados do Inter) reconhecidas na âncora-de-seção.
- **Datas sem ano** (Sicoob `dd/mm`): resolver por **popup de competência no "Gerar
  arquivo"** — se a coluna de datas tiver datas sem ano, backend sinaliza, front abre
  popup para escolher o ano, reenvia e gera.
- **Generalização é prioridade:** evitar regras hardcoded por banco. Toda mudança de
  extração é validada contra os **9 extratos de exemplo** sem regressão.

### Fluxo de trabalho
- **Commits em duas frentes, nesta ordem:** (1) **extração** (sistema passa a *ler*),
  depois (2) **modelos** (sistema passa a *interpretar*). Ver §6.
- Branch + PR sempre a partir de `origin/main` atualizado (ver memória de fluxo git).

---

## 4. Bancos de exemplo (pasta `cc-tratamento-de-lancamentos-para-SCI/PDF`)

| Banco | Modo extração | Linhas | D/C que atende | Status extração |
|---|---|---|---|---|
| CEF | Shape-1 | 34 | Sinal (`- R$`) | ✅ |
| Itaú | Shape-1 | 100 | Sinal (valores +/−) | ✅ |
| Santander | Shape-1 | 90 | Sinal (negativo) | ✅ |
| BB | Shape-1 | 120 | marcador `C`/`D` → Sinal | ✅ |
| Sicoob | Shape-1 | 526 | marcador `C`/`D`/`*` → Sinal | ✅ (datas sem ano via popup de competência) |
| Mercado Pago | Shape-1 | 15428 | Sinal / palavra-chave | ✅ (volume real confirmado) |
| Inter | Shape-2 | 173 | Sinal / palavra-chave | ✅ |
| Nubank | Shape-2 | 90 | COLUNA na coluna de "tipo" | ✅ |
| Bradesco | Shape-1 (misto) | 26 | duas colunas (fora de escopo) | ⏸️ adiado (§6) |

---

## 5. Estado — FEITO ✅

**Modelos (D/C):**
- Modo `SINAL` no schema (`@saas/types`), `apply-model` (direção pelo sinal + `Math.abs`),
  UI (3º card "Pelos sinais dos valores", inline), espelhos (`version-diff`,
  `version-overview`, `treatment-definition`).
- `parseValor`: marcadores `C/CD/D/DB` → sinal; aceita `+`; descarta `*`.
- `formatValorExibicao`: prévia do De/Para mostra o valor com o sinal.
- **Zero-skip:** valor `0,00` ignorado (só zero, não vazio).
- Hint do passo D/C citando as 3 origens.

**Extração (PDF):**
- Motor determinístico por coordenadas (Shape-1) — 6 bancos.
- **Shape-2 seção-agrupada** (carry-forward da data) — Inter (0→173), Nubank (erro→90).
- Datas textuais PT + descarte de subtotais + ignorar preâmbulo antes da 1ª data.
- **Nubank:** descrição multilinha (anexa continuações; ~72/90 completas).
- **Inter:** usa rótulos "Valor"/"Saldo por transação" quando presentes.
- **Ancoragem por POSIÇÃO da coluna de valor** (Shape-2): elimina a coluna/linha falsa do
  Nubank (90→89). _Mecânica em ENGINE §3._
- **Virada de página tratada:** Shape-1 — lançamento cuja descrição se divide entre páginas
  volta pro lançamento certo (Itaú 291,79 ok); Shape-2 — cabeçalho de período repetido não
  reseta a data (Nubank herda 03/03, 04/03… em vez de 01/03). _Mecânica em ENGINE §3 e §5._
- **Anti-rodapé/resumo:** rodapé ("Ouvidoria", nota "os saldos acima…") e bloco de resumo
  ("Saldo de ContaMax") não vazam pro último lançamento (CEF, Itaú, Santander); resumo de
  página sem lançamentos não gruda pra trás (Mercado Pago). _Mecânica em ENGINE §3–§4._
- Nomes genéricos padronizados em **letras** (A, B, C). Descrição multilinha preservada
  (BB/CEF/Itaú/MP); zero regressão de contagem nos 9.

**Frontend / UX:**
- Upload aceita `.pdf` (wizard + conversão); textos ajustados; "Suporte a imagens em breve".
- **Visualizador de debug (escondido — atalho `Ctrl/Cmd + Shift + E`)**: alterna, abaixo do
  fluxo, um painel com 3 abas — (1) **Tabela extraída** crua (como o PDF foi
  tabelado: colunas/linhas/datas), (2) **Após de/para** (traço por-linha: data/valor
  bruto→interpretado, direção, contrapartida, conta corrente, status), (3) **Pendências
  e puladas** (linhas puladas por regra "Pular", ignoradas por valor zero, ou pendentes,
  com motivo). Serve para testes internos e atendimento na máquina do cliente. Fonte
  única: o traço vem do próprio `applyModel` (coletor `trace`), sem duplicar lógica.
  Backend: `debugExtract` (readProcedure; `modelId` opcional → sem modelo mostra só a
  tabela crua). Componente: `_components/debug-viewer.tsx`.

**Infra:**
- Sync local↔remote concluído (branch em `origin/main`; DB alinhado: `db push` +
  10 SQLs + regen client). Ver memória sync-local-remote.

---

## 6. Pendências — A FAZER 🚧

### Extração — QA 2026-07-07 (pendências abertas)
Rodada de teste real (visualizador de debug) revelou, por causa-raiz:
- [x] **A — Rodapé/resumo vaza pra última linha** (CEF/Itaú/Santander): CORRIGIDO (`belowMax`).
- [x] **Regressão MP — resumo/rodapé de página sem lançamentos grudando pra trás**: CORRIGIDO
  (detalhe só cruza a virada para frente).
- [x] **C — Lançamento dividido na virada cai na âncora errada** (Santander "…ENTRE|CONTA",
  Mercado Pago "…|Nascimento"): CORRIGIDO. Continuação cruza a virada PARA TRÁS quando a
  página tem lançamentos próprios; a menor distância `gy` (com `interGap` = cluster de gaps
  PEQUENOS, não a mediana inflada pelo espaço entre transações) escolhe a âncora certa; e a
  âncora mais próxima é a mais próxima VÁLIDA (um "abaixo" barrado pelo `belowMax` não descarta
  o detalhe — tenta a âncora ACIMA). Santander 100.000 → "…TRANSFERENCIA ENTRE CONTA"; MP 16,59
  → "Pagamento com Código QR Pix Matheus Sanches Do Nascimento" (completo). _ENGINE §3._
- [x] **B — Número de página (`N/M`) grudando/atrapalhando** (Santander, MP): CORRIGIDO —
  linhas só com `N/M` (`PAGE_NUM_RE`) são descartadas do corpo. _ENGINE §3._
- [x] **D — Continuação de descrição perdida na virada** (Shape-2/Nubank): CORRIGIDO — a
  continuação cruza a virada por ordem de leitura e o preâmbulo repetido é pulado. Nubank
  326,12 recupera "…Lynch Banco… Agência… Conta:". _ENGINE §3–§4._
- [x] **E — Cabeçalho repetido/duplicado embutido na 1ª linha** (MP "DescriçãoDescrição…"):
  CORRIGIDO — linhas com `headerScore ≥ 3` são excluídas do corpo (76 → 0). _ENGINE §3._
- [x] **F — Histórico multi-linha vazando entre lançamentos** (Sicoob): CORRIGIDO por
  **reescrita estrutural da anexação em dois MODOS de layout** (decisão 2026-07-07, com baseline
  salvo antes/depois). O extrato é "âncora no meio" (descrição acima+abaixo — Itaú/CEF/MP/
  Santander → âncora mais próxima) ou "âncora no topo" (descrição na âncora + continuações abaixo
  — Sicoob/BB → **encadeamento** para a âncora de cima, medindo o salto do último detalhe anexado).
  O modo é detectado pela **fração de âncoras com descrição vazia** (robusto, não enganado por
  bloco alto). No modo "no topo": blocos altos, "shift" das linhas de baixo e virada de página
  se resolvem juntos; **RESUMO** barrado por estrutura (linha com valor na coluna de valor ≠
  continuação); prefácio de âncora vazia (Santander [89]). **Resultado (diff vs baseline):**
  Sicoob e **BB** corrigidos (o BB tinha bugs latentes de shift/merge não percebidos); **CEF,
  Itaú, Santander, MP, Bradesco, Inter, Nubank: zero mudança**. _Resíduo:_ o TÍTULO "RESUMO"
  (sem valor) ainda gruda no "SALDO DO DIA"; corte por x0 regride o BB → não aplicado. _ENGINE §3._
- [x] **G — Título virou coluna** (Sicoob "HISTÓRICO DE MOVIMENTAÇÃO"): CORRIGIDO. O merge de
  cabeçalho só junta tokens que alinham a uma coluna-base OU ficam fora do range (coluna nova
  à borda, ex.: "Data" do CEF); um título centralizado no MEIO das colunas é ignorado. Sicoob
  4→3 colunas; CEF mantém 5. _ENGINE §3._

- [x] **Continuação do ÚLTIMO lançamento de cada página (Shape-2/Nubank)**: CORRIGIDO por
  **invariância entre páginas** (sinal não-geométrico, não-por-banco): o rodapé institucional
  repete idêntico no rabo de ≥ metade das páginas (`recurringFooter`), a continuação é única →
  `tableBoundary` estende a fronteira da tabela sobre as continuações e para no 1º rodapé. O
  limiar de ≥ metade (não ≥2) evita confundir contraparte repetida (Nubank AMAZON) com rodapé.
  Nubank 03/03 R$ 326,12 agora completo ("…15.436.940/0001-03 - Bank of America Merrill Lynch
  Banco Múltiplo… Conta: 1057504-2"); Inter/Nubank com 0 rodapé vazado; doc de 1 página cai no
  fallback (rabo curto). _ENGINE §3–§4._

### Extração
- ⏸️ **Item 11 — Bradesco: ADIADO (decisão 2026-07-06).** Investigação mostrou que o PDF
  do Bradesco tem **duas estruturas num só doc**: (a) extrato principal = data-agrupada
  (funde sub-lançamentos por data), (b) seção "SALDO INVEST FÁCIL" = data-por-linha (o
  Shape-1 já extrai CERTO). Consequências: rotear o doc todo pro Shape-2 quebraria o bloco
  (b); o fix cirúrgico "não fundir detalhe-com-valor" tem risco sutil de regressão nos 6
  (detalhe que preenche célula vazia da âncora viraria linha extra); a variante segura
  "dividir só em conflito de mesma coluna" não conserta o caso do "TARIFA/20326/Débito"
  (coluna diferente). Como a **modelagem do Bradesco está fora de escopo** (duas colunas
  Crédito/Débito), o custo/risco não compensa. **Estado atual aceito:** lê tudo; Invest
  Fácil perfeito; extrato principal agrupa por data fundindo sub-lançamentos. Reabrir só
  se a modelagem de duas colunas entrar em escopo.
- [x] **Sicoob — datas sem ano** ✅: parser reconhece `dd/mm`, sinaliza `semAno` e o ano é
  preenchido na geração pelo **popup de competência** (ver Modelos, Item 6).

### Modelos
- [x] **Item 3 — Pré-seleção do modo SINAL** ✅: ao escolher a coluna de Valor, se houver
  sinais/marcadores (`colunaTemSinais`) e o D/C ainda não configurado, pré-marca SINAL.
- [x] **Item 4 — "Pular linha" na contrapartida** ✅: checkbox por item (palavra-chave e
  descrição) → correspondências são **puladas** (sem lançamento nem pendência). Marcado →
  demais campos disabled e opcionais. Schema (`pular` em `@saas/types`) + `apply-model`
  (skip) + UI (checkbox + hint `PULAR_LINHA_HINT`) + validação (`probContrapartida`).
  **Substitui o skip TEMP do Nubank** (já removido).
- [x] **Item 6 — Popup de competência (datas sem ano)** ✅: `parseData(raw, anoCompetencia?)`
  + flag `semAno`; `convertSchema.competenciaAno`; `service.convert` detecta e devolve
  `needsCompetenciaAno`; front (`handleExport`) abre `alerts.input` do ano e reenvia. Só ano.

### Entrega ✅ — PR #9 (OPEN, aguardando review/merge do Wagner)
- [x] **Commit de extração** = `0a668cb` (leitura de PDF: pdf-extract, extract-tabela,
  service async, page.tsx conversão .pdf) + `19b1c2a` (extração robusta em múltiplos
  layouts: reescrita estrutural da anexação em dois modos).
- [x] **Commit de modelos + debug** = `4410843` (D/C SINAL + parser marcador + zero-skip +
  itens 3/4/6 + visualizador de debug): apply-model, parsers, model-editor, version-diff,
  version-overview, treatment-definition, types, router/service, debug-viewer, page.tsx.
- [x] **Commit de documentação** = `f3bd028` (ENGINE + este plano).
- [x] **Gate final** (typecheck web+api limpos, health 200) executado antes dos commits.
- ⏳ **Review/merge da PR #9** = exclusivo do Wagner (Service Manager). Deploy não é nosso.
- ↪️ **Melhorias de UI/UX** (ex.: reaproveitamento da tabela de Contrapartida) vão em
  **PR separada**, a partir do `main` atualizado — fora do escopo desta PR de extração.

---

## 7. Pontas soltas / observações (verificar, não bloqueiam)

- **"Saldoportransação" sem espaços** (Inter): artefato de caracteres colados no PDF do
  Inter (mesma raiz das datas coladas). Cosmético; nome de coluna ainda compreensível.
- **Nubank ~18/90 linhas** sem a continuação completa da descrição (transações curtas ou
  última-da-página pelo guard anti-rodapé). Aceitável; revisitar se incomodar.
- **Mercado Pago 15428 linhas** — volume alto **confirmado como real** (conta de alto
  volume); não é super-extração. Resolvido.
- **Redação do histórico SCI** (PGTO/RECEB): se a gestora quiser rever a *palavra*, é
  conversa à parte — a direção D/C está correta (ver §3).
- **Bradesco modelagem:** mesmo com extração corrigida, o banco tem múltiplos valores por
  data e duas colunas de valor → modelagem completa fica fora de escopo.
