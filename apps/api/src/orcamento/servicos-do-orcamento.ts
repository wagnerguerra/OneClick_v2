/**
 * Conclusão dos serviços × status do orçamento — regras puras.
 *
 * Até 28/09/2026, concluir a execução-raiz levava o orçamento de APROVADO a
 * LIBERADO em silêncio e logo a FINALIZADO: o financeiro não via o orçamento
 * passar pela liberação e deixava de faturar (caso do #4803). Agora o
 * colaborador conclui o SERVIÇO, não o orçamento:
 *
 *  - serviços concluídos com o orçamento APROVADO → ele fica em APROVADO, com
 *    o aviso "serviço concluído, aguardando liberação" para o financeiro;
 *  - o financeiro libera (APROVADO → LIBERADO) → com os serviços concluídos,
 *    o sistema finaliza na hora;
 *  - o financeiro liberou ANTES de o serviço terminar → o orçamento finaliza
 *    quando o último serviço concluir.
 *
 * "Serviços concluídos" = todas as execuções do orçamento (inclusive as
 * sucessoras da cadeia) em estado terminal, com ao menos uma concluída.
 */

/** Estados em que a execução não anda mais — os mesmos do Processo. */
export const EXECUCAO_TERMINAL = new Set(['CONCLUIDO', 'PULADO', 'CANCELADO'])

export interface SituacaoServicos {
  total: number
  concluidos: number
  todosConcluidos: boolean
  /** Quando o último terminou (o maior concluidoEm). */
  concluidoEm: Date | null
}

export function situacaoDosServicos(execucoes: Array<{ status: string; concluidoEm: Date | null }>): SituacaoServicos {
  const ativas = execucoes.filter(e => e.status !== 'CANCELADO')
  const concluidas = ativas.filter(e => e.status === 'CONCLUIDO')
  const todosConcluidos = concluidas.length > 0 && execucoes.every(e => EXECUCAO_TERMINAL.has(e.status))
  const datas = concluidas.map(e => e.concluidoEm?.getTime() ?? 0).filter(Boolean)
  return {
    total: ativas.length,
    concluidos: concluidas.length,
    todosConcluidos,
    concluidoEm: todosConcluidos && datas.length ? new Date(Math.max(...datas)) : null,
  }
}

export type AcaoAposServicos = 'FINALIZAR' | 'AGUARDAR_LIBERACAO' | 'NADA'

/** O que fazer com o orçamento quando os serviços mudam de situação. */
export function acaoAposServicos(statusOrcamento: string, todosConcluidos: boolean): AcaoAposServicos {
  if (!todosConcluidos) return 'NADA'
  if (statusOrcamento === 'LIBERADO') return 'FINALIZAR'
  if (statusOrcamento === 'APROVADO') return 'AGUARDAR_LIBERACAO'
  return 'NADA'
}
