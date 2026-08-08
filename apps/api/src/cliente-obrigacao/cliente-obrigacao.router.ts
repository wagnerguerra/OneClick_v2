import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { ClienteObrigacaoService } from './cliente-obrigacao.service'
import {
  aplicarTemplateSchema,
  addClienteObrigacaoSchema,
  updateClienteObrigacaoSchema,
} from '@saas/types'

const MODULE_CLIENTES = 'clientes'

export function createClienteObrigacaoRouter(svc: ClienteObrigacaoService) {
  return router({
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

    // ── Aplicar grupo (ServicoGrupo tipo=OBRIGACOES) ──────
    aplicarGrupo: writeProcedure(MODULE_CLIENTES)
      .input(aplicarTemplateSchema)
      .mutation(({ input, ctx }) => svc.aplicarGrupo(input, ctx.empresaId)),

    // ── Calendário de vencimentos do cliente ──────────────
    calendarioDoCliente: readProcedure(MODULE_CLIENTES)
      .input(z.object({
        clienteId: z.string(),
        ano: z.coerce.number().int().min(2000).max(2100),
      }))
      .query(({ input }) => svc.getCalendarioDoCliente(input.clienteId, input.ano)),
  })
}
