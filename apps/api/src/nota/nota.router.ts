import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { NotaService } from './nota.service'

// Notas pessoais: só exige autenticação (protectedProcedure), sem módulo/permissão.
export function createNotaRouter(service: NotaService) {
  return router({
    list: protectedProcedure
      .input(z.object({ incluirArquivadas: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => service.list(ctx.userId!, input?.incluirArquivadas ?? false)),

    create: protectedProcedure
      .input(z.object({
        titulo: z.string().nullable().optional(),
        conteudo: z.string().optional(),
        cor: z.string().optional(),
        fixado: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => service.create(ctx.userId!, input)),

    update: protectedProcedure
      .input(z.object({
        id: z.string(),
        titulo: z.string().nullable().optional(),
        conteudo: z.string().nullable().optional(),
        cor: z.string().optional(),
        fixado: z.boolean().optional(),
        arquivado: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => {
        const { id, ...rest } = input
        return service.update(ctx.userId!, id, rest)
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.remove(ctx.userId!, input.id)),
  })
}
