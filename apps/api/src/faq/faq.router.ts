import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { FaqService } from './faq.service'

/**
 * Router do FAQ editável. Leitura (`list`/`getBySlug`) liberada a qualquer
 * usuário logado; mutações restritas a master/empresa-master (gate abaixo).
 */
export function createFaqRouter(faqService: FaqService) {
  const masterProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o usuário master pode gerenciar o FAQ.' })
    }
    return next()
  })

  const artigoInput = z.object({
    slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'O slug deve ser kebab-case (letras minúsculas, números e hífen).'),
    titulo: z.string().min(1),
    descricao: z.string().default(''),
    modulo: z.string().min(1),
    moduloColor: z.string().min(1),
    icon: z.string().default('HelpCircle'),
    categoria: z.string().min(1),
    tags: z.array(z.string()).default([]),
    conteudoHtml: z.string().default(''),
    publicado: z.boolean().default(true),
    ordem: z.number().int().default(0),
  })

  return router({
    list: protectedProcedure.query(({ ctx }) => faqService.list(!!(ctx.isMaster || ctx.isEmpresaMaster))),

    getBySlug: protectedProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => faqService.getBySlug(input.slug)),

    create: masterProcedure
      .input(artigoInput)
      .mutation(({ input, ctx }) => faqService.create(input, ctx.userId)),

    update: masterProcedure
      .input(z.object({ id: z.string() }).merge(artigoInput.partial()))
      .mutation(({ input }) => {
        const { id, ...data } = input
        return faqService.update(id, data)
      }),

    delete: masterProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => faqService.delete(input.id)),

    setPublicado: masterProcedure
      .input(z.object({ id: z.string(), publicado: z.boolean() }))
      .mutation(({ input }) => faqService.setPublicado(input.id, input.publicado)),

    reordenar: masterProcedure
      .input(z.object({ items: z.array(z.object({ id: z.string(), ordem: z.number().int() })) }))
      .mutation(({ input }) => faqService.reordenar(input.items)),

    upsertOverride: masterProcedure
      .input(artigoInput)
      .mutation(({ input, ctx }) => faqService.upsertOverride(input, ctx.userId)),
  })
}
