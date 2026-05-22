import type { Condicao, Regra, CampoCondicao } from '@saas/types'

/**
 * Contexto carregado do banco para avaliar condicoes de um encadeamento.
 * Os campos sao opcionais — se a aresta tem condicao referenciando algo
 * ausente, a regra retorna false (sucessor pulado).
 */
export interface ContextoCondicao {
  cliente: {
    regime: string | null
    situacao: string | null
    tributacao: string | null
    categoria: string | null
    tipoCliente: string | null
  } | null
  orcamento: {
    tipo: string | null
    totalGeral: unknown // Decimal — coerce com Number()
  } | null
}

function getValor(campo: CampoCondicao, ctx: ContextoCondicao): unknown {
  switch (campo) {
    case 'cliente.regime':       return ctx.cliente?.regime ?? null
    case 'cliente.situacao':     return ctx.cliente?.situacao ?? null
    case 'cliente.tributacao':   return ctx.cliente?.tributacao ?? null
    case 'cliente.categoria':    return ctx.cliente?.categoria ?? null
    case 'cliente.tipoCliente':  return ctx.cliente?.tipoCliente ?? null
    case 'orcamento.tipo':       return ctx.orcamento?.tipo ?? null
    case 'orcamento.valorTotal':
      // Decimal do Prisma vem como string em runtime — coerce explicito
      // (vide registry §2.5).
      return ctx.orcamento?.totalGeral != null
        ? Number(ctx.orcamento.totalGeral as string | number)
        : null
    default:                     return null
  }
}

function avaliarRegra(regra: Regra, ctx: ContextoCondicao): boolean {
  const v = getValor(regra.campo, ctx)
  switch (regra.op) {
    case 'eq':           return v === regra.valor
    case 'ne':           return v !== regra.valor
    case 'in':           return Array.isArray(regra.valor) && regra.valor.includes(v as never)
    case 'not_in':       return Array.isArray(regra.valor) && !regra.valor.includes(v as never)
    case 'is_null':      return v === null || v === undefined
    case 'is_not_null':  return v !== null && v !== undefined
    default:             return false
  }
}

/**
 * Avalia uma condicao contra o contexto. Sem condicao = sempre true (sucessor cria).
 *
 * Regra do `all`: todas precisam ser verdade (AND).
 * Regra do `any`: ao menos uma precisa ser verdade (OR).
 * Quando ambos estao presentes: `allOk && anyOk`.
 * Quando `any` esta presente mas vazio, eh ignorado (nao bloqueia).
 */
export function avaliarCondicao(
  condicao: Condicao | null | undefined,
  ctx: ContextoCondicao,
): boolean {
  if (!condicao) return true
  const allOk = !condicao.all || condicao.all.length === 0 || condicao.all.every(r => avaliarRegra(r, ctx))
  const anyOk = !condicao.any || condicao.any.length === 0 || condicao.any.some(r => avaliarRegra(r, ctx))
  return allOk && anyOk
}
