# Engine de extração de tabela de PDF (extratos bancários)

> Como o extrator determinístico de PDF funciona por dentro. Serve de mapa para
> alterações futuras, porque as regras, vistas soltas no código, são abstratas.
> Código: `apps/api/src/tratamento-lancamentos/lib/pdf-extract.ts` (+ `extract-tabela.ts`,
> `parsers.ts`). Plano/escopo: [PLANO-TRATAMENTO-LANCAMENTOS-PDF-DC.md](./PLANO-TRATAMENTO-LANCAMENTOS-PDF-DC.md).

Última atualização: 2026-07-06.

---

## 1. Onde ela se encaixa

```
extractTabela(input)            ← fronteira ÚNICA (extract-tabela.ts)
  ├─ .xlsx/.xls/.csv → extractTabelaXlsx (SheetJS)
  └─ .pdf            → extractPdfTable (pdf-extract.ts)   ← ESTE documento
         │
         └─ devolve ExtractedTable → dropEmptyColumns → resto do pipeline
                                                          (de/para → pendências → SCI)
```

- **`ExtractedTable`** = `{ headers: string[], rows: Record<coluna, valor|null>[], meta }`.
  É o contrato. O extrator de PDF só precisa produzir esse formato; nada a jusante muda.
- **Determinístico:** usa a **camada de texto** do PDF (posições x/y de cada fragmento).
  PDF escaneado/imagem (sem texto) cai com ~0 linhas → **TODO(IA)** de fallback.
- `dropEmptyColumns` (na fronteira) remove colunas 100% vazias — vale para qualquer fonte.

---

## 2. Da página aos "tokens" e "linhas"

`pdf-parse` entrega, por página, fragmentos de texto com posição. Cada fragmento vira um
`Item { s, x, y, w }` (x/y = canto inferior-esquerdo da baseline).

1. **`buildLines(items)`** — ordena topo→base (y decrescente) e agrupa fragmentos por
   proximidade de `y` (tolerância `Y_TOL`) → **linhas físicas**.
2. **`mergeTokens(lineItems)`** — dentro da linha, junta fragmentos colados em x
   (gap ≤ `GAP_MERGE`) num **`Token { text, x0, x1, cx }`**. (Por isso "R$ 1.234,56"
   fragmentado vira um token só; e por isso o Inter, que renderiza cada caractere
   separado, às vezes cola palavras — ex.: "2deMarçode2026", "Saldoportransação".)

Vocabulário: **Item** (fragmento cru) → **Token** (fragmentos colados) → **Line** (tokens numa faixa de y).

---

## 3. Dois "shapes" e o roteamento

`extractPdfTable` tenta **Shape-1** primeiro; se ele render < 3 linhas, tenta **Shape-2**;
usa o que produzir mais linhas.

```
extractPdfTable(buffer):
  pages = extractPageItems(buffer)
  perRow = extractPerRow(pages)          // Shape-1
  if perRow.rows >= 3            → usa Shape-1
  section = extractSectionGrouped(pages) // Shape-2
  if section.rows > perRow.rows  → usa Shape-2
  senão usa o que existir; se nada → throw (provável escaneado → IA)
```

### Shape-1 — data repetida por linha (`extractPerRow`)
Cada lançamento traz a **própria data** numa coluna. Ex.: CEF, Itaú, Santander, BB,
Sicoob, Mercado Pago.

1. **`detectHeader(lines)`** — acha a linha de cabeçalho:
   - candidatas = linhas com `headerScore ≥ 2` (contêm palavras de `HEADER_KEYWORDS`:
     data, histórico, valor, saldo, documento, crédito, débito…);
   - **valida** que abaixo dela há **≥ 2 linhas com data na coluna-âncora** (rejeita
     "caixas de resumo" tipo "Saldo total | disponível | bloqueado");
   - `buildHeaderSpec` fixa os **centros x** de cada coluna (cluster por `CLUSTER_X`),
     mescla cabeçalho quebrado em 2 linhas, colapsa palavra repetida ("Data Data" → "Data"),
     e nomeia coluna vazia como `Coluna <letra>` (`colLetter`).
2. **`assignCells`** — cada token cai na coluna de **centro x mais próximo**.
3. **Âncora** = linha cuja célula da coluna-data casa `ANCHOR_DATE_RE` (data como célula
   inteira). Cada âncora vira um lançamento.
4. **Detalhes** (linhas sem data: razão social, CNPJ, continuação) anexam à **âncora mais
   próxima por distância vertical** (até `ATTACH_MAX_DY`), sem sobrescrever a data.

### Shape-2 — data agrupada por dia (`extractSectionGrouped`)
A data aparece **uma vez** encabeçando o dia; os lançamentos abaixo **herdam** aquela data
(carry-forward). Ex.: Inter, Nubank. **Mesmo conceito** do carry-forward do modo relatório
do leitor de planilhas (`extractReport` em `extract-tabela.ts`): lá um cabeçalho de seção
("Banco: X") propaga como coluna sintética; aqui a **data do dia** propaga como a coluna
sintética `Data`.

Passos:
1. **`firstDate`** — ignora o preâmbulo antes da 1ª linha que começa com data (`leadingDate`).
   Sem nenhuma data → não é seção-agrupada (retorna null).
2. **`isTxn(l)`** — linha de lançamento = tem valor (`MONEY_RE`), **não** começa com data,
   **não** é subtotal (`SUBTOTAL_RE`). Essas definem as **colunas**.
3. **`columnStarts(bodyLines)`** — colunas pela **borda esquerda (x0)** dos tokens
   (cluster por gap > 40). x0 é estável mesmo com descrições de larguras diferentes
   (ao contrário do centro).
4. **`numericCol`** — por coluna, se a maioria das células casa `MONEY_RE` → é coluna de
   valor. (Usada para rótulos e para o anti-rodapé.)
5. **Varredura visual (topo→base)** com carry-forward:
   - linha com data → atualiza `currentDate`, zera `last`;
   - subtotal → zera `last`;
   - linha com valor → **novo lançamento** (herda `currentDate`), vira `last`;
   - linha sem valor/data → **continuação de descrição** do `last` (ver §4).
6. **Rótulos** — da linha **logo acima do 1º lançamento** (cabeçalho do dia). Tokens não
   numéricos alinhados a colunas **numéricas** viram nome da coluna (Inter: "Valor",
   "Saldo por transação"). Não é a 1ª data do doc (que pode ser o período do cabeçalho,
   ex.: Nubank "…VALORES EM R$"). Coluna sem rótulo → `Coluna <letra>`.

---

## 4. Anexação de continuação de descrição (Shape-2)

Descrições que quebram em várias linhas (Nubank: CNPJ, banco, agência abaixo do valor)
são anexadas ao lançamento. Uma linha-sem-valor só é aceita como continuação se passar por
**todos** estes guards (todos gerais, sem string hardcoded):

1. **Não estar no "rabo" da página** — depois da última linha de tabela (lançamento/data/
   subtotal) da página é rodapé/boilerplate. (Calculado por `pageOf` + `lastTableIdx`, com
   quebra de página detectada por salto de `y` para cima.) — **guard principal contra rodapé.**
2. **Proximidade vertical** — gap ≤ `lineGap * 1.5` (`lineGap` = mediana dos gaps intra-página).
3. **Coluna única** — cai numa só coluna (rodapé costuma espalhar por várias, ex.:
   "SAC | Ouvidoria | Deficiência").
4. **Coluna de texto** — nunca anexa em coluna numérica (evita poluir a coluna de valor).
5. **Já preenchida** — a coluna já tem conteúdo no lançamento (continua a descrição existente).

> Contexto: o Inter tem rodapé de atendimento ("Fale com a gente", "Deficiência de fala…
> 0800…") logo abaixo do último lançamento de cada página. Sem o guard 1 ele grudava na
> coluna de valor/descrição. Ver histórico no PLANO.

**Ainda pendente (item 11):** o Bradesco tem a descrição **envolvendo** a linha do valor
(pedaços acima *e* abaixo) e é data-agrupada apesar de ter cabeçalho — precisa de
roteamento e anexação por "linha-de-valor mais próxima". Ver PLANO §6.

---

## 5. Datas (âncora)

- **`ANCHOR_DATE_RE`** (Shape-1): data como **célula inteira**, com `/ - .`, com/sem ano.
  Célula-inteira evita que "dd/mm HH:MM" (hora) vire lançamento falso.
- **`leadingDate(text)`** (Shape-2): data no **início** da linha; devolve `dd/mm/aaaa`
  (ou `dd/mm`). Cobre:
  - textual "de…de" tolerante a espaços — `LEAD_TXT_DE` (Inter: "2deMarçode2026");
  - textual abreviada — `LEAD_TXT_ABBR` (Nubank: "02 MAR 2026");
  - numérica — `LEAD_NUM_DATE` (com `\b` para não casar "12.345,67").
  - meses PT em `MESES_PT` (extenso e abreviado, com/sem cedilha).
- **Sem ano** (Sicoob `dd/mm`): a data extraída fica sem ano; o ano é resolvido na
  **geração** via popup de competência (ver PLANO §6). `parseData` (parsers.ts) faz o
  parse final tolerante.

---

## 6. Constantes de calibragem

| Constante | Valor | Papel |
|---|---|---|
| `Y_TOL` | 2.5 | fragmentos nessa faixa de y = mesma linha |
| `GAP_MERGE` | 3 | gap x ≤ isso → tokens colados (mesmo token) |
| `ATTACH_MAX_DY` | 40 | distância y máx. p/ anexar detalhe à âncora (Shape-1) |
| `HEADER_MERGE_DY` | 14 | junta cabeçalho quebrado em 2 linhas |
| `CLUSTER_X` | 20 | tokens de cabeçalho a < isso em x = mesma coluna (Shape-1) |
| gap de `columnStarts` | 40 | separação de colunas por x0 (Shape-2) |
| `lineGap * 1.5` | — | proximidade de continuação (Shape-2) |

Regex-chave: `HEADER_KEYWORDS`, `DATE_COL_RE`, `ANCHOR_DATE_RE`, `MONEY_RE`,
`SUBTOTAL_RE`, `LEAD_*`.

---

## 7. Como estender (checklist)

- **Toda mudança é validada contra os 9 extratos de exemplo** (pasta
  `cc-tratamento-de-lancamentos-para-SCI/PDF`). Qualquer regressão → parar e revisar.
- **Preferir regra geral** a regra por banco (princípio recorrente do projeto). Se algo
  parecer específico demais, reconsiderar.
- **Harness rápido** (rodar de `apps/api`, `tsx` disponível): importar `extractPdfTable`,
  rodar sobre a pasta de exemplos, imprimir `rows.length` + amostras. (Scripts são
  temporários — não commitar.)
- **Probe de coordenadas**: `pdf-parse` com `pagerender`, imprimir `x`/`y`/texto por linha,
  para entender um layout novo antes de codar.
- Colunas sem cabeçalho → **letras** via `colLetter` (padrão único; não usar números).
- Novo helper compartilhado entre planilha e PDF → exportar de `extract-tabela.ts`.
- Manter os **TODO(IA)** de fallback (imagem/scan) abertos.
