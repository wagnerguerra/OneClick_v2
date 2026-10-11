import { EMPTY_TREATMENT_DEFINITION, type TreatmentDefinition, type ContrapartidaRule } from '../tratamento-lancamentos'

/**
 * Normaliza a definição vinda do banco para o formato atual. Tolerante a
 * modelos antigos cuja contrapartida era { modo, itens } (só o modo ativo), cujos
 * arrays (mapa/palavraChave/descricao) estavam ausentes ou que não têm blocos
 * criados depois deles (ex.: juros/descontos). Garante que toda lista existe —
 * usado pela conversão, pelo editor, pela exportação e pelo diff/visão geral do
 * histórico (snapshots antigos quebravam por terem campos ausentes).
 */
export function normalizeDefinition(raw: unknown): TreatmentDefinition {
  const base = EMPTY_TREATMENT_DEFINITION
  if (!raw || typeof raw !== 'object') return base
  const r = raw as {
    contaCorrente?: unknown // legado (modelos antigos com conta única em string)
    contasCorrentes?: unknown
    columnMapping?: Partial<TreatmentDefinition['columnMapping']>
    aceitaVazio?: Partial<TreatmentDefinition['aceitaVazio']>
    debitoCredito?: unknown
    jurosDescontos?: Partial<TreatmentDefinition['jurosDescontos']>
    contrapartida?: { modo?: string; itens?: unknown[]; palavraChave?: unknown[]; descricao?: unknown[] }
  }
  const cp = r.contrapartida
  const modo: ContrapartidaRule['modo'] = cp?.modo === 'PALAVRA_CHAVE' ? 'PALAVRA_CHAVE' : 'DESCRICAO'
  const asPC = (a?: unknown[]) => (Array.isArray(a) ? (a as unknown as ContrapartidaRule['palavraChave']) : [])
  const asDesc = (a?: unknown[]) => (Array.isArray(a) ? (a as unknown as ContrapartidaRule['descricao']) : [])
  const contrapartida: ContrapartidaRule = cp && Array.isArray(cp.itens)
    ? { modo, palavraChave: modo === 'PALAVRA_CHAVE' ? asPC(cp.itens) : [], descricao: modo === 'DESCRICAO' ? asDesc(cp.itens) : [] }
    : { modo, palavraChave: asPC(cp?.palavraChave), descricao: asDesc(cp?.descricao) }
  const dcRaw = r.debitoCredito as { tipo?: string; coluna?: unknown; mapa?: unknown[] } | undefined
  const debitoCredito: TreatmentDefinition['debitoCredito'] = {
    tipo: dcRaw?.tipo === 'DESCRICAO' ? 'DESCRICAO' : dcRaw?.tipo === 'SINAL' ? 'SINAL' : 'COLUNA',
    coluna: typeof dcRaw?.coluna === 'string' ? dcRaw.coluna : '',
    mapa: Array.isArray(dcRaw?.mapa) ? (dcRaw!.mapa as unknown as TreatmentDefinition['debitoCredito']['mapa']) : [],
  }
  const ccRaw = r.contasCorrentes as { modo?: string; unica?: unknown; coluna?: unknown; mapa?: unknown[] } | undefined
  const contasCorrentes: TreatmentDefinition['contasCorrentes'] = ccRaw
    ? {
        modo: ccRaw.modo === 'MULTIPLAS' ? 'MULTIPLAS' : 'UNICA',
        unica: typeof ccRaw.unica === 'string' ? ccRaw.unica : '',
        coluna: typeof ccRaw.coluna === 'string' ? ccRaw.coluna : '',
        mapa: Array.isArray(ccRaw.mapa) ? (ccRaw.mapa as unknown as TreatmentDefinition['contasCorrentes']['mapa']) : [],
      }
    // Migração de modelos antigos: contaCorrente (string) → conta única.
    : { modo: 'UNICA', unica: typeof r.contaCorrente === 'string' ? r.contaCorrente : '', coluna: '', mapa: [] }
  // Juros/descontos: bloco opcional (modelos antigos não têm → default inativo).
  const jurosDescontos: TreatmentDefinition['jurosDescontos'] = { ...base.jurosDescontos, ...(r.jurosDescontos ?? {}) }
  return {
    contasCorrentes,
    columnMapping: { ...base.columnMapping, ...(r.columnMapping ?? {}) },
    // Colunas opcionais que aceitam vazio: bloco opcional (antigos → nenhuma).
    aceitaVazio: { ...base.aceitaVazio, ...(r.aceitaVazio ?? {}) },
    debitoCredito,
    jurosDescontos,
    contrapartida,
  }
}
