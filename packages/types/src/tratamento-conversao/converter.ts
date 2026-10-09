// ============================================================
// "Gerar arquivo": converte a tabela extraída aplicando o modelo e devolve tudo
// o que a tela exibe (arquivo SCI ou pendências + traço "Dados processados").
// Roda no navegador — ver o cabeçalho de apply-model.ts.
// ============================================================

import type { ExtractedTableInput } from '../tratamento-lancamentos'
import { applyModel, type Pendencia, type TraceRow } from './apply-model'
import { normalizeDefinition } from './normalize-definition'
import { parseData } from './parsers'

/** Colunas opcionais do De/Para que o modelo mapeou (viram colunas em "Dados processados"). */
export interface ColunasOpcionaisSci { participante: boolean; numeroNf: boolean; documento: boolean }

export interface ConversaoSci {
  /** Datas "dd/mm" sem ano e sem competência informada: a tela pede o ano e reconverte. */
  needsCompetenciaAno: boolean
  totalLancamentos: number
  pendencias: Pendencia[]
  /** Conteúdo do .txt (CRLF); null quando há pendências. */
  sciText: string | null
  fileName: string
  trace: TraceRow[]
  /** Linhas com status OK no traço. */
  okTotal: number
  colunasOpcionais: ColunasOpcionaisSci
}

/**
 * `definition` é a definição CRUA do banco (JSON): normalizada aqui, porque um
 * modelo salvo antes de um bloco existir (ex.: juros/descontos) não o traz.
 */
export function converterParaSci(
  table: ExtractedTableInput,
  definition: unknown,
  nomeModelo: string,
  competenciaAno?: number,
): ConversaoSci {
  const def = normalizeDefinition(definition)
  // Colunas opcionais do De/Para que o modelo mapeou → a aba "Dados processados"
  // mostra uma coluna para cada uma (mesmo que o valor venha vazio em algumas linhas).
  const colunasOpcionais = {
    participante: !!def.columnMapping.participante,
    numeroNf: !!def.columnMapping.numeroNf,
    documento: !!def.columnMapping.documento,
  }

  // Datas "dd/mm" sem ano (ex.: Sicoob): sem a competência informada, avisa a
  // tela para pedir o ano (popup) e reconverter — não gera o arquivo ainda.
  const dataCol = def.columnMapping.data
  const precisaAno = !competenciaAno && !!dataCol && table.rows.some((r) => parseData(r[dataCol]).semAno)
  if (precisaAno) {
    return { needsCompetenciaAno: true, totalLancamentos: 0, pendencias: [], sciText: null, fileName: '', trace: [], okTotal: 0, colunasOpcionais }
  }

  // Traço por-linha (como o modelo interpretou cada lançamento) → aba "Dados processados".
  const trace: TraceRow[] = []
  const result = applyModel(table, def, competenciaAno, trace)
  const safe = nomeModelo.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'lancamentos'
  return {
    needsCompetenciaAno: false,
    totalLancamentos: result.totalLancamentos,
    pendencias: result.pendencias,
    sciText: result.sciText,
    fileName: `SCI_${safe}.txt`,
    trace,
    okTotal: trace.reduce((n, t) => (t.status === 'ok' ? n + 1 : n), 0),
    colunasOpcionais,
  }
}
