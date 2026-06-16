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
  'areas', 'cargos', 'clientes', 'colaboradores', 'empresas',
  'fornecedores', 'grupos-empresariais', 'obrigacoes', 'obrigacoes-fixas', 'obrigacoes-demanda',
  'servicos', 'socios', 'usuarios',
  // Comercial
  'crm', 'whatsapp', 'clausulas', 'comercial', 'contratos', 'contrato-templates',
  'custeio-clientes', 'graficos-contrato-erp',
  'orcamentos', 'pesquisas', 'comercial-relatorios', 'contratos-relatorios',
  // Administrativo
  'agenda', 'coleta-documentos', 'contatos', 'estoque', 'meus-servicos', 'minhas-obrigacoes', 'organograma',
  // Legalização
  'beneficios-fiscais', 'certificados', 'gestao-certificados', 'processos', 'quadro-societario',
  // Trabalhista
  'banco-horas', 'beneficios', 'controle-ferias', 'fgts-digital', 'folha-pagamento',
  // Fiscal
  'caixapostal', 'certidoes-cnd', 'dctfweb', 'dte',
  'obrigacoes-servicos', 'situacao-fiscal',

  // Contábil
  'bi-categorias-balancete', 'bi-faturamento',
  // TI
  'ativos', 'helpdesk', 'projetos',
  // Qualidade
  'qualidade', 'aquisicoes', 'analise-contexto', 'capacitacoes',
  'documentos-internos', 'documentos-externos', 'tabelas-registros',
  'elogios', 'melhorias', 'nao-conformidades', 'reclamacoes', 'reunioes', 'sugestoes',
  // Configurações
  'configuracoes', 'metricas', 'backup-restore',
] as const

export type ModuleSlug = (typeof MODULE_SLUGS)[number]

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  // Cadastros
  areas: 'Áreas', cargos: 'Cargos', clientes: 'Clientes', colaboradores: 'Colaboradores',
  empresas: 'Empresas', fornecedores: 'Fornecedores', 'grupos-empresariais': 'Grupos Empresariais',
  obrigacoes: 'Obrigações Acessórias',
  'obrigacoes-fixas': 'Obrigações Fixas', 'obrigacoes-demanda': 'Obrigações Sob Demanda',
  servicos: 'Serviços', socios: 'Sócios', usuarios: 'Usuários',
  // Comercial
  crm: 'CRM', whatsapp: 'WhatsApp',
  clausulas: 'Cláusulas', comercial: 'Comercial', contratos: 'Contratos',
  'contrato-templates': 'Modelos de Contrato',
  'custeio-clientes': 'Custeio por Cliente',
  'graficos-contrato-erp': 'Gráficos Contrato x ERP', orcamentos: 'Orçamentos',
  pesquisas: 'Pesquisa de Satisfação',
  'comercial-relatorios': 'Relatórios Comerciais', 'contratos-relatorios': 'Relatórios de Contratos',
  // Administrativo
  agenda: 'Agenda Corporativa', 'coleta-documentos': 'Coleta e Recebimento',
  contatos: 'Contatos', estoque: 'Controle de Estoque',
  'meus-servicos': 'Meus Serviços', 'minhas-obrigacoes': 'Minhas Obrigações', organograma: 'Organograma',
  // Legalização
  certificados: 'Certificados', 'gestao-certificados': 'Certificados Digitais',
  processos: 'Processos', 'quadro-societario': 'Quadro Societário',
  // Trabalhista
  'banco-horas': 'Banco de Horas', beneficios: 'Benefícios', 'controle-ferias': 'Controle de Férias',
  'fgts-digital': 'FGTS Digital', 'folha-pagamento': 'Importação de Folha',
  // Fiscal
  'beneficios-fiscais': 'Benefícios Fiscais', 'caixapostal': 'Caixa Postal e-CAC',
  'certidoes-cnd': "CND's Federais", danfe: 'DANFE (NFe → PDF)', dctfweb: 'DCTFWeb', dte: 'DT-e ES',
  'obrigacoes-servicos': 'Obrigações e Serviços', 'situacao-fiscal': 'Situação Fiscal',
  // Contábil
  'bi-categorias-balancete': 'Categorias de Balancete', 'bi-faturamento': 'Dashboard Financeiro',
  // TI
  ativos: 'Gestão de Ativos', helpdesk: 'HelpDesk', projetos: 'Projetos',
  // Qualidade
  qualidade: 'Painel da Qualidade', aquisicoes: 'Aquisições',
  'analise-contexto': 'Análise de Contexto', capacitacoes: 'Capacitações',
  'documentos-internos': 'Documentos Internos', 'documentos-externos': 'Documentos Externos',
  'tabelas-registros': 'Tabelas de Registros', elogios: 'Elogios',
  melhorias: 'Melhorias', 'nao-conformidades': 'Não Conformidades',
  reclamacoes: 'Reclamações', reunioes: 'Reuniões', sugestoes: 'Sugestões',
  // Configurações
  configuracoes: 'Configurações Gerais',
  metricas: 'Métricas',
  'backup-restore': 'Backup e Restore',
}

export const MODULE_GROUPS = {
  'Cadastros': ['areas', 'cargos', 'clientes', 'colaboradores', 'empresas', 'fornecedores', 'grupos-empresariais', 'obrigacoes', 'obrigacoes-fixas', 'obrigacoes-demanda', 'servicos', 'socios', 'usuarios'],
  'Comercial': ['crm', 'whatsapp', 'clausulas', 'comercial', 'contratos', 'contrato-templates', 'custeio-clientes', 'graficos-contrato-erp', 'orcamentos', 'pesquisas', 'comercial-relatorios', 'contratos-relatorios'],
  'Administrativo': ['agenda', 'coleta-documentos', 'contatos', 'estoque', 'meus-servicos', 'minhas-obrigacoes', 'organograma'],
  'Legalização': ['beneficios-fiscais', 'certificados', 'gestao-certificados', 'processos', 'quadro-societario'],
  'Trabalhista': ['banco-horas', 'beneficios', 'controle-ferias', 'fgts-digital', 'folha-pagamento'],
  'Fiscal': ['caixapostal', 'certidoes-cnd', 'dctfweb', 'dte', 'obrigacoes-servicos', 'situacao-fiscal'],
  'Contábil': ['bi-categorias-balancete', 'bi-faturamento'],
  'TI': ['ativos', 'helpdesk', 'projetos'],
  'Qualidade': ['qualidade', 'aquisicoes', 'analise-contexto', 'capacitacoes', 'documentos-internos', 'documentos-externos', 'tabelas-registros', 'elogios', 'melhorias', 'nao-conformidades', 'reclamacoes', 'reunioes', 'sugestoes'],
  'Configurações': ['configuracoes', 'metricas', 'backup-restore'],
} as const

// Sub-permissões específicas por módulo
// Módulos não listados aqui usam o padrão genérico (Visualizar/Editar/Excluir)
export interface SubPermissionDef {
  key: string
  label: string
  group?: string
  /** Observação opcional — exibida em itálico abaixo do label no modal de
   *  permissões. Útil pra sinalizar status especial ("Em desenvolvimento",
   *  "Legado — descontinuado em breve", etc). */
  observacao?: string
}

export const MODULE_SUB_PERMISSIONS: Record<string, SubPermissionDef[]> = {
  agenda: [
    { key: 'manage_config', label: 'Gerenciar configurações da agenda (regras de conflito e salas)', group: 'Configurações' },
    { key: 'manage_tipos', label: 'Gerenciar tipos de evento', group: 'Configurações' },
    { key: 'import_legado', label: 'Importar eventos do sistema legado', group: 'Configurações' },
    { key: 'manage_recorrencia', label: 'Criar eventos recorrentes', group: 'Eventos' },
    { key: 'manage_participantes', label: 'Adicionar/remover participantes', group: 'Eventos' },
    { key: 'editar_todos_eventos', label: 'Editar todos os eventos (mesmo de outros usuários)', group: 'Eventos' },
    { key: 'delete_eventos', label: 'Excluir eventos', group: 'Eventos' },
    { key: 'alterar_tipo_evento', label: 'Alterar o tipo do evento direto na prévia', group: 'Eventos' },
    { key: 'gerenciar_anotacoes_anexos', label: 'Editar/excluir anotações e anexos de outros usuários', group: 'Anotações & Anexos' },
    { key: 'ver_relatorios', label: 'Acessar relatórios da agenda', group: 'Relatórios' },
  ],
  'beneficios-fiscais': [
    { key: 'manage_catalogo', label: 'Gerenciar catálogo de benefícios', group: 'Catálogo' },
    { key: 'gerar_orcamento', label: 'Gerar orçamento a partir do benefício', group: 'Operações' },
    { key: 'delete_beneficios', label: 'Excluir vínculos de benefício', group: 'Operações' },
  ],
  whatsapp: [
    { key: 'atender', label: 'Atender (assumir e responder conversas)', group: 'Atendimento' },
    { key: 'ver_todas', label: 'Ver todas as filas/setores (não só os meus)', group: 'Escopo' },
    { key: 'transferir', label: 'Transferir conversa entre setores/atendentes', group: 'Atendimento' },
    { key: 'enviar_template', label: 'Iniciar conversa proativa (templates)', group: 'Atendimento' },
    { key: 'gerenciar_setores', label: 'Gerenciar setores e horários de atendimento', group: 'Administração' },
    { key: 'gerenciar_respostas_rapidas', label: 'Gerenciar respostas rápidas', group: 'Administração' },
    { key: 'gerenciar_templates', label: 'Gerenciar templates de mensagem', group: 'Administração' },
    { key: 'gerenciar_bot', label: 'Ligar/desligar o bot e a IA', group: 'Administração' },
    { key: 'relatorios', label: 'Acessar relatórios de atendimento', group: 'Administração' },
  ],
  caixapostal: [
    { key: 'bulk_actions', label: 'Consulta em lote e ações em massa', group: 'Ações' },
    { key: 'archive_delete', label: 'Arquivar e excluir mensagens', group: 'Ações' },
    { key: 'reclassify', label: 'Reclassificar mensagens', group: 'Ações' },
    { key: 'manage_gestao', label: 'Acesso à aba Gestão e Históricos', group: 'Gestão' },
    { key: 'dashboard_panel', label: 'Exibir painel de mensagens no Dashboard', group: 'Dashboard' },
  ],
  clientes: [
    { key: 'view_all', label: 'Visualizar todos os tipos de clientes', group: 'Gerais' },
    { key: 'edit_details', label: 'Editar detalhes do cliente', group: 'Gerais' },
    { key: 'edit_financial', label: 'Alterar particularidades no financeiro', group: 'Gerais' },
    { key: 'notify_files', label: 'Notificar vencimentos de arquivos', group: 'Gerais' },
    { key: 'manage_files', label: 'Incluir, editar e excluir arquivos do cliente', group: 'Gerais' },
    { key: 'manage_services', label: 'Gerenciar serviços contratados', group: 'Gerais' },
    { key: 'manage_responsible', label: 'Gerenciar responsáveis pelos serviços', group: 'Gerais' },
    { key: 'manage_commercial', label: 'Gerenciar aba comercial', group: 'Comercial' },
    { key: 'manage_contracts', label: 'Gerenciar contratos dos clientes', group: 'Comercial' },
    { key: 'edit_commercial', label: 'Editar particularidades no comercial', group: 'Comercial' },
    { key: 'renegotiation', label: 'Colocar clientes em situação de renegociação', group: 'Comercial' },
    { key: 'manage_fiscal', label: 'Gerenciar aba fiscal', group: 'Fiscal' },
    { key: 'edit_taxation', label: 'Alterar tributação dos clientes', group: 'Fiscal' },
    { key: 'manage_activities_benefits', label: 'Gerenciar atividades e benefícios fiscais', group: 'Fiscal' },
    { key: 'manage_registration', label: 'Gerenciar aba de registro / legalização', group: 'Registro / Legalização' },
    { key: 'manage_client_users', label: 'Gerenciar aba usuários do cliente', group: 'Usuários do Cliente' },
  ],
  orcamentos: [
    // Cadastro — espelha legado orc_cadastro
    { key: 'cadastro_completo', label: 'Cadastrar com formulário completo (tipo, validade, desconto, etc.)', group: 'Cadastro' },
    // Escopo de listagem — espelha legado acesso (1=meus, 2=financeiro, 3=area, 4=todos)
    { key: 'scope_proprios', label: 'Visualizar meus orçamentos e sob minha responsabilidade', group: 'Escopo de listagem' },
    { key: 'scope_financeiro', label: 'Visualizar orçamentos para liberação do financeiro', group: 'Escopo de listagem' },
    { key: 'scope_area', label: 'Visualizar orçamentos da minha área', group: 'Escopo de listagem' },
    { key: 'scope_todos', label: 'Visualizar todos os orçamentos em aberto', group: 'Escopo de listagem' },
    // Painéis — espelha legado painel_indicadores / painel_consultas
    { key: 'panel_indicadores', label: 'Acesso ao painel de indicadores', group: 'Painéis' },
    {
      key: 'panel_consultas',
      label: 'Acesso ao painel de consultas',
      group: 'Painéis',
      observacao: '* Reservado para desenvolvimento futuro — painel ainda não portado do legado.',
    },
    // Permissões gerais
    { key: 'manage_itens', label: 'Incluir/editar itens nos orçamentos', group: 'Ações' },
    { key: 'edit_timeline_dates', label: 'Alterar datas da timeline', group: 'Ações' },
    { key: 'mover_kanban', label: 'Mover cards no kanban (alterar status arrastando)', group: 'Ações' },
    { key: 'acao_enviar', label: 'Enviar orçamentos', group: 'Ações' },
    { key: 'acao_aprovar', label: 'Aprovar/reprovar orçamentos', group: 'Ações' },
    { key: 'acao_liberar', label: 'Liberar orçamentos', group: 'Ações' },
    { key: 'acao_encerrar', label: 'Encerrar orçamentos', group: 'Ações' },
    { key: 'acao_paralizar', label: 'Paralisar/pausar orçamentos', group: 'Ações' },
    { key: 'acao_retomar', label: 'Retomar orçamentos paralisados', group: 'Ações' },
    { key: 'acao_reabrir', label: 'Reabrir orçamentos para edição', group: 'Ações' },
    { key: 'acao_duplicar', label: 'Duplicar orçamentos', group: 'Ações' },
    { key: 'acao_arquivar', label: 'Arquivar orçamentos', group: 'Ações' },
    { key: 'change_solicitante', label: 'Alterar solicitante do orçamento', group: 'Ações' },
    { key: 'change_responsavel', label: 'Alterar responsável pelos serviços', group: 'Ações' },
    // Acesso às telas de configuração/parâmetros do módulo (catálogo, formas de
    // pagamento, textos, etc.). Master/EmpresaMaster sempre têm acesso.
    { key: 'acessar_configuracoes', label: 'Acessar configurações e parâmetros de orçamentos', group: 'Configurações' },
  ],
  helpdesk: [
    // Atuação como agente (quem tem 'canRead' já abre tickets como solicitante;
    // estas sub-perms diferenciam o agente da TI)
    { key: 'atuar_agente', label: 'Atuar como agente (assumir, atender, mudar status)', group: 'Atendimento' },
    { key: 'change_responsavel', label: 'Atribuir/reatribuir responsável', group: 'Atendimento' },
    { key: 'change_prazo', label: 'Alterar prazo/SLA do ticket', group: 'Atendimento' },
    { key: 'change_prioridade', label: 'Alterar prioridade', group: 'Atendimento' },
    { key: 'nota_interna', label: 'Escrever notas internas (não visíveis ao solicitante)', group: 'Atendimento' },
    // Escopo de listagem
    { key: 'scope_proprios', label: 'Ver tickets em que sou solicitante ou responsável', group: 'Escopo' },
    { key: 'scope_area', label: 'Ver tickets da minha área', group: 'Escopo' },
    { key: 'scope_todos', label: 'Ver todos os tickets da empresa', group: 'Escopo' },
    // Operações
    { key: 'mover_kanban', label: 'Mover cards no kanban (arrastar status)', group: 'Ações' },
    { key: 'arquivar', label: 'Arquivar tickets', group: 'Ações' },
    // Administração
    { key: 'gerenciar_categorias', label: 'Gerenciar categorias e SLA padrão', group: 'Administração' },
    { key: 'panel_metricas', label: 'Acesso ao painel de métricas', group: 'Administração' },
  ],
  'gestao-certificados': [
    { key: 'download_arquivo', label: 'Baixar arquivo PFX do certificado', group: 'Acesso ao certificado' },
    { key: 'ver_senha', label: 'Visualizar senha em claro', group: 'Acesso ao certificado' },
    { key: 'usar_assinatura', label: 'Usar para assinar documentos', group: 'Acesso ao certificado' },
    { key: 'manage_acessos', label: 'Ver trilha de auditoria completa', group: 'Auditoria' },
    { key: 'revogar', label: 'Revogar certificado', group: 'Operações' },
    { key: 'delete_certificados', label: 'Excluir certificados (individual, em massa, duplicatas)', group: 'Operações' },
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
  email: z.coerce.string().email('E-mail inválido').min(1, 'E-mail é obrigatório'),
  password: z.coerce.string().optional(),
  telefone: z.coerce.string().optional(),
  celular: z.coerce.string().optional(),
  ramal: z.coerce.string().optional(),
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
  exibirComoColaborador: z.coerce.boolean().default(false),
  // Documentos pessoais
  cpf: z.coerce.string().optional(),
  rg: z.coerce.string().optional(),
  orgaoEmissor: z.coerce.string().optional(),
  dataNascimento: z.coerce.string().optional(),
  sexo: z.coerce.string().optional(),
  estadoCivil: z.coerce.string().optional(),
  nacionalidade: z.coerce.string().optional(),
  naturalidade: z.coerce.string().optional(),
  // Documentos trabalhistas
  pis: z.coerce.string().optional(),
  ctps: z.coerce.string().optional(),
  ctpsSerie: z.coerce.string().optional(),
  tituloEleitor: z.coerce.string().optional(),
  reservista: z.coerce.string().optional(),
  // Endereço
  cep: z.coerce.string().optional(),
  logradouro: z.coerce.string().optional(),
  numero: z.coerce.string().optional(),
  complemento: z.coerce.string().optional(),
  bairro: z.coerce.string().optional(),
  cidade: z.coerce.string().optional(),
  uf: z.coerce.string().optional(),
  // Contrato / RH
  tipoContrato: z.coerce.string().optional(),
  dataDemissao: z.coerce.string().optional(),
  cargaHoraria: z.coerce.number().optional(),
  observacoes: z.coerce.string().optional(),
  permissions: z.array(permissionSchema).optional(),
})

export const updateUserSchema = z.object({
  name: z.coerce.string().min(2).optional(),
  email: z.coerce.string().email().optional(),
  password: z.coerce.string().optional(),
  telefone: z.coerce.string().optional(),
  celular: z.coerce.string().optional(),
  ramal: z.coerce.string().optional(),
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
  exibirComoColaborador: z.coerce.boolean().optional(),
  // Documentos pessoais
  cpf: z.coerce.string().optional(),
  rg: z.coerce.string().optional(),
  orgaoEmissor: z.coerce.string().optional(),
  dataNascimento: z.coerce.string().optional(),
  sexo: z.coerce.string().optional(),
  estadoCivil: z.coerce.string().optional(),
  nacionalidade: z.coerce.string().optional(),
  naturalidade: z.coerce.string().optional(),
  // Documentos trabalhistas
  pis: z.coerce.string().optional(),
  ctps: z.coerce.string().optional(),
  ctpsSerie: z.coerce.string().optional(),
  tituloEleitor: z.coerce.string().optional(),
  reservista: z.coerce.string().optional(),
  // Endereço
  cep: z.coerce.string().optional(),
  logradouro: z.coerce.string().optional(),
  numero: z.coerce.string().optional(),
  complemento: z.coerce.string().optional(),
  bairro: z.coerce.string().optional(),
  cidade: z.coerce.string().optional(),
  uf: z.coerce.string().optional(),
  // Contrato / RH
  tipoContrato: z.coerce.string().optional(),
  dataDemissao: z.coerce.string().optional(),
  cargaHoraria: z.coerce.number().optional(),
  observacoes: z.coerce.string().optional(),
  permissions: z.array(permissionSchema).optional(),
})

export const listUserSchema = paginationSchema.extend({
  role: z.enum(ROLE_VALUES).optional(),
  empresaId: z.string().optional(),
  incluirInativos: z.coerce.boolean().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ListUserInput = z.infer<typeof listUserSchema>
export type PermissionInput = z.infer<typeof permissionSchema>
