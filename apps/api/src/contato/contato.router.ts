import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, readProcedure, writeProcedure, hasSubPermission } from '../trpc/trpc.service'
import {
  criarContatoSchema, atualizarContatoSchema, excluirContatoSchema, listarContatosSchema,
} from '@saas/types'
import { ContatoService } from './contato.service'

const MODULE = 'contatos'

/** Agenda de Contatos (port do crp_contatos do v1). */
export function createContatoRouter(service: ContatoService) {
  const ctxDe = (ctx: { userId?: string | null; empresaId?: string | null; isMaster?: boolean; isEmpresaMaster?: boolean }) =>
    ({ userId: ctx.userId!, empresaId: ctx.empresaId, isMaster: !!(ctx.isMaster || ctx.isEmpresaMaster) })

  /**
   * Incluir/editar/excluir exigem a sub-permissão `gerenciar` — a agenda é de
   * consulta para todo mundo que tem leitura no módulo; a manutenção é liberada
   * caso a caso. Master/EmpresaMaster passam sempre (regra do hasSubPermission).
   */
  async function exigirGerenciar(ctx: { userId?: string | null; isMaster?: boolean; isEmpresaMaster?: boolean }) {
    const ok = await hasSubPermission(ctx.userId!, MODULE, 'gerenciar', {
      isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster,
    })
    if (!ok) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Você pode consultar a agenda, mas não tem liberação para incluir, editar ou excluir contatos.',
      })
    }
  }

  return router({
    listar: readProcedure(MODULE)
      .input(listarContatosSchema)
      .query(({ input, ctx }) => service.listar(input, ctxDe(ctx))),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctxDe(ctx))),

    criar: writeProcedure(MODULE)
      .input(criarContatoSchema)
      .mutation(async ({ input, ctx }) => { await exigirGerenciar(ctx); return service.criar(input, ctx.userId!, ctx.empresaId) }),

    atualizar: writeProcedure(MODULE)
      .input(atualizarContatoSchema)
      .mutation(async ({ input, ctx }) => { await exigirGerenciar(ctx); return service.atualizar(input, ctxDe(ctx)) }),

    // Exclusão é SOFT (o `ativo` do v1) — passa por write, como no módulo antigo.
    excluir: writeProcedure(MODULE)
      .input(excluirContatoSchema)
      .mutation(async ({ input, ctx }) => { await exigirGerenciar(ctx); return service.excluir(input.id, ctxDe(ctx)) }),

    restaurar: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => { await exigirGerenciar(ctx); return service.restaurar(input.id, ctxDe(ctx)) }),
  })
}
