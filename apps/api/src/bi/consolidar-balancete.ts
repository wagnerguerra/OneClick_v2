import { limparCnpj } from '@saas/types'
import type { SciBalanceteLinha } from '../cliente/sci.service'

/**
 * Consolidação do balancete de uma matriz com as filiais (06/10/2026).
 *
 * O SCI guarda matriz e filial como EMPRESAS diferentes (PRCODEMP 436 e 437 na
 * FINATTO), e o parâmetro PRCONSOLIDADA da procedure não junta as duas —
 * devolve só a empresa pedida (testado). O balancete que o contábil emite é o
 * consolidado, então a soma é nossa: conta a conta e por centro de custo,
 * somando saldo anterior, débitos, créditos, saldo atual e movimento.
 *
 * Nome da conta, tipo (analítica/sintética) e centro de custo vêm da primeira
 * empresa que tiver a conta — a matriz primeiro, por isso ela abre a lista.
 * O CNPJ das linhas consolidadas passa a ser o da matriz (é ela a dona do BI),
 * depois de conferir que todas as empresas são da MESMA RAIZ — um ID SCI
 * errado no cadastro não pode somar o balancete de outra empresa.
 */
export interface LoteBalancete {
  prcodemp: number
  linhas: SciBalanceteLinha[]
}

const raiz = (cnpj: string) => limparCnpj(cnpj).slice(0, 8)

export function consolidarBalancetes(cnpjMatriz: string, lotes: LoteBalancete[]): SciBalanceteLinha[] {
  const raizMatriz = raiz(cnpjMatriz)
  if (raizMatriz.length !== 8) throw new Error('CNPJ da matriz inválido para consolidar o balancete.')

  for (const lote of lotes) {
    const cnpjs = new Set(lote.linhas.map(l => limparCnpj(l.CNPJ_EMPRESA ?? '')).filter(Boolean))
    for (const c of cnpjs) {
      if (raiz(c) !== raizMatriz) {
        throw new Error(
          `O SCI devolveu, para a empresa ${lote.prcodemp}, o balancete do CNPJ ${c}, que não é da mesma raiz `
          + `da matriz (${raizMatriz}). Confira o ID SCI das filiais antes de consolidar.`,
        )
      }
    }
  }

  const somadas = new Map<string, SciBalanceteLinha>()
  for (const lote of lotes) {
    for (const l of lote.linhas) {
      const chave = `${String(l.CLASSIFICACAO ?? '').trim()}|${Number(l.CC_CODIGO ?? 0)}`
      const atual = somadas.get(chave)
      if (!atual) {
        somadas.set(chave, { ...l, CNPJ_EMPRESA: limparCnpj(cnpjMatriz) })
        continue
      }
      atual.BDSALDO_ANTERIOR = arred(Number(atual.BDSALDO_ANTERIOR) + Number(l.BDSALDO_ANTERIOR))
      atual.DEBITO = arred(Number(atual.DEBITO) + Number(l.DEBITO))
      atual.CREDITO = arred(Number(atual.CREDITO) + Number(l.CREDITO))
      atual.BDSALDO_ATUAL = arred(Number(atual.BDSALDO_ATUAL) + Number(l.BDSALDO_ATUAL))
      atual.BDMOVIMENTO = arred(Number(atual.BDMOVIMENTO) + Number(l.BDMOVIMENTO))
    }
  }
  return [...somadas.values()]
}

/** Centavos exatos: somar float acumula resíduo (0,1 + 0,2). */
const arred = (v: number) => Math.round(v * 100) / 100
