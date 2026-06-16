import { z } from 'zod'
import {
  router, readProcedure, writeProcedure, writeSubProcedure, deleteSubProcedure,
} from '../trpc/trpc.service'
import {
  createBeneficioCatalogoSchema, updateBeneficioCatalogoSchema,
  createBeneficioVinculoSchema, updateBeneficioVinculoSchema,
  listBeneficioSchema,
} from '@saas/types'
import { BeneficioFiscalService } from './beneficio-fiscal.service'

const MODULE = 'beneficios-fiscais'

export function createBeneficioFiscalRouter(service: BeneficioFiscalService) {
  return router({
    // ── Dashboard + listagem de vínculos ──
    dashboard: readProcedure(MODULE)
      .query(({ ctx }) => service.dashboard(ctx.empresaId)),

    list: readProcedure(MODULE)
      .input(listBeneficioSchema.optional())
      .query(({ input, ctx }) => service.list(input ?? {}, ctx.empresaId)),

    // ── Opções pros seletores ──
    clienteOpcoes: readProcedure(MODULE)
      .query(({ ctx }) => service.clienteOpcoes(ctx.empresaId)),

    // ── Catálogo ──
    servicoOpcoes: readProcedure(MODULE)
      .query(({ ctx }) => service.servicoOpcoes(ctx.empresaId)),

    listCatalogo: readProcedure(MODULE)
      .input(z.object({ incluirInativos: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => service.listCatalogo(ctx.empresaId, input?.incluirInativos ?? false)),

    createCatalogo: writeSubProcedure(MODULE, 'manage_catalogo', 'Gerenciar catálogo de benefícios')
      .input(createBeneficioCatalogoSchema)
      .mutation(({ input, ctx }) => service.createCatalogo(input, ctx.empresaId)),

    updateCatalogo: writeSubProcedure(MODULE, 'manage_catalogo', 'Gerenciar catálogo de benefícios')
      .input(updateBeneficioCatalogoSchema)
      .mutation(({ input }) => {
        const { id, ...rest } = input
        return service.updateCatalogo(id, rest)
      }),

    removeCatalogo: writeSubProcedure(MODULE, 'manage_catalogo', 'Gerenciar catálogo de benefícios')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.removeCatalogo(input.id)),

    // ── Vínculos ──
    create: writeProcedure(MODULE)
      .input(createBeneficioVinculoSchema)
      .mutation(({ input, ctx }) => service.createVinculo(input, ctx.empresaId)),

    update: writeProcedure(MODULE)
      .input(updateBeneficioVinculoSchema)
      .mutation(({ input }) => {
        const { id, ...rest } = input
        return service.updateVinculo(id, rest)
      }),

    remove: deleteSubProcedure(MODULE, 'delete_beneficios', 'Excluir vínculos de benefício')
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.removeVinculo(input.id)),

    removeMany: deleteSubProcedure(MODULE, 'delete_beneficios', 'Excluir vínculos de benefício')
      .input(z.object({ ids: z.array(z.string()).min(1) }))
      .mutation(({ input }) => service.removeMany(input.ids)),

    // ── Auto-orçamento ──
    gerarOrcamento: writeSubProcedure(MODULE, 'gerar_orcamento', 'Gerar orçamento a partir do benefício')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.gerarOrcamento(input.id, ctx.userId ?? undefined, ctx.empresaId)),

    gerarOrcamentoMassa: writeSubProcedure(MODULE, 'gerar_orcamento', 'Gerar orçamento a partir do benefício')
      .input(z.object({ ids: z.array(z.string()).min(1) }))
      .mutation(({ input, ctx }) => service.gerarOrcamentoMassa(input.ids, ctx.userId ?? undefined, ctx.empresaId)),
  })
}
