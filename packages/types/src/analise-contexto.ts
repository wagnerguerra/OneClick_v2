import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Análise de Contexto da Qualidade — port do `sgq_contexto` do OneClick v1.
 * A SWOT do contexto da organização (ISO 9001 §4.1): cada registro é uma
 * oportunidade/ameaça/força/fraqueza com risco e plano de ação.
 */

export const ANALISE_CONTEXTO_ANALISES = ['EXTERNA', 'INTERNA'] as const
export const ANALISE_CONTEXTO_TIPOS = ['OPORTUNIDADE', 'AMEACA', 'FORCA', 'FRAQUEZA'] as const
export const ANALISE_CONTEXTO_ACAO_TIPOS = ['IMEDIATA', 'CORRETIVA', 'AVALIACAO_EFICACIA'] as const

export const ANALISE_CONTEXTO_ANALISE_LABEL: Record<string, string> = {
  EXTERNA: 'Análise Externa', INTERNA: 'Análise Interna',
}
export const ANALISE_CONTEXTO_TIPO_LABEL: Record<string, string> = {
  OPORTUNIDADE: 'Oportunidade', AMEACA: 'Ameaça', FORCA: 'Força', FRAQUEZA: 'Fraqueza',
}
export const ANALISE_CONTEXTO_ACAO_TIPO_LABEL: Record<string, string> = {
  IMEDIATA: 'Ação Imediata', CORRETIVA: 'Ação Corretiva', AVALIACAO_EFICACIA: 'Avaliação de Eficácia',
}

/** Quais tipos pertencem a cada análise — Externa olha o mercado, Interna a casa. */
export const TIPOS_POR_ANALISE: Record<string, readonly string[]> = {
  EXTERNA: ['OPORTUNIDADE', 'AMEACA'],
  INTERNA: ['FORCA', 'FRAQUEZA'],
}

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const grau = z.coerce.number().int().min(1).max(3)

export const criarAnaliseContextoSchema = z.object({
  analise: z.enum(ANALISE_CONTEXTO_ANALISES),
  tipo: z.enum(ANALISE_CONTEXTO_TIPOS),
  identificacao: z.string().min(3, 'Identifique o item da análise.').max(300),
  processo: z.string().max(120).optional().nullable(),
  parteInteressada: z.string().optional().nullable(),
  gravidade: grau.optional().nullable(),
  probabilidade: grau.optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  prazo: dataISO.optional().nullable(),
}).refine((v) => TIPOS_POR_ANALISE[v.analise]!.includes(v.tipo), {
  message: 'O tipo não pertence a esta análise (Externa: oportunidade/ameaça; Interna: força/fraqueza).',
  path: ['tipo'],
})

export const atualizarAnaliseContextoSchema = z.object({
  id: z.string().min(1),
  analise: z.enum(ANALISE_CONTEXTO_ANALISES).optional(),
  tipo: z.enum(ANALISE_CONTEXTO_TIPOS).optional(),
  identificacao: z.string().min(3).max(300).optional(),
  processo: z.string().max(120).optional().nullable(),
  parteInteressada: z.string().optional().nullable(),
  gravidade: grau.optional().nullable(),
  probabilidade: grau.optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  prazo: dataISO.optional().nullable(),
})

/** Fechamento do registro: a avaliação de eficácia. */
export const avaliarAnaliseContextoSchema = z.object({
  id: z.string().min(1),
  avaliacao: z.string().min(3, 'Descreva a avaliação.'),
  eficaz: z.boolean(),
  avaliadoEm: dataISO.optional(),
})

export const criarAnaliseContextoAcaoSchema = z.object({
  analiseId: z.string().min(1),
  tipo: z.enum(ANALISE_CONTEXTO_ACAO_TIPOS),
  descricao: z.string().min(3, 'Descreva a ação.'),
  responsavelId: z.string().optional().nullable(),
  prazo: dataISO.optional().nullable(),
})

export const atualizarAnaliseContextoAcaoSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(ANALISE_CONTEXTO_ACAO_TIPOS).optional(),
  descricao: z.string().min(3).optional(),
  responsavelId: z.string().optional().nullable(),
  prazo: dataISO.optional().nullable(),
})

export const concluirAnaliseContextoAcaoSchema = z.object({
  id: z.string().min(1),
  concluida: z.boolean(),
  observacao: z.string().optional().nullable(),
})

export const listarAnaliseContextoSchema = paginationSchema.extend({
  analise: z.enum(ANALISE_CONTEXTO_ANALISES).optional(),
  tipo: z.enum(ANALISE_CONTEXTO_TIPOS).optional(),
  /** PENDENTE = sem avaliação; AVALIADO = com avaliação registrada. */
  situacao: z.enum(['PENDENTE', 'AVALIADO']).optional(),
})

export type CriarAnaliseContextoInput = z.infer<typeof criarAnaliseContextoSchema>
export type AtualizarAnaliseContextoInput = z.infer<typeof atualizarAnaliseContextoSchema>
export type AvaliarAnaliseContextoInput = z.infer<typeof avaliarAnaliseContextoSchema>
export type CriarAnaliseContextoAcaoInput = z.infer<typeof criarAnaliseContextoAcaoSchema>
export type AtualizarAnaliseContextoAcaoInput = z.infer<typeof atualizarAnaliseContextoAcaoSchema>
export type ConcluirAnaliseContextoAcaoInput = z.infer<typeof concluirAnaliseContextoAcaoSchema>
export type ListarAnaliseContextoInput = z.infer<typeof listarAnaliseContextoSchema>
