import { z } from 'zod'

export const reformaPremissasSchema = z.object({
  aliquotaCbs: z.coerce.number().min(0).max(1).default(0.088),
  aliquotaIbs: z.coerce.number().min(0).max(1).default(0.177),
  aliquotaSimplesIbsCbs: z.coerce.number().min(0).max(1).default(0.04),
  percentualVendasB2B: z.coerce.number().min(0).max(1).default(0.55),
  percentualComprasCreditaveis: z.coerce.number().min(0).max(1).default(0.35),
  pesoCreditoCliente: z.coerce.number().min(0).max(1).default(0.35),
})

export const reformaListClientesSchema = z.object({
  busca: z.coerce.string().optional(),
  apenasSimples: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
})

export const reformaDiagnosticoSchema = z.object({
  clienteId: z.string().min(1),
  meses: z.coerce.number().int().min(1).max(24).default(12),
})

export const reformaSimulacaoSchema = reformaDiagnosticoSchema.extend({
  premissas: reformaPremissasSchema,
})

export type ReformaPremissasInput = z.infer<typeof reformaPremissasSchema>
export type ReformaListClientesInput = z.infer<typeof reformaListClientesSchema>
export type ReformaDiagnosticoInput = z.infer<typeof reformaDiagnosticoSchema>
export type ReformaSimulacaoInput = z.infer<typeof reformaSimulacaoSchema>
