import { z } from 'zod'
import {
  router, readProcedure, writeProcedure,
  writeSubProcedure, deleteSubProcedure, hasSubPermission,
} from '../trpc/trpc.service'
import {
  criarCapacitacaoSchema, atualizarCapacitacaoSchema, listarCapacitacoesSchema,
  autorizarCapacitacaoSchema, avaliarCapacitacaoSchema, confirmarPresencaSchema,
  capacitacaoMetodoSchema,
} from '@saas/types'
import { CapacitacaoService } from './capacitacao.service'

const MODULE = 'capacitacoes'

/**
 * O v1 escolhia entre quatro áreas na entrada (`usu/`, `adm/`, `apr/`, `sup/`)
 * combinando dois flags. Aqui cada capacidade é uma sub-permissão — e quem
 * autoriza ou avalia também consulta, sem precisar de uma área própria.
 */
export function createCapacitacaoRouter(service: CapacitacaoService) {
  async function escopo(ctx: {
    userId: string; empresaId?: string | null; isMaster?: boolean; isEmpresaMaster?: boolean
  }) {
    const opts = { isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster }
    const [ver, gerencia, autoriza, avalia] = await Promise.all([
      hasSubPermission(ctx.userId, MODULE, 'ver_todas', opts),
      hasSubPermission(ctx.userId, MODULE, 'gerenciar', opts),
      hasSubPermission(ctx.userId, MODULE, 'autorizar', opts),
      hasSubPermission(ctx.userId, MODULE, 'avaliar', opts),
    ])
    return {
      userId: ctx.userId,
      empresaId: ctx.empresaId,
      verTodas: ver || gerencia || autoriza || avalia,
    }
  }

  return router({
    listar: readProcedure(MODULE)
      .input(listarCapacitacoesSchema)
      .query(async ({ input, ctx }) => service.listar(input, await escopo(ctx))),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        await service.assertPodeVer(input.id, await escopo(ctx))
        return service.getById(input.id, ctx.empresaId)
      }),

    criar: writeSubProcedure(MODULE, 'solicitar', 'Solicitar capacitacoes')
      .input(criarCapacitacaoSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeSubProcedure(MODULE, 'gerenciar', 'Cadastrar e editar')
      .input(atualizarCapacitacaoSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.userId, ctx.empresaId)),

    solicitarAutorizacao: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.solicitarAutorizacao(input.id, ctx.userId, ctx.empresaId)),

    autorizar: writeSubProcedure(MODULE, 'autorizar', 'Autorizar ou recusar')
      .input(autorizarCapacitacaoSchema)
      .mutation(({ input, ctx }) => service.autorizar(input, ctx.userId, ctx.empresaId)),

    avaliar: writeSubProcedure(MODULE, 'avaliar', 'Avaliar a eficacia')
      .input(avaliarCapacitacaoSchema)
      .mutation(({ input, ctx }) => service.avaliar(input, ctx.userId, ctx.empresaId)),

    finalizar: writeSubProcedure(MODULE, 'gerenciar', 'Cadastrar e editar')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.finalizar(input.id, ctx.userId, ctx.empresaId)),

    cancelar: writeSubProcedure(MODULE, 'gerenciar', 'Cadastrar e editar')
      .input(z.object({ id: z.string(), motivo: z.string().min(1, 'Diga o motivo.') }))
      .mutation(({ input, ctx }) => service.cancelar(input.id, ctx.userId, input.motivo, ctx.empresaId)),

    excluir: deleteSubProcedure(MODULE, 'excluir', 'Excluir capacitacoes')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.empresaId)),

    /**
     * Confirmar presença. O próprio participante confirma a sua sem precisar de
     * marcação nenhuma — é a operação mais corriqueira do módulo. Confirmar a
     * de OUTRA pessoa exige gerenciar.
     */
    confirmarPresenca: writeProcedure(MODULE)
      .input(confirmarPresencaSchema)
      .mutation(async ({ input, ctx }) => {
        if (input.usuarioId !== ctx.userId) {
          const pode = await hasSubPermission(ctx.userId, MODULE, 'gerenciar', {
            isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster,
          })
          if (!pode) throw new Error('Só quem gerencia pode confirmar a presença de outra pessoa.')
        }
        return service.confirmarPresenca(input, ctx.userId, ctx.empresaId)
      }),

    adicionarMensagem: writeProcedure(MODULE)
      .input(z.object({ id: z.string().min(1), texto: z.string().min(1).max(4000) }))
      .mutation(async ({ input, ctx }) => {
        await service.assertPodeVer(input.id, await escopo(ctx))
        return service.adicionarMensagem(input.id, input.texto, ctx.userId, ctx.empresaId)
      }),

    listarUsuarios: readProcedure(MODULE)
      .query(({ ctx }) => service.listarUsuarios(ctx.empresaId)),

    // ── Métodos (cadastro) ──
    listarMetodos: readProcedure(MODULE)
      .input(z.object({ incluirInativos: z.boolean().default(false) }).optional())
      .query(({ input, ctx }) => service.listarMetodos(ctx.empresaId, input?.incluirInativos ?? false)),

    criarMetodo: writeSubProcedure(MODULE, 'gerenciar', 'Cadastrar e editar')
      .input(capacitacaoMetodoSchema)
      .mutation(({ input, ctx }) => service.criarMetodo(input, ctx.empresaId)),

    atualizarMetodo: writeProcedure(MODULE)
      .input(capacitacaoMetodoSchema.partial().extend({ id: z.string().min(1) }))
      .mutation(({ input, ctx }) => {
        const { id, ...resto } = input
        return service.atualizarMetodo(id, resto, ctx.empresaId)
      }),
  })
}
