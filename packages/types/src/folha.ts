import { z } from 'zod'

// ══════════════════════════════════════════════════════════════
// Filiais
// ══════════════════════════════════════════════════════════════

export const folhaFilialSchema = z.object({
  clienteId: z.string(),
  cnpj: z.string(),
  codigoFilial: z.string(),
  endereco: z.string().optional().default(''),
  contaLiquido: z.coerce.number().default(1287),
  contaLiquidoAlt: z.coerce.number().nullable().optional(),
})

export const folhaFilialUpdateSchema = folhaFilialSchema.partial().extend({
  id: z.string(),
})

// ══════════════════════════════════════════════════════════════
// Setores
// ══════════════════════════════════════════════════════════════

export const folhaSetorSchema = z.object({
  filialId: z.string(),
  nome: z.string(),
  tipoContabil: z.enum(['CUSTO', 'DESPESA']),
})

// ══════════════════════════════════════════════════════════════
// Evento -> Conta (tabela de-para)
// ══════════════════════════════════════════════════════════════

export const folhaEventoContaSchema = z.object({
  clienteId: z.string(),
  codigoEvento: z.coerce.number(),
  descricao: z.string().optional().default(''),
  tipo: z.enum(['PROVENTO', 'DESCONTO']),
  contaCustoDebito: z.coerce.number().nullable().optional(),
  contaCustoCredito: z.coerce.number().nullable().optional(),
  contaDespesaDebito: z.coerce.number().nullable().optional(),
  contaDespesaCredito: z.coerce.number().nullable().optional(),
  geraLancamento: z.coerce.boolean().default(true),
})

export const folhaEventoContaUpdateSchema = folhaEventoContaSchema.partial().extend({
  id: z.string(),
})

// ══════════════════════════════════════════════════════════════
// Importação
// ══════════════════════════════════════════════════════════════

export const folhaImportarSchema = z.object({
  clienteId: z.string(),
  competencia: z.string(), // MM/AAAA
  conteudo: z.string(), // Conteúdo do TXT
  nomeArquivo: z.string().optional(),
})

// ══════════════════════════════════════════════════════════════
// Exportação
// ══════════════════════════════════════════════════════════════

export const folhaExportarSchema = z.object({
  importacaoId: z.string(),
  tipo: z.enum(['DEBITO', 'CREDITO', 'AMBOS']),
})

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type FolhaFilialInput = z.infer<typeof folhaFilialSchema>
export type FolhaSetorInput = z.infer<typeof folhaSetorSchema>
export type FolhaEventoContaInput = z.infer<typeof folhaEventoContaSchema>
export type FolhaImportarInput = z.infer<typeof folhaImportarSchema>

// Dados parseados do TXT (uma linha da aba DADOS)
export interface FolhaDadoParsed {
  endereco: string
  setor: string
  emissao: string
  cnpj: string
  competencia: string
  codDebito?: number
  descDebito?: string
  valorDebito?: number
  codCredito?: number
  descCredito?: string
  valorCredito?: number
}

// Seção parseada do TXT
export interface FolhaSecaoParsed {
  cnpj: string
  endereco: string
  setor: string
  emissao: string
  competencia: string
  secao: string
  eventos: FolhaDadoParsed[]
}

// Lançamento gerado
export interface FolhaLancamentoGerado {
  dataLancamento: string
  contaDebito?: number
  contaCredito?: number
  valor: number
  historico: string
  tipo: 'DEBITO' | 'CREDITO'
  codigoEvento: number
  descricaoEvento: string
  filialCodigo: string
  setorNome: string
}
