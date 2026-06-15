import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { PainelTvService } from './painel-tv.service'

export function createPainelTvRouter(svc: PainelTvService) {
  // Gate master (igual ao padrão do Design System): só master/empresa-master
  // gerencia painéis. A exibição (resolve/getBySlug) fica em protectedProcedure.
  // Definido AQUI dentro (não no topo do módulo) p/ evitar o circular import com
  // trpc.service — `protectedProcedure` só existe após o service inicializar.
  const masterProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o master gerencia painéis.' })
    }
    return next()
  })

  return router({
    // ── Catálogo de métricas (builder) ──
    catalogo: masterProcedure.query(() => svc.catalogo()),

    // ── Leitura ──
    list: masterProcedure.query(() => svc.list()),
    getById: masterProcedure.input(z.object({ id: z.string() })).query(({ input }) => svc.getById(input.id)),

    // Exibição (TV): qualquer usuário logado; as fontes gateiam por módulo.
    getBySlug: protectedProcedure.input(z.object({ slug: z.string() })).query(({ input }) => svc.getBySlug(input.slug)),
    resolve: protectedProcedure.input(z.object({ slug: z.string() }))
      .query(({ input, ctx }) => svc.resolve(input.slug, { empresaId: ctx.empresaId, userId: ctx.userId, isMaster: ctx.isMaster })),

    // ── Painel CRUD ──
    createPainel: masterProcedure.input(z.object({
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug: minúsculas, números e hífen'),
      nome: z.string().min(1),
      accent: z.string().optional(),
      icon: z.string().nullable().optional(),
      slideMs: z.number().int().min(3000).max(120000).optional(),
      periodoDias: z.number().int().min(1).max(365).optional(),
    })).mutation(({ input }) => svc.createPainel(input)),

    updatePainel: masterProcedure.input(z.object({
      id: z.string(),
      data: z.object({
        slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
        nome: z.string().min(1).optional(),
        accent: z.string().optional(),
        icon: z.string().nullable().optional(),
        ativo: z.boolean().optional(),
        slideMs: z.number().int().min(3000).max(120000).optional(),
        periodoDias: z.number().int().min(1).max(365).optional(),
        ordem: z.number().int().optional(),
      }),
    })).mutation(({ input }) => svc.updatePainel(input.id, input.data)),

    deletePainel: masterProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => svc.deletePainel(input.id)),

    // ── Folha CRUD ──
    createFolha: masterProcedure.input(z.object({ painelId: z.string(), titulo: z.string().min(1), cols: z.number().int().min(1).max(12).optional() }))
      .mutation(({ input }) => svc.createFolha(input.painelId, { titulo: input.titulo, cols: input.cols })),
    updateFolha: masterProcedure.input(z.object({ id: z.string(), data: z.object({ titulo: z.string().optional(), cols: z.number().int().min(1).max(12).optional(), ordem: z.number().int().optional() }) }))
      .mutation(({ input }) => svc.updateFolha(input.id, input.data)),
    deleteFolha: masterProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => svc.deleteFolha(input.id)),
    reorderFolhas: masterProcedure.input(z.object({ ids: z.array(z.string()) })).mutation(({ input }) => svc.reorder('tv_folha', input.ids)),

    // ── Bloco CRUD ──
    createBloco: masterProcedure.input(z.object({ folhaId: z.string(), visual: z.string(), metricId: z.string(), config: z.any().optional() }))
      .mutation(({ input }) => svc.createBloco(input.folhaId, { visual: input.visual, metricId: input.metricId, config: input.config })),
    updateBloco: masterProcedure.input(z.object({ id: z.string(), data: z.object({ visual: z.string().optional(), metricId: z.string().optional(), config: z.any().optional(), ordem: z.number().int().optional() }) }))
      .mutation(({ input }) => svc.updateBloco(input.id, input.data)),
    deleteBloco: masterProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => svc.deleteBloco(input.id)),
    reorderBlocos: masterProcedure.input(z.object({ ids: z.array(z.string()) })).mutation(({ input }) => svc.reorder('tv_bloco', input.ids)),
  })
}
