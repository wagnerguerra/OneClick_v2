import { z } from 'zod'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import { ObrigacaoService } from './obrigacao.service'
import { listObrigacoesSchema, createObrigacaoSchema } from '@saas/types'

const MODULE = 'obrigacoes'

export function createObrigacaoRouter(obrigacaoService: ObrigacaoService) {
  return router({
    list: readProcedure(MODULE)
      .input(listObrigacoesSchema)
      .query(({ input }) => obrigacaoService.listObrigacoes(input)),

    stats: readProcedure(MODULE)
      .query(() => obrigacaoService.getStats()),

    calendario: readProcedure(MODULE)
      .input(z.object({ ano: z.coerce.number().int().min(2000).max(2100) }))
      .query(({ input }) => obrigacaoService.getCalendario(input.ano)),

    toggleAtivo: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => obrigacaoService.toggleAtivo(input.id)),

    create: writeProcedure(MODULE)
      .input(createObrigacaoSchema)
      .mutation(({ input }) => obrigacaoService.createObrigacao(input)),

    auditar: readProcedure(MODULE)
      .input(z.object({ mesesHistorico: z.coerce.number().int().min(12).max(120).optional() }).optional())
      .query(({ input }) => obrigacaoService.auditar(input)),

    aplicarSugestao: writeProcedure(MODULE)
      .input(z.object({
        obrigacaoId: z.string(),
        ajuste: z.enum(['MANTER', 'ANTECIPAR', 'POSTERGAR']),
      }))
      .mutation(({ input }) => obrigacaoService.aplicarSugestao(input.obrigacaoId, input.ajuste)),
  })
}
