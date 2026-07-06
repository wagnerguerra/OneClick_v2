# Plano — Tratamento de Lançamentos: leitura de PDF + Débito/Crédito

> **Documento vivo.** Mantê-lo atualizado a cada avanço. Escopo cresceu; este é o
> mapa canônico do que foi decidido, do que já está feito e do que falta.
> Docs relacionados: [ENGINE-EXTRACAO-PDF.md](./ENGINE-EXTRACAO-PDF.md) (como a
> extração funciona por dentro).

Última atualização: 2026-07-06.

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
| BB | Shape-1 | 72 | marcador `C`/`D` → Sinal | ✅ |
| Sicoob | Shape-1 | 274 | marcador `C`/`D`/`*` → Sinal | ✅ (datas sem ano — pendente §5) |
| Mercado Pago | Shape-1 | 15428 | Sinal / palavra-chave | ✅ (⚠ conferir volume, §5) |
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
- **Anti-rodapé robusto:** continuação só fora do "rabo" da página + coluna única de
  texto + não-numérica + já preenchida.
- Nomes genéricos padronizados em **letras** (A, B, C).

**Frontend / UX:**
- Upload aceita `.pdf` (wizard + conversão); textos ajustados; "Suporte a imagens em breve".

**Infra:**
- Sync local↔remote concluído (branch em `origin/main`; DB alinhado: `db push` +
  10 SQLs + regen client). Ver memória sync-local-remote.

---

## 6. Pendências — A FAZER 🚧

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
- [ ] **Sicoob — datas sem ano** (parte extração/parser): reconhecer `dd/mm` e deixar o
  ano ser preenchido na geração (ver popup de competência).

### Modelos
- [ ] **Item 3 — Pré-seleção do modo SINAL:** ao escolher a coluna de Valor no De/Para,
  se houver sinais/marcadores nos valores, pré-marcar "Pelos sinais dos valores".
- [ ] **Item 4 — Item "ignorar" na contrapartida:** checkbox por item (descrição e
  palavra-chave) → correspondências são **puladas** (não viram lançamento nem pendência).
  Marcado → demais campos disabled e not-required. Rótulo sugerido: **"Ignorar estes
  lançamentos"**. Toca `@saas/types` (schema) + UI + `apply-model`.
- [ ] **Item 6 — Popup de competência (datas sem ano):** no "Gerar arquivo", se a coluna
  de datas tiver datas sem ano → backend sinaliza → front abre popup do ano → reenvia.
  Toca `convertSchema` (ano opcional) + detecção no service + `parseData`/`apply-model` +
  diálogo no front.

### Entrega
- [ ] **Commits** em ordem (extração → modelos). Nada commitado ainda; tudo na working tree.
- [ ] **Gate final** (tsc + health 200) e **testes de UI** pelo roteiro (Sicoob/Inter/Nubank).

---

## 7. Pontas soltas / observações (verificar, não bloqueiam)

- **"Saldoportransação" sem espaços** (Inter): artefato de caracteres colados no PDF do
  Inter (mesma raiz das datas coladas). Cosmético; nome de coluna ainda compreensível.
- **Nubank ~18/90 linhas** sem a continuação completa da descrição (transações curtas ou
  última-da-página pelo guard anti-rodapé). Aceitável; revisitar se incomodar.
- **Mercado Pago 15428 linhas** — volume alto; confirmar se é real (conta de alto volume)
  ou super-extração.
- **Redação do histórico SCI** (PGTO/RECEB): se a gestora quiser rever a *palavra*, é
  conversa à parte — a direção D/C está correta (ver §3).
- **Bradesco modelagem:** mesmo com extração corrigida, o banco tem múltiplos valores por
  data e duas colunas de valor → modelagem completa fica fora de escopo.
