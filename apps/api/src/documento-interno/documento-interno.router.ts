import { z } from 'zod'
import {
  router, readProcedure, writeProcedure,
  writeSubProcedure, deleteSubProcedure, hasSubPermission,
} from '../trpc/trpc.service'
import {
  criarDocumentoSchema, atualizarDocumentoSchema, novaRevisaoSchema,
  listarDocumentosSchema, aprovarRevisaoSchema, documentoProcessoSchema,
} from '@saas/types'
import { DocumentoInternoService } from './documento-interno.service'

const MODULE = 'documentos-internos'

/**
 * O v1 escolhia o perfil na entrada (`usu/`, `adm/`, `apr/`) e o resto vinha
 * de brinde. Aqui cada capacidade é uma sub-permissão, e a diferença que mais
 * importa: **aprovar deixou de ser um perfil separado**. Lá, quem aprovava
 * entrava numa área própria; quem aprova também precisa consultar o documento
 * e o histórico, então virou marcação sobre o mesmo módulo.
 */
export function createDocumentoInternoRouter(service: DocumentoInternoService) {
  async function escopo(ctx: {
    userId: string; empresaId?: string | null; isMaster?: boolean; isEmpresaMaster?: boolean
  }) {
    const opts = { isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster }
    // Quem gerencia ou aprova precisa enxergar o que ainda não foi aprovado —
    // é justamente o material de trabalho dos dois.
    const [ver, gerencia, aprova] = await Promise.all([
      hasSubPermission(ctx.userId, MODULE, 'ver_nao_aprovados', opts),
      hasSubPermission(ctx.userId, MODULE, 'gerenciar', opts),
      hasSubPermission(ctx.userId, MODULE, 'aprovar', opts),
    ])
    return { empresaId: ctx.empresaId, verNaoAprovados: ver || gerencia || aprova }
  }

  return router({
    listar: readProcedure(MODULE)
      .input(listarDocumentosSchema)
      .query(async ({ input, ctx }) => service.listar(input, await escopo(ctx))),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.empresaId)),

    getVersao: readProcedure(MODULE)
      .input(z.object({ versaoId: z.string() }))
      .query(({ input, ctx }) => service.getVersao(input.versaoId, ctx.empresaId)),

    criar: writeSubProcedure(MODULE, 'gerenciar', 'Cadastrar documentos')
      .input(criarDocumentoSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeSubProcedure(MODULE, 'gerenciar', 'Cadastrar documentos')
      .input(atualizarDocumentoSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.userId, ctx.empresaId)),

    novaRevisao: writeSubProcedure(MODULE, 'gerenciar', 'Publicar revisoes')
      .input(novaRevisaoSchema)
      .mutation(({ input, ctx }) => service.novaRevisao(input, ctx.userId, ctx.empresaId)),

    enviarParaAprovacao: writeSubProcedure(MODULE, 'gerenciar', 'Publicar revisoes')
      .input(z.object({ versaoId: z.string() }))
      .mutation(({ input, ctx }) => service.enviarParaAprovacao(input.versaoId, ctx.userId, ctx.empresaId)),

    aprovar: writeSubProcedure(MODULE, 'aprovar', 'Aprovar revisoes')
      .input(aprovarRevisaoSchema)
      .mutation(({ input, ctx }) => service.aprovar(input, ctx.userId, ctx.empresaId)),

    cancelarRevisao: writeSubProcedure(MODULE, 'gerenciar', 'Publicar revisoes')
      .input(z.object({ versaoId: z.string() }))
      .mutation(({ input, ctx }) => service.cancelarRevisao(input.versaoId, ctx.userId, ctx.empresaId)),

    excluir: deleteSubProcedure(MODULE, 'excluir', 'Excluir documentos')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.empresaId)),

    // ── Mapa de processos ──
    listarProcessos: readProcedure(MODULE)
      .input(z.object({ incluirInativos: z.boolean().default(false) }).optional())
      .query(({ input, ctx }) => service.listarProcessos(ctx.empresaId, input?.incluirInativos ?? false)),

    criarProcesso: writeSubProcedure(MODULE, 'gerenciar', 'Cadastrar documentos')
      .input(documentoProcessoSchema)
      .mutation(({ input, ctx }) => service.criarProcesso(input, ctx.empresaId)),

    atualizarProcesso: writeProcedure(MODULE)
      .input(documentoProcessoSchema.partial().extend({ id: z.string().min(1) }))
      .mutation(({ input, ctx }) => {
        const { id, ...resto } = input
        return service.atualizarProcesso(id, resto, ctx.empresaId)
      }),
  })
}
