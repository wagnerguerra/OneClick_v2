/**
 * Leitura dos dados básicos de uma NF-e a partir do texto do DANFE em PDF.
 *
 * Serve ao recebimento de pedidos de compra: em marketplace um pedido chega
 * por vários vendedores, cada um com a sua nota (pedido #617: 4 itens, 4
 * notas). Quem recebe anexa o DANFE e o sistema tira dali o número e o valor,
 * em vez de alguém redigitar.
 *
 * O número vem da CHAVE DE ACESSO, que é igual em todo layout (44 dígitos:
 * UF, AAMM, CNPJ, modelo, série nas posições 22-24 e número nas 25-33). O
 * valor total muda de lugar conforme o emissor, então são três tentativas, da
 * mais explícita para a mais genérica (amostra de 30/09/2026):
 *   1. canhoto: "EMISSÃO: 21/09/2026 VALOR TOTAL: R$ 749,00"
 *   2. rótulo "V. TOTAL DA NOTA" com o valor na linha seguinte
 *   3. layout que solta rótulos e valores em blocos separados (Amazon): o
 *      maior valor em "R$" do documento — o total da nota é o maior dos totais
 *      do quadro de cálculo do imposto.
 */

export interface NotaFiscalLida {
  /** Número da NF sem zeros à esquerda ("3796"). */
  numero: string
  serie: string | null
  /** Chave de acesso, 44 dígitos. Null quando só o "Nº" foi encontrado. */
  chave: string | null
  valor: number | null
  /** Razão social do emitente (o vendedor), do canhoto. */
  emitente: string | null
}

/** "1.234,56" → 1234.56 */
function brl(v: string): number | null {
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Chave de acesso: 44 dígitos, normalmente em blocos de 4 separados por espaço. */
export function extrairChave(texto: string): string | null {
  for (const m of texto.matchAll(/(?:\d{4}[ .]?){10}\d{4}/g)) {
    const so = m[0].replace(/\D/g, '')
    // Modelo 55 (NF-e) ou 65 (NFC-e) nas posições 20-21.
    if (so.length === 44 && /^(55|65)$/.test(so.slice(20, 22))) return so
  }
  return null
}

export function extrairNotaFiscal(texto: string): NotaFiscalLida | null {
  if (!texto) return null
  const chave = extrairChave(texto)

  let numero: string | null = null
  let serie: string | null = null
  if (chave) {
    serie = String(Number(chave.slice(22, 25)))
    numero = String(Number(chave.slice(25, 34)))
  } else {
    // Sem chave legível: "Nº. 000.003.796" / "N° 075.886.937".
    const m = texto.match(/N\s*[º°o]\.?\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{3,9})\b/i)
    if (m?.[1]) numero = String(Number(m[1].replace(/\D/g, '')))
    const s = texto.match(/S[ÉE]RIE:?\s*(\d{1,3})\b/i)
    if (s?.[1]) serie = String(Number(s[1]))
  }
  // Sem número não é uma NF que saibamos ler — melhor não inventar.
  if (!numero || numero === '0') return null

  const VALOR = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`
  let valor: number | null = null
  const canhoto = texto.match(new RegExp(String.raw`VALOR\s+TOTAL:?\s*R\$\s*${VALOR}`, 'i'))
  if (canhoto?.[1]) valor = brl(canhoto[1])
  if (valor === null) {
    const rotulo = texto.match(new RegExp(String.raw`(?:V\.|VALOR)\s*TOTAL\s+DA\s+NOTA\s*\n\s*(?:R\$\s*)?${VALOR}`, 'i'))
    if (rotulo?.[1]) valor = brl(rotulo[1])
  }
  if (valor === null) {
    const todos = [...texto.matchAll(new RegExp(String.raw`R\$\s*${VALOR}`, 'g'))]
      .map((m) => brl(m[1] ?? ''))
      .filter((n): n is number => n !== null)
    if (todos.length) valor = Math.max(...todos)
  }

  const emit = texto.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i)
  const emitente = emit?.[1]?.replace(/\s+/g, ' ').trim() || null

  return { numero, serie, chave, valor, emitente }
}
