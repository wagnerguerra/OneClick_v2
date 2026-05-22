'use client'

/**
 * PassoLembretesSection — dialog com editor de lembretes (templates) por passo.
 *
 * Cada passo do template pode ter N lembretes. Quando o passo é concluído via
 * togglePasso, o backend cria automaticamente um AgendaEvento por lembrete com
 * data = hoje + offset (DIAS/MESES/ANOS), participantes resolvidos a partir da
 * config (usuários listados + ativos das áreas), e título com tags substituídas.
 *
 * Apenas controlled mode (gatilho fica no dropdown "+" do MateriaisSection).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  Button, Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Input, Label, Checkbox, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { Bell, Plus, Pencil, Trash2, Loader2, X, Tag, Save } from 'lucide-react'

interface Lembrete {
  id: string
  passoId: string
  nome: string
  titulo: string
  descricao: string | null
  offsetValor: number
  offsetUnidade: 'DIAS' | 'MESES' | 'ANOS'
  tipoAgendaId: string | null
  participantes: string[]
  participantesAreas: string[]
  ativo: boolean
  ordem: number
  createdAt: string
  updatedAt: string
}

interface AgendaTipo { id: string; nome: string; cor: string }
interface UserOpt   { id: string; name: string; areaName?: string | null }
interface AreaOpt   { id: string; name: string }

interface Props {
  passoId: string
  readOnly?: boolean
  controlled: {
    open: boolean
    onOpenChange: (o: boolean) => void
  }
  /** Reporta contagem de lembretes ativos sempre que a lista muda (evita
   *  refetch global da página). */
  onCountChange?: (count: number) => void
}

const SUPPORTED_TAGS: Array<{ tag: string; label: string }> = [
  { tag: '{{cliente.razaoSocial}}',  label: 'Cliente — Razão social' },
  { tag: '{{cliente.nomeFantasia}}', label: 'Cliente — Nome fantasia' },
  { tag: '{{cliente.documento}}',    label: 'Cliente — Documento' },
  { tag: '{{responsavel.name}}',     label: 'Responsável — Nome' },
  { tag: '{{responsavel.email}}',    label: 'Responsável — E-mail' },
  { tag: '{{servico.nome}}',         label: 'Serviço — Nome' },
  { tag: '{{passo.nome}}',           label: 'Passo — Nome' },
]

export function PassoLembretesSection({ passoId, readOnly, controlled, onCountChange }: Props) {
  const open = controlled.open
  const setOpen = controlled.onOpenChange
  const [lembretes, setLembretes] = useState<Lembrete[]>([])
  const [loading, setLoading] = useState(false)
  // Só dispara onCountChange depois do 1º fetch real (evita zerar o count
  // inicial vindo do backend via _count.lembretes em getServico).
  const [hasLoaded, setHasLoaded] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (trpc.servico as any).listPassoLembretes.query({ passoId }) as Lembrete[]
      setLembretes(data)
      setHasLoaded(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [passoId])

  useEffect(() => { if (open) void fetch() }, [open, fetch])
  // Estabiliza onCountChange via ref pra evitar loop infinito (callback novo
  // a cada render do pai entraria nas deps e re-disparariam ad eternum).
  const onCountChangeRef = useRef(onCountChange)
  useEffect(() => { onCountChangeRef.current = onCountChange }, [onCountChange])
  useEffect(() => {
    if (!hasLoaded) return
    onCountChangeRef.current?.(lembretes.filter(l => l.ativo).length)
  }, [lembretes, hasLoaded])

  if (!open) return null
  return (
    <LembretesDialog
      passoId={passoId}
      lembretes={lembretes}
      loading={loading}
      readOnly={readOnly}
      onClose={() => setOpen(false)}
      onRefetch={fetch}
    />
  )
}

// ── Dialog ────────────────────────────────────────────────────────────

function LembretesDialog({ passoId, lembretes, loading, readOnly, onClose, onRefetch }: {
  passoId: string
  lembretes: Lembrete[]
  loading: boolean
  readOnly?: boolean
  onClose: () => void
  onRefetch: () => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[88vh] overflow-y-auto">
        <DialogHeaderIcon icon={Bell} color="amber">
          <DialogTitle>Lembretes do passo (agenda corporativa)</DialogTitle>
          <DialogDescription>
            Modelos disparados ao concluir este passo. Cada lembrete cria automaticamente um evento na agenda
            com a data calculada a partir da conclusão. Use tags como{' '}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{'{{cliente.razaoSocial}}'}</code> para
            personalizar o título.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {loading && lembretes.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              {lembretes.length === 0 && editingId !== 'new' && (
                <div className="text-center py-8 text-muted-foreground text-sm italic">
                  Nenhum lembrete cadastrado para este passo.
                </div>
              )}

              {lembretes.map(l => (
                editingId === l.id ? (
                  <LembreteEditor
                    key={l.id}
                    mode="edit"
                    passoId={passoId}
                    initial={l}
                    onCancel={() => setEditingId(null)}
                    onSaved={async () => { setEditingId(null); await onRefetch() }}
                    onDeleted={async () => { setEditingId(null); await onRefetch() }}
                  />
                ) : (
                  <LembreteRow
                    key={l.id}
                    lembrete={l}
                    readOnly={readOnly}
                    onEdit={() => setEditingId(l.id)}
                  />
                )
              ))}

              {editingId === 'new' && (
                <LembreteEditor
                  mode="create"
                  passoId={passoId}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => { setEditingId(null); await onRefetch() }}
                />
              )}

              {!readOnly && editingId !== 'new' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingId('new')}
                  className="w-full gap-1.5 border-dashed"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar lembrete
                </Button>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Row resumido ───────────────────────────────────────────────────────

function LembreteRow({ lembrete, readOnly, onEdit }: {
  lembrete: Lembrete
  readOnly?: boolean
  onEdit: () => void
}) {
  const unidadeLabel = lembrete.offsetUnidade === 'DIAS'  ? (lembrete.offsetValor === 1 ? 'dia'  : 'dias')
                    : lembrete.offsetUnidade === 'MESES' ? (lembrete.offsetValor === 1 ? 'mês'  : 'meses')
                                                          : (lembrete.offsetValor === 1 ? 'ano'  : 'anos')
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[13px] font-semibold text-foreground truncate">{lembrete.nome}</h4>
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
              {lembrete.offsetValor} {unidadeLabel}
            </span>
            {!lembrete.ativo && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold bg-muted text-muted-foreground border">
                Inativo
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            <span className="font-medium">Título:</span> {lembrete.titulo}
          </p>
          {(lembrete.participantes.length > 0 || lembrete.participantesAreas.length > 0) && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {lembrete.participantes.length} usuário(s) · {lembrete.participantesAreas.length} setor(es)
            </p>
          )}
        </div>
        {!readOnly && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1 h-7 px-2 text-[11px] shrink-0">
            <Pencil className="h-3 w-3" /> Editar
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────

function LembreteEditor({ mode, passoId, initial, onCancel, onSaved, onDeleted }: {
  mode: 'create' | 'edit'
  passoId: string
  initial?: Lembrete
  onCancel: () => void
  onSaved: () => void | Promise<void>
  onDeleted?: () => void | Promise<void>
}) {
  const [nome, setNome] = useState(initial?.nome ?? '')
  const [titulo, setTitulo] = useState(initial?.titulo ?? '')
  const [descricao, setDescricao] = useState(initial?.descricao ?? '')
  const [offsetValor, setOffsetValor] = useState<number>(initial?.offsetValor ?? 1)
  const [offsetUnidade, setOffsetUnidade] = useState<'DIAS' | 'MESES' | 'ANOS'>(initial?.offsetUnidade ?? 'ANOS')
  const [tipoAgendaId, setTipoAgendaId] = useState<string | null>(initial?.tipoAgendaId ?? null)
  const [participantes, setParticipantes] = useState<string[]>(initial?.participantes ?? [])
  const [participantesAreas, setParticipantesAreas] = useState<string[]>(initial?.participantesAreas ?? [])
  const [ativo, setAtivo] = useState(initial?.ativo ?? true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [agendaTipos, setAgendaTipos] = useState<AgendaTipo[]>([])
  const [users, setUsers] = useState<UserOpt[]>([])
  const [areas, setAreas] = useState<AreaOpt[]>([])

  const tituloRef = useRef<HTMLInputElement>(null)
  const descricaoRef = useRef<HTMLTextAreaElement>(null)
  const lastFocusedRef = useRef<'titulo' | 'descricao'>('titulo')

  useEffect(() => {
    (async () => {
      try {
        const [tipos, usuarios, listAreas] = await Promise.all([
          (trpc.agenda as any).listTipos.query(),
          (trpc.user  as any).listForSelect.query().catch(() => []),
          (trpc.area  as any).listForSelect.query().catch(() => []),
        ])
        setAgendaTipos((tipos || []).filter((t: any) => t.isActive !== false))
        setUsers(usuarios || [])
        setAreas(listAreas || [])
      } catch { /* silent */ }
    })()
  }, [])

  function insertTagAtCursor(tag: string) {
    const target = lastFocusedRef.current
    if (target === 'descricao') {
      const el = descricaoRef.current
      if (!el) { setDescricao(d => (d ?? '') + tag); return }
      const start = el.selectionStart ?? descricao.length
      const end = el.selectionEnd ?? descricao.length
      const next = descricao.slice(0, start) + tag + descricao.slice(end)
      setDescricao(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + tag.length
        el.setSelectionRange(pos, pos)
      })
    } else {
      const el = tituloRef.current
      if (!el) { setTitulo(t => t + tag); return }
      const start = el.selectionStart ?? titulo.length
      const end = el.selectionEnd ?? titulo.length
      const next = titulo.slice(0, start) + tag + titulo.slice(end)
      setTitulo(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + tag.length
        el.setSelectionRange(pos, pos)
      })
    }
  }

  async function handleSave() {
    if (!nome.trim()) { alerts.error('Erro', 'Nome é obrigatório'); return }
    if (!titulo.trim()) { alerts.error('Erro', 'Título do evento é obrigatório'); return }
    if (offsetValor < 1) { alerts.error('Erro', 'Prazo deve ser ≥ 1'); return }
    setSaving(true)
    try {
      const payload = {
        nome: nome.trim(),
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        offsetValor,
        offsetUnidade,
        tipoAgendaId,
        participantes,
        participantesAreas,
        ativo,
      }
      if (mode === 'create') {
        await (trpc.servico as any).createPassoLembrete.mutate({ passoId, ...payload })
      } else if (initial) {
        await (trpc.servico as any).updatePassoLembrete.mutate({ id: initial.id, data: payload })
      }
      await onSaved()
    } catch (e) {
      alerts.error('Erro ao salvar', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!initial) return
    if (!confirm(`Excluir lembrete "${initial.nome}"?`)) return
    setDeleting(true)
    try {
      await (trpc.servico as any).deletePassoLembrete.mutate({ id: initial.id })
      await onDeleted?.()
    } catch (e) {
      alerts.error('Erro ao excluir', (e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-md border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-900 p-4 space-y-3">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Nome interno *</Label>
          <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Parabenizar 1 ano de cliente" className="h-9 text-sm" />
        </div>

        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Título do evento *</Label>
          <Input
            ref={tituloRef}
            value={titulo}
            onFocus={() => { lastFocusedRef.current = 'titulo' }}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Aniversário de 1 ano — {{cliente.razaoSocial}}"
            className="h-9 text-sm"
          />
        </div>

        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Descrição (opcional)</Label>
          <textarea
            ref={descricaoRef}
            value={descricao ?? ''}
            onFocus={() => { lastFocusedRef.current = 'descricao' }}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Texto que aparece no evento da agenda. Suporta tags."
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Tags clicáveis */}
        <div className="col-span-12">
          <Label className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">Tags disponíveis (clique pra inserir)</Label>
          <div className="flex flex-wrap gap-1">
            {SUPPORTED_TAGS.map(t => (
              <button
                key={t.tag}
                type="button"
                onClick={() => insertTagAtCursor(t.tag)}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 hover:bg-muted px-2 py-0.5 text-[10px] font-mono"
                title={t.label}
              >
                <Tag className="h-2.5 w-2.5" />{t.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Offset */}
        <div className="col-span-4 space-y-1.5">
          <Label className="text-[13px] font-semibold">Quanto tempo depois? *</Label>
          <Input
            type="number"
            min={1}
            value={offsetValor}
            onChange={e => setOffsetValor(parseInt(e.target.value, 10) || 1)}
            className="h-9 text-sm tabular-nums"
          />
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label className="text-[13px] font-semibold">Unidade *</Label>
          <Select value={offsetUnidade} onValueChange={v => setOffsetUnidade(v as 'DIAS' | 'MESES' | 'ANOS')}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DIAS">Dias</SelectItem>
              <SelectItem value="MESES">Meses</SelectItem>
              <SelectItem value="ANOS">Anos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label className="text-[13px] font-semibold">Tipo de agenda</Label>
          <Select value={tipoAgendaId ?? '__default__'} onValueChange={v => setTipoAgendaId(v === '__default__' ? null : v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Default" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">— padrão da empresa —</SelectItem>
              {agendaTipos.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Participantes */}
        <div className="col-span-12 md:col-span-6 space-y-1.5">
          <Label className="text-[13px] font-semibold">Participantes (usuários)</Label>
          <Select
            value="__add__"
            onValueChange={v => {
              if (v && v !== '__add__' && !participantes.includes(v)) setParticipantes(p => [...p, v])
            }}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Adicionar usuário..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__add__">Adicionar usuário...</SelectItem>
              {users.filter(u => !participantes.includes(u.id)).map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}{u.areaName ? ` · ${u.areaName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {participantes.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {participantes.map(uid => {
                const u = users.find(x => x.id === uid)
                return (
                  <span key={uid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900">
                    {u?.name ?? uid}
                    <button
                      type="button"
                      onClick={() => setParticipantes(p => p.filter(x => x !== uid))}
                      className="hover:text-rose-600 ml-0.5"
                    >×</button>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="col-span-12 md:col-span-6 space-y-1.5">
          <Label className="text-[13px] font-semibold">Participantes (setores)</Label>
          <Select
            value="__add__"
            onValueChange={v => {
              if (v && v !== '__add__' && !participantesAreas.includes(v)) setParticipantesAreas(p => [...p, v])
            }}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Adicionar setor..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__add__">Adicionar setor...</SelectItem>
              {areas.filter(a => !participantesAreas.includes(a.id)).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {participantesAreas.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {participantesAreas.map(aid => {
                const a = areas.find(x => x.id === aid)
                return (
                  <span key={aid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                    {a?.name ?? aid}
                    <button
                      type="button"
                      onClick={() => setParticipantesAreas(p => p.filter(x => x !== aid))}
                      className="hover:text-rose-600 ml-0.5"
                    >×</button>
                  </span>
                )
              })}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Todos os usuários ativos da área entram como participantes.</p>
        </div>

        <div className="col-span-12 flex items-center gap-2">
          <Checkbox id="lembrete-ativo" checked={ativo} onCheckedChange={v => setAtivo(v === true)} />
          <Label htmlFor="lembrete-ativo" className="text-[12px] font-medium cursor-pointer">Lembrete ativo</Label>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        <div>
          {mode === 'edit' && initial && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="text-rose-600 hover:text-rose-700 gap-1">
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Excluir
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            <X className="h-3 w-3 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
