import {
  Gauge,
  LayoutGrid,
  Users,
  Building2,
  Briefcase,
  UserCog,
  Handshake,
  ClipboardList,
  ClipboardCheck,
  UserPlus,
  Contact,
  Calendar,
  FolderInput,
  Phone,
  Package,
  Boxes,
  Target,
  Shield,
  Award,
  FileText,
  HelpCircle,
  ListChecks,
  Receipt,
  Scale,
  FolderKanban,
  UsersRound,
  BarChart3,
  ShoppingCart,
  Search,
  GraduationCap,
  FileCheck,
  FileBox,
  Table2,
  ThumbsUp,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  Video,
  Lightbulb,
  Settings,
  Store,
  FileBarChart,
  Clock,
  CalendarClock,
  Gift,
  Mail,
  Key,
  FileOutput,
  PieChart,
  BarChart2,
  Database,
  CalendarDays,
  DollarSign,
  CircleDollarSign,
  BadgeCheck,
  Landmark,
  Folders,
  Headphones,
  CheckSquare,
  GitBranch,
  CircleUser,
  Archive,
  Activity,
  CreditCard,
  Calculator,
  BookOpen,
  FileSpreadsheet,
  Monitor,
  MailWarning,
  Star,
  Workflow,
  Sparkles,
  Smartphone,
  Info,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  category?: string // Sub-categoria visual dentro do grupo (ex: "Contábil", "Gestão")
  // Sub-itens hierárquicos (ex: Contratos → Cláusulas, Modelos, Relatórios).
  // O item pai continua navegável (clicar no label abre o href dele).
  subItems?: NavItem[]
}

export interface NavGroup {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

export const navigation: NavGroup[] = [
  {
    label: 'Cadastros',
    icon: ClipboardList,
    items: [
      { label: 'Áreas', href: '/areas', icon: LayoutGrid },
      { label: 'Cargos', href: '/cargos', icon: Briefcase },
      { label: 'Clientes', href: '/clientes', icon: Handshake },
      { label: 'Colaboradores', href: '/colaboradores', icon: Users },
      { label: 'Empresas', href: '/empresas', icon: Building2 },
      { label: 'Fornecedores', href: '/fornecedores', icon: Package },
      { label: 'Grupos Empresariais', href: '/grupos-empresariais', icon: Folders },
      { label: 'Obrigações', href: '/obrigacoes', icon: Receipt },
      { label: 'Serviços', href: '/servicos', icon: CheckSquare },
      { label: 'Sócios', href: '/socios', icon: UserPlus },
      { label: 'Usuários', href: '/usuarios', icon: UserCog },
    ],
  },
  {
    label: 'Comercial',
    icon: Store,
    items: [
      { label: 'Painel Comercial', href: '/comercial', icon: Gauge },
      {
        label: 'CRM',
        href: '/crm',
        icon: Target,
        subItems: [
          { label: 'Funil de captação (IA)', href: '/crm/funil', icon: Sparkles },
        ],
      },
      { label: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
      {
        label: 'Contratos',
        href: '/contratos',
        icon: FileText,
        subItems: [
          { label: 'Cláusulas', href: '/clausulas', icon: FileCheck },
          { label: 'Modelos de Contrato', href: '/contrato-templates', icon: FileBox },
          { label: 'Gráficos Contrato x ERP', href: '/graficos-contrato-erp', icon: BarChart3 },
          { label: 'Relatórios de Contratos', href: '/contratos-relatorios', icon: FileBarChart },
        ],
      },
      {
        label: 'Orçamentos',
        href: '/orcamentos',
        icon: CircleDollarSign,
        subItems: [
          { label: 'Custeio por Cliente', href: '/custeio-clientes', icon: PieChart },
          { label: 'Pesquisa de Satisfação', href: '/orcamentos/relatorios?tab=satisfacao', icon: Star },
        ],
      },
      { label: 'Relatórios Comerciais', href: '/comercial-relatorios', icon: FileBarChart },
    ],
  },
  {
    label: 'Administrativo',
    icon: Building2,
    items: [
      { label: 'Agenda Corporativa', href: '/agenda', icon: Calendar },
      { label: 'Coleta e Recebimento', href: '/coleta-documentos', icon: FolderInput },
      { label: 'Contatos', href: '/contatos', icon: Phone },
      { label: 'Controle de Estoque', href: '/estoque', icon: Boxes },
      { label: 'Gerenciador de Serviços', href: '/meus-servicos', icon: ListChecks },
      { label: 'Minhas Obrigações', href: '/minhas-obrigacoes', icon: ClipboardCheck },
      { label: 'Processos', href: '/processos', icon: Workflow },
      { label: 'Organograma', href: '/organograma', icon: GitBranch },
    ],
  },
  {
    label: 'Legalização',
    icon: Scale,
    items: [
      { label: 'Benefícios Fiscais', href: '/beneficios-fiscais', icon: DollarSign },
      { label: 'Certificados Digitais', href: '/gestao-certificados', icon: BadgeCheck },
      { label: 'Certidões e Alvarás', href: '/certidoes-cnd', icon: FileOutput },
      { label: 'Quadro Societário', href: '/quadro-societario', icon: UsersRound },
    ],
  },
  {
    label: 'Trabalhista',
    icon: Users,
    items: [
      { label: 'Banco de Horas', href: '/banco-horas', icon: Clock },
      { label: 'Benefícios', href: '/beneficios', icon: Gift },
      { label: 'Controle de Férias', href: '/controle-ferias', icon: CalendarDays },
      { label: 'FGTS Digital', href: '/fgts-digital', icon: Landmark },
      { label: 'Importação de Folha', href: '/folha-pagamento', icon: FileSpreadsheet },
    ],
  },
  {
    label: 'Fiscal',
    icon: Shield,
    items: [
      { label: 'Caixa Postal e-CAC', href: '/caixapostal', icon: Mail },
      { label: 'DANFE (NFe → PDF)', href: '/danfe', icon: FileSpreadsheet },
      { label: 'DT-e ES', href: '/dte', icon: MailWarning },
      { label: 'DCTFWeb', href: '/dctfweb', icon: ListChecks },
      { label: 'Obrigações e Serviços', href: '/obrigacoes-servicos', icon: Receipt },
      { label: 'Situação Fiscal', href: '/situacao-fiscal', icon: CircleUser },
    ],
  },
  {
    label: 'Contábil',
    icon: Calculator,
    items: [
      { label: 'Categorias de Balancete', href: '/bi-categorias-balancete', icon: FolderKanban },
      { label: 'Dashboard Financeiro', href: '/bi-faturamento', icon: BarChart2 },
    ],
  },
  {
    label: 'TI',
    icon: Monitor,
    items: [
      { label: 'Gestão de Ativos', href: '/ativos', icon: Database },
      { label: 'HelpDesk', href: '/helpdesk', icon: Headphones },
      { label: 'Projetos', href: '/projetos', icon: FolderKanban },
    ],
  },
  {
    label: 'Qualidade',
    icon: Award,
    items: [
      { label: 'Análise de Contexto', href: '/analise-contexto', icon: Search },
      { label: 'Aquisições', href: '/aquisicoes', icon: ShoppingCart },
      { label: 'Capacitações', href: '/capacitacoes', icon: GraduationCap },
      { label: 'Documentos Externos', href: '/documentos-externos', icon: FileBox },
      { label: 'Documentos Internos', href: '/documentos-internos', icon: FileCheck },
      { label: 'Elogios', href: '/elogios', icon: ThumbsUp },
      { label: 'Melhorias', href: '/melhorias', icon: TrendingUp },
      { label: 'Não Conformidades', href: '/nao-conformidades', icon: AlertTriangle },
      { label: 'Painel da Qualidade', href: '/qualidade', icon: BarChart3 },
      { label: 'Reclamações', href: '/reclamacoes', icon: MessageSquare },
      { label: 'Reuniões', href: '/reunioes', icon: Video },
      { label: 'Sugestões', href: '/sugestoes', icon: Lightbulb },
      { label: 'Tabelas de Registros', href: '/tabelas-registros', icon: Table2 },
    ],
  },
  {
    label: 'Ajuda',
    icon: HelpCircle,
    items: [
      { label: "FAQ's", href: '/faq', icon: HelpCircle },
      { label: 'Design System', href: '/admin/design-system', icon: Sparkles },
      { label: 'App Mobile', href: '/admin/app-mobile', icon: Smartphone },
      { label: 'Modelos de E-mail', href: '/admin/email-templates', icon: Mail },
      { label: 'Sobre', href: '/sobre', icon: Info },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings,
    items: [
      { label: 'Configurações Gerais', href: '/configuracoes', icon: Settings },
      { label: 'Painéis de TV', href: '/paineis', icon: Monitor },
      { label: 'Centro de Agendamentos', href: '/configuracoes/agendamentos', icon: CalendarClock },
      { label: 'Chat Interno', href: '/configuracoes/chat', icon: MessageSquare },
      { label: 'Certificado Digital', href: '/configuracoes/certificado', icon: BadgeCheck },
      { label: 'Stripe', href: '/configuracoes/stripe', icon: CreditCard },
      { label: 'Empresas (tenants)', href: '/admin/empresas', icon: Building2 },
      { label: 'Planos e preços', href: '/admin/planos', icon: CircleDollarSign },
      { label: 'Assinatura de email', href: '/admin/assinatura-template', icon: Mail },
      { label: 'Métricas', href: '/metricas', icon: Activity },
      { label: 'Backup e Restore', href: '/backup-restore', icon: Archive },
    ],
  },
]

// Mapa slug → ícone (para uso nas permissões)
export const MODULE_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  navigation.flatMap((group) =>
    group.items.map((item) => [item.href.replace('/', ''), item.icon])
  ),
)

// Ícones dos grupos
export const GROUP_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  navigation.map((group) => [group.label, group.icon])
)

// Cor hex de cada grupo da sidebar — usado em abas, cabeçalhos, badges
export const GROUP_HEX: Record<string, string> = {
  'Cadastros': '#34d399',
  'Comercial': '#fb7185',
  'Administrativo': '#38bdf8',
  'Legalização': '#e879f9',
  'Trabalhista': '#a3e635',
  'Fiscal': '#818cf8',
  'Contábil': '#a78bfa',
  'TI': '#22d3ee',
  'Qualidade': '#fbbf24',
  'Configurações': '#fb923c',
}

const DEFAULT_HEX = '#5ea3cb'

/**
 * Retorna a cor hex do grupo ao qual a rota pertence (procura no `navigation`).
 * Faz match exato primeiro; depois prefix match (ex: /clientes/123 → /clientes).
 * Sub-itens (subItems) também são considerados — usam a cor do grupo pai.
 */
export function getGroupHexForHref(href: string): string {
  const pathClean = href.split('?')[0]!.split('#')[0]
  for (const group of navigation) {
    for (const item of group.items) {
      if (item.href === pathClean) return GROUP_HEX[group.label] ?? DEFAULT_HEX
      if (item.subItems?.some(s => s.href === pathClean)) return GROUP_HEX[group.label] ?? DEFAULT_HEX
    }
  }
  // Prefix match: /clientes/abc → /clientes
  const segments = pathClean.split('/').filter(Boolean)
  if (segments.length === 0) return DEFAULT_HEX
  const primeiroSegmento = `/${segments[0]}`
  for (const group of navigation) {
    for (const item of group.items) {
      if (item.href === primeiroSegmento) return GROUP_HEX[group.label] ?? DEFAULT_HEX
      if (item.subItems?.some(s => s.href === primeiroSegmento)) return GROUP_HEX[group.label] ?? DEFAULT_HEX
    }
  }
  return DEFAULT_HEX
}
