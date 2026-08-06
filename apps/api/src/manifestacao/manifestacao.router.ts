import { z } from 'zod'
import {
  router, readProcedure, writeProcedure, deleteProcedure,
  writeSubProcedure, protectedProcedure, hasSubPermission,
} from '../trpc/trpc.service'
import {
  criarManifestacaoSchema, atualizarManifestacaoSchema,
  listarManifestacoesSchema, responderManifestacaoSchema,
  type ManifestacaoTipo,
} from '@saas/types'
import { ManifestacaoService } from './manifestacao.service'

/**
 * Um router por módulo, sobre a mesma engrenagem.
 *
 * O `tipo` é FIXADO aqui, na fábrica, e não vem do cliente: assim quem tem
 * acesso a Elogios não alcança Reclamações trocando um parâmetro. É a mesma
 * razão de existirem três slugs de permissão para um serviço só.
 */
export function createManifestacaoRouter(
  service: ManifestacaoService,
  tipo: ManifestacaoTipo,
  MODULE: string,
) {
  return router({
    listar: readProcedure(MODULE)
      .input(listarManifestacoesSchema)
      .query(async ({ input, ctx }) => {
        const opts = { isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster }
        // Quem trata enxerga tudo por dever de ofício — exigir as duas marcações
        // faria a Qualidade abrir a tela e não ver o que precisa tratar.
        const [verTodos, trata] = await Promise.all([
          hasSubPermission(ctx.userId, MODULE, 'ver_todos', opts),
          hasSubPermission(ctx.userId, MODULE, 'tratar', opts),
        ])
        return service.listar(tipo, input, {
          userId: ctx.userId,
          empresaId: ctx.empresaId,
          verTodos: verTodos || trata,
          // No mural das sugestões, o que foi publicado é de todos.
          verPublicas: tipo === 'SUGESTAO',
        })
      }),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(tipo, input.id, ctx.empresaId)),

    criar: writeProcedure(MODULE)
      .input(criarManifestacaoSchema.omit({ tipo: true }))
      .mutation(({ input, ctx }) =>
        service.criar({ ...input, tipo }, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarManifestacaoSchema.omit({ tipo: true }))
      .mutation(({ input, ctx }) =>
        service.atualizar({ ...input, tipo }, tipo, ctx.empresaId)),

    responder: writeSubProcedure(MODULE, 'tratar', 'Responder e encerrar')
      .input(responderManifestacaoSchema)
      .mutation(({ input, ctx }) => service.responder(input, tipo, ctx.userId, ctx.empresaId)),

    adicionarMensagem: writeProcedure(MODULE)
      .input(z.object({
        id: z.string().min(1),
        texto: z.string().min(1).max(4000),
        /** Interna não aparece na consulta por protocolo. */
        interna: z.boolean().default(true),
      }))
      .mutation(({ input, ctx }) => service.adicionarMensagem(input, tipo, ctx.userId, ctx.empresaId)),

    excluir: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, tipo, ctx.empresaId)),

    ...(tipo === 'SUGESTAO'
      ? {
        publicar: writeSubProcedure(MODULE, 'publicar', 'Publicar no mural')
          .input(z.object({ id: z.string(), publica: z.boolean() }))
          .mutation(({ input, ctx }) =>
            service.publicar(input.id, input.publica, tipo, ctx.userId, ctx.empresaId)),
      }
      : {}),

    /**
     * Consulta por protocolo.
     *
     * Aberta a qualquer pessoa autenticada, e não gateada pelo módulo: quem
     * registrou anonimamente pode não ter acesso a Elogios, e ainda assim
     * precisa acompanhar o que escreveu. Devolve só o que a pessoa já sabe
     * mais a tratativa — sem notas internas e sem quem tratou.
     */
    porProtocolo: protectedProcedure
      .input(z.object({ protocolo: z.string().min(4).max(40) }))
      .query(({ input }) => service.porProtocolo(input.protocolo)),
  })
}
