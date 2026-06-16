import { z } from 'zod'

export const WHATSAPP_CONVERSA_STATUS = ['ABERTA', 'PENDENTE', 'RESOLVIDA', 'FECHADA'] as const

export const listConversasSchema = z.object({
  status: z.enum(WHATSAPP_CONVERSA_STATUS).optional(),
  busca: z.string().optional(),
})

export const enviarMensagemSchema = z.object({
  conversaId: z.string(),
  texto: z.string().min(1),
  interna: z.boolean().optional(),
})

export const transferirSchema = z.object({
  conversaId: z.string(),
  setorId: z.string().nullable().optional(),
  responsavelId: z.string().nullable().optional(),
})

export type ListConversasInput = z.infer<typeof listConversasSchema>
export type EnviarMensagemInput = z.infer<typeof enviarMensagemSchema>
