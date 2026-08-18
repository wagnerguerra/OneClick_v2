import { z } from 'zod'
import {
  router, readProcedure, writeProcedure,
  writeSubProcedure, deleteSubProcedure, hasSubPermission,
} from '../trpc/trpc.service'
import {
  criarReuniaoSchema, atualizarReuniaoSchema, listarReunioesSchema,
  criarReuniaoAcaoSchema, atualizarReuniaoAcaoSchema, concluirReuniaoAcaoSchema,
  listarMinhasAcoesSchema, reuniaoTipoInputSchema,
} from '@saas/types'
import { ReuniaoService } from './reuniao.service'

const MODULE = 'reunioes'

export function createReuniaoRouter(service: ReuniaoService) {
  /**
   * Escopo de leitura. O v1 não tinha níveis — quem abria o módulo via tudo.
   * Aqui `ver_todas` é explícito, mas quem registrou ou participou sempre
   * alcança a própria reunião (a regra mora no service).
   */
  async function escopo(ctx: {
    userId: string; empresaId?: string | null; isMaster?: boolean; isEmpresaMaster?: boolean
  }) {
    const opts = { isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster }
    return {
      userId: ctx.userId,
      empresaId: ctx.empresaId,
      verTodas: await hasSubPermission(ctx.userId, MODULE, 'ver_todas', opts),
    }
  }

  /** Gerenciar ações — ou ser o responsável pela ação, conferido caso a caso. */
  async function gerenciaAcoes(ctx: {
    userId: string; isMaster?: boolean; isEmpresaMaster?: boolean
  }) {
    return hasSubPermission(ctx.userId, MODULE, 'gerenciar_acoes', {
      isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster,
    })
  }

  return router({
    listar: readProcedure(MODULE)
      .input(listarReunioesSchema)
      .query(async ({ input, ctx }) => service.listar(input, await escopo(ctx))),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        await service.assertPodeVer(input.id, await escopo(ctx))
        return service.getById(input.id, ctx.empresaId)
      }),

    criar: writeSubProcedure(MODULE, 'registrar', 'Registrar reunioes')
      .input(criarReuniaoSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarReuniaoSchema)
      .mutation(async ({ input, ctx }) => {
        await service.assertPodeEditar(input.id, {
          userId: ctx.userId,
          empresaId: ctx.empresaId,
          gerencia: await gerenciaAcoes(ctx),
        })
        return service.atualizar(input, ctx.userId, ctx.empresaId)
      }),

    excluir: deleteSubProcedure(MODULE, 'excluir', 'Excluir reunioes')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.userId, ctx.empresaId)),

    // ── Plano de ação ──
    criarAcao: writeSubProcedure(MODULE, 'gerenciar_acoes', 'Criar e concluir acoes')
      .input(criarReuniaoAcaoSchema)
      .mutation(({ input, ctx }) => service.criarAcao(input, ctx.userId, ctx.empresaId)),

    atualizarAcao: writeSubProcedure(MODULE, 'gerenciar_acoes', 'Criar e concluir acoes')
      .input(atualizarReuniaoAcaoSchema)
      .mutation(({ input, ctx }) => service.atualizarAcao(input, ctx.userId, ctx.empresaId)),

    /**
     * Concluir é a ação mais corriqueira do módulo: o colaborador entra só para
     * dar baixa no que ficou no nome dele. Por isso NÃO exige a sub-permissão —
     * ela é conferida apenas quando quem conclui não é o responsável.
     */
    concluirAcao: writeProcedure(MODULE)
      .input(concluirReuniaoAcaoSchema)
      .mutation(async ({ input, ctx }) => {
        const dono = await service.ehResponsavel(input.id, ctx.userId, ctx.empresaId)
        if (!dono && !(await gerenciaAcoes(ctx))) {
          throw new Error('Só o responsável pela ação (ou quem gerencia as ações) pode concluí-la.')
        }
        return service.concluirAcao(input, ctx.userId, ctx.empresaId)
      }),

    excluirAcao: writeSubProcedure(MODULE, 'gerenciar_acoes', 'Criar e concluir acoes')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluirAcao(input.id, ctx.userId, ctx.empresaId)),

    /** Painel de pendências: por padrão, as ações do próprio usuário. */
    listarAcoes: readProcedure(MODULE)
      .input(listarMinhasAcoesSchema)
      .query(async ({ input, ctx }) => service.listarAcoes(input, {
        userId: ctx.userId,
        empresaId: ctx.empresaId,
        podeVerTodas: await hasSubPermission(ctx.userId, MODULE, 'ver_todas', {
          isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster,
        }),
      })),

    // ── Tipos (cadastro) ──
    listarTipos: readProcedure(MODULE)
      .input(z.object({ incluirInativos: z.boolean().default(false) }).optional())
      .query(({ input, ctx }) => service.listarTipos(ctx.empresaId, input?.incluirInativos ?? false)),

    criarTipo: writeSubProcedure(MODULE, 'registrar', 'Registrar reunioes')
      .input(reuniaoTipoInputSchema)
      .mutation(({ input, ctx }) => service.criarTipo(input, ctx.empresaId)),

    atualizarTipo: writeProcedure(MODULE)
      .input(reuniaoTipoInputSchema.partial().extend({ id: z.string().min(1) }))
      .mutation(({ input, ctx }) => {
        const { id, ...resto } = input
        return service.atualizarTipo(id, resto, ctx.empresaId)
      }),

    listarUsuarios: readProcedure(MODULE)
      .query(({ ctx }) => service.listarUsuarios(ctx.empresaId)),

    listarClientes: readProcedure(MODULE)
      .query(({ ctx }) => service.listarClientes(ctx.empresaId)),

    // ── Mensagens ──
    adicionarMensagem: writeProcedure(MODULE)
      .input(z.object({ id: z.string().min(1), texto: z.string().min(1).max(4000) }))
      .mutation(async ({ input, ctx }) => {
        // Comentar segue o escopo de LEITURA: quem enxerga a reunião participa
        // da conversa. Sem isto dava para escrever na ata alheia sabendo o ID.
        await service.assertPodeVer(input.id, await escopo(ctx))
        return service.adicionarMensagem(input, ctx.userId, ctx.empresaId)
      }),

    excluirMensagem: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluirMensagem(input.id, ctx.userId, ctx.empresaId)),
  })
}
