'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import {
  FileText, Loader2, Plus, Trash2, Pencil, Check, X,
  Upload, DollarSign, Send, Printer, Copy as CopyIcon, ExternalLink,
  MoreVertical, Pause, Play, RotateCcw, AlertTriangle,
  Package, History, Type, ChevronDown, ThumbsUp, ThumbsDown, CheckCircle2,
  Paperclip, Image as ImageIcon, Archive, MessageSquare, Files, Shield, Lock,
  Sparkles, Star,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, CardHeader, CardContent, Label,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tabs, TabsTrigger, TabsContent, SlidingTabsList,
  RichEditor,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Sheet, SheetContent, SheetTitle,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { OrcamentosLegadoSection } from '@/components/orcamento/orcamentos-legado-section'
import { OrcamentoIaSection } from '@/components/orcamento/orcamento-ia-section'
import { masks } from '@/lib/masks'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { useTabLabel } from '@/hooks/use-tab-label'
import { ORCAMENTO_STATUS_ORDER, ORCAMENTO_STATUS_LABELS } from '@saas/types'
import { ClienteCombobox } from '../_components/cliente-combobox'
import { UserCombobox } from '../_components/user-combobox'

// ============================================================
// Constantes
// ============================================================

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

const STATUS_COLORS: Record<string, string> = {
  NOVO: '#818cf8', A_ENVIAR: '#94a3b8', ENVIADO: '#3b82f6', APROVADO: '#10b981',
  LIBERADO: '#059669', FINALIZADO: '#1e293b', ENCERRADO: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  NOVO: 'Novo', A_ENVIAR: 'A Enviar', ENVIADO: 'Enviado', APROVADO: 'Aprovado',
  LIBERADO: 'Liberado', FINALIZADO: 'Finalizado', ENCERRADO: 'Encerrado',
}

const TIPO_COLORS: Record<string, { bg: string; text: string }> = {
  SERVICO: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-400' },
  TAXA: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400' },
  DESPESA: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400' },
}

// ============================================================
// Tipos
// ============================================================

interface OrcamentoItem {
  id: string
  tipo: string
  descricao: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  catalogoId?: string | null
  catalogoTextoId?: string | null
  situacao?: string
  ordem?: number
}

interface CatalogoTexto {
  id: string
  titulo: string
  descricao: string | null
  valor: number | string | null
  ordem: number
}

interface OrcamentoArquivo {
  id: string
  fileName: string
  fileUrl: string
  fileSize?: number
  mimeType?: string
  createdAt: string
}

interface OrcamentoEvento {
  id: string
  tipo: string
  descricao: string
  de?: string | null
  para?: string | null
  createdAt: string
  usuario?: { id?: string; name: string; image?: string | null } | null
}

interface OrcamentoMensagem {
  id: string
  mensagem: string
  createdAt: string
  editadoEm?: string | null
  userId?: string | null
  parentId?: string | null
  acessoUsuarios?: string[]
  restritoFinanceiro?: boolean
  usuario?: { id?: string; name: string; email?: string | null; image?: string | null } | null
}

interface Orcamento {
  id: string
  numero: number
  token: string
  status: string
  tipo: string
  valorTotal: number
  descontoValor: number
  descontoPct: number
  validadeDias: number
  formaPagamento: string | null
  textoInterno: string | null
  textoCorpoCliente: string | null
  observacoes: string | null
  area: string | null
  solicitanteId: string | null
  responsavelId: string | null
  solicitante: { id: string; name: string; image?: string | null } | string | null
  responsavel: { id: string; name: string; image?: string | null } | string | null
  contatos: string | null
  emails: string | null
  emailsContatos?: string | null
  arquivado: boolean
  // Datas dedicadas por transicao
  dtEnviado?: string | null
  dtAprovado?: string | null
  dtLiberado?: string | null
  dtFinalizado?: string | null
  dtEncerrado?: string | null
  dtCancelado?: string | null
  // Paralizacao
  paralizado?: boolean
  paralizadoEm?: string | null
  paralizadoPor?: string | null
  paralizadoMotivo?: string | null
  // Resposta do cliente pelo link público (registrarDecisao)
  decisaoTipo?: string | null
  decisaoEm?: string | null
  decisaoNome?: string | null
  decisaoCpf?: string | null
  decisaoObs?: string | null
  // Auditoria
  reaberturasCount?: number
  createdAt: string
  updatedAt: string
  cliente: { id: string; razaoSocial: string; documento?: string; email?: string | null } | null
  itens: OrcamentoItem[]
  mensagens: OrcamentoMensagem[]
  arquivos: OrcamentoArquivo[]
  eventos: OrcamentoEvento[]
}

// ============================================================
// Helpers
// ============================================================

function formatCurrency(v: number | null | undefined): string {
  if (v == null) return 'R$ 0,00'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Metadados (rótulo + cor) por tipo de evento da timeline do orçamento.
// Cores em hex puro (concatenamos +'22' pro fundo suave do chip).
const EVENT_META: Record<string, { label: string; color: string }> = {
  created:       { label: 'Criação',     color: '#10b981' },
  status_change: { label: 'Status',      color: '#fb7185' },
  envio:         { label: 'Envio',       color: '#3b82f6' },
  notificacao:   { label: 'Notificação', color: '#06b6d4' },
  reabertura:    { label: 'Reabertura',  color: '#f59e0b' },
  paralizacao:   { label: 'Paralisação', color: '#ef4444' },
  retomada:      { label: 'Retomada',    color: '#10b981' },
  edicao:        { label: 'Edição',      color: '#64748b' },
  edicao_data:   { label: 'Data',        color: '#64748b' },
}
function eventMeta(tipo: string): { label: string; color: string } {
  return EVENT_META[tipo] ?? { label: 'Evento', color: '#fb7185' }
}
function iniciaisNome(nome: string): string {
  return (nome || '?').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#94a3b8'
  const label = STATUS_LABELS[status] || status
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white whitespace-nowrap uppercase" style={{ backgroundColor: color }}>
      {label}
    </span>
  )
}

function TipoBadge({ tipo }: { tipo: string }) {
  const colors = TIPO_COLORS[tipo] || TIPO_COLORS['SERVICO']!
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', colors.bg, colors.text)}>
      {tipo}
    </span>
  )
}


// Multi-select de usuarios — mesma UX do UserCombobox, com chips e checklist
function UserMultiPicker({ users, value, onChange, placeholder, disabled }: {
  users: Array<{ id: string; name: string; email?: string | null; image?: string | null }>
  value: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()) || (u.email || '').toLowerCase().includes(query.toLowerCase()))
    : users
  const selected = users.filter(u => value.includes(u.id))

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

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }
  function remove(id: string) {
    onChange(value.filter(v => v !== id))
  }
  function getInitials(name: string) {
    return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          'flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-sm gap-1 flex-wrap',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex items-center gap-1 flex-wrap min-h-7">
          {selected.length === 0 ? (
            <span className="text-muted-foreground text-xs">{placeholder ?? 'Selecione usuários'}</span>
          ) : selected.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1 bg-muted rounded-full pl-1 pr-1.5 py-0.5 text-[11px]">
              {u.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveAssetUrl(u.image)} alt={u.name} className="h-4 w-4 rounded-full object-cover" />
              ) : (
                <span className="h-4 w-4 rounded-full bg-background flex items-center justify-center">
                  <span className="text-[7px] font-bold text-muted-foreground">{getInitials(u.name)}</span>
                </span>
              )}
              <span className="truncate max-w-[120px]">{u.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); remove(u.id) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); remove(u.id) } }}
                className="ml-0.5 hover:text-destructive cursor-pointer"
                aria-label={`Remover ${u.name}`}
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          ))}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar usuário..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum usuário encontrado</p>
            ) : filtered.map(u => {
              const isSelected = value.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2',
                    isSelected && 'bg-accent/40',
                  )}
                >
                  <span className={cn(
                    'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                    isSelected ? 'bg-rose-500 border-rose-500' : 'border-border',
                  )}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </span>
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveAssetUrl(u.image)} alt={u.name} className="h-6 w-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-muted-foreground">{getInitials(u.name)}</span>
                    </span>
                  )}
                  <span className="truncate flex-1">{u.name}</span>
                  {u.email && <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{u.email}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CatalogoCombobox({ catalogo, tipo, selectedId, onSelect, disabled, currentLabel }: {
  catalogo: Array<{ id: string; nome: string; tipo: string; valorPadrao: number | string | null }>
  tipo: string
  selectedId: string
  onSelect: (id: string) => void
  disabled?: boolean
  // Rótulo a exibir quando o valor atual não casa com nenhum item do catálogo
  // (ex.: edição de item com descrição livre/legada) — evita esconder o texto.
  currentLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Posição do dropdown (fixed) — calculada a partir do gatilho. Renderizado
  // via portal pra escapar de containers com overflow (ex.: a <Table> da
  // edição inline, que senão recorta o menu — #HLP0088).
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const opcoes = catalogo.filter(c => c.tipo === tipo)
  const filtered = query.trim()
    ? opcoes.filter(c => c.nome.toLowerCase().includes(query.toLowerCase()))
    : opcoes
  const selected = opcoes.find(c => c.id === selectedId)

  const atualizarPos = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!open) return
    atualizarPos()
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
      setQuery('')
    }
    function reposiciona() { atualizarPos() }
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', reposiciona, true)
    window.addEventListener('resize', reposiciona)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', reposiciona, true)
      window.removeEventListener('resize', reposiciona)
    }
  }, [open, atualizarPos])

  // Limpa busca/fecha quando o tipo muda externamente
  useEffect(() => { setQuery(''); setOpen(false) }, [tipo])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-sm',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className={cn('truncate', !selected && !currentLabel && 'text-muted-foreground', (selected || currentLabel) && 'uppercase')}>
          {disabled ? 'Selecione um tipo primeiro' : selected ? selected.nome : currentLabel || 'Selecione um item'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 70 }}
          className="overflow-hidden rounded-md border bg-popover shadow-md"
        >
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum item encontrado</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center justify-between gap-2 uppercase',
                  selectedId === c.id && 'bg-accent text-accent-foreground',
                )}
                onClick={() => { onSelect(c.id); setOpen(false); setQuery('') }}
              >
                <span className="truncate">{c.nome}</span>
                {c.valorPadrao != null && (
                  <span className="text-muted-foreground whitespace-nowrap shrink-0">
                    R$ {Number(c.valorPadrao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// Input estilo Gmail: emails viram badges ao pressionar Enter/Tab/espaco/virgula/ponto-e-virgula.
// Sugestoes filtraveis aparecem ao digitar, baseadas na lista fornecida.
// O valor e persistido como string separada por '; '.
function EmailChipsInput({ value, onChange, suggestions, placeholder }: {
  value: string
  onChange: (next: string) => void
  suggestions: string[]
  placeholder?: string
}) {
  const emails = value ? value.split(/[,;]/).map(e => e.trim()).filter(Boolean) : []
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sugestoes filtradas: nao repete o que ja virou chip e bate com o que esta sendo digitado
  const filtered = (() => {
    const q = draft.trim().toLowerCase()
    const out = suggestions.filter(s => !emails.includes(s) && (q ? s.toLowerCase().includes(q) : true))
    return out.slice(0, 8)
  })()

  // Reseta o highlight quando a lista muda
  useEffect(() => { setHighlight(0) }, [draft, value])

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Regex pragmática de e-mail (rfc 5322 simplificada). Casa "a@b.c" e variações
  // razoáveis; rejeita strings sem @ ou sem TLD. Suficiente pra evitar lixo.
  const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

  function commitDraft(raw?: string) {
    const candidate = (raw ?? draft).trim().replace(/[,;]+$/, '')
    if (!candidate) { setDraft(''); return }
    if (emails.includes(candidate)) { setDraft(''); return }
    // Bloqueia entradas inválidas — mantém no draft pra o user corrigir
    // (não cria chip "abc" sem @ que depois fica difícil de remover).
    if (!EMAIL_RE.test(candidate)) return
    onChange([...emails, candidate].join('; '))
    setDraft('')
  }

  function removeAt(i: number) {
    const next = emails.filter((_, idx) => idx !== i)
    onChange(next.join('; '))
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Navegacao de sugestoes
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        commitDraft(filtered[highlight])
        setOpen(false)
        return
      }
    }
    // Confirma o draft
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault()
        commitDraft()
      }
      return
    }
    // Backspace remove o ultimo chip quando o input esta vazio
    if (e.key === 'Backspace' && !draft && emails.length > 0) {
      e.preventDefault()
      removeAt(emails.length - 1)
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const txt = e.clipboardData.getData('text')
    if (txt && /[,;\s]/.test(txt)) {
      e.preventDefault()
      const parts = txt.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean)
      const merged = Array.from(new Set([...emails, ...parts]))
      onChange(merged.join('; '))
      setDraft('')
    }
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[36px] px-2 py-1 border border-input rounded-md bg-transparent text-sm focus-within:ring-1 focus-within:ring-ring cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {emails.map((email, i) => (
          <span
            key={`${email}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 pl-2.5 pr-1 py-0.5 text-xs font-medium"
          >
            {email}
            <button
              type="button"
              // preventDefault no mousedown evita que o input perca foco e
              // dispare onBlur antes do click — sem isso, um draft em curso
              // virava chip junto com a remoção (chip removido reaparecia).
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); removeAt(i) }}
              className="rounded-full hover:bg-rose-200 dark:hover:bg-rose-900/50 p-0.5"
              title="Remover"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="email"
          value={draft}
          onChange={e => { setDraft(e.target.value); setOpen(true) }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setOpen(true)}
          // No blur, só tenta commitar — se o draft for inválido,
          // commitDraft devolve sem limpar; o user vê o texto e pode corrigir.
          onBlur={() => { if (draft.trim()) commitDraft() }}
          placeholder={emails.length === 0 ? placeholder : ''}
          className={cn(
            'flex-1 min-w-[140px] border-none bg-transparent outline-none shadow-none p-0 py-1 h-auto rounded-none focus:border-none focus:shadow-none focus:outline-none text-sm',
            // Feedback visual: texto vermelho quando o draft não é um e-mail válido
            draft.trim() && !EMAIL_RE.test(draft.trim()) && 'text-rose-600 dark:text-rose-400',
          )}
          style={{ width: 'auto', display: 'inline-block' }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitDraft(s); setOpen(false) }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2',
                i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="h-5 w-5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 flex items-center justify-center text-[9px] font-bold shrink-0">
                {s[0]?.toUpperCase() || '?'}
              </span>
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Item de timeline vertical para o card "Datas Importantes" da sidebar.
// Renderiza um marker (bolinha colorida) + linha conectora + label/data
// empilhados verticalmente. Inline edit nativo via <input type="date">.
function TimelineDateRow({
  label, valor, dotColor, canEdit, isLast, onSave,
}: {
  label: string
  valor: string | null | undefined
  dotColor: string
  canEdit: boolean
  isLast: boolean
  onSave?: (valor: string | null) => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setDraft(valor ? new Date(valor).toISOString().slice(0, 10) : '')
    setEditing(true)
  }

  async function handleSave() {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(draft || null)
      setEditing(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="flex gap-3 group">
      {/* Coluna esquerda: dot + linha conectora */}
      <div className="relative flex flex-col items-center shrink-0 pt-1">
        <div
          className="h-2.5 w-2.5 rounded-full ring-2 ring-card shadow-sm shrink-0 z-10"
          style={{ backgroundColor: dotColor }}
        />
        {!isLast && <div className="w-px flex-1 bg-border/70 mt-0.5" />}
      </div>

      {/* Coluna direita: label + data (ou edit inline) */}
      <div className={cn('flex-1 min-w-0', !isLast && 'pb-3')}>
        <div className="flex items-center justify-between gap-2 -mx-2 px-2 py-0.5 rounded-md hover:bg-muted/50 transition-colors">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-foreground">{label}</span>
            {editing ? (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  type="date"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="h-7 text-xs flex-1 min-w-0"
                  autoFocus
                />
                <button type="button" onClick={handleSave} disabled={saving} title="Salvar" className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => setEditing(false)} disabled={saving} title="Cancelar" className="text-muted-foreground hover:text-foreground disabled:opacity-50">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {valor
                  ? new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '—'}
              </span>
            )}
          </div>
          {!editing && canEdit && (
            <button
              type="button"
              onClick={startEdit}
              title="Editar"
              className="text-muted-foreground hover:text-foreground p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Page
// ============================================================

export default function OrcamentoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [activeTab, setActiveTab] = useState('detalhes')

  // Sub-permissoes do modulo orcamentos (espelha legado modal-prm-orcamentos.asp)
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const orcPerm = permissions.find(p => p.moduleSlug === 'orcamentos')
  const subPerms = (orcPerm?.subPermissions ?? {}) as Record<string, boolean>
  const canManageItens = isMaster || subPerms.manage_itens === true
  const canEditTimelineDates = isMaster || subPerms.edit_timeline_dates === true
  const canEnviar = isMaster || subPerms.acao_enviar === true
  const canAprovar = isMaster || subPerms.acao_aprovar === true
  const canLiberar = isMaster || subPerms.acao_liberar === true
  const canEncerrar = isMaster || subPerms.acao_encerrar === true
  const canParalizar = isMaster || subPerms.acao_paralizar === true
  const canRetomar = isMaster || subPerms.acao_retomar === true
  const canReabrir = isMaster || subPerms.acao_reabrir === true
  const canDuplicar = isMaster || subPerms.acao_duplicar === true
  const canArquivar = isMaster || subPerms.acao_arquivar === true
  const canChangeSolicitante = isMaster || subPerms.change_solicitante === true
  const canChangeResponsavel = isMaster || subPerms.change_responsavel === true
  const canEnviarPesquisa = isMaster || subPerms.enviar_pesquisa === true
  // Catálogo de serviços é configuração administrativa do módulo — restrito a master/empresa-master
  const canManageCatalogo = isMaster || isEmpresaMaster

  const [orc, setOrc] = useState<Orcamento | null>(null)
  const [loading, setLoading] = useState(true)
  // Atualiza o label da aba quando o orçamento carrega: "Orçamento: #4489"
  useTabLabel(orc ? `Orçamento: #${String(orc.numero).padStart(4, '0')}` : null)
  // Orcamento "congelado" — apos APROVADO, alteracoes sao bloqueadas. Para
  // editar, usuario deve duplicar (gera copia em status NOVO). Backend tambem
  // valida via assertEditable.
  const STATUS_LOCKED = new Set(['APROVADO', 'LIBERADO', 'FINALIZADO', 'ENCERRADO'])
  const isLocked = !!orc && STATUS_LOCKED.has(orc.status)
  // Pills internas da aba Detalhes (organizacao em sub-card vertical)
  type PillKey = 'dados' | 'itens' | 'desconto' | 'textos'
  const [activePill, setActivePill] = useState<PillKey>('dados')
  // Auto-save: status visivel + ref para evitar disparar no primeiro load
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const initialLoadRef = useRef(true)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clientes, setClientes] = useState<{ id: string; razaoSocial: string; documento?: string | null }[]>([])

  // Imagem de fundo do header (config global) — apenas Master pode editar
  const [headerCover, setHeaderCover] = useState<string>('')
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Modal de envio
  const [iaOpen, setIaOpen] = useState(false)
  const [pesquisaResumo, setPesquisaResumo] = useState<any>(null)
  const [pesquisaSheet, setPesquisaSheet] = useState(false)
  const [pesquisaEnviarModal, setPesquisaEnviarModal] = useState(false)
  const [pesquisaDest, setPesquisaDest] = useState('')
  const [pesquisaLink, setPesquisaLink] = useState('')
  const [pesquisaBusy, setPesquisaBusy] = useState(false)
  const [enviarModal, setEnviarModal] = useState(false)
  const [enviarDestinatarios, setEnviarDestinatarios] = useState('')
  const [enviarMensagem, setEnviarMensagem] = useState('')
  const [enviarNotificar, setEnviarNotificar] = useState(true)
  const [enviando, setEnviando] = useState(false)

  // Modais de workflow estendido
  const [paralizarModal, setParalizarModal] = useState(false)
  const [paralizarMotivo, setParalizarMotivo] = useState('')
  const [reabrirModal, setReabrirModal] = useState(false)
  const [reabrirStatus, setReabrirStatus] = useState('NOVO')
  const [reabrirMotivo, setReabrirMotivo] = useState('')
  // Por padrao a reabertura limpa as datas dos marcos posteriores. Quando ativo,
  // preserva as datas (caso de correcao administrativa onde os marcos
  // realmente aconteceram). dtEncerrado/dtCancelado sempre sao limpos.
  const [reabrirManterDatas, setReabrirManterDatas] = useState(false)
  const [workflowLoading, setWorkflowLoading] = useState(false)

  // Trocar responsavel/solicitante
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string; email: string | null; image: string | null }>>([])

  // Historico de orcamentos do cliente
  const [historicoCliente, setHistoricoCliente] = useState<Array<{
    id: string; numero: number; status: string; totalGeral: number | string;
    createdAt: string; arquivado: boolean; tipo: string | null;
    itens?: Array<{ descricao: string }>
  }>>([])
  const [temLegado, setTemLegado] = useState(false)

  // Sugestoes de e-mails para o campo "Emails dos Contatos" — extraidas de:
  //   1) cliente.email (e-mail principal)
  //   2) listContatos do cliente (todos os contatos cadastrados)
  // Atualiza quando o cliente muda.
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([])

  // Form fields
  const [formTipo, setFormTipo] = useState('')
  const [formClienteId, setFormClienteId] = useState('')
  const [formContatos, setFormContatos] = useState('')
  const [formEmails, setFormEmails] = useState('')

  // Item form
  const [itemTipo, setItemTipo] = useState('')
  const [itemDescricao, setItemDescricao] = useState('')
  const [itemQtde, setItemQtde] = useState('1')
  const [itemValor, setItemValor] = useState('')
  const [itemCatalogoId, setItemCatalogoId] = useState<string>('')
  const [itemTextoId, setItemTextoId] = useState<string>('')
  const [addingItem, setAddingItem] = useState(false)

  // Catalogo (servicos disponiveis para orcamento)
  const [catalogo, setCatalogo] = useState<Array<{ id: string; nome: string; tipo: string; valorPadrao: number | string | null; textoPadrao: string | null; textos?: CatalogoTexto[] }>>([])

  // Inline edit
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editTipo, setEditTipo] = useState('')
  const [editDescricao, setEditDescricao] = useState('')
  const [editQtde, setEditQtde] = useState('')
  const [editValor, setEditValor] = useState('')
  const [editCatalogoId, setEditCatalogoId] = useState<string>('')
  const [editTextoId, setEditTextoId] = useState<string>('')

  // Tab 2: Desconto e Pagamento
  const [formDescontoPercent, setFormDescontoPercent] = useState('')
  const [formDesconto, setFormDesconto] = useState('')
  const [formValidade, setFormValidade] = useState('')
  const [formPagamento, setFormPagamento] = useState('')

  // Tab 2: Textos
  const [formTextoInterno, setFormTextoInterno] = useState('')
  const [formTextoCliente, setFormTextoCliente] = useState('')

  // Servico template vinculado — quando orcamento for APROVADO, sistema cria
  // automaticamente uma execucao para o responsavel executar o checklist.
  const [formServicoId, setFormServicoId] = useState('')
  const [servicosDisponiveis, setServicosDisponiveis] = useState<Array<{ id: string; nome: string; categoria: string | null }>>([])
  useEffect(() => {
    (async () => {
      try {
        const list = await (trpc.servico as any).listServicos.query()
        setServicosDisponiveis((list || []).map((s: any) => ({ id: s.id, nome: s.nome, categoria: s.categoria ?? null })))
      } catch { /* sem permissao no modulo */ }
    })()
  }, [])

  // Formas de pagamento — lista gerenciável (espelha "Gerenciar Formas de
  // Pagamento" do legado). O campo no form vira um <Select> dessas opções.
  const [formasPagamento, setFormasPagamento] = useState<Array<{ id: string; valor: string; ordem: number }>>([])
  const loadFormasPagamento = useCallback(async () => {
    try {
      const list = await (trpc.orcamento as any).listFormasPagamento.query()
      setFormasPagamento(list || [])
    } catch { /* sem permissao no modulo */ }
  }, [])
  useEffect(() => { loadFormasPagamento() }, [loadFormasPagamento])
  // Modal de gerência das formas de pagamento (admin)
  const [formasModal, setFormasModal] = useState(false)
  const [novaForma, setNovaForma] = useState('')

  const handleAddForma = async () => {
    if (!novaForma.trim()) return
    try {
      await (trpc.orcamento as any).createFormaPagamento.mutate({ valor: novaForma.trim() })
      setNovaForma('')
      await loadFormasPagamento()
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  const handleDeleteForma = async (id: string, valor: string) => {
    const ok = await alerts.confirmDelete(valor)
    if (!ok) return
    try {
      await (trpc.orcamento as any).deleteFormaPagamento.mutate({ id })
      setFormasPagamento(prev => prev.filter(f => f.id !== id))
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  // ── Fetch ──

  const fetchOrc = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await (trpc.orcamento as any).getById.query({ id })
      setOrc(data)
      // Só (re)popula os campos EDITÁVEIS num carregamento NÃO-silencioso (load
      // inicial / troca de registro). Em refetches silenciosos (após cada
      // auto-save), o estado local do form é a fonte da verdade: repopular aqui
      // reinjetava um snapshot atrasado nos RichEditors, jogando o cursor pro
      // fim e revertendo o texto recém-digitado. O `orc` acima continua
      // atualizando (Resumo Financeiro, status, etc.).
      if (!silent) {
        setFormTipo(data.tipo || '')
        setFormClienteId(data.cliente?.id || '')
        setFormContatos(data.contatos || '')
        setFormEmails(data.emailsContatos || data.emails || '')
        setFormDescontoPercent(data.descontoPct != null ? String(data.descontoPct) : '')
        setFormDesconto(data.descontoValor != null ? String(data.descontoValor) : '')
        setFormValidade(data.validadeDias != null ? String(data.validadeDias) : '')
        setFormPagamento(data.formaPagamento || '')
        setFormTextoInterno(data.textoInterno || '')
        setFormTextoCliente(data.textoCorpoCliente || '')
        setFormServicoId(data.servicoId || '')
        // Libera auto-save apos um tick (deixa os setState se acomodarem antes do effect rodar)
        setTimeout(() => { initialLoadRef.current = false }, 50)
      }
    } catch { if (!silent) alerts.error('Erro', 'Não foi possível carregar o orçamento.') }
    finally { if (!silent) setLoading(false) }
  }, [id])

  useEffect(() => { fetchOrc(false) }, [fetchOrc])

  // Resumo da pesquisa de satisfação (indicador "respondida" + Sheet de respostas)
  const loadPesquisaResumo = useCallback(() => {
    (trpc.pesquisa as any).getResumoPorOrcamento.query({ orcamentoId: id })
      .then((r: any) => setPesquisaResumo(r))
      .catch(() => {})
  }, [id])
  useEffect(() => { loadPesquisaResumo() }, [loadPesquisaResumo])

  async function abrirEnviarPesquisa() {
    setPesquisaDest((orc?.emailsContatos as string) || orc?.cliente?.email || '')
    setPesquisaLink('')
    setPesquisaEnviarModal(true)
    try {
      const r = await (trpc.pesquisa as any).prepararEnvio.mutate({ orcamentoId: id })
      setPesquisaLink(r?.link || '')
    } catch { /* link fica vazio; envio por e-mail ainda funciona */ }
  }
  async function enviarPesquisaEmail() {
    setPesquisaBusy(true)
    try {
      const dest = pesquisaDest.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
      await (trpc.pesquisa as any).enviarPesquisaPorEmail.mutate({ orcamentoId: id, destinatarios: dest.length ? dest : undefined })
      alerts.success('Pesquisa enviada', 'O link da pesquisa foi enviado ao cliente.')
      setPesquisaEnviarModal(false)
      loadPesquisaResumo()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setPesquisaBusy(false) }
  }
  async function copiarLinkPesquisa() {
    if (!pesquisaLink) return
    try { await navigator.clipboard.writeText(pesquisaLink); alerts.success('Copiado', 'Link da pesquisa copiado.') }
    catch { alerts.error('Erro', 'Não foi possível copiar.') }
  }

  // SSE — recebe push do backend quando outro cliente altera este orçamento
  // (dados gerais, itens, status do kanban). Filtra por `orcamentoId` da URL
  // e despacha um refetch silencioso pra todos os tipos relevantes — refazer
  // a query inteira é mais simples que diffar campo a campo, e o payload do
  // detalhe é pequeno.
  useEffect(() => {
    if (!id) return
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let closed = false
    const connect = () => {
      if (closed) return
      try {
        es = new EventSource(`${getApiUrl()}/api/orcamentos/events`)
        es.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data) as { type: string; orcamentoId: string }
            if (ev.orcamentoId !== id) return
            // Qualquer tipo relevante (kanban/dados-gerais/itens) recarrega o orc.
            if (ev.type === 'kanban' || ev.type === 'dados-gerais' || ev.type === 'itens') {
              fetchOrc(true)
            }
          } catch { /* payload inválido */ }
        }
        es.onerror = () => {
          es?.close()
          if (!closed) retryTimeout = setTimeout(connect, 15000)
        }
      } catch {
        if (!closed) retryTimeout = setTimeout(connect, 15000)
      }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retryTimeout) }
  }, [id, fetchOrc])

  // Carregar catalogo de servicos disponiveis para orcamento — filtra serviços
  // (Servico) pela recorrência conforme o tipo do orçamento (mensal x extra).
  useEffect(() => {
    if (!orc) return
    ;(async () => {
      try {
        const data = await (trpc.orcamento as any).listCatalogo.query({
          somenteDisponiveis: true,
          tipoOrcamento: orc.tipo ?? null,
        })
        setCatalogo(data || [])
      } catch { /* silent */ }
    })()
  }, [orc?.tipo])

  // Carregar usuarios para o select de responsavel/solicitante
  useEffect(() => {
    (async () => {
      try {
        const data = await (trpc.orcamento as any).listUsuarios.query()
        setUsuarios(data || [])
      } catch { /* silent */ }
    })()
  }, [])

  // Carregar historico de orcamentos do mesmo cliente
  useEffect(() => {
    if (!orc?.cliente?.id) { setHistoricoCliente([]); setTemLegado(false); return }
    (async () => {
      try {
        const data = await (trpc.orcamento as any).listOrcamentosDoCliente.query({ clienteId: orc.cliente!.id, excluirId: id })
        setHistoricoCliente(data || [])
      } catch { /* silent */ }
      // Histórico do legado (define se a aba aparece mesmo sem outros orçamentos atuais)
      try {
        const leg = await (trpc.orcamento as any).legadoPorCliente.query({ clienteId: orc.cliente!.id })
        setTemLegado((leg || []).length > 0)
      } catch { /* silent */ }
    })()
  }, [orc?.cliente?.id, id])

  // Sugestoes de e-mail para o campo "Emails dos Contatos" — coleta cliente.email + contatos
  useEffect(() => {
    if (!orc?.cliente?.id) { setEmailSuggestions([]); return }
    (async () => {
      try {
        const set = new Set<string>()
        if (orc.cliente?.email) set.add(orc.cliente.email)
        const contatos = await (trpc.cliente as any).listContatos.query({ clienteId: orc.cliente!.id }).catch(() => [])
        for (const c of (contatos as Array<{ email: string | null }>)) {
          if (c.email && c.email.trim()) set.add(c.email.trim())
        }
        setEmailSuggestions(Array.from(set))
      } catch { /* silent */ }
    })()
  }, [orc?.cliente?.id, orc?.cliente?.email])

  useEffect(() => {
    ;(async () => {
      try {
        const list = await (trpc.cliente as any).listForSelect.query()
        setClientes(list)
      } catch { /* silent */ }
    })()
  }, [])

  // Carrega imagem de fundo configurada (todos podem ver; somente Master edita)
  useEffect(() => {
    ;(async () => {
      try {
        const cfg = await (trpc.orcamento as any).getConfig.query()
        setHeaderCover(cfg?.headerCover || '')
      } catch { /* silent */ }
    })()
  }, [])

  async function handleCoverUpload(file: File) {
    setUploadingCover(true)
    try {
      const apiUrl = getApiUrl()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error(`Falha no upload (${res.status})`)
      const data = await res.json()
      // Mesmo padrao de /perfil
      const fileUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
      await (trpc.orcamento as any).setHeaderCover.mutate({ url: fileUrl })
      setHeaderCover(fileUrl)
      alerts.success('Capa atualizada', 'A imagem de fundo do header foi atualizada')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setUploadingCover(false) }
  }

  async function handleCoverRemove() {
    const ok = await alerts.confirm({ title: 'Remover capa?', text: 'A imagem de fundo personalizada será removida e voltará ao padrão.', icon: 'warning', confirmText: 'Remover' })
    if (!ok) return
    setUploadingCover(true)
    try {
      await (trpc.orcamento as any).setHeaderCover.mutate({ url: null })
      setHeaderCover('')
      alerts.success('Capa removida', 'A imagem de fundo foi removida')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setUploadingCover(false) }
  }

  // ── Actions ──

  async function saveDetails() {
    setAutoSaveStatus('saving')
    try {
      await (trpc.orcamento as any).update.mutate({
        id,
        data: {
          tipo: formTipo || undefined,
          clienteId: formClienteId || undefined,
          // solicitante/responsavel agora sao alterados imediatamente via combobox (handleSelectPessoa)
          contatos: formContatos || undefined,
          emailsContatos: formEmails || undefined,
          descontoPct: formDescontoPercent ? parseFloat(formDescontoPercent) : 0,
          descontoValor: formDesconto ? parseFloat(formDesconto) : 0,
          validadeDias: formValidade ? parseInt(formValidade) : undefined,
          formaPagamento: formPagamento || undefined,
          textoInterno: formTextoInterno || undefined,
          textoCorpoCliente: formTextoCliente || undefined,
          servicoId: formServicoId || null,
        },
      })
      setAutoSaveStatus('saved')
      if (savedHideTimerRef.current) clearTimeout(savedHideTimerRef.current)
      savedHideTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2000)
      fetchOrc(true)
    } catch {
      setAutoSaveStatus('error')
      if (savedHideTimerRef.current) clearTimeout(savedHideTimerRef.current)
      savedHideTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 4000)
    }
  }

  // Auto-save geral (campos editaveis do form): dispara saveDetails com debounce
  // de 800ms apos qualquer mudanca. Pula no primeiro mount e quando isLocked
  // (nesse caso, apenas Texto Interno e salvo via auto-save dedicado abaixo).
  useEffect(() => {
    if (initialLoadRef.current) return
    if (isLocked) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveDetails()
    }, 800)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formTipo, formClienteId, formContatos, formEmails, formDescontoPercent, formDesconto, formValidade, formPagamento, formTextoInterno, formTextoCliente, formServicoId])

  // Auto-save dedicado SOMENTE do Texto Interno quando o orcamento esta locked.
  // Usa endpoint `updateTextoInterno` que bypassa o `assertEditable` (e uma
  // anotacao interna, nao altera escopo/valores).
  const textoInternoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (initialLoadRef.current) return
    if (!isLocked) return
    if (textoInternoTimerRef.current) clearTimeout(textoInternoTimerRef.current)
    textoInternoTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      try {
        await (trpc.orcamento as any).updateTextoInterno.mutate({ id, textoInterno: formTextoInterno || null })
        setAutoSaveStatus('saved')
        if (savedHideTimerRef.current) clearTimeout(savedHideTimerRef.current)
        savedHideTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2000)
      } catch {
        setAutoSaveStatus('error')
        if (savedHideTimerRef.current) clearTimeout(savedHideTimerRef.current)
        savedHideTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 4000)
      }
    }, 800)
    return () => { if (textoInternoTimerRef.current) clearTimeout(textoInternoTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formTextoInterno, isLocked])

  function abrirEnvio() {
    const emails: string[] = []
    if (orc?.cliente?.email) emails.push(orc.cliente.email)
    if (orc?.emailsContatos) emails.push(...orc.emailsContatos.split(/[,;]/).map(s => s.trim()).filter(Boolean))
    setEnviarDestinatarios([...new Set(emails)].join(', '))
    setEnviarMensagem('')
    setEnviarNotificar(true)
    setEnviarModal(true)
  }

  // Avanca/regredi o status via mesmo endpoint usado pelo kanban
  async function handleStatusAction(novoStatus: string, mensagemSucesso: string) {
    try {
      await (trpc.orcamento as any).changeStatus.mutate({ id, status: novoStatus })
      alerts.success('Atualizado', mensagemSucesso)
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Confirma uma transicao destrutiva (recusa/cancelamento/encerramento) antes de aplicar
  async function handleStatusActionConfirm(opts: {
    novoStatus: string
    title: string
    text: string
    confirmText: string
    successMsg: string
    icon?: 'warning' | 'question'
  }) {
    const ok = await alerts.confirm({
      title: opts.title,
      text: opts.text,
      confirmText: opts.confirmText,
      icon: opts.icon ?? 'warning',
    })
    if (!ok) return
    await handleStatusAction(opts.novoStatus, opts.successMsg)
  }

  async function handleEnviar() {
    setEnviando(true)
    try {
      // Destinatários são opcionais (#HLP0086): sem e-mail, só muda status pra
      // ENVIADO sem disparar notificação. Permite que o usuário marque o orçamento
      // como enviado por canal externo (WhatsApp, telefone) sem precisar de email.
      const destinatarios = enviarDestinatarios.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      // Checkbox desmarcado → força "sem e-mail" (destinatarios=[]): marca como enviado
      // sem notificar o cliente. Marcado → envia pros destinatários.
      const result = await (trpc.orcamento as any).enviar.mutate({
        id,
        destinatarios: enviarNotificar ? (destinatarios.length > 0 ? destinatarios : undefined) : [],
        mensagem: enviarMensagem.trim() || undefined,
      })
      setEnviarModal(false)
      const qtd = Array.isArray(result.destinatarios) ? result.destinatarios.length : 0
      await alerts.success(
        'Enviado',
        qtd > 0
          ? `Orçamento enviado para ${qtd} destinatário(s)`
          : 'Orçamento marcado como enviado (sem e-mail disparado)',
      )
      fetchOrc(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  function copiarLinkPublico() {
    if (!orc?.token) return
    const baseUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : ''
    const link = `${baseUrl}/orcamento/${orc.token}`
    navigator.clipboard.writeText(link).then(() => alerts.success('Copiado', 'Link copiado para a área de transferência'))
  }

  // ── Workflow estendido (paralizar, retomar, reabrir, editar datas) ──

  async function handleParalizar() {
    if (!paralizarMotivo.trim()) { alerts.warning('Atenção', 'Informe o motivo da paralização'); return }
    setWorkflowLoading(true)
    try {
      await (trpc.orcamento as any).paralizar.mutate({ id, motivo: paralizarMotivo.trim() })
      setParalizarModal(false)
      setParalizarMotivo('')
      alerts.success('Paralizado', 'Orçamento paralizado com sucesso')
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setWorkflowLoading(false) }
  }

  async function handleRetomar() {
    const ok = await alerts.confirm({ title: 'Retomar orçamento?', text: 'O orçamento voltará ao fluxo normal de trabalho.', confirmText: 'Retomar', icon: 'question' })
    if (!ok) return
    setWorkflowLoading(true)
    try {
      await (trpc.orcamento as any).retomar.mutate({ id })
      alerts.success('Retomado', 'Orçamento retomado com sucesso')
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setWorkflowLoading(false) }
  }

  async function handleReabrir() {
    if (!reabrirMotivo.trim()) {
      alerts.warning('Atenção', 'Informe o motivo da reabertura. Esse registro fica no histórico do orçamento.')
      return
    }
    setWorkflowLoading(true)
    try {
      await (trpc.orcamento as any).reabrir.mutate({
        id,
        novoStatus: reabrirStatus,
        motivo: reabrirMotivo.trim(),
        manterDatas: reabrirManterDatas,
      })
      setReabrirModal(false)
      setReabrirMotivo('')
      setReabrirManterDatas(false)
      alerts.success(
        'Reaberto',
        reabrirManterDatas
          ? 'Orçamento reaberto. As datas dos marcos foram preservadas.'
          : 'Orçamento reaberto. As datas dos marcos posteriores foram limpas.',
      )
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setWorkflowLoading(false) }
  }

  // Duplicar orcamento — usado quando o orcamento esta locked (APROVADO+) e
  // o usuario quer editar. A copia e criada com status NOVO.
  async function handleDuplicar() {
    if (!orc) return
    const ok = await alerts.confirm({
      title: 'Duplicar para editar?',
      text: `Será criado um novo orçamento idêntico em status "Novo", que poderá ser editado livremente. O orçamento atual #${String(orc.numero).padStart(4, '0')} permanece ${STATUS_LABELS[orc.status] || orc.status} e não será alterado.`,
      confirmText: 'Duplicar',
      icon: 'question',
    })
    if (!ok) return
    try {
      const result = await (trpc.orcamento as any).duplicar.mutate({ id })
      alerts.success('Duplicado', `Orçamento #${String(result.numero).padStart(4, '0')} criado como cópia editável.`)
      router.push(`/orcamentos/${result.id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Status disponíveis para reabertura: somente os anteriores ao atual
  const reabrirStatusOptions = (() => {
    if (!orc) return [] as string[]
    const idxAtual = ORCAMENTO_STATUS_ORDER.indexOf(orc.status as typeof ORCAMENTO_STATUS_ORDER[number])
    if (idxAtual <= 0) return []
    return ORCAMENTO_STATUS_ORDER.slice(0, idxAtual).filter(s => s !== 'ENCERRADO')
  })()

  // Atualiza solicitante/responsavel direto via combobox (sem abrir modal intermediario)
  async function handleSelectPessoa(tipo: 'solicitante' | 'responsavel', userId: string) {
    try {
      if (tipo === 'responsavel') {
        await (trpc.orcamento as any).trocarResponsavel.mutate({ id, responsavelId: userId || null })
      } else {
        await (trpc.orcamento as any).trocarSolicitante.mutate({ id, solicitanteId: userId || null })
      }
      alerts.success('Atualizado', `${tipo === 'responsavel' ? 'Responsável' : 'Solicitante'} atualizado`)
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Editar data da timeline (datas dedicadas dtEnviado/dtAprovado/...)
  async function handleEditarData(campo: string, valor: string | null) {
    try {
      await (trpc.orcamento as any).editarData.mutate({ id, campo, valor })
      alerts.success('Atualizado', 'Data atualizada')
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Items ──

  async function handleAddItem() {
    if (!itemTipo || !itemDescricao.trim()) return
    setAddingItem(true)
    try {
      await (trpc.orcamento as any).addItem.mutate({
        orcamentoId: id,
        tipo: itemTipo,
        descricao: itemDescricao,
        quantidade: parseFloat(itemQtde) || 1,
        valorUnitario: parseFloat(itemValor) || 0,
        catalogoId: itemCatalogoId || undefined,
        catalogoTextoId: itemTextoId || undefined,
      })
      setItemTipo('')
      setItemDescricao('')
      setItemQtde('1')
      setItemValor('')
      setItemCatalogoId('')
      setItemTextoId('')
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setAddingItem(false) }
  }

  // Ao trocar o tipo, limpa a descricao escolhida (lista do catalogo muda)
  function handleChangeItemTipo(tipo: string) {
    setItemTipo(tipo)
    setItemCatalogoId('')
    setItemTextoId('')
    setItemDescricao('')
    setItemValor('')
  }

  // Helper de "captura de valor": o valor FIXO do serviço (valorPadrao) prevalece.
  // Só quando o serviço NÃO tem valor fixo (null/0) é que o valor do texto escolhido
  // é capturado para o valorUnitário do item.
  function temValorFixo(valorPadrao: number | string | null | undefined): boolean {
    return valorPadrao != null && Number(valorPadrao) > 0
  }

  // Selecao do item do catalogo via campo Descricao (preenche descricao + valor)
  function handleSelecionarDescricao(catalogoId: string) {
    const item = catalogo.find(c => c.id === catalogoId)
    if (!item) return
    setItemCatalogoId(catalogoId)
    setItemTextoId('')
    setItemDescricao(item.nome)
    if (item.valorPadrao != null) setItemValor(String(item.valorPadrao))
  }

  // Escolha do texto do registro (no formulário de inclusão). Captura o valor do
  // texto SOMENTE se o serviço não tem valor fixo (regra confirmada).
  function handleSelecionarTexto(textoId: string) {
    setItemTextoId(textoId)
    const item = catalogo.find(c => c.id === itemCatalogoId)
    const texto = item?.textos?.find(t => t.id === textoId)
    if (texto && !temValorFixo(item?.valorPadrao) && texto.valor != null) {
      setItemValor(String(texto.valor))
    }
    // A descrição da variação alimenta o "Texto para o Cliente" do orçamento.
    if (texto?.descricao) setFormTextoCliente(texto.descricao)
  }

  function startEditItem(item: OrcamentoItem) {
    setEditingItemId(item.id)
    setEditTipo(item.tipo)
    setEditDescricao(item.descricao)
    setEditQtde(String(item.quantidade))
    setEditValor(String(item.valorUnitario))
    setEditCatalogoId(item.catalogoId ?? '')
    setEditTextoId(item.catalogoTextoId ?? '')
  }

  // Seleção de item do catálogo na EDIÇÃO (mesma busca da inclusão — #HLP0088).
  // Preenche descrição + valor a partir do item escolhido.
  function handleSelecionarDescricaoEdit(catalogoId: string) {
    const item = catalogo.find(c => c.id === catalogoId)
    if (!item) return
    setEditCatalogoId(catalogoId)
    setEditTextoId('')
    setEditDescricao(item.nome)
    if (item.valorPadrao != null) setEditValor(String(item.valorPadrao))
  }

  // Escolha do texto na EDIÇÃO — mesma regra de captura de valor.
  function handleSelecionarTextoEdit(textoId: string) {
    setEditTextoId(textoId)
    const item = catalogo.find(c => c.id === editCatalogoId)
    const texto = item?.textos?.find(t => t.id === textoId)
    if (texto && !temValorFixo(item?.valorPadrao) && texto.valor != null) {
      setEditValor(String(texto.valor))
    }
    if (texto?.descricao) setFormTextoCliente(texto.descricao)
  }

  async function handleSaveItem() {
    if (!editingItemId) return
    try {
      await (trpc.orcamento as any).updateItem.mutate({
        id: editingItemId,
        data: {
          tipo: editTipo,
          descricao: editDescricao,
          quantidade: parseFloat(editQtde) || 1,
          valorUnitario: parseFloat(editValor) || 0,
          catalogoId: editCatalogoId || null,
          catalogoTextoId: editTextoId || null,
        },
      })
      setEditingItemId(null)
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleRemoveItem(itemId: string) {
    if (!await alerts.confirmDelete('este item')) return
    try {
      await (trpc.orcamento as any).removeItem.mutate({ id: itemId })
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Modal Texto Padrao do item (legado modal-itens-txt.asp) ──
  const [textoPadraoModal, setTextoPadraoModal] = useState<{ nome: string; texto: string } | null>(null)

  function abrirTextoPadrao(item: OrcamentoItem) {
    if (!item.catalogoId) {
      alerts.error('Sem texto padrão', 'Este item não está vinculado a um item do catálogo.')
      return
    }
    const cat = catalogo.find(c => c.id === item.catalogoId)
    if (!cat) {
      alerts.error('Não encontrado', 'Item do catálogo não localizado.')
      return
    }
    // Se o item tem um texto escolhido (catalogoTextoId), o "texto padrão" passa a
    // ser a descrição/título DESSE texto. Senão, cai no textoPadrao legado do catálogo.
    if (item.catalogoTextoId) {
      const texto = cat.textos?.find(t => t.id === item.catalogoTextoId)
      if (texto) {
        setTextoPadraoModal({ nome: texto.titulo, texto: texto.descricao || '(Sem descrição cadastrada)' })
        return
      }
    }
    setTextoPadraoModal({ nome: cat.nome, texto: cat.textoPadrao || '(Sem texto padrão cadastrado)' })
  }

  async function copiarTextoPadrao() {
    if (!textoPadraoModal) return
    // Extrai versao plain do HTML para fallback
    const tmp = document.createElement('div')
    tmp.innerHTML = textoPadraoModal.texto
    const plain = `${textoPadraoModal.nome}\n\n${tmp.textContent || tmp.innerText || ''}`.trim()
    const html = `<h4>${textoPadraoModal.nome}</h4>${textoPadraoModal.texto}`
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(plain)
      }
      alerts.success('Copiado', 'Texto padrão copiado para a área de transferência.')
    } catch { alerts.error('Erro', 'Falha ao copiar texto.') }
  }

  // ── Arquivos ──

  const [dragActive, setDragActive] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setUploadingFiles(prev => [...prev, file.name])
    try {
      const apiUrl = getApiUrl()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error(`Falha no upload (${res.status})`)
      const data = await res.json()
      const fileUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
      await (trpc.orcamento as any).addArquivo.mutate({
        orcamentoId: id,
        fileName: file.name,
        fileUrl,
        fileSize: file.size,
        mimeType: file.type || undefined,
      })
    } catch (e) {
      alerts.error('Erro', `Falha ao enviar "${file.name}": ${(e as Error).message}`)
    } finally {
      setUploadingFiles(prev => prev.filter(n => n !== file.name))
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    if (arr.length === 0) return
    // Upload em paralelo
    await Promise.all(arr.map(f => uploadFile(f)))
    fetchOrc(true)
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setDragActive(true)
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setDragActive(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    // so desativa quando sai do container raiz
    if (e.currentTarget === e.target) setDragActive(false)
  }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files)
    }
  }
  function handleAddArquivo() {
    fileInputRef.current?.click()
  }

  async function handleRemoveArquivo(arquivoId: string) {
    if (!await alerts.confirmDelete('este arquivo')) return
    try {
      await (trpc.orcamento as any).removeArquivo.mutate({ id: arquivoId })
      fetchOrc(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Totals ──

  const totalServicos = orc?.itens.filter(i => i.tipo === 'SERVICO').reduce((s, i) => s + (i.valorTotal || i.quantidade * i.valorUnitario), 0) ?? 0
  const totalTaxas = orc?.itens.filter(i => i.tipo === 'TAXA').reduce((s, i) => s + (i.valorTotal || i.quantidade * i.valorUnitario), 0) ?? 0
  const totalDespesas = orc?.itens.filter(i => i.tipo === 'DESPESA').reduce((s, i) => s + (i.valorTotal || i.quantidade * i.valorUnitario), 0) ?? 0
  const subtotal = totalServicos + totalTaxas + totalDespesas
  // Decimal do Prisma vem como string no JSON — coerce para Number antes de usar
  // em expressoes aritmeticas / .toFixed(). Tambem evita o bug "0" (string truthy)
  // no operador OR (precisa-se cair no descontoPct quando valorDeReais e 0).
  const descontoValorNum = Number(orc?.descontoValor ?? 0) || 0
  const descontoPctNum = Number(orc?.descontoPct ?? 0) || 0
  const descontoAplicado = orc ? (descontoValorNum || (descontoPctNum > 0 ? subtotal * descontoPctNum / 100 : 0)) : 0
  const totalGeral = subtotal - descontoAplicado
  const descontoPercentCalc = descontoPctNum || (subtotal > 0 ? (descontoAplicado / subtotal) * 100 : 0)

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!orc) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>Orçamento não encontrado</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/orcamentos')}>Voltar</Button>
      </div>
    )
  }

  return (
    <div className="space-y-0 pb-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
      {/* Wrapper bleed-edge cobrindo Header + Tabs — espelha padrao /perfil:
          imagem como <img> absoluto + overlay rosa por cima */}
      <div
        className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 overflow-hidden group/cover"
        style={!headerCover ? { backgroundColor: 'rgba(251, 113, 133, .18)' } : undefined}
      >
        {/* Imagem de fundo personalizada — em tamanho natural; tile (repeat) quando menor que o wrapper */}
        {headerCover && (
          <div
            aria-label="Capa do orcamento"
            className="absolute inset-0"
            style={{
              backgroundImage: `url('${headerCover}')`,
              backgroundRepeat: 'repeat',
              backgroundSize: 'auto',
              backgroundPosition: 'top left',
              opacity: 0.2,
            }}
          />
        )}
        {/* Overlay rosa em gradiente: 0% na esquerda → 80% na direita (imagem revela-se a esquerda) */}
        {headerCover && (
          <div
            className="absolute inset-0"
            style={{ backgroundImage: 'linear-gradient(to right, rgba(251, 113, 133, 0) 0%, rgba(251, 113, 133, 0.8) 100%)' }}
          />
        )}
        {/* Controles de capa — base do background, visiveis apenas para Master ao passar o mouse */}
        {isMaster && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 opacity-0 pointer-events-none group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto transition-opacity">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/90 hover:bg-white text-foreground px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors disabled:opacity-60"
              title={headerCover ? 'Trocar imagem de fundo' : 'Personalizar capa'}
            >
              {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{headerCover ? 'Trocar capa' : 'Personalizar capa'}</span>
            </button>
            {headerCover && (
              <button
                type="button"
                onClick={handleCoverRemove}
                disabled={uploadingCover}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/90 hover:bg-white text-rose-600 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors disabled:opacity-60"
                title="Remover capa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleCoverUpload(file)
                e.target.value = ''
              }}
            />
          </div>
        )}
      <div className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg" style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}>
              <FileText className="h-10 w-10" style={{ color: MODULE_COLOR }} />
            </div>
            <div>
              <h1 className="text-xl font-semibold uppercase">{orc.cliente?.razaoSocial || 'Sem cliente'}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                #{String(orc.numero).padStart(4, '0')}
                {orc.cliente?.documento && (<>&nbsp;&nbsp;|&nbsp;&nbsp;{masks.cpfCnpj(orc.cliente.documento)}</>)}
                &nbsp;&nbsp;|&nbsp;&nbsp;Criado em: {new Date(orc.createdAt).toLocaleDateString('pt-BR')}, {new Date(orc.createdAt).toLocaleTimeString('pt-BR')}
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <StatusBadge status={orc.status} />
                {orc.tipo && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-3 py-1 text-xs font-medium uppercase border border-slate-200 dark:border-slate-700">
                    {orc.tipo}
                  </span>
                )}
                {orc.paralizado && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-xs font-medium uppercase">
                    <Pause className="h-3 w-3" /> Paralizado
                  </span>
                )}
                {orc.arquivado && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 px-3 py-1 text-xs font-medium uppercase">
                    Arquivado
                  </span>
                )}
                {(orc.reaberturasCount ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 text-xs font-medium uppercase border border-amber-200 dark:border-amber-900/40"
                    title={`Este orçamento já foi reaberto ${orc.reaberturasCount}x. Histórico disponível na timeline.`}
                  >
                    <RotateCcw className="h-3 w-3" /> Reaberto {orc.reaberturasCount}×
                  </span>
                )}
                {pesquisaResumo?.respondida && (
                  <button
                    type="button"
                    onClick={() => setPesquisaSheet(true)}
                    title="O cliente respondeu a pesquisa de satisfação — clique para ver"
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase border transition-colors hover:brightness-105"
                    style={{ color: MODULE_COLOR, borderColor: `color-mix(in srgb, ${MODULE_COLOR} 35%, transparent)`, backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 12%, transparent)` }}
                  >
                    <Star className="h-3 w-3" /> Pesquisa respondida
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {autoSaveStatus !== 'idle' && (
              <span className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md transition-opacity',
                autoSaveStatus === 'saving' && 'text-muted-foreground bg-muted/60',
                autoSaveStatus === 'saved' && 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
                autoSaveStatus === 'error' && 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20',
              )}>
                {autoSaveStatus === 'saving' && (<><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</>)}
                {autoSaveStatus === 'saved' && (<><CheckCircle2 className="h-3 w-3" /> Salvo</>)}
                {autoSaveStatus === 'error' && (<><AlertTriangle className="h-3 w-3" /> Falha ao salvar</>)}
              </span>
            )}
            {/* ── Botões contextuais de workflow (transição forward + ações destrutivas) ── */}
            {/* NOVO/A_ENVIAR → ENVIADO (abre modal de envio) — bloqueia se não houver itens */}
            {(orc.status === 'NOVO' || orc.status === 'A_ENVIAR') && canEnviar && (() => {
              const semItens = (orc.itens?.length ?? 0) === 0
              return (
                <Button
                  size="sm"
                  style={{ backgroundColor: semItens ? undefined : MODULE_COLOR }}
                  className="text-white gap-1.5"
                  onClick={abrirEnvio}
                  disabled={semItens}
                  title={semItens ? 'Adicione ao menos um item antes de enviar' : undefined}
                >
                  <Send className="h-4 w-4" /> Enviar
                </Button>
              )
            })()}
            {/* ENVIADO → APROVADO (com modal de envio para reenvio se cliente quiser ver) ou Reprovar */}
            {orc.status === 'ENVIADO' && (
              <>
                {canAprovar && (
                  <Button size="sm" variant="success" className="gap-1.5" onClick={() => handleStatusAction('APROVADO', 'Orçamento aprovado')}>
                    <ThumbsUp className="h-4 w-4" /> Aprovar
                  </Button>
                )}
                {canEncerrar && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => handleStatusActionConfirm({
                    novoStatus: 'ENCERRADO',
                    title: 'Reprovar orçamento?',
                    text: 'O cliente recusou a proposta. O orçamento será encerrado e marcado como reprovado.',
                    confirmText: 'Reprovar',
                    successMsg: 'Orçamento reprovado',
                  })}>
                    <ThumbsDown className="h-4 w-4" /> Reprovar
                  </Button>
                )}
              </>
            )}
            {/* APROVADO → LIBERADO ou Cancelar administrativamente */}
            {orc.status === 'APROVADO' && (
              <>
                {canLiberar && (
                  <Button size="sm" variant="success" className="gap-1.5" onClick={() => handleStatusAction('LIBERADO', 'Orçamento liberado para execução')}>
                    <DollarSign className="h-4 w-4" /> Liberar
                  </Button>
                )}
                {canEncerrar && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => handleStatusActionConfirm({
                    novoStatus: 'ENCERRADO',
                    title: 'Cancelar orçamento aprovado?',
                    text: 'Cancelamento administrativo após aprovação. Esta ação não pode ser desfeita pelo fluxo normal — apenas via Reabrir orçamento.',
                    confirmText: 'Cancelar',
                    successMsg: 'Orçamento cancelado',
                  })}>
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                )}
              </>
            )}
            {/* LIBERADO → FINALIZADO */}
            {orc.status === 'LIBERADO' && canEncerrar && (
              <Button size="sm" variant="success" className="gap-1.5" onClick={() => handleStatusAction('FINALIZADO', 'Orçamento finalizado')}>
                <CheckCircle2 className="h-4 w-4" /> Finalizar
              </Button>
            )}
            {/* FINALIZADO → ENCERRADO */}
            {orc.status === 'FINALIZADO' && canEncerrar && (
              <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={() => handleStatusActionConfirm({
                novoStatus: 'ENCERRADO',
                title: 'Encerrar orçamento?',
                text: 'O orçamento será arquivado no fluxo. O ciclo está completo.',
                confirmText: 'Encerrar',
                successMsg: 'Orçamento encerrado',
                icon: 'question',
              })}>
                <Archive className="h-4 w-4" /> Encerrar
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" title="Mais opções" className="bg-white dark:bg-card hover:bg-white/90 dark:hover:bg-card/90">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={copiarLinkPublico}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Copiar link público
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/orcamentos/${id}/imprimir`)}>
                  <Printer className="h-4 w-4 mr-2" /> Imprimir
                </DropdownMenuItem>
                {orc.paralizado ? (
                  canRetomar && (
                    <DropdownMenuItem onClick={handleRetomar}>
                      <Play className="h-4 w-4 mr-2 text-emerald-500" /> Retomar orçamento
                    </DropdownMenuItem>
                  )
                ) : (
                  canParalizar && (
                    <DropdownMenuItem onClick={() => setParalizarModal(true)}>
                      <Pause className="h-4 w-4 mr-2 text-amber-500" /> Paralizar
                    </DropdownMenuItem>
                  )
                )}
                {orc.status !== 'NOVO' && canReabrir && (
                  <DropdownMenuItem onClick={() => { setReabrirMotivo(''); setReabrirStatus(reabrirStatusOptions[0] || 'NOVO'); setReabrirModal(true) }}>
                    <RotateCcw className="h-4 w-4 mr-2 text-blue-500" /> Reabrir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon-sm"
              title="Assistente de proposta (IA)"
              onClick={() => setIaOpen(true)}
              className="bg-white dark:bg-card hover:bg-white/90 dark:hover:bg-card/90"
            >
              <Sparkles className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            </Button>
            {canEnviarPesquisa && (
              <Button
                variant="outline"
                size="icon-sm"
                title="Pesquisa de satisfação"
                onClick={abrirEnviarPesquisa}
                className="bg-white dark:bg-card hover:bg-white/90 dark:hover:bg-card/90"
              >
                <Star className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              </Button>
            )}
            <BackButton href="/orcamentos" />
          </div>
        </div>
      </div>

      {/* Tabs principais (estilo pills) — dentro do mesmo wrapper de imagem.
          Classes !-prefixadas vencem as regras globais de [role="tablist"] do globals.css. */}
      <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
        <SlidingTabsList activeValue={activeTab} className="min-w-max !shadow-sm !border !border-b !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit">
          <TabsTrigger value="detalhes" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-rose-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-rose-400 gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Detalhes
          </TabsTrigger>
          <TabsTrigger value="mensagens" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-rose-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-rose-400 gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Mensagens
            {orc.mensagens.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1.5 h-4 px-1.5">{orc.mensagens.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="timeline" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-rose-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-rose-400 gap-1.5">
            <History className="h-3.5 w-3.5" /> Timeline
          </TabsTrigger>
          {(historicoCliente.length > 0 || temLegado) && (
            <TabsTrigger value="historico" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-rose-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-rose-400 gap-1.5">
              <Files className="h-3.5 w-3.5" /> Outros orçamentos
            </TabsTrigger>
          )}
        </SlidingTabsList>
      </div>
      </div>
      {/* /wrapper imagem */}

      {/* Banner de "orcamento congelado" — exibido quando status >= APROVADO.
          Edicoes sao bloqueadas; usuario deve duplicar para uma copia em NOVO. */}
      {isLocked && (
        <Card className="relative overflow-hidden border-slate-200/80 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/40 dark:to-slate-900/10 dark:border-slate-700/40 shadow-sm mt-5">
          {/* Faixa lateral colorida (cor do modulo) marcando o estado especial */}
          <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: MODULE_COLOR }} />
          <div className="flex items-center gap-4 p-4 pl-5">
            {/* Icone em circulo destacado */}
            <div
              className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 shadow-sm"
              style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 8%, transparent)` }}
            >
              <Lock className="h-5 w-5" style={{ color: MODULE_COLOR }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-foreground">Orçamento congelado para edição</h4>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{ backgroundColor: STATUS_COLORS[orc.status] || '#94a3b8' }}
                >
                  {STATUS_LABELS[orc.status] || orc.status}
                </span>
              </div>
              <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
                Para fazer ajustes, duplique este orçamento. A cópia voltará ao status <strong className="text-foreground/80">Novo</strong> e poderá ser editada livremente. Este permanecerá intacto e preservado para auditoria.
              </p>
            </div>

            {/* CTA primario — filled com cor do modulo, mais convidativo */}
            {canDuplicar && (
              <Button
                size="sm"
                className="gap-1.5 text-white shadow-sm shrink-0"
                style={{ backgroundColor: MODULE_COLOR }}
                onClick={handleDuplicar}
              >
                <CopyIcon className="h-3.5 w-3.5" />
                Duplicar para editar
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Banner de paralizacao */}
      {orc.paralizado && (
        <Card className="p-3 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30 mt-5">
          <div className="flex items-start gap-3">
            <Pause className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Orçamento Paralizado</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{orc.paralizadoMotivo}</p>
              {orc.paralizadoEm && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Desde {new Date(orc.paralizadoEm).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            {canRetomar && (
              <Button size="xs" variant="outline" className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-100" onClick={handleRetomar}>
                <Play className="h-3 w-3" /> Retomar
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Layout 2 colunas: principal + sidebar */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {/* Resposta do cliente pelo link público (nome/CPF/observação/quando) */}
          {orc.decisaoTipo && (
            <Card className={cn('mb-5 border', orc.decisaoTipo === 'APROVADO'
              ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40'
              : 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/40')}>
              <CardHeader className="border-b border-border/40 px-5 py-3 flex flex-row items-center gap-2">
                {orc.decisaoTipo === 'APROVADO'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  : <ThumbsDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
                <h3 className="text-sm font-semibold flex-1">Resposta do cliente pelo link</h3>
                <Badge className={cn('text-[10px]', orc.decisaoTipo === 'APROVADO'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300')}>
                  {orc.decisaoTipo === 'APROVADO' ? 'Aprovado' : 'Recusado'}
                </Badge>
              </CardHeader>
              <CardContent className="px-5 py-4 space-y-3 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Nome</p>
                    <p className="text-foreground font-medium">{orc.decisaoNome || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">CPF</p>
                    <p className="text-foreground font-medium tabular-nums">{orc.decisaoCpf ? orc.decisaoCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Data / hora</p>
                    <p className="text-foreground font-medium tabular-nums">{orc.decisaoEm ? new Date(orc.decisaoEm).toLocaleString('pt-BR') : '—'}</p>
                  </div>
                </div>
                {orc.decisaoObs && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Observação do cliente</p>
                    <p className="text-foreground bg-background/60 rounded-md border border-border/60 p-2.5 whitespace-pre-wrap">{orc.decisaoObs}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {/* === TAB: DETALHES (Card com pills verticais) === */}
          <TabsContent value="detalhes" className="mt-0">
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h3 className="text-sm font-semibold flex-1">Detalhes do Orçamento</h3>
              </CardHeader>
              <div className="flex min-h-[450px]">
                {/* Pills laterais */}
                <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
                  <div className="space-y-1">
                    {([
                      { key: 'dados', icon: FileText, label: 'Dados Gerais' },
                      { key: 'itens', icon: Package, label: 'Itens', badge: orc.itens.length },
                      { key: 'desconto', icon: DollarSign, label: 'Desconto e Pagamento' },
                      { key: 'textos', icon: Type, label: 'Textos' },
                    ] as Array<{ key: PillKey; icon: typeof FileText; label: string; badge?: number }>).map(p => {
                      const Icon = p.icon
                      const active = activePill === p.key
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setActivePill(p.key)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                            active ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-white hover:text-foreground'
                          )}
                          style={active ? { backgroundColor: MODULE_COLOR } : undefined}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1">{p.label}</span>
                          {p.badge !== undefined && p.badge > 0 && (
                            <span className={cn(
                              'inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[18px] h-[18px] px-1',
                              active ? 'bg-white/30 text-white' : 'bg-muted text-foreground',
                            )}>
                              {p.badge}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Conteudo — quando o orcamento esta locked (APROVADO+), aplica
                    data-locked="true" que bloqueia os controles via CSS (em
                    globals.css). Campos que devem permanecer editaveis usam
                    `data-editable` no wrapper para reabilitar a interacao.
                    Pills laterais ficam fora deste container, sempre navegaveis. */}
                <div
                  key={activePill}
                  data-locked={isLocked || undefined}
                  className="flex-1 min-w-0 p-5"
                  style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
                >
                  {activePill === 'dados' && (
                    <div className="-m-5">
                      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                        <h4 className="text-[13px] font-semibold text-foreground">Dados Gerais</h4>
                      </div>
                      <div className="p-5 grid grid-cols-12 gap-3">
                        {/* Linha 1: Cliente (8) + Validade (4) — identifica o "quê" e o prazo */}
                        <div className="col-span-12 sm:col-span-8 space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">Cliente <span className="text-rose-500">*</span></Label>
                          <ClienteCombobox
                            clientes={clientes}
                            value={formClienteId}
                            onSelect={(id) => setFormClienteId(id)}
                            placeholder="Selecione um cliente"
                            onCreate={async (nome) => {
                              try {
                                const novo = await (trpc.orcamento as any).criarClienteRapido.mutate({ nome }) as { id: string; razaoSocial: string; documento?: string | null } | null
                                if (!novo) { alerts.error('Erro', 'Não foi possível cadastrar o cliente.'); return null }
                                // Insere na lista (sem duplicar) e seleciona.
                                setClientes(prev => prev.some(c => c.id === novo.id) ? prev : [...prev, { id: novo.id, razaoSocial: novo.razaoSocial, documento: novo.documento ?? null }])
                                return novo.id
                              } catch (e) {
                                alerts.error('Erro ao cadastrar cliente', (e as Error).message)
                                return null
                              }
                            }}
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-4 space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">Validade</Label>
                          <div className="flex">
                            <Input type="number" value={formValidade} onChange={e => setFormValidade(e.target.value)} className="h-9 text-sm rounded-r-none" min="1" placeholder="90" />
                            <span className="inline-flex items-center px-2 h-9 border border-l-0 border-input bg-muted text-xs text-muted-foreground rounded-r-md">dias</span>
                          </div>
                        </div>

                        {/* Linha 2: Solicitante (6) + Contatos (6) — pessoas envolvidas */}
                        <div className="col-span-12 sm:col-span-6 space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">Solicitante <span className="text-rose-500">*</span></Label>
                          <UserCombobox users={usuarios} value={(orc as any)?.solicitante?.id ?? (orc as any)?.solicitanteId ?? ''} onSelect={(uid) => handleSelectPessoa('solicitante', uid)} disabled={!canChangeSolicitante} placeholder="Selecione um usuário" />
                        </div>
                        <div className="col-span-12 sm:col-span-6 space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">Contatos</Label>
                          <Input value={formContatos} onChange={e => setFormContatos(e.target.value)} className="h-9 text-sm" placeholder="Nome do(s) contato(s)" />
                        </div>

                        {/* Linha 3: E-mails (full-width) — campo expansível com chips */}
                        <div className="col-span-12 space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">E-mails dos Contatos</Label>
                          <EmailChipsInput
                            value={formEmails}
                            onChange={setFormEmails}
                            suggestions={emailSuggestions}
                            placeholder="Digite e pressione Enter, vírgula ou espaço para adicionar"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activePill === 'itens' && (
                    <div className="-m-5">
                      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                        <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                          Itens do Orçamento
                          {orc.itens.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{orc.itens.length}</Badge>
                          )}
                        </h4>
                        {canManageCatalogo && (
                          <Button variant="outline" size="xs" className="gap-1" onClick={() => router.push('/orcamentos/parametros')} title="Cadastrar/editar itens do catálogo">
                            <Plus className="h-3.5 w-3.5" /> Catálogo
                          </Button>
                        )}
                      </div>
                      {canManageItens && (
                        <div className="border-b border-border/40 bg-muted/20 px-4 py-3">
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="space-y-1.5">
                              <Label className="text-[13px] font-semibold text-foreground">Tipo <span className="text-rose-500">*</span></Label>
                              <Select value={itemTipo || '__none__'} onValueChange={v => handleChangeItemTipo(v === '__none__' ? '' : v)}>
                                <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Selecione...</SelectItem>
                                  <SelectItem value="SERVICO">Serviço</SelectItem>
                                  <SelectItem value="TAXA">Taxa</SelectItem>
                                  <SelectItem value="DESPESA">Despesa</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5 flex-1 min-w-[200px]">
                              <Label className="text-[13px] font-semibold text-foreground">Descrição <span className="text-rose-500">*</span></Label>
                              <CatalogoCombobox catalogo={catalogo} tipo={itemTipo} selectedId={itemCatalogoId} onSelect={handleSelecionarDescricao} disabled={!itemTipo} />
                            </div>
                            {(() => {
                              const cat = catalogo.find(c => c.id === itemCatalogoId)
                              if (!cat?.textos?.length) return null
                              return (
                                <div className="space-y-1.5 min-w-[180px]">
                                  <Label className="text-[13px] font-semibold text-foreground">Variação</Label>
                                  <Select value={itemTextoId || '__none__'} onValueChange={v => handleSelecionarTexto(v === '__none__' ? '' : v)}>
                                    <SelectTrigger className="h-9 w-[200px] text-sm"><SelectValue placeholder="Selecione a variação" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Nenhuma</SelectItem>
                                      {cat.textos.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.titulo}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )
                            })()}
                            <div className="space-y-1.5">
                              <Label className="text-[13px] font-semibold text-foreground">Qtde</Label>
                              <Input type="number" value={itemQtde} onChange={e => setItemQtde(e.target.value)} className="h-9 w-[80px] text-sm" min="1" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[13px] font-semibold text-foreground">Valor R$</Label>
                              <Input type="number" value={itemValor} onChange={e => setItemValor(e.target.value)} className="h-9 w-[110px] text-sm" step="0.01" min="0" placeholder="0,00" />
                            </div>
                            <Button variant="success" size="sm" onClick={handleAddItem} disabled={addingItem || !itemTipo || !itemDescricao.trim()} className="gap-1.5 h-9">
                              {addingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                              Incluir Item
                            </Button>
                          </div>
                        </div>
                      )}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">#</TableHead>
                            <TableHead className="w-[90px]">Tipo</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="w-[65px] text-center">Qtde</TableHead>
                            <TableHead className="w-[100px] text-right">R$ Unit</TableHead>
                            <TableHead className="w-[110px] text-right">R$ Total</TableHead>
                            <TableHead className="w-[100px] text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!orc.itens.length ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-6 text-xs">
                              <div className="flex items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30 px-4 py-3 text-amber-800 dark:text-amber-300">
                                <AlertTriangle className="h-4 w-4" />
                                <span className="font-medium">Atenção!</span>
                                <span>Não é possível enviar orçamentos sem itens adicionados.</span>
                              </div>
                            </TableCell></TableRow>
                          ) : orc.itens.map((item, idx) => (
                            editingItemId === item.id ? (
                              <TableRow key={item.id} className="bg-sky-50/50 dark:bg-sky-900/10">
                                <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell>
                                  <Select value={editTipo} onValueChange={v => { setEditTipo(v); setEditCatalogoId(''); setEditTextoId('') }}>
                                    <SelectTrigger className="h-7 text-[11px] w-[85px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="SERVICO">Serviço</SelectItem>
                                      <SelectItem value="TAXA">Taxa</SelectItem>
                                      <SelectItem value="DESPESA">Despesa</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  {/* Busca no catálogo — mesma da inclusão (#HLP0088). currentLabel
                                      preserva a descrição atual quando não há item de catálogo casado. */}
                                  <CatalogoCombobox
                                    catalogo={catalogo}
                                    tipo={editTipo}
                                    selectedId={editCatalogoId}
                                    currentLabel={editDescricao}
                                    onSelect={handleSelecionarDescricaoEdit}
                                    disabled={!editTipo}
                                  />
                                  {(() => {
                                    const cat = catalogo.find(c => c.id === editCatalogoId)
                                    if (!cat?.textos?.length) return null
                                    return (
                                      <Select value={editTextoId || '__none__'} onValueChange={v => handleSelecionarTextoEdit(v === '__none__' ? '' : v)}>
                                        <SelectTrigger className="h-7 text-[11px] mt-1"><SelectValue placeholder="Variação" /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__none__">Nenhuma variação</SelectItem>
                                          {cat.textos.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.titulo}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )
                                  })()}
                                </TableCell>
                                <TableCell>
                                  <Input type="number" value={editQtde} onChange={e => setEditQtde(e.target.value)} className="h-7 w-[55px] text-xs text-center" min="1" />
                                </TableCell>
                                <TableCell>
                                  <Input type="number" value={editValor} onChange={e => setEditValor(e.target.value)} className="h-7 w-[90px] text-xs text-right" step="0.01" />
                                </TableCell>
                                <TableCell className="text-right text-xs font-medium whitespace-nowrap">
                                  {formatCurrency((parseFloat(editQtde) || 0) * (parseFloat(editValor) || 0))}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="icon-sm" onClick={handleSaveItem} title="Salvar"><Check className="h-3.5 w-3.5 text-emerald-600" /></Button>
                                    <Button variant="ghost" size="icon-sm" onClick={() => setEditingItemId(null)} title="Cancelar"><X className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : (
                              <TableRow key={item.id} className="hover:bg-muted/40">
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{idx + 1}</TableCell>
                                <TableCell className="whitespace-nowrap"><TipoBadge tipo={item.tipo} /></TableCell>
                                <TableCell className="text-sm whitespace-nowrap cursor-pointer" onClick={() => startEditItem(item)}>{item.descricao}</TableCell>
                                <TableCell className="text-center text-xs whitespace-nowrap">{item.quantidade}</TableCell>
                                <TableCell className="text-right text-xs whitespace-nowrap">{formatCurrency(item.valorUnitario)}</TableCell>
                                <TableCell className="text-right text-sm font-medium whitespace-nowrap">{formatCurrency(item.valorTotal || item.quantidade * item.valorUnitario)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  <div className="flex justify-end gap-1">
                                    {item.catalogoId && (
                                      <Button variant="ghost" size="icon-sm" onClick={() => abrirTextoPadrao(item)} title="Texto padrão"><Type className="h-3.5 w-3.5" /></Button>
                                    )}
                                    {canManageItens && (
                                      <>
                                        <Button variant="ghost" size="icon-sm" onClick={() => startEditItem(item)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                                        <Button variant="ghost" size="icon-sm" onClick={() => handleRemoveItem(item.id)} title="Excluir"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {activePill === 'desconto' && (
                    <div className="-m-5">
                      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                        <h4 className="text-[13px] font-semibold text-foreground">Desconto e Pagamento</h4>
                      </div>
                      <div className="p-5 grid grid-cols-12 gap-3">
                        <div className="col-span-12 sm:col-span-4 space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">Desconto %</Label>
                          <Input type="number" value={formDescontoPercent} onChange={e => setFormDescontoPercent(e.target.value)} className="h-9 text-sm" step="0.01" min="0" max="100" placeholder="0" />
                        </div>
                        <div className="col-span-12 sm:col-span-4 space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">Desconto R$</Label>
                          <Input type="number" value={formDesconto} onChange={e => setFormDesconto(e.target.value)} className="h-9 text-sm" step="0.01" min="0" placeholder="0,00" />
                        </div>
                        <div className="col-span-12 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-[13px] font-semibold text-foreground">Forma de Pagamento</Label>
                            {canManageCatalogo && (
                              <button
                                type="button"
                                onClick={() => { setFormasModal(true); loadFormasPagamento() }}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3 w-3" /> Gerenciar
                              </button>
                            )}
                          </div>
                          <Select value={formPagamento || '__none__'} onValueChange={v => setFormPagamento(v === '__none__' ? '' : v)}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione a forma de pagamento" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Não informada —</SelectItem>
                              {/* Valor histórico fora da lista atual — preservado pra não perder dados legados */}
                              {formPagamento && !formasPagamento.some(f => f.valor === formPagamento) && (
                                <SelectItem value={formPagamento}>{formPagamento}</SelectItem>
                              )}
                              {formasPagamento.map(f => (
                                <SelectItem key={f.id} value={f.valor}>{f.valor}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {activePill === 'textos' && (
                    <div className="-m-5">
                      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                        <h4 className="text-[13px] font-semibold text-foreground">Textos</h4>
                      </div>
                      <div className="p-5 space-y-4">
                        {/* `data-editable` re-habilita interacao mesmo com data-locked
                            no container pai. Texto Interno e anotacao da equipe e
                            pode ser editado livremente em orcamentos congelados. */}
                        <div data-editable className="space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">Texto Interno</Label>
                          <RichEditor value={formTextoInterno} onChange={v => setFormTextoInterno(v)} placeholder="Texto interno (visível apenas pela equipe)..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-semibold text-foreground">Texto para o Cliente</Label>
                          <RichEditor value={formTextoCliente} onChange={v => setFormTextoCliente(v)} placeholder="Texto que será exibido no orçamento do cliente..." />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* === TAB: TIMELINE === */}
          <TabsContent value="timeline" className="mt-0">
          {/* Timeline de Eventos — feed vertical alimentado por TODOS os eventos
              do orçamento (orc.eventos), com ator (quem moveu) + data/hora. */}
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
              <History className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h3 className="text-sm font-semibold flex-1">Timeline de Eventos</h3>
              {orc.eventos?.length ? (
                <Badge variant="secondary" className="text-[10px]">{orc.eventos.length}</Badge>
              ) : null}
            </CardHeader>

            {/* Barra de ações contextuais (avança o status conforme permissões) */}
            {(() => {
              const acoes: React.ReactNode[] = []
              if ((orc.status === 'NOVO' || orc.status === 'A_ENVIAR') && (orc.itens?.length ?? 0) > 0 && canEnviar) {
                acoes.push(
                  <Button key="enviar" size="xs" variant="outline" className="gap-1" onClick={abrirEnvio}>
                    <Send className="h-3 w-3" /> Enviar
                  </Button>,
                )
              }
              if (orc.status === 'ENVIADO' && canAprovar) {
                acoes.push(
                  <Button key="aprovar" size="xs" variant="success" className="gap-1" onClick={() => handleStatusAction('APROVADO', 'Orcamento aprovado')}>
                    <ThumbsUp className="h-3 w-3" /> Aprovar
                  </Button>,
                  <Button key="reprovar" size="xs" variant="destructive" className="gap-1" onClick={() => handleStatusAction('ENCERRADO', 'Orcamento reprovado')}>
                    <ThumbsDown className="h-3 w-3" /> Reprovar
                  </Button>,
                )
              }
              if (orc.status === 'APROVADO' && canLiberar) {
                acoes.push(
                  <Button key="liberar" size="xs" variant="outline" className="gap-1" onClick={() => handleStatusAction('LIBERADO', 'Orcamento liberado')}>
                    <DollarSign className="h-3 w-3" /> Liberar
                  </Button>,
                )
              }
              if (orc.status === 'LIBERADO' && canEncerrar) {
                acoes.push(
                  <Button key="finalizar" size="xs" variant="outline" className="gap-1" onClick={() => handleStatusAction('FINALIZADO', 'Orcamento finalizado')}>
                    <CheckCircle2 className="h-3 w-3" /> Finalizar
                  </Button>,
                )
              }
              if (orc.status === 'FINALIZADO' && canEncerrar) {
                acoes.push(
                  <Button key="encerrar" size="xs" variant="outline" className="gap-1" onClick={() => handleStatusAction('ENCERRADO', 'Orcamento encerrado')}>
                    <CheckCircle2 className="h-3 w-3" /> Encerrar
                  </Button>,
                )
              }
              if (acoes.length === 0) return null
              return (
                <div className="px-5 py-3 border-b border-border/60 bg-muted/20 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground mr-1">Próxima ação:</span>
                  {acoes}
                </div>
              )
            })()}

            <CardContent className="p-0">
              {!orc.eventos?.length ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground">Nenhum evento registrado ainda</div>
              ) : (
                <div className="max-h-[640px] overflow-y-auto px-2 sm:px-6 py-8">
                  {/* Timeline central: espinha colorida no meio + eventos alternando
                      lados (zig-zag), cada nó com dot/conector na cor do tipo. */}
                  <div className="relative mx-auto w-full max-w-3xl">
                    {orc.eventos.map((ev, i) => {
                      const meta = eventMeta(ev.tipo)
                      const right = i % 2 === 0
                      const isLast = i === orc.eventos.length - 1
                      const d = new Date(ev.createdAt)
                      const dia = String(d.getDate()).padStart(2, '0')
                      const mm = String(d.getMonth() + 1).padStart(2, '0')
                      const ano = d.getFullYear()
                      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      const bloco = (
                        <div className={cn('min-w-0', right ? 'text-left' : 'text-right')}>
                          <div className={cn('flex items-baseline gap-1.5', !right && 'justify-end')} style={{ color: meta.color }}>
                            <span className="text-2xl font-extrabold leading-none tabular-nums">{dia}/{mm}</span>
                            <span className="text-[11px] font-semibold opacity-80 tabular-nums">{ano}</span>
                          </div>
                          <div className="text-[12px] font-bold mt-1" style={{ color: meta.color }}>{meta.label}</div>
                          <p className="text-xs text-foreground/90 mt-1 leading-snug">{ev.descricao}</p>
                          <div className={cn('flex items-center gap-1.5 mt-2', !right && 'flex-row-reverse')}>
                            {ev.usuario?.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolveAssetUrl(ev.usuario.image)} alt={ev.usuario.name} className="h-10 w-10 rounded-full object-cover shrink-0" />
                            ) : ev.usuario?.name ? (
                              <span className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
                                {iniciaisNome(ev.usuario.name)}
                              </span>
                            ) : null}
                            <span className="text-[11px] font-medium text-foreground">{ev.usuario?.name ?? 'Sistema'}</span>
                            <span className="text-muted-foreground/60">·</span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{hora}</span>
                          </div>
                        </div>
                      )
                      return (
                        <div key={ev.id} className="relative grid grid-cols-[1fr_24px_1fr]">
                          {/* Coluna esquerda (eventos de índice ímpar) */}
                          <div className={cn('relative pb-8', right ? '' : 'pr-5')}>
                            {!right && (
                              <>
                                <div className="absolute right-0 top-[7px] h-[2px] w-5" style={{ backgroundColor: meta.color }} />
                                {bloco}
                              </>
                            )}
                          </div>
                          {/* Espinha central + nó */}
                          <div className="relative flex justify-center">
                            <div className={cn('absolute top-0 w-[3px]', isLast ? 'h-4' : 'bottom-0')} style={{ backgroundColor: meta.color }} />
                            <div className="absolute top-0.5 h-3.5 w-3.5 rounded-full border-2 border-background z-10" style={{ backgroundColor: meta.color }} />
                          </div>
                          {/* Coluna direita (eventos de índice par) */}
                          <div className={cn('relative pb-8', right ? 'pl-5' : '')}>
                            {right && (
                              <>
                                <div className="absolute left-0 top-[7px] h-[2px] w-5" style={{ backgroundColor: meta.color }} />
                                {bloco}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </TabsContent>

          {/* === TAB: HISTORICO (outros orcamentos + eventos) === */}
          <TabsContent value="historico" className="mt-0 space-y-5">
            {/* Histórico do sistema legado (só leitura) */}
            <OrcamentosLegadoSection clienteId={orc.cliente?.id} />
            {historicoCliente.length > 0 && (
              <Card>
                <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
                  <FileText className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                  <h3 className="text-sm font-semibold flex-1">Outros orçamentos do cliente</h3>
                  <Badge variant="secondary" className="text-[10px]">{historicoCliente.length}</Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[280px] overflow-y-auto">
                    {historicoCliente.map(o => {
                      const tipoLabel = o.tipo === 'SERVICO_MENSAL' ? 'Serviço Mensal' : o.tipo === 'SERVICO_EXTRA' ? 'Serviço Extra' : null
                      const servicoDesc = o.itens?.[0]?.descricao ?? null
                      return (
                        <button
                          key={o.id}
                          onClick={() => router.push(`/orcamentos/${o.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 border-b border-border/40 last:border-b-0 text-left transition-colors"
                        >
                          <span className="font-mono text-xs font-medium shrink-0">#{o.numero}</span>
                          <StatusBadge status={o.status} />
                          <div className="flex-1 min-w-0 flex flex-col">
                            {servicoDesc ? (
                              <span className="text-xs text-foreground truncate" title={servicoDesc}>{servicoDesc}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Sem serviço</span>
                            )}
                            <span className="text-[10px] text-muted-foreground truncate">
                              {tipoLabel ? `${tipoLabel} · ` : ''}{new Date(o.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <span className="text-xs font-medium shrink-0">{formatCurrency(Number(o.totalGeral))}</span>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* === TAB: MENSAGENS === */}
          <TabsContent value="mensagens" className="mt-0">
            <MensagensCard orcamentoId={id} mensagens={orc.mensagens} usuarios={usuarios} onChange={fetchOrc} />
          </TabsContent>

        </div>

        {/* ============================================================ */}
        {/* SIDEBAR direita — resumo financeiro + datas + arquivos        */}
        {/* ============================================================ */}
        <div className="space-y-5">
          {/* Resumo Financeiro */}
          <Card className="p-5">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              Resumo Financeiro
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Serviços</span>
                <span className="font-medium">{formatCurrency(totalServicos)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Taxas</span>
                <span className="font-medium">{formatCurrency(totalTaxas)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Despesas</span>
                <span className="font-medium">{formatCurrency(totalDespesas)}</span>
              </div>
              <div className="border-t border-border/60 pt-2 mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Desconto ({descontoPercentCalc.toFixed(1)}%)</span>
                <span className="font-medium text-orange-600 dark:text-orange-400">- {formatCurrency(descontoAplicado)}</span>
              </div>
              <div className="border-t border-border/60 pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Total Geral</span>
                <span className="text-base font-bold" style={{ color: MODULE_COLOR }}>{formatCurrency(totalGeral)}</span>
              </div>
            </div>
          </Card>

          {/* Arquivos — upload, lista e remocao */}
          <Card
            className={cn('p-5 transition-all', dragActive && 'ring-2 ring-rose-300 bg-rose-50/30 dark:bg-rose-900/10')}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Paperclip className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                Arquivos
                {(orc.arquivos?.length ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{orc.arquivos.length}</Badge>
                )}
              </h4>
              <Button type="button" variant="outline" size="sm" onClick={handleAddArquivo} className="gap-1 h-7 text-xs">
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={async e => {
                if (e.target.files) await handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
            {!orc.arquivos?.length && uploadingFiles.length === 0 ? (
              <button
                type="button"
                onClick={handleAddArquivo}
                className={cn(
                  'w-full px-3 py-5 text-center transition-all border-2 border-dashed rounded-md flex flex-col items-center gap-1.5',
                  dragActive
                    ? 'border-rose-400 bg-rose-50/40 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
                    : 'border-border/50 text-muted-foreground hover:border-rose-300 hover:bg-rose-50/20 dark:hover:bg-rose-900/10',
                )}
              >
                <Upload className="h-4 w-4" />
                <p className="text-[11px] font-medium">Arraste arquivos aqui</p>
                <p className="text-[10px] text-muted-foreground">ou clique para selecionar</p>
              </button>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto scrollbar-none">
                {orc.arquivos.map(arq => (
                  <div key={arq.id} className="flex items-center gap-2 text-xs group">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <a href={arq.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate block hover:underline font-medium" style={{ color: MODULE_COLOR }}>{arq.fileName}</a>
                      <span className="text-muted-foreground text-[10px]">{formatDate(arq.createdAt)}</span>
                    </div>
                    <button type="button" onClick={() => handleRemoveArquivo(arq.id)} className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {uploadingFiles.map(name => (
                  <div key={`uploading-${name}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span className="truncate flex-1">{name}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Datas Importantes — timeline vertical com marcadores coloridos por status.
              Cada item ocupa uma "celula" da timeline com dot + linha conectora. */}
          <Card className="p-5">
            <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <History className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              Datas Importantes
            </h4>
            {(() => {
              // Monta a lista de eventos cronologicos (somente os que aconteceram).
              // A ordem segue o fluxo natural do orcamento — Criado sempre primeiro,
              // depois Cancelado/Encerrado encerram a timeline (visualmente no fim).
              type TimelineEvent = { key: string; label: string; valor: string; dotColor: string; campo?: string }
              // Fallback: quando a coluna de data dedicada (dtX) não foi gravada,
              // deriva a data do evento de status correspondente na timeline
              // (orc.eventos). Pega a ocorrência mais recente daquele status.
              const dataDoStatus = (status: string): string | null => {
                const evs = (orc.eventos ?? []).filter((e: any) => e.tipo === 'status_change' && e.para === status)
                if (!evs.length) return null
                return evs.reduce((a: any, b: any) => (new Date(a.createdAt).getTime() >= new Date(b.createdAt).getTime() ? a : b)).createdAt
              }
              const dEnviado = orc.dtEnviado ?? dataDoStatus('ENVIADO')
              const dAprovado = orc.dtAprovado ?? dataDoStatus('APROVADO')
              const dLiberado = orc.dtLiberado ?? dataDoStatus('LIBERADO')
              const dFinalizado = orc.dtFinalizado ?? dataDoStatus('FINALIZADO')
              const dEncerrado = orc.dtEncerrado ?? dataDoStatus('ENCERRADO')
              const dCancelado = orc.dtCancelado ?? dataDoStatus('CANCELADO')
              const events: TimelineEvent[] = [
                { key: 'createdAt', label: 'Criado', valor: orc.createdAt, dotColor: STATUS_COLORS.NOVO || '#94a3b8' },
              ]
              if (dEnviado) events.push({ key: 'dtEnviado', label: 'Enviado', valor: dEnviado, dotColor: STATUS_COLORS.ENVIADO!, campo: 'dtEnviado' })
              if (dAprovado) events.push({ key: 'dtAprovado', label: 'Aprovado', valor: dAprovado, dotColor: STATUS_COLORS.APROVADO!, campo: 'dtAprovado' })
              if (dLiberado) events.push({ key: 'dtLiberado', label: 'Liberado', valor: dLiberado, dotColor: STATUS_COLORS.LIBERADO!, campo: 'dtLiberado' })
              if (dFinalizado) events.push({ key: 'dtFinalizado', label: 'Finalizado', valor: dFinalizado, dotColor: STATUS_COLORS.FINALIZADO!, campo: 'dtFinalizado' })
              if (dEncerrado) events.push({ key: 'dtEncerrado', label: 'Encerrado', valor: dEncerrado, dotColor: STATUS_COLORS.ENCERRADO!, campo: 'dtEncerrado' })
              if (dCancelado) events.push({ key: 'dtCancelado', label: 'Cancelado', valor: dCancelado, dotColor: '#ef4444', campo: 'dtCancelado' })

              return (
                <div className="flex flex-col">
                  {events.map((ev, i) => (
                    <TimelineDateRow
                      key={ev.key}
                      label={ev.label}
                      valor={ev.valor}
                      dotColor={ev.dotColor}
                      canEdit={!!ev.campo && canEditTimelineDates}
                      isLast={i === events.length - 1}
                      onSave={ev.campo ? (v) => handleEditarData(ev.campo!, v) : undefined}
                    />
                  ))}
                </div>
              )
            })()}
          </Card>
        </div>
      </div>
      </Tabs>

      {/* Painel lateral: Assistente de proposta (IA) — estilo drawer à direita */}
      <Sheet open={iaOpen} onOpenChange={setIaOpen}>
        <SheetContent side="right" size="lg" className="p-0">
          <SheetTitle className="sr-only">Assistente de proposta (IA)</SheetTitle>
          <OrcamentoIaSection
            orcamentoId={id}
            onAplicar={(html) => { setFormTextoCliente(html); setActiveTab('detalhes'); setIaOpen(false) }}
          />
        </SheetContent>
      </Sheet>

      {/* Sheet: resposta da pesquisa de satisfação */}
      <Sheet open={pesquisaSheet} onOpenChange={setPesquisaSheet}>
        <SheetContent side="right" size="md" className="p-0">
          <div className="flex items-center gap-2.5 border-b px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 14%, transparent)`, color: MODULE_COLOR }}>
              <Star className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-sm font-semibold leading-tight">Resposta da pesquisa</SheetTitle>
              <p className="text-xs text-muted-foreground leading-tight">
                {pesquisaResumo?.respondenteNome || 'Cliente'}
                {pesquisaResumo?.respondidaEm ? ` · ${new Date(pesquisaResumo.respondidaEm).toLocaleDateString('pt-BR')}` : ''}
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {(pesquisaResumo?.itens ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem itens.</p>}
            {(pesquisaResumo?.itens ?? []).map((it: any, i: number) => (
              <div key={i} className="space-y-1">
                <p className="text-[13px] font-medium">{it.enunciado}</p>
                <div className="text-sm text-muted-foreground">
                  {it.tipo === 'ESTRELAS' && (
                    <span className="inline-flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => <Star key={n} className={`h-4 w-4 ${it.valorNumero != null && n <= it.valorNumero ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />)}
                      <span className="ml-1.5">{it.valorNumero ?? '—'}/5</span>
                    </span>
                  )}
                  {it.tipo === 'NPS' && <span className="font-semibold text-foreground">{it.valorNumero ?? '—'}<span className="text-muted-foreground font-normal">/10</span></span>}
                  {it.tipo === 'SIM_NAO' && <span className="font-medium text-foreground">{it.valorBooleano === true ? 'Sim' : it.valorBooleano === false ? 'Não' : '—'}</span>}
                  {it.tipo === 'TEXTO' && <span className="whitespace-pre-wrap">{it.valorTexto || '—'}</span>}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal: enviar pesquisa de satisfação ao cliente */}
      <Dialog open={pesquisaEnviarModal} onOpenChange={setPesquisaEnviarModal}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={Star} color="rose">
            <DialogTitle className="text-[15px]">Pesquisa de satisfação</DialogTitle>
            <DialogDescription className="text-[11px]">Envie o link da pesquisa ao cliente por e-mail ou copie para enviar por outro canal.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Destinatários (e-mail)</label>
              <Input className="h-9 text-sm" value={pesquisaDest} onChange={e => setPesquisaDest(e.target.value)} placeholder="emails separados por vírgula" />
              <p className="text-[11px] text-muted-foreground">Deixe em branco para usar o e-mail do cliente.</p>
            </div>
            {pesquisaLink && (
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Link da pesquisa</label>
                <div className="flex gap-2">
                  <Input className="h-9 text-sm flex-1 font-mono text-[11px]" value={pesquisaLink} readOnly onFocus={e => e.currentTarget.select()} />
                  <Button variant="outline" size="sm" onClick={copiarLinkPesquisa} className="gap-1.5"><CopyIcon className="h-4 w-4" /> Copiar</Button>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPesquisaEnviarModal(false)} disabled={pesquisaBusy}>Fechar</Button>
            <Button onClick={enviarPesquisaEmail} disabled={pesquisaBusy} style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5">
              {pesquisaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar por e-mail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Gerenciar Formas de Pagamento (espelha o legado) */}
      <Dialog open={formasModal} onOpenChange={setFormasModal}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeaderIcon icon={DollarSign} color="emerald">
            <DialogTitle className="text-[15px]">Formas de Pagamento</DialogTitle>
            <DialogDescription className="text-[11px]">Gerencie as opções disponíveis no campo "Forma de Pagamento" dos orçamentos.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nova forma de pagamento..."
                value={novaForma}
                onChange={e => setNovaForma(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddForma() } }}
                className="h-9 text-sm flex-1"
              />
              <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={handleAddForma} disabled={!novaForma.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formasPagamento.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma forma de pagamento cadastrada</p>
            ) : (
              <div className="space-y-1 max-h-[340px] overflow-y-auto">
                {formasPagamento.map(f => (
                  <div key={f.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 group hover:bg-muted/30 transition-colors">
                    <span className="text-sm flex-1">{f.valor}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteForma(f.id, f.valor)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Modal de Envio */}
      <Dialog open={enviarModal} onOpenChange={setEnviarModal}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={Send} color="sky">
            <DialogTitle className="text-[15px]">Enviar orçamento ao cliente</DialogTitle>
            <DialogDescription className="text-[11px]">
              Um e-mail será enviado com o link público para o cliente revisar e aprovar a proposta.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <label className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={enviarNotificar} onChange={e => setEnviarNotificar(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--mod-comercial,#3b82f6)]" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">Notificar o cliente por e-mail</p>
                <p className="text-muted-foreground">{enviarNotificar ? 'O cliente receberá o e-mail com o link da proposta.' : 'O orçamento será marcado como Enviado, mas o cliente NÃO será notificado (envio por outro canal).'}</p>
              </div>
            </label>
            <div className={cn(!enviarNotificar && 'opacity-50 pointer-events-none')}>
              <Label className="text-[13px] font-semibold text-foreground">Destinatários <span className="text-rose-500">*</span></Label>
              <Input
                value={enviarDestinatarios}
                onChange={e => setEnviarDestinatarios(e.target.value)}
                placeholder="email1@dominio.com, email2@dominio.com"
                className="h-9 text-sm"
                disabled={!enviarNotificar}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Separe vários e-mails com vírgula ou ponto-e-vírgula</p>
            </div>
            <div>
              <Label className="text-[13px] font-semibold text-foreground">Mensagem (opcional)</Label>
              <textarea
                value={enviarMensagem}
                onChange={e => setEnviarMensagem(e.target.value)}
                rows={4}
                placeholder="Mensagem personalizada para o cliente..."
              />
            </div>
            {orc?.token && (
              <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 flex items-start gap-2">
                <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium mb-0.5">Link público:</p>
                  <p className="font-mono break-all text-[10px]">{typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}/orcamento/${orc.token}` : ''}</p>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEnviarModal(false)} disabled={enviando}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={handleEnviar} disabled={enviando}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Paralizar */}
      <Dialog open={paralizarModal} onOpenChange={setParalizarModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeaderIcon icon={Pause} color="amber">
            <DialogTitle className="text-[15px]">Paralizar orcamento</DialogTitle>
            <DialogDescription className="text-[11px]">
              Ao paralizar, o orçamento será marcado como pausado mas manterá o status atual. Útil quando aguarda informações do cliente.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div>
              <Label className="text-[13px] font-semibold text-foreground">Motivo <span className="text-rose-500">*</span></Label>
              <textarea
                value={paralizarMotivo}
                onChange={e => setParalizarMotivo(e.target.value)}
                rows={3}
                placeholder="Ex.: Aguardando documentacao do cliente"
                required
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setParalizarModal(false)} disabled={workflowLoading}>Cancelar</Button>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5" onClick={handleParalizar} disabled={workflowLoading || !paralizarMotivo.trim()}>
              {workflowLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
              Paralizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Reabrir */}
      <Dialog open={reabrirModal} onOpenChange={(open) => { setReabrirModal(open); if (!open) { setReabrirMotivo(''); setReabrirManterDatas(false) } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={RotateCcw} color="blue">
            <DialogTitle className="text-[15px]">Reabrir orçamento</DialogTitle>
            <DialogDescription className="text-[11px]">
              Voltar o orçamento a um status anterior. Esta operação fica registrada no histórico com seu motivo.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            {reabrirStatusOptions.length === 0 ? (
              <div className="flex items-start gap-2 text-[12px] text-rose-700 bg-rose-50 dark:bg-rose-900/10 dark:text-rose-300 rounded p-3 border border-rose-200 dark:border-rose-900/30">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>Este orçamento está no status "Novo" — não há status anterior para o qual voltar.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-foreground">Reabrir para o status <span className="text-rose-500">*</span></Label>
                  <Select value={reabrirStatus} onValueChange={setReabrirStatus}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {reabrirStatusOptions.map(s => (
                        <SelectItem key={s} value={s}>{ORCAMENTO_STATUS_LABELS[s as keyof typeof ORCAMENTO_STATUS_LABELS]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-foreground">Motivo da reabertura <span className="text-rose-500">*</span></Label>
                  <textarea
                    value={reabrirMotivo}
                    onChange={e => setReabrirMotivo(e.target.value)}
                    rows={3}
                    placeholder="Ex.: cliente solicitou revisão de valores; precisamos reenviar a proposta com ajustes"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">Este texto fica registrado na timeline do orçamento como evento de reabertura.</p>
                </div>
                {/* Opção de manter as datas dos marcos */}
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-foreground">Datas dos marcos</Label>
                  <label className="flex items-start gap-2 text-xs cursor-pointer rounded-md border border-border/60 px-3 py-2 hover:bg-muted/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={reabrirManterDatas}
                      onChange={e => setReabrirManterDatas(e.target.checked)}
                      className="h-3.5 w-3.5 rounded mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">Manter as datas dos marcos já registrados</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Útil para correções administrativas onde os marcos efetivamente aconteceram. As datas de Cancelamento/Encerramento sempre são limpas.
                      </p>
                    </div>
                  </label>
                </div>
                {/* Aviso contextual sobre o efeito da reabertura */}
                {reabrirManterDatas ? (
                  <div className="flex items-start gap-2 text-[11px] text-emerald-700 bg-emerald-50 dark:bg-emerald-900/10 dark:text-emerald-300 rounded p-3 border border-emerald-200 dark:border-emerald-900/30">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">Datas dos marcos serão preservadas.</p>
                      <p>Os e-mails de notificação <strong>não serão reenviados</strong> quando o orçamento avançar de novo, pois cada marco já tem uma data registrada.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-900/10 dark:text-amber-300 rounded p-3 border border-amber-200 dark:border-amber-900/30">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">Datas dos marcos posteriores serão limpas.</p>
                      <p>Quando o orçamento avançar de novo no fluxo, os e-mails de notificação serão reenviados (envio ao cliente, aprovação, liberação, etc.).</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReabrirModal(false)} disabled={workflowLoading}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white gap-1.5"
              onClick={handleReabrir}
              disabled={workflowLoading || reabrirStatusOptions.length === 0 || !reabrirMotivo.trim()}
            >
              {workflowLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Texto Padrao do item — espelha legado modal-itens-txt.asp */}
      <Dialog open={!!textoPadraoModal} onOpenChange={open => { if (!open) setTextoPadraoModal(null) }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeaderIcon icon={Type} color="sky">
            <DialogTitle className="text-[15px]">Texto Padrão do Item</DialogTitle>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <h4 className="text-sm font-semibold">{textoPadraoModal?.nome}</h4>
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_p]:mb-2 [&_a]:text-sky-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              dangerouslySetInnerHTML={{ __html: textoPadraoModal?.texto || '' }}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTextoPadraoModal(null)}>Fechar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={copiarTextoPadrao}>
              <CopyIcon className="h-4 w-4" /> Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ============================================================
// DataItem — exibe uma data do workflow (clicavel para editar)
// ============================================================

// ============================================================
// MensagemItem — bloco visual de uma mensagem postada
// ============================================================
function MensagemItem({ msg, usuarios, currentUserId, isMaster, respostas = [], onExcluir, onEditar, onResponder, onExcluirResposta, onEditarResposta, isReply = false }: {
  msg: OrcamentoMensagem
  usuarios: Array<{ id: string; name: string; email: string | null; image: string | null }>
  currentUserId?: string
  isMaster?: boolean
  respostas?: OrcamentoMensagem[]
  onExcluir: () => void
  onEditar: (novoTexto: string) => Promise<void>
  onResponder?: (texto: string) => Promise<void>
  onExcluirResposta?: (id: string) => void | Promise<void>
  onEditarResposta?: (id: string, novoTexto: string) => Promise<void>
  isReply?: boolean
}) {
  const autor = msg.usuario || (msg.userId ? usuarios.find(u => u.id === msg.userId) : null)
  const nome = autor?.name || 'Usuário'
  const iniciais = nome.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  const data = new Date(msg.createdAt)
  const dataAbsoluta = data.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // "há X tempo" leve, sem dependencia
  const diffMs = Date.now() - data.getTime()
  const min = Math.floor(diffMs / 60000)
  const hora = Math.floor(min / 60)
  const dia = Math.floor(hora / 24)
  const dataRelativa =
    diffMs < 60000 ? 'agora há pouco' :
    min < 60 ? `há ${min} min` :
    hora < 24 ? `há ${hora} h` :
    dia < 7 ? `há ${dia} dia${dia > 1 ? 's' : ''}` :
    dataAbsoluta

  // Indicador de edicao
  const editadoEm = msg.editadoEm ? new Date(msg.editadoEm) : null
  const editadoAbsoluto = editadoEm
    ? editadoEm.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  const restritaIds = msg.acessoUsuarios ?? []
  const restritaNomes = restritaIds
    .map(id => usuarios.find(u => u.id === id)?.name)
    .filter(Boolean) as string[]

  // Permissao de edicao: autor ou Master
  const podeEditar = isMaster || (currentUserId && msg.userId === currentUserId)
  const podeExcluir = podeEditar

  // Estado de edicao inline
  const [editando, setEditando] = useState(false)
  const [textoEditado, setTextoEditado] = useState(msg.mensagem)
  const [salvando, setSalvando] = useState(false)
  const textoVazio = !textoEditado || textoEditado.replace(/<[^>]*>/g, '').trim() === ''

  async function salvarEdicao() {
    if (textoVazio) return
    setSalvando(true)
    try {
      await onEditar(textoEditado)
      setEditando(false)
    } finally {
      setSalvando(false)
    }
  }
  function cancelarEdicao() {
    setTextoEditado(msg.mensagem)
    setEditando(false)
  }

  // Estado de resposta inline
  const [respondendo, setRespondendo] = useState(false)
  const [textoResposta, setTextoResposta] = useState('')
  const [enviandoResposta, setEnviandoResposta] = useState(false)
  const respostaVazia = !textoResposta || textoResposta.replace(/<[^>]*>/g, '').trim() === ''

  async function enviarResposta() {
    if (respostaVazia || !onResponder) return
    setEnviandoResposta(true)
    try {
      await onResponder(textoResposta)
      setTextoResposta('')
      setRespondendo(false)
    } finally {
      setEnviandoResposta(false)
    }
  }
  function cancelarResposta() {
    setTextoResposta('')
    setRespondendo(false)
  }

  // Tamanhos do avatar variam para diferenciar mensagem original (h-11) de respostas (h-9)
  const avatarSize = isReply ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm'

  return (
    <div className={cn('group flex items-start', isReply ? 'gap-3' : 'gap-5')}>
      {/* Avatar circulo */}
      {autor?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveAssetUrl(autor.image)}
          alt={nome}
          className={cn(avatarSize, 'rounded-full object-cover shrink-0 ring-2 ring-background shadow-sm mt-0.5')}
        />
      ) : (
        <div
          className={cn(avatarSize, 'rounded-full shrink-0 flex items-center justify-center text-white font-bold ring-2 ring-background shadow-sm mt-0.5')}
          style={{ backgroundColor: MODULE_COLOR }}
        >
          {iniciais}
        </div>
      )}

      {/* Conteudo */}
      <div className="min-w-0 flex-1">
        {/* Header acima do balao: nome + data + restrita + dropdown */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-baseline gap-2 flex-wrap min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{nome}</span>
            <span className="text-[11px] text-muted-foreground" title={dataAbsoluta}>{dataRelativa}</span>
            {editadoAbsoluto && (
              <span
                className="text-[11px] text-muted-foreground italic"
                title={`Editada em ${editadoAbsoluto}`}
              >
                (editada {editadoAbsoluto})
              </span>
            )}
            {restritaIds.length > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 rounded-full px-2 py-0.5"
                title={restritaNomes.length > 0 ? `Visível apenas para: ${restritaNomes.join(', ')}` : `Restrito a ${restritaIds.length} usuário(s)`}
              >
                <Shield className="h-2.5 w-2.5" /> Restrita
              </span>
            )}
          </div>
          {(podeEditar || podeExcluir || onResponder) && !editando && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center rounded hover:bg-muted shrink-0">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onResponder && (
                  <DropdownMenuItem onClick={() => setRespondendo(true)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-2" /> Responder
                  </DropdownMenuItem>
                )}
                {podeEditar && (
                  <DropdownMenuItem onClick={() => setEditando(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                  </DropdownMenuItem>
                )}
                {podeExcluir && (
                  <DropdownMenuItem className="text-destructive" onClick={onExcluir}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Balao de fala com cauda angular (quina viva) no canto superior esquerdo.
            - Bubble com `rounded-tl-none` -> canto superior esquerdo reto (a cauda
              "nasce" daqui prolongando a borda superior).
            - SVG da cauda:
              * Top edge horizontal (continua a borda superior do balao para a esquerda)
              * Hipotenusa em 45 graus voltando para a borda esquerda do balao
              * Tip = quina viva no encontro dos dois traços
            - Fill cobre 1px dentro do balao no eixo vertical, ocultando a borda
              esquerda do balao na area do encaixe da cauda. */}
        <div className="relative">
          <div className="relative -ml-px bg-muted/60 dark:bg-muted/30 rounded-2xl rounded-tl-none px-4 py-3 border border-rose-300/50 dark:border-rose-700/40">
            {editando ? (
              <div className="space-y-2">
                <RichEditor
                  value={textoEditado}
                  onChange={setTextoEditado}
                  placeholder="Edite o conteúdo da mensagem..."
                />
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={cancelarEdicao} disabled={salvando}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 text-white"
                    style={{ backgroundColor: MODULE_COLOR }}
                    onClick={salvarEdicao}
                    disabled={salvando || textoVazio}
                  >
                    {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="text-sm text-foreground prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-a:text-rose-600"
                dangerouslySetInnerHTML={{ __html: msg.mensagem }}
              />
            )}
          </div>
          <svg
            className="absolute pointer-events-none overflow-visible"
            style={{ left: -11, top: 0 }}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden
          >
            {/* Backdrop OPACO + fill translucido. A diagonal de fechamento do
                poligono usa exatamente os mesmos pontos da hipotenusa do stroke
                ((12,13) e (0,0)) para que nao haja sliver entre stroke e fill.
                O vertice extra em (12,14) cria a "bota" que estende o fill
                ate cobrir a borda inferior tambem. */}
            <path
              d="M 0 0 L 14 0 L 14 14 L 12 14 L 12 13 Z"
              className="fill-card"
            />
            <path
              d="M 0 0 L 14 0 L 14 14 L 12 14 L 12 13 Z"
              className="fill-muted/60 dark:fill-muted/30"
            />
            {/* Stroke: top edge (com 1px de overlap dentro do balao em x=13) +
                hipotenusa em 45 graus exatos ((0,0) -> (12,13)). */}
            <path
              d="M 12 13 L 0 0 L 13 0"
              className="stroke-rose-300/50 dark:stroke-rose-700/40"
              fill="none"
              strokeWidth="1"
              strokeLinejoin="miter"
            />
          </svg>
        </div>

        {/* Form inline de resposta (somente em mensagens top-level) */}
        {respondendo && onResponder && (
          <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <Label className="text-[12px] font-semibold flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} />
              Respondendo a {nome}
            </Label>
            <RichEditor
              value={textoResposta}
              onChange={setTextoResposta}
              placeholder="Escreva sua resposta..."
            />
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={cancelarResposta} disabled={enviandoResposta}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="gap-1.5 text-white"
                style={{ backgroundColor: MODULE_COLOR }}
                onClick={enviarResposta}
                disabled={enviandoResposta || respostaVazia}
              >
                {enviandoResposta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Responder
              </Button>
            </div>
          </div>
        )}

        {/* Respostas aninhadas (cronologicas) */}
        {respostas.length > 0 && (
          <div className="mt-3 space-y-3">
            {respostas.map(rep => (
              <MensagemItem
                key={rep.id}
                msg={rep}
                usuarios={usuarios}
                currentUserId={currentUserId}
                isMaster={isMaster}
                isReply
                onExcluir={() => onExcluirResposta?.(rep.id)}
                onEditar={(novoTexto) => onEditarResposta?.(rep.id, novoTexto) ?? Promise.resolve()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// MensagensCard — mensagens internas com controle de visibilidade
// ============================================================

function MensagensCard({ orcamentoId, mensagens, usuarios = [], onChange, bare = false }: {
  orcamentoId: string
  mensagens: OrcamentoMensagem[]
  usuarios?: Array<{ id: string; name: string; email: string | null; image: string | null }>
  onChange: () => void
  bare?: boolean
}) {
  const { profile } = useCurrentUserProfile()
  const currentUserId = profile?.id
  const isMaster = profile?.isMaster ?? false
  const [novaMensagem, setNovaMensagem] = useState('')
  const [notificarUsuarios, setNotificarUsuarios] = useState<string[]>([])
  const [restringirUsuarios, setRestringirUsuarios] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [novaMsgModal, setNovaMsgModal] = useState(false)
  // Mensagens locais (otimistic): permitem aplicar edicoes sem refetch do orcamento.
  // Sincronizam com a prop quando ela muda (ex: apos add/delete que dispara onChange).
  const [mensagensLocais, setMensagensLocais] = useState<OrcamentoMensagem[]>(mensagens)
  useEffect(() => { setMensagensLocais(mensagens) }, [mensagens])

  // Detecta mensagem "vazia" — RichEditor pode emitir <p></p> mesmo sem conteudo
  const mensagemVazia = !novaMensagem || novaMensagem.replace(/<[^>]*>/g, '').trim() === ''

  // Agrupa mensagens em thread: top-level (sem parentId) + map de respostas por parentId.
  // Top-level mantem ordem original (desc); respostas sao ordenadas asc (cronologicas).
  const mensagensTopLevel = mensagensLocais.filter(m => !m.parentId)
  const respostasPorParent = mensagensLocais.reduce<Record<string, OrcamentoMensagem[]>>((acc, m) => {
    if (m.parentId) {
      const arr = acc[m.parentId] ?? []
      arr.push(m)
      acc[m.parentId] = arr
    }
    return acc
  }, {})
  // Sort respostas asc por createdAt (cronologico, mais antiga em cima)
  Object.values(respostasPorParent).forEach(arr => {
    arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  })

  async function handleAdicionar() {
    if (mensagemVazia) return
    setEnviando(true)
    try {
      await (trpc.orcamento as any).addMensagem.mutate({
        orcamentoId,
        mensagem: novaMensagem,
        notificarUsuarios: notificarUsuarios.length > 0 ? notificarUsuarios : undefined,
        acessoUsuarios: restringirUsuarios.length > 0 ? restringirUsuarios : undefined,
      })
      setNovaMensagem('')
      setNotificarUsuarios([])
      setRestringirUsuarios([])
      setNovaMsgModal(false)
      onChange()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviando(false) }
  }

  // Adiciona uma resposta a uma mensagem existente. Faz refetch para puxar
  // a resposta com ID/createdAt do servidor.
  async function handleResponder(parentId: string, texto: string) {
    try {
      await (trpc.orcamento as any).addMensagem.mutate({ orcamentoId, mensagem: texto, parentId })
      onChange()
    } catch (e) { alerts.error('Erro', (e as Error).message); throw e }
  }

  async function handleExcluir(id: string) {
    const ok = await alerts.confirm({ title: 'Excluir mensagem?', text: 'Esta ação não pode ser desfeita.', confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.orcamento as any).deleteMensagem.mutate({ id })
      // Optimistic remove no estado local — sem refetch.
      setMensagensLocais(prev => prev.filter(m => m.id !== id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleEditar(id: string, novoTexto: string) {
    try {
      const updated = await (trpc.orcamento as any).editMensagem.mutate({ id, mensagem: novoTexto })
      // Optimistic update: substitui apenas a mensagem editada no estado local,
      // sem refetch do orcamento inteiro. Mantem texto + editadoEm vindos do backend.
      setMensagensLocais(prev => prev.map(m => m.id === id
        ? { ...m, mensagem: updated?.mensagem ?? novoTexto, editadoEm: updated?.editadoEm ?? new Date().toISOString() }
        : m,
      ))
    } catch (e) { alerts.error('Erro', (e as Error).message); throw e }
  }

  const inner = (
    <div className={cn('space-y-4', bare ? '' : 'p-5')}>
      {/* ── Header: titulo + botao Nova mensagem ── */}
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-[13px] font-semibold flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} />
          Mensagens
          {mensagensLocais.length > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{mensagensLocais.length}</Badge>
          )}
        </h5>
        <Button
          size="sm"
          className="gap-1.5 text-white"
          style={{ backgroundColor: MODULE_COLOR }}
          onClick={() => setNovaMsgModal(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Nova mensagem
        </Button>
      </div>

      {/* ── Lista de mensagens postadas ── */}
      {mensagensLocais.length > 0 ? (
        <div className="space-y-3">
          {mensagensTopLevel.map(msg => (
            <MensagemItem
              key={msg.id}
              msg={msg}
              usuarios={usuarios}
              currentUserId={currentUserId}
              isMaster={isMaster}
              respostas={respostasPorParent[msg.id] || []}
              onExcluir={() => handleExcluir(msg.id)}
              onEditar={(novoTexto) => handleEditar(msg.id, novoTexto)}
              onResponder={(texto) => handleResponder(msg.id, texto)}
              onExcluirResposta={handleExcluir}
              onEditarResposta={handleEditar}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/60 px-4 py-8 text-center">
          <MessageSquare className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground mb-3">Nenhuma mensagem ainda.</p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setNovaMsgModal(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar a primeira mensagem
          </Button>
        </div>
      )}

      {/* ── Modal: Nova mensagem ── */}
      <Dialog open={novaMsgModal} onOpenChange={(o) => { if (!enviando) setNovaMsgModal(o) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={MessageSquare} color="sky">
            <DialogTitle>Nova mensagem</DialogTitle>
            <DialogDescription>
              Adicione uma mensagem ao orçamento. Opcionalmente notifique destinatários por e-mail e/ou restrinja a visibilidade.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            {/* Notificar destinatarios */}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Notificar aos seguintes destinatários</Label>
              <UserMultiPicker
                users={usuarios}
                value={notificarUsuarios}
                onChange={setNotificarUsuarios}
                placeholder="Deixe em branco para apenas gravar a mensagem"
              />
              <p className="text-[11px] text-muted-foreground">
                Os usuários selecionados receberão um e-mail com o conteúdo da mensagem.
              </p>
            </div>

            {/* Texto da mensagem (HTML) */}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Texto da Mensagem</Label>
              <RichEditor
                value={novaMensagem}
                onChange={setNovaMensagem}
                placeholder="Escreva aqui o conteúdo da mensagem..."
              />
            </div>

            {/* Restringir mensagem aos usuarios */}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Restringir mensagem aos seguintes usuários</Label>
              <UserMultiPicker
                users={usuarios}
                value={restringirUsuarios}
                onChange={setRestringirUsuarios}
                placeholder="Em branco = mensagem pública para toda a equipe"
              />
              <p className="text-[11px] text-muted-foreground">
                Quando preenchido, apenas os usuários listados (e o autor) poderão visualizar esta mensagem.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNovaMsgModal(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-white"
              style={{ backgroundColor: MODULE_COLOR }}
              onClick={handleAdicionar}
              disabled={enviando || mensagemVazia}
            >
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {notificarUsuarios.length > 0 ? `Enviar e notificar (${notificarUsuarios.length})` : 'Salvar mensagem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  if (bare) return inner

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
        <FileText className="h-4 w-4" style={{ color: MODULE_COLOR }} />
        <h3 className="text-sm font-semibold flex-1">Mensagens internas</h3>
        <Badge variant="secondary" className="text-[10px]">{mensagensLocais.length}</Badge>
      </CardHeader>
      <CardContent className="p-0">{inner}</CardContent>
    </Card>
  )
}
