// ============================================================
// Motor de conversão: aplica um Modelo de Tratamento aos lançamentos extraídos
// e produz o conteúdo SCI — ou a lista de PENDÊNCIAS, quando algum lançamento
// não pôde ser interpretado.
//
// Tipos de pendência (alinhados ao plano):
//   ES_NAO_MAPEADO     valor da coluna de entrada/saída sem direção definida
//   CONTA_NAO_MAPEADA  sem conta de contrapartida para a descrição/palavra-chave
//   CAMPO_VAZIO        coluna obrigatória sem valor na linha
//   DATA_INVALIDA      data não reconhecida
//   VALOR_INVALIDO     valor não numérico
// ============================================================

import type { TreatmentDefinition } from '@saas/types'
import type { ExtractedTable, CellValue } from './extract-tabela'
import { parseData, parseValor } from './parsers'
import { buildSciLine, buildSciFile, type Direcao } from './sci-format'

export type PendenciaTipo = 'ES_NAO_MAPEADO' | 'CONTA_NAO_MAPEADA' | 'CAMPO_VAZIO' | 'DATA_INVALIDA' | 'VALOR_INVALIDO'

export interface Pendencia {
  /** Linha de dados (1-based) na tabela extraída; 0 = pendência do modelo. */
  linha: number
  tipo: PendenciaTipo
  /** Coluna/aspecto causador (para destaque na UI). */
  campo: string
  mensagem: string
  /** Valor bruto causador (tooltip/realce). */
  valor?: string
}

export interface ConversionResult {
  /** Conteúdo do .txt SCI; null quando há pendências. */
  sciText: string | null
  totalLancamentos: number
  pendencias: Pendencia[]
}

function cell(row: Record<string, CellValue>, col: string): string {
  if (!col) return ''
  const v = row[col]
  return v === null || v === undefined ? '' : String(v).trim()
}

interface CpMatch { conta: string; historicoFixo?: string; direcao?: Direcao }

/** Resolve a contrapartida de uma descrição conforme o modo do modelo. */
function matchContrapartida(def: TreatmentDefinition, descricao: string): CpMatch | null {
  const cp = def.contrapartida
  if (cp.modo === 'PALAVRA_CHAVE') {
    const lower = descricao.toLowerCase()
    let best: { item: typeof cp.palavraChave[number]; idx: number } | null = null
    for (const item of cp.palavraChave) {
      const kw = item.palavraChave.trim().toLowerCase()
      if (!kw) continue
      const idx = lower.indexOf(kw)
      if (idx >= 0 && (best === null || idx < best.idx)) best = { item, idx }
    }
    return best ? { conta: best.item.conta, historicoFixo: best.item.historicoFixo, direcao: best.item.direcao } : null
  }
  const item = cp.descricao.find((i) => i.descricao === descricao)
  return item ? { conta: item.conta, historicoFixo: item.historicoFixo, direcao: item.direcao } : null
}

export function applyModel(table: ExtractedTable, def: TreatmentDefinition): ConversionResult {
  const cm = def.columnMapping
  const esMapa = new Map(def.entradaSaida.mapa.map((m) => [m.valor, m.direcao]))
  const contaCorrente = def.contaCorrente.trim()

  const lines: string[] = []
  const pendencias: Pendencia[] = []

  // Pendência de modelo: conta corrente é necessária para os campos <3>/<4>.
  if (!contaCorrente) {
    pendencias.push({ linha: 0, tipo: 'CAMPO_VAZIO', campo: 'contaCorrente', mensagem: 'Conta corrente não informada no modelo.' })
  }

  table.rows.forEach((row, i) => {
    const linha = i + 1
    const rowPend: Pendencia[] = []

    const descricao = cell(row, cm.descricao)
    const participante = cm.participante ? cell(row, cm.participante) : ''
    const numeroNf = cm.numeroNf ? cell(row, cm.numeroNf) : ''
    const documento = cm.documento ? cell(row, cm.documento) : ''

    if (!descricao) rowPend.push({ linha, tipo: 'CAMPO_VAZIO', campo: cm.descricao, mensagem: 'Descrição vazia.' })

    // Data (campo obrigatório)
    const dataStr = cell(row, cm.data)
    const pd = parseData(cm.data ? row[cm.data] : '')
    if (!pd.valid) {
      rowPend.push(dataStr
        ? { linha, tipo: 'DATA_INVALIDA', campo: cm.data, mensagem: `Data inválida: "${dataStr}".`, valor: dataStr }
        : { linha, tipo: 'CAMPO_VAZIO', campo: cm.data, mensagem: 'Data vazia.' })
    }

    // Valor (campo obrigatório)
    const valorStr = cell(row, cm.valor)
    const pv = parseValor(cm.valor ? row[cm.valor] : '')
    if (!pv.valid) {
      rowPend.push(valorStr
        ? { linha, tipo: 'VALOR_INVALIDO', campo: cm.valor, mensagem: `Valor não numérico: "${valorStr}".`, valor: valorStr }
        : { linha, tipo: 'CAMPO_VAZIO', campo: cm.valor, mensagem: 'Valor vazio.' })
    }

    // Contrapartida (conta + possivelmente direção)
    const match = matchContrapartida(def, descricao)
    if (!match || !match.conta.trim()) {
      rowPend.push({ linha, tipo: 'CONTA_NAO_MAPEADA', campo: cm.descricao, mensagem: `Sem conta de contrapartida para "${descricao}".`, valor: descricao })
    }

    // Direção (entrada/saída)
    let direcao: Direcao | null = null
    if (def.entradaSaida.tipo === 'COLUNA') {
      const esVal = cell(row, def.entradaSaida.coluna)
      if (!esVal) {
        rowPend.push({ linha, tipo: 'CAMPO_VAZIO', campo: def.entradaSaida.coluna, mensagem: 'Valor de entrada/saída vazio.' })
      } else {
        const dir = esMapa.get(esVal)
        if (!dir) rowPend.push({ linha, tipo: 'ES_NAO_MAPEADO', campo: def.entradaSaida.coluna, mensagem: `Valor "${esVal}" não mapeado como entrada/saída.`, valor: esVal })
        else direcao = dir
      }
    } else if (match) {
      if (match.direcao) direcao = match.direcao
      else rowPend.push({ linha, tipo: 'ES_NAO_MAPEADO', campo: cm.descricao, mensagem: `"${descricao}" sem entrada/saída definida na contrapartida.`, valor: descricao })
    }

    if (rowPend.length) { pendencias.push(...rowPend); return }

    lines.push(buildSciLine({
      numero: lines.length + 1,
      yyyymmdd: pd.yyyymmdd as string,
      direcao: direcao as Direcao,
      contaCorrente,
      contaContrapartida: (match as CpMatch).conta.trim(),
      valor: pv.value as number,
      participante,
      numeroNf,
      documento,
      historicoFixo: (match as CpMatch).historicoFixo,
    }))
  })

  return {
    sciText: pendencias.length ? null : buildSciFile(lines),
    totalLancamentos: table.rows.length,
    pendencias,
  }
}
