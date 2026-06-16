'use client'

import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  ListChecks, Loader2, Clock, CheckCircle2, AlertTriangle, Play, Pause, Receipt,
  Calendar, Filter, ChevronRight, Plus, ChevronDown,
  MessageSquare, Paperclip, LayoutGrid, List, Archive, Settings2,
  UserCog, X, Search, HelpCircle,
} from 'lucide-react'
import {
  Card, Badge, Button, Input, Label,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import { useSession } from '@/lib/auth-client'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { PRIORIDADE_LABELS, PRIORIDADE_COLORS, type PrioridadeServico } from '@saas/types'
import { ClienteCombobox } from '../orcamentos/_components/cliente-combobox'
import { ExecucaoChecklistModal } from '../_components/execucao-checklist-modal'

const MODULE_COLOR = 'var(--mod-corporativo, #38bdf8)' // Administrativo (sky)

interface ExecucaoMinha {
  id: string
  status: string
  prioridade: PrioridadeServico
  prazoLimite: string | null
  iniciadoEm: string
  concluidoEm: string | null
  pausado: boolean
  pausadoMotivo: string | null
  responsavelId: string | null
  responsavelUsuario?: { id: string; name: string; image: string | null } | null
  servico: {
    id: string; nome: string; categoria: string | null; slaHoras: number | null
    // Campos extras quando o serviço é PERGUNTA (status = AGUARDANDO_RESPOSTA)
    tipo?: string
    perguntaTexto?: string | null
    perguntaOpcoes?: string[] | null
    perguntaMulti?: boolean
  }
  cliente?: { id: string; razaoSocial: string } | null
  orcamento?: { id: string; numero: number } | null
  arquivado: boolean
  passos: Array<{
    id: string
    ordem: number
    passoNome: string
    etapaNome: string
    obrigatorio: boolean
    concluido: boolean
    ignorado: boolean
    _count?: { comentarios: number; anexos: number }
  }>
}

/** Retorna o "passo atual" da execução: primeiro pendente (não concluído, não ignorado),
 *  na ordem. Retorna null se a execução está toda fechada. */
function passoAtual(passos: ExecucaoMinha['passos']): ExecucaoMinha['passos'][number] | null {
  return passos.find(p => !p.concluido && !p.ignorado) ?? null
}

type FilterKind = 'todos' | 'em_andamento' | 'atrasados' | 'concluidos'

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Avatar+nome compacto do responsável — usado em ambas as views (lista e kanban).
// Tamanho controlado via prop `size`; sem responsável retorna "Sem responsável".
function ResponsavelChip({ user, size = 'sm' }: {
  user: { id: string; name: string; image: string | null } | null | undefined
  size?: 'xs' | 'sm'
}) {
  const dim = size === 'xs' ? 'h-4 w-4 text-[7px]' : 'h-5 w-5 text-[8px]'
  const txt = size === 'xs' ? 'text-[10px]' : 'text-[11px]'
  if (!user) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-muted-foreground italic', txt)} title="Sem responsável atribuído">
        <span className={cn('rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground border border-background', dim)}>?</span>
        Sem responsável
      </span>
    )
  }
  const initials = user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className={cn('inline-flex items-center gap-1', txt)} title={`Responsável: ${user.name}`}>
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolveAssetUrl(user.image)} alt={user.name} className={cn('rounded-full object-cover border border-background shrink-0', dim)} />
      ) : (
        <span className={cn('rounded-full bg-[#5ea3cb] text-white flex items-center justify-center font-bold border border-background shrink-0', dim)}>
          {initials}
        </span>
      )}
      <span className="font-medium text-foreground/80 truncate max-w-[140px]">{user.name}</span>
    </span>
  )
}

// Tipo de candidato — espelha o retorno do endpoint listResponsaveisAtribuiveis.
interface ResponsavelCandidato {
  id: string
  name: string
  image: string | null
  areaName: string | null
}

// Editor de responsável — wrapper do ResponsavelChip que abre um popover
// com busca + lista de candidatos quando clicado. Stop-propagation no click
// impede que o card abra o checklist por trás. O popover é renderizado via
// React Portal com position:fixed pra escapar dos containers com overflow
// (colunas do kanban, Card de lista) que cortariam o conteúdo.
const POPOVER_W = 280
const POPOVER_MAX_H = 360

function ResponsavelEditor({
  exec, candidates, size = 'sm', onChanged,
}: {
  exec: ExecucaoMinha
  candidates: ResponsavelCandidato[]
  size?: 'xs' | 'sm'
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Calcula posição do popover relativa à viewport (fixed). Reposiciona
  // se não couber abaixo (vira pra cima) ou pra direita (alinha pela direita).
  const recalc = useCallback(() => {
    const btn = triggerRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = r.left
    if (left + POPOVER_W + margin > vw) left = Math.max(margin, vw - POPOVER_W - margin)
    let top = r.bottom + 4
    if (top + POPOVER_MAX_H + margin > vh) {
      const above = r.top - 4 - POPOVER_MAX_H
      top = above >= margin ? above : Math.max(margin, vh - POPOVER_MAX_H - margin)
    }
    setPos({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    recalc()
    function onScrollOrResize() { recalc() }
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, recalc])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false); setQuery('')
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? candidates.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.areaName?.toLowerCase().includes(q) ?? false))
    : candidates

  async function aplicar(novoId: string | null) {
    setSalvando(novoId ?? '__null__')
    try {
      await (trpc.servico as any).setResponsavelExecucao.mutate({ id: exec.id, responsavelId: novoId })
      setOpen(false)
      setQuery('')
      onChanged()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  const popover = open && pos && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popRef}
      className="fixed z-[60] rounded-md border bg-popover shadow-lg overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: POPOVER_W, maxHeight: POPOVER_MAX_H }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-1.5 border-b bg-popover flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar pessoa ou área..."
          className="h-7 text-xs border-0 px-1 focus-visible:ring-0"
        />
      </div>
      <div className="overflow-y-auto py-1" style={{ maxHeight: POPOVER_MAX_H - 44 }}>
        {/* Opção: remover responsável */}
        {exec.responsavelUsuario && (
          <button
            type="button"
            disabled={salvando !== null}
            onClick={() => aplicar(null)}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 text-muted-foreground italic disabled:opacity-50"
          >
            {salvando === '__null__'
              ? <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              : <X className="h-3 w-3 shrink-0" />}
            Remover responsável
          </button>
        )}
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhuma pessoa encontrada</p>
        ) : filtered.map(c => {
          const inicialOpcao = c.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
          const ehAtual = c.id === (exec.responsavelUsuario?.id ?? null)
          return (
            <button
              key={c.id}
              type="button"
              disabled={salvando !== null || ehAtual}
              onClick={() => aplicar(c.id)}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 disabled:opacity-50',
                ehAtual && 'bg-accent/50',
              )}
            >
              {salvando === c.id ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveAssetUrl(c.image)} alt={c.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
              ) : (
                <span className="h-5 w-5 rounded-full bg-[#5ea3cb] text-white text-[8px] flex items-center justify-center font-bold shrink-0">
                  {inicialOpcao}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium text-foreground">{c.name}</span>
                {c.areaName && (
                  <span className="block truncate text-[10px] text-muted-foreground">{c.areaName}</span>
                )}
              </span>
              {ehAtual && (
                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
              )}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <span className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 hover:bg-muted/60 rounded px-1 py-0.5 -mx-1 -my-0.5 transition-colors group/resp"
        title="Alterar responsável"
      >
        <ResponsavelChip user={exec.responsavelUsuario} size={size} />
        <UserCog className="h-3 w-3 text-muted-foreground/60 group-hover/resp:text-foreground shrink-0" />
      </button>
      {popover}
    </span>
  )
}

// Combobox filtravel para selecionar template de Servico — busca por nome ou categoria.
function ServicoCombobox({ servicos, value, onSelect, placeholder }: {
  servicos: Array<{ id: string; nome: string; categoria: string | null }>
  value: string
  onSelect: (id: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = servicos.find(s => s.id === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? servicos.filter(s =>
        s.nome.toLowerCase().includes(q) ||
        (s.categoria?.toLowerCase().includes(q) ?? false))
    : servicos

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {selected ? (
          <span className="flex flex-col items-start min-w-0 flex-1 truncate">
            <span className="truncate text-sm font-medium leading-tight">{selected.nome}</span>
            {selected.categoria && (
              <span className="text-[10px] text-muted-foreground leading-tight">{selected.categoria}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder ?? 'Selecione'}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar serviço ou categoria..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum serviço encontrado</p>
            ) : filtered.map(s => (
              <button
                key={s.id}
                type="button"
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col gap-0',
                  value === s.id && 'bg-accent text-accent-foreground',
                )}
                onClick={() => { onSelect(s.id); setOpen(false); setQuery('') }}
              >
                <span className="text-sm font-medium leading-tight truncate">{s.nome}</span>
                {s.categoria && (
                  <span className="text-[10px] text-muted-foreground leading-tight">{s.categoria}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Formata tempo decorrido desde uma data ate agora — formato compacto: "2d 4h", "5h", "12min". */
function tempoVida(iniciadoEm: string, ate?: string | null): string {
  const start = new Date(iniciadoEm).getTime()
  const end = ate ? new Date(ate).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  const min = Math.floor(diffMs / (60 * 1000))
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  const restoH = h % 24
  return restoH > 0 ? `${d}d ${restoH}h` : `${d}d`
}

function tempoRestante(prazoLimite: string | null): { texto: string; cor: 'red' | 'amber' | 'emerald' | 'slate'; pct: number } {
  if (!prazoLimite) return { texto: 'Sem prazo', cor: 'slate', pct: 0 }
  const agora = Date.now()
  const prazo = new Date(prazoLimite).getTime()
  const diffMs = prazo - agora
  if (diffMs < 0) {
    const horasAtraso = Math.floor(-diffMs / (60 * 60 * 1000))
    return {
      texto: horasAtraso < 24 ? `Atrasado ${horasAtraso}h` : `Atrasado ${Math.floor(horasAtraso / 24)}d`,
      cor: 'red',
      pct: 100,
    }
  }
  const horas = Math.floor(diffMs / (60 * 60 * 1000))
  const dias = Math.floor(horas / 24)
  // % do prazo já consumido — quanto mais perto do limite, mais "vermelho"
  // (assume começo do prazo = iniciadoEm; aproximamos como agora - SLA total)
  const cor = horas < 4 ? 'amber' : 'emerald'
  if (dias > 0) return { texto: `${dias}d ${horas % 24}h restantes`, cor, pct: 0 }
  return { texto: `${horas}h restantes`, cor, pct: 0 }
}

export default function MeusServicosPage() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''
  // Profile do user logado — usado para gating de UI (botão Configurações).
  // Configurações do módulo são restritas a master/empresa-master.
  const { profile } = useCurrentUserProfile()
  const canManageConfig = !!(profile?.isMaster || (profile as any)?.isEmpresaMaster)
  const [execucoes, setExecucoes] = useState<ExecucaoMinha[]>([])
  // Estado das respostas em andamento por execução (PERGUNTA)
  const [respostaOpcoes, setRespostaOpcoes] = useState<Record<string, string[]>>({})
  const [respostaObs, setRespostaObs] = useState<Record<string, string>>({})
  const [respondendoId, setRespondendoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Padrão "todos": exibe todas as colunas do kanban (em andamento, atrasados,
  // pausados, concluídos, cancelados). A janela de "concluídos visíveis" é
  // controlada pela config `meus_servicos.concluidos_dias_exibicao` no backend.
  const [filter, setFilter] = useState<FilterKind>('todos')
  const [busca, setBusca] = useState('')
  // Modo de exibição — lista (vertical, denso) vs kanban (colunas por status).
  // Persiste no localStorage para respeitar a preferência do usuário entre sessões.
  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'lista'
    return (window.localStorage.getItem('meus-servicos:viewMode') as 'lista' | 'kanban') || 'lista'
  })
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('meus-servicos:viewMode', viewMode)
  }, [viewMode])

  // Botão "Novo Serviço" depende da permissão admin de gerenciamento (writeProcedure
  // do módulo "servicos"). Faz um probe silencioso na primeira carga: se a chamada
  // listServicos retorna sem erro, o user pode criar; senão, esconde o botão.
  const [canCreate, setCanCreate] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(trpc.servico as any).listServicos.query()
      .then(() => { if (!cancelled) setCanCreate(true) })
      .catch(() => { if (!cancelled) setCanCreate(false) })
    return () => { cancelled = true }
  }, [])

  // Lista de candidatos pra atribuição de responsável — backend já aplica
  // o escopo correto (privilegiados veem todos da empresa; líder de área
  // só vê membros das áreas que lidera). Se canAssign=false, esconde a UI.
  const [canAssign, setCanAssign] = useState(false)
  const [candidatos, setCandidatos] = useState<ResponsavelCandidato[]>([])
  useEffect(() => {
    let cancelled = false
    ;(trpc.servico as any).listResponsaveisAtribuiveis.query()
      .then((r: { canAssign: boolean; candidates: ResponsavelCandidato[] }) => {
        if (cancelled) return
        setCanAssign(r.canAssign)
        setCandidatos(r.candidates || [])
      })
      .catch(() => { if (!cancelled) { setCanAssign(false); setCandidatos([]) } })
    return () => { cancelled = true }
  }, [])

  // Modal de configurações do módulo (master/admin)
  const [configOpen, setConfigOpen] = useState(false)
  const [configDias, setConfigDias] = useState<number>(7)
  const [configSalvando, setConfigSalvando] = useState(false)
  // Carrega config ao abrir
  useEffect(() => {
    if (!configOpen) return
    ;(trpc.servico as any).getMeusServicosConfig.query()
      .then((cfg: { concluidosDiasExibicao: number }) => setConfigDias(cfg.concluidosDiasExibicao))
      .catch(() => { /* mantém padrão */ })
  }, [configOpen])

  async function handleSalvarConfig() {
    setConfigSalvando(true)
    try {
      await (trpc.servico as any).updateMeusServicosConfig.mutate({ concluidosDiasExibicao: configDias })
      await alerts.success('Atualizado', 'Configurações salvas.')
      setConfigOpen(false)
      // Recarrega lista pra refletir nova janela
      await fetchData({ silent: true })
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setConfigSalvando(false)
    }
  }

  // Modal de checklist da execução clicada
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checklistExecId, setChecklistExecId] = useState<string | null>(null)

  async function responderPergunta(execId: string) {
    const opcoes = respostaOpcoes[execId] ?? []
    if (opcoes.length === 0) {
      alerts.error('Validação', 'Selecione ao menos uma opção.')
      return
    }
    setRespondendoId(execId)
    try {
      await (trpc.servico as any).responderPergunta.mutate({
        execucaoId: execId,
        opcoes,
        observacao: respostaObs[execId]?.trim() || undefined,
      })
      alerts.success('Resposta registrada', `Opção(ões): ${opcoes.join(', ')}`)
      setRespostaOpcoes(prev => { const c = { ...prev }; delete c[execId]; return c })
      setRespostaObs(prev => { const c = { ...prev }; delete c[execId]; return c })
      fetchData({ silent: true })
    } catch (e) {
      alerts.error('Erro ao responder', (e as Error).message)
    } finally {
      setRespondendoId(null)
    }
  }

  function abrirChecklist(execId: string) {
    setChecklistExecId(execId)
    setChecklistOpen(true)
  }

  // Auto-abertura do checklist quando vier ?exec=ID — usado pelos links das
  // notificações (atribuição, atraso). Limpa o parâmetro após abrir pra que
  // o usuário possa fechar e voltar à listagem sem reabrir no F5.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const execParam = searchParams?.get('exec')
    if (execParam) {
      abrirChecklist(execParam)
      const url = pathname || '/meus-servicos'
      router.replace(url, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Modal "Novo Serviço"
  const [novoOpen, setNovoOpen] = useState(false)
  const [novoServicoId, setNovoServicoId] = useState('')
  const [novoClienteId, setNovoClienteId] = useState('')
  const [novoPrioridade, setNovoPrioridade] = useState<PrioridadeServico>('MEDIA')
  const [novoObservacoes, setNovoObservacoes] = useState('')
  const [novoSalvando, setNovoSalvando] = useState(false)
  const [servicosTpl, setServicosTpl] = useState<Array<{ id: string; nome: string; categoria: string | null; prioridadePadrao: PrioridadeServico }>>([])
  const [clientesOpts, setClientesOpts] = useState<Array<{ id: string; razaoSocial: string; documento?: string | null }>>([])

  async function abrirNovoServico() {
    setNovoServicoId('')
    setNovoClienteId('')
    setNovoPrioridade('MEDIA')
    setNovoObservacoes('')
    setNovoOpen(true)
    try {
      const [servicos, clientes] = await Promise.all([
        (trpc.servico as any).listServicos.query().catch(() => []),
        (trpc.cliente as any).listForSelect.query().catch(() => []),
      ])
      setServicosTpl((servicos || []).filter((s: any) => s.ativo !== false))
      setClientesOpts(clientes || [])
    } catch (e) {
      alerts.error('Erro', 'Falha ao carregar dados: ' + (e as Error).message)
    }
  }

  function onChangeServicoTpl(id: string) {
    setNovoServicoId(id)
    const s = servicosTpl.find(x => x.id === id)
    if (s?.prioridadePadrao) setNovoPrioridade(s.prioridadePadrao)
  }

  // Arquiva um card concluído/cancelado (sai da listagem por padrão).
  async function handleArquivar(execId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    const ok = await alerts.confirm({
      title: 'Arquivar serviço',
      text: 'Deseja arquivar este serviço? Ele sairá da lista — pode ser visto novamente em "Todos" com a opção de incluir arquivados.',
      icon: 'question',
      confirmText: 'Arquivar',
    })
    if (!ok) return
    try {
      await (trpc.servico as any).arquivarExecucao.mutate({ id: execId })
      await fetchData({ silent: true })
      // KPIs também
      try {
        const data = await (trpc.servico as any).listMeusServicos.query()
        setStatsAll(data || [])
      } catch { /* ignora */ }
    } catch (err) {
      alerts.error('Erro', (err as Error).message)
    }
  }

  async function handleCriarExecucao() {
    if (!novoServicoId) { alerts.error('Erro', 'Selecione um serviço'); return }
    if (!novoClienteId) { alerts.error('Erro', 'Selecione um cliente'); return }
    setNovoSalvando(true)
    try {
      await (trpc.servico as any).createExecucao.mutate({
        servicoId: novoServicoId,
        clienteId: novoClienteId,
        responsavelId: currentUserId || null,
        prioridade: novoPrioridade,
        observacoes: novoObservacoes || null,
      })
      setNovoOpen(false)
      await fetchData()
      // recarrega KPIs
      try {
        const data = await (trpc.servico as any).listMeusServicos.query()
        setStatsAll(data || [])
      } catch { /* ignora */ }
      await alerts.success('Criado', 'Serviço iniciado e atribuído a você.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setNovoSalvando(false) }
  }

  // fetchData(opts?.silent=true) atualiza sem mexer no spinner — usado quando
  // o modal de checklist faz mutações e dispara onChange. Evita o "pisca" da
  // tabela atrás do modal. O reload visível (com loading) só roda na primeira
  // carga ou ao mudar de filtro.
  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const input = filter === 'atrasados'
        ? { atrasados: true }
        : filter === 'em_andamento'
        ? { status: 'EM_ANDAMENTO' }
        : filter === 'concluidos'
        ? { status: 'CONCLUIDO' }
        : undefined
      const data = await (trpc.servico as any).listMeusServicos.query(input)
      setExecucoes(data || [])
    } catch (e) {
      console.warn('[MeusServicos] erro ao listar:', (e as Error).message)
      if (!opts?.silent) setExecucoes([])
    } finally { if (!opts?.silent) setLoading(false) }
  }, [filter])

  useEffect(() => { fetchData() }, [fetchData])

  // KPIs (sempre visíveis, calculados a partir de uma busca completa)
  const [statsAll, setStatsAll] = useState<ExecucaoMinha[]>([])
  useEffect(() => {
    (async () => {
      try {
        const data = await (trpc.servico as any).listMeusServicos.query()
        setStatsAll(data || [])
      } catch { /* sem perm */ }
    })()
  }, [])
  const kpis = useMemo(() => {
    const agora = Date.now()
    const emAndamento = statsAll.filter(e => e.status === 'EM_ANDAMENTO').length
    const atrasados = statsAll.filter(e => e.status === 'EM_ANDAMENTO' && e.prazoLimite && new Date(e.prazoLimite).getTime() < agora).length
    const concluidos = statsAll.filter(e => e.status === 'CONCLUIDO').length
    const concluidosHoje = statsAll.filter(e => {
      if (e.status !== 'CONCLUIDO' || !e.concluidoEm) return false
      const d = new Date(e.concluidoEm)
      const hoje = new Date()
      return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth() && d.getDate() === hoje.getDate()
    }).length
    return { emAndamento, atrasados, concluidos, concluidosHoje }
  }, [statsAll])

  // Busca textual — filtra por serviço, cliente, nº do orçamento e responsável
  // (sem acento, case-insensitive). Alimenta tanto o kanban quanto a lista.
  const execFiltradas = useMemo(() => {
    const q = busca.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (!q) return execucoes
    return execucoes.filter(e => {
      const alvo = `${e.servico?.nome ?? ''} ${e.cliente?.razaoSocial ?? ''} ${e.orcamento ? '#' + e.orcamento.numero : ''} ${e.responsavelUsuario?.name ?? ''}`
        .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      return alvo.includes(q)
    })
  }, [execucoes, busca])

  // Agrupamento em colunas para o modo Kanban — uma execução pertence a UMA coluna.
  // Ordem de precedência: cancelado > concluído > pausado > atrasado > em andamento.
  type KanbanCol = { key: string; titulo: string; cor: string; items: ExecucaoMinha[] }
  const colunasKanban: KanbanCol[] = useMemo(() => {
    const agora = Date.now()
    const cols: Record<string, KanbanCol> = {
      em_andamento: { key: 'em_andamento', titulo: 'Em Andamento', cor: '#38bdf8', items: [] },
      atrasados: { key: 'atrasados', titulo: 'Atrasados', cor: '#ef4444', items: [] },
      pausados: { key: 'pausados', titulo: 'Pausados', cor: '#f59e0b', items: [] },
      concluidos: { key: 'concluidos', titulo: 'Concluídos', cor: '#10b981', items: [] },
      cancelados: { key: 'cancelados', titulo: 'Cancelados', cor: '#94a3b8', items: [] },
    }
    for (const e of execFiltradas) {
      if (e.status === 'CANCELADO') cols.cancelados!.items.push(e)
      else if (e.status === 'CONCLUIDO') cols.concluidos!.items.push(e)
      else if (e.pausado) cols.pausados!.items.push(e)
      else if (e.prazoLimite && new Date(e.prazoLimite).getTime() < agora) cols.atrasados!.items.push(e)
      else cols.em_andamento!.items.push(e)
    }
    return [cols.em_andamento!, cols.atrasados!, cols.pausados!, cols.concluidos!, cols.cancelados!]
  }, [execFiltradas])

  // Lista de filtros (chips) — mantém função de filtragem mas no padrão visual CRM/Orçamentos:
  // barra horizontal de chips em vez de KPIs em cards grandes.
  const filtros: Array<{ key: FilterKind; label: string; icon: typeof Play; cor: string; count: number }> = [
    { key: 'em_andamento', label: 'Em Andamento', icon: Play, cor: '#38bdf8', count: kpis.emAndamento },
    { key: 'atrasados', label: 'Atrasados', icon: AlertTriangle, cor: '#ef4444', count: kpis.atrasados },
    { key: 'concluidos', label: 'Concluídos', icon: CheckCircle2, cor: '#10b981', count: kpis.concluidos },
    { key: 'todos', label: 'Todos', icon: ListChecks, cor: '#94a3b8', count: statsAll.length },
  ]

  return (
    <div className="flex flex-col gap-5 h-[calc(100vh-90px)]" suppressHydrationWarning>
      {/* ── Header (padrão CRM/Orçamentos) ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <ListChecks className="h-6 w-6" />
          </div>
          <div>
            <h1>Gerenciador de Serviços</h1>
            <p className="text-sm text-muted-foreground">Execuções de serviço atribuídas a você</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Busca — padrão CRM/Orçamentos/Helpdesk (cliente, serviço, nº orçamento, responsável) */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente, serviço, #orçamento..."
              className="h-8 w-[260px] pl-7 text-xs"
            />
          </div>
          {/* Toggle Kanban/Lista — padrão CRM */}
          <div className="flex items-center border rounded-[2px] overflow-hidden">
            <button
              type="button"
              className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
              onClick={() => setViewMode('kanban')}
              title="Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn('p-1.5 transition-colors', viewMode === 'lista' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
              onClick={() => setViewMode('lista')}
              title="Lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          {/* Configurações do módulo — restrita a master/empresa-master */}
          {canManageConfig && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigOpen(true)}
              className="gap-1.5"
              title="Configurações do módulo Meus Serviços"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
          {/* Iniciar nova execução — quem tem permissão de leitura/escrita do módulo
              "servicos". Master também tem por padrão. */}
          {canCreate && (
            <Button
              size="sm"
              onClick={abrirNovoServico}
              style={{ backgroundColor: MODULE_COLOR }}
              className="text-white gap-1.5"
            >
              <Plus className="h-4 w-4" /> Novo Serviço
            </Button>
          )}
        </div>
      </div>

      {/* ── Barra de filtros (chips horizontais) ── */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {filtros.map(f => {
          const Icon = f.icon
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                active
                  ? 'border-foreground/20 bg-foreground/[0.04] text-foreground'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              style={active ? { borderColor: f.cor, backgroundColor: `${f.cor}10`, color: f.cor } : undefined}
            >
              <Icon className="h-3.5 w-3.5" style={!active ? { color: f.cor } : undefined} />
              <span>{f.label}</span>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 ml-0.5 tabular-nums"
                style={active ? { backgroundColor: `${f.cor}20`, color: f.cor } : undefined}
              >
                {f.count}
              </Badge>
            </button>
          )
        })}
        <span className="ml-auto text-xs text-muted-foreground">
          {execFiltradas.length} {execFiltradas.length === 1 ? 'resultado' : 'resultados'}
        </span>
      </div>

      {/* ── Body: Kanban (flex-1 para tomar altura) ou Lista (em Card) ── */}
      {loading ? (
        <Card className="flex-1 flex items-center justify-center py-16">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando seus serviços...
          </div>
        </Card>
      ) : execFiltradas.length === 0 ? (
        <Card className="flex-1 flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ListChecks className="h-10 w-10 opacity-30 mb-2" />
          <p className="text-sm">{busca.trim() ? 'Nenhum serviço encontrado para a busca' : 'Nenhum serviço encontrado neste filtro'}</p>
        </Card>
      ) : viewMode === 'kanban' ? (
        // Kanban no padrão CRM/Orçamentos — overflow-x-auto + flex-1 ocupa altura disponível
        <div className="overflow-x-auto overflow-y-hidden pb-4 -mx-1 flex-1">
          <div className="flex gap-3 px-1 h-full" style={{ minWidth: `${colunasKanban.length * 240}px` }}>
            {colunasKanban.map(col => (
              <div
                key={col.key}
                className="flex-1 min-w-[240px] flex flex-col overflow-hidden rounded-lg transition-colors bg-black/[0.04] dark:bg-white/[0.04]"
              >
                {/* Header — padrão /helpdesk: sem bg/border, dot + título + pill colorida */}
                <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: col.cor }} />
                    <span className="text-sm font-semibold truncate">{col.titulo}</span>
                    <span
                      className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold text-white shrink-0"
                      style={{ backgroundColor: col.cor }}
                    >
                      {col.items.length}
                    </span>
                  </div>
                </div>

                {/* Body da coluna */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto nice-scrollbar min-h-[120px]">
                  {col.items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6 italic">Vazio</p>
                  )}
                  {col.items.map(exec => {
                    const totalPassos = exec.passos.length
                    const cPassos = exec.passos.filter(p => p.concluido).length
                    const progressPct = totalPassos > 0 ? Math.round((cPassos / totalPassos) * 100) : 0
                    const corPrioridade = PRIORIDADE_COLORS[exec.prioridade]
                    const corBarra = exec.status === 'CANCELADO'
                      ? '#ef4444'
                      : exec.pausado
                        ? '#f59e0b'
                        : corPrioridade
                    const totalComentarios = exec.passos.reduce((acc, p) => acc + (p._count?.comentarios ?? 0), 0)
                    const totalAnexos = exec.passos.reduce((acc, p) => acc + (p._count?.anexos ?? 0), 0)
                    const atualKb = passoAtual(exec.passos)
                    return (
                      <div
                        key={exec.id}
                        onClick={() => abrirChecklist(exec.id)}
                        className="rounded-sm bg-white dark:bg-card cursor-pointer group overflow-hidden border border-border/50 hover:shadow-md transition-shadow"
                        title={exec.pausado && exec.pausadoMotivo ? `Pausado — ${exec.pausadoMotivo}` : undefined}
                      >
                        <div className="flex">
                          {/* Barra lateral 3px — sinaliza prioridade/status */}
                          <div className="w-[3px] shrink-0" style={{ backgroundColor: corBarra }} />
                          <div className="flex-1 min-w-0 flex flex-col">
                            {/* Header: nome do serviço */}
                            <div className="px-3 pt-2.5 pb-1">
                              <h4 className="text-[13px] font-semibold leading-tight line-clamp-2">
                                {exec.servico.nome}
                              </h4>
                            </div>

                            {/* Body */}
                            <div className="px-3 pb-2 space-y-1.5">
                              {(exec.cliente || exec.orcamento) && (
                                <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                                  {exec.cliente && <span className="truncate">{exec.cliente.razaoSocial}</span>}
                                  {exec.orcamento && (
                                    <a href={`/orcamentos/${exec.orcamento.id}`} onClick={e => e.stopPropagation()} title="Abrir orçamento vinculado" className="shrink-0 inline-flex items-center gap-0.5 text-primary hover:underline font-medium">
                                      <Receipt className="h-3 w-3" />#{exec.orcamento.numero}
                                    </a>
                                  )}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {exec.servico.categoria && (
                                  <span className="inline-flex items-center rounded-sm px-1.5 py-0 text-[9px] font-medium bg-muted text-muted-foreground uppercase tracking-wider">
                                    {exec.servico.categoria}
                                  </span>
                                )}
                                <span
                                  className="inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium text-white"
                                  style={{ backgroundColor: corPrioridade }}
                                >
                                  {PRIORIDADE_LABELS[exec.prioridade]}
                                </span>
                              </div>
                              {/* Passo atual — só pra execucoes ativas */}
                              {atualKb && exec.status === 'EM_ANDAMENTO' && (
                                <div
                                  className="rounded-sm border border-dashed px-1.5 py-1 text-[10px] flex flex-col gap-0.5"
                                  style={{ borderColor: `color-mix(in srgb, ${MODULE_COLOR} 33%, transparent)`, backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 4%, transparent)` }}
                                  title={`Etapa: ${atualKb.etapaNome} · Passo: ${atualKb.passoNome}`}
                                >
                                  <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider" style={{ color: MODULE_COLOR }}>
                                    <ListChecks className="h-2.5 w-2.5" /> {atualKb.etapaNome}
                                  </span>
                                  <span className="text-foreground/85 leading-tight line-clamp-2">
                                    {atualKb.passoNome}
                                  </span>
                                </div>
                              )}
                              {/* Tempos: Vida à esquerda, Previsão/Concluído à direita */}
                              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1 min-w-0">
                                  <Clock className="h-3 w-3 opacity-60 shrink-0" />
                                  Vida: <span className="font-medium text-foreground/80 truncate">{tempoVida(exec.iniciadoEm, exec.concluidoEm)}</span>
                                </span>
                                {exec.status === 'EM_ANDAMENTO' && exec.prazoLimite && (
                                  <span className="inline-flex items-center gap-1 shrink-0" title={`Previsão de conclusão: ${formatDateTime(exec.prazoLimite)}`}>
                                    <Calendar className="h-3 w-3 opacity-60 shrink-0" />
                                    Previsão: <span className="font-medium text-foreground/80">{formatDate(exec.prazoLimite)}</span>
                                  </span>
                                )}
                                {exec.status === 'CONCLUIDO' && exec.concluidoEm && (
                                  <span className="inline-flex items-center gap-1 shrink-0">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                    Concluído: <span className="font-medium text-foreground/80">{formatDateTime(exec.concluidoEm)}</span>
                                  </span>
                                )}
                              </div>
                              {/* Progresso */}
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground">Progresso</span>
                                  <span className="font-semibold tabular-nums">{progressPct}% ({cPassos}/{totalPassos})</span>
                                </div>
                                <div className="h-1 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${progressPct}%`,
                                      backgroundColor: progressPct === 100
                                        ? '#10b981'
                                        : exec.pausado
                                          ? '#f59e0b'
                                          : MODULE_COLOR,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Footer — padrão CRM/Orçamentos: avatar do responsável à esquerda,
                                contadores à direita. Iniciadoem vai pro tooltip do avatar. */}
                            <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20 gap-2 min-w-0">
                              <div className="min-w-0 flex-1">
                                {canAssign ? (
                                  <ResponsavelEditor
                                    exec={exec}
                                    candidates={candidatos}
                                    size="xs"
                                    onChanged={() => fetchData({ silent: true })}
                                  />
                                ) : (
                                  <ResponsavelChip user={exec.responsavelUsuario} size="xs" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {totalComentarios > 0 && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={`${totalComentarios} comentário${totalComentarios > 1 ? 's' : ''}`}>
                                    <MessageSquare className="h-3 w-3" /> {totalComentarios}
                                  </span>
                                )}
                                {totalAnexos > 0 && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={`${totalAnexos} anexo${totalAnexos > 1 ? 's' : ''}`}>
                                    <Paperclip className="h-3 w-3" /> {totalAnexos}
                                  </span>
                                )}
                                {/* Arquivar — só em concluídas/canceladas (sai da lista) */}
                                {(exec.status === 'CONCLUIDO' || exec.status === 'CANCELADO') && !exec.arquivado && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleArquivar(exec.id, e)}
                                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                                    title="Arquivar — sai da lista"
                                  >
                                    <Archive className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Lista — Card limpo com scroll interno (filtros e header já estão acima)
        <Card className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {execFiltradas.map(exec => {
              // ── PERGUNTA — card destacado em laranja pra responder no lugar ──
              if (exec.status === 'AGUARDANDO_RESPOSTA' && exec.servico.tipo === 'PERGUNTA') {
                const sv = exec.servico
                const opcoesValidas = sv.perguntaOpcoes ?? []
                const multi = !!sv.perguntaMulti
                const escolhidas = respostaOpcoes[exec.id] ?? []
                const toggleOpcao = (op: string) => {
                  setRespostaOpcoes(prev => {
                    const atuais = prev[exec.id] ?? []
                    if (multi) {
                      return atuais.includes(op)
                        ? { ...prev, [exec.id]: atuais.filter(x => x !== op) }
                        : { ...prev, [exec.id]: [...atuais, op] }
                    }
                    return { ...prev, [exec.id]: [op] }
                  })
                }
                return (
                  <div key={exec.id} className="border-l-4 border-l-orange-400 bg-orange-50/30 dark:bg-orange-900/10 px-4 py-3 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
                        <HelpCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold">{sv.nome}</span>
                          <Badge variant="outline" className="text-[10px] h-5 bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400">
                            Aguardando resposta
                          </Badge>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {multi ? 'Múltipla escolha' : 'Escolha única'}
                          </Badge>
                        </div>
                        <p className="text-[13px] font-medium text-foreground/90">
                          {sv.perguntaTexto || sv.nome}
                        </p>
                        {exec.cliente && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {exec.cliente.razaoSocial}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 pl-11">
                      {opcoesValidas.map((op, idx) => {
                        const checked = escolhidas.includes(op)
                        return (
                          <label
                            key={idx}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm transition-colors',
                              checked
                                ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700'
                                : 'bg-card border-border hover:bg-muted/50',
                            )}
                          >
                            <input
                              type={multi ? 'checkbox' : 'radio'}
                              name={`pergunta-${exec.id}`}
                              checked={checked}
                              onChange={() => toggleOpcao(op)}
                              className="h-3.5 w-3.5"
                            />
                            <span>{op}</span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="pl-11">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        Observação (opcional)
                      </label>
                      <textarea
                        rows={2}
                        maxLength={2000}
                        value={respostaObs[exec.id] ?? ''}
                        onChange={e => setRespostaObs(prev => ({ ...prev, [exec.id]: e.target.value }))}
                        placeholder="Adicione contexto da decisão (opcional)"
                        className="w-full text-sm border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                    <div className="flex justify-end pl-11">
                      <Button
                        size="sm"
                        onClick={() => responderPergunta(exec.id)}
                        disabled={respondendoId === exec.id || escolhidas.length === 0}
                        className="gap-1.5"
                        style={{ backgroundColor: '#f59e0b', color: '#fff' }}
                      >
                        {respondendoId === exec.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Confirmar resposta
                      </Button>
                    </div>
                  </div>
                )
              }

              const totalPassos = exec.passos.length
              const concluidos = exec.passos.filter(p => p.concluido).length
              const progressPct = totalPassos > 0 ? Math.round((concluidos / totalPassos) * 100) : 0
              const tempo = tempoRestante(exec.prazoLimite)
              const corPrioridade = PRIORIDADE_COLORS[exec.prioridade]
              // Soma comentários e anexos de TODOS os passos da execução
              const totalComentarios = exec.passos.reduce((acc, p) => acc + (p._count?.comentarios ?? 0), 0)
              const totalAnexos = exec.passos.reduce((acc, p) => acc + (p._count?.anexos ?? 0), 0)
              const atual = passoAtual(exec.passos)
              return (
                <div
                  key={exec.id}
                  onClick={() => abrirChecklist(exec.id)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group',
                    exec.pausado
                      ? 'bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-50/70 dark:hover:bg-amber-900/20'
                      : exec.status === 'CANCELADO'
                        ? 'bg-rose-50/30 dark:bg-rose-900/10 hover:bg-rose-50/60 dark:hover:bg-rose-900/20'
                        : 'hover:bg-muted/30',
                  )}
                  title={exec.pausado ? `Pausado${exec.pausadoMotivo ? ` — ${exec.pausadoMotivo}` : ''}` : undefined}
                >
                  {/* Marcador da esquerda — status tem precedência sobre prioridade:
                      vermelho cancelado > amarelo pausado > cor da prioridade. */}
                  <div
                    className="w-1 h-12 rounded-full shrink-0"
                    style={{
                      backgroundColor: exec.status === 'CANCELADO'
                        ? '#ef4444' // red-500
                        : exec.pausado
                          ? '#f59e0b' // amber-500
                          : corPrioridade,
                    }}
                    title={
                      exec.status === 'CANCELADO'
                        ? 'Cancelado'
                        : exec.pausado
                          ? `Pausado${exec.pausadoMotivo ? ` — ${exec.pausadoMotivo}` : ''}`
                          : `Prioridade: ${PRIORIDADE_LABELS[exec.prioridade]}`
                    }
                  />

                  {/* Conteudo principal */}
                  <div className="flex-1 min-w-0 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 sm:col-span-5 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {exec.servico.categoria && (
                          <Badge variant="secondary" className="text-[9px] uppercase tracking-wider px-1.5 py-0 h-4">
                            {exec.servico.categoria}
                          </Badge>
                        )}
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: corPrioridade }}
                        >
                          {PRIORIDADE_LABELS[exec.prioridade]}
                        </span>
                      </div>
                      <p className="text-sm font-semibold truncate">{exec.servico.nome}</p>
                      {(exec.cliente || exec.orcamento) && (
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5 mb-0.5">
                          {exec.cliente && <span className="truncate">{exec.cliente.razaoSocial}</span>}
                          {exec.orcamento && (
                            <a href={`/orcamentos/${exec.orcamento.id}`} onClick={e => e.stopPropagation()} title="Abrir orçamento vinculado" className="shrink-0 inline-flex items-center gap-0.5 text-primary hover:underline font-medium">
                              <Receipt className="h-3 w-3" />#{exec.orcamento.numero}
                            </a>
                          )}
                        </p>
                      )}
                      {/* Passo atual — exibido apenas quando há próximo a executar */}
                      {atual && exec.status === 'EM_ANDAMENTO' && (
                        <div
                          className="flex items-center gap-1 text-[11px] text-foreground/80 mb-0.5 truncate"
                          title={`Etapa: ${atual.etapaNome} · Passo: ${atual.passoNome}`}
                        >
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold"
                            style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 10%, transparent)`, color: MODULE_COLOR }}
                          >
                            <ListChecks className="h-3 w-3" /> {atual.etapaNome}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="truncate">{atual.passoNome}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span title={`Iniciado em ${formatDateTime(exec.iniciadoEm)}`}>
                          <Play className="inline h-3 w-3 mr-0.5 -mt-0.5 opacity-60" />
                          {formatDateTime(exec.iniciadoEm)}
                        </span>
                        {/* Tempo de vida — congela em concluidoEm para itens fechados */}
                        <span className="text-muted-foreground/40">•</span>
                        <span title="Tempo decorrido desde o início">
                          <Clock className="inline h-3 w-3 mr-0.5 -mt-0.5 opacity-60" />
                          Vida: <span className="font-medium text-foreground/80">{tempoVida(exec.iniciadoEm, exec.concluidoEm)}</span>
                        </span>
                        {/* Previsão (só pra execucoes ativas com prazo) */}
                        {exec.status === 'EM_ANDAMENTO' && exec.prazoLimite && (
                          <>
                            <span className="text-muted-foreground/40">•</span>
                            <span title={`Previsão de conclusão: ${formatDateTime(exec.prazoLimite)}`}>
                              <Calendar className="inline h-3 w-3 mr-0.5 -mt-0.5 opacity-60" />
                              Previsão: <span className="font-medium text-foreground/80">{formatDate(exec.prazoLimite)}</span>
                            </span>
                          </>
                        )}
                        {/* Para concluidos: mostra quando concluiu */}
                        {exec.status === 'CONCLUIDO' && exec.concluidoEm && (
                          <>
                            <span className="text-muted-foreground/40">•</span>
                            <span title="Data de conclusão">
                              <CheckCircle2 className="inline h-3 w-3 mr-0.5 -mt-0.5 text-emerald-600" />
                              Concluído em: <span className="font-medium text-foreground/80">{formatDateTime(exec.concluidoEm)}</span>
                            </span>
                          </>
                        )}
                        {totalComentarios > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 rounded px-1.5 py-0.5 font-medium"
                            title={`${totalComentarios} comentário${totalComentarios > 1 ? 's' : ''} no serviço`}
                          >
                            <MessageSquare className="h-3 w-3" /> {totalComentarios}
                          </span>
                        )}
                        {totalAnexos > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-1.5 py-0.5 font-medium"
                            title={`${totalAnexos} anexo${totalAnexos > 1 ? 's' : ''} no serviço`}
                          >
                            <Paperclip className="h-3 w-3" /> {totalAnexos}
                          </span>
                        )}
                        {/* Responsável da execução */}
                        <span className="text-muted-foreground/40">•</span>
                        {canAssign ? (
                          <ResponsavelEditor
                            exec={exec}
                            candidates={candidatos}
                            size="xs"
                            onChanged={() => fetchData({ silent: true })}
                          />
                        ) : (
                          <ResponsavelChip user={exec.responsavelUsuario} size="xs" />
                        )}
                      </div>
                    </div>

                    {/* Progresso */}
                    <div className="col-span-12 sm:col-span-4 min-w-0">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-semibold tabular-nums">{progressPct}% ({concluidos}/{totalPassos})</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progressPct}%`,
                            backgroundColor: progressPct === 100
                              ? '#10b981'
                              : exec.pausado
                                ? '#f59e0b' // amber-500: barra "congelada" indica pausa
                                : MODULE_COLOR,
                          }}
                        />
                      </div>
                    </div>

                    {/* Prazo */}
                    <div className="col-span-12 sm:col-span-3 min-w-0 flex items-center justify-end gap-2">
                      {exec.status === 'CONCLUIDO' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 h-5 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Concluído
                        </Badge>
                      ) : exec.pausado ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-800"
                          title={exec.pausadoMotivo ? `Motivo: ${exec.pausadoMotivo}` : 'Execução pausada — SLA não corre'}
                        >
                          <Pause className="h-3 w-3" /> Pausado
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded',
                            tempo.cor === 'red' && 'text-rose-700 bg-rose-50 dark:bg-rose-900/20',
                            tempo.cor === 'amber' && 'text-amber-700 bg-amber-50 dark:bg-amber-900/20',
                            tempo.cor === 'emerald' && 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20',
                            tempo.cor === 'slate' && 'text-slate-600 bg-muted',
                          )}
                        >
                          <Clock className="h-3 w-3" /> {tempo.texto}
                        </span>
                      )}
                      {(exec.status === 'CONCLUIDO' || exec.status === 'CANCELADO') && !exec.arquivado && (
                        <button
                          type="button"
                          onClick={(e) => handleArquivar(exec.id, e)}
                          className="text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 rounded p-1 transition-colors shrink-0"
                          title="Arquivar — sai da lista"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Modal: Checklist da execução clicada */}
      <ExecucaoChecklistModal
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
        execucaoId={checklistExecId}
        accentColor={MODULE_COLOR}
        onChange={() => fetchData({ silent: true })}
      />

      {/* Modal: Configurações do módulo */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeaderIcon icon={Settings2} color="slate">
            <DialogTitle>Configurações — Meus Serviços</DialogTitle>
            <DialogDescription>
              Ajustes globais do módulo. Aplicam-se a todos os usuários.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-dias" className="text-[13px] font-semibold">
                Dias de exibição de serviços concluídos
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cfg-dias"
                  type="number"
                  min={1}
                  max={365}
                  value={configDias}
                  onChange={(e) => setConfigDias(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                  className="h-9 w-28 text-sm"
                />
                <span className="text-sm text-muted-foreground">dia(s)</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Após esse período, serviços <span className="font-medium">Concluídos</span> e
                {' '}<span className="font-medium">Cancelados</span> deixam de aparecer automaticamente
                na listagem. O usuário pode arquivar manualmente a qualquer momento clicando no
                ícone <Archive className="inline h-3 w-3 -mt-0.5" /> do card.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)} disabled={configSalvando}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSalvarConfig}
              disabled={configSalvando}
              style={{ backgroundColor: MODULE_COLOR }}
              className="text-white gap-1.5"
            >
              {configSalvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Novo Serviço */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeaderIcon icon={ListChecks} color="sky">
            <DialogTitle>Iniciar novo serviço</DialogTitle>
            <DialogDescription>
              Selecione o template, o cliente e a prioridade. O serviço será atribuído a você.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Serviço *</Label>
              <ServicoCombobox
                servicos={servicosTpl}
                value={novoServicoId}
                onSelect={onChangeServicoTpl}
                placeholder="Selecione um template de serviço"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Cliente *</Label>
              <ClienteCombobox
                clientes={clientesOpts}
                value={novoClienteId}
                onSelect={setNovoClienteId}
                placeholder="Selecione o cliente"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Prioridade</Label>
              <Select value={novoPrioridade} onValueChange={v => setNovoPrioridade(v as PrioridadeServico)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as PrioridadeServico[]).map(p => (
                    <SelectItem key={p} value={p}>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PRIORIDADE_COLORS[p] }} />
                        {PRIORIDADE_LABELS[p]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Observações</Label>
              <Input
                value={novoObservacoes}
                onChange={e => setNovoObservacoes(e.target.value)}
                placeholder="Notas iniciais (opcional)"
                className="h-9 text-sm"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)} disabled={novoSalvando}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCriarExecucao}
              disabled={novoSalvando || !novoServicoId || !novoClienteId}
              style={{ backgroundColor: MODULE_COLOR }}
              className="text-white gap-1.5"
            >
              {novoSalvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Iniciar serviço
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
