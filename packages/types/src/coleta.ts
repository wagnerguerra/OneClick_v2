import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Coleta e Recebimento — port do `crp_coleta` do OneClick v1.
 * O trâmite físico de documentos: cliente ↔ recepção/rota ↔ arquivo ↔ setores.
 * A máquina de estados e os papéis são fiéis ao original.
 */

export const COLETA_TIPOS = ['ENTREGA', 'COLETA', 'RECEBIMENTO'] as const
export const COLETA_TIPO_LABEL: Record<string, string> = {
  ENTREGA: 'Entrega', COLETA: 'Coleta', RECEBIMENTO: 'Recebimento',
}

/** As 12 situações do crpcltsts, na ordem do v1. */
export const COLETA_SITUACOES = [
  'AGUARDANDO_ROTA', 'ROTA_CONFIRMADA', 'RETIRADA_DISPONIVEL', 'ENTREGUE_CLIENTE',
  'NA_RECEPCAO', 'EM_TRIAGEM', 'NO_SETOR', 'DEVOLVIDO_ARQUIVO',
  'DEVOLVIDO_CLIENTE', 'PROTOCOLO_ARQUIVADO', 'ENTREGUE_ARQUIVO', 'PROTOCOLO_ENTREGUE',
] as const

export const COLETA_SITUACAO_LABEL: Record<string, string> = {
  AGUARDANDO_ROTA: 'Aguardando Rota',
  ROTA_CONFIRMADA: 'Rota Confirmada',
  RETIRADA_DISPONIVEL: 'Retirada Disponível',
  ENTREGUE_CLIENTE: 'Entregue ao Cliente',
  NA_RECEPCAO: 'Na Recepção',
  EM_TRIAGEM: 'Em Triagem',
  NO_SETOR: 'No Setor',
  DEVOLVIDO_ARQUIVO: 'Devolvido ao Arquivo',
  DEVOLVIDO_CLIENTE: 'Devolvido ao Cliente',
  PROTOCOLO_ARQUIVADO: 'Protocolo Arquivado',
  ENTREGUE_ARQUIVO: 'Entregue ao Arquivo',
  PROTOCOLO_ENTREGUE: 'Protocolo Entregue',
}

/**
 * As transições nomeadas — quem faz o quê. `papel` diz a sub-permissão que
 * habilita o botão (rota = Recepção, arquivo = Arquivo); o evento é o texto
 * que o v1 gravava no log.
 */
export const COLETA_TRANSICOES = {
  CONFIRMAR_ROTA: { destino: 'ROTA_CONFIRMADA', papel: 'rota', evento: 'Confirmou a rota' },
  RECEBER_RECEPCAO: { destino: 'NA_RECEPCAO', papel: 'rota', evento: 'Recebido pela Recepção' },
  ENTREGAR_ARQUIVO: { destino: 'ENTREGUE_ARQUIVO', papel: 'rota', evento: 'Entregue ao Arquivo' },
  PROTOCOLO_ENTREGUE: { destino: 'PROTOCOLO_ENTREGUE', papel: 'rota', evento: 'Protocolo entregue ao arquivo' },
  TRIAGEM: { destino: 'EM_TRIAGEM', papel: 'arquivo', evento: 'Documento em Triagem' },
  ENTREGAR_SETOR: { destino: 'NO_SETOR', papel: 'arquivo', evento: 'Documento entregue ao setor' },
  DEVOLVER_ARQUIVO: { destino: 'DEVOLVIDO_ARQUIVO', papel: 'arquivo', evento: 'Documento devolvido ao arquivo' },
  DISPONIBILIZAR_RETIRADA: { destino: 'RETIRADA_DISPONIVEL', papel: 'arquivo', evento: 'Documento disponível para retirada' },
  ARQUIVAR_PROTOCOLO: { destino: 'PROTOCOLO_ARQUIVADO', papel: 'arquivo', evento: 'Arquivou o protocolo' },
  SOLICITAR_ENTREGA_CLIENTE: { destino: 'AGUARDANDO_ROTA', papel: 'arquivo', evento: 'Solicitou entrega do documento ao cliente' },
} as const
export type ColetaTransicao = keyof typeof COLETA_TRANSICOES

/** Escala do v1: 1=Baixa, 2=Média, 3=Alta (0 = não definida). */
export const COLETA_PRIORIDADE_LABEL: Record<number, string> = {
  0: '—', 1: 'Baixa', 2: 'Média', 3: 'Alta',
}

const anoMes = z.string().regex(/^\d{2}\/\d{4}$/, 'Use MM/AAAA.').optional().nullable()

export const criarColetaSchema = z.object({
  tipo: z.enum(COLETA_TIPOS),
  clienteId: z.string().optional().nullable(),
  contato: z.string().max(160).optional().nullable(),
  categoriaId: z.string().optional().nullable(),
  competencia: anoMes,
  prioridade: z.coerce.number().int().min(0).max(3).default(0),
  descricao: z.string().optional().nullable(),
})

export const atualizarColetaSchema = z.object({
  id: z.string().min(1),
  clienteId: z.string().optional().nullable(),
  contato: z.string().max(160).optional().nullable(),
  categoriaId: z.string().optional().nullable(),
  competencia: anoMes,
  prioridade: z.coerce.number().int().min(0).max(3).optional(),
  descricao: z.string().optional().nullable(),
})

export const transitarColetaSchema = z.object({
  id: z.string().min(1),
  transicao: z.enum(Object.keys(COLETA_TRANSICOES) as [ColetaTransicao, ...ColetaTransicao[]]),
})

export const excluirColetaSchema = z.object({
  id: z.string().min(1),
  motivo: z.string().min(3, 'Informe o motivo da exclusão.'),
})

export const criarColetaCategoriaSchema = z.object({
  nome: z.string().min(2).max(160),
  areaId: z.string().optional().nullable(),
})
export const atualizarColetaCategoriaSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(2).max(160).optional(),
  areaId: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
})

export const listarColetasSchema = paginationSchema.extend({
  tipo: z.enum(COLETA_TIPOS).optional(),
  situacao: z.enum(COLETA_SITUACOES).optional(),
  categoriaId: z.string().optional(),
  clienteId: z.string().optional(),
  somenteMinhas: z.boolean().optional(),
  /** Por padrão os "Protocolo Arquivado" ficam fora da lista; busca/filtro os revelam. */
  incluirArquivados: z.boolean().optional(),
})

export type CriarColetaInput = z.infer<typeof criarColetaSchema>
export type AtualizarColetaInput = z.infer<typeof atualizarColetaSchema>
export type TransitarColetaInput = z.infer<typeof transitarColetaSchema>
export type ExcluirColetaInput = z.infer<typeof excluirColetaSchema>
export type CriarColetaCategoriaInput = z.infer<typeof criarColetaCategoriaSchema>
export type AtualizarColetaCategoriaInput = z.infer<typeof atualizarColetaCategoriaSchema>
export type ListarColetasInput = z.infer<typeof listarColetasSchema>
