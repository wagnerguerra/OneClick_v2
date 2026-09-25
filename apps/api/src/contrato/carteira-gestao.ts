import { prisma } from '@saas/db'

/**
 * Carteira recorrente do escritório, lida da GESTÃO DE CONTRATOS
 * (`cliente_contrato_params`) — fonte do MRR e da aba Contratos do /comercial.
 *
 * Decisão do Wagner (25/09/2026): a tabela `contratos` (módulo Contratos)
 * praticamente não é usada — 4 registros, 2 rascunhos — e deixava MRR e
 * carteira zerados. O honorário mensal de cada cliente está na Gestão de
 * Contratos (29 clientes, R$ 99.231,18/mês em set/2026).
 *
 * Entra na carteira o mesmo recorte da tela /comercial/gestao-contratos:
 * cliente não inativo, fora dos "ignorados", com honorário maior que zero.
 */

export type SituacaoVigencia = 'VIGENTE' | 'VENCIDO' | 'SEM_VIGENCIA'

export interface ItemCarteira {
  id: string
  clienteId: string
  cliente: string
  numero: string | null
  honorario: number
  dataInicio: Date | null
  dataFim: Date | null
  permanente: boolean
  responsavelId: string | null
  dataEntrada: Date | null
  dataSaida: Date | null
}

/** Vigência do contrato: permanente ou com fim no futuro = vigente. */
export function situacaoVigencia(i: { permanente: boolean; dataFim: Date | null }, agora: Date = new Date()): SituacaoVigencia {
  if (i.permanente) return 'VIGENTE'
  if (!i.dataFim) return 'SEM_VIGENCIA'
  return i.dataFim >= agora ? 'VIGENTE' : 'VENCIDO'
}

/**
 * `naData`: a carteira como estava naquele dia — clientes que já tinham entrado
 * (data de entrada até a data, ou sem data) e ainda não tinham saído (não
 * inativos, ou inativos com saída depois da data). O honorário é o de HOJE: a
 * Gestão de Contratos não guarda histórico de valor. Sem `naData`, a carteira
 * atual.
 */
export async function carteiraRecorrente(empresaId?: string | null, naData?: Date): Promise<ItemCarteira[]> {
  const cliente = naData
    ? {
        AND: [
          { OR: [{ status: { not: 'INATIVO' as const } }, { dataSaida: { gt: naData } }] },
          { OR: [{ dataEntrada: null }, { dataEntrada: { lte: naData } }] },
        ],
      }
    : { status: { not: 'INATIVO' as const } }
  const rows = await prisma.clienteContratoParam.findMany({
    where: {
      honorario: { gt: 0 },
      gestaoIgnorar: false,
      ...(empresaId ? { empresaId } : {}),
      cliente,
    },
    select: {
      id: true, clienteId: true, honorario: true, numero: true, dataInicio: true, dataFim: true,
      permanente: true, responsavelId: true,
      cliente: { select: { razaoSocial: true, dataEntrada: true, dataSaida: true } },
    },
  })
  return rows.map(r => ({
    id: r.id,
    clienteId: r.clienteId,
    cliente: r.cliente.razaoSocial,
    numero: r.numero,
    honorario: r.honorario,
    dataInicio: r.dataInicio,
    dataFim: r.dataFim,
    permanente: r.permanente,
    responsavelId: r.responsavelId,
    dataEntrada: r.cliente.dataEntrada,
    dataSaida: r.cliente.dataSaida,
  }))
}
