import { z } from 'zod'
import { router, readProcedure, writeProcedure, writeSubProcedure } from '../trpc/trpc.service'
import { listConversasSchema, enviarMensagemSchema, transferirSchema, WHATSAPP_CONVERSA_STATUS } from '@saas/types'
import { WhatsappService } from './whatsapp.service'
import { WhatsappCloudService } from './whatsapp-cloud.service'

const MODULE = 'whatsapp'

export function createWhatsappRouter(service: WhatsappService, cloud: WhatsappCloudService) {
  return router({
    // Status da integração (pra UI avisar se faltam credenciais)
    statusIntegracao: readProcedure(MODULE)
      .query(async () => ({ configurado: await cloud.configurado() })),

    listConversas: readProcedure(MODULE)
      .input(listConversasSchema.optional())
      .query(({ input, ctx }) => service.listConversas(input ?? {}, ctx.empresaId)),

    getConversa: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => service.getConversa(input.id)),

    listMensagens: readProcedure(MODULE)
      .input(z.object({ conversaId: z.string() }))
      .query(({ input }) => service.listMensagens(input.conversaId)),

    enviarMensagem: writeSubProcedure(MODULE, 'atender', 'Responder conversas')
      .input(enviarMensagemSchema)
      .mutation(({ input, ctx }) => service.enviarMensagem(input.conversaId, ctx.userId!, { texto: input.texto, interna: input.interna })),

    assumir: writeSubProcedure(MODULE, 'atender', 'Assumir conversas')
      .input(z.object({ conversaId: z.string() }))
      .mutation(({ input, ctx }) => service.assumir(input.conversaId, ctx.userId!)),

    transferir: writeSubProcedure(MODULE, 'transferir', 'Transferir conversas')
      .input(transferirSchema)
      .mutation(({ input }) => service.transferir(input.conversaId, { setorId: input.setorId, responsavelId: input.responsavelId })),

    setStatus: writeProcedure(MODULE)
      .input(z.object({ conversaId: z.string(), status: z.enum(WHATSAPP_CONVERSA_STATUS) }))
      .mutation(({ input }) => service.setStatus(input.conversaId, input.status)),

    marcarLida: writeProcedure(MODULE)
      .input(z.object({ conversaId: z.string() }))
      .mutation(({ input }) => service.marcarLida(input.conversaId)),

    vincularCliente: writeProcedure(MODULE)
      .input(z.object({ conversaId: z.string(), clienteId: z.string().nullable() }))
      .mutation(({ input }) => service.vincularCliente(input.conversaId, input.clienteId)),
  })
}
