/**
 * Vencimento da GUIA, lido do PDF anexado à entrega no Acessórias.
 *
 * A API do Acessórias não informa o vencimento da guia (o campo "Vcto" da tela
 * deles não é exposto — conferido em 30/09/2026). E ele nem sempre é o prazo
 * legal: guia de parcelamento, DARF recalculado, DAM municipal e DUA com
 * vencimento próprio divergem dele — foi o que mostrou a amostra de 59 tipos
 * de guia da carteira (ex.: DARF IRRF aluguel com guia até 06/08 e prazo legal
 * 20/08; DUA de parcelamento até 15/08 com prazo legal 15/09).
 *
 * As regras vão da mais explícita para a mais genérica, e a ORDEM IMPORTA: no
 * DARF recalculado, "Vencimento:31/07/2026" é o vencimento ORIGINAL da
 * composição, e o que vale é o "Pagar este documento até 30/09/2026".
 */

export type RegraVencimento = 'pagar_documento_ate' | 'pagar_ate' | 'data_de_vencimento' | 'vencimento' | 'data_unica'

export interface VencimentoLido {
  /** YYYY-MM-DD */
  data: string
  regra: RegraVencimento
}

const DATA = String.raw`(\d{2})\/(\d{2})\/(\d{4})`

// `\s*` atravessa a quebra de linha: o pdf-parse põe rótulo e valor em linhas
// diferentes em quase todo layout ("Pagar este documento até\n25/09/2026").
const REGRAS: Array<{ regra: RegraVencimento; re: RegExp }> = [
  // DARF, DCTFWeb, FGTS Digital, consignado, DAS/PGFN
  { regra: 'pagar_documento_ate', re: new RegExp(String.raw`pagar\s+este\s+documento\s+at[eé]\s*:?\s*${DATA}`, 'i') },
  // DUA-ES ("Pagar até 18/09/2026. Após esta data...") e DAS ("Pagar até:30/09/2026")
  { regra: 'pagar_ate', re: new RegExp(String.raw`pagar\s+at[eé]\s*:?\s*${DATA}`, 'i') },
  // DAM Vitória ("Data de Vencimento:  21/09/2026"), DARE-SP ("07 - Data de Vencimento\n15/09/2026")
  { regra: 'data_de_vencimento', re: new RegExp(String.raw`data\s+de\s+vencimento\s*:?\s*${DATA}`, 'i') },
  // DAM/ISS municipais e DUA ("Vencimento\n10/09/2026", "Vencimento : 31/07/2026")
  { regra: 'vencimento', re: new RegExp(String.raw`vencimento\s*:?\s*${DATA}`, 'i') },
]

function iso(d: string | undefined, m: string | undefined, a: string | undefined): string | null {
  if (!d || !m || !a) return null
  const dia = Number(d), mes = Number(m), ano = Number(a)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2000 || ano > 2100) return null
  return `${a}-${m}-${d}`
}

/**
 * Lê o vencimento do texto de uma guia. `null` = não é guia de pagamento ou o
 * layout não foi reconhecido — quem chama cai no prazo legal.
 */
export function extrairVencimentoGuia(texto: string): VencimentoLido | null {
  if (!texto) return null
  for (const { regra, re } of REGRAS) {
    const m = texto.match(re)
    if (m) {
      const data = iso(m[1], m[2], m[3])
      if (data) return { data, regra }
    }
  }
  // Layout Febraban (DAM de Cachoeiro, Linhares): os rótulos vêm todos numa
  // linha ("Data Emissão:Vencimento Original:Data Vencimento:") e os valores
  // soltos depois, com a emissão em ano de 2 dígitos. Nesses, a única data
  // completa do documento é o vencimento. Só vale se o texto falar em
  // vencimento — senão um relatório com uma data qualquer viraria "guia".
  if (/vencimento/i.test(texto)) {
    const datas = [...new Set([...texto.matchAll(new RegExp(DATA, 'g'))].map((m) => iso(m[1], m[2], m[3])).filter(Boolean))]
    if (datas.length === 1) return { data: datas[0] as string, regra: 'data_unica' }
  }
  return null
}

/**
 * Várias guias numa entrega (parcelas, guia + declaração): vale a que vence
 * primeiro — é a data que não pode passar.
 */
export function vencimentoMaisProximo(lidos: Array<VencimentoLido | null>): VencimentoLido | null {
  return lidos.filter((v): v is VencimentoLido => !!v).sort((a, b) => a.data.localeCompare(b.data))[0] ?? null
}
