import { z } from 'zod'
import { router, readProcedure, writeProcedure, writeSubProcedure, deleteProcedure, publicProcedure } from '../trpc/trpc.service'
import { createPesquisaSchema, responderPesquisaSchema, salvarModeloPesquisaSchema, responderEnvioSchema } from '@saas/types'
import { PesquisaService } from './pesquisa.service'

const MODULE = 'pesquisas'
const ORC = 'orcamentos' // sub-permissões gerir_pesquisas / enviar_pesquisa vivem no módulo de orçamentos

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

    // ── NOVO: pesquisa configurável e versionada ──────────────────────
    getModeloAtivo: readProcedure(ORC)
      .query(({ ctx }) => pesquisaService.getModeloAtivo(ctx.empresaId)),

    listVersoes: readProcedure(ORC)
      .query(({ ctx }) => pesquisaService.listVersoes(ctx.empresaId)),

    salvarModelo: writeSubProcedure(ORC, 'gerir_pesquisas', 'Gerir pesquisa de satisfação')
      .input(salvarModeloPesquisaSchema)
      .mutation(({ input, ctx }) => pesquisaService.salvarModelo(input, ctx.userId, ctx.empresaId)),

    prepararEnvio: writeSubProcedure(ORC, 'enviar_pesquisa', 'Enviar pesquisa de satisfação')
      .input(z.object({ orcamentoId: z.string() }))
      .mutation(({ input, ctx }) => pesquisaService.prepararEnvio(input.orcamentoId, ctx.userId, ctx.empresaId)),

    enviarPesquisaPorEmail: writeSubProcedure(ORC, 'enviar_pesquisa', 'Enviar pesquisa de satisfação')
      .input(z.object({ orcamentoId: z.string(), destinatarios: z.array(z.string()).optional() }))
      .mutation(({ input, ctx }) => pesquisaService.enviarPesquisaPorEmail(input.orcamentoId, input.destinatarios, ctx.userId, ctx.empresaId)),

    getResumoPorOrcamento: readProcedure(ORC)
      .input(z.object({ orcamentoId: z.string() }))
      .query(({ input }) => pesquisaService.getResumoPorOrcamento(input.orcamentoId)),

    reportPesquisa: readProcedure(ORC)
      .input(z.object({ dias: z.number().int().nullable().optional() }))
      .query(({ input, ctx }) => pesquisaService.reportPesquisa(input.dias ?? null, ctx.empresaId)),

    // Público (sem login) — fluxo novo
    getEnvioPorToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(({ input }) => pesquisaService.getEnvioPorToken(input.token)),

    responderEnvio: publicProcedure
      .input(responderEnvioSchema)
      .mutation(({ input }) => pesquisaService.responderEnvio(input)),
  })
}
