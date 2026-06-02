import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { ChatService } from './chat.service'

/** Garante que o user é master (isMaster=true). Lança FORBIDDEN se não for. */
async function assertMaster(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isMaster: true } })
  if (!u?.isMaster) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o master pode alterar a configuração do chat.' })
  }
}

export function createChatRouter(service: ChatService) {
  return router({
    listConversas: protectedProcedure
      .query(({ ctx }) => service.listMinhasConversas(ctx.userId!)),

    getConversa: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getConversa(input.id, ctx.userId!)),

    criarDM: protectedProcedure
      .input(z.object({ outroUserId: z.string() }))
      .mutation(({ input, ctx }) => service.getOuCriarDM(ctx.userId!, input.outroUserId)),

    criarGrupo: protectedProcedure
      .input(z.object({
        nome: z.string().min(1).max(80),
        membrosIds: z.array(z.string()).min(1).max(50),
      }))
      .mutation(({ input, ctx }) => service.criarGrupo(ctx.userId!, input.nome, input.membrosIds)),

    listMensagens: protectedProcedure
      .input(z.object({
        conversaId: z.string(),
        cursor: z.string().optional(),
        take: z.number().int().min(1).max(100).optional(),
      }))
      .query(({ input, ctx }) =>
        service.listMensagens(input.conversaId, ctx.userId!, { cursor: input.cursor, take: input.take }),
      ),

    enviar: protectedProcedure
      .input(z.object({
        conversaId: z.string(),
        conteudo: z.string().min(1).max(4000),
      }))
      .mutation(({ input, ctx }) =>
        service.enviarMensagem(input.conversaId, ctx.userId!, input.conteudo),
      ),

    addAnexo: protectedProcedure
      .input(z.object({
        mensagemId: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        mimeType: z.string().nullable().optional(),
        tamanho: z.number().int().nonnegative().optional(),
      }))
      .mutation(({ input, ctx }) =>
        service.addAnexo(input.mensagemId, ctx.userId!, {
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          mimeType: input.mimeType,
          tamanho: input.tamanho,
        }),
      ),

    marcarLido: protectedProcedure
      .input(z.object({ conversaId: z.string() }))
      .mutation(({ input, ctx }) => service.marcarComoLido(input.conversaId, ctx.userId!)),

    // === Status manual ===
    setStatus: protectedProcedure
      .input(z.object({
        status: z.enum(['online', 'ausente', 'dnd', 'invisible']).nullable(),
      }))
      .mutation(({ input, ctx }) => service.setStatus(ctx.userId!, input.status)),

    // === Editar / Deletar ===
    editarMensagem: protectedProcedure
      .input(z.object({ mensagemId: z.string(), conteudo: z.string().min(1).max(4000) }))
      .mutation(({ input, ctx }) => service.editarMensagem(input.mensagemId, ctx.userId!, input.conteudo)),

    deletarMensagem: protectedProcedure
      .input(z.object({ mensagemId: z.string() }))
      .mutation(({ input, ctx }) => service.deletarMensagem(input.mensagemId, ctx.userId!)),

    // === Reactions ===
    toggleReaction: protectedProcedure
      .input(z.object({ mensagemId: z.string(), emoji: z.string().max(20) }))
      .mutation(({ input, ctx }) => service.toggleReaction(input.mensagemId, ctx.userId!, input.emoji)),

    // === Hide conversa pra si ===
    hideConversa: protectedProcedure
      .input(z.object({ conversaId: z.string() }))
      .mutation(({ input, ctx }) => service.hideConversa(input.conversaId, ctx.userId!)),

    // === Marca offline (logoff / fechar aba) ===
    goOffline: protectedProcedure
      .mutation(({ ctx }) => service.goOffline(ctx.userId!)),

    // === Config global (singleton — leitura aberta, escrita master) ===
    configGet: protectedProcedure
      .query(() => service.getConfig()),

    configUpdate: protectedProcedure
      .input(z.object({
        ausenteAposMin: z.number().int().min(1).max(120).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await assertMaster(ctx.userId!)
        return service.updateConfig(input)
      }),
  })
}
