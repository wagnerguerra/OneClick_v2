import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { DteService } from './dte.service'

const MODULE = 'clientes' // usa permissão do módulo de clientes

export function createDteRouter(dteService: DteService) {
  return router({
    // Listar mensagens (filtro por clienteId ou documento)
    listMensagens: readProcedure(MODULE)
      .input(z.object({
        clienteId: z.string().optional(),
        documento: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ input }) => dteService.listMensagens(input)),

    // Estatísticas gerais
    getStats: readProcedure(MODULE)
      .query(() => dteService.getStats()),

    // Marcar mensagem como lida
    marcarLida: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => dteService.marcarLida(input.id)),

    // Deletar mensagem
    deleteMensagem: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => dteService.deleteMensagem(input.id)),

    // Sincronizar todos os clientes (via Puppeteer + SEFAZ ES)
    sincronizarTodos: writeProcedure(MODULE)
      .mutation(() => dteService.sincronizarTodos()),

    // Progresso da sincronização
    getSyncProgress: readProcedure(MODULE)
      .query(() => dteService.getSyncProgress()),

    // Sincronizar um cliente específico
    sincronizarCliente: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), documento: z.string() }))
      .mutation(({ input }) => dteService.sincronizarCliente(input.clienteId, input.documento)),
  })
}
