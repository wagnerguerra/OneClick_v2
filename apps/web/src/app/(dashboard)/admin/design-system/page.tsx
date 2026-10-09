'use client'

/**
 * Design System — documentação viva dos padrões visuais do SaaS.
 * Acesso restrito a master/isEmpresaMaster.
 *
 * Estrutura:
 *  - Sistema: tokens, header de página, KPIs, tabelas, formulários,
 *    botões, modais, página de detalhe, sub-abas em Card.
 *  - FAQ: cascas (ArticleShell / SegmentoShell), blocos (Section, Step,
 *    Callout, etc.) e template de novo artigo.
 *
 * Cada bloco mostra preview AO VIVO + snippet copiável.
 */

import { useRef, useState } from 'react'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import {
  Palette, Layout, Box, Inbox, Hash, Copy, Check, Lock,
  Info, Lightbulb, AlertTriangle, FileCode, Workflow,
  Database, Plus, Search, Eye, Edit, Trash2,
  MoreVertical, Calculator, FileText, MessageSquare,
  Settings, X, Save, ListChecks, ShoppingCart, RotateCcw,
  Smartphone, Calendar, ChevronRight, ArrowUp, ArrowDown,
} from 'lucide-react'
import { useModuleColors, useRefreshModuleColors, useSetLocalModuleColor, DEFAULT_MODULE_COLORS } from '@/components/theme/module-colors'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'

/** Helper: chama uma mutation tRPC via fetch nativo. Bypassa o trpc client,
 *  que está travando mutations (provável bug do batch/splitLink em v11).
 *  Formato tRPC v11 sem transformer: body = input direto. */
async function trpcMutateDirect<T = unknown>(route: string, input: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/trpc/${route}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const text = await res.text()
  let payload: any = null
  try { payload = JSON.parse(text) } catch { /* não-JSON */ }
  if (!res.ok || payload?.error) {
    throw new Error(payload?.error?.message ?? `HTTP ${res.status}`)
  }
  return payload?.result?.data as T
}
import {
  Card, CardHeader, CardContent, Button, Badge, Input, Label, Switch, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody,
  DialogFooter, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { BADGE, BORDER, SURFACE, TEXT } from '@/lib/color-styles'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { BackButton } from '@/components/ui/back-button'
import { FAQ_COLOR } from '@/app/(dashboard)/faq/_components/article-shell'
import {
  Section, Step, DefRow, FlagRow, Callout, CascadeRow, CasoPratico, QuickLink,
} from '@/app/(dashboard)/faq/_components/article-blocks'

const MODULE_COLOR = '#8b5cf6' // violet — admin/interno

type TabKey =
  | 'tokens' | 'page-header' | 'kpis' | 'tables' | 'forms'
  | 'buttons' | 'modals' | 'detail' | 'subtabs'
  | 'faq-shells' | 'faq-blocks' | 'faq-callouts' | 'faq-links' | 'faq-starter'
  | 'mobile-ds'

interface TabDef { key: TabKey; label: string; icon: typeof Layout }

const TABS_SISTEMA: TabDef[] = [
  { key: 'tokens',      label: 'Tokens & cores',  icon: Palette },
  { key: 'page-header', label: 'Header de página', icon: Layout },
  { key: 'kpis',        label: 'KPIs / Stats',    icon: ListChecks },
  { key: 'tables',      label: 'Tabelas',         icon: Box },
  { key: 'forms',       label: 'Formulários',     icon: Edit },
  { key: 'buttons',     label: 'Botões',          icon: ShoppingCart },
  { key: 'modals',      label: 'Modais',          icon: MessageSquare },
  { key: 'detail',      label: 'Pág. de detalhe', icon: FileText },
  { key: 'subtabs',     label: 'Sub-abas em Card', icon: Inbox },
]

const TABS_FAQ: TabDef[] = [
  { key: 'faq-shells',   label: 'Cascas',         icon: Layout },
  { key: 'faq-blocks',   label: 'Blocos',         icon: Box },
  { key: 'faq-callouts', label: 'Callouts',       icon: Lightbulb },
  { key: 'faq-links',    label: 'Atalhos',        icon: Hash },
  { key: 'faq-starter',  label: 'Novo artigo',    icon: FileCode },
]

const TABS_APP: TabDef[] = [
  { key: 'mobile-ds', label: 'App Mobile', icon: Smartphone },
]

export default function DesignSystemPage() {
  const { profile, loading } = useCurrentUserProfile()
  const [activeTab, setActiveTab] = useState<TabKey>('tokens')

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
  }

  const isMaster = profile?.isMaster || profile?.isEmpresaMaster
  if (!isMaster) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="p-8 text-center space-y-3">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">Esta página é interna — só master.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={
        <Badge variant="outline" className="gap-1.5 h-7">
          <Lock className="h-3 w-3" /> Interno · master only
        </Badge>
      }>
        <h1 className="truncate">Design System</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Administração</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Design System</span>
        </p>
      </PageHeaderBar>

      {/* Card com pills laterais (padrão CLAUDE.md, agora theme-aware) */}
      <Card>
        <CardHeader>
          <h5 className="text-[13px] font-semibold">Padrões do sistema</h5>
        </CardHeader>
        <div className="flex min-h-[700px]">
          {/* Pills laterais com seções */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto nice-scrollbar">
            <PillGroup label="Sistema" tabs={TABS_SISTEMA} activeTab={activeTab} onSelect={setActiveTab} />
            <PillGroup label="FAQ" tabs={TABS_FAQ} activeTab={activeTab} onSelect={setActiveTab} className="mt-4" />
            <PillGroup label="App Mobile" tabs={TABS_APP} activeTab={activeTab} onSelect={setActiveTab} className="mt-4" />
          </div>

          {/* Conteúdo */}
          <div key={activeTab} className="min-w-0 flex-1 overflow-x-auto p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
            {activeTab === 'tokens'       && <TokensSection />}
            {activeTab === 'page-header'  && <PageHeaderSection />}
            {activeTab === 'kpis'         && <KpisSection />}
            {activeTab === 'tables'       && <TablesSection />}
            {activeTab === 'forms'        && <FormsSection />}
            {activeTab === 'buttons'      && <ButtonsSection />}
            {activeTab === 'modals'       && <ModalsSection />}
            {activeTab === 'detail'       && <DetailPageSection />}
            {activeTab === 'subtabs'      && <SubTabsSection />}
            {activeTab === 'faq-shells'   && <FaqShellsSection />}
            {activeTab === 'faq-blocks'   && <FaqBlocksSection />}
            {activeTab === 'faq-callouts' && <FaqCalloutsSection />}
            {activeTab === 'faq-links'    && <FaqLinksSection />}
            {activeTab === 'faq-starter'  && <FaqStarterSection />}
            {activeTab === 'mobile-ds'    && <MobileDesignSystemSection />}
          </div>
        </div>
      </Card>

      <style jsx global>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Helpers visuais
// ═══════════════════════════════════════════════════════════════

function PillGroup({ label, tabs, activeTab, onSelect, className }: {
  label: string
  tabs: TabDef[]
  activeTab: TabKey
  onSelect: (k: TabKey) => void
  className?: string
}) {
  return (
    <div className={className}>
      <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="space-y-1">
        {tabs.map(t => {
          const Icon = t.icon
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium text-left transition-colors',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-bold text-foreground border-b border-border pb-2 mt-0">{children}</h2>
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-muted-foreground leading-relaxed">{children}</p>
}

function Demo({ title, code, children, label }: {
  title?: string
  code: string
  children: React.ReactNode
  label?: string
}) {
  return (
    <div className="space-y-2">
      {title && <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-muted/20 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 font-semibold">Preview</p>
          {children}
        </div>
        <CodeSnippet code={code} label={label} />
      </div>
    </div>
  )
}

function CodeSnippet({ code, label = 'Código' }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/40">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <Button
          variant="ghost" size="sm"
          className="h-6 px-2 text-[11px] gap-1"
          onClick={() => {
            navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
      </div>
      <pre className="text-[11px] font-mono p-3 overflow-x-auto whitespace-pre max-h-[500px] text-foreground/80 leading-relaxed nice-scrollbar">
        {code}
      </pre>
    </div>
  )
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12px] text-foreground/80">
      <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function AntiRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12px] text-foreground/80">
      <X className="h-3.5 w-3.5 mt-0.5 text-rose-600 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — Tokens
// ═══════════════════════════════════════════════════════════════
function TokensSection() {
  return (
    <div className="space-y-6">
      <ModuleColorsEditor />

      <SubTitle>Tokens semânticos (Tailwind)</SubTitle>
      <Note>
        Use SEMPRE tokens do <code className="text-[11px]">@theme</code> em <code className="text-[11px]">globals.css</code> — eles trocam automaticamente entre light/dark.
        <strong> NUNCA</strong> use hex hardcoded como <code className="text-[11px]">bg-[#f8f9fa]</code> ou <code className="text-[11px]">border-[rgba(0,0,0,0.08)]</code> — UI quebra no dark mode.
      </Note>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <TokenSwatch name="bg-background"        desc="Fundo da página" />
        <TokenSwatch name="bg-card"              desc="Fundo de Card" />
        <TokenSwatch name="bg-muted"             desc="Fundo neutro" />
        <TokenSwatch name="bg-muted/40"          desc="Sub-tab pill column" />
        <TokenSwatch name="bg-muted/20"          desc="Toolbar de filtros" />
        <TokenSwatch name="border-border"        desc="Divisor padrão" />
        <TokenSwatch name="border-border/60"     desc="Divisor sutil" />
        <TokenSwatch name="text-foreground"      desc="Texto principal" />
        <TokenSwatch name="text-muted-foreground" desc="Texto secundário" />
        <TokenSwatch name="bg-primary"           desc="Primária sólida (texto: text-primary-foreground)" />
        <TokenSwatch name="bg-primary/10"        desc="Tint da primária (seleção, destaque leve)" />
      </div>

      <SubTitle>Primária sobre superfície — text-primary-on-surface</SubTitle>
      <Note>
        A primária pura (<code className="text-[11px]">text-primary</code>) é escura demais como TEXTO sobre fundo escuro.
        O token <code className="text-[11px]">--color-primary-on-surface</code> é a primária legível sobre a superfície:
        igual à primária no claro, tom claro dela no escuro (por skin). Toda cor primária usada como texto, ícone,
        link ou borda de destaque sobre card/página usa ele.
      </Note>
      <div className="rounded-md border border-border bg-card p-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <span className="font-semibold text-primary-on-surface">Total: R$ 1.250,00</span>
        <a href="#" onClick={e => e.preventDefault()} className="text-primary-on-surface hover:underline">Abrir em nova aba</a>
        <span className="inline-flex items-center gap-1.5 text-primary-on-surface"><Info className="h-4 w-4" /> Ícone de seção</span>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary-on-surface">Pill selecionado</span>
        <span className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground">Sólido</span>
      </div>
      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule><strong>Texto/ícone/link/aba ativa/valor em destaque</strong> na primária → <code className="text-[11px]">text-primary-on-surface</code> (também <code className="text-[11px]">border-primary-on-surface</code> no sublinhado de aba)</Rule>
        <Rule><strong>Fundo sólido</strong> na primária → <code className="text-[11px]">bg-primary</code> + <code className="text-[11px]">text-primary-foreground</code></Rule>
        <Rule><strong>Tint/seleção</strong> → <code className="text-[11px]">bg-primary/10</code> (borda <code className="text-[11px]">border-primary/20…/50</code>) com texto <code className="text-[11px]">text-primary-on-surface</code></Rule>
        <Rule><strong>Inline/SVG</strong> (gráfico, color-mix) → <code className="text-[11px]">var(--color-primary)</code> em preenchimento; <code className="text-[11px]">var(--color-primary-on-surface)</code> em texto</Rule>
        <AntiRule>NÃO usar <code className="text-[11px]">text-primary</code> nem <code className="text-[11px]">{`style={{ color: 'var(--color-primary)' }}`}</code> para texto sobre superfície — some no dark</AntiRule>
        <AntiRule>NÃO repetir a primária em <code className="text-[11px]">style</code> num <code className="text-[11px]">{`<Button>`}</code> — o padrão já é <code className="text-[11px]">bg-primary text-primary-foreground</code></AntiRule>
      </Card>

      <SubTitle>Exceções de tema</SubTitle>
      <Card className="p-4 space-y-2">
        <Rule><strong>Documento/papel</strong> (etiqueta, termo, prévia de impressão): cores claras FIXAS nos dois temas — <code className="text-[11px]">bg-white text-slate-900</code> na folha, e títulos com <code className="text-[11px]">color: inherit</code>. É papel, não tela.</Rule>
        <Rule><strong>Título sobre fundo colorido</strong>: o CSS global pinta <code className="text-[11px]">h1/h2/h3</code> com <code className="text-[11px]">--color-foreground</code>, o que vence a herança. Sobre faixa colorida, ponha <code className="text-[11px]">text-white</code> (ou a cor certa) <strong>no próprio título</strong>.</Rule>
        <Rule><strong>Tooltip é invertido</strong> (<code className="text-[11px]">bg-foreground text-background</code>): escuro no claro, claro no escuro. Cor dentro dele usa tom <code className="text-[11px]">-400</code> no claro e <code className="text-[11px]">-600</code> no <code className="text-[11px]">dark:</code>; neutro = <code className="text-[11px]">text-background/70</code>. O helper <code className="text-[11px]">TEXT</code> é para superfície normal</Rule>
        <Rule><strong>Fora de classe</strong> (Recharts, SVG, <code className="text-[11px]">style</code>): <code className="text-[11px]">var(--color-&lt;token&gt;)</code>. Os nomes antigos (<code className="text-[11px]">var(--border)</code>, <code className="text-[11px]">hsl(var(--…))</code>) não existem e saem pretos no dark. Tooltip de gráfico = <code className="text-[11px]">{`<ChartTooltip>`}</code></Rule>      </Card>

      <SubTitle>Tipografia</SubTitle>
      <div className="rounded-md border border-border p-4 space-y-2 bg-card">
        <h1 className="text-foreground">h1 — Título de página</h1>
        <p className="text-sm text-muted-foreground">Sub-header padrão (text-sm text-muted-foreground)</p>
        <h2 className="text-base font-bold text-foreground pt-2">h2 — Divisor de seção (text-base font-bold)</h2>
        <h5 className="text-[13px] font-semibold text-foreground">h5 — Título de Card (text-[13px] font-semibold)</h5>
        <p className="text-[12px] text-foreground/80">Texto de tabela e blocos de conteúdo (text-[12px])</p>
        <p className="text-[11px] text-muted-foreground">Helper / hint (text-[11px] text-muted-foreground)</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Label de seção (text-[10px] uppercase tracking-wider)</p>
      </div>
    </div>
  )
}

/**
 * Editor live de cores por módulo.
 *
 * Estratégia anti-lag:
 *  1. onInput do color picker dispara setLocalColor() — atualiza CSS var IMEDIATAMENTE.
 *  2. Save no backend é debounced (400ms após último input) — evita 100 mutations
 *     enquanto o usuário arrasta o picker.
 *  3. Status por card: pendente (drag), salvando (request em voo), salvo (✓ 1.5s), erro.
 *  4. Painel lateral com log dos eventos pra você ver o que tá acontecendo.
 */
function ModuleColorsEditor() {
  const colors = useModuleColors()
  const refresh = useRefreshModuleColors()
  const setLocalColor = useSetLocalModuleColor()

  type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({})
  const [logs, setLogs] = useState<{ ts: string; slug: string; msg: string; tipo: 'info' | 'ok' | 'err' }[]>([])

  // Debounce timers e última cor pendente, por slug.
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingColorRefs = useRef<Record<string, string>>({})
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function pushLog(slug: string, msg: string, tipo: 'info' | 'ok' | 'err' = 'info') {
    const ts = new Date().toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')
    setLogs(prev => [{ ts, slug, msg, tipo }, ...prev].slice(0, 30))
  }

  function setStatus(slug: string, s: SaveStatus) {
    setStatuses(prev => ({ ...prev, [slug]: s }))
  }

  // A LISTA de módulos vem do DEFAULT_MODULE_COLORS (fonte canônica, em sync com o
  // backend) — assim nunca falta nem sobra slug aqui (era hardcoded e tinha drift:
  // sobrava 'processos', que nem é slug de cor, e faltava 'ferramentas'). Só o
  // rótulo/descrição humanos ficam neste mapa; slug sem entrada cai num label = slug.
  const MODULE_META: Record<string, { label: string; desc: string }> = {
    cadastros:      { label: 'Cadastros',     desc: 'Verde — clientes, colaboradores, empresas' },
    comercial:      { label: 'Comercial',     desc: 'Rose — CRM, orçamentos, pipeline' },
    corporativo:    { label: 'Corporativo',   desc: 'Sky — TI, projetos, contratos' },
    administrativo: { label: 'Administrativo', desc: 'Sky claro — administrativo geral' },
    legalizacao:    { label: 'Legalização',   desc: 'Fuchsia — constituição, alterações' },
    trabalhista:    { label: 'Trabalhista',   desc: 'Lime — folha, holerites, eSocial' },
    fiscal:         { label: 'Fiscal',        desc: 'Indigo — CNDs, DCTFWeb, situação fiscal' },
    contabil:       { label: 'Contábil',      desc: 'Violet — balancetes, BI' },
    ferramentas:    { label: 'Ferramentas',   desc: 'Violet — ferramentas e utilitários do sistema' },
    ti:             { label: 'TI',            desc: 'Cyan — ativos, helpdesk' },
    qualidade:      { label: 'Qualidade',     desc: 'Amber — não conformidades, melhorias' },
    configuracoes:  { label: 'Configurações', desc: 'Orange — settings gerais' },
    ajuda:          { label: 'Ajuda',         desc: 'Cyan — cor da seção Ajuda/FAQ (var(--mod-ajuda))' },
    perfil:         { label: 'Perfil',        desc: 'Sky suave — perfil, usuário' },
  }
  const MODULES: { slug: string; label: string; desc: string }[] = Object.keys(DEFAULT_MODULE_COLORS).map(slug => ({
    slug,
    label: MODULE_META[slug]?.label ?? slug,
    desc: MODULE_META[slug]?.desc ?? '',
  }))

  // Optimistic update — chamado a cada movimento do color picker.
  function handleInput(slug: string, label: string, color: string) {
    setLocalColor(slug, color) // CSS var atualiza AGORA
    pendingColorRefs.current[slug] = color
    setStatus(slug, 'pending')

    // Cancela "saved" timer se ainda estava mostrando "✓"
    if (savedTimers.current[slug]) {
      clearTimeout(savedTimers.current[slug])
      delete savedTimers.current[slug]
    }

    // Debounce do save no backend
    if (debounceRefs.current[slug]) clearTimeout(debounceRefs.current[slug])
    debounceRefs.current[slug] = setTimeout(() => {
      void persistColor(slug, label, pendingColorRefs.current[slug] ?? color)
    }, 400)
  }

  async function persistColor(slug: string, label: string, color: string) {
    setStatus(slug, 'saving')
    const startedAt = performance.now()
    pushLog(slug, `Salvando ${color}...`, 'info')
    try {
      await trpcMutateDirect('theme.update', { slug, label, color })
      const ms = Math.round(performance.now() - startedAt)
      setStatus(slug, 'saved')
      pushLog(slug, `Salvo em ${ms}ms`, 'ok')
      savedTimers.current[slug] = setTimeout(() => setStatus(slug, 'idle'), 1500)
    } catch (e) {
      const ms = Math.round(performance.now() - startedAt)
      setStatus(slug, 'error')
      pushLog(slug, `ERRO em ${ms}ms: ${(e as Error)?.message ?? 'falha desconhecida'}`, 'err')
      alerts.error('Erro', (e as Error)?.message ?? 'Falha ao salvar cor')
    }
  }

  async function handleReset(slug: string) {
    setStatus(slug, 'saving')
    const startedAt = performance.now()
    pushLog(slug, `Restaurando padrão...`, 'info')
    try {
      await trpcMutateDirect('theme.reset', { slug })
      await refresh() // refetch — o reset retorna a cor default do backend
      const ms = Math.round(performance.now() - startedAt)
      setStatus(slug, 'saved')
      pushLog(slug, `Restaurado em ${ms}ms`, 'ok')
      savedTimers.current[slug] = setTimeout(() => setStatus(slug, 'idle'), 1500)
    } catch (e) {
      const ms = Math.round(performance.now() - startedAt)
      setStatus(slug, 'error')
      pushLog(slug, `ERRO em ${ms}ms: ${(e as Error)?.message ?? 'falha'}`, 'err')
      alerts.error('Erro', (e as Error)?.message ?? 'Falha ao restaurar cor')
    }
  }

  return (
    <>
      <SubTitle>Cores por módulo (editável)</SubTitle>
      <Note>
        Cada cor é aplicada <strong>instantaneamente</strong> (CSS vars). O save no banco
        é debounced em 400ms após o último movimento do picker — evita flood de requests
        enquanto você arrasta. Estado por card e log lateral mostram tudo em tempo real.
      </Note>

      {/* Aviso + regras num bloco só: a faixa âmbar é o cabeçalho, as regras ficam
          anexadas embaixo, dentro da mesma borda. */}
      <div className={cn('mt-2 overflow-hidden rounded-md border', BORDER.amber)}>
        <div className={cn('flex items-start gap-2 px-3 py-2.5 text-[12px]', SURFACE.amber, TEXT.amber)}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p><strong className="font-semibold">A cor do módulo não é cor de conteúdo.</strong> Ela só identifica o módulo, numa lista fechada de lugares.</p>
        </div>
        <div className={cn('space-y-3 border-t bg-card px-4 py-3', BORDER.amber)}>
        <div className="space-y-1.5">
          <h4 className="text-[12px] font-bold">Onde ela aparece — lista fechada</h4>
          <div className="flex flex-wrap gap-1.5">
            {['Sidebar', 'Widgets do dashboard', 'FAQ', 'Grupos de permissão em /usuarios', 'Nós do editor de fluxo (por área)', 'Balão de feedback (botão e cada modo)'].map(l => (
              <span key={l} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-foreground/80">{l}</span>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <AntiRule><strong>NÃO</strong> usar em botões, abas, links, KPIs, badges, barras, capas, ícones de tela — aí é a <strong>primária</strong> (ver <em>Primária sobre superfície</em>)</AntiRule>
          <AntiRule><strong>NÃO</strong> acrescentar lugares à lista nem derivar outros usos dela sem aprovação explícita</AntiRule>
          <Rule>
            Pode <strong>sugerir</strong>: algo novo ou já agrupado/listado por módulo e colorido por isso <em>poderia</em> derivar de
            <code className="text-[11px]"> --mod-&lt;slug&gt;</code> / <code className="text-[11px]">useModuleColor</code> — só aplicar com <strong>permissão explícita</strong>
          </Rule>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-4">
        {/* Coluna 1: cards de cor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {MODULES.map(m => {
            const current = colors[m.slug] ?? DEFAULT_MODULE_COLORS[m.slug] ?? '#5ea3cb'
            const isDefault = current.toLowerCase() === (DEFAULT_MODULE_COLORS[m.slug] ?? '').toLowerCase()
            const status = statuses[m.slug] ?? 'idle'
            return (
              <div key={m.slug} className="rounded-md border border-border p-3 space-y-2 bg-card">
                <div className="flex items-center gap-2">
                  <label className="relative cursor-pointer group">
                    <div
                      className="h-12 w-12 rounded shadow-sm border border-border/40 transition-transform group-hover:scale-105"
                      style={{ backgroundColor: current }}
                    />
                    <input
                      type="color"
                      value={current}
                      onInput={e => handleInput(m.slug, m.label, (e.target as HTMLInputElement).value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12px] font-semibold truncate">{m.label}</p>
                      <StatusChip status={status} />
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground">{current}</p>
                    <p className="text-[10px] text-muted-foreground/80 truncate" title={m.desc}>{m.desc}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[10px] text-muted-foreground font-mono">--mod-{m.slug}</code>
                  {!isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => handleReset(m.slug)}
                      disabled={status === 'saving'}
                    >
                      <RotateCcw className="h-3 w-3" /> Restaurar padrão
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Coluna 2: log lateral */}
        <div className="rounded-md border border-border bg-card overflow-hidden h-fit sticky top-[calc(var(--app-sticky-top)_+_1rem)]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Log de eventos</p>
            {logs.length > 0 && (
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => setLogs([])}>Limpar</Button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto nice-scrollbar">
            {logs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 italic p-3 text-center">
                Sem eventos. Mexa numa cor pra ver o tempo de resposta.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {logs.map((l, i) => (
                  <li key={i} className="px-3 py-1.5 text-[10px] font-mono leading-tight">
                    <div className="flex items-start gap-1.5">
                      <span className="text-muted-foreground tabular-nums">{l.ts}</span>
                      <span className={cn(
                        'font-semibold',
                        l.tipo === 'ok'  && TEXT.emerald,
                        l.tipo === 'err' && TEXT.rose,
                        l.tipo === 'info' && TEXT.sky,
                      )}>{l.slug}</span>
                    </div>
                    <p className="ml-[68px] text-foreground/80 break-all">{l.msg}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function StatusChip({ status }: { status: 'idle' | 'pending' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null
  const cfg = {
    pending: { label: '●', cls: TEXT.amber, title: 'Alterado, aguardando debounce' },
    saving:  { label: '⟳', cls: cn(TEXT.sky, 'animate-spin inline-block'), title: 'Salvando no servidor' },
    saved:   { label: '✓', cls: TEXT.emerald, title: 'Salvo' },
    error:   { label: '!', cls: TEXT.rose, title: 'Erro ao salvar' },
  }[status]
  return <span className={cn('text-[12px] font-bold', cfg.cls)} title={cfg.title}>{cfg.label}</span>
}

function TokenSwatch({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="rounded-md border border-border p-2.5 flex items-center gap-2.5">
      <div className={cn('h-8 w-8 rounded shrink-0', name.split(' ')[0])} />
      <div className="min-w-0">
        <p className="text-[11px] font-mono font-semibold truncate">{name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{desc}</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — Header de página
// ═══════════════════════════════════════════════════════════════
function PageHeaderSection() {
  return (
    <div className="space-y-6">
      <SubTitle>Barra da página — PageHeaderBar</SubTitle>
      <Note>
        Toda listagem e todo detalhe começam com <code className="text-[11px]">{`<PageHeaderBar>`}</code> (referência completa:
        <code className="text-[11px]"> docs/PADRAO_PAGINAS.md §1.1</code>). <code className="text-[11px]">h1</code> puro — o estilo vem do global —,
        trilha <em>Página inicial › Bloco › Módulo</em> e ações à direita.
      </Note>

      <CodeSnippet
        label="Listagem"
        code={`<PageHeaderBar actions={<>
  {/* 1º "+ Novo…" (botão padrão = primária), depois secundárias, ⋮ por último */}
  <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
    <Plus className="h-4 w-4" /> Novo ativo
  </Button>
</>}>
  <h1 className="truncate">Gestão de Ativos</h1>
  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
    <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
    <span className="text-muted-foreground/50">›</span>
    <span>TI</span>
    <span className="text-muted-foreground/50">›</span>
    <span>Gestão de Ativos</span>
  </p>
</PageHeaderBar>`}
      />

      <CodeSnippet
        label="Subpágina — BackButton por último"
        code={`<PageHeaderBar actions={<>
  <span className="text-xs text-muted-foreground tabular-nums">{n} execuções</span>
  <BackButton href="/processos" label="Voltar" />
</>}>
  <h1 className="truncate">Painel Operacional</h1>
  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
    … › <span>Processos</span> › <span>Painel Operacional</span>
  </p>
</PageHeaderBar>`}
      />

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule><strong>Ordem das ações:</strong> &quot;+ Novo…&quot; primeiro, depois as secundárias, o menu ⋮ por último</Rule>
        <Rule><strong>&quot;+ Novo…&quot;</strong> usa o <code className="text-[11px]">Button</code> padrão (primária) — ele só ABRE o formulário; verde é de quem conclui (ver <em>Botões</em>)</Rule>
        <Rule><strong>Subpágina:</strong> a trilha acrescenta o próprio nome e <code className="text-[11px]">{`<BackButton href="…" />`}</code> é a ÚLTIMA ação — com <code className="text-[11px]">label=&quot;Voltar&quot;</code> se estiver sozinho, só ícone se houver outros botões (ver <em>Pág. de detalhe → BackButton</em>)</Rule>
        <Rule><strong>Espaçamento:</strong> wrapper <code className="text-[11px]">flex flex-col gap-*</code> → <code className="text-[11px]">className=&quot;mb-0 sm:mb-0&quot;</code>; wrapper <code className="text-[11px]">space-y-*</code> → margem padrão</Rule>
        <Rule>A barra é o <strong>primeiro</strong> elemento da página — ela sangra até o topo com margem negativa e cobriria o que estiver acima</Rule>
        <AntiRule>NÃO pôr ícone colorido do módulo ao lado do título (<code className="text-[11px]">PageHeaderIcon</code> é legado — não usar em tela nova)</AntiRule>
        <AntiRule>NÃO montar botão de voltar à mão nem uma linha de breadcrumb acima da barra</AntiRule>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — KPIs
// ═══════════════════════════════════════════════════════════════
function KpisSection() {
  return (
    <div className="space-y-6">
      <SubTitle>KPIs / Stat cards</SubTitle>
      <Note>
        Grid de cartões compactos para indicadores numéricos. Renderizado dentro de um Card único com padding pequeno.
      </Note>

      <Demo
        code={`import { BADGE, type ColorName } from '@/lib/color-styles'

<Card className="p-3">
  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
    <KpiCard icon={Database}      label="Total"             value="252"    color="primary" />
    <KpiCard icon={Coins}         label="Valor patrimonial" value="R$ 1.2M" color="emerald" />
    <KpiCard icon={AlertTriangle} label="Garantia ≤ 30d"    value="3"      color="amber" />
  </div>
</Card>

function KpiCard({ icon: Icon, label, value, color }: {
  icon: typeof Database; label: string; value: string
  /** primary = identidade (o total); o resto é semântico, do helper */
  color: 'primary' | ColorName
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center',
        color === 'primary' ? 'bg-primary/10 text-primary-on-surface' : BADGE[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
      </div>
    </div>
  )
}`}
      >
        <Card className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCardDemo icon={Database}      label="Total"      value="252"    color="primary" />
            <KpiCardDemo icon={Calculator}    label="Patrimônio" value="R$ 1.2M" color="emerald" />
            <KpiCardDemo icon={AlertTriangle} label="Alertas"    value="3"      color="amber" />
          </div>
        </Card>
      </Demo>

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule>Card wrapper com padding pequeno (<code className="text-[11px]">p-3</code>)</Rule>
        <Rule>Grid responsivo: <code className="text-[11px]">grid-cols-2 md:grid-cols-4 lg:grid-cols-7</code></Rule>
        <Rule>Ícone <code className="text-[11px]">h-9 w-9 rounded-md</code> com cor de tinta (bg + text) — do helper <code className="text-[11px]">BADGE</code>, nunca mapa literal próprio</Rule>
        <Rule>Label <code className="text-[11px]">text-[10px] uppercase tracking-wider</code></Rule>
        <Rule>Valor <code className="text-[11px]">text-lg font-bold tabular-nums</code></Rule>
        <Rule>KPI de <strong>identidade</strong> (o total, o principal da tela): <code className="text-[11px]">bg-primary/10 text-primary-on-surface</code></Rule>
        <Rule>KPIs <strong>semânticos</strong>: rose/red (problema), amber (atenção), emerald (positivo), slate (neutro) — e, para status, a cor vem da fonte única de status do módulo (ex.: <code className="text-[11px]">processos/_lib/status-cores</code>)</Rule>
        <AntiRule>NÃO usar a cor do módulo (ex.: sky) como cor do KPI de identidade</AntiRule>
      </Card>
    </div>
  )
}

function KpiCardDemo({ icon: Icon, label, value, color }: { icon: typeof Database; label: string; value: string; color: 'primary' | 'emerald' | 'amber' | 'rose' }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center',
        color === 'primary' ? 'bg-primary/10 text-primary-on-surface' : BADGE[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — Tabelas
// ═══════════════════════════════════════════════════════════════
function TablesSection() {
  return (
    <div className="space-y-6">
      <SubTitle>Tabela com filtros + ações</SubTitle>
      <Note>
        Padrão: Card → toolbar de filtros (bg-muted/20) → tabela → paginação. A coluna de ações tem DUAS variações
        aceitas — dropdown ⋮ (abaixo) ou botões de ícone na linha (mais abaixo). Escolha uma por tela; não misture.
      </Note>

      <Demo
        label="Estrutura completa"
        code={`<Card>
  {/* Toolbar de filtros */}
  <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3
                  sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={String(limit)} onValueChange={...}>
        <SelectTrigger className="h-8 w-[60px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{[20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={status} onValueChange={...}>
        <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>...</SelectContent>
      </Select>
    </div>
    <div className="relative">
      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
      <Input placeholder="Buscar..." className="h-8 pl-8 w-full sm:w-[260px] text-xs" />
    </div>
  </div>

  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Nome</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-xs text-right">Ações</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {data.map(row => (
        <TableRow key={row.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => openDetail(row.id)}>
          <TableCell>{row.nome}</TableCell>
          <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="text-xs gap-2"><Eye className="h-3.5 w-3.5" /> Visualizar</DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2"><Edit className="h-3.5 w-3.5" /> Editar</DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>

  {/* Paginação */}
  <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/20">
    <div className="text-[11px] text-muted-foreground tabular-nums">1–20 de 252</div>
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-xs"><ChevronLeft className="h-3.5 w-3.5" /></Button>
      <span className="text-[11px] mx-2 tabular-nums">1 / 13</span>
      <Button variant="ghost" size="icon-xs"><ChevronRight className="h-3.5 w-3.5" /></Button>
    </div>
  </div>
</Card>`}
      >
        <Card>
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Select defaultValue="20">
                <SelectTrigger className="h-8 w-[60px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem></SelectContent>
              </Select>
              <Select defaultValue="__all__">
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">Todos status</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar..." className="h-8 pl-8 w-[200px] text-xs" />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-muted/40 cursor-pointer">
                <TableCell className="text-[12px]">Notebook Dell Latitude</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">Em uso</Badge></TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem className="text-xs gap-2"><Eye className="h-3.5 w-3.5" /> Visualizar</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs gap-2"><Edit className="h-3.5 w-3.5" /> Editar</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </Demo>

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule>Toolbar: <code className="text-[11px]">border-b border-border/60 bg-muted/20 px-4 py-3</code></Rule>
        <Rule>Filtros (Select/Input): <code className="text-[11px]">h-8 text-xs</code> (mais compacto que o padrão de form) — sem <code className="text-[11px]">bg-*</code>/<code className="text-[11px]">border-*</code> (ver <em>Formulários</em>)</Rule>
        <Rule>Coluna Ações: <code className="text-[11px]">{`<TableHead className="text-xs text-right">`}</code></Rule>
        <Rule>Dropdown: <code className="text-[11px]">{`<Button variant="ghost" size="icon-sm" className="h-7 w-7">`}</code> com <code className="text-[11px]">{`<MoreVertical className="h-4 w-4" />`}</code></Rule>
        <Rule>DropdownMenuContent: <code className="text-[11px]">align=&quot;end&quot; className=&quot;w-48&quot;</code></Rule>
        <Rule>Items: <code className="text-[11px]">text-xs gap-2</code> com ícone <code className="text-[11px]">h-3.5 w-3.5</code></Rule>
        <Rule>Items destrutivos: <code className="text-[11px]">text-destructive focus:text-destructive</code> (o token, igual nos dois temas)</Rule>
        <Rule>Click na TableCell de ações: <code className="text-[11px]">{`onClick={e => e.stopPropagation()}`}</code> pra não disparar o click da row</Rule>
        <Rule>Toolbar: o seletor de itens por página é o <strong>primeiro</strong> da barra, à esquerda dos filtros</Rule>
        <AntiRule>NÃO usar <code className="text-[11px]">TEXT.red</code> nem <code className="text-[11px]">hover:!text-white</code> em item destrutivo — o foco do item é fundo claro e o texto sumiria</AntiRule>
      </Card>

      <SubTitle>Variação — botões de ação na linha</SubTitle>
      <Note>
        Quando a linha tem poucas ações frequentes (abrir, excluir, concluir), elas podem ficar visíveis como botões de
        ícone, em vez do ⋮. Cada botão usa a variante <code className="text-[11px]">soft-*</code> da intenção da ação.
      </Note>
      <Demo
        code={`<TableHead className="w-[140px] text-right">Ações</TableHead>
…
<TableCell className="text-right">
  <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
    <Button variant="soft-success" size="icon-sm" title="Concluir"><Check className="h-3.5 w-3.5" /></Button>
    <Button variant="soft-info" size="icon-sm" title="Abrir"><Edit className="h-3.5 w-3.5" /></Button>
    <Button variant="soft-destructive" size="icon-sm" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
  </div>
</TableCell>`}
      >
        <div className="flex justify-end gap-1">
          <Button variant="soft-success" size="icon-sm" title="Concluir"><Check className="h-3.5 w-3.5" /></Button>
          <Button variant="soft-info" size="icon-sm" title="Abrir"><Edit className="h-3.5 w-3.5" /></Button>
          <Button variant="soft-destructive" size="icon-sm" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </Demo>
      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule>Todos no MESMO tamanho: <code className="text-[11px]">size=&quot;icon-sm&quot;</code> (32×32), ícone <code className="text-[11px]">h-3.5 w-3.5</code>, <code className="text-[11px]">gap-1</code>, <code className="text-[11px]">title</code> obrigatório</Rule>
        <Rule>Intenção: <code className="text-[11px]">soft-info</code> abrir/editar · <code className="text-[11px]">soft-destructive</code> excluir · <code className="text-[11px]">soft-success</code> concluir · <code className="text-[11px]">soft</code> neutro (baixar, link externo)</Rule>
        <Rule><strong>Largura da coluna</strong> (tabela <code className="text-[11px]">table-fixed</code>): 32px por botão + 4px entre eles + 32px de padding da célula — 1 botão = 64px, 2 = 104px, 3 = 140px. Menos que isso e o flex espreme os botões (ficam &quot;afinados&quot;)</Rule>
        <Rule>Use o dropdown ⋮ quando houver muitas ações ou ações raras (importar, varrer, configurar)</Rule>
        <AntiRule>NÃO usar botão sólido (<code className="text-[11px]">variant=&quot;success&quot;</code>, <code className="text-[11px]">bg-*</code>) nem outro tamanho (<code className="text-[11px]">xs</code>) no meio dos <code className="text-[11px]">soft-*</code></AntiRule>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — Formulários
// ═══════════════════════════════════════════════════════════════
function FormsSection() {
  return (
    <div className="space-y-6">
      <SubTitle>Campos de formulário</SubTitle>
      <Note>
        TODOS os campos (Input, Select, Combobox, DatePicker, etc.) seguem o mesmo padrão visual.
        Independente do tipo, a altura e tipografia são idênticas.
      </Note>

      <Demo
        code={`<div className="space-y-1.5">
  <Label className="text-[13px] font-semibold text-foreground">
    Nome <span className="text-rose-500">*</span>
  </Label>
  <Input className="h-9 text-sm" placeholder="Digite o nome..." />
</div>`}
      >
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-[13px] font-semibold text-foreground">
            Nome <span className="text-rose-500">*</span>
          </Label>
          <Input className="h-9 text-sm" placeholder="Digite o nome..." />
        </div>
      </Demo>

      <SubTitle>Grid de 12 colunas</SubTitle>
      <Note>
        Todo formulário usa <code className="text-[11px]">grid grid-cols-12 gap-3</code>. Os campos ocupam <code className="text-[11px]">col-span-12 sm:col-span-N</code>.
      </Note>

      <Demo
        code={`<div className="grid grid-cols-12 gap-3">
  <div className="col-span-12 sm:col-span-6 space-y-1.5">
    <Label className="text-[13px] font-semibold">Nome <span className="text-rose-500">*</span></Label>
    <Input className="h-9 text-sm" />
  </div>
  <div className="col-span-12 sm:col-span-3 space-y-1.5">
    <Label className="text-[13px] font-semibold">Tipo</Label>
    <Select><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>...</Select>
  </div>
  <div className="col-span-12 sm:col-span-3 space-y-1.5">
    <Label className="text-[13px] font-semibold">Valor</Label>
    <Input type="number" className="h-9 text-sm" />
  </div>
  <div className="col-span-12 space-y-1.5">
    <Label className="text-[13px] font-semibold">Observações</Label>
    <textarea className="w-full text-sm rounded-md px-3 py-2 min-h-[80px]" />
  </div>
</div>`}
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <Label className="text-[13px] font-semibold text-foreground">Nome <span className="text-rose-500">*</span></Label>
            <Input className="h-9 text-sm" placeholder="Notebook Dell..." />
          </div>
          <div className="col-span-12 sm:col-span-3 space-y-1.5">
            <Label className="text-[13px] font-semibold text-foreground">Tipo</Label>
            <Select defaultValue="hardware">
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="hardware">Hardware</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-span-12 sm:col-span-3 space-y-1.5">
            <Label className="text-[13px] font-semibold text-foreground">Valor</Label>
            <Input type="number" className="h-9 text-sm" placeholder="0,00" />
          </div>
        </div>
      </Demo>

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras canônicas</h4>
        <Rule><strong>Container do campo:</strong> <code className="text-[11px]">space-y-1.5</code></Rule>
        <Rule><strong>Label:</strong> <code className="text-[11px]">text-[13px] font-semibold text-foreground</code></Rule>
        <Rule><strong>Marcador obrigatório:</strong> <code className="text-[11px]">{`<span className="text-rose-500">*</span>`}</code> ao lado do texto</Rule>
        <Rule><strong>Altura input/select/combo:</strong> <code className="text-[11px]">h-9</code> (NUNCA h-8 ou outro valor em forms)</Rule>
        <Rule><strong>Fonte:</strong> <code className="text-[11px]">text-sm</code> (NUNCA text-xs em forms)</Rule>
        <Rule><strong>Grid:</strong> <code className="text-[11px]">grid grid-cols-12 gap-3</code></Rule>
        <Rule><strong>Botões inline:</strong> <code className="text-[11px]">h-9</code> com ícones <code className="text-[11px]">h-4 w-4</code></Rule>
        <Rule><strong>Textarea:</strong> usar <code className="text-[11px]">{`<RichEditor>`}</code> (TipTap) — nunca textarea puro em forms de produção</Rule>
        <Rule><strong>Fundo e borda:</strong> vêm da regra base do <code className="text-[11px]">globals.css</code> — vale para <code className="text-[11px]">input</code>, <code className="text-[11px]">textarea</code>, <code className="text-[11px]">select</code>, <code className="text-[11px]">Input</code>, <code className="text-[11px]">Textarea</code> e <code className="text-[11px]">SelectTrigger</code>. Combobox feito à mão leva <code className="text-[11px]">role=&quot;combobox&quot;</code></Rule>
        <AntiRule>NUNCA <code className="text-[11px]">bg-*</code> (<code className="text-[11px]">bg-card</code>, <code className="text-[11px]">bg-background</code>, <code className="text-[11px]">bg-transparent</code>…) nem <code className="text-[11px]">border</code>/<code className="text-[11px]">border-*</code> no campo — destoa dos outros no dark. Exceção: <code className="text-[11px]">border-destructive</code> de erro de validação</AntiRule>
        <AntiRule>NUNCA <code className="text-[11px]">h-8 text-xs</code> — só em filtros de toolbar de tabela (outro contexto)</AntiRule>
        <AntiRule>NUNCA labels com <code className="text-[11px]">text-[10px]/text-[11px] font-medium text-muted-foreground</code></AntiRule>
      </Card>

      <SubTitle>Ações de form (rodapé)</SubTitle>
      <Demo
        code={`<div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
  <Button variant="outline">Cancelar</Button>
  <Button variant="success" className="gap-1.5">
    <Save className="h-4 w-4" /> Salvar
  </Button>
</div>`}
      >
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline">Cancelar</Button>
          <Button variant="success" className="gap-1.5">
            <Save className="h-4 w-4" /> Salvar
          </Button>
        </div>
      </Demo>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — Botões
// ═══════════════════════════════════════════════════════════════
function ButtonsSection() {
  return (
    <div className="space-y-6">
      <SubTitle>Variantes</SubTitle>
      <Note>
        O <code className="text-[11px]">{`<Button>`}</code> em <code className="text-[11px]">@saas/ui</code> tem 14+ variantes. Use a hierarquia certa pra cada papel.
      </Note>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <ButtonShowcase label="default (primário)" code='variant="default"'><Button>Novo registro</Button></ButtonShowcase>
        <ButtonShowcase label="secondary" code='variant="secondary"'><Button variant="secondary">Cancelar</Button></ButtonShowcase>
        <ButtonShowcase label="destructive" code='variant="destructive"'><Button variant="destructive">Excluir</Button></ButtonShowcase>
        <ButtonShowcase label="success" code='variant="success"'><Button variant="success">Aprovar</Button></ButtonShowcase>
        <ButtonShowcase label="warning" code='variant="warning"'><Button variant="warning">Atenção</Button></ButtonShowcase>
        <ButtonShowcase label="info" code='variant="info"'><Button variant="info">Informar</Button></ButtonShowcase>
        <ButtonShowcase label="outline" code='variant="outline"'><Button variant="outline">Voltar</Button></ButtonShowcase>
        <ButtonShowcase label="outline-primary" code='variant="outline-primary"'><Button variant="outline-primary">Ação</Button></ButtonShowcase>
        <ButtonShowcase label="outline-destructive" code='variant="outline-destructive"'><Button variant="outline-destructive">Remover</Button></ButtonShowcase>
        <ButtonShowcase label="soft" code='variant="soft"'><Button variant="soft">Filtrar</Button></ButtonShowcase>
        <ButtonShowcase label="soft-destructive" code='variant="soft-destructive"'><Button variant="soft-destructive">Bloquear</Button></ButtonShowcase>
        <ButtonShowcase label="soft-success" code='variant="soft-success"'><Button variant="soft-success">Concluir</Button></ButtonShowcase>
        <ButtonShowcase label="soft-info" code='variant="soft-info"'><Button variant="soft-info">Editar</Button></ButtonShowcase>
        <ButtonShowcase label="soft-warning" code='variant="soft-warning"'><Button variant="soft-warning">Revisar</Button></ButtonShowcase>
        <ButtonShowcase label="ghost" code='variant="ghost"'><Button variant="ghost">Sutil</Button></ButtonShowcase>
        <ButtonShowcase label="ghost-destructive" code='variant="ghost-destructive"'><Button variant="ghost-destructive">Remover</Button></ButtonShowcase>
        <ButtonShowcase label="link" code='variant="link"'><Button variant="link">Ver mais</Button></ButtonShowcase>
      </div>

      <SubTitle>Tamanhos</SubTitle>
      <div className="flex items-center gap-2 flex-wrap rounded-md border border-border p-4 bg-card">
        <Button size="xs">xs</Button>
        <Button size="sm">sm</Button>
        <Button size="default">default</Button>
        <Button size="lg">lg</Button>
        <Button size="icon"><Settings /></Button>
        <Button size="icon-sm"><Settings /></Button>
        <Button size="icon-xs"><Settings /></Button>
      </div>

      <SubTitle>Hierarquia & posicionamento</SubTitle>
      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule><strong>Header de página:</strong> ação primária à direita (gap-1.5 + ícone h-4 w-4) — <code className="text-[11px]">Button</code> padrão (a primária do tema)</Rule>
        <Rule><strong>Form footer:</strong> Cancelar à esquerda (variant=&quot;outline&quot;), Salvar à direita (<code className="text-[11px]">variant=&quot;success&quot;</code>) — <code className="text-[11px]">justify-end gap-2</code></Rule>
        <Rule><strong>Modal footer:</strong> Cancelar (outline), depois a confirmação na cor do guideline de modais (ver <em>Modais</em>) — <code className="text-[11px]">justify-end gap-2</code></Rule>
        <Rule><strong>Linha de tabela:</strong> dropdown ⋮ ou botões <code className="text-[11px]">soft-*</code> de ícone (ver <em>Tabelas</em>)</Rule>
        <Rule><strong>Filtros toolbar:</strong> botões soft ou ghost com <code className="text-[11px]">size=&quot;sm&quot;</code> ou <code className="text-[11px]">h-8 text-xs</code></Rule>
        <Rule><strong>Ação destrutiva:</strong> sempre confirma via Dialog ou SweetAlert antes — nunca executa direto</Rule>
        <AntiRule>NÃO usar 2+ botões primários (default) no mesmo bloco — só 1 ação é primária</AntiRule>
        <AntiRule>NÃO pintar botão com a cor do módulo (<code className="text-[11px]">bg-sky-600</code> etc.)</AntiRule>
      </Card>

      <SubTitle>Verde semântico — quando usar</SubTitle>
      <Note>
        Verde significa <strong>concluído / positivo</strong>. Ele não é decoração nem cor de módulo.
      </Note>
      <div className="rounded-md border border-border bg-card p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="w-40 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Progresso</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 rounded-full bg-emerald-500" /></div>
        </div>
        <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground"><Switch checked onCheckedChange={() => {}} /> padrão</span>
        <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground"><Switch checked variant="success" onCheckedChange={() => {}} /> variant=&quot;success&quot;</span>
        <Button variant="success" size="sm" className="gap-1.5"><Save className="h-3.5 w-3.5" /> Salvar</Button>
        <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Novo</Button>
      </div>
      <Card className="p-4 space-y-2">
        <Rule><strong>Barra de progresso</strong> (e o % dela): sempre verde — <code className="text-[11px]">FILL.emerald</code> / <code className="text-[11px]">TEXT.emerald</code>. O % só vira verde se antes estava na primária; se era neutro, fica neutro</Rule>
        <Rule><strong>Botão que CONCLUI</strong> a ação (Salvar, Criar no rodapé, Confirmar, Importar, Concluir): <code className="text-[11px]">variant=&quot;success&quot;</code> (sólido) ou <code className="text-[11px]">soft-success</code> (na linha de tabela)</Rule>
        <Rule><strong>Botão que só ABRE</strong> algo (&quot;+ Novo…&quot; que abre modal, &quot;Nova manutenção&quot; que abre form, &quot;Enviar arquivo&quot; que abre o seletor): botão padrão — primária</Rule>
        <Rule><strong>Toggle ligado</strong> com sentido positivo: <code className="text-[11px]">{`<Switch variant="success" />`}</code> — nada de <code className="text-[11px]">accentColor</code> com hex</Rule>
        <AntiRule>Gráfico de barras horizontal (ranking, distribuição) NÃO é barra de progresso — fica na primária</AntiRule>
        <AntiRule>&quot;Enviar&quot; (mensagem, e-mail) e botões que filtram/navegam NÃO são verdes</AntiRule>
      </Card>
    </div>
  )
}

function ButtonShowcase({ label, code, children }: { label: string; code: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3 space-y-2 bg-card">
      <div>{children}</div>
      <div>
        <p className="text-[11px] font-mono text-muted-foreground">{code}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — Modais
// ═══════════════════════════════════════════════════════════════
function ModalsSection() {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-6">
      <SubTitle>Header padronizado — DialogHeaderIcon (OBRIGATÓRIO)</SubTitle>
      <Note>
        <strong>TODO modal do sistema</strong> usa o componente <code className="text-[11px]">{`<DialogHeaderIcon>`}</code> em
        <code className="text-[11px]"> @/components/ui/dialog-header-icon</code>. Ele renderiza o ícone à esquerda
        ocupando a altura do título + descrição. Substitui o <code className="text-[11px]">{`<DialogHeader>`}</code> cru.
      </Note>

      <Demo
        title="Exemplo ao vivo"
        label="JSX padrão"
        code={`import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { Database } from 'lucide-react'

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-lg">
    <DialogHeaderIcon icon={Database} color="emerald">
      <DialogTitle>Novo ativo</DialogTitle>
      <DialogDescription>
        Cadastro rápido — depois você pode editar todos os campos na página do ativo.
      </DialogDescription>
    </DialogHeaderIcon>
    <DialogBody className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold">Nome <span className="text-rose-500">*</span></Label>
        <Input className="h-9 text-sm" />
      </div>
    </DialogBody>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button variant="success" onClick={handleSave}>Salvar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`}
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Abrir modal de exemplo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeaderIconDemo icon={Database} color="emerald">
              <DialogTitle>Novo ativo</DialogTitle>
              <DialogDescription>
                Cadastro rápido — depois você pode editar todos os campos na página do ativo.
              </DialogDescription>
            </DialogHeaderIconDemo>
            <DialogBody className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold text-foreground">Nome <span className="text-rose-500">*</span></Label>
                <Input className="h-9 text-sm" placeholder="Ex: Notebook Dell" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold text-foreground">Valor</Label>
                <Input type="number" className="h-9 text-sm" placeholder="0,00" />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="success" onClick={() => setOpen(false)}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Demo>

      <SubTitle>Variantes avançadas</SubTitle>
      <Note>
        Casos especiais (loaders, modais com layout flex-column, headers sticky)
        são cobertos por 2 props opcionais:
      </Note>

      <CodeSnippet
        label="Header sr-only (loaders/skeletons)"
        code={`{/* Radix exige um DialogTitle SEMPRE — use srOnly em loaders/skeletons */}
<DialogHeaderIcon icon={Loader2} srOnly>
  <DialogTitle>Carregando…</DialogTitle>
</DialogHeaderIcon>`}
      />

      <CodeSnippet
        label="className próprio (sticky / modal flex-column)"
        code={`{/* Modal grande com body scrollável precisa de header sticky com borda */}
<DialogContent className="sm:max-w-[1100px] h-[85vh] flex flex-col p-0 overflow-hidden">
  <DialogHeaderIcon
    icon={Pencil}
    color="sky"
    className="px-6 pt-5 pb-3 shrink-0 border-b border-border/40"
  >
    <DialogTitle>Editar Serviço</DialogTitle>
    <DialogDescription>Configure o template com etapas e passos.</DialogDescription>
  </DialogHeaderIcon>
  <DialogBody className="px-6 pt-3 pb-2 flex-1 min-h-0 overflow-hidden">
    {/* conteúdo scrollável */}
  </DialogBody>
</DialogContent>`}
      />

      <SubTitle>Cores aceitas (prop color)</SubTitle>
      <Note>
        <code className="text-[11px]">color</code> é opcional — o default é <code className="text-[11px]">primary</code> (a cor
        do sistema, acompanha a skin). O componente aceita qualquer uma das cores abaixo.
      </Note>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {(['primary','sky','emerald','rose','amber','violet','indigo','cyan','orange','fuchsia','lime','slate','red','purple','blue'] as const).map(c => (
          <ColorDemo key={c} color={c} />
        ))}
      </div>

      <SubTitle>Quando usar cada cor (guideline)</SubTitle>
      <Note>
        Guideline, não regra absoluta — fuja dela quando a intenção pedir. A ação principal do modal sugere a cor do
        <strong> ícone</strong>. O <strong>botão de confirmação</strong> segue o verde semântico: se ele salva/cria/adiciona/atualiza/
        importa/conclui, é <code className="text-[11px]">variant=&quot;success&quot;</code> — mesmo que o ícone seja de outra cor
        (ex.: modal de editar com ícone sky e &quot;Salvar&quot; verde). Prefira a <code className="text-[11px]">variant</code> do
        Button a <code className="text-[11px]">style</code>/<code className="text-[11px]">bg-*</code> manual; só a ação principal leva
        cor (Cancelar/Fechar ficam <code className="text-[11px]">outline</code>). Modal único de criar/editar alterna só o ícone:
        {' '}<code className="text-[11px]">color={'{'}editando ? &apos;sky&apos; : &apos;emerald&apos;{'}'}</code> + botão sempre{' '}
        <code className="text-[11px]">variant=&quot;success&quot;</code>.
      </Note>
      <Card className="p-4 space-y-2">
        <ContextRow color="emerald" icon={Plus}          button='variant="success"'     when="Criar / Novo / Adicionar / Cadastrar" />
        <ContextRow color="sky"     icon={Edit}          button='variant="success" (Salvar)' when="Editar / Alterar" />
        <ContextRow color="rose"    icon={Trash2}        button='variant="destructive"' when="Excluir / Remover" />
        <ContextRow color="amber"   icon={AlertTriangle} button='variant="warning"'     when="Aviso / confirmação arriscada" />
        <ContextRow color="slate"   icon={Settings}      button='variant="success" (Salvar)' when="Configurações / parâmetros" />
        <ContextRow color="emerald" icon={Database}      button='variant="success"'     when="Importar / Exportar / Upload / Download" />
        <ContextRow color="primary" icon={Eye}           button="default"               when="Visualizar / detalhes / progresso (omitir color)" />
      </Card>

      <SubTitle>Confirmação destrutiva (alerts.confirm)</SubTitle>
      <Note>
        Para confirmar ações destrutivas curtas (excluir, cancelar, etc.) use <code className="text-[11px]">alerts.confirm()</code> em
        <code className="text-[11px]"> @/lib/alerts</code> — mais leve que abrir um Dialog completo. Passe{' '}
        <code className="text-[11px]">destructive: true</code> para o botão de confirmar sair vermelho (o mesmo do{' '}
        <code className="text-[11px]">alerts.confirmDelete()</code>, que já é o atalho para "Excluir registro" com texto padrão).
      </Note>

      <CodeSnippet
        label="Uso típico"
        code={`import { alerts } from '@/lib/alerts'

async function handleDelete(id: string) {
  const ok = await alerts.confirm({
    title: 'Excluir ativo',
    text: 'Esta ação é permanente. Deseja prosseguir?',
    confirmText: 'Excluir',
    icon: 'warning',
    destructive: true, // botão de confirmar vermelho
  })
  if (!ok) return
  try {
    await trpc.ativo.delete.mutate({ id })
    await alerts.success('Excluído', 'Ativo removido com sucesso')
    void refetch()
  } catch (e) {
    alerts.error('Erro', (e as Error).message)
  }
}`}
      />

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras (obrigatórias)</h4>
        <Rule><strong>Header:</strong> SEMPRE usar <code className="text-[11px]">{`<DialogHeaderIcon icon={X} color="Y">`}</code> — NUNCA <code className="text-[11px]">{`<DialogHeader>`}</code> cru</Rule>
        <Rule><strong>Ícone à esquerda:</strong> ocupa a altura de título + descrição (box <code className="text-[11px]">h-12 w-12 rounded-lg</code>)</Rule>
        <Rule><strong>Cor do ícone:</strong> casa com a ação (verde=criar, rose=deletar, sky=editar/info, amber=aviso)</Rule>
        <Rule><strong>Botão de confirmação:</strong> salvar/criar/atualizar/importar/concluir → <code className="text-[11px]">variant=&quot;success&quot;</code>, independente da cor do ícone; excluir → <code className="text-[11px]">destructive</code></Rule>
        <Rule><code className="text-[11px]">{`<DialogContent>`}</code>: <code className="text-[11px]">max-w-lg</code> (default), <code className="text-[11px]">max-w-2xl</code>/<code className="text-[11px]">4xl</code> conforme conteúdo</Rule>
        <Rule><code className="text-[11px]">{`<DialogBody>`}</code>: campos com padrão de form (h-9 text-sm, space-y-1.5)</Rule>
        <Rule><code className="text-[11px]">{`<DialogFooter>`}</code>: Cancelar (outline) à esquerda, Salvar/Confirmar à direita</Rule>
        <Rule>Confirmações destrutivas curtas: <code className="text-[11px]">alerts.confirm({`{ …, destructive: true }`})</code> ou <code className="text-[11px]">alerts.confirmDelete(nome)</code></Rule>
        <Rule><strong>Quando é <code className="text-[11px]">destructive: true</code>:</strong> a ação é destrutiva (excluir, remover, apagar, revogar, desvincular, limpar dados) <strong>ou</strong> o gatilho que abre o Swal é vermelho (variant <code className="text-[11px]">destructive</code>/<code className="text-[11px]">soft-destructive</code>, <code className="text-[11px]">text-destructive</code>, ícone/texto vermelho — inclusive só no hover). O Swal fala a mesma cor do botão que o abriu</Rule>
        <Rule>Uma função que atende gatilhos vermelhos e neutros recebe o <code className="text-[11px]">destructive</code> por parâmetro — só o vermelho passa <code className="text-[11px]">true</code></Rule>
        <AntiRule><strong>Arquivar</strong> nunca é destrutivo — não passa <code className="text-[11px]">destructive</code></AntiRule>
        <Rule>Toast de sucesso: <code className="text-[11px]">alerts.success()</code> · Erro: <code className="text-[11px]">alerts.error()</code></Rule>
        <AntiRule>NUNCA mais usar <code className="text-[11px]">{`<DialogTitle className="flex items-center gap-2">`}</code> com ícone inline</AntiRule>
        <AntiRule>NUNCA criar variações próprias do header — sempre <code className="text-[11px]">DialogHeaderIcon</code></AntiRule>
      </Card>
    </div>
  )
}

/** Demo inline do DialogHeaderIcon — duplica o JSX do componente real
 *  pra não criar dependência circular import na página do design system. */
function DialogHeaderIconDemo({ icon: Icon, color, children }: { icon: typeof Database; color: string; children: React.ReactNode }) {
  const COLOR_CLS: Record<string, string> = {
    sky:      cn('bg-sky-100 dark:bg-sky-950/40', TEXT.sky),
    emerald:  cn('bg-emerald-100 dark:bg-emerald-950/40', TEXT.emerald),
    rose:     cn('bg-rose-100 dark:bg-rose-950/40', TEXT.rose),
    amber:    cn('bg-amber-100 dark:bg-amber-950/40', TEXT.amber),
    violet:   cn('bg-violet-100 dark:bg-violet-950/40', TEXT.violet),
    indigo:   cn('bg-indigo-100 dark:bg-indigo-950/40', TEXT.indigo),
    cyan:     cn('bg-cyan-100 dark:bg-cyan-950/40', TEXT.cyan),
    orange:   cn('bg-orange-100 dark:bg-orange-950/40', TEXT.orange),
    fuchsia:  cn('bg-fuchsia-100 dark:bg-fuchsia-950/40', TEXT.fuchsia),
    lime:     cn('bg-lime-100 dark:bg-lime-950/40', TEXT.lime),
    slate:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    red:      cn('bg-red-100 dark:bg-red-950/40', TEXT.red),
    purple:   cn('bg-purple-100 dark:bg-purple-950/40', TEXT.purple),
    blue:     cn('bg-blue-100 dark:bg-blue-950/40', TEXT.blue),
  }
  return (
    <DialogHeader>
      <div className="flex items-start gap-3">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg', COLOR_CLS[color])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </DialogHeader>
  )
}

function ColorDemo({ color }: { color: string }) {
  const COLOR_CLS: Record<string, string> = {
    primary:  'bg-primary/10 text-primary',
    sky:      cn('bg-sky-100 dark:bg-sky-950/40', TEXT.sky),
    emerald:  cn('bg-emerald-100 dark:bg-emerald-950/40', TEXT.emerald),
    rose:     cn('bg-rose-100 dark:bg-rose-950/40', TEXT.rose),
    amber:    cn('bg-amber-100 dark:bg-amber-950/40', TEXT.amber),
    violet:   cn('bg-violet-100 dark:bg-violet-950/40', TEXT.violet),
    indigo:   cn('bg-indigo-100 dark:bg-indigo-950/40', TEXT.indigo),
    cyan:     cn('bg-cyan-100 dark:bg-cyan-950/40', TEXT.cyan),
    orange:   cn('bg-orange-100 dark:bg-orange-950/40', TEXT.orange),
    fuchsia:  cn('bg-fuchsia-100 dark:bg-fuchsia-950/40', TEXT.fuchsia),
    lime:     cn('bg-lime-100 dark:bg-lime-950/40', TEXT.lime),
    slate:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    red:      cn('bg-red-100 dark:bg-red-950/40', TEXT.red),
    purple:   cn('bg-purple-100 dark:bg-purple-950/40', TEXT.purple),
    blue:     cn('bg-blue-100 dark:bg-blue-950/40', TEXT.blue),
  }
  return (
    <div className="rounded-md border border-border p-2 flex items-center gap-2 bg-card">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', COLOR_CLS[color])}>
        <Box className="h-4 w-4" />
      </div>
      <code className="text-[11px] font-mono">color=&quot;{color}&quot;</code>
    </div>
  )
}

function ContextRow({ color, icon: Icon, when, button }: { color: string; icon: typeof Plus; when: string; button?: string }) {
  const COLOR_CLS: Record<string, string> = {
    primary:  'bg-primary/10 text-primary',
    sky:      cn('bg-sky-100 dark:bg-sky-950/40', TEXT.sky),
    emerald:  cn('bg-emerald-100 dark:bg-emerald-950/40', TEXT.emerald),
    rose:     cn('bg-rose-100 dark:bg-rose-950/40', TEXT.rose),
    amber:    cn('bg-amber-100 dark:bg-amber-950/40', TEXT.amber),
    violet:   cn('bg-violet-100 dark:bg-violet-950/40', TEXT.violet),
    slate:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  }
  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', COLOR_CLS[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 text-[12px]">
        <code className="text-[11px] font-mono font-semibold">color=&quot;{color}&quot;</code>
        <span className="text-foreground/70 ml-2">→ {when}</span>
        {button && <span className="block text-[11px] text-muted-foreground">botão de confirmação: <code className="font-mono">{button}</code></span>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — Página de detalhe (capa)
// ═══════════════════════════════════════════════════════════════
function DetailPageSection() {
  return (
    <div className="space-y-6">
      <SubTitle>Header de página de detalhe</SubTitle>
      <Note>
        Páginas de detalhe (<code className="text-[11px]">/clientes/[id]</code>, <code className="text-[11px]">/orcamentos/[id]</code>, <code className="text-[11px]">/perfil</code>)
        usam um wrapper bleed-edge com capa opcional + tint/overlay da <strong>primária</strong> + TabsList em pills centralizadas.
      </Note>

      <Card className="p-0 overflow-hidden">
        <div className="relative -m-0 overflow-hidden h-[120px]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 18%, transparent)' }}>
          <div className="relative z-10 px-6 py-5 flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center text-primary-on-surface font-bold text-lg">JD</div>
            <div>
              <h2 className="text-lg font-bold text-foreground">João da Silva</h2>
              <p className="text-[12px] text-muted-foreground">joao@example.com · OWNER</p>
            </div>
          </div>
        </div>
      </Card>

      <CodeSnippet
        label="Estrutura JSX (bleed-edge header)"
        code={`<div
  className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 overflow-hidden group/cover"
  style={!cover ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 18%, transparent)' } : undefined}
>
  {/* Capa em tile (NUNCA <img object-cover> que estica) */}
  {cover && (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: \`url('\${cover}')\`,
        backgroundRepeat: 'repeat',
        backgroundSize: 'auto',
        opacity: 0.2,
      }}
    />
  )}

  {/* Overlay gradiente: 0% à esquerda → 80% à direita (primária) */}
  {cover && (
    <div
      className="absolute inset-0"
      style={{ backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--color-primary) 0%, transparent) 0%, color-mix(in srgb, var(--color-primary) 80%, transparent) 100%)' }}
    />
  )}

  {/* Controles editáveis: só master, hover, base direita */}
  {isMaster && (
    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 opacity-100 pointer-events-none
                    sm:opacity-0 sm:group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto transition-opacity">
      {/* botões Personalizar/Trocar/Remover */}
    </div>
  )}

  <div className="relative z-10 px-4 sm:px-6 py-5">{/* avatar + título + badges + ações */}</div>
  <div className="relative z-10 px-4 sm:px-6 pb-2 flex justify-center">{/* TabsList */}</div>
</div>`}
      />

      <SubTitle>TabsList em pills (SlidingTabsList)</SubTitle>
      <Note>
        A TabsList do header usa <code className="text-[11px]">{`<SlidingTabsList>`}</code> de <code className="text-[11px]">@saas/ui</code> — pill flutuante que desliza entre as tabs (efeito Linear/Vercel).
      </Note>

      <CodeSnippet
        label="SlidingTabsList controlado"
        code={`const [activeTab, setActiveTab] = useState('detalhes')

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
    <SlidingTabsList
      activeValue={activeTab}
      className="min-w-max !shadow-sm !border !border-b !border-white/80 dark:!border-white/25
                 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit"
    >
      {/* variant="sliding": texto acima do pill, ativa em primary-on-surface — sem classes à mão */}
      <TabsTrigger value="detalhes" variant="sliding">
        <FileText className="h-3.5 w-3.5" /> Detalhes
      </TabsTrigger>
      {/* …demais tabs */}
    </SlidingTabsList>
  </div>
</Tabs>`}
      />

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule>Wrapper bleed-edge: <code className="text-[11px]">-mx-4 sm:-mx-6 -mt-4 sm:-mt-6</code> + <code className="text-[11px]">overflow-hidden</code> + <code className="text-[11px]">group/cover</code></Rule>
        <Rule>Primária com alpha <code className="text-[11px]">18%</code> (<code className="text-[11px]">color-mix</code>): fundo padrão (sem capa) e overlay (sobre capa)</Rule>
        <Rule>Imagem: <code className="text-[11px]">{`<div>`}</code> com <code className="text-[11px]">background-image</code> + <code className="text-[11px]">repeat</code> + <code className="text-[11px]">opacity: 0.2</code></Rule>
        <Rule>Controles de edição: só <code className="text-[11px]">isMaster</code>, posição <code className="text-[11px]">bottom-3 right-3 z-20</code>, hover-reveal</Rule>
        <Rule>SlidingTabsList controlado: <code className="text-[11px]">value</code>/<code className="text-[11px]">onValueChange</code> obrigatórios (defaultValue NÃO funciona)</Rule>
        <Rule>TabsTrigger: <code className="text-[11px]">variant=&quot;sliding&quot;</code> — a ativa SÓ muda a cor do texto (<code className="text-[11px]">primary-on-surface</code>); o pill que desliza é a indicação</Rule>
        <Rule>Contador na aba (nº de anexos, mensagens…): prop <code className="text-[11px]">count</code> do <code className="text-[11px]">TabsTrigger</code> — só aparece quando &gt; 0; não monte o <code className="text-[11px]">Badge</code> à mão</Rule>
        <AntiRule>NÃO pintar a aba ativa com a cor do módulo nem repetir as classes <code className="text-[11px]">!text-*</code> à mão</AntiRule>
        <Rule>Cada tab tem ícone temático <code className="text-[11px]">h-3.5 w-3.5</code></Rule>
        <AntiRule>NÃO usar <code className="text-[11px]">{`<img object-cover>`}</code> (estica imagem) — sempre <code className="text-[11px]">{`<div>`}</code> com background</AntiRule>
        <AntiRule>NÃO posicionar controles em <code className="text-[11px]">top-3</code> (colide com botões do header)</AntiRule>
      </Card>

      <SubTitle>Botão de voltar (BackButton)</SubTitle>
      <Note>
        Todo header de página de detalhe (canto superior direito) usa o componente <code className="text-[11px]">{`<BackButton>`}</code>.
        Encapsula cores corretas pra light/dark, hover que não some o ícone, e fallback de navegação quando a página é
        aberta direto via link (sem histórico).
      </Note>

      <Card className="p-6 flex flex-wrap items-center gap-6" style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, var(--color-card))' }}>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-foreground/70">Sozinho — com label:</span>
          <BackButton href="#" label="Voltar" />
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-foreground/70">Junto de outros botões — só ícone:</span>
          <Button size="sm" variant="outline" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Termo</Button>
          <Button size="sm" variant="success" className="gap-1.5"><Save className="h-3.5 w-3.5" /> Salvar</Button>
          <BackButton href="#" />
        </span>
      </Card>

      <CodeSnippet
        label="Uso"
        code={`import { BackButton } from '@/components/ui/back-button'

// 1) Com label — quando o voltar fica SOZINHO (ou só com texto/contador ao lado):
//    o texto preenche e deixa o botão óbvio
<BackButton href="/processos" label="Voltar" />

// 2) Só ícone — quando divide o espaço com OUTROS BOTÕES: economiza
//    espaço e fica mais limpo (vem por último, depois das ações)
<BackButton href="/ativos" />

// 3) Sem href → router.back() com fallback pra "/" se não houver histórico
<BackButton />
<BackButton fallbackHref="/helpdesk" />`}
      />

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule>SEMPRE usar <code className="text-[11px]">{`<BackButton href="..."/>`}</code> — destino determinístico bate <code className="text-[11px]">router.back()</code> cego</Rule>
        <Rule><strong>Com ou sem label:</strong> sozinho → <code className="text-[11px]">label=&quot;Voltar&quot;</code> (preenche melhor); junto de outros botões → só ícone (economiza espaço, fica mais limpo)</Rule>
        <Rule>Na barra da página ele é sempre a <strong>última</strong> ação</Rule>
        <Rule>Hover preserva o ícone (não vira branco-sobre-branco no light)</Rule>
        <Rule>Dark mode: <code className="text-[11px]">bg-card</code> + <code className="text-[11px]">border-white/15</code> — não cria clarão sobre o gradiente</Rule>
        <AntiRule>NÃO copiar o JSX antigo <code className="text-[11px]">{`<Button variant="outline" size="icon" ...>`}</code> com classes manuais</AntiRule>
        <AntiRule>NÃO usar <code className="text-[11px]">router.back()</code> direto — quebra em link copiado/nova aba</AntiRule>
      </Card>

      <SubTitle>Cabeçalho de painel lateral (Sheet de detalhe)</SubTitle>
      <Note>
        Detalhe aberto num <code className="text-[11px]">Sheet</code> (ex.: dia em <code className="text-[11px]">/relatorios-ti</code>,
        Reclamações/Elogios/Sugestões) abre com uma faixa em gradiente da primária e texto branco.
      </Note>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex items-start gap-3 px-6 py-4 text-white"
          style={{ background: 'linear-gradient(120deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 55%, #6366f1))' }}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[.14em] opacity-80">Relatórios da TI</p>
            <h3 className="truncate text-xl font-bold text-white">segunda-feira, 5 de outubro de 2026</h3>
            <p className="text-[12.5px] opacity-90">3 relatórios</p>
          </div>
          <Button variant="secondary" size="sm" className="gap-1.5"><FileText className="h-4 w-4" /> Gerar PDF</Button>
          <button type="button" className="rounded-md p-1.5 text-white/90 hover:bg-white/20"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <CodeSnippet
        label="Estrutura"
        code={`<SheetContent side="right" size="xl" hideClose
  className="flex flex-col overflow-hidden border-l-0 p-0">
  <div className="flex items-start gap-3 px-6 py-4 text-white"
    style={{ background: \`linear-gradient(120deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 55%, #6366f1))\` }}>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] uppercase tracking-[.14em] opacity-80">Contexto</p>
      <h2 className="truncate text-xl font-bold text-white">Título</h2>
      <p className="text-[12.5px] opacity-90">Linha de apoio</p>
    </div>
    <Button variant="secondary" size="sm">Ação</Button>
    <button onClick={onClose} className="rounded-md p-1.5 text-white/90 hover:bg-white/20"><X className="h-4 w-4" /></button>
  </div>
  …
</SheetContent>`}
      />
      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule><code className="text-[11px]">text-white</code> explícito no <strong>título</strong> — o global de h1/h2/h3 vence a herança e o escureceria no claro</Rule>
        <Rule>Botões sobre a faixa: <code className="text-[11px]">variant=&quot;secondary&quot;</code> (o <code className="text-[11px]">outline</code> tem fundo claro e herdaria o texto branco)</Rule>
        <Rule><code className="text-[11px]">border-l-0</code> no <code className="text-[11px]">SheetContent</code> — a borda de 1px fica fora da área recortada e sobraria um fio à esquerda da faixa</Rule>
        <AntiRule>NÃO usar a cor do módulo na faixa — é sempre a primária</AntiRule>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA — Sub-abas em Card
// ═══════════════════════════════════════════════════════════════
function SubTabsSection() {
  const [activeSubTab, setActiveSubTab] = useState('dados')
  return (
    <div className="space-y-6">
      <SubTitle>Sub-abas dentro de um Card (pills verticais)</SubTitle>
      <Note>
        Quando uma aba principal precisa de sub-divisões, use Card com pills verticais à esquerda — exatamente este padrão é o que você está vendo agora nesta página.
      </Note>

      <Card>
        <CardHeader>
          <h5 className="text-[13px] font-semibold">Configurações</h5>
        </CardHeader>
        <div className="flex min-h-[200px]">
          <div className="w-[150px] shrink-0 border-r border-border bg-muted/40 p-3">
            <div className="space-y-1">
              {['dados', 'preferencias', 'integracoes'].map(k => {
                const active = activeSubTab === k
                return (
                  <button
                    key={k}
                    onClick={() => setActiveSubTab(k)}
                    className={cn(
                      'w-full px-3 py-2 rounded-md text-[12px] font-medium text-left transition-colors',
                      active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {k}
                  </button>
                )
              })}
            </div>
          </div>
          <div key={activeSubTab} className="flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s' }}>
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">{activeSubTab}</h4>
              </div>
            </div>
            <div className="pt-5 text-[12px] text-foreground/70">Conteúdo da sub-aba {activeSubTab}…</div>
          </div>
        </div>
      </Card>

      <CodeSnippet
        label="Estrutura JSX"
        code={`<Card>
  <CardHeader>
    <h5 className="text-[13px] font-semibold">Título da seção</h5>
  </CardHeader>
  <div className="flex min-h-[450px]">
    {/* Pills laterais — tokens semânticos pra respeitar dark mode */}
    <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3">
      <button
        onClick={() => setActiveTab(key)}
        className={cn('w-full px-3 py-2 rounded-md text-[12px] font-medium text-left',
          active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground')}
      >
        <Icon className="h-3.5 w-3.5" /> Label
      </button>
    </div>

    {/* Conteúdo */}
    <div key={activeTab} className="flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
      {/* Título interno full-width via -m-5 */}
      <div className="-m-5">
        <div className="px-5 py-3 border-b border-border">
          <h4 className="text-[13px] font-semibold text-foreground">Título</h4>
        </div>
      </div>
      {/* Conteúdo grid 12 cols */}
      <div className="p-5 grid grid-cols-12 gap-3">…</div>
    </div>
  </div>
</Card>

{/* CSS global (se ainda não tem) */}
<style jsx global>{\`
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
\`}</style>`}
      />

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule>Coluna de pills: <code className="text-[11px]">w-[170px] shrink-0 border-r border-border bg-muted/40 p-3</code></Rule>
        <Rule>Pill ativa: <code className="text-[11px]">bg-primary text-primary-foreground shadow-sm</code></Rule>
        <Rule>Pill inativa: <code className="text-[11px]">text-foreground/70 hover:bg-muted/60 hover:text-foreground</code></Rule>
        <Rule>Conteúdo: <code className="text-[11px]">key={`{activeTab}`}</code> + animação <code className="text-[11px]">fadeSlideIn 0.25s</code></Rule>
        <Rule>Título interno full-width: wrapper <code className="text-[11px]">-m-5</code> com <code className="text-[11px]">{`<div className="px-5 py-3 border-b border-border">`}</code></Rule>
        <Rule>Conteúdo de formulário usa grid 12 cols (igual ao padrão de Forms)</Rule>
        <AntiRule>NUNCA <code className="text-[11px]">bg-[#f8f9fa]</code> ou <code className="text-[11px]">border-[rgba(0,0,0,0.08)]</code> — quebram no dark mode</AntiRule>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FAQ — Cascas (ArticleShell e SegmentoShell)
// ═══════════════════════════════════════════════════════════════
function FaqShellsSection() {
  return (
    <div className="space-y-6">
      <SubTitle>ArticleShell</SubTitle>
      <Note>
        Casca padrão de todo artigo do FAQ. Renderiza breadcrumb (← FAQ&apos;s / módulo),
        header com ícone+gradient na <strong>cor do artigo</strong> (<code className="text-[11px]">moduloColor</code>) e título/descrição.
        A cor do artigo é exposta aos blocos internos como <code className="text-[11px]">--faq-artigo-cor</code>.
      </Note>

      <CodeSnippet
        label="Como usar"
        code={`import { ArticleShell } from '../_components/article-shell'
import { Workflow } from 'lucide-react'

const MODULO_COLOR = '#8b5cf6'

export default function FaqMeuArtigoPage() {
  return (
    <ArticleShell
      modulo="Processos"
      moduloColor={MODULO_COLOR}
      icon={Workflow}
      titulo="Fluxo de processos: do orçamento à conclusão"
      descricao="Como configurar templates encadeados..."
    >
      {/* Sections, Steps, Callouts… */}
    </ArticleShell>
  )
}`}
      />

      <SubTitle>SegmentoShell</SubTitle>
      <Note>
        Composição padronizada para artigos <strong>por segmento</strong> de cliente
        (atacadista, indústria, tech, etc). Inclui seções fixas: glossário,
        cadeias disponíveis, particularidades, casos comuns e atalhos.
      </Note>

      <CodeSnippet
        label="Como usar"
        code={`import { SegmentoShell } from '../_components/segmento-shell'
import { Factory } from 'lucide-react'

export default function FaqSegmentoIndustriaLR() {
  return (
    <SegmentoShell
      modulo="Indústria — Lucro Real"
      moduloColor="#8b5cf6"
      icon={Factory}
      titulo="Segmento Indústria com Lucro Real"
      descricao="Templates fiscais, particularidades de IPI e SPED Fiscal"
      glossario={[
        { termo: 'IPI', texto: 'Imposto sobre Produtos Industrializados...' },
      ]}
      cadeias={{
        mensal: {
          nome: 'Mensal — Indústria LR',
          descricao: 'Apuração mensal...',
          templates: ['SPED Fiscal', 'EFD-Contribuições', 'DCTFWeb'],
        },
      }}
      particularidades={<ul className="list-disc list-inside space-y-1">
        <li>...</li>
      </ul>}
      casos={[
        { titulo: 'Como tratar produto em ZFM?', resposta: <>...</> },
      ]}
    />
  )
}`}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FAQ — Blocos (Section, Step, DefRow, FlagRow, CascadeRow, CasoPratico)
// ═══════════════════════════════════════════════════════════════
function FaqBlocksSection() {
  return (
    <div className="space-y-6">
      <SubTitle>Section</SubTitle>
      <Note>
        Card agrupador de conteúdo. O ícone fica numa caixinha tingida na <strong>cor do artigo</strong> (vem do
        <code className="text-[11px]"> ArticleShell</code> pela var <code className="text-[11px]">--faq-artigo-cor</code>; <code className="text-[11px]">cor</code> só vale fora de um shell)
        e o título é texto padrão em negrito, um pouco maior que os blocos internos — é o que separa o nível de seção.
      </Note>
      <Demo
        code={`<Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
  <div className="space-y-2 text-sm">
    <DefRow termo="Termo 1" texto="Definição..." />
  </div>
</Section>`}
      >
        <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
          <div className="space-y-2 text-sm">
            <DefRow termo="Termo 1" texto="Definição do termo 1" />
            <DefRow termo="Termo 2" texto="Definição do termo 2" />
          </div>
        </Section>
      </Demo>

      <SubTitle>Step</SubTitle>
      <Note>Card numerado para tutoriais. Aceita número, cor, ícone, título e rota.</Note>
      <Demo
        code={`<Step n={1} cor={MODULO_COLOR} icon={Workflow} titulo="Criar template" rota="/servicos">
  <p>Descrição detalhada do passo.</p>
</Step>`}
      >
        <Step n={1} cor={MODULE_COLOR} icon={Workflow} titulo="Criar um template" rota="/servicos">
          <p>Descrição detalhada do passo, pode incluir <code>código</code>, <strong>negrito</strong> e listas.</p>
        </Step>
      </Demo>

      <SubTitle>DefRow — Definição</SubTitle>
      <Demo
        code={`<DefRow termo="TCO" texto="Total Cost of Ownership — soma do valor de aquisição..." />`}
      >
        <div className="space-y-2">
          <DefRow termo="TCO" texto="Total Cost of Ownership — soma do valor de aquisição mais manutenções acumuladas." />
          <DefRow termo="Tag" texto="Etiqueta única do ativo (ex: AT-0001)." />
        </div>
      </Demo>

      <SubTitle>FlagRow — Toggle ativo/inativo</SubTitle>
      <Demo
        code={`<FlagRow label="disponivelOrcamento" on="Aparece no seletor..." off="Oculto do seletor..." />`}
      >
        <FlagRow
          label="disponivelOrcamento"
          on="Aparece no seletor de serviços ao montar um orçamento"
          off="Oculto do seletor — gestor precisa ativar manualmente"
        />
      </Demo>

      <SubTitle>CascadeRow — Item de cascata</SubTitle>
      <Demo
        code={`<CascadeRow ordem="1" titulo="Orçamento finalizado">Status muda para FINALIZADO</CascadeRow>`}
      >
        <div className="space-y-2">
          <CascadeRow ordem="1" titulo="Orçamento finalizado">Status muda para FINALIZADO</CascadeRow>
          <CascadeRow ordem="2" titulo="Sucessores criados">Templates encadeados viram serviços</CascadeRow>
        </div>
      </Demo>

      <SubTitle>CasoPratico</SubTitle>
      <Demo
        code={`<CasoPratico titulo="Pergunta?" descricao={<>Resposta...</>} />`}
      >
        <CasoPratico
          titulo="Cliente do Lucro Real precisa entregar SPED Fiscal?"
          descricao={<>Sim — toda empresa com regime LR está obrigada.</>}
        />
      </Demo>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FAQ — Callouts
// ═══════════════════════════════════════════════════════════════
function FaqCalloutsSection() {
  return (
    <div className="space-y-6">
      <SubTitle>Callout — três variantes</SubTitle>
      <Note>
        Bloco destacado: <strong>dica</strong> (emerald), <strong>aviso</strong> (amber), <strong>info</strong> (sky).
      </Note>

      <Demo
        title="dica — atalho ou recomendação positiva"
        code={`<Callout tipo="dica">Use <strong>Ctrl+K</strong> para abrir a busca global.</Callout>`}
      >
        <Callout tipo="dica">Use <strong>Ctrl+K</strong> para abrir a busca global em qualquer lugar do sistema.</Callout>
      </Demo>

      <Demo
        title="aviso — cuidado, restrição"
        code={`<Callout tipo="aviso">Excluir é <strong>bloqueado</strong> com serviços ativos.</Callout>`}
      >
        <Callout tipo="aviso">Excluir um template com serviços ativos é <strong>bloqueado</strong>.</Callout>
      </Demo>

      <Demo
        title="info — fato contextual"
        code={`<Callout tipo="info">Templates iniciam com <code>disponivelOrcamento: false</code>.</Callout>`}
      >
        <Callout tipo="info">Todos os templates iniciam com <code>disponivelOrcamento: false</code>.</Callout>
      </Demo>

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Quando usar cada tipo</h4>
        <p className="text-[11px] text-foreground/80"><Lightbulb className="inline h-3 w-3 text-emerald-600" /> <strong>dica:</strong> atalho de teclado, recurso pouco óbvio, recomendação de boa prática</p>
        <p className="text-[11px] text-foreground/80"><AlertTriangle className="inline h-3 w-3 text-amber-600" /> <strong>aviso:</strong> ação irreversível, regra de negócio que pode confundir, comportamento inesperado</p>
        <p className="text-[11px] text-foreground/80"><Info className="inline h-3 w-3 text-sky-600" /> <strong>info:</strong> fato sobre o sistema, comportamento padrão, default value</p>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FAQ — Atalhos
// ═══════════════════════════════════════════════════════════════
function FaqLinksSection() {
  return (
    <div className="space-y-6">
      <SubTitle>QuickLink</SubTitle>
      <Note>Card linkado para navegação rápida — usar em grids no final do artigo.</Note>
      <Demo
        code={`<Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    <QuickLink href="/servicos" label="Configurar templates" cor={MODULO_COLOR} />
    <QuickLink href="/orcamentos" label="Criar orçamento"    cor={MODULO_COLOR} />
  </div>
</Section>`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="#" label="Configurar templates" cor={MODULE_COLOR} />
          <QuickLink href="#" label="Cadastrar clientes"   cor={MODULE_COLOR} />
          <QuickLink href="#" label="Criar orçamento"      cor={MODULE_COLOR} />
          <QuickLink href="#" label="Como funciona"        cor={MODULE_COLOR} />
        </div>
      </Demo>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FAQ — Template de novo artigo
// ═══════════════════════════════════════════════════════════════
function FaqStarterSection() {
  return (
    <div className="space-y-6">
      <SubTitle>Como criar um novo artigo do FAQ</SubTitle>
      <Note>
        3 passos. Artigo aparece em <code className="text-[11px]">/faq</code> assim que estiver com <code className="text-[11px]">disponivel: true</code>.
      </Note>

      <Card>
        <CardContent className="p-4 space-y-3">
          <StarterStep n={1} title="Criar a página">
            Em <code className="text-[11px]">apps/web/src/app/(dashboard)/faq/&lt;slug&gt;/page.tsx</code>, copie o snippet abaixo.
          </StarterStep>
          <StarterStep n={2} title="Adicionar ao catálogo">
            Acrescente entrada em <code className="text-[11px]">faq/_components/articles-catalog.ts</code> com <code className="text-[11px]">disponivel: true</code>.
          </StarterStep>
          <StarterStep n={3} title="Testar">
            Acesse <code className="text-[11px]">/faq/&lt;slug&gt;</code> e verifique no light e dark mode.
          </StarterStep>
        </CardContent>
      </Card>

      <SubTitle>Snippet pronto — copy paste</SubTitle>
      <CodeSnippet
        label="apps/web/src/app/(dashboard)/faq/meu-slug/page.tsx"
        code={`'use client'

import { Workflow, Info, Lightbulb, ArrowRight } from 'lucide-react'
import { ArticleShell, FAQ_COLOR } from '../_components/article-shell'
import { Section, Step, Callout, DefRow, QuickLink } from '../_components/article-blocks'

const MODULO_COLOR = '#8b5cf6'

export default function FaqMeuSlugPage() {
  return (
    <ArticleShell
      modulo="Meu Módulo"
      moduloColor={MODULO_COLOR}
      icon={Workflow}
      titulo="Título do artigo (pergunta ou resumo)"
      descricao="Subtítulo que aparece no card de índice e no header"
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Termo 1" texto="Definição direta." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Como funciona</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Workflow} titulo="Primeiro passo" rota="/minha-rota">
        <p>Explicação detalhada do passo.</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Item da lista</li>
        </ul>
        <Callout tipo="dica">
          Dica útil — comportamento não óbvio, atalho.
        </Callout>
      </Step>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/minha-rota" label="Ir para o módulo" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}`}
      />

      <SubTitle>Entrada no catálogo</SubTitle>
      <CodeSnippet
        label="articles-catalog.ts"
        code={`{
  slug: 'meu-slug',
  titulo: 'Título do artigo',
  descricao: 'Subtítulo...',
  modulo: 'Meu Módulo',
  moduloColor: '#8b5cf6',
  icon: Workflow,
  categoria: 'Operacional',
  disponivel: true,
  tags: ['palavra-chave-1', 'palavra-chave-2'],
},`}
      />

      <Callout tipo="info">
        <strong>Checklist final:</strong> testou no dark mode? usou tokens semânticos (bg-muted/40, border-border)? título e descrição batem com conteúdo? tags cobrem o que o usuário buscaria?
      </Callout>
    </div>
  )
}

function StarterStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-[12px] font-bold" style={{ backgroundColor: MODULE_COLOR }}>{n}</div>
      <div className="flex-1">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="text-[12px] text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// APP MOBILE — Design System (documentação visual fiel)
// ═══════════════════════════════════════════════════════════════

/** Paleta do app mobile (Material 3 + marca sky). HEX usados diretamente
 *  porque ESTE bloco DOCUMENTA as cores do app — não é o tema do web. */
const MOBILE_LIGHT: { name: string; hex: string }[] = [
  { name: 'background', hex: '#ffffff' },
  { name: 'foreground', hex: '#0f172a' },
  { name: 'card', hex: '#ffffff' },
  { name: 'elevated', hex: '#f8fafc' },
  { name: 'muted', hex: '#f1f5f9' },
  { name: 'muted-foreground', hex: '#64748b' },
  { name: 'border', hex: '#e2e8f0' },
  { name: 'primary', hex: '#0ea5e9' },
  { name: 'accent', hex: '#6366f1' },
  { name: 'success', hex: '#10b981' },
  { name: 'warning', hex: '#f59e0b' },
  { name: 'destructive', hex: '#f43f5e' },
]

const MOBILE_DARK: { name: string; hex: string }[] = [
  { name: 'background', hex: '#09090c' },
  { name: 'foreground', hex: '#f4f4f5' },
  { name: 'card', hex: '#18181b' },
  { name: 'elevated', hex: '#27272a' },
  { name: 'muted-foreground', hex: '#a1a1aa' },
  { name: 'border', hex: '#27272a' },
  { name: 'primary', hex: '#38bdf8' },
  { name: 'accent', hex: '#818cf8' },
  { name: 'success', hex: '#34d399' },
  { name: 'warning', hex: '#fbbf24' },
  { name: 'destructive', hex: '#fb7185' },
]

// Tokens de referência do preview (cores claras do app, p/ as amostras de componente).
const M = {
  primary: '#0ea5e9',
  accent: '#6366f1',
  success: '#10b981',
  warning: '#f59e0b',
  destructive: '#f43f5e',
  card: '#ffffff',
  elevated: '#f8fafc',
  muted: '#f1f5f9',
  mutedFg: '#64748b',
  border: '#e2e8f0',
  fg: '#0f172a',
} as const

function MobileSwatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 w-[76px]">
      <div
        className="h-16 w-16 rounded-[14px] border border-border/40 shadow-sm shrink-0"
        style={{ backgroundColor: hex }}
      />
      <div className="text-center leading-tight">
        <p className="text-[10px] font-semibold text-foreground truncate w-[76px]" title={name}>{name}</p>
        <p className="text-[9px] font-mono text-muted-foreground uppercase">{hex}</p>
      </div>
    </div>
  )
}

/** Botão "mockado" do app — cor de fundo = hex do app, rounded-[12px]. */
function MobileButton({
  label, variant = 'default', size = 'default',
}: {
  label: string
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'success'
  size?: 'sm' | 'default' | 'lg'
}) {
  const h = { sm: 'h-9 text-[13px] px-3', default: 'h-11 text-sm px-4', lg: 'h-12 text-[15px] px-5' }[size]
  const style: React.CSSProperties =
    variant === 'default' ? { backgroundColor: M.primary, color: '#ffffff' } :
    variant === 'destructive' ? { backgroundColor: M.destructive, color: '#ffffff' } :
    variant === 'success' ? { backgroundColor: M.success, color: '#ffffff' } :
    variant === 'outline' ? { backgroundColor: 'transparent', color: M.fg, border: `1px solid ${M.border}` } :
    /* ghost */ { backgroundColor: 'transparent', color: M.primary }
  return (
    <button
      type="button"
      className={cn('inline-flex items-center justify-center rounded-[12px] font-semibold transition-opacity hover:opacity-90', h)}
      style={style}
    >
      {label}
    </button>
  )
}

function MobileStatCard({ label, value, delta, up }: { label: string; value: string; delta: string; up: boolean }) {
  return (
    <div className="rounded-[16px] p-4 shadow-sm" style={{ backgroundColor: M.elevated, border: `1px solid ${M.border}` }}>
      <div className="flex items-start justify-between gap-2">
        <div
          className="h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${M.primary}1a`, color: M.primary }}
        >
          <Calendar className="h-4 w-4" />
        </div>
        <span
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
          style={{ color: up ? M.success : M.destructive }}
        >
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{delta}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums" style={{ color: M.fg }}>{value}</p>
      <p className="text-[12px]" style={{ color: M.mutedFg }}>{label}</p>
    </div>
  )
}

function MobileBadge({ label, kind = 'default' }: {
  label: string
  kind?: 'default' | 'outline' | 'secondary' | 'success' | 'warning' | 'destructive'
}) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold'
  let style: React.CSSProperties
  switch (kind) {
    case 'outline':    style = { color: M.fg, border: `1px solid ${M.border}` }; break
    case 'secondary':  style = { backgroundColor: M.muted, color: M.mutedFg }; break
    case 'success':    style = { backgroundColor: `${M.success}1f`, color: M.success }; break
    case 'warning':    style = { backgroundColor: `${M.warning}24`, color: M.warning }; break
    case 'destructive':style = { backgroundColor: `${M.destructive}1f`, color: M.destructive }; break
    default:           style = { backgroundColor: M.primary, color: '#ffffff' }
  }
  return <span className={base} style={style}>{label}</span>
}

function MobileListItem({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ backgroundColor: M.card, borderBottom: `1px solid ${M.border}` }}
    >
      <div
        className="h-10 w-10 rounded-[12px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${M.accent}1a`, color: M.accent }}
      >
        <FileText className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold truncate" style={{ color: M.fg }}>{title}</p>
        <p className="text-[12px] truncate" style={{ color: M.mutedFg }}>{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: M.mutedFg }} />
    </div>
  )
}

function MobileSwitchRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ backgroundColor: M.card, borderBottom: `1px solid ${M.border}` }}
    >
      <span className="text-[14px] font-medium" style={{ color: M.fg }}>{label}</span>
      <div
        className="relative h-6 w-11 rounded-full transition-colors shrink-0"
        style={{ backgroundColor: on ? M.primary : M.border }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ left: on ? '22px' : '2px' }}
        />
      </div>
    </div>
  )
}

function MobileInput({ label, value, error }: { label: string; value: string; error?: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-semibold" style={{ color: M.fg }}>{label}</p>
      <div
        className="h-11 rounded-[12px] flex items-center px-3 text-sm"
        style={{
          backgroundColor: M.card,
          color: M.fg,
          border: `1px solid ${error ? M.destructive : M.border}`,
        }}
      >
        {value}
      </div>
      {error && <p className="text-[12px] font-medium" style={{ color: M.destructive }}>{error}</p>}
    </div>
  )
}

function MobileDesignSystemSection() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-[14px] flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: M.primary }}>
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-foreground">Design System — App Mobile (Android)</h2>
          <p className="text-[12px] text-muted-foreground">Material 3 + marca sky · data-first</p>
        </div>
      </div>

      <Callout tipo="info">
        Este é o design system do app <strong>OneClick ERP</strong> (Android, React Native). Inspiração
        <strong> Material 3</strong> com a marca <strong>sky</strong>. No app, ele fica em
        <strong> Conta → Design System</strong> e renderiza igual no <strong>Android</strong> e no
        <strong> web build</strong>. Como os componentes são React Native, este bloco é a
        documentação visual fiel — markup web (HTML+Tailwind) espelhando os tokens do app. Os
        <strong> HEX abaixo são os do app</strong> (não os tokens do tema web).
      </Callout>

      {/* ── Paleta ─────────────────────────────────────────── */}
      <SubTitle>Paleta — Claro</SubTitle>
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap gap-3">
          {MOBILE_LIGHT.map(s => <MobileSwatch key={`l-${s.name}`} name={s.name} hex={s.hex} />)}
        </div>
      </div>

      <SubTitle>Paleta — Escuro</SubTitle>
      <div className="rounded-md border border-border p-4" style={{ backgroundColor: '#09090c' }}>
        <div className="flex flex-wrap gap-3">
          {MOBILE_DARK.map(s => <MobileSwatch key={`d-${s.name}`} name={s.name} hex={s.hex} />)}
        </div>
      </div>

      {/* ── Tipografia ─────────────────────────────────────── */}
      <SubTitle>Tipografia</SubTitle>
      <div className="rounded-md border border-border bg-card p-4 space-y-2.5">
        <p className="text-3xl font-bold text-foreground leading-tight">Display — text-3xl bold</p>
        <p className="text-2xl font-bold text-foreground leading-tight">Title — text-2xl bold</p>
        <p className="text-lg font-semibold text-foreground">Heading — text-lg semibold</p>
        <p className="text-base text-foreground">Body — text-base regular</p>
        <p className="text-sm font-medium text-foreground">Label — text-sm medium</p>
        <p className="text-xs text-muted-foreground">Caption — text-xs muted</p>
        <div className="pt-2 border-t border-border/60">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Números tabulares</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">R$ 12.345,67</p>
          <code className="text-[10px] text-muted-foreground">font-variant-numeric: tabular-nums · class tabular-nums</code>
        </div>
      </div>

      {/* ── Raio & elevação ────────────────────────────────── */}
      <SubTitle>Raio & elevação</SubTitle>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Raio</p>
          <div className="flex items-end gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-16 w-16 rounded-[14px] border" style={{ backgroundColor: M.elevated, borderColor: M.border }} />
              <code className="text-[10px] text-muted-foreground">rounded-[14px]</code>
              <span className="text-[10px] text-muted-foreground/80">cards</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-16 w-16 rounded-[20px] border" style={{ backgroundColor: M.elevated, borderColor: M.border }} />
              <code className="text-[10px] text-muted-foreground">rounded-[20px]</code>
              <span className="text-[10px] text-muted-foreground/80">sheets</span>
            </div>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Superfícies</p>
          <div className="flex items-end gap-4">
            {([['muted', M.muted], ['card', M.card], ['elevated', M.elevated]] as const).map(([n, hex]) => (
              <div key={n} className="flex flex-col items-center gap-1.5">
                <div className="h-16 w-16 rounded-[14px] border shadow-sm" style={{ backgroundColor: hex, borderColor: M.border }} />
                <code className="text-[10px] text-muted-foreground">{n}</code>
                <span className="text-[9px] font-mono text-muted-foreground/80 uppercase">{hex}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Componentes ────────────────────────────────────── */}
      <SubTitle>Componentes</SubTitle>
      <Note>Previews web fiéis aos componentes nativos em <code className="text-[11px]">apps/mobile/src/components/ui/*</code>.</Note>

      {/* Botões */}
      <div className="rounded-md border border-border bg-card p-4 space-y-4">
        <p className="text-[13px] font-semibold text-foreground">Botões</p>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Variantes</p>
          <div className="flex flex-wrap gap-2">
            <MobileButton label="Default" variant="default" />
            <MobileButton label="Outline" variant="outline" />
            <MobileButton label="Ghost" variant="ghost" />
            <MobileButton label="Destructive" variant="destructive" />
            <MobileButton label="Success" variant="success" />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Tamanhos</p>
          <div className="flex flex-wrap items-center gap-2">
            <MobileButton label="sm · h-9" size="sm" />
            <MobileButton label="default · h-11" size="default" />
            <MobileButton label="lg · h-12" size="lg" />
          </div>
        </div>
      </div>

      {/* StatCard */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <p className="text-[13px] font-semibold text-foreground">StatCard</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MobileStatCard label="Obrigações no mês" value="1.248" delta="12%" up />
          <MobileStatCard label="Pendências" value="37" delta="8%" up={false} />
          <MobileStatCard label="Faturamento" value="R$ 84,2k" delta="5%" up />
        </div>
      </div>

      {/* Badge */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <p className="text-[13px] font-semibold text-foreground">Badge</p>
        <div className="flex flex-wrap gap-2">
          <MobileBadge label="Default" kind="default" />
          <MobileBadge label="Outline" kind="outline" />
          <MobileBadge label="Secondary" kind="secondary" />
          <MobileBadge label="Sucesso" kind="success" />
          <MobileBadge label="Atenção" kind="warning" />
          <MobileBadge label="Erro" kind="destructive" />
        </div>
      </div>

      {/* ListItem + SwitchRow */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <p className="text-[13px] font-semibold text-foreground">ListItem</p>
          <div className="rounded-[14px] overflow-hidden" style={{ border: `1px solid ${M.border}` }}>
            <MobileListItem title="DCTFWeb — Maio/2026" subtitle="Vence em 3 dias" />
            <MobileListItem title="eSocial — Folha" subtitle="Concluído" />
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <p className="text-[13px] font-semibold text-foreground">SwitchRow</p>
          <div className="rounded-[14px] overflow-hidden" style={{ border: `1px solid ${M.border}` }}>
            <MobileSwitchRow label="Notificações push" on />
            <MobileSwitchRow label="Modo escuro automático" on={false} />
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <p className="text-[13px] font-semibold text-foreground">Input</p>
        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
          <MobileInput label="CNPJ" value="12.345.678/0001-90" />
          <MobileInput label="E-mail" value="invalido@" error="Informe um e-mail válido." />
        </div>
      </div>

      <Callout tipo="info">
        Arquivos: componentes em <code className="text-[11px]">apps/mobile/src/components/ui/*</code> ·
        tela em <code className="text-[11px]">apps/mobile/src/app/design-system.tsx</code> ·
        tokens em <code className="text-[11px]">apps/mobile/src/global.css</code>.
      </Callout>
    </div>
  )
}
