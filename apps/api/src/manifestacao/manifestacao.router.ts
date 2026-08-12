import { z } from 'zod'
import {
  router, readProcedure, writeProcedure,
  readSubProcedure, writeSubProcedure, deleteSubProcedure, protectedProcedure, hasSubPermission,
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
  /**
   * Escopo de leitura do usuário atual. Espelha o roteamento do legado, onde o
   * nível 1 caía em `usu/` (só as suas) e o 3 em `adm/` (todas).
   *
   * Quem trata enxerga tudo por dever de ofício — exigir as duas marcações
   * faria a Qualidade abrir a tela e não ver o que precisa tratar.
   */
  async function escopoDeLeitura(ctx: {
    userId: string; empresaId?: string | null; isMaster?: boolean; isEmpresaMaster?: boolean
  }) {
    const opts = { isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster }
    const [verTodos, trata] = await Promise.all([
      hasSubPermission(ctx.userId, MODULE, 'ver_todos', opts),
      hasSubPermission(ctx.userId, MODULE, 'tratar', opts),
    ])
    return {
      userId: ctx.userId,
      empresaId: ctx.empresaId,
      verTodos: verTodos || trata,
      // No mural das sugestões, o que foi publicado é de todos.
      verPublicas: tipo === 'SUGESTAO',
    }
  }

  return router({
    listar: readProcedure(MODULE)
      .input(listarManifestacoesSchema)
      .query(async ({ input, ctx }) => {
        // `somenteMinhas` é aplicado no service, que já é o dono dessa regra.
        return service.listar(tipo, input, await escopoDeLeitura(ctx))
      }),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        await service.assertPodeVer(input.id, tipo, await escopoDeLeitura(ctx))
        return service.getById(tipo, input.id, ctx.empresaId)
      }),

    // `registrar` já estava no catálogo de permissões, mas o criar exigia só a
    // escrita do módulo — o interruptor aparecia na tela e não segurava nada.
    criar: writeSubProcedure(MODULE, 'registrar', 'Registrar manifestacoes')
      .input(criarManifestacaoSchema.omit({ tipo: true }))
      .mutation(({ input, ctx }) =>
        service.criar({ ...input, tipo }, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarManifestacaoSchema.omit({ tipo: true }))
      .mutation(async ({ input, ctx }) => {
        // Editar exige ser o autor ou tratar o módulo — no legado, a tela de
        // edição vivia dentro de `adm/`. `ver_todos` sozinho não basta: ele é
        // permissão de LEITURA ampla, e quem só lê não deve reescrever o
        // relato de outra pessoa.
        await service.assertPodeEditar(input.id, tipo, {
          userId: ctx.userId,
          empresaId: ctx.empresaId,
          trata: await hasSubPermission(ctx.userId, MODULE, 'tratar', {
            isMaster: ctx.isMaster, isEmpresaMaster: ctx.isEmpresaMaster,
          }),
        })
        return service.atualizar({ ...input, tipo }, tipo, ctx.empresaId)
      }),

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
      .mutation(async ({ input, ctx }) => {
        // Comentar segue o escopo de LEITURA: quem enxerga o registro participa
        // da conversa. Sem esta checagem dava para escrever na tratativa de
        // qualquer colega sabendo o ID.
        await service.assertPodeVer(input.id, tipo, await escopoDeLeitura(ctx))
        return service.adicionarMensagem(input, tipo, ctx.userId, ctx.empresaId)
      }),

    // No legado o botão de excluir só aparecia no nível de administração
    // (`If SGQ_ELO = "3"` em central/modules/sgq_elogios/details.asp). Aqui
    // vira sub-permissão própria, em vez de bastar o delete do módulo.
    excluir: deleteSubProcedure(MODULE, 'excluir', 'Excluir manifestacoes')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, tipo, ctx.empresaId)),

    // ── Fluxo, só para Reclamações ──
    ...(tipo === 'RECLAMACAO'
      ? {
        darRetorno: writeSubProcedure(MODULE, 'tratar', 'Dar retorno ao cliente')
          .input(z.object({ id: z.string().min(1), texto: z.string().min(1).max(4000) }))
          .mutation(({ input, ctx }) => service.darRetorno(input, ctx.userId, ctx.empresaId)),

        analisarProcedencia: writeSubProcedure(MODULE, 'tratar', 'Analisar procedencia')
          .input(z.object({
            id: z.string().min(1),
            procede: z.boolean(),
            causaDescricao: z.string().max(4000).optional().nullable(),
            justificativa: z.string().max(4000).optional().nullable(),
            retornoFinal: z.string().max(4000).optional().nullable(),
          }))
          .mutation(({ input, ctx }) => service.analisarProcedencia(input, ctx.userId, ctx.empresaId)),

        finalizar: writeSubProcedure(MODULE, 'tratar', 'Finalizar reclamacao')
          .input(z.object({ id: z.string().min(1), retornoFinal: z.string().min(1).max(4000) }))
          .mutation(({ input, ctx }) => service.finalizarReclamacao(input, ctx.userId, ctx.empresaId)),

        indicadores: readSubProcedure(MODULE, 'indicadores', 'Acessar os indicadores')
          .input(z.object({ ano: z.coerce.number().int().min(2000).max(2100) }))
          .query(({ input, ctx }) => service.indicadores(input.ano, ctx.empresaId)),
      }
      : {}),

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
