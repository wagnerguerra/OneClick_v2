'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Plus, Headphones, AlertTriangle, Zap, AlertCircle, Snowflake,
  FileText, Paperclip, X, ChevronDown,
} from 'lucide-react'
import {
  Button, Input, Label, Dialog, DialogContent, DialogTitle,
  DialogDescription, DialogBody, DialogFooter, RichEditor,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { AnexosDropzone, type AnexoStaged } from './anexos-dropzone'
import {
  HELPDESK_PRIORIDADE, HELPDESK_PRIORIDADE_LABELS, HELPDESK_PRIORIDADE_COLORS,
  HELPDESK_TIPO, HELPDESK_TIPO_LABELS,
  type HelpdeskPrioridade, type HelpdeskTipo,
} from '@saas/types'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'

interface Categoria {
  id: string
  nome: string
  cor: string | null
  slaPadraoHoras: number | null
  parent: { id: string; nome: string } | null
  area: { id: string; name: string } | null
}

const PRIORIDADE_ICON: Record<HelpdeskPrioridade, typeof Snowflake> = {
  BAIXA: Snowflake,
  MEDIA: AlertCircle,
  ALTA: AlertTriangle,
  URGENTE: Zap,
}

export function NovoTicketModal({ open, onOpenChange, onCreated, permitePrioridade }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated?: (ticketId: string) => void
  /**
   * Override opcional. Quando omitido, decide pelo perfil:
   * - Master, empresa-master, role DIRETOR/COORDENADOR/GESTOR, profile
   *   SUPERVISOR/GERENTE/ADMIN → mostra (atuam como agentes)
   * - Demais (solicitantes) → esconde (a TI classifica na triagem).
   */
  permitePrioridade?: boolean
}) {
  const { profile } = useCurrentUserProfile()
  // Heurística: quem pode atuar como agente classifica prioridade ao abrir.
  // Demais ficam sem o campo (default MEDIA gravado no backend).
  const mostrarPrioridade = permitePrioridade ?? (
    !!profile && (
      profile.isMaster
      || (profile as { isEmpresaMaster?: boolean }).isEmpresaMaster === true
      || profile.role === 'DIRETOR'
      || profile.role === 'COORDENADOR'
      || profile.role === 'GESTOR'
      || (profile as { profile?: string }).profile === 'SUPERVISOR'
      || (profile as { profile?: string }).profile === 'GERENTE'
      || (profile as { profile?: string }).profile === 'ADMIN'
    )
  )
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<HelpdeskTipo>('INCIDENTE')
  const [prioridade, setPrioridade] = useState<HelpdeskPrioridade>('MEDIA')
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [anexos, setAnexos] = useState<AnexoStaged[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Carrega categorias quando o modal abre
  useEffect(() => {
    if (!open) return
    setLoadingCats(true)
    ;(trpc.helpdesk as any).listCategorias.query()
      .then((data: Categoria[]) => setCategorias(data || []))
      .catch(() => setCategorias([]))
      .finally(() => setLoadingCats(false))
  }, [open])

  // Limpa estado ao fechar
  useEffect(() => {
    if (open) return
    const t = setTimeout(() => {
      setTitulo('')
      setDescricao('')
      setTipo('INCIDENTE')
      setPrioridade('MEDIA')
      setCategoriaId(null)
      setAnexos([])
    }, 200)
    return () => clearTimeout(t)
  }, [open])

  const submit = useCallback(async () => {
    if (titulo.trim().length < 3) {
      alerts.error('Validação', 'Título precisa ter pelo menos 3 caracteres.')
      return
    }
    // RichEditor sempre devolve HTML — strip tags pra validar conteúdo
    const descricaoTexto = descricao.replace(/<[^>]+>/g, '').trim()
    if (!descricaoTexto) {
      alerts.error('Validação', 'Descrição é obrigatória.')
      return
    }
    // Bloqueia se houver upload em andamento
    if (anexos.some(a => a.status === 'uploading')) {
      alerts.error('Aguarde', 'Aguarde o upload dos anexos terminar.')
      return
    }
    setSalvando(true)
    try {
      const t = await (trpc.helpdesk as any).create.mutate({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        tipo,
        prioridade,
        categoriaId: categoriaId ?? null,
      })
      // Anexos prontos viram HelpdeskAnexo do ticket recém-criado
      const prontos = anexos.filter(a => a.status === 'ready' && a.fileUrl)
      for (const a of prontos) {
        try {
          await (trpc.helpdesk as any).addAnexo.mutate({
            ticketId: t.id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            mimeType: a.mimeType,
            tamanho: a.tamanho,
          })
        } catch (e) {
          console.warn('[NovoTicket] addAnexo falhou:', (e as Error).message)
        }
      }
      await alerts.success('Ticket criado', `#HLP${String(t.numero).padStart(4, '0')} registrado.`)
      onOpenChange(false)
      onCreated?.(t.id)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }, [titulo, descricao, tipo, prioridade, categoriaId, anexos, onCreated, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeaderIcon icon={Headphones} color="cyan">
          <DialogTitle>Novo Ticket</DialogTitle>
          <DialogDescription>
            Descreva o problema ou solicitação. A equipe da TI será notificada.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {/* Tipo (+ Prioridade se permitida) */}
          <div className={cn('grid gap-3', mostrarPrioridade ? 'grid-cols-2' : 'grid-cols-1')}>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Tipo</Label>
              <Select value={tipo} onValueChange={v => setTipo(v as HelpdeskTipo)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HELPDESK_TIPO.map(t => (
                    <SelectItem key={t} value={t}>
                      <span className="inline-flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {HELPDESK_TIPO_LABELS[t]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mostrarPrioridade && (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Prioridade</Label>
                <Select value={prioridade} onValueChange={v => setPrioridade(v as HelpdeskPrioridade)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HELPDESK_PRIORIDADE.map(p => {
                      const Icon = PRIORIDADE_ICON[p]
                      return (
                        <SelectItem key={p} value={p}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" style={{ color: HELPDESK_PRIORIDADE_COLORS[p] }} />
                            {HELPDESK_PRIORIDADE_LABELS[p]}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {!mostrarPrioridade && (
            <p className="text-[10px] text-muted-foreground -mt-2">
              A TI vai classificar a prioridade ao receber o ticket.
            </p>
          )}

          {/* Categoria (combobox simplificado — Fase 3 pode evoluir pra hierárquico) */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Categoria</Label>
            <CategoriaSelect
              categorias={categorias}
              loading={loadingCats}
              value={categoriaId}
              onChange={setCategoriaId}
            />
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Título *</Label>
            <Input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Resumo do problema (ex: Notebook não liga)"
              className="h-9 text-sm"
              maxLength={200}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Descrição *</Label>
            <RichEditor
              value={descricao}
              onChange={(html) => setDescricao(html)}
              placeholder="Descreva o problema com o máximo de detalhe — passos pra reproduzir, mensagens de erro, hora em que aconteceu, prints..."
              className="min-h-[140px]"
            />
          </div>

          {/* Anexos */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" /> Anexos
            </Label>
            <AnexosDropzone value={anexos} onChange={setAnexos} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={salvando || titulo.trim().length < 3 || !descricao.replace(/<[^>]+>/g, '').trim()}
            style={{ backgroundColor: MODULO_COLOR }}
            className="text-white gap-1.5"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Combobox de categoria — agrupa por categoria-pai (root). Exibe hierarquia
 * com indent. Busca por nome com normalize (case/accent-insensitive simples).
 */
function CategoriaSelect({ categorias, loading, value, onChange }: {
  categorias: Categoria[]
  loading: boolean
  value: string | null
  onChange: (v: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = categorias.find(c => c.id === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? categorias.filter(c => c.nome.toLowerCase().includes(q))
    : categorias

  // Agrupa por root: items sem parentId, depois seus filhos
  const roots = filtered.filter(c => !c.parent)
  const byParent = new Map<string, Categoria[]>()
  for (const c of filtered) {
    if (!c.parent) continue
    const arr = byParent.get(c.parent.id) ?? []
    arr.push(c)
    byParent.set(c.parent.id, arr)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            {selected.cor && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.cor }} />}
            <span className="truncate">{selected.parent ? `${selected.parent.nome} › ${selected.nome}` : selected.nome}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Selecione a categoria</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar categoria..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
              </p>
            ) : roots.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhuma categoria</p>
            ) : roots.map(root => {
              const filhos = byParent.get(root.id) ?? []
              return (
                <div key={root.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(root.id); setOpen(false); setQuery('') }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 font-medium',
                      value === root.id && 'bg-accent text-accent-foreground',
                    )}
                  >
                    {root.cor && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: root.cor }} />}
                    {root.nome}
                  </button>
                  {filhos.map(filho => (
                    <button
                      key={filho.id}
                      type="button"
                      onClick={() => { onChange(filho.id); setOpen(false); setQuery('') }}
                      className={cn(
                        'w-full text-left px-3 py-1 text-xs hover:bg-muted flex items-center gap-2 text-muted-foreground',
                        value === filho.id && 'bg-accent text-accent-foreground',
                      )}
                    >
                      <span className="pl-3">↳ {filho.nome}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
          {value && (
            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); setQuery('') }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted flex items-center gap-1.5 italic"
              >
                <X className="h-3 w-3" /> Sem categoria
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
