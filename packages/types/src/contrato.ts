import { z } from 'zod'

// ════════════════════════════════════════════════════════════
// Enums
// ════════════════════════════════════════════════════════════

export const clausulaCategoriaSchema = z.enum([
  'OBJETO',
  'RESPONSABILIDADES',
  'OBRIGACOES',
  'DISPOSICOES',
  'DOCUMENTACAO',
  'PRIVACIDADE',
  'HONORARIOS',
  'EXTRAORDINARIOS',
  'VIGENCIA',
  'FORO',
  'OUTROS',
])
export type ClausulaCategoria = z.infer<typeof clausulaCategoriaSchema>

export const CLAUSULA_CATEGORIA_LABELS: Record<ClausulaCategoria, string> = {
  OBJETO: 'Objeto',
  RESPONSABILIDADES: 'Responsabilidades da Contratada',
  OBRIGACOES: 'Obrigações da Contratante',
  DISPOSICOES: 'Disposições Gerais',
  DOCUMENTACAO: 'Envio de Documentação',
  PRIVACIDADE: 'Privacidade / LGPD',
  HONORARIOS: 'Honorários',
  EXTRAORDINARIOS: 'Serviços Extraordinários',
  VIGENCIA: 'Vigência e Rescisão',
  FORO: 'Foro',
  OUTROS: 'Outros',
}

export const contratoStatusSchema = z.enum([
  'RASCUNHO',
  'AGUARDANDO_ASSINATURA',
  'ASSINADO',
  'VIGENTE',
  'ENCERRADO',
  'CANCELADO',
])
export type ContratoStatus = z.infer<typeof contratoStatusSchema>

export const CONTRATO_STATUS_LABELS: Record<ContratoStatus, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_ASSINATURA: 'Aguardando Assinatura',
  ASSINADO: 'Assinado',
  VIGENTE: 'Vigente',
  ENCERRADO: 'Encerrado',
  CANCELADO: 'Cancelado',
}

export const CONTRATO_STATUS_COLORS: Record<ContratoStatus, string> = {
  RASCUNHO: '#94a3b8',              // slate
  AGUARDANDO_ASSINATURA: '#f59e0b', // amber
  ASSINADO: '#3b82f6',              // blue
  VIGENTE: '#10b981',               // emerald
  ENCERRADO: '#6b7280',             // gray
  CANCELADO: '#ef4444',             // red
}

export const assinaturaTipoSchema = z.enum(['WEBPKI', 'GOVBR', 'ACEITE'])
export type AssinaturaTipo = z.infer<typeof assinaturaTipoSchema>

export const assinaturaParteSchema = z.enum(['CONTRATADA', 'CONTRATANTE'])
export type AssinaturaParte = z.infer<typeof assinaturaParteSchema>

// ════════════════════════════════════════════════════════════
// Cláusulas
// ════════════════════════════════════════════════════════════

export const createClausulaSchema = z.object({
  codigo: z.string().min(1, 'Código é obrigatório'),
  titulo: z.string().min(1, 'Título é obrigatório'),
  conteudo: z.string().default(''),
  categoria: clausulaCategoriaSchema.default('OUTROS'),
  parentId: z.string().optional().nullable(),
  ordem: z.coerce.number().int().min(0).default(0),
  publicada: z.boolean().default(false),
  notasVersao: z.string().optional().nullable(),
})

// Atualizar = criar nova versão. Todos os campos do create exceto código (que
// é estável). Backend incrementa versao e despublica versão anterior se a nova
// for publicada.
export const updateClausulaSchema = z.object({
  titulo: z.string().min(1).optional(),
  conteudo: z.string().optional(),
  categoria: clausulaCategoriaSchema.optional(),
  parentId: z.string().optional().nullable(),
  ordem: z.coerce.number().int().min(0).optional(),
  publicada: z.boolean().optional(),
  notasVersao: z.string().optional().nullable(),
})

// ════════════════════════════════════════════════════════════
// Templates de Contrato
// ════════════════════════════════════════════════════════════

export const createContratoTemplateSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  descricao: z.string().optional().nullable(),
  regimeTributario: z.string().optional().nullable(),
  temIE: z.boolean().optional().nullable(),
  comMovimento: z.boolean().optional().nullable(),
  ativo: z.boolean().default(true),
})

export const updateContratoTemplateSchema = createContratoTemplateSchema.partial()

export const setTemplateClausulasSchema = z.object({
  templateId: z.string(),
  clausulas: z.array(z.object({
    clausulaId: z.string(),
    ordem: z.coerce.number().int().min(0),
    fixaVersao: z.boolean().default(false),
  })),
})

// ════════════════════════════════════════════════════════════
// Servico → Cláusula (vínculo por código)
// ════════════════════════════════════════════════════════════

export const setServicoClausulasSchema = z.object({
  servicoId: z.string(),
  codigos: z.array(z.string()),  // lista de codigos de cláusulas OBJETO
})

// ════════════════════════════════════════════════════════════
// Contratos
// ════════════════════════════════════════════════════════════

export const createContratoSchema = z.object({
  clienteId: z.string(),
  templateId: z.string(),
  orcamentoId: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFim: z.string().optional().nullable(),
  prazoAvisoDias: z.coerce.number().int().min(0).default(30),
  honorarioMensal: z.coerce.number().optional().nullable(),
  honorarioFormaPagamento: z.string().optional().nullable(),
  diaVencimento: z.coerce.number().int().min(1).max(31).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  // Snapshots dos dados do contratante (caso queira sobrescrever)
  contratanteRazaoSocial: z.string().optional().nullable(),
  contratanteCnpj: z.string().optional().nullable(),
  contratanteEndereco: z.string().optional().nullable(),
  contratanteRepresentante: z.string().optional().nullable(),
  contratanteCpfRep: z.string().optional().nullable(),
  // IDs dos serviços que entram no Objeto deste contrato
  servicoIds: z.array(z.string()).default([]),
})

export const updateContratoSchema = createContratoSchema.partial().extend({
  status: contratoStatusSchema.optional(),
  motivoEncerramento: z.string().optional().nullable(),
})

// ════════════════════════════════════════════════════════════
// Assinaturas
// ════════════════════════════════════════════════════════════

// Assinatura via Web PKI — frontend envia o certificado (subject/issuer/serial)
// e a assinatura PKCS#7 calculada pela extensão Lacuna Web PKI sobre o hash
// SHA-256 do PDF gerado.
export const assinarWebPkiSchema = z.object({
  contratoId: z.string(),
  parte: assinaturaParteSchema,
  certSubject: z.string(),
  certIssuer: z.string().optional().nullable(),
  certSerial: z.string().optional().nullable(),
  certValidoAte: z.string().optional().nullable(),
  signatarioNome: z.string(),
  signatarioDoc: z.string().optional().nullable(),
  signatarioEmail: z.string().optional().nullable(),
  pkcs7Base64: z.string(),  // assinatura calculada no cliente
  hashPdf: z.string(),       // SHA-256 hex do PDF que foi assinado
})

// Assinatura via gov.br — backend já trocou o code por access_token e chamou
// a API externa de assinarPKCS7.
export const assinarGovbrCallbackSchema = z.object({
  contratoId: z.string(),
  parte: assinaturaParteSchema,
  code: z.string(),       // authorization code retornado pelo redirect
  state: z.string(),      // CSRF
})

// Aceite simples — gera evento sem cert
export const aceitarPropostaSchema = z.object({
  contratoToken: z.string(),
  signatarioNome: z.string().min(1),
  signatarioDoc: z.string().min(1),  // CPF ou CNPJ
  signatarioEmail: z.string().email().optional().nullable(),
})

export type CreateClausulaInput = z.infer<typeof createClausulaSchema>
export type UpdateClausulaInput = z.infer<typeof updateClausulaSchema>
export type CreateContratoTemplateInput = z.infer<typeof createContratoTemplateSchema>
export type CreateContratoInput = z.infer<typeof createContratoSchema>
export type AssinarWebPkiInput = z.infer<typeof assinarWebPkiSchema>
