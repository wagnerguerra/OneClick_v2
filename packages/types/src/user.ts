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
  'agenda', 'acessorias', 'coleta-documentos', 'contatos', 'estoque', 'meus-servicos', 'minhas-obrigacoes', 'organograma',
  // Legalização
  'beneficios-fiscais', 'gestao-certificados', 'processos', 'quadro-societario',
  // Trabalhista
  'banco-horas', 'beneficios', 'controle-ferias', 'fgts-digital', 'folha-pagamento', 'folha-bi',
  // Fiscal
  'caixapostal', 'certidoes-cnd', 'dctfweb', 'dte',
  'obrigacoes-servicos', 'situacao-fiscal', 'reforma-tributaria', 'ferramentas-fiscal',

  // Contábil
  'bi-categorias-balancete', 'bi-faturamento', 'ferramentas-contabil', 'tratamento-lancamentos',
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

/**
 * Módulos de administração da PLATAFORMA (config de sistema global que afeta
 * TODOS os tenants: integrações Stripe/SMTP/Banco/SERPRO/OpenAI/S3, métricas e
 * backup). Acesso restrito ao MASTER global — jamais concedidos a roles de
 * empresa/não-master. Filtrados em getMyPermissions e não concedidos no
 * onboarding; rotas correspondentes são bloqueadas no servidor (middleware).
 * F-009 (broken access control).
 */
export const PLATFORM_ADMIN_MODULES = ['configuracoes', 'metricas', 'backup-restore'] as const

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
  acessorias: 'Acessórias',
  // Legalização
  'gestao-certificados': 'Certificados Digitais',
  processos: 'Processos', 'quadro-societario': 'Quadro Societário',
  // Trabalhista
  'banco-horas': 'Banco de Horas', beneficios: 'Benefícios', 'controle-ferias': 'Controle de Férias',
  'fgts-digital': 'FGTS Digital', 'folha-pagamento': 'Importação de Folha', 'folha-bi': 'Espelho da Folha',
  // Fiscal
  'beneficios-fiscais': 'Benefícios Fiscais', 'caixapostal': 'Caixa Postal e-CAC',
  'certidoes-cnd': "CND's Federais", danfe: 'DANFE (NFe → PDF)', dctfweb: 'DCTFWeb', dte: 'DT-e ES',
  'obrigacoes-servicos': 'Obrigações e Serviços', 'situacao-fiscal': 'Situação Fiscal',
  'reforma-tributaria': 'Reforma Tributária', 'ferramentas-fiscal': 'Ferramentas',
  // Contábil
  'bi-categorias-balancete': 'Categorias de Balancete', 'bi-faturamento': 'Dashboard Financeiro',
  'ferramentas-contabil': 'Ferramentas',
  'tratamento-lancamentos': 'Tratamento de Lançamentos',
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
  'Administrativo': ['agenda', 'acessorias', 'coleta-documentos', 'contatos', 'estoque', 'meus-servicos', 'minhas-obrigacoes', 'organograma'],
  'Legalização': ['beneficios-fiscais', 'gestao-certificados', 'processos', 'quadro-societario'],
  'Trabalhista': ['banco-horas', 'beneficios', 'controle-ferias', 'fgts-digital', 'folha-pagamento', 'folha-bi'],
  'Fiscal': ['caixapostal', 'certidoes-cnd', 'dctfweb', 'dte', 'obrigacoes-servicos', 'situacao-fiscal', 'reforma-tributaria', 'ferramentas-fiscal'],
  'Contábil': ['bi-categorias-balancete', 'bi-faturamento', 'ferramentas-contabil', 'tratamento-lancamentos'],
  'TI': ['ativos', 'helpdesk', 'projetos'],
  'Qualidade': ['qualidade', 'aquisicoes', 'analise-contexto', 'capacitacoes', 'documentos-internos', 'documentos-externos', 'tabelas-registros', 'elogios', 'melhorias', 'nao-conformidades', 'reclamacoes', 'reunioes', 'sugestoes'],
  'Configurações': ['configuracoes', 'metricas', 'backup-restore'],
} as const

// Sub-permissões específicas por módulo
// Módulos não listados aqui usam o padrão genérico (Visualizar/Editar/Excluir)
export interface SubPermissionChoice {
  value: string
  label: string
}

export interface SubPermissionDef {
  key: string
  label: string
  group?: string
  /** Observação opcional — exibida em itálico abaixo do label no modal de
   *  permissões. Útil pra sinalizar status especial ("Em desenvolvimento",
   *  "Legado — descontinuado em breve", etc). */
  observacao?: string
  /**
   * `toggle` (padrão) grava boolean; `choice` grava a string escolhida e é
   * renderizado como barra segmentada de opção única. Use `choice` quando as
   * alternativas forem mutuamente exclusivas — marcar duas não faria sentido.
   */
  type?: 'toggle' | 'choice'
  /** Opções de um `type: 'choice'` — a primeira serve de padrão se `default` faltar. */
  options?: SubPermissionChoice[]
  /** Valor assumido quando o usuário nunca foi configurado. `choice` nunca fica vazio. */
  default?: string
}

// ── Escopo de listagem de orçamentos ──────────────────────────────────────
// Espelha o legado (acesso 1=meus, 2=financeiro, 3=área, 4=todos): é UMA
// escolha, não um conjunto de flags.

export type OrcamentoScope = 'proprios' | 'financeiro' | 'area' | 'todos'

export const ORCAMENTO_SCOPE_OPTIONS: SubPermissionChoice[] = [
  { value: 'proprios',   label: 'Meus e sob minha responsabilidade' },
  { value: 'financeiro', label: 'Para liberação do financeiro' },
  { value: 'area',       label: 'Todos da minha área' },
  { value: 'todos',      label: 'Todos em aberto' },
]

export const ORCAMENTO_SCOPE_DEFAULT: OrcamentoScope = 'proprios'

const ORCAMENTO_SCOPE_VALUES = new Set<string>(ORCAMENTO_SCOPE_OPTIONS.map(o => o.value))

/**
 * Resolve o escopo de listagem de orçamentos a partir das sub-permissões gravadas.
 *
 * #HLP0266 — antes eram 4 toggles independentes resolvidos no frontend, e quem
 * não tinha nenhum caía em 'todos': era por isso que todo mundo enxergava todos
 * os orçamentos. Agora é escolha única, com 'proprios' como padrão E fallback.
 *
 * Aceita o formato antigo (booleans `scope_*`) pra não exigir migração de dados:
 * o mais permissivo vence, preservando o que cada usuário já enxergava. A escolha
 * nova (`scope`) tem precedência — assim que um admin salvar a tela, os toggles
 * legados param de influenciar.
 */
export function resolveOrcamentoScope(
  subPermissions: Record<string, unknown> | null | undefined,
): OrcamentoScope {
  const subs = subPermissions ?? {}

  const escolhido = subs['scope']
  if (typeof escolhido === 'string' && ORCAMENTO_SCOPE_VALUES.has(escolhido)) {
    return escolhido as OrcamentoScope
  }

  // Compatibilidade com o modelo antigo — mais permissivo vence.
  if (subs['scope_todos'] === true) return 'todos'
  if (subs['scope_area'] === true) return 'area'
  if (subs['scope_financeiro'] === true) return 'financeiro'
  // `scope_proprios` e "nada configurado" caem no mesmo lugar.
  return ORCAMENTO_SCOPE_DEFAULT
}

// ── Escopo de listagem do HelpDesk ────────────────────────────────────────
// Mesma ideia dos orçamentos (#HLP0139): é UMA escolha (proprios ⊂ area ⊂ todos),
// não flags soltas que podiam ser ligadas juntas sem sentido.

export type HelpdeskScope = 'proprios' | 'area' | 'todos'

export const HELPDESK_SCOPE_OPTIONS: SubPermissionChoice[] = [
  { value: 'proprios', label: 'Só os meus (solicitante ou responsável)' },
  { value: 'area',     label: 'Os da minha área' },
  { value: 'todos',    label: 'Todos os tickets da empresa' },
]

export const HELPDESK_SCOPE_DEFAULT: HelpdeskScope = 'proprios'

/** Ordem de abrangência — usada pra clampar o escopo pedido ao permitido. */
export const HELPDESK_SCOPE_RANK: Record<HelpdeskScope, number> = { proprios: 0, area: 1, todos: 2 }

const HELPDESK_SCOPE_VALUES = new Set<string>(HELPDESK_SCOPE_OPTIONS.map(o => o.value))

/**
 * Resolve o escopo de listagem do HelpDesk a partir das sub-permissões gravadas.
 * Escolha única (`scope`) tem precedência; aceita o formato antigo (3 toggles
 * `scope_*`) pra não exigir migração — o mais permissivo vence. Padrão/fallback
 * é 'proprios'.
 */
export function resolveHelpdeskScope(
  subPermissions: Record<string, unknown> | null | undefined,
): HelpdeskScope {
  const subs = subPermissions ?? {}
  const escolhido = subs['scope']
  if (typeof escolhido === 'string' && HELPDESK_SCOPE_VALUES.has(escolhido)) {
    return escolhido as HelpdeskScope
  }
  if (subs['scope_todos'] === true) return 'todos'
  if (subs['scope_area'] === true) return 'area'
  return HELPDESK_SCOPE_DEFAULT
}

export const MODULE_SUB_PERMISSIONS: Record<string, SubPermissionDef[]> = {
  // Ferramentas (integração webapp). Sub-permissão por tool = opt-out:
  // desmarcar bloqueia aquela ferramenta; marcado/ausente = liberado.
  'ferramentas-fiscal': [
    { key: 'sped', label: 'SPED → XLSX', group: 'Ferramentas' },
    { key: 'nfe', label: 'NFe XML → XLSX', group: 'Ferramentas' },
    { key: 'sped-merge', label: 'XLSX → SPED (merge)', group: 'Ferramentas' },
    { key: 'sci-consolidado', label: 'Consolidado SCI', group: 'Ferramentas' },
    { key: 'comparacao-planilhas', label: 'Comparador SEFAZ × SCI', group: 'Ferramentas' },
    { key: 'comparacao-nfse', label: 'Comparador NFS-e (OCR)', group: 'Ferramentas' },
    { key: 'sci-portal-nacional', label: 'Conciliador NFS-e (Portal Nacional)', group: 'Ferramentas' },
    { key: 'nfse-pdf', label: 'NFS-e → PDF (DANFSe)', group: 'Ferramentas' },
  ],
  'ferramentas-contabil': [
    { key: 'gnre', label: 'Extrator GNRE', group: 'Ferramentas' },
    { key: 'extrato-edit', label: 'Editor de Extrato', group: 'Ferramentas' },
  ],
  'tratamento-lancamentos': [
    { key: 'gerenciar_modelos', label: 'Gerenciar modelos de tratamento (criar, editar, duplicar e excluir)', group: 'Modelos' },
  ],
  beneficios: [
    { key: 'gerir_beneficios', label: 'Responsável pelo módulo (gerenciar tudo)', group: 'Configurações' },
    { key: 'lancar_apontamentos', label: 'Lançar apontamentos do seu setor (férias, licenças, ausências, faltas, plantões)', group: 'Apontamentos' },
  ],
  crm: [
    { key: 'acessar_funil_lead', label: 'Acessar o funil de captação de leads por IA (ver campanhas e relatórios)', group: 'Funil de captação' },
    { key: 'gerir_funil_lead', label: 'Configurar o funil de captação de leads por IA (criar/editar campanhas, trilha/rubrica)', group: 'Funil de captação' },
  ],
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
  'meus-servicos': [
    {
      key: 'concluir_sem_checklist',
      label: 'Concluir serviço sem cumprir o checklist (ignora passos obrigatórios pendentes)',
      group: 'Execução',
      observacao: 'Uso na fase de implantação do módulo — permite finalizar a execução mesmo com passos obrigatórios em aberto.',
    },
  ],
  acessorias: [
    {
      key: 'ver_painel_entregas',
      label: 'Ver o painel de entregas e leitura das guias',
      group: 'Acompanhamento',
      observacao: 'É a tela que mostra quais clientes ainda não abriram a guia antes do vencimento — quem cobra o cliente precisa dela.',
    },
    {
      key: 'gerenciar_integracao',
      label: 'Gerenciar a integração (sincronizar empresas, obrigações e entregas)',
      group: 'Integração',
    },
    {
      key: 'conciliar_cadastro',
      label: 'Conciliar divergências e gravar os dados do Acessórias no cadastro de clientes',
      group: 'Integração',
      observacao: 'Permite aplicar no cliente o que vem do Acessórias (razão social, telefone, datas). Altera o cadastro.',
    },
  ],
  aquisicoes: [
    {
      key: 'aprovar_pedidos',
      label: 'Aprovar e reprovar pedidos de compra',
      group: 'Aprovação',
      observacao: 'Quem tem esta marca é aprovador. Também pode ser concedida em Aquisições › Configurações › Aprovadores — é a mesma permissão, vista dos dois lados.',
    },
    {
      key: 'gerenciar_configuracoes',
      label: 'Gerenciar configurações do módulo (aprovadores e critérios de avaliação)',
      group: 'Configurações',
    },
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
    { key: 'create_client', label: 'Cadastrar novos clientes', group: 'Gerais' },
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
    // Escopo de listagem — espelha legado acesso (1=meus, 2=financeiro, 3=area,
    // 4=todos). Escolha única, nunca vazia (#HLP0266).
    {
      key: 'scope',
      // Sem label: o título do grupo já nomeia a escolha, e a barra segmentada
      // é a única coisa dentro dele.
      label: '',
      group: 'Escopo de visualização',
      type: 'choice',
      options: ORCAMENTO_SCOPE_OPTIONS,
      default: ORCAMENTO_SCOPE_DEFAULT,
      observacao: 'Define quais orçamentos o usuário pode visualizar.',
    },
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
    { key: 'enviar_pesquisa', label: 'Enviar/copiar o link da pesquisa de satisfação', group: 'Ações' },
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
    { key: 'gerir_modelos_proposta', label: 'Gerir a biblioteca de modelos de proposta (referência da IA)', group: 'Configurações' },
    { key: 'gerir_pesquisas', label: 'Gerir a pesquisa de satisfação (cadastro/versões)', group: 'Configurações' },
  ],
  helpdesk: [
    // Escopo de listagem — escolha única (#HLP0139). proprios ⊂ area ⊂ todos.
    // Primeiro bloco da lista.
    {
      key: 'scope',
      label: '',
      group: 'Escopo de visualização',
      type: 'choice',
      options: HELPDESK_SCOPE_OPTIONS,
      default: HELPDESK_SCOPE_DEFAULT,
      observacao: 'Define quais tickets o usuário pode visualizar na listagem.',
    },
    // Atendimento — quem tem 'canRead' já abre tickets como solicitante; estas
    // sub-perms diferenciam o agente da TI. "Atuar como agente" engloba mover
    // cards no kanban e escrever notas internas (não são mais permissões à parte).
    { key: 'atuar_agente', label: 'Atuar como agente (assumir, atender, mudar status, mover cards no kanban, notas internas)', group: 'Atendimento' },
    { key: 'change_responsavel', label: 'Atribuir/reatribuir responsável', group: 'Atendimento' },
    { key: 'change_prazo', label: 'Alterar prazo/SLA do ticket', group: 'Atendimento' },
    { key: 'change_prioridade', label: 'Alterar prioridade', group: 'Atendimento' },
    { key: 'arquivar', label: 'Arquivar tickets', group: 'Atendimento' },
    // Administração
    { key: 'gerenciar_categorias', label: 'Gerenciar categorias e SLA padrão', group: 'Administração' },
    { key: 'panel_metricas', label: 'Acesso ao painel completo de indicadores', group: 'Administração' },
  ],
  'gestao-certificados': [
    { key: 'acessar_certificados', label: 'Acessar certificados (arquivos PFX e senhas)', group: 'Acesso ao certificado' },
    { key: 'usar_assinatura', label: 'Usar para assinar documentos', group: 'Acesso ao certificado' },
    { key: 'manage_acessos', label: 'Ver trilha de auditoria completa', group: 'Auditoria' },
    { key: 'revogar', label: 'Revogar certificado', group: 'Operações' },
    { key: 'delete_certificados', label: 'Excluir certificados (individual, em massa, duplicatas)', group: 'Operações' },
    { key: 'gerenciar_config', label: 'Gerenciar configurações de segurança do acesso a certificados', group: 'Configuração' },
  ],
}

export const permissionSchema = z.object({
  moduleSlug: z.string(),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  // boolean = toggle; string = escolha única (`type: 'choice'`, ex.: o escopo de
  // listagem de orçamentos). Sem o union, salvar a escolha era rejeitado aqui.
  subPermissions: z.record(z.union([z.boolean(), z.string()])).optional(),
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
