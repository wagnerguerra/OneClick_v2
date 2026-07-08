# Engine de extração de tabela de PDF (extratos bancários)

> Como o extrator determinístico de PDF funciona por dentro. Serve de mapa para
> alterações futuras, porque as regras, vistas soltas no código, são abstratas.
> Código: `apps/api/src/tratamento-lancamentos/lib/pdf-extract.ts` (+ `extract-tabela.ts`,
> `parsers.ts`). Plano/escopo: [PLANO-TRATAMENTO-LANCAMENTOS-PDF-DC.md](./PLANO-TRATAMENTO-LANCAMENTOS-PDF-DC.md).

Última atualização: 2026-07-07.

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
   - Ao mesclar as linhas vizinhas do cabeçalho, só junta tokens que **alinham (cx)** a uma
     coluna-base **ou** ficam **fora do range** das colunas-base (coluna nova à esquerda/direita
     — ex.: "Data"/"Data Efetiva" do CEF, numa linha própria à esquerda). Um cluster **no meio**
     das colunas (Sicoob "HISTÓRICO DE MOVIMENTAÇÃO", TÍTULO centralizado sobre "DATA HISTÓRICO
     VALOR") não alinha nem está fora → é ignorado, não virando **coluna falsa**.
   - `descCol` = índice da coluna de descrição/histórico (`DESC_COL_RE`), usado na anexação (§4).
2. **`assignCells`** — cada token cai na coluna de **centro x mais próximo**.
   - **Exclui do corpo** o cabeçalho **repetido/duplicado** por página (`headerScore ≥ 3` —
     Mercado Pago reimprime, às vezes sobreposto: "Data Data Descrição Descrição…") e as
     linhas que são só **número de página** (`PAGE_NUM_RE`, "3/5", "1/1076") — que casariam
     `ANCHOR_DATE_RE` e/ou grudariam no saldo. Um lançamento quase nunca tem 3+ palavras de
     cabeçalho, então o corte é seguro.
3. **Âncora** = linha cuja célula da coluna-data casa `ANCHOR_DATE_RE` (data como célula
   inteira). Cada âncora vira um lançamento.
4. **Sequência contínua entre páginas** — os corpos de TODAS as páginas viram uma única
   sequência com um `gy` monotônico decrescente (preserva os vãos intra-página; encadeia
   páginas com `interGap` = **cluster de gaps PEQUENOS** ≈ "uma linha para baixo" — NÃO a
   mediana, inflada pelo espaço ENTRE transações em extratos de 1 linha/lançamento, que
   afastaria demais a continuação da virada). Isso resolve
   o lançamento que **se divide na virada de página** (Itaú: a linha de descrição/razão
   fica órfã no rodapé de uma página e a âncora com data+valor está no topo da seguinte) —
   sem a união, o detalhe órfão grudava no lançamento anterior.
5. **Anexação dos detalhes por MODO de layout.** Cada linha sem data (razão, CNPJ, continuação)
   precisa ir pra âncora certa. Isso depende do layout do extrato, detectado pela **fração de
   âncoras com a coluna de descrição VAZIA na própria linha** (`emptyFrac`): alta ⇒ a descrição
   mora ACIMA (há prefácios) ⇒ **"âncora no meio"**; ~zero ⇒ a descrição começa na âncora e só
   continua ABAIXO ⇒ **"âncora no topo"** (limiar **5%** — a distinção é "tem OU não tem
   detalhe-acima"). O sinal é robusto por ser estrutural (não é enganado por bloco alto, ao
   contrário de medir distância geométrica). Recompõe na ordem de leitura (`acima → âncora →
   abaixo`), sem sobrescrever a data.
   - **Âncora no meio** (Itaú, CEF, Mercado Pago, Santander): o detalhe vai para a **âncora mais
     próxima** (`prevA`/`nextA`, O(n) — `gy` monotônico), até `ATTACH_MAX_DY`. Uma candidata
     ABAIXO reprovada pelo `belowMax` é pulada (mas o detalhe ainda pode ir pra âncora ACIMA —
     MP "Pagamento com Código QR"). Inclui o redirect **cross-page** (continuação que partiu na
     virada e ficou perto do 1º lançamento da página seguinte volta pra âncora da anterior —
     Sicoob no modo antigo; hoje o Sicoob é "no topo"). `belowMax` barra rodapé.
   - **Âncora no topo** (Sicoob, BB): o detalhe **ENCADEIA para a âncora de CIMA** — o salto é
     medido do ÚLTIMO detalhe já anexado àquela âncora (não pela distância direta). Com isso os
     **blocos de descrição ALTOS** (4-5 linhas, > `ATTACH_MAX_DY`) e o "**shift**" das linhas de
     baixo pro próximo lançamento **se resolvem**, e a **virada de página** vira só mais um elo da
     cadeia. Paradas/exceções estruturais:
     - **RESUMO:** quando o valor mora na âncora (`valueOnAnchor` — a coluna de valor está
       preenchida na maioria das âncoras), uma linha-detalhe que TAMBÉM tem valor na coluna de
       valor NÃO é continuação de descrição, é resumo (Sicoob "(+) SALDO EM CONTA: 3.129,74C") →
       não anexa. (Descrição de continuação não tem valor.)
     - **Fim da tabela:** um salto grande (`belowMax`) quebra a cadeia (rodapé).
     - **Prefácio de âncora vazia:** um detalhe imediatamente ACIMA de uma âncora de descrição
       VAZIA a prefacia (Santander [89]: "Cr Cob Bloq" sobre a âncora de histórico vazio).
   - _Resíduo conhecido:_ o **título** "RESUMO" (linha sem valor, centralizada) ainda gruda em
     "SALDO DO DIA" no Sicoob — as LINHAS do resumo (com valor) são barradas, só o título passa.
     Um corte por x0 (título deslocado) foi testado e regride o BB (continuações do BB começam
     deslocadas) → não aplicado.

### Shape-2 — data agrupada por dia (`extractSectionGrouped`)
A data aparece **uma vez** encabeçando o dia; os lançamentos abaixo **herdam** aquela data
(carry-forward). Ex.: Inter, Nubank. **Mesmo conceito** do carry-forward do modo relatório
do leitor de planilhas (`extractReport` em `extract-tabela.ts`): lá um cabeçalho de seção
("Banco: X") propaga como coluna sintética; aqui a **data do dia** propaga como a coluna
sintética `Data`.

Passos:
1. **`firstDate`** — ignora o preâmbulo antes da 1ª linha que começa com data (`leadingDate`).
   Sem nenhuma data → não é seção-agrupada (retorna null).
2. **`isCand` + coluna de valor por POSIÇÃO** — uma *candidata* a lançamento tem valor
   (`MONEY_RE`), **não** começa com data e **não** é subtotal. Entre as candidatas,
   clusterizam-se os x0 dos tokens monetários → as **colunas de valor dominantes** (onde
   MUITAS candidatas têm valor). Uma candidata só é lançamento (`isTxn`) se o valor dela
   estiver **numa coluna de valor dominante** — valores de resumo soltos (ex.: "R$ 0,00" na
   margem esquerda) ficam fora → descartados. NÃO se supõe que todo lançamento tenha texto
   (extratos "só valor" existem). Sem coluna dominante (doc atípico), não filtra por posição.
   As linhas de lançamento definem as **colunas** (`columnStarts`).
3. **`columnStarts(bodyLines)`** — colunas pela **borda esquerda (x0)** dos tokens
   (cluster por gap > 40). x0 é estável mesmo com descrições de larguras diferentes
   (ao contrário do centro).
4. **`numericCol`** — por coluna, se a maioria das células casa `MONEY_RE` → é coluna de
   valor. (Usada para rótulos e para o anti-rodapé.)
5. **Varredura visual (topo→base)** com carry-forward:
   - linha com **intervalo de datas** (`isDateRange`: 2+ datas, ex.: "01 DE MARÇO
     DE 2026 a 31 DE MARÇO DE 2026") → é o **cabeçalho de período** repetido no
     topo de cada página; **ignorada sem tocar em `currentDate`/`last`** (ver §5);
   - linha com data (única) → atualiza `currentDate`, zera `last`;
   - subtotal → zera `last`;
   - **preâmbulo repetido** (nome do titular, CNPJ, nº da conta reimpressos no topo de cada
     página — `preambleTexts`, colhido do bloco antes da 1ª data) → **ignorado** (senão
     grudaria como continuação no lançamento da página anterior);
   - linha com valor → **novo lançamento** (herda `currentDate`), vira `last`;
   - linha sem valor/data → **continuação de descrição** do `last` (ver §4).
   - **Continuação que cruza a virada:** o `last` guarda a página (`lastPage`); ao mudar de
     página o `y` reinicia no topo (o vão-y vira negativo), então a proximidade passa a ser
     por **ordem de leitura** (`pageOf > lastPage`) em vez do vão-y — com o preâmbulo já
     pulado, as 1ªs linhas-sem-data da nova página são a continuação do lançamento cortado
     (Nubank: "…Bank of America Merrill" | "Lynch Banco… Agência" | "Conta: …").
   - **Continuação do ÚLTIMO lançamento da página (rabo) × rodapé:** a continuação da
     descrição do último lançamento cai depois dele, no "rabo" da página — a MESMA zona do
     rodapé institucional, que fica a ~1 vão de linha (idêntico a uma continuação por
     geometria). O que separa NÃO é geometria e sim **invariância entre páginas**: o rodapé
     ("Fale com a gente", "SAC/Ouvidoria", "Tem alguma dúvida?…") repete IDÊNTICO no rabo de
     **quase toda** página; a continuação é única daquele lançamento. `recurringFooter` =
     texto do rabo que aparece em **≥ metade das páginas** (`footerMinPages`); o limiar alto
     evita confundir uma **contraparte repetida** que às vezes é o último lançamento (Nubank
     AMAZON aparece no rabo de poucas páginas) com rodapé. Com isso, `tableBoundary` estende a
     fronteira da tabela de cada página sobre as continuações (não-rodapé, a ~1 vão de linha),
     parando no 1º rodapé invariante — recupera "…Bank of America Merrill" sem grudar o rodapé
     do Inter. Fallback: doc de **1 página** não tem invariância a medir → mantém o rabo curto.
     **Reversível:** todo esse mecanismo está atrás do flag `FEATURE_RECUPERA_CONTINUACAO_RABO`
     (bloco marcado `[REVERSÍVEL]` em `pdf-extract.ts`); `false` faz `tableBoundary == lastTableIdx`
     (comportamento anterior — a continuação do último lançamento por página volta a não anexar).
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
- **Intervalo de datas ≠ cabeçalho de dia** (`isDateRange`): o extrato imprime o
  **período** ("01 DE MARÇO DE 2026 a 31 DE MARÇO DE 2026") no topo de CADA página.
  Reordenados por x, esses tokens começam com uma data → o carry-forward, ingênuo,
  os leria como "novo dia" e zeraria a data corrente para o 1º dia do período em toda
  virada de página (bug real do Nubank: lançamentos entre a última data de uma página
  e a próxima data explícita, lá adiante, herdavam `01/03` em vez da data correta).
  Uma linha com **2+ datas completas** é um intervalo/período → ignorada no
  carry-forward (nem atualiza `currentDate`, nem reseta `last` — a continuação de
  descrição que atravessa a página precisa do `last`). `ANY_DATE_RE` casa data
  textual PT ou `dd/mm[/aa]`; o separador numérico exige `/` ou `-` (não `.`) para
  não contar valores ("12.345,67") como data. Só é consultado em linhas que já
  começam com data.

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
