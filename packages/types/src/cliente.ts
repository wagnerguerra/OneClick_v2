import { z } from 'zod'
import { paginationSchema } from './pagination'
import { limparCnpj } from './documento'

// ============================================================
// Enums e Labels
// ============================================================

// #HLP0210 (Fase 2) — só MENSAL/AVULSO/PROSPECT/PARALIZADO. EM_CONSTITUICAO/POTENCIAL/
// PRE_OPERACIONAL viraram PROSPECT. PARALIZADO fica (legado dos existentes).
export const ClienteSituacao = {
  MENSAL: 'MENSAL',
  AVULSO: 'AVULSO',
  PROSPECT: 'PROSPECT',
  PARALIZADO: 'PARALIZADO',
} as const
export type ClienteSituacao = (typeof ClienteSituacao)[keyof typeof ClienteSituacao]

export const SITUACAO_LABELS: Record<ClienteSituacao, string> = {
  MENSAL: 'Mensal',
  AVULSO: 'Avulso',
  PROSPECT: 'Prospect',
  PARALIZADO: 'Paralizado',
}

export const SITUACAO_COLORS: Record<ClienteSituacao, { bg: string; color: string }> = {
  MENSAL: { bg: '#5ea3cb', color: '#ffffff' },
  AVULSO: { bg: '#64748b', color: '#ffffff' },
  PROSPECT: { bg: '#10b981', color: '#ffffff' },
  PARALIZADO: { bg: '#ef4444', color: '#ffffff' },
}

// #HLP0209/0211 — `status` é o indicador de soft-delete do cliente: só Ativo/Inativo
// (masculino, refere-se a "cliente"). Os valores antigos SUSPENSA/BAIXADA/INAPTA/NULA
// entraram por engano e foram colapsados em INATIVO. "Ex-cliente" é estado DERIVADO
// (situacao=MENSAL ∧ status=INATIVO ∧ dataSaida), não um valor aqui.
export const ClienteStatus = {
  ATIVO: 'ATIVO',
  INATIVO: 'INATIVO',
} as const
export type ClienteStatus = (typeof ClienteStatus)[keyof typeof ClienteStatus]

export const STATUS_LABELS: Record<ClienteStatus, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
}

// Hex do badge SÓLIDO do cabeçalho do detalhe. Alinhado à convenção do frontend
// (ver apps/web/.../clientes/_components/cliente-status-ui.ts): Ativo=emerald, Inativo=amber.
export const STATUS_COLORS: Record<ClienteStatus, { bg: string; color: string }> = {
  ATIVO: { bg: '#10b981', color: '#ffffff' },
  INATIVO: { bg: '#d97706', color: '#ffffff' },
}

export const TipoDocumento = {
  CNPJ: 'CNPJ',
  CPF: 'CPF',
} as const
export type TipoDocumento = (typeof TipoDocumento)[keyof typeof TipoDocumento]

export const RegimeContabil = {
  CAIXA: 'CAIXA',
  COMPETENCIA: 'COMPETENCIA',
} as const
export type RegimeContabil = (typeof RegimeContabil)[keyof typeof RegimeContabil]

export const REGIME_LABELS: Record<RegimeContabil, string> = {
  CAIXA: 'Caixa',
  COMPETENCIA: 'Competência',
}

export const AREA_CONTRATADA_OPTIONS = [
  { value: 'Contabil', label: 'Contábil', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'Fiscal', label: 'Fiscal', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  { value: 'Trabalhista', label: 'Trabalhista', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'Societario', label: 'Societário', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { value: 'Legalizacao', label: 'Legalização', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
] as const

// ============================================================
// Schemas Zod
// ============================================================

export const createClienteSchema = z.object({
  // Identificação
  razaoSocial: z.coerce.string().min(2, 'Razão Social é obrigatória'),
  nomeFantasia: z.coerce.string().optional().or(z.literal('')),
  // Documento OPCIONAL — aceita CPF (11 díg.) ou CNPJ (14 díg.). Vazio é
  // permitido (ex.: prospect/lead sem documento ainda).
  documento: z.coerce.string()
    .refine(
      // limparCnpj preserva letras do CNPJ alfanumérico (CPF é sempre numérico).
      (v) => { const d = limparCnpj(v); return d.length === 0 || d.length === 11 || d.length === 14 },
      'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)',
    )
    .optional()
    .or(z.literal('')),
  tipoDocumento: z.enum(['CNPJ', 'CPF']).default('CNPJ'),
  // Matriz/filial no CNPJ alfanumérico (Fase 3): true=matriz, false=filial,
  // null/ausente=derivar pelo /0001 (numérico). Ver ehMatrizCnpj.
  ehMatriz: z.boolean().optional().nullable(),
  tipoCliente: z.coerce.string().optional().or(z.literal('')),

  // Integração
  idSistema: z.coerce.string().optional().or(z.literal('')),
  idOmie: z.coerce.string().optional().or(z.literal('')),
  omieEmpresa: z.coerce.string().optional().or(z.literal('')),
  idOneClick: z.coerce.string().optional().or(z.literal('')),

  // Comercial
  situacao: z.enum(['MENSAL', 'AVULSO', 'PROSPECT', 'PARALIZADO']).default('MENSAL'),
  status: z.enum(['ATIVO', 'INATIVO']).default('ATIVO'),
  grupo: z.coerce.string().optional().or(z.literal('')),
  categoria: z.coerce.string().optional().or(z.literal('')),
  origem: z.coerce.string().optional().or(z.literal('')),
  /** Abertura na Receita — não é a entrada na casa, que é `dataEntrada`. */
  dataAbertura: z.coerce.string().optional().or(z.literal('')),
  dataEntrada: z.coerce.string().optional().or(z.literal('')),
  dataSaida: z.coerce.string().optional().or(z.literal('')),
  observacoes: z.coerce.string().optional().or(z.literal('')),

  // Fiscal
  tributacao: z.enum(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI', 'IMUNE', 'ISENTA']).nullish(),
  regime: z.enum(['CAIXA', 'COMPETENCIA']).nullish(),
  /** ME, EPP, DEMAIS — texto livre: a nomenclatura muda com a lei. */
  porte: z.coerce.string().optional().or(z.literal('')),
  /** Retrato da Receita na última coleta; não é o `status` do cliente aqui. */
  situacaoCadastral: z.coerce.string().optional().or(z.literal('')),
  inscricaoEstadual: z.coerce.string().optional().or(z.literal('')),
  inscricaoMunicipal: z.coerce.string().optional().or(z.literal('')),

  // Características fiscais — `nullish` em todos: null é "não informado", que
  // não é a mesma coisa que "não". Um false aqui afirma algo que ninguém apurou.
  apuracaoLucroReal: z.enum(['TRIMESTRAL', 'ANUAL', 'ESTIMATIVA']).nullish(),
  fatorR: z.boolean().nullish(),
  apuraIssPorFora: z.boolean().nullish(),
  apuraIcmsPorFora: z.boolean().nullish(),
  possuiProLabore: z.boolean().nullish(),
  possuiFuncionarios: z.boolean().nullish(),
  semMovimento: z.boolean().nullish(),

  // Áreas contratadas (semicolon-separated string)
  areasContratadas: z.coerce.string().optional().or(z.literal('')),

  // Legalização
  naturezaJuridica: z.coerce.string().optional().or(z.literal('')),
  nire: z.coerce.string().optional().or(z.literal('')),
  rgEdificacao: z.coerce.string().optional().or(z.literal('')),
  codigoSimples: z.coerce.string().optional().or(z.literal('')),
  bombeirosOcupacao: z.coerce.string().optional().or(z.literal('')),
  bombeirosMetragem: z.coerce.string().optional().or(z.literal('')),
  bombeirosRota: z.coerce.string().optional().or(z.literal('')),
  bombeirosProjeto: z.coerce.string().optional().or(z.literal('')),
  bombeirosCapacidade: z.coerce.string().optional().or(z.literal('')),
  cnaePrincipal: z.coerce.string().optional().or(z.literal('')),

  // Endereço
  cep: z.coerce.string().optional().or(z.literal('')),
  logradouro: z.coerce.string().optional().or(z.literal('')),
  numero: z.coerce.string().optional().or(z.literal('')),
  complemento: z.coerce.string().optional().or(z.literal('')),
  bairro: z.coerce.string().optional().or(z.literal('')),
  cidade: z.coerce.string().optional().or(z.literal('')),
  uf: z.coerce.string().optional().or(z.literal('')),

  // Contato
  telefone: z.coerce.string().optional().or(z.literal('')),
  email: z.coerce.string().optional().or(z.literal('')),

  // Logo
  logoUrl: z.coerce.string().optional().or(z.literal('')),

  // Controle
  isActive: z.coerce.boolean().default(true),
})

export const updateClienteSchema = createClienteSchema.partial()

export const listClienteSchema = paginationSchema.extend({
  situacao: z.enum(['MENSAL', 'AVULSO', 'PROSPECT', 'PARALIZADO']).optional(),
  status: z.enum(['ATIVO', 'INATIVO']).optional(),
  // #HLP0209 — "Todos": lista ativos E inativos (sem o filtro-padrão que oculta INATIVO).
  incluirInativos: z.coerce.boolean().optional(),
  // #HLP0210 (Fase 3) — "Somente Ex-clientes": estado derivado = MENSAL ∧ INATIVO ∧ dataSaida
  // preenchida. Quando true, ignora situacao/status/incluirInativos e aplica essa regra.
  exCliente: z.coerce.boolean().optional(),
  // '__sem__' filtra quem está SEM tributação preenchida — mesma sentinela
  // de comBeneficio/comServico, para a tela falar uma língua só.
  tributacao: z.enum(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI', 'IMUNE', 'ISENTA', '__sem__']).optional(),
  grupo: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  // Novos filtros (paridade com a tela de clientes)
  numero: z.string().optional(),         // busca pelo nº (code) do cliente
  tipoCliente: z.string().optional(),    // Tipo de Cliente
  atividade: z.string().optional(),      // possui atividade com este valor
  areaContratada: z.string().optional(), // possui área contratada (nome)
  // Benefício: '__com__' (qualquer), '__sem__' (nenhum) ou um valor específico
  comBeneficio: z.string().optional(),
  // Serviço contratado: '__com__' (tem alguma área contratada) ou '__sem__'.
  // Mesmo par de sentinelas do benefício, para a tela filtrar do mesmo jeito.
  comServico: z.string().optional(),
  isLead: z.boolean().optional(),
  /**
   * Quando true (default), lista apenas matrizes (CNPJ com ordem 0001).
   * Filiais ficam ocultas e são exibidas via modal ao clicar na badge
   * de filiais da matriz. Use false pra mostrar todas as inscrições.
   */
  /**
   * Aninhar filial sob a matriz na listagem.
   *
   * Passou a nascer DESLIGADO. Ligado, a lista contava GRUPOS enquanto os
   * indicadores contavam CLIENTES, e os dois números nunca fechavam: "Lucro
   * Real 54" abria uma tabela de 41 linhas, "Mensais 251" mostrava 216. As 13
   * que faltavam existiam — estavam dobradas dentro da linha da matriz, atrás
   * do selo "N filiais".
   *
   * Um cadastro de clientes lista clientes: cada filial tem CNPJ próprio,
   * serviços próprios e regime próprio, então merece a própria linha. O selo
   * continua ali, agora só como atalho para o grupo, sem esconder ninguém.
   */
  agruparMatriz: z.coerce.boolean().optional().default(false),
})

export type CreateClienteInput = z.infer<typeof createClienteSchema>
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>
export type ListClienteInput = z.infer<typeof listClienteSchema>
