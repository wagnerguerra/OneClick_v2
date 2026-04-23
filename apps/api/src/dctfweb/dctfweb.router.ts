import { z } from 'zod'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import { DctfwebService } from './dctfweb.service'
import { paginationSchema } from '@saas/types'

const MODULE = 'obrigacoes-dctfweb'

export function createDctfwebRouter(service: DctfwebService) {
  return router({
    // ── Sincronização ────────────────────────────────────

    sincronizar: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        competencia: z.string().min(6), // MM/YYYY
        clienteId: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => service.sincronizar(input.documento, input.competencia, {
        clienteId: input.clienteId,
        userId: ctx.userId,
      })),

    sincronizarLote: writeProcedure(MODULE)
      .input(z.object({ competencia: z.string().min(6), clienteIds: z.array(z.string()).optional() }))
      .mutation(({ input, ctx }) => service.sincronizarLote(input.competencia, ctx.userId, input.clienteIds)),

    // ── PDFs ─────────────────────────────────────────────

    relatorio: readProcedure(MODULE)
      .input(z.object({ documento: z.string().min(11), competencia: z.string().min(6) }))
      .query(({ input }) => service.consultarRelatorio(input.documento, input.competencia)),

    recibo: readProcedure(MODULE)
      .input(z.object({ documento: z.string().min(11), competencia: z.string().min(6) }))
      .query(({ input }) => service.consultarRecibo(input.documento, input.competencia)),

    guia: writeProcedure(MODULE)
      .input(z.object({ documento: z.string().min(11), competencia: z.string().min(6) }))
      .mutation(({ input }) => service.gerarGuia(input.documento, input.competencia)),

    // ── Atualização manual ───────────────────────────────

    atualizarManual: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        esocialFechado: z.boolean().optional(),
        reinfFechado: z.boolean().optional(),
        darfEmitido: z.boolean().optional(),
        darfPago: z.boolean().optional(),
        valorDarf: z.number().optional(),
        dataPagamento: z.string().optional(),
        dataVencimento: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => {
        const { id, ...dados } = input
        return service.atualizarManual(id, dados, ctx.userId)
      }),

    // ── Pós-entrega ────────────────────────────────────────

    atualizarFechamento: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        dataUltimoFechamentoEsocial: z.string().optional(),
        dataUltimoFechamentoReinf: z.string().optional(),
        dataUltimaAtualizacaoMit: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => {
        const { id, ...dados } = input
        return service.atualizarFechamento(id, dados, ctx.userId)
      }),

    marcarRetificadoraOk: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.marcarRetificadoraOk(input.id, ctx.userId)),

    // ── Listagem ─────────────────────────────────────────

    list: readProcedure(MODULE)
      .input(paginationSchema.extend({
        competencia: z.string().optional(),
        statusProcesso: z.string().optional(),
        nivelAlerta: z.string().optional(),
        statusPosEntrega: z.string().optional(),
      }))
      .query(({ input }) => service.list(input)),

    totalizadores: readProcedure(MODULE)
      .input(z.object({ competencia: z.string().optional() }).optional())
      .query(({ input }) => service.totalizadores(input?.competencia)),

    // ── Logs ─────────────────────────────────────────────

    logs: readProcedure(MODULE)
      .input(z.object({ documento: z.string().optional(), competencia: z.string().optional() }).optional())
      .query(({ input }) => service.listarLogs(input?.documento, input?.competencia)),

    // ── Clientes ─────────────────────────────────────────

    clientesMensais: readProcedure(MODULE)
      .query(() => service.listarClientesMensais()),
  })
}
