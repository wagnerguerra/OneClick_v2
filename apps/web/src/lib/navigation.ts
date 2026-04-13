import {
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
  Gift,
  Mail,
  Key,
  FileOutput,
  PieChart,
  BarChart2,
  Database,
  CalendarDays,
  DollarSign,
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
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
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
      { label: 'Colaboradores', href: '/colaboradores', icon: Users },
      { label: 'Clientes', href: '/clientes', icon: Handshake },
      { label: 'Empresas', href: '/empresas', icon: Building2 },
      { label: 'Fornecedores', href: '/fornecedores', icon: Package },
      { label: 'Serviços', href: '/servicos', icon: CheckSquare },
      { label: 'Obrigações Fixas', href: '/obrigacoes-fixas', icon: ClipboardCheck },
      { label: 'Obrigações Sob Demanda', href: '/obrigacoes-demanda', icon: ListChecks },
      { label: 'Sócios', href: '/socios', icon: UserPlus },
      { label: 'Usuários', href: '/usuarios', icon: UserCog },
    ],
  },
  {
    label: 'Corporativo',
    icon: Building2,
    items: [
      { label: 'Comercial', href: '/comercial', icon: Store },
      { label: 'Relatórios Comerciais', href: '/comercial-relatorios', icon: FileBarChart },
      { label: 'Agenda Corporativa', href: '/agenda', icon: Calendar },
      { label: 'Banco de Horas', href: '/banco-horas', icon: Clock },
      { label: 'Benefícios', href: '/beneficios', icon: Gift },
      { label: 'BI', href: '/bi-faturamento', icon: BarChart2 },
      { label: 'Caixa Postal e-CAC', href: '/caixapostal', icon: Mail },
      { label: 'Certificados', href: '/certificados', icon: Key },
      { label: 'Coleta e Recebimento', href: '/coleta-documentos', icon: FolderInput },
      { label: 'Contatos', href: '/contatos', icon: Phone },
      { label: 'Contratos', href: '/contratos', icon: FileText },
      { label: 'Relatórios de Contratos', href: '/contratos-relatorios', icon: FileBarChart },
      { label: 'Custeio por Cliente', href: '/custeio-clientes', icon: PieChart },
      { label: 'Gráficos Contrato x ERP', href: '/graficos-contrato-erp', icon: BarChart3 },
      { label: 'Controle de Ativos', href: '/ativos', icon: Database },
      { label: 'Controle de Estoque', href: '/estoque', icon: Boxes },
      { label: 'Controle de Férias', href: '/controle-ferias', icon: CalendarDays },
      { label: 'Benefícios Fiscais', href: '/beneficios-fiscais', icon: DollarSign },
      { label: 'Certificados Digitais', href: '/gestao-certificados', icon: BadgeCheck },
      { label: 'FGTS Digital', href: '/fgts-digital', icon: Landmark },
      { label: 'Grupos Empresariais', href: '/grupos-empresariais', icon: Folders },
      { label: 'HelpDesk', href: '/helpdesk', icon: Headphones },
      { label: 'Obrigações e Serviços', href: '/obrigacoes-servicos', icon: Receipt },
      { label: 'Orçamentos', href: '/orcamentos', icon: Scale },
      { label: 'Organograma', href: '/organograma', icon: GitBranch },
      { label: 'Processos', href: '/processos', icon: FolderKanban },
      { label: 'Projetos', href: '/projetos', icon: Contact },
      { label: 'Quadro Societário', href: '/quadro-societario', icon: UsersRound },
      { label: 'Situação Fiscal', href: '/situacao-fiscal', icon: CircleUser },
    ],
  },
  {
    label: 'Qualidade',
    icon: Award,
    items: [
      { label: 'Painel da Qualidade', href: '/qualidade', icon: BarChart3 },
      { label: 'Aquisições', href: '/aquisicoes', icon: ShoppingCart },
      { label: 'Análise de Contexto', href: '/analise-contexto', icon: Search },
      { label: 'Capacitações', href: '/capacitacoes', icon: GraduationCap },
      { label: 'Documentos Internos', href: '/documentos-internos', icon: FileCheck },
      { label: 'Documentos Externos', href: '/documentos-externos', icon: FileBox },
      { label: 'Tabelas de Registros', href: '/tabelas-registros', icon: Table2 },
      { label: 'Elogios', href: '/elogios', icon: ThumbsUp },
      { label: 'Melhorias', href: '/melhorias', icon: TrendingUp },
      { label: 'Não Conformidades', href: '/nao-conformidades', icon: AlertTriangle },
      { label: 'Reclamações', href: '/reclamacoes', icon: MessageSquare },
      { label: 'Reuniões', href: '/reunioes', icon: Video },
      { label: 'Sugestões', href: '/sugestoes', icon: Lightbulb },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings,
    items: [
      { label: 'Configurações Gerais', href: '/configuracoes', icon: Settings },
      { label: 'Certificado Digital', href: '/configuracoes/certificado', icon: BadgeCheck },
      { label: 'Stripe', href: '/configuracoes/stripe', icon: CreditCard },
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
