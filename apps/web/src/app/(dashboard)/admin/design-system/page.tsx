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
import {
  Palette, Layout, Box, Inbox, Hash, Copy, Check, Lock,
  Info, Lightbulb, AlertTriangle, FileCode, Workflow,
  Sparkles, Database, Plus, Search, Eye, Edit, Trash2,
  MoreVertical, Calculator, FileText, MessageSquare,
  Settings, X, Save, ListChecks, ShoppingCart, RotateCcw, Loader2,
} from 'lucide-react'
import { useModuleColors, useRefreshModuleColors, useSetLocalModuleColor, DEFAULT_MODULE_COLORS } from '@/components/theme/module-colors'
import { alerts } from '@/lib/alerts'
import { trpc } from '@/lib/trpc'
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
  Card, CardHeader, CardContent, Button, Badge, Input, Label, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody,
  DialogFooter, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { PageHeaderIcon, type ModuleSlug } from '@/components/ui/page-header-icon'
import { FAQ_COLOR } from '@/app/(dashboard)/faq/_components/article-shell'
import {
  Section, Step, DefRow, FlagRow, Callout, CascadeRow, CasoPratico, QuickLink,
} from '@/app/(dashboard)/faq/_components/article-blocks'

const MODULE_COLOR = '#8b5cf6' // violet — admin/interno

type TabKey =
  | 'tokens' | 'page-header' | 'kpis' | 'tables' | 'forms'
  | 'buttons' | 'modals' | 'detail' | 'subtabs'
  | 'faq-shells' | 'faq-blocks' | 'faq-callouts' | 'faq-links' | 'faq-starter'

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
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm"
               style={{ background: MODULE_COLOR }}>
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1>Design System</h1>
            <p className="text-sm text-muted-foreground">
              Padrões visuais do SaaS — cabeçalhos, formulários, tabelas, modais e componentes do FAQ
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 h-7">
          <Lock className="h-3 w-3" /> Interno · master only
        </Badge>
      </div>

      {/* Card com pills laterais (padrão CLAUDE.md, agora theme-aware) */}
      <Card>
        <CardHeader>
          <h5 className="text-[13px] font-semibold">Padrões do sistema</h5>
        </CardHeader>
        <div className="flex min-h-[700px]">
          {/* Pills laterais com seções */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
            <PillGroup label="Sistema" tabs={TABS_SISTEMA} activeTab={activeTab} onSelect={setActiveTab} />
            <PillGroup label="FAQ" tabs={TABS_FAQ} activeTab={activeTab} onSelect={setActiveTab} className="mt-4" />
          </div>

          {/* Conteúdo */}
          <div key={activeTab} className="flex-1 p-5 overflow-x-auto" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
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
                !active && 'text-foreground/70 hover:bg-muted/60 hover:text-foreground',
              )}
              style={active ? { backgroundColor: MODULE_COLOR, color: 'white' } : undefined}
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
      <pre className="text-[11px] font-mono p-3 overflow-x-auto whitespace-pre max-h-[500px] text-foreground/80 leading-relaxed">
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
      </div>

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

  const MODULES: { slug: string; label: string; desc: string }[] = [
    { slug: 'cadastros',     label: 'Cadastros',     desc: 'Verde — clientes, colaboradores, empresas' },
    { slug: 'comercial',     label: 'Comercial',     desc: 'Rose — CRM, orçamentos, pipeline' },
    { slug: 'corporativo',   label: 'Corporativo',   desc: 'Sky — TI, projetos, contratos' },
    { slug: 'administrativo', label: 'Administrativo', desc: 'Sky claro — administrativo geral' },
    { slug: 'legalizacao',   label: 'Legalização',   desc: 'Fuchsia — constituição, alterações' },
    { slug: 'trabalhista',   label: 'Trabalhista',   desc: 'Lime — folha, holerites, eSocial' },
    { slug: 'fiscal',        label: 'Fiscal',        desc: 'Indigo — CNDs, DCTFWeb, situação fiscal' },
    { slug: 'contabil',      label: 'Contábil',      desc: 'Violet — balancetes, BI' },
    { slug: 'ti',            label: 'TI',            desc: 'Cyan — ativos, helpdesk' },
    { slug: 'qualidade',     label: 'Qualidade',     desc: 'Amber — não conformidades, melhorias' },
    { slug: 'configuracoes', label: 'Configurações', desc: 'Orange — settings gerais' },
    { slug: 'processos',     label: 'Processos',     desc: 'Violet — engine de processos' },
    { slug: 'faq',           label: 'FAQ',           desc: 'Cyan — FAQ_COLOR (títulos de Section)' },
    { slug: 'perfil',        label: 'Perfil',        desc: 'Sky suave — perfil, usuário' },
  ]

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
      void persistColor(slug, label, pendingColorRefs.current[slug])
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

  async function handleReset(slug: string, label: string) {
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

      <Callout tipo="info">
        Use em código novo:
        <code className="text-[11px] block mt-1">{`style={{ background: 'var(--mod-cadastros)' }}`}</code>
        ou via hook: <code className="text-[11px]">{`const cor = useModuleColor('cadastros')`}</code>
      </Callout>

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
                      onClick={() => handleReset(m.slug, m.label)}
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
        <div className="rounded-md border border-border bg-card overflow-hidden h-fit sticky top-4">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Log de eventos</p>
            {logs.length > 0 && (
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => setLogs([])}>Limpar</Button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
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
                        l.tipo === 'ok'  && 'text-emerald-600 dark:text-emerald-400',
                        l.tipo === 'err' && 'text-rose-600 dark:text-rose-400',
                        l.tipo === 'info' && 'text-sky-600 dark:text-sky-400',
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
    pending: { label: '●', cls: 'text-amber-600 dark:text-amber-400', title: 'Alterado, aguardando debounce' },
    saving:  { label: '⟳', cls: 'text-sky-600 dark:text-sky-400 animate-spin inline-block', title: 'Salvando no servidor' },
    saved:   { label: '✓', cls: 'text-emerald-600 dark:text-emerald-400', title: 'Salvo' },
    error:   { label: '!', cls: 'text-rose-600 dark:text-rose-400', title: 'Erro ao salvar' },
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
  const MODULES: Array<{ slug: ModuleSlug; label: string; icon: typeof Database }> = [
    { slug: 'cadastros',      label: 'Cadastros',      icon: Database },
    { slug: 'comercial',      label: 'Comercial',      icon: Database },
    { slug: 'administrativo', label: 'Administrativo', icon: Database },
    { slug: 'legalizacao',    label: 'Legalização',    icon: Database },
    { slug: 'trabalhista',    label: 'Trabalhista',    icon: Database },
    { slug: 'fiscal',         label: 'Fiscal',         icon: Database },
    { slug: 'contabil',       label: 'Contábil',       icon: Database },
    { slug: 'ti',             label: 'TI',             icon: Database },
    { slug: 'qualidade',      label: 'Qualidade',      icon: Database },
    { slug: 'configuracoes',  label: 'Configurações',  icon: Database },
  ]

  return (
    <div className="space-y-6">
      <SubTitle>Header de página — ícone padronizado</SubTitle>
      <Note>
        Todo header de página de listagem usa <code className="text-[11px]">{`<PageHeaderIcon module="..." icon={...} />`}</code> à esquerda do título.
        O fundo do ícone é resolvido por <code className="text-[11px]">var(--mod-&lt;slug&gt;)</code> — editar cor do bloco no tab <strong>Tokens & cores</strong> reflete em todos os headers automaticamente.
      </Note>

      <Demo
        code={`import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { Database } from 'lucide-react'

<div className="flex items-center justify-between gap-4">
  <div className="flex items-center gap-3">
    <PageHeaderIcon module="ti" icon={Database} />
    <div>
      <h1>Gestão de Ativos</h1>
      <p className="text-sm text-muted-foreground">Patrimônio de TI, mobiliário e equipamentos</p>
    </div>
  </div>
  <Button className="gap-1.5"><Plus className="h-4 w-4" /> Novo ativo</Button>
</div>`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PageHeaderIcon module="ti" icon={Database} />
            <div>
              <h1 className="text-foreground">Gestão de Ativos</h1>
              <p className="text-sm text-muted-foreground">Patrimônio de TI, mobiliário e equipamentos</p>
            </div>
          </div>
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo ativo
          </Button>
        </div>
      </Demo>

      <SubTitle>Galeria — todas as cores de bloco</SubTitle>
      <Note>
        Cada slug usa <code className="text-[11px]">var(--mod-&lt;slug&gt;, &lt;fallback&gt;)</code> com fallback hex hardcoded em <code className="text-[11px]">PageHeaderIcon.FALLBACK_HEX</code>. As cores efetivas são editáveis em <strong>Tokens & cores</strong>.
      </Note>
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {MODULES.map(m => (
            <div key={m.slug} className="flex items-center gap-2 rounded-md border border-border p-2.5">
              <PageHeaderIcon module={m.slug} icon={m.icon} size="sm" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium leading-tight">{m.label}</p>
                <code className="text-[10px] text-muted-foreground">{m.slug}</code>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule>Sempre <code className="text-[11px]">{`<PageHeaderIcon module="..." icon={...} />`}</code> — nunca <code className="text-[11px]">{`<div className="bg-gradient-to-br from-X-500 ...">`}</code></Rule>
        <Rule>O <code className="text-[11px]">module</code> deve bater com o slug do bloco da sidebar (cadastros, comercial, fiscal, ti, ...)</Rule>
        <Rule>Tamanho padrão = <code className="text-[11px]">h-12 w-12</code>. Use <code className="text-[11px]">size="sm"</code> (<code className="text-[11px]">h-10 w-10</code>) em headers compactos.</Rule>
        <Rule>O fundo é cor sólida (não gradiente) — a cor do bloco é dinâmica via CSS var.</Rule>
        <AntiRule>NUNCA hardcodar <code className="text-[11px]">from-emerald-500 to-emerald-600</code> ou similares.</AntiRule>
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
        code={`<Card className="p-3">
  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
    <KpiCard icon={Database}      label="Total"             value="252"    color="sky" />
    <KpiCard icon={Coins}         label="Valor patrimonial" value="R$ 1.2M" color="emerald" />
    <KpiCard icon={AlertTriangle} label="Garantia ≤ 30d"    value="3"      color="amber" />
  </div>
</Card>

function KpiCard({ icon: Icon, label, value, color }: {...}) {
  const map = {
    rose:    'text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-300',
    amber:   'text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300',
    emerald: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300',
    sky:     'text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300',
    // ...
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center', map[color])}>
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
            <KpiCardDemo icon={Database}      label="Total"      value="252"    color="sky" />
            <KpiCardDemo icon={Calculator}    label="Patrimônio" value="R$ 1.2M" color="emerald" />
            <KpiCardDemo icon={AlertTriangle} label="Alertas"    value="3"      color="amber" />
          </div>
        </Card>
      </Demo>

      <Card className="p-4 space-y-2">
        <h4 className="text-[12px] font-bold">Regras</h4>
        <Rule>Card wrapper com padding pequeno (<code className="text-[11px]">p-3</code>)</Rule>
        <Rule>Grid responsivo: <code className="text-[11px]">grid-cols-2 md:grid-cols-4 lg:grid-cols-7</code></Rule>
        <Rule>Ícone <code className="text-[11px]">h-9 w-9 rounded-md</code> com cor de tinta (bg + text)</Rule>
        <Rule>Label <code className="text-[11px]">text-[10px] uppercase tracking-wider</code></Rule>
        <Rule>Valor <code className="text-[11px]">text-lg font-bold tabular-nums</code></Rule>
        <Rule>Cores: rose (problema), amber (atenção), emerald (positivo), sky (info), slate (neutro), violet (especial)</Rule>
      </Card>
    </div>
  )
}

function KpiCardDemo({ icon: Icon, label, value, color }: { icon: typeof Database; label: string; value: string; color: string }) {
  const map: Record<string, string> = {
    rose:    'text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-300',
    amber:   'text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300',
    emerald: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300',
    sky:     'text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300',
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center', map[color])}>
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
      <SubTitle>Tabela com filtros + ações dropdown</SubTitle>
      <Note>
        Padrão: Card → toolbar de filtros (bg-muted/20) → tabela → paginação. Coluna de ações usa dropdown ⋮.
      </Note>

      <Demo
        label="Estrutura completa"
        code={`<Card>
  {/* Toolbar de filtros */}
  <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3
                  sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={String(limit)} onValueChange={...}>
        <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
        <SelectContent>{[20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={status} onValueChange={...}>
        <SelectTrigger className="h-8 w-[170px] text-xs bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>...</SelectContent>
      </Select>
    </div>
    <div className="relative">
      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
      <Input placeholder="Buscar..." className="h-8 pl-8 w-full sm:w-[260px] text-xs bg-card" />
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
                <DropdownMenuItem className="text-xs gap-2 text-red-500 focus:text-red-500">
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
                <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem></SelectContent>
              </Select>
              <Select defaultValue="__all__">
                <SelectTrigger className="h-8 w-[140px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">Todos status</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar..." className="h-8 pl-8 w-[200px] text-xs bg-card" />
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
                      <DropdownMenuItem className="text-xs gap-2 text-red-500 focus:text-red-500">
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
        <Rule>Filtros (Select/Input): <code className="text-[11px]">h-8 text-xs bg-card</code> (mais compacto que o padrão de form)</Rule>
        <Rule>Coluna Ações: <code className="text-[11px]">{`<TableHead className="text-xs text-right">`}</code></Rule>
        <Rule>Dropdown: <code className="text-[11px]">{`<Button variant="ghost" size="icon-sm" className="h-7 w-7">`}</code> com <code className="text-[11px]">{`<MoreVertical className="h-4 w-4" />`}</code></Rule>
        <Rule>DropdownMenuContent: <code className="text-[11px]">align=&quot;end&quot; className=&quot;w-48&quot;</code></Rule>
        <Rule>Items: <code className="text-[11px]">text-xs gap-2</code> com ícone <code className="text-[11px]">h-3.5 w-3.5</code></Rule>
        <Rule>Items destrutivos: <code className="text-[11px]">text-red-500 focus:text-red-500</code></Rule>
        <Rule>Click na TableCell de ações: <code className="text-[11px]">{`onClick={e => e.stopPropagation()}`}</code> pra não disparar o click da row</Rule>
        <AntiRule>NUNCA usar botões soltos (Eye, Edit, Trash separados) — sempre dropdown ⋮</AntiRule>
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
    <textarea className="w-full text-sm rounded-md border border-input px-3 py-2 min-h-[80px]" />
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
        <AntiRule>NUNCA <code className="text-[11px]">h-8 text-xs</code> — só em filtros de toolbar de tabela (outro contexto)</AntiRule>
        <AntiRule>NUNCA labels com <code className="text-[11px]">text-[10px]/text-[11px] font-medium text-muted-foreground</code></AntiRule>
      </Card>

      <SubTitle>Ações de form (rodapé)</SubTitle>
      <Demo
        code={`<div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
  <Button variant="outline">Cancelar</Button>
  <Button className="gap-1.5">
    <Save className="h-4 w-4" /> Salvar
  </Button>
</div>`}
      >
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline">Cancelar</Button>
          <Button className="gap-1.5">
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
        <ButtonShowcase label="default (primário)" code='variant="default"'><Button>Salvar</Button></ButtonShowcase>
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
        <Rule><strong>Header de página:</strong> ação primária à direita (gap-1.5 + ícone h-4 w-4) — usa cor sólida do módulo (ex: bg-sky-600)</Rule>
        <Rule><strong>Form footer:</strong> Cancelar à esquerda (variant=&quot;outline&quot;), Salvar à direita (default) — <code className="text-[11px]">justify-end gap-2</code></Rule>
        <Rule><strong>Modal footer:</strong> Cancelar (outline), depois Salvar/Confirmar — <code className="text-[11px]">justify-end gap-2</code></Rule>
        <Rule><strong>Linha de tabela:</strong> só dropdown ⋮ — NUNCA botões soltos</Rule>
        <Rule><strong>Filtros toolbar:</strong> botões soft ou ghost com <code className="text-[11px]">size=&quot;sm&quot;</code> ou <code className="text-[11px]">h-8 text-xs</code></Rule>
        <Rule><strong>Ação destrutiva:</strong> sempre confirma via Dialog ou SweetAlert antes — nunca executa direto</Rule>
        <AntiRule>NÃO usar 2+ botões primários (default) no mesmo bloco — só 1 ação é primária</AntiRule>
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
    <DialogHeaderIcon icon={Database} color="sky">
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
      <Button onClick={handleSave}>Salvar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`}
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Abrir modal de exemplo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeaderIconDemo icon={Database} color="sky">
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
              <Button onClick={() => setOpen(false)}>Salvar</Button>
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
        Use cores semânticas conforme o contexto da ação. Estado default é <code className="text-[11px]">sky</code>.
      </Note>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {(['sky','emerald','rose','amber','violet','indigo','cyan','orange','fuchsia','lime','slate','red','purple','blue'] as const).map(c => (
          <ColorDemo key={c} color={c} />
        ))}
      </div>

      <SubTitle>Quando usar cada cor</SubTitle>
      <Card className="p-4 space-y-2">
        <ContextRow color="emerald" icon={Plus}    when="Criar / Novo / Cadastrar" />
        <ContextRow color="sky"     icon={Edit}    when="Editar / Atualizar / Visualizar" />
        <ContextRow color="rose"    icon={Trash2}  when="Excluir / Remover / Destrutivo" />
        <ContextRow color="amber"   icon={AlertTriangle} when="Avisos / Confirmações / Atenção" />
        <ContextRow color="slate"   icon={Settings} when="Configurações / Settings" />
        <ContextRow color="violet"  icon={Sparkles} when="Recursos especiais / Premium" />
      </Card>

      <SubTitle>Confirmação destrutiva (alerts.confirm)</SubTitle>
      <Note>
        Para confirmar ações destrutivas curtas (excluir, cancelar, etc.) use <code className="text-[11px]">alerts.confirm()</code> em
        <code className="text-[11px]"> @/lib/alerts</code> — mais leve que abrir um Dialog completo.
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
        <Rule><strong>Cor:</strong> casa com a ação (verde=criar, rose=deletar, sky=editar/info, amber=aviso)</Rule>
        <Rule><code className="text-[11px]">{`<DialogContent>`}</code>: <code className="text-[11px]">max-w-lg</code> (default), <code className="text-[11px]">max-w-2xl</code>/<code className="text-[11px]">4xl</code> conforme conteúdo</Rule>
        <Rule><code className="text-[11px]">{`<DialogBody>`}</code>: campos com padrão de form (h-9 text-sm, space-y-1.5)</Rule>
        <Rule><code className="text-[11px]">{`<DialogFooter>`}</code>: Cancelar (outline) à esquerda, Salvar/Confirmar à direita</Rule>
        <Rule>Confirmações destrutivas curtas: <code className="text-[11px]">alerts.confirm()</code></Rule>
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
    sky:      'bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400',
    emerald:  'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
    rose:     'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
    amber:    'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
    violet:   'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
    indigo:   'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400',
    cyan:     'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400',
    orange:   'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400',
    fuchsia:  'bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-600 dark:text-fuchsia-400',
    lime:     'bg-lime-100 dark:bg-lime-950/40 text-lime-600 dark:text-lime-400',
    slate:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    red:      'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400',
    purple:   'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400',
    blue:     'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
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
    sky:      'bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400',
    emerald:  'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
    rose:     'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
    amber:    'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
    violet:   'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
    indigo:   'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400',
    cyan:     'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400',
    orange:   'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400',
    fuchsia:  'bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-600 dark:text-fuchsia-400',
    lime:     'bg-lime-100 dark:bg-lime-950/40 text-lime-600 dark:text-lime-400',
    slate:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    red:      'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400',
    purple:   'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400',
    blue:     'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
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

function ContextRow({ color, icon: Icon, when }: { color: string; icon: typeof Plus; when: string }) {
  const COLOR_CLS: Record<string, string> = {
    sky:      'bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400',
    emerald:  'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
    rose:     'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
    amber:    'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
    violet:   'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
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
        usam um wrapper bleed-edge com capa opcional + overlay gradiente da cor do módulo + TabsList em pills centralizadas.
      </Note>

      <Card className="p-0 overflow-hidden">
        <div className="relative -m-0 overflow-hidden h-[120px]" style={{ backgroundColor: 'rgba(94, 163, 203, .18)' }}>
          <div className="relative z-10 px-6 py-5 flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-sky-200 dark:bg-sky-900 flex items-center justify-center text-sky-700 dark:text-sky-300 font-bold text-lg">JD</div>
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
  style={!cover ? { backgroundColor: 'rgba(R, G, B, .18)' } : undefined}
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

  {/* Overlay gradiente: 0% à esquerda → 80% à direita (cor do módulo) */}
  {cover && (
    <div
      className="absolute inset-0"
      style={{ backgroundImage: 'linear-gradient(to right, rgba(R, G, B, 0) 0%, rgba(R, G, B, 0.8) 100%)' }}
    />
  )}

  {/* Controles editáveis: só master, hover, base direita */}
  {isMaster && (
    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 opacity-0 pointer-events-none
                    group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto transition-opacity">
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
      <TabsTrigger
        value="detalhes"
        className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold
                   !text-foreground/70 hover:!text-foreground transition-colors
                   data-[state=active]:!bg-transparent data-[state=active]:!shadow-none
                   data-[state=active]:!text-sky-600 dark:data-[state=active]:!text-sky-400 gap-1.5"
      >
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
        <Rule>Cor do módulo com alpha <code className="text-[11px]">.18</code>: fundo padrão (sem capa) e overlay (sobre capa)</Rule>
        <Rule>Imagem: <code className="text-[11px]">{`<div>`}</code> com <code className="text-[11px]">background-image</code> + <code className="text-[11px]">repeat</code> + <code className="text-[11px]">opacity: 0.2</code></Rule>
        <Rule>Controles de edição: só <code className="text-[11px]">isMaster</code>, posição <code className="text-[11px]">bottom-3 right-3 z-20</code>, hover-reveal</Rule>
        <Rule>SlidingTabsList controlado: <code className="text-[11px]">value</code>/<code className="text-[11px]">onValueChange</code> obrigatórios (defaultValue NÃO funciona)</Rule>
        <Rule>TabsTrigger ativo: SÓ muda cor do texto (<code className="text-[11px]">!text-MODULO-600</code>) — NÃO usa <code className="text-[11px]">!bg-white</code></Rule>
        <Rule>Cada tab tem ícone temático <code className="text-[11px]">h-3.5 w-3.5</code></Rule>
        <AntiRule>NÃO usar <code className="text-[11px]">{`<img object-cover>`}</code> (estica imagem) — sempre <code className="text-[11px]">{`<div>`}</code> com background</AntiRule>
        <AntiRule>NÃO posicionar controles em <code className="text-[11px]">top-3</code> (colide com botões do header)</AntiRule>
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
                      !active && 'text-foreground/70 hover:bg-muted/60 hover:text-foreground',
                    )}
                    style={active ? { backgroundColor: '#0ea5e9', color: 'white' } : undefined}
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
          !active && 'text-foreground/70 hover:bg-muted/60 hover:text-foreground')}
        style={active ? { backgroundColor: COR_DO_MODULO, color: 'white' } : undefined}
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
        <Rule>Pill ativa: <code className="text-[11px]">style={`{{ backgroundColor: COR_DO_MODULO, color: 'white' }}`}</code></Rule>
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
        header com ícone+gradient na cor do módulo e título/descrição.
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
      <Note>Card com título colorido — agrupador de conteúdo.</Note>
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
