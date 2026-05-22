import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure, publicProcedure } from '../trpc/trpc.service'
import { createPesquisaSchema, responderPesquisaSchema } from '@saas/types'
import { PesquisaService } from './pesquisa.service'

const MODULE = 'pesquisas'

export function createPesquisaRouter(pesquisaService: PesquisaService) {
  return router({
    list: readProcedure(MODULE)
      .query(({ ctx }) => pesquisaService.list(ctx.empresaId)),

    getByOrcamento: readProcedure(MODULE)
      .input(z.object({ orcamentoId: z.string() }))
      .query(({ input }) => pesquisaService.getByOrcamento(input.orcamentoId)),

    create: writeProcedure(MODULE)
      .input(createPesquisaSchema)
      .mutation(({ input, ctx }) => pesquisaService.create(input, ctx.empresaId)),

    criarParaOrcamento: writeProcedure(MODULE)
      .input(z.object({ orcamentoId: z.string() }))
      .mutation(({ input, ctx }) => pesquisaService.criarParaOrcamento(input.orcamentoId, ctx.empresaId)),

    enviar: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => pesquisaService.enviar(input.id)),

    enviarPorEmail: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), destinatarios: z.array(z.string()).optional() }))
      .mutation(({ input }) => pesquisaService.enviarPorEmail(input.id, input.destinatarios)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => pesquisaService.delete(input.id)),

    getStats: readProcedure(MODULE)
      .query(({ ctx }) => pesquisaService.getStats(ctx.empresaId)),

    // Publico (sem login)
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(({ input }) => pesquisaService.getByToken(input.token)),

    responder: publicProcedure
      .input(responderPesquisaSchema)
      .mutation(({ input }) => pesquisaService.responder(input)),
  })
}
