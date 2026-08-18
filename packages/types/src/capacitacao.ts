import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Capacitações da Qualidade — port do `sgq_capacitacoes` do OneClick v1.
 *
 * Da solicitação à avaliação de eficácia. Ver docs/migracao-capacitacoes-v1.md.
 */

/** O `tipo` 1/2 do v1, que lá vinha chumbado no HTML do formulário. */
export const capacitacaoAmbitoSchema = z.enum(['INTERNA', 'EXTERNA'])
export type CapacitacaoAmbito = z.infer<typeof capacitacaoAmbitoSchema>

export const CAPACITACAO_AMBITO_LABEL: Record<CapacitacaoAmbito, string> = {
  INTERNA: 'Capacitação Interna',
  EXTERNA: 'Capacitação Externa',
}

/** As seis situações do `sgq_cap_sta`. */
export const capacitacaoStatusSchema = z.enum([
  'SOLICITADA', 'AGUARDANDO_AUTORIZACAO', 'AUTORIZADA', 'AVALIADA', 'FINALIZADA', 'CANCELADA',
])
export type CapacitacaoStatus = z.infer<typeof capacitacaoStatusSchema>

export const CAPACITACAO_STATUS_LABEL: Record<CapacitacaoStatus, string> = {
  SOLICITADA: 'Nova Solicitação',
  AGUARDANDO_AUTORIZACAO: 'Aguardando Autorização',
  AUTORIZADA: 'Autorizada',
  AVALIADA: 'Avaliada',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
}

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const hora = z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida.')

export const criarCapacitacaoSchema = z.object({
  titulo: z.string().min(3, 'Dê um título à capacitação.').max(200),
  ambito: capacitacaoAmbitoSchema.default('INTERNA'),
  metodoId: z.string().optional().nullable(),

  instrutor: z.string().max(200).optional().nullable(),
  organizacao: z.string().max(200).optional().nullable(),
  local: z.string().max(200).optional().nullable(),

  dataInicio: dataISO,
  dataFim: dataISO.optional().nullable(),
  horaInicio: hora.optional().nullable().or(z.literal('')),
  horaFim: hora.optional().nullable().or(z.literal('')),

  /** "Total de Horas por Colaborador" — número, e não o varchar bagunçado do v1. */
  cargaHoraria: z.number().nonnegative().optional().nullable(),
  custo: z.number().nonnegative().optional().nullable(),
  descricao: z.string().optional().nullable(),

  /** Prazo para avaliar a eficácia. */
  prazoAvaliacao: dataISO.optional().nullable(),
  /** Participantes por ID — o v1 já acertava nisto. */
  participantesIds: z.array(z.string()).default([]),
})

export const atualizarCapacitacaoSchema = criarCapacitacaoSchema.partial().extend({
  id: z.string().min(1),
})

export const listarCapacitacoesSchema = paginationSchema.extend({
  status: capacitacaoStatusSchema.optional(),
  ambito: capacitacaoAmbitoSchema.optional(),
  metodoId: z.string().optional(),
  de: dataISO.optional(),
  ate: dataISO.optional(),
  /** Só aquelas de que eu participo — é a pergunta do colaborador. */
  somenteMinhas: z.coerce.boolean().optional(),
  /** Só as que já passaram do prazo de avaliação e seguem sem avaliação. */
  avaliacaoVencida: z.coerce.boolean().optional(),
})

export const autorizarCapacitacaoSchema = z.object({
  id: z.string().min(1),
  autorizar: z.boolean(),
  /** Recusar exige motivo — sem ele, quem solicitou não sabe o que ajustar. */
  observacao: z.string().max(4000).optional().nullable(),
}).refine(
  v => v.autorizar || Boolean(v.observacao?.trim()),
  { message: 'Diga o motivo da recusa.', path: ['observacao'] },
)

/**
 * Avaliação de eficácia. `objetivosAtingidos = false` exige as ações de
 * seguimento — é literalmente o que o formulário do v1 pedia ("Preencher em
 * caso de não atingir os objetivos"), e sem isso a avaliação não fecha o ciclo.
 */
export const avaliarCapacitacaoSchema = z.object({
  id: z.string().min(1),
  objetivosAtingidos: z.boolean(),
  avaliacaoForma: z.string().min(1, 'Descreva a forma de avaliação.'),
  avaliacaoEvidencia: z.string().optional().nullable(),
  avaliacaoAcoes: z.string().optional().nullable(),
}).refine(
  v => v.objetivosAtingidos || Boolean(v.avaliacaoAcoes?.trim()),
  { message: 'Informe as ações de seguimento.', path: ['avaliacaoAcoes'] },
)

export const confirmarPresencaSchema = z.object({
  capacitacaoId: z.string().min(1),
  usuarioId: z.string().min(1),
  confirmado: z.boolean().default(true),
})

export const capacitacaoMetodoSchema = z.object({
  nome: z.string().min(2).max(160),
  ordem: z.number().int().nonnegative().default(0),
  ativo: z.boolean().default(true),
})

export type CriarCapacitacaoInput = z.infer<typeof criarCapacitacaoSchema>
export type AtualizarCapacitacaoInput = z.infer<typeof atualizarCapacitacaoSchema>
export type ListarCapacitacoesInput = z.infer<typeof listarCapacitacoesSchema>
export type AutorizarCapacitacaoInput = z.infer<typeof autorizarCapacitacaoSchema>
export type AvaliarCapacitacaoInput = z.infer<typeof avaliarCapacitacaoSchema>
export type ConfirmarPresencaInput = z.infer<typeof confirmarPresencaSchema>
export type CapacitacaoMetodoInput = z.infer<typeof capacitacaoMetodoSchema>
