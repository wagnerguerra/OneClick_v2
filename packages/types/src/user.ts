import { z } from 'zod'
import { paginationSchema } from './pagination'

export const UserRole = {
  COLABORADOR_INTERNO: 'COLABORADOR_INTERNO',
  PRESTADOR_SERVICO: 'PRESTADOR_SERVICO',
  COLABORADOR_CLIENTE: 'COLABORADOR_CLIENTE',
  GESTOR: 'GESTOR',
  COORDENADOR: 'COORDENADOR',
  DIRETOR: 'DIRETOR',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  COLABORADOR_INTERNO: 'Colaborador Interno',
  PRESTADOR_SERVICO: 'Prestador de Serviço',
  COLABORADOR_CLIENTE: 'Colaborador de Cliente',
  GESTOR: 'Gestor',
  COORDENADOR: 'Coordenador',
  DIRETOR: 'Diretor',
}

const ROLE_VALUES = ['COLABORADOR_INTERNO', 'PRESTADOR_SERVICO', 'COLABORADOR_CLIENTE', 'GESTOR', 'COORDENADOR', 'DIRETOR'] as const

export const UserProfileEnum = {
  OPERADOR: 'OPERADOR',
  SUPERVISOR: 'SUPERVISOR',
  GERENTE: 'GERENTE',
  ADMIN: 'ADMIN',
} as const

export type UserProfileType = (typeof UserProfileEnum)[keyof typeof UserProfileEnum]

export const USER_PROFILE_LABELS: Record<UserProfileType, string> = {
  OPERADOR: 'Operador',
  SUPERVISOR: 'Supervisor',
  GERENTE: 'Gerente',
  ADMIN: 'Administrador',
}

export const PROFILE_VALUES = ['OPERADOR', 'SUPERVISOR', 'GERENTE', 'ADMIN'] as const

export const MODULE_SLUGS = [
  'dashboard',
  // Cadastros
  'areas', 'cargos', 'colaboradores', 'clientes', 'empresas',
  'fornecedores', 'obrigacoes-fixas', 'obrigacoes-demanda', 'socios', 'usuarios',
  // Corporativo
  'agenda', 'coleta-documentos', 'contatos', 'ativos', 'estoque',
  'crm', 'beneficios-fiscais', 'certificados', 'contratos', 'helpdesk',
  'obrigacoes-servicos', 'orcamentos', 'processos', 'projetos', 'quadro-societario',
  // Qualidade
  'qualidade', 'aquisicoes', 'analise-contexto', 'capacitacoes',
  'documentos-internos', 'documentos-externos', 'tabelas-registros',
  'elogios', 'melhorias', 'nao-conformidades', 'reclamacoes', 'reunioes', 'sugestoes',
  // Configurações
  'configuracoes',
] as const

export type ModuleSlug = (typeof MODULE_SLUGS)[number]

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  areas: 'Áreas', cargos: 'Cargos', colaboradores: 'Colaboradores',
  clientes: 'Clientes', empresas: 'Empresas', fornecedores: 'Fornecedores',
  'obrigacoes-fixas': 'Obrigações Fixas', 'obrigacoes-demanda': 'Obrigações Sob Demanda',
  socios: 'Sócios', usuarios: 'Usuários',
  agenda: 'Agenda Corporativa', 'coleta-documentos': 'Coleta de Documentos',
  contatos: 'Contatos', ativos: 'Controle de Ativos', estoque: 'Controle de Estoque',
  crm: 'CRM', 'beneficios-fiscais': 'Benefícios Fiscais', certificados: 'Certificados',
  contratos: 'Contratos', helpdesk: 'HelpDesk',
  'obrigacoes-servicos': 'Obrigações e Serviços', orcamentos: 'Orçamentos',
  processos: 'Processos', projetos: 'Projetos', 'quadro-societario': 'Quadro Societário',
  qualidade: 'Painel da Qualidade', aquisicoes: 'Aquisições',
  'analise-contexto': 'Análise de Contexto', capacitacoes: 'Capacitações',
  'documentos-internos': 'Documentos Internos', 'documentos-externos': 'Documentos Externos',
  'tabelas-registros': 'Tabelas de Registros', elogios: 'Elogios',
  melhorias: 'Melhorias', 'nao-conformidades': 'Não Conformidades',
  reclamacoes: 'Reclamações', reunioes: 'Reuniões', sugestoes: 'Sugestões',
  configuracoes: 'Configurações Gerais',
}

export const MODULE_GROUPS = {
  'Cadastros': ['areas', 'cargos', 'colaboradores', 'clientes', 'empresas', 'fornecedores', 'obrigacoes-fixas', 'obrigacoes-demanda', 'socios', 'usuarios'],
  'Corporativo': ['agenda', 'coleta-documentos', 'contatos', 'ativos', 'estoque', 'crm', 'beneficios-fiscais', 'certificados', 'contratos', 'helpdesk', 'obrigacoes-servicos', 'orcamentos', 'processos', 'projetos', 'quadro-societario'],
  'Qualidade': ['qualidade', 'aquisicoes', 'analise-contexto', 'capacitacoes', 'documentos-internos', 'documentos-externos', 'tabelas-registros', 'elogios', 'melhorias', 'nao-conformidades', 'reclamacoes', 'reunioes', 'sugestoes'],
  'Configurações': ['configuracoes'],
} as const

// Sub-permissões específicas por módulo
// Módulos não listados aqui usam o padrão genérico (Visualizar/Editar/Excluir)
export interface SubPermissionDef {
  key: string
  label: string
  group?: string
}

export const MODULE_SUB_PERMISSIONS: Record<string, SubPermissionDef[]> = {
  clientes: [
    { key: 'view_all', label: 'Visualizar todos os tipos de clientes', group: 'Gerais' },
    { key: 'edit_details', label: 'Editar detalhes do cliente', group: 'Gerais' },
    { key: 'edit_financial', label: 'Alterar particularidades no financeiro', group: 'Gerais' },
    { key: 'notify_files', label: 'Notificar vencimentos de arquivos', group: 'Gerais' },
    { key: 'manage_services', label: 'Gerenciar serviços contratados', group: 'Gerais' },
    { key: 'manage_responsible', label: 'Gerenciar responsáveis pelos serviços', group: 'Gerais' },
    { key: 'manage_commercial', label: 'Gerenciar aba comercial', group: 'Comercial' },
    { key: 'manage_contracts', label: 'Gerenciar contratos dos clientes', group: 'Comercial' },
    { key: 'edit_commercial', label: 'Editar particularidades no comercial', group: 'Comercial' },
    { key: 'renegotiation', label: 'Colocar clientes em situação de renegociação', group: 'Comercial' },
    { key: 'manage_fiscal', label: 'Gerenciar aba fiscal', group: 'Fiscal' },
    { key: 'edit_taxation', label: 'Alterar tributação dos clientes', group: 'Fiscal' },
    { key: 'manage_registration', label: 'Gerenciar aba de registro / legalização', group: 'Registro / Legalização' },
    { key: 'manage_client_users', label: 'Gerenciar aba usuários do cliente', group: 'Usuários do Cliente' },
  ],
}

export const permissionSchema = z.object({
  moduleSlug: z.string(),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  subPermissions: z.record(z.boolean()).optional(),
})

export const createUserSchema = z.object({
  name: z.coerce.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.coerce.string().min(1, 'E-mail é obrigatório'),
  password: z.coerce.string().optional(),
  telefone: z.coerce.string().optional(),
  role: z.coerce.string().optional().default('COLABORADOR_INTERNO'),
  profile: z.coerce.string().optional().default('OPERADOR'),
  empresaId: z.coerce.string().optional(),
  areaId: z.coerce.string().optional(),
  cargoId: z.coerce.string().optional(),
  salario: z.any().optional(),
  dataAdmissao: z.coerce.string().optional(),
  idOneClick: z.coerce.string().optional(),
  incluirFerias: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().default(true),
  permissions: z.array(permissionSchema).optional(),
})

export const updateUserSchema = z.object({
  name: z.coerce.string().min(2).optional(),
  email: z.coerce.string().email().optional(),
  password: z.coerce.string().optional(),
  telefone: z.coerce.string().optional(),
  role: z.coerce.string().optional(),
  profile: z.coerce.string().optional(),
  empresaId: z.coerce.string().optional(),
  areaId: z.coerce.string().optional(),
  cargoId: z.coerce.string().optional(),
  salario: z.any().optional(),
  dataAdmissao: z.coerce.string().optional(),
  idOneClick: z.coerce.string().optional(),
  incluirFerias: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  permissions: z.array(permissionSchema).optional(),
})

export const listUserSchema = paginationSchema.extend({
  role: z.enum(ROLE_VALUES).optional(),
  empresaId: z.string().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ListUserInput = z.infer<typeof listUserSchema>
export type PermissionInput = z.infer<typeof permissionSchema>
