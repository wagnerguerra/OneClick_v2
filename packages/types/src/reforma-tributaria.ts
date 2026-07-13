import { z } from 'zod'

export const reformaPremissasSchema = z.object({
  aliquotaCbs: z.coerce.number().min(0).max(1).default(0.088),
  aliquotaIbs: z.coerce.number().min(0).max(1).default(0.177),
  aliquotaSimplesIbsCbs: z.coerce.number().min(0).max(1).default(0.04),
  percentualVendasB2B: z.coerce.number().min(0).max(1).default(0.55),
  percentualComprasCreditaveis: z.coerce.number().min(0).max(1).default(0.35),
  pesoCreditoCliente: z.coerce.number().min(0).max(1).default(0.35),
  reducaoSetorial: z.coerce.number().min(0).max(1).default(0),
  premissaNome: z.coerce.string().optional(),

  // ── Carga tributária ATUAL (premissas de trabalho, ajustáveis) ──
  // Usadas para estimar o que o cliente paga hoje e projetar a transição.
  // Opcionais (o service aplica os defaults) para não afetar o schema das
  // premissas setoriais persistidas, que não guardam estes campos.
  /** DAS efetivo do Simples (fração do faturamento). Varia por anexo/faixa — validar. */
  dasEfetivoSimples: z.coerce.number().min(0).max(1).optional(),
  /** PIS/COFINS no regime atual (cumulativo ~3,65% / não-cumulativo ~9,25%). */
  aliquotaPisCofins: z.coerce.number().min(0).max(1).optional(),
  /** ICMS efetivo sobre a parcela de mercadorias (estimado bruto — validar créditos). */
  aliquotaIcms: z.coerce.number().min(0).max(1).optional(),
  /** ISS efetivo sobre a parcela de serviços. */
  aliquotaIss: z.coerce.number().min(0).max(1).optional(),
  /** Fração do faturamento que é mercadoria (resto = serviço) — separa ICMS de ISS. */
  percentualMercadorias: z.coerce.number().min(0).max(1).optional(),
  /** Imposto Seletivo sobre o faturamento (setores sujeitos ao IS). 0 = não incide. */
  impostoSeletivoPercent: z.coerce.number().min(0).max(1).optional(),
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

export const reformaCategoriaCreditoSchema = z.enum(['CREDITAVEL', 'NAO_CREDITAVEL', 'REVISAR'])

export const reformaClassificarCreditoSchema = z.object({
  clienteId: z.string().min(1),
  conta: z.string().min(1),
  categoria: reformaCategoriaCreditoSchema,
})

export type ReformaCategoriaCredito = z.infer<typeof reformaCategoriaCreditoSchema>
export type ReformaClassificarCreditoInput = z.infer<typeof reformaClassificarCreditoSchema>

export type ReformaPremissasInput = z.infer<typeof reformaPremissasSchema>
export type ReformaListClientesInput = z.infer<typeof reformaListClientesSchema>
export type ReformaDiagnosticoInput = z.infer<typeof reformaDiagnosticoSchema>
export type ReformaSimulacaoInput = z.infer<typeof reformaSimulacaoSchema>
