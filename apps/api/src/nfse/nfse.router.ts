import { z } from 'zod'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import type { NfseDistService } from '../nfse-dist/nfse-dist.service'

/**
 * Router NFS-e para galeria/listagem — espelha o `danfe.router` mas pra NotaServicoImportada.
 * Permissão reusa 'cliente' (quem edita cliente pode ver suas notas).
 */
const MODULE = 'cliente'

export function createNfseRouter(distSvc: NfseDistService) {
  return router({
    /** Cards de resumo da tela /nfse: total, por status e do mês corrente. [QA #44] */
    getStats: readProcedure(MODULE).query(async () => {
      const inicioMes = new Date()
      inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
      const [total, emitidas, canceladas, mes] = await Promise.all([
        prisma.notaServicoImportada.count(),
        prisma.notaServicoImportada.count({ where: { status: 'EMITIDA' } }),
        prisma.notaServicoImportada.count({ where: { status: 'CANCELADA' } }),
        prisma.notaServicoImportada.count({ where: { dataEmissao: { gte: inicioMes } } }),
      ])
      return { total, emitidas, canceladas, mes }
    }),

    /**
     * Agrega NotaServicoImportada por cliente — retorno equivalente ao
     * `danfe.listClientesComDanfes` mas pra NFS-e.
     */
    listClientesComNotas: readProcedure(MODULE).query(async () => {
      const rows = await prisma.notaServicoImportada.groupBy({
        by: ['clienteId'],
        _count: { _all: true },
        _sum: { valorServicos: true },
        _max: { dataEmissao: true },
      })
      if (rows.length === 0) return []

      const ids = rows.map((r) => r.clienteId).filter((id): id is string => !!id)
      const clientes = ids.length > 0
        ? await prisma.cliente.findMany({
            where: { id: { in: ids } },
            select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true },
          })
        : []
      const map = new Map(clientes.map((c) => [c.id, c]))

      return rows
        .map((r) => {
          if (r.clienteId === null) {
            return {
              clienteId: null,
              razaoSocial: 'Sem cliente vinculado',
              nomeFantasia: null,
              documento: '',
              totalNotas: r._count?._all ?? 0,
              valorTotal: r._sum?.valorServicos ? r._sum.valorServicos.toString() : null,
              ultimaNota: r._max?.dataEmissao ?? null,
            }
          }
          const c = map.get(r.clienteId)
          if (!c) return null
          return {
            clienteId: c.id,
            razaoSocial: c.razaoSocial,
            nomeFantasia: c.nomeFantasia,
            documento: c.documento,
            totalNotas: r._count?._all ?? 0,
            valorTotal: r._sum?.valorServicos ? r._sum.valorServicos.toString() : null,
            ultimaNota: r._max?.dataEmissao ?? null,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => (b.ultimaNota?.getTime() ?? 0) - (a.ultimaNota?.getTime() ?? 0))
    }),

    /**
     * Lista NFS-e de um cliente pra galeria. Aceita clienteId='__null__' pra
     * listar notas sem cliente vinculado.
     */
    listGaleriaPorCliente: readProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        status: z.string().optional(),
        /** Competência no formato YYYY-MM. */
        competencia: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      }))
      .query(async ({ input }) => {
        const page = input.page ?? 1
        const limit = Math.min(input.limit ?? 60, 1000)
        const skip = (page - 1) * limit

        const where: Record<string, unknown> = input.clienteId === '__null__'
          ? { clienteId: null }
          : { clienteId: input.clienteId }
        if (input.status) where.status = input.status

        if (input.competencia) {
          const [y, m] = input.competencia.split('-').map(Number)
          const inicio = new Date(y!, m! - 1, 1)
          const fim = new Date(y!, m!, 1)
          where.dataEmissao = { gte: inicio, lt: fim }
        } else if (input.dataInicio || input.dataFim) {
          const range: Record<string, Date> = {}
          if (input.dataInicio) range.gte = new Date(input.dataInicio)
          if (input.dataFim) range.lte = new Date(input.dataFim)
          where.dataEmissao = range
        }

        const [rows, total] = await Promise.all([
          prisma.notaServicoImportada.findMany({
            where,
            orderBy: { dataEmissao: 'desc' },
            skip,
            take: limit,
            select: {
              id: true, chave: true, numero: true, serie: true,
              prestadorRazao: true, prestadorCnpj: true,
              tomadorRazao: true, tomadorCnpjCpf: true,
              valorServicos: true, valorLiquido: true,
              dataEmissao: true, status: true,
              pdfKey: true, pdfOficial: true, padrao: true,
            },
          }),
          prisma.notaServicoImportada.count({ where }),
        ])

        // Decimal → string pra serialização JSON + origem normalizada.
        // - 'NACIONAL'       → ADN gov.br (API)
        // - 'MUNICIPAL_XXXX' → leiaute municipal direto
        // - 'UPLOAD_MANUAL'  → upload manual
        function classificaOrigem(padrao: string): 'nfse-adn' | 'nfse-municipal' | 'manual' {
          if (padrao === 'NACIONAL') return 'nfse-adn'
          if (padrao === 'UPLOAD_MANUAL') return 'manual'
          if (padrao.startsWith('MUNICIPAL_')) return 'nfse-municipal'
          return 'manual'
        }

        const data = rows.map((r) => ({
          ...r,
          valorServicos: r.valorServicos.toString(),
          valorLiquido: r.valorLiquido ? r.valorLiquido.toString() : null,
          origem: classificaOrigem(r.padrao),
        }))

        return {
          data, total, page, limit,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        }
      }),

    /**
     * Re-tenta baixar o DANFSe oficial pra uma nota. Útil quando a nota foi
     * processada com PDF auxiliar (API gov.br estava fora) e agora queremos o oficial.
     */
    regerarPdf: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => distSvc.regerarPdf(input.id)),
  })
}
