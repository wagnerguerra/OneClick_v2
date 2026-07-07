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
  Wrench,
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
  FileCode,
  Files,
  Scale as ScaleIcon,
  ArrowLeftRight,
  Receipt as ReceiptIcon,
  GitMerge,
  FileSearch,
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
  // Visível APENAS para o master global da plataforma (isMaster). Admins de
  // tenant (isEmpresaMaster) não veem, mesmo tendo o slug nas permissões.
  masterOnly?: boolean
  // Rota ainda NÃO publicada (feature em desenvolvimento). Escondida do menu
  // p/ não gerar 404 (F-006). Reabilitar removendo a flag quando a página existir.
  wip?: boolean
  // Sub-itens hierárquicos (ex: Contratos → Cláusulas, Modelos, Relatórios).
  // O item pai continua navegável (clicar no label abre o href dele).
  subItems?: NavItem[]
  // Exige uma sub-permissão específica do módulo para aparecer (além da leitura
  // do módulo). Usado p/ rotas cujo acesso é mais restrito que o módulo pai
  // (ex.: /crm/funil exige `crm.acessar_funil_lead`). Master/EmpresaMaster veem
  // sempre. Quem não tem a sub-permissão não vê o link (a página também barra).
  requirePerm?: { module: string; sub: string }
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
      { label: 'Empresas', href: '/empresas', icon: Building2, masterOnly: true },
      { label: 'Fornecedores', href: '/fornecedores', icon: Package },
      { label: 'Grupos Empresariais', href: '/grupos-empresariais', icon: Folders, wip: true },
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
          { label: 'Funil de captação (IA)', href: '/crm/funil', icon: Sparkles, requirePerm: { module: 'crm', sub: 'acessar_funil_lead' } },
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
          { label: 'Gráficos Contrato x ERP', href: '/graficos-contrato-erp', icon: BarChart3, wip: true },
          { label: 'Relatórios de Contratos', href: '/contratos-relatorios', icon: FileBarChart, wip: true },
        ],
      },
      {
        label: 'Orçamentos',
        href: '/orcamentos',
        icon: CircleDollarSign,
        subItems: [
          { label: 'Custeio por Cliente', href: '/custeio-clientes', icon: PieChart, wip: true },
          { label: 'Pesquisa de Satisfação', href: '/orcamentos/relatorios?tab=satisfacao', icon: Star },
        ],
      },
      { label: 'Relatórios Comerciais', href: '/comercial/relatorios', icon: FileBarChart },
    ],
  },
  {
    label: 'Administrativo',
    icon: Building2,
    items: [
      { label: 'Agenda Corporativa', href: '/agenda', icon: Calendar },
      { label: 'Coleta e Recebimento', href: '/coleta-documentos', icon: FolderInput, wip: true },
      { label: 'Contatos', href: '/contatos', icon: Phone, wip: true },
      { label: 'Controle de Estoque', href: '/estoque', icon: Boxes, wip: true },
      { label: 'Gerenciador de Serviços', href: '/meus-servicos', icon: ListChecks },
      { label: 'Minhas Obrigações', href: '/minhas-obrigacoes', icon: ClipboardCheck },
      { label: 'Processos', href: '/processos', icon: Workflow },
      { label: 'Organograma', href: '/organograma', icon: GitBranch, wip: true },
    ],
  },
  {
    label: 'Legalização',
    icon: Scale,
    items: [
      { label: 'Benefícios Fiscais', href: '/beneficios-fiscais', icon: DollarSign },
      { label: 'Certificados Digitais', href: '/gestao-certificados', icon: BadgeCheck },
      { label: 'Certidões e Alvarás', href: '/certidoes-cnd', icon: FileOutput },
      { label: 'Quadro Societário', href: '/quadro-societario', icon: UsersRound, wip: true },
    ],
  },
  {
    label: 'Trabalhista',
    icon: Users,
    items: [
      { label: 'Banco de Horas', href: '/banco-horas', icon: Clock, wip: true },
      { label: 'Benefícios', href: '/beneficios', icon: Gift },
      { label: 'Controle de Férias', href: '/controle-ferias', icon: CalendarDays, wip: true },
      { label: 'FGTS Digital', href: '/fgts-digital', icon: Landmark, wip: true },
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
      { label: 'Obrigações e Serviços', href: '/obrigacoes-servicos', icon: Receipt, wip: true },
      { label: 'Situação Fiscal', href: '/situacao-fiscal', icon: CircleUser },
      {
        label: 'Ferramentas',
        href: '/ferramentas/fiscal',
        icon: Wrench,
        subItems: [
          { label: 'SPED → XLSX', href: '/ferramentas/fiscal/sped', icon: FileSpreadsheet },
          { label: 'XLSX → SPED (merge)', href: '/ferramentas/fiscal/sped-merge', icon: GitMerge },
          { label: 'NFe XML → XLSX', href: '/ferramentas/fiscal/nfe', icon: FileCode },
          { label: 'Consolidado SCI', href: '/ferramentas/fiscal/sci-consolidado', icon: Files },
          { label: 'Comparador SEFAZ × SCI', href: '/ferramentas/fiscal/comparacao-planilhas', icon: ScaleIcon },
          { label: 'Comparador NFS-e (OCR)', href: '/ferramentas/fiscal/comparacao-nfse', icon: FileSearch },
          { label: 'Conciliador NFS-e', href: '/ferramentas/fiscal/sci-portal-nacional', icon: ArrowLeftRight },
          { label: 'NFS-e → PDF (DANFSe)', href: '/ferramentas/fiscal/nfse-pdf', icon: FileText },
        ],
      },
    ],
  },
  {
    label: 'Contábil',
    icon: Calculator,
    items: [
      { label: 'Categorias de Balancete', href: '/bi-categorias-balancete', icon: FolderKanban },
      { label: 'Dashboard Financeiro', href: '/bi-faturamento', icon: BarChart2 },
      {
        label: 'Ferramentas',
        href: '/ferramentas/contabil',
        icon: Wrench,
        subItems: [
          { label: 'Extrator GNRE', href: '/ferramentas/contabil/gnre', icon: ReceiptIcon },
          { label: 'Editor de Extrato', href: '/ferramentas/contabil/extrato-edit', icon: FileSpreadsheet },
        ],
      },
      { label: 'Tratamento de Lançamentos', href: '/tratamento-lancamentos', icon: FileSpreadsheet },
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
      // ⚠️ Módulo Qualidade ainda não publicado — todas as rotas 404 em produção
      // (F-006). Marcado wip p/ esconder do menu até as páginas existirem.
      { label: 'Análise de Contexto', href: '/analise-contexto', icon: Search, wip: true },
      { label: 'Aquisições', href: '/aquisicoes', icon: ShoppingCart, wip: true },
      { label: 'Capacitações', href: '/capacitacoes', icon: GraduationCap, wip: true },
      { label: 'Documentos Externos', href: '/documentos-externos', icon: FileBox, wip: true },
      { label: 'Documentos Internos', href: '/documentos-internos', icon: FileCheck, wip: true },
      { label: 'Elogios', href: '/elogios', icon: ThumbsUp, wip: true },
      { label: 'Melhorias', href: '/melhorias', icon: TrendingUp, wip: true },
      { label: 'Não Conformidades', href: '/nao-conformidades', icon: AlertTriangle, wip: true },
      { label: 'Painel da Qualidade', href: '/qualidade', icon: BarChart3, wip: true },
      { label: 'Reclamações', href: '/reclamacoes', icon: MessageSquare, wip: true },
      { label: 'Reuniões', href: '/reunioes', icon: Video, wip: true },
      { label: 'Sugestões', href: '/sugestoes', icon: Lightbulb, wip: true },
      { label: 'Tabelas de Registros', href: '/tabelas-registros', icon: Table2, wip: true },
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
      { label: 'Console SQL', href: '/admin/sql-console', icon: Database, masterOnly: true },
      { label: 'Sobre', href: '/sobre', icon: Info },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings,
    items: [
      { label: 'Configurações Gerais', href: '/configuracoes', icon: Settings, masterOnly: true },
      { label: 'Painéis de TV', href: '/paineis', icon: Monitor },
      { label: 'Centro de Agendamentos', href: '/configuracoes/agendamentos', icon: CalendarClock },
      { label: 'Chat Interno', href: '/configuracoes/chat', icon: MessageSquare },
      { label: 'Certificado Digital', href: '/configuracoes/certificado', icon: BadgeCheck, masterOnly: true },
      { label: 'Stripe', href: '/configuracoes/stripe', icon: CreditCard, masterOnly: true },
      { label: 'Empresas (tenants)', href: '/admin/empresas', icon: Building2, masterOnly: true },
      { label: 'Planos e preços', href: '/admin/planos', icon: CircleDollarSign, masterOnly: true },
      { label: 'Assinatura de email', href: '/admin/assinatura-template', icon: Mail, masterOnly: true },
      { label: 'Métricas', href: '/metricas', icon: Activity, masterOnly: true },
      { label: 'Backup e Restore', href: '/backup-restore', icon: Archive, masterOnly: true },
    ],
  },
]

// Mapa slug → ícone (para uso nas permissões)
export const MODULE_ICONS: Record<string, LucideIcon> = {
  ...Object.fromEntries(
    navigation.flatMap((group) =>
      group.items.map((item) => [item.href.replace('/', ''), item.icon])
    ),
  ),
  // Slugs umbrella das ferramentas — não derivam do href do item de menu.
  'ferramentas-fiscal': Wrench,
  'ferramentas-contabil': Wrench,
}

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

// Label do grupo (PT) → slug da CSS var (--mod-<slug>). Mantém em sync com o
// design system (theme.service.ts / module-colors.tsx).
const GROUP_SLUG: Record<string, string> = {
  'Cadastros': 'cadastros', 'Comercial': 'comercial', 'Administrativo': 'administrativo',
  'Legalização': 'legalizacao', 'Trabalhista': 'trabalhista', 'Fiscal': 'fiscal',
  'Contábil': 'contabil', 'TI': 'ti', 'Qualidade': 'qualidade', 'Configurações': 'configuracoes',
}

/** Cor do grupo como CSS var (`var(--mod-<slug>, <fallback hex>)`) — assim abas,
 *  cabeçalhos e badges seguem o design system em vez de hex fixo. Funciona em
 *  qualquer `style` inline (color, backgroundColor, color-mix). */
function groupColorVar(label: string): string {
  const fallback = GROUP_HEX[label] ?? DEFAULT_HEX
  const slug = GROUP_SLUG[label]
  return slug ? `var(--mod-${slug}, ${fallback})` : fallback
}

/**
 * Retorna a cor hex do grupo ao qual a rota pertence (procura no `navigation`).
 * Faz match exato primeiro; depois prefix match (ex: /clientes/123 → /clientes).
 * Sub-itens (subItems) também são considerados — usam a cor do grupo pai.
 */
export function getGroupHexForHref(href: string): string {
  const pathClean = href.split('?')[0]!.split('#')[0]
  for (const group of navigation) {
    for (const item of group.items) {
      if (item.href === pathClean) return groupColorVar(group.label)
      if (item.subItems?.some(s => s.href === pathClean)) return groupColorVar(group.label)
    }
  }
  // Prefix match: /clientes/abc → /clientes
  const segments = pathClean.split('/').filter(Boolean)
  if (segments.length === 0) return DEFAULT_HEX
  const primeiroSegmento = `/${segments[0]}`
  for (const group of navigation) {
    for (const item of group.items) {
      if (item.href === primeiroSegmento) return groupColorVar(group.label)
      if (item.subItems?.some(s => s.href === primeiroSegmento)) return groupColorVar(group.label)
    }
  }
  return DEFAULT_HEX
}
