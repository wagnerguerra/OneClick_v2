import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { QaService } from './qa.service'

/** Relatório de QA — master-only (ferramenta interna de /configuracoes). */
function assertMaster(ctx: { isMaster?: boolean }) {
  if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master' })
}

const statusSchema = z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CORRIGIDO', 'DESCARTADO'])
const severidadeSchema = z.enum(['ALTA', 'MEDIA', 'BAIXA'])

export function createQaRouter(service: QaService) {
  return router({
    list: protectedProcedure
      .input(z.object({
        status: statusSchema.optional(),
        modulo: z.string().optional(),
        severidade: severidadeSchema.optional(),
      }).optional())
      .query(({ input, ctx }) => {
        assertMaster(ctx)
        return service.list(input)
      }),

    resumo: protectedProcedure.query(({ ctx }) => {
      assertMaster(ctx)
      return service.resumo()
    }),

    update: protectedProcedure
      .input(z.object({
        id: z.string(),
        status: statusSchema.optional(),
        notas: z.string().nullable().optional(),
        severidade: severidadeSchema.optional(),
        titulo: z.string().min(1).optional(),
        descricao: z.string().nullable().optional(),
        fixProposto: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => {
        assertMaster(ctx)
        const { id, ...patch } = input
        return service.update(id, patch)
      }),

    create: protectedProcedure
      .input(z.object({
        modulo: z.string().min(1),
        severidade: severidadeSchema,
        titulo: z.string().min(1),
        descricao: z.string().nullable().optional(),
        arquivo: z.string().nullable().optional(),
        fixProposto: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => {
        assertMaster(ctx)
        return service.create(input)
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => {
        assertMaster(ctx)
        return service.remove(input.id)
      }),
  })
}
