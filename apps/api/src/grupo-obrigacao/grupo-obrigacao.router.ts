import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { GrupoObrigacaoService } from './grupo-obrigacao.service'
import {
  listGruposObrigacaoSchema,
  createGrupoObrigacaoSchema,
  updateGrupoObrigacaoSchema,
  aplicarTemplateSchema,
  addClienteObrigacaoSchema,
  updateClienteObrigacaoSchema,
} from '@saas/types'

const MODULE_CFG = 'configuracoes'
const MODULE_CLIENTES = 'clientes'

export function createGrupoObrigacaoRouter(svc: GrupoObrigacaoService) {
  return router({
    // ── Templates ──────────────────────────────────────────
    list: readProcedure(MODULE_CFG)
      .input(listGruposObrigacaoSchema)
      .query(({ input, ctx }) => svc.listGrupos(input, ctx.empresaId)),

    stats: readProcedure(MODULE_CFG)
      .query(() => svc.getStats()),

    getById: readProcedure(MODULE_CFG)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getGrupo(input.id)),

    create: writeProcedure(MODULE_CFG)
      .input(createGrupoObrigacaoSchema)
      .mutation(({ input, ctx }) => svc.createGrupo(input, ctx.empresaId)),

    update: writeProcedure(MODULE_CFG)
      .input(updateGrupoObrigacaoSchema)
      .mutation(({ input }) => svc.updateGrupo(input.id, input.data)),

    delete: deleteProcedure(MODULE_CFG)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteGrupo(input.id)),

    bulkDelete: deleteProcedure(MODULE_CFG)
      .input(z.object({ ids: z.array(z.string()).min(1) }))
      .mutation(({ input }) => svc.bulkDeleteGrupos(input.ids)),

    // ── Cliente ↔ Obrigação ───────────────────────────────
    listDoCliente: readProcedure(MODULE_CLIENTES)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => svc.listObrigacoesDoCliente(input.clienteId)),

    addAoCliente: writeProcedure(MODULE_CLIENTES)
      .input(addClienteObrigacaoSchema)
      .mutation(({ input, ctx }) => svc.addObrigacaoCliente(input, ctx.empresaId)),

    updateDoCliente: writeProcedure(MODULE_CLIENTES)
      .input(updateClienteObrigacaoSchema)
      .mutation(({ input }) => svc.updateObrigacaoCliente(input.id, input.data)),

    removeDoCliente: deleteProcedure(MODULE_CLIENTES)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.removeObrigacaoCliente(input.id)),

    bulkRemoveDoCliente: deleteProcedure(MODULE_CLIENTES)
      .input(z.object({ ids: z.array(z.string()).min(1) }))
      .mutation(({ input }) => svc.bulkRemoveObrigacaoCliente(input.ids)),

    // ── Aplicar template ──────────────────────────────────
    aplicarTemplate: writeProcedure(MODULE_CLIENTES)
      .input(aplicarTemplateSchema)
      .mutation(({ input, ctx }) => svc.aplicarTemplate(input, ctx.empresaId)),

    // ── Recomendação automática ───────────────────────────
    recomendarParaCliente: readProcedure(MODULE_CLIENTES)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => svc.recomendarParaCliente(input.clienteId)),

    // ── Calendário de vencimentos do cliente ──────────────
    calendarioDoCliente: readProcedure(MODULE_CLIENTES)
      .input(z.object({
        clienteId: z.string(),
        ano: z.coerce.number().int().min(2000).max(2100),
      }))
      .query(({ input }) => svc.getCalendarioDoCliente(input.clienteId, input.ano)),
  })
}
