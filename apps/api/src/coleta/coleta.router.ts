import { z } from 'zod'
import { router, readProcedure, writeProcedure, hasSubPermission } from '../trpc/trpc.service'
import {
  criarColetaSchema, atualizarColetaSchema, transitarColetaSchema, excluirColetaSchema,
  criarColetaCategoriaSchema, atualizarColetaCategoriaSchema, listarColetasSchema,
} from '@saas/types'
import { ColetaService } from './coleta.service'

const MODULE = 'coleta-documentos'

/**
 * Os papéis do v1 viram sub-permissões: `rota` (a pasta adm/ da Recepção) e
 * `arquivo` (a pasta arq/). Qualquer usuário com escrita solicita (a pasta
 * usu/); as transições exigem o papel — checado no SERVICE, que é o dono do
 * mapa situação × papel.
 */
export function createColetaRouter(service: ColetaService) {
  async function papeisDe(ctx: {
    userId: string; isMaster?: boolean; isEmpresaMaster?: boolean
  }) {
    const opts = { isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster }
    const [rota, arquivo] = await Promise.all([
      hasSubPermission(ctx.userId, MODULE, 'rota', opts),
      hasSubPermission(ctx.userId, MODULE, 'arquivo', opts),
    ])
    return { rota, arquivo, admin: !!(ctx.isMaster || ctx.isEmpresaMaster) }
  }

  return router({
    listar: readProcedure(MODULE)
      .input(listarColetasSchema)
      .query(({ input, ctx }) => service.listar(input, { userId: ctx.userId, empresaId: ctx.empresaId })),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) =>
        service.getById(input.id, await papeisDe(ctx), ctx.empresaId)),

    /** Os papéis do usuário atual, para a UI montar filtros/botões. */
    meusPapeis: readProcedure(MODULE)
      .query(({ ctx }) => papeisDe(ctx)),

    criar: writeProcedure(MODULE)
      .input(criarColetaSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarColetaSchema)
      .mutation(async ({ input, ctx }) =>
        service.atualizar(input, ctx.userId, await papeisDe(ctx), ctx.empresaId)),

    transitar: writeProcedure(MODULE)
      .input(transitarColetaSchema)
      .mutation(async ({ input, ctx }) =>
        service.transitar(input, ctx.userId, await papeisDe(ctx), ctx.empresaId)),

    // Exclusão é SOFT com motivo, como no v1 — o solicitante desfaz a própria
    // solicitação; por isso passa por write (a regra de dono mora no service),
    // não pelo delete do módulo.
    excluir: writeProcedure(MODULE)
      .input(excluirColetaSchema)
      .mutation(async ({ input, ctx }) =>
        service.excluir(input, ctx.userId, await papeisDe(ctx), ctx.empresaId)),

    // ── Categorias (cadastro do módulo) ──
    listarCategorias: readProcedure(MODULE)
      .input(z.object({ incluirInativas: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => service.listarCategorias(ctx.empresaId, !input?.incluirInativas)),

    criarCategoria: writeProcedure(MODULE)
      .input(criarColetaCategoriaSchema)
      .mutation(({ input, ctx }) => service.criarCategoria(input, ctx.empresaId)),

    atualizarCategoria: writeProcedure(MODULE)
      .input(atualizarColetaCategoriaSchema)
      .mutation(({ input }) => service.atualizarCategoria(input)),

    // ── Apoios ──
    listarClientes: readProcedure(MODULE)
      .query(({ ctx }) => service.listarClientes(ctx.empresaId)),

    listarAreas: readProcedure(MODULE)
      .query(({ ctx }) => service.listarAreas(ctx.empresaId)),
  })
}
