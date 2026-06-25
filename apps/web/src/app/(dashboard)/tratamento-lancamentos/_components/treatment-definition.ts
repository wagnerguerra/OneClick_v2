import type { TreatmentDefinition, ContrapartidaRule } from '@saas/types'
import { EMPTY_TREATMENT_DEFINITION } from '@saas/types'

/**
 * Normaliza a definição vinda do banco para o formato atual. Tolerante a
 * modelos antigos cuja contrapartida era { modo, itens } (só o modo ativo) ou
 * cujos arrays (mapa/palavraChave/descricao) estavam ausentes. Garante que toda
 * lista existe — usado pelo editor E pelo diff/visão geral do histórico (snapshots
 * antigos quebravam o diff por terem campos não-iteráveis).
 */
export function normalizeDefinition(raw: unknown): TreatmentDefinition {
  const base = EMPTY_TREATMENT_DEFINITION
  if (!raw || typeof raw !== 'object') return base
  const r = raw as {
    contaCorrente?: unknown
    columnMapping?: Partial<TreatmentDefinition['columnMapping']>
    entradaSaida?: unknown
    contrapartida?: { modo?: string; itens?: unknown[]; palavraChave?: unknown[]; descricao?: unknown[] }
  }
  const cp = r.contrapartida
  const modo: ContrapartidaRule['modo'] = cp?.modo === 'PALAVRA_CHAVE' ? 'PALAVRA_CHAVE' : 'DESCRICAO'
  const asPC = (a?: unknown[]) => (Array.isArray(a) ? (a as unknown as ContrapartidaRule['palavraChave']) : [])
  const asDesc = (a?: unknown[]) => (Array.isArray(a) ? (a as unknown as ContrapartidaRule['descricao']) : [])
  const contrapartida: ContrapartidaRule = cp && Array.isArray(cp.itens)
    ? { modo, palavraChave: modo === 'PALAVRA_CHAVE' ? asPC(cp.itens) : [], descricao: modo === 'DESCRICAO' ? asDesc(cp.itens) : [] }
    : { modo, palavraChave: asPC(cp?.palavraChave), descricao: asDesc(cp?.descricao) }
  const esRaw = r.entradaSaida as { tipo?: string; coluna?: unknown; mapa?: unknown[] } | undefined
  const entradaSaida: TreatmentDefinition['entradaSaida'] = {
    tipo: esRaw?.tipo === 'DESCRICAO' ? 'DESCRICAO' : 'COLUNA',
    coluna: typeof esRaw?.coluna === 'string' ? esRaw.coluna : '',
    mapa: Array.isArray(esRaw?.mapa) ? (esRaw!.mapa as unknown as TreatmentDefinition['entradaSaida']['mapa']) : [],
  }
  return {
    contaCorrente: typeof r.contaCorrente === 'string' ? r.contaCorrente : base.contaCorrente,
    columnMapping: { ...base.columnMapping, ...(r.columnMapping ?? {}) },
    entradaSaida,
    contrapartida,
  }
}
