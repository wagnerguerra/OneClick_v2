import { z } from 'zod'

// Módulo Benefícios (Trabalhista): VT / VA / Mobilidade.

export const salvarBeneficioConfigSchema = z.object({
  empresaId: z.string(),
  diariaVA: z.coerce.number().min(0),
  diariaVT: z.coerce.number().min(0),
  vtDiasDescontoSaldo: z.coerce.number().int().min(0).max(31),
})
export type SalvarBeneficioConfigInput = z.infer<typeof salvarBeneficioConfigSchema>

export const salvarFichaBeneficioSchema = z.object({
  colaboradorId: z.string(),
  empresaId: z.string().nullable().optional(),
  recebeVA: z.boolean(),
  recebeVT: z.boolean(),
  recebeMobilidade: z.boolean(),
  valorMobilidade: z.coerce.number().min(0),
  observacao: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
})
export type SalvarFichaBeneficioInput = z.infer<typeof salvarFichaBeneficioSchema>

export const abrirCompetenciaSchema = z.object({
  empresaId: z.string(),
  ano: z.coerce.number().int().min(2020).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  diasUteis: z.coerce.number().int().min(1).max(31),
  diariaVA: z.coerce.number().min(0),
  diariaVT: z.coerce.number().min(0),
  vtDiasDescontoSaldo: z.coerce.number().int().min(0).max(31),
})
export type AbrirCompetenciaInput = z.infer<typeof abrirCompetenciaSchema>

export const salvarApontamentoSchema = z.object({
  competenciaId: z.string(),
  colaboradorId: z.string(),
  diasFerias: z.coerce.number().int().min(0).default(0),
  diasLicenca: z.coerce.number().int().min(0).default(0),
  diasAusencia: z.coerce.number().int().min(0).default(0),
  faltas: z.coerce.number().int().min(0).default(0),
  plantoes: z.coerce.number().int().min(0).default(0),
  observacao: z.string().nullable().optional(),
})
export type SalvarApontamentoInput = z.infer<typeof salvarApontamentoSchema>

export const salvarSaldoVtSchema = z.object({
  competenciaId: z.string(),
  colaboradorId: z.string(),
  vtSaldoCartao: z.coerce.number().min(0),
})
export type SalvarSaldoVtInput = z.infer<typeof salvarSaldoVtSchema>
