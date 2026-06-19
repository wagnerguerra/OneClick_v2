import { z } from 'zod'

// Funil de captação de leads por IA.
export const salvarFunilConfigSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen'),
  ativo: z.boolean().optional(),
  trilhaPrompt: z.string(),
  rubrica: z.string(),
  limiarMedio: z.coerce.number().int().min(0).max(100),
  limiarAlto: z.coerce.number().int().min(0).max(100),
  mensagemBoasVindas: z.string().nullable().optional(),
  avisoLgpd: z.string().nullable().optional(),
  whatsappComercial: z.string().nullable().optional(),
  tipoEventoReuniaoId: z.string().nullable().optional(),
})
export type SalvarFunilConfigInput = z.infer<typeof salvarFunilConfigSchema>

export const iniciarLeadSchema = z.object({
  slug: z.string(),
  origem: z.string().nullable().optional(),
  turnstileToken: z.string().nullable().optional(),
})
export type IniciarLeadInput = z.infer<typeof iniciarLeadSchema>

export type LeadChatMsg = { role: 'user' | 'assistant'; content: string }
