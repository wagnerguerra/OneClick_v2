import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { DanfeService } from './danfe.service'
import { DanfeLoteService } from './danfe-lote.service'

const MODULE = 'danfe'

export function createDanfeRouter(svc: DanfeService, loteSvc: DanfeLoteService) {
  return router({
    list: readProcedure(MODULE).input(z.object({
      page:        z.coerce.number().int().min(1).default(1),
      limit:       z.coerce.number().int().min(1).max(100).default(30),
      search:      z.string().optional(),
      emitenteCnpj: z.string().optional(),
      destCnpjCpf: z.string().optional(),
      dataInicio:  z.string().optional(),
      dataFim:     z.string().optional(),
      status:      z.string().optional(),
      loteId:      z.string().optional(),
      clienteId:   z.string().optional(),
    }).optional())
      .query(({ input }) => svc.list(input ?? {})),

    getById: readProcedure(MODULE).input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getById(input.id)),

    getStats: readProcedure(MODULE)
      .query(() => svc.getStats()),

    // Galeria — clientes que têm DANFEs + listagem por cliente
    listClientesComDanfes: readProcedure(MODULE)
      .query(() => svc.listClientesComDanfes()),

    listGaleriaPorCliente: readProcedure(MODULE).input(z.object({
      clienteId:   z.string(),
      page:        z.coerce.number().int().min(1).default(1),
      limit:       z.coerce.number().int().min(1).max(1000).default(60),
      dataInicio:  z.string().optional(),
      dataFim:     z.string().optional(),
      status:      z.string().optional(),
      /** Competência no formato YYYY-MM — filtra dataEmissao no mês informado. */
      competencia: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }))
      .query(({ input }) => svc.listGaleriaPorCliente(input)),

    regerarPdf: writeProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.regerarPdf(input.id)),

    delete: deleteProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteOne(input.id)),

    // ── Lotes ─────────────────────────────────────────────────
    lote: router({
      list: readProcedure(MODULE).input(z.object({
        page:  z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }).optional())
        .query(({ input }) => loteSvc.list(input ?? {})),

      getById: readProcedure(MODULE).input(z.object({ id: z.string() }))
        .query(({ input }) => loteSvc.getById(input.id)),

      cancel: writeProcedure(MODULE).input(z.object({ id: z.string() }))
        .mutation(({ input }) => loteSvc.cancel(input.id)),

      reprocessarErros: writeProcedure(MODULE).input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => loteSvc.reprocessarErros(input.id, {
          uploadedById: ctx.userId!,
          empresaId: ctx.empresaId,
        })),
    }),
  })
}
