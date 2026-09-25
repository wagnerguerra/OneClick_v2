import { prisma } from '@saas/db'
import { dataDoContrato } from '../crm/indicadores-comerciais'

/**
 * Contratos fechados A PARTIR DE ORÇAMENTOS — a fonte única de "contrato
 * assinado/efetivado" do Painel Comercial.
 *
 * Decisão do Wagner (25/09/2026): contrato assinado vem dos orçamentos, não do
 * módulo Contratos. Um orçamento vira contrato quando:
 *  - foi marcado como "contrato fechado" no painel (vale a data informada), ou
 *  - sem a marca, foi aprovado com um serviço de entrada de novo cliente
 *    (Servico.entradaNovoCliente) — vale a data da aprovação.
 * Orçamento cancelado não conta.
 *
 * Antes desta função o funil do painel usava esta regra e o Funil unificado e
 * o Ranking de vendedores contavam a tabela `contratos` (vazia na prática) —
 * a mesma tela mostrava "Contratos assinados: 3" e "Contratos efetivados: 0".
 */

export interface ContratoDeOrcamento {
  orcamentoId: string
  responsavelId: string | null
  oportunidadeId: string | null
  em: Date
}

/** IDs dos serviços de entrada de novo cliente visíveis para a empresa. */
export async function servicosDeEntrada(empresaId?: string | null): Promise<Set<string>> {
  const rows = await prisma.servico.findMany({
    where: { entradaNovoCliente: true, ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}) },
    select: { id: true },
  })
  return new Set(rows.map(s => s.id))
}

/** O orçamento tem serviço de entrada (no modelo ou em algum item)? */
export function temServicoDeEntrada(
  o: { servicoId: string | null; itens: Array<{ catalogoId: string | null }> },
  entrada: Set<string>,
): boolean {
  return (!!o.servicoId && entrada.has(o.servicoId)) || o.itens.some(i => !!i.catalogoId && entrada.has(i.catalogoId))
}

export async function contratosDeOrcamento(
  empresaId: string | null | undefined,
  quando: { gte?: Date; lte?: Date } | undefined,
  entrada?: Set<string>,
): Promise<ContratoDeOrcamento[]> {
  const ent = entrada ?? await servicosDeEntrada(empresaId)
  // Candidatos: marcados como fechados OU aprovados no período. Quem decide a
  // data (e se conta) é `dataDoContrato`.
  const candidatos = await prisma.orcamento.findMany({
    where: {
      ...(empresaId ? { empresaId } : {}),
      status: { not: 'CANCELADO' },
      OR: [{ contratoFechadoEm: quando ?? { not: null } }, { dtAprovado: quando ?? { not: null } }],
    },
    select: {
      id: true, dtAprovado: true, contratoFechadoEm: true, responsavelId: true, oportunidadeId: true,
      servicoId: true, itens: { select: { catalogoId: true } },
    },
  })
  const out: ContratoDeOrcamento[] = []
  for (const o of candidatos) {
    const em = dataDoContrato(o, temServicoDeEntrada(o, ent))
    if (!em) continue
    if (quando?.gte && em < quando.gte) continue
    if (quando?.lte && em > quando.lte) continue
    out.push({ orcamentoId: o.id, responsavelId: o.responsavelId, oportunidadeId: o.oportunidadeId, em })
  }
  return out
}
