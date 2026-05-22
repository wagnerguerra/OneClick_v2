'use client'

/**
 * PassoCamposClienteSection — dialog com editor de campos do Cliente vinculados
 * a um passo. Cada vínculo permite ao operador preencher (no checklist da
 * execução) um campo do cadastro do Cliente direto na finalização do passo.
 *
 * Catálogo whitelist vem do backend via listCamposClienteCatalogo.
 * Apenas controlled mode — gatilho fica no dropdown "+" do MateriaisSection.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  Button, Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Input, Label, Checkbox, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue, SelectGroup,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import type { CampoClienteDef } from '@saas/types'
import { Database, Plus, Pencil, Trash2, Loader2, X, Save, AlertCircle, GripVertical } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface CampoVinculo {
  id: string
  passoId: string
  campoChave: string
  labelOverride: string | null
  obrigatorio: boolean
  exigeEdicao: boolean
  ativo: boolean
  ordem: number
  createdAt: string
  updatedAt: string
}

interface Props {
  passoId: string
  readOnly?: boolean
  controlled: {
    open: boolean
    onOpenChange: (o: boolean) => void
  }
  /** Reporta a contagem de vínculos ativos sempre que a lista interna muda.
   *  Usado pelo pai pra atualizar o indicador visual do passo sem precisar
   *  re-fetchar o serviço inteiro (evita flicker da tab Etapas). */
  onCountChange?: (count: number) => void
}

export function PassoCamposClienteSection({ passoId, readOnly, controlled, onCountChange }: Props) {
  const open = controlled.open
  const setOpen = controlled.onOpenChange
  const [vinculos, setVinculos] = useState<CampoVinculo[]>([])
  const [catalogo, setCatalogo] = useState<CampoClienteDef[]>([])
  const [loading, setLoading] = useState(false)
  // Só dispara onCountChange depois do 1º fetch real — evita zerar o count
  // inicial do backend (que veio via _count.camposCliente em getServico).
  const [hasLoaded, setHasLoaded] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [v, c] = await Promise.all([
        (trpc.servico as any).listPassoCamposCliente.query({ passoId }) as Promise<CampoVinculo[]>,
        (trpc.servico as any).listCamposClienteCatalogo.query() as Promise<CampoClienteDef[]>,
      ])
      setVinculos(v)
      setCatalogo(c)
      setHasLoaded(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [passoId])

  useEffect(() => { if (open) void fetch() }, [open, fetch])

  // Reporta contagem ao pai sempre que vinculos mudar — só depois do 1º fetch.
  // Ref estabiliza onCountChange (caso contrário, função nova a cada render
  // do pai geraria loop infinito).
  const onCountChangeRef = useRef(onCountChange)
  useEffect(() => { onCountChangeRef.current = onCountChange }, [onCountChange])
  useEffect(() => {
    if (!hasLoaded) return
    onCountChangeRef.current?.(vinculos.filter(v => v.ativo).length)
  }, [vinculos, hasLoaded])

  if (!open) return null
  return (
    <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
      <DialogContent className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto">
        <DialogHeaderIcon icon={Database} color="sky">
          <DialogTitle>Campos do cliente vinculados ao passo</DialogTitle>
          <DialogDescription>
            Ao concluir este passo na execução, o operador preencherá esses campos num modal e o cadastro do cliente é atualizado automaticamente.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {loading && vinculos.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <VinculosList
              passoId={passoId}
              vinculos={vinculos}
              setVinculos={setVinculos}
              catalogo={catalogo}
              readOnly={readOnly}
              onRefetch={fetch}
            />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VinculosList({ passoId, vinculos, setVinculos, catalogo, readOnly, onRefetch }: {
  passoId: string
  vinculos: CampoVinculo[]
  setVinculos: React.Dispatch<React.SetStateAction<CampoVinculo[]>>
  catalogo: CampoClienteDef[]
  readOnly?: boolean
  onRefetch: () => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const usedKeys = new Set(vinculos.map(v => v.campoChave))

  // Sensores do D&D — Pointer (mouse/touch) + Keyboard (acessibilidade)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(ev: DragEndEvent) {
    const { active, over } = ev
    if (!over || active.id === over.id) return
    const oldIdx = vinculos.findIndex(v => v.id === active.id)
    const newIdx = vinculos.findIndex(v => v.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    // Reordena local com nova `ordem` sequencial (otimista)
    const reordenado = arrayMove(vinculos, oldIdx, newIdx).map((v, i) => ({ ...v, ordem: i }))
    setVinculos(reordenado)
    // Persiste em paralelo — falha individual logga mas não desfaz a UI
    await Promise.all(reordenado.map(v =>
      (trpc.servico as any).updatePassoCampoCliente.mutate({ id: v.id, data: { ordem: v.ordem } }),
    )).catch(e => alerts.error('Erro ao reordenar', (e as Error).message))
  }

  return (
    <>
      {vinculos.length === 0 && editingId !== 'new' && (
        <div className="text-center py-8 text-muted-foreground text-sm italic">
          Nenhum campo do cliente vinculado a este passo.
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={vinculos.map(v => v.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {vinculos.map(v => (
              editingId === v.id ? (
                <VinculoEditor
                  key={v.id}
                  mode="edit"
                  passoId={passoId}
                  initial={v}
                  catalogo={catalogo}
                  usedKeys={new Set([...usedKeys].filter(k => k !== v.campoChave))}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => { setEditingId(null); await onRefetch() }}
                  onDeleted={async () => { setEditingId(null); await onRefetch() }}
                />
              ) : (
                <SortableVinculoRow
                  key={v.id}
                  vinculo={v}
                  catalogo={catalogo}
                  readOnly={readOnly}
                  onEdit={() => setEditingId(v.id)}
                />
              )
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editingId === 'new' && (
        <VinculoEditor
          mode="create"
          passoId={passoId}
          catalogo={catalogo}
          usedKeys={usedKeys}
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
          <Plus className="h-3.5 w-3.5" /> Vincular campo do cliente
        </Button>
      )}
    </>
  )
}

/** Wrapper sortable do row — aplica useSortable e renderiza VinculoRow recebendo
 *  attributes/listeners pra o handle de drag interno. */
function SortableVinculoRow(props: {
  vinculo: CampoVinculo
  catalogo: CampoClienteDef[]
  readOnly?: boolean
  onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.vinculo.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? 'rgba(14,165,233,0.05)' : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <VinculoRow
        {...props}
        dragAttrs={attributes as unknown as Record<string, unknown>}
        dragListeners={(listeners ?? {}) as Record<string, unknown>}
      />
    </div>
  )
}

function VinculoRow({ vinculo, catalogo, readOnly, onEdit, dragAttrs, dragListeners }: {
  vinculo: CampoVinculo
  catalogo: CampoClienteDef[]
  readOnly?: boolean
  onEdit: () => void
  /** Atributos/listeners passados pelo SortableVinculoRow pra o handle de drag. */
  dragAttrs?: Record<string, unknown>
  dragListeners?: Record<string, unknown>
}) {
  const def = catalogo.find(c => c.key === vinculo.campoChave)
  const label = vinculo.labelOverride ?? def?.label ?? vinculo.campoChave
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-start gap-2">
        {/* Handle de drag — só renderiza fora do readOnly. Cursor grab + GripVertical
            cinza. listeners do dnd-kit aplicados aqui (não no row inteiro) pra
            evitar conflito com cliques no botão Editar. */}
        {!readOnly && (
          <button
            type="button"
            {...(dragAttrs as React.HTMLAttributes<HTMLButtonElement>)}
            {...(dragListeners as React.HTMLAttributes<HTMLButtonElement>)}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground mt-0.5 -ml-1 shrink-0"
            aria-label="Arrastar para reordenar"
            title="Arrastar para reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[13px] font-semibold text-foreground truncate">{label}</h4>
            {def && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800">
                {def.grupo} · {def.tipo}
              </span>
            )}
            {vinculo.obrigatorio && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800">
                <AlertCircle className="h-2.5 w-2.5" /> Obrigatório
              </span>
            )}
            {vinculo.exigeEdicao && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                Exige revisão
              </span>
            )}
            {!vinculo.ativo && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold bg-muted text-muted-foreground border">
                Inativo
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
            cliente.{vinculo.campoChave}
          </p>
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

function VinculoEditor({ mode, passoId, initial, catalogo, usedKeys, onCancel, onSaved, onDeleted }: {
  mode: 'create' | 'edit'
  passoId: string
  initial?: CampoVinculo
  catalogo: CampoClienteDef[]
  usedKeys: Set<string>
  onCancel: () => void
  onSaved: () => void | Promise<void>
  onDeleted?: () => void | Promise<void>
}) {
  const [campoChave, setCampoChave] = useState(initial?.campoChave ?? '')
  const [labelOverride, setLabelOverride] = useState(initial?.labelOverride ?? '')
  const [obrigatorio, setObrigatorio] = useState(initial?.obrigatorio ?? false)
  const [exigeEdicao, setExigeEdicao] = useState(initial?.exigeEdicao ?? false)
  const [ativo, setAtivo] = useState(initial?.ativo ?? true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const def = catalogo.find(c => c.key === campoChave)

  // Agrupa catálogo por `grupo` pra exibir SelectGroups no dropdown.
  const grupos: Record<string, CampoClienteDef[]> = {}
  for (const c of catalogo) {
    if (!grupos[c.grupo]) grupos[c.grupo] = []
    grupos[c.grupo].push(c)
  }

  async function handleSave() {
    if (!campoChave) { alerts.error('Erro', 'Selecione um campo'); return }
    setSaving(true)
    try {
      const payload = {
        campoChave,
        labelOverride: labelOverride.trim() || null,
        obrigatorio,
        exigeEdicao,
        ativo,
      }
      if (mode === 'create') {
        await (trpc.servico as any).createPassoCampoCliente.mutate({ passoId, ...payload })
      } else if (initial) {
        await (trpc.servico as any).updatePassoCampoCliente.mutate({ id: initial.id, data: payload })
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
    if (!confirm(`Remover vínculo "${initial.labelOverride ?? def?.label ?? initial.campoChave}"?`)) return
    setDeleting(true)
    try {
      await (trpc.servico as any).deletePassoCampoCliente.mutate({ id: initial.id })
      await onDeleted?.()
    } catch (e) {
      alerts.error('Erro ao remover', (e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-md border-2 border-sky-300 bg-sky-50/40 dark:bg-sky-950/10 dark:border-sky-900 p-4 space-y-3">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Campo do cliente *</Label>
          <Select value={campoChave || undefined} onValueChange={setCampoChave}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Selecione um campo..." />
            </SelectTrigger>
            <SelectContent className="max-h-[320px]">
              {Object.entries(grupos).map(([grupo, items]) => (
                <SelectGroup key={grupo}>
                  {/* Header do grupo — substitui SelectLabel (não exportado de @saas/ui) */}
                  <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {grupo}
                  </div>
                  {items.map(c => {
                    const disabled = usedKeys.has(c.key) && c.key !== initial?.campoChave
                    return (
                      <SelectItem key={c.key} value={c.key} disabled={disabled}>
                        {c.label}
                        {disabled && <span className="text-muted-foreground ml-2 text-[10px]">(já vinculado)</span>}
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {def && (
            <p className="text-[10px] text-muted-foreground">
              Tipo: <span className="font-mono">{def.tipo}</span> · cliente.<span className="font-mono">{def.key}</span>
            </p>
          )}
        </div>

        <div className="col-span-12 space-y-1.5">
          <Label className="text-[13px] font-semibold">Rótulo personalizado (opcional)</Label>
          <Input
            value={labelOverride ?? ''}
            onChange={e => setLabelOverride(e.target.value)}
            placeholder={def?.label ?? 'Ex.: Data de início do cliente'}
            className="h-9 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">Vazio = usa o rótulo padrão do catálogo.</p>
        </div>

        <div className="col-span-12 flex items-center gap-4 flex-wrap">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={obrigatorio} onCheckedChange={v => setObrigatorio(v === true)} />
            <span className="text-[12px] font-medium">Obrigatório (bloqueia conclusão)</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none" title="O operador deve revisar/confirmar o valor mesmo que já esteja preenchido no cliente">
            <Checkbox checked={exigeEdicao} onCheckedChange={v => setExigeEdicao(v === true)} />
            <span className="text-[12px] font-medium">Exige revisão</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={ativo} onCheckedChange={v => setAtivo(v === true)} />
            <span className="text-[12px] font-medium">Ativo</span>
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        <div>
          {mode === 'edit' && initial && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="text-rose-600 hover:text-rose-700 gap-1">
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Remover
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            <X className="h-3 w-3 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-sky-600 hover:bg-sky-700">
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
