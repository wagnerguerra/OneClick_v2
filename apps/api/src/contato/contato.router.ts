import { z } from 'zod'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import {
  criarContatoSchema, atualizarContatoSchema, excluirContatoSchema, listarContatosSchema,
} from '@saas/types'
import { ContatoService } from './contato.service'

const MODULE = 'contatos'

/** Agenda de Contatos (port do crp_contatos do v1). */
export function createContatoRouter(service: ContatoService) {
  const ctxDe = (ctx: { userId?: string | null; empresaId?: string | null; isMaster?: boolean; isEmpresaMaster?: boolean }) =>
    ({ userId: ctx.userId!, empresaId: ctx.empresaId, isMaster: !!(ctx.isMaster || ctx.isEmpresaMaster) })

  return router({
    listar: readProcedure(MODULE)
      .input(listarContatosSchema)
      .query(({ input, ctx }) => service.listar(input, ctxDe(ctx))),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctxDe(ctx))),

    criar: writeProcedure(MODULE)
      .input(criarContatoSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId!, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarContatoSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctxDe(ctx))),

    // Exclusão é SOFT (o `ativo` do v1) — passa por write, como no módulo antigo.
    excluir: writeProcedure(MODULE)
      .input(excluirContatoSchema)
      .mutation(({ input, ctx }) => service.excluir(input.id, ctxDe(ctx))),

    restaurar: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.restaurar(input.id, ctxDe(ctx))),
  })
}
