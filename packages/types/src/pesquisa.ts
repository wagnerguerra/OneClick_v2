import { z } from 'zod'

export const createPesquisaSchema = z.object({
  clienteId: z.string().optional().nullable(),
  orcamentoId: z.string().optional().nullable(),
  execucaoId: z.string().optional().nullable(),
})

export const responderPesquisaSchema = z.object({
  token: z.string(),
  respondenteNome: z.string().optional().nullable(),
  respondenteArea: z.string().optional().nullable(),
  respondenteEmail: z.string().optional().nullable(),
  q1Atendeu: z.boolean().optional().nullable(),
  q2Qualidade: z.coerce.number().min(1).max(5).optional().nullable(),
  q3Recomendaria: z.boolean().optional().nullable(),
  nota: z.coerce.number().min(0).max(10).optional().nullable(),
  comentario: z.string().optional().nullable(),
})

export type CreatePesquisaInput = z.infer<typeof createPesquisaSchema>
export type ResponderPesquisaInput = z.infer<typeof responderPesquisaSchema>

// ── Pesquisa configurável e versionada ─────────────────────────────
export const PESQUISA_TIPOS = ['ESTRELAS', 'NPS', 'SIM_NAO', 'TEXTO'] as const

export const salvarModeloPesquisaSchema = z.object({
  titulo: z.string().min(1),
  perguntas: z.array(z.object({
    ordem: z.number().int(),
    tipo: z.enum(PESQUISA_TIPOS),
    enunciado: z.string().min(1),
    obrigatoria: z.boolean().optional(),
  })).min(1),
})

export const responderEnvioSchema = z.object({
  token: z.string(),
  respondenteNome: z.string().optional().nullable(),
  respondenteEmail: z.string().optional().nullable(),
  respostas: z.array(z.object({
    perguntaId: z.string(),
    valorNumero: z.coerce.number().int().optional().nullable(),
    valorBooleano: z.boolean().optional().nullable(),
    valorTexto: z.string().optional().nullable(),
  })),
})

export type SalvarModeloPesquisaInput = z.infer<typeof salvarModeloPesquisaSchema>
export type ResponderEnvioInput = z.infer<typeof responderEnvioSchema>
