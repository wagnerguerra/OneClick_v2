/**
 * Tipos e schemas Zod do módulo Gestão de Ativos (TI / Patrimônio).
 * Sincronizado com Prisma — qualquer mudança no schema do banco precisa refletir aqui.
 */

import { z } from 'zod'

// ── Enums (mirrors Prisma) ─────────────────────────────────────────────

export const ATIVO_STATUS = ['ATIVO', 'MANUTENCAO', 'ESTOQUE', 'EMPRESTADO', 'DESCARTADO', 'PERDIDO'] as const
export type AtivoStatus = typeof ATIVO_STATUS[number]

export const ATIVO_STATUS_META: Record<AtivoStatus, { label: string; cor: string }> = {
  ATIVO:      { label: 'Em uso',     cor: 'emerald' },
  MANUTENCAO: { label: 'Manutenção', cor: 'amber'   },
  ESTOQUE:    { label: 'Estoque',    cor: 'slate'   },
  EMPRESTADO: { label: 'Emprestado', cor: 'sky'     },
  DESCARTADO: { label: 'Descartado', cor: 'rose'    },
  PERDIDO:    { label: 'Perdido',    cor: 'rose'    },
}

export const ATIVO_MOVIMENTACAO_TIPO = ['CADASTRO', 'TRANSFERENCIA', 'STATUS_CHANGE', 'MANUTENCAO', 'EMPRESTIMO', 'DEVOLUCAO', 'BAIXA'] as const
export type AtivoMovimentacaoTipo = typeof ATIVO_MOVIMENTACAO_TIPO[number]

export const ATIVO_MOVIMENTACAO_TIPO_LABEL: Record<AtivoMovimentacaoTipo, string> = {
  CADASTRO:      'Cadastro',
  TRANSFERENCIA: 'Transferência',
  STATUS_CHANGE: 'Mudança de status',
  MANUTENCAO:    'Manutenção',
  EMPRESTIMO:    'Empréstimo',
  DEVOLUCAO:     'Devolução',
  BAIXA:         'Baixa',
}

export const ATIVO_MANUTENCAO_TIPO = ['PREVENTIVA', 'CORRETIVA', 'UPGRADE'] as const
export type AtivoManutencaoTipo = typeof ATIVO_MANUTENCAO_TIPO[number]

export const ATIVO_ANEXO_TIPO = ['NOTA_FISCAL', 'CONTRATO', 'FOTO', 'MANUAL', 'OUTRO'] as const
export type AtivoAnexoTipo = typeof ATIVO_ANEXO_TIPO[number]

// ── Tipos e Categorias ─────────────────────────────────────────────────

export const createAtivoTipoSchema = z.object({
  nome:  z.string().min(1).max(80),
  cor:   z.string().max(20).optional().nullable(),
  icone: z.string().max(40).optional().nullable(),
  ordem: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
})
export const updateAtivoTipoSchema = createAtivoTipoSchema.partial()

export const createAtivoCategoriaSchema = z.object({
  tipoId:           z.string(),
  nome:             z.string().min(1).max(80),
  depreciacaoMeses: z.coerce.number().int().min(1).max(600).optional().nullable(),
  ordem:            z.coerce.number().int().min(0).default(0),
  ativo:            z.boolean().default(true),
})
export const updateAtivoCategoriaSchema = createAtivoCategoriaSchema.partial().omit({ tipoId: true })

// ── Ativo ──────────────────────────────────────────────────────────────

export const createAtivoSchema = z.object({
  /** Etiqueta única; quando omitida o backend gera ("AT-0001"). */
  tag:        z.string().min(1).max(40).optional(),
  nome:       z.string().min(1).max(200),
  descricao:  z.string().max(2000).optional().nullable(),

  tipoId:      z.string(),
  categoriaId: z.string(),

  fabricante: z.string().max(120).optional().nullable(),
  modelo:     z.string().max(120).optional().nullable(),
  serial:     z.string().max(120).optional().nullable(),
  patrimonio: z.string().max(60).optional().nullable(),

  fornecedorId:   z.string().optional().nullable(),
  notaFiscal:     z.string().max(60).optional().nullable(),
  dataAquisicao:  z.coerce.date().optional().nullable(),
  valorAquisicao: z.coerce.number().min(0).optional().nullable(),

  garantiaInicio: z.coerce.date().optional().nullable(),
  garantiaFim:    z.coerce.date().optional().nullable(),

  status:      z.enum(ATIVO_STATUS).default('ESTOQUE'),
  localizacao: z.string().max(120).optional().nullable(),

  responsavelId: z.string().optional().nullable(),
  areaId:        z.string().optional().nullable(),
  clienteId:     z.string().optional().nullable(),

  observacoes: z.string().max(2000).optional().nullable(),
})
export const updateAtivoSchema = createAtivoSchema.partial().extend({
  isActive: z.boolean().optional(),
})

/** Filtros aceitos pela listagem. */
export const listAtivoSchema = z.object({
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
  search:      z.string().optional(),
  status:      z.enum(ATIVO_STATUS).optional(),
  tipoId:      z.string().optional(),
  categoriaId: z.string().optional(),
  responsavelId: z.string().optional(),
  areaId:        z.string().optional(),
  clienteId:     z.string().optional(),
  /** Inclui inativos (soft-deleted). Default: só ativos. */
  incluirInativos: z.boolean().default(false),
  sortBy:  z.enum(['code', 'tag', 'nome', 'dataAquisicao', 'valorAquisicao', 'createdAt']).default('code'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

// ── Movimentação ───────────────────────────────────────────────────────

export const createAtivoMovimentacaoSchema = z.object({
  ativoId:           z.string(),
  tipo:              z.enum(ATIVO_MOVIMENTACAO_TIPO),
  deResponsavelId:   z.string().optional().nullable(),
  paraResponsavelId: z.string().optional().nullable(),
  deAreaId:          z.string().optional().nullable(),
  paraAreaId:        z.string().optional().nullable(),
  deClienteId:       z.string().optional().nullable(),
  paraClienteId:     z.string().optional().nullable(),
  statusAnterior:    z.enum(ATIVO_STATUS).optional().nullable(),
  statusNovo:        z.enum(ATIVO_STATUS).optional().nullable(),
  motivo:            z.string().max(200).optional().nullable(),
  observacoes:       z.string().max(2000).optional().nullable(),
})

// ── Manutenção ─────────────────────────────────────────────────────────

export const createAtivoManutencaoSchema = z.object({
  ativoId:           z.string(),
  tipo:              z.enum(ATIVO_MANUTENCAO_TIPO),
  descricao:         z.string().min(1).max(2000),
  fornecedorId:      z.string().optional().nullable(),
  custoMaoObra:      z.coerce.number().min(0).optional().nullable(),
  custoPecas:        z.coerce.number().min(0).optional().nullable(),
  dataInicio:        z.coerce.date().optional().nullable(),
  dataFim:           z.coerce.date().optional().nullable(),
  proximaPreventiva: z.coerce.date().optional().nullable(),
  responsavelId:     z.string().optional().nullable(),
  observacoes:       z.string().max(2000).optional().nullable(),
})
export const updateAtivoManutencaoSchema = createAtivoManutencaoSchema.partial().omit({ ativoId: true })

// ── Anexo ──────────────────────────────────────────────────────────────

export const createAtivoAnexoSchema = z.object({
  ativoId:    z.string(),
  tipo:       z.enum(ATIVO_ANEXO_TIPO),
  fileName:   z.string().min(1).max(255),
  storageKey: z.string().min(1).max(255),
  fileSize:   z.coerce.number().int().min(0).optional().nullable(),
  mimeType:   z.string().max(120).optional().nullable(),
  descricao:  z.string().max(255).optional().nullable(),
})

// ── Types inferidos ────────────────────────────────────────────────────

export type CreateAtivoInput            = z.infer<typeof createAtivoSchema>
export type UpdateAtivoInput            = z.infer<typeof updateAtivoSchema>
export type ListAtivoInput              = z.infer<typeof listAtivoSchema>
export type CreateAtivoTipoInput        = z.infer<typeof createAtivoTipoSchema>
export type UpdateAtivoTipoInput        = z.infer<typeof updateAtivoTipoSchema>
export type CreateAtivoCategoriaInput   = z.infer<typeof createAtivoCategoriaSchema>
export type UpdateAtivoCategoriaInput   = z.infer<typeof updateAtivoCategoriaSchema>
export type CreateAtivoMovimentacaoInput = z.infer<typeof createAtivoMovimentacaoSchema>
export type CreateAtivoManutencaoInput  = z.infer<typeof createAtivoManutencaoSchema>
export type UpdateAtivoManutencaoInput  = z.infer<typeof updateAtivoManutencaoSchema>
export type CreateAtivoAnexoInput       = z.infer<typeof createAtivoAnexoSchema>

// ── Helper: depreciação linha reta ─────────────────────────────────────

/**
 * Calcula valor depreciado linear. Retorna o valor atual considerando o uso
 * desde dataAquisicao até hoje.
 *
 * Fórmula: valor × (1 - mesesUso / depreciacaoMeses), com piso em 0.
 *
 * @param valor                Valor de aquisição (R$)
 * @param dataAquisicao        Data da compra
 * @param depreciacaoMeses     Vida útil em meses (vem da categoria)
 * @returns Valor atual depreciado (R$), ou null se faltar dado pra calcular.
 */
export function calcularValorDepreciado(
  valor: number | null | undefined,
  dataAquisicao: Date | string | null | undefined,
  depreciacaoMeses: number | null | undefined,
): number | null {
  if (!valor || !dataAquisicao || !depreciacaoMeses) return null
  const inicio = dataAquisicao instanceof Date ? dataAquisicao : new Date(dataAquisicao)
  if (isNaN(inicio.getTime())) return null
  const agora = new Date()
  const mesesUso =
    (agora.getFullYear() - inicio.getFullYear()) * 12 +
    (agora.getMonth() - inicio.getMonth())
  const fator = Math.max(0, 1 - mesesUso / depreciacaoMeses)
  return Math.round(valor * fator * 100) / 100
}
