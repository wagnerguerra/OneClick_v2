'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Monitor, ArrowLeft, Plus, Trash2, Loader2, Save,
  LayoutGrid, RefreshCw, ExternalLink, Pencil, Copy, GripVertical,
} from 'lucide-react'
import {
  Button, Input, Card, Badge,
  Dialog, DialogContent, DialogBody, DialogFooter,
} from '@saas/ui'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const VISUAL_LABEL: Record<string, string> = {
  kpi: 'Indicador (KPI)', donut: 'Rosca', bar: 'Barras', line: 'Linha', table: 'Tabela', list: 'Lista',
}
const inputCls = 'h-9 text-sm w-full rounded-md border border-border bg-background px-3'

export default function PainelEditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')
  const { profile } = useCurrentUserProfile()
  const isMaster = !!(profile?.isMaster || profile?.isEmpresaMaster)

  const [painel, setPainel] = useState<any>(null)
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFolha, setActiveFolha] = useState<string | null>(null)
  const [meta, setMeta] = useState<any>(null)
  const [savingMeta, setSavingMeta] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)

  // Modal de bloco
  const [blocoModal, setBlocoModal] = useState<{ open: boolean; editId?: string }>({ open: false })
  const [blocoForm, setBlocoForm] = useState({ metricId: '', visual: '', label: '', colSpan: 6 })

  const load = useCallback(async () => {
    try {
      const [p, cat] = await Promise.all([
        (trpc.painelTv as any).getById.query({ id }),
        (trpc.painelTv as any).catalogo.query(),
      ])
      setPainel(p)
      setCatalogo(cat ?? [])
      setMeta({ nome: p?.nome ?? '', slug: p?.slug ?? '', accent: p?.accent ?? '#22d3ee', slideMs: p?.slideMs ?? 18000, periodoDias: p?.periodoDias ?? 30, ativo: p?.ativo ?? true })
      setActiveFolha((cur) => cur ?? p?.folhas?.[0]?.id ?? null)
      setPreviewKey((k) => k + 1)
    } catch { /* noop */ }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const folhaAtual = useMemo(() => painel?.folhas?.find((f: any) => f.id === activeFolha) ?? null, [painel, activeFolha])
  const metricById = useMemo(() => Object.fromEntries(catalogo.map((m) => [m.id, m])), [catalogo])

  // ── Metadados ──
  const salvarMeta = async () => {
    setSavingMeta(true)
    try {
      await (trpc.painelTv as any).updatePainel.mutate({ id, data: meta })
      await load()
      alerts.success('Salvo', 'Dados do painel atualizados.')
    } catch (e: any) { alerts.error('Erro ao salvar', e?.message ?? 'Tente novamente.') }
    finally { setSavingMeta(false) }
  }

  // ── Folhas ──
  const addFolha = async () => {
    const r = await alerts.input({ title: 'Nova folha', label: 'Título da folha', placeholder: 'Ex.: Visão Geral' })
    if (!r) return
    const f = await (trpc.painelTv as any).createFolha.mutate({ painelId: id, titulo: r })
    await load(); setActiveFolha(f.id)
  }
  const renomearFolha = async (folha: any) => {
    const r = await alerts.input({ title: 'Renomear folha', label: 'Título', initialValue: folha.titulo })
    if (!r) return
    await (trpc.painelTv as any).updateFolha.mutate({ id: folha.id, data: { titulo: r } }); load()
  }
  const excluirFolha = async (folha: any) => {
    if (!(await alerts.confirm({ title: 'Excluir folha?', text: `"${folha.titulo}" e seus blocos serão removidos.`, icon: 'warning' }))) return
    await (trpc.painelTv as any).deleteFolha.mutate({ id: folha.id })
    setActiveFolha(null); load()
  }
  const onDragFolhas = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = painel.folhas.map((f: any) => f.id)
    const from = ids.indexOf(active.id as string); const to = ids.indexOf(over.id as string)
    if (from < 0 || to < 0) return
    const novo = arrayMove(ids, from, to)
    // Atualização otimista p/ a UI não "pular" antes do refetch
    setPainel((p: any) => ({ ...p, folhas: arrayMove(p.folhas, from, to) }))
    await (trpc.painelTv as any).reorderFolhas.mutate({ ids: novo }); load()
  }

  // ── Blocos ──
  const abrirNovoBloco = () => {
    const first = catalogo[0]
    setBlocoForm({ metricId: first?.id ?? '', visual: first?.visuals?.[0] ?? 'kpi', label: '', colSpan: 6 })
    setBlocoModal({ open: true })
  }
  const abrirEditarBloco = (b: any) => {
    setBlocoForm({ metricId: b.metricId, visual: b.visual, label: b.config?.label ?? '', colSpan: b.config?.colSpan ?? 6 })
    setBlocoModal({ open: true, editId: b.id })
  }
  const salvarBloco = async () => {
    const config: any = { colSpan: blocoForm.colSpan }
    if (blocoForm.label.trim()) config.label = blocoForm.label.trim()
    try {
      if (blocoModal.editId) {
        await (trpc.painelTv as any).updateBloco.mutate({ id: blocoModal.editId, data: { metricId: blocoForm.metricId, visual: blocoForm.visual, config } })
      } else {
        await (trpc.painelTv as any).createBloco.mutate({ folhaId: activeFolha, metricId: blocoForm.metricId, visual: blocoForm.visual, config })
      }
      setBlocoModal({ open: false }); load()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Não foi possível salvar o bloco.') }
  }
  const excluirBloco = async (b: any) => {
    if (!(await alerts.confirm({ title: 'Remover bloco?', text: metricById[b.metricId]?.label ?? b.metricId, icon: 'warning' }))) return
    await (trpc.painelTv as any).deleteBloco.mutate({ id: b.id }); load()
  }
  const onDragBlocos = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id || !folhaAtual) return
    const ids = folhaAtual.blocos.map((b: any) => b.id)
    const from = ids.indexOf(active.id as string); const to = ids.indexOf(over.id as string)
    if (from < 0 || to < 0) return
    const novo = arrayMove(ids, from, to)
    setPainel((p: any) => ({ ...p, folhas: p.folhas.map((f: any) => f.id === folhaAtual.id ? { ...f, blocos: arrayMove(f.blocos, from, to) } : f) }))
    await (trpc.painelTv as any).reorderBlocos.mutate({ ids: novo }); load()
  }
  const duplicarBloco = async (b: any) => {
    await (trpc.painelTv as any).createBloco.mutate({ folhaId: activeFolha, metricId: b.metricId, visual: b.visual, config: b.config })
    load()
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const metricSel = metricById[blocoForm.metricId]

  if (!isMaster) return <Card className="p-8 text-center text-sm text-muted-foreground">Acesso restrito ao master.</Card>
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
  if (!painel) return <Card className="p-8 text-center text-sm text-muted-foreground">Painel não encontrado. <Button variant="link" onClick={() => router.push('/paineis')}>Voltar</Button></Card>

  const accent = meta.accent

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="icon-sm" onClick={() => router.push('/paineis')} title="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
          <span className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: accent }}><Monitor className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{painel.nome}</h1>
            <p className="text-xs text-muted-foreground font-mono">/tv/{painel.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/tv/${painel.slug}`, '_blank')}><ExternalLink className="h-4 w-4 mr-1.5" /> Abrir TV</Button>
        </div>
      </div>

      {/* Metadados */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5 col-span-2 md:col-span-1"><label className="text-[13px] font-semibold">Nome</label><input className={inputCls} value={meta.nome} onChange={(e) => setMeta({ ...meta, nome: e.target.value })} /></div>
          <div className="space-y-1.5"><label className="text-[13px] font-semibold">Slug</label><input className={`${inputCls} font-mono`} value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} /></div>
          <div className="space-y-1.5"><label className="text-[13px] font-semibold">Cor</label><div className="flex gap-1.5"><input type="color" value={meta.accent} onChange={(e) => setMeta({ ...meta, accent: e.target.value })} className="h-9 w-10 rounded border border-border bg-transparent cursor-pointer" /><input className={`${inputCls} font-mono`} value={meta.accent} onChange={(e) => setMeta({ ...meta, accent: e.target.value })} /></div></div>
          <div className="space-y-1.5"><label className="text-[13px] font-semibold">Slide (s)</label><input type="number" className={inputCls} value={Math.round(meta.slideMs / 1000)} onChange={(e) => setMeta({ ...meta, slideMs: (Number(e.target.value) || 18) * 1000 })} /></div>
          <div className="space-y-1.5"><label className="text-[13px] font-semibold">Período (d)</label><input type="number" className={inputCls} value={meta.periodoDias} onChange={(e) => setMeta({ ...meta, periodoDias: Number(e.target.value) || 30 })} /></div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={meta.ativo} onChange={(e) => setMeta({ ...meta, ativo: e.target.checked })} /> Painel ativo</label>
          <Button size="sm" onClick={salvarMeta} disabled={savingMeta} style={{ backgroundColor: accent }} className="text-white">{savingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1.5" /> Salvar dados</>}</Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor de folhas/blocos */}
        <div className="space-y-4">
          {/* Folhas */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><LayoutGrid className="h-4 w-4" style={{ color: accent }} /> Folhas (slides)</h3>
              <Button size="sm" variant="outline" onClick={addFolha}><Plus className="h-4 w-4 mr-1" /> Folha</Button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragFolhas}>
              <SortableContext items={painel.folhas.map((f: any) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {painel.folhas.map((f: any) => (
                    <SortableFolha key={f.id} folha={f} active={activeFolha === f.id} onSelect={() => setActiveFolha(f.id)} onRename={() => renomearFolha(f)} onDelete={() => excluirFolha(f)} />
                  ))}
                  {painel.folhas.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhuma folha. Adicione a primeira.</p>}
                </div>
              </SortableContext>
            </DndContext>
          </Card>

          {/* Blocos da folha ativa */}
          {folhaAtual && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold truncate">Blocos · {folhaAtual.titulo}</h3>
                <Button size="sm" variant="outline" onClick={abrirNovoBloco} disabled={!catalogo.length}><Plus className="h-4 w-4 mr-1" /> Bloco</Button>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragBlocos}>
                <SortableContext items={folhaAtual.blocos.map((b: any) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {folhaAtual.blocos.map((b: any) => (
                      <SortableBloco key={b.id} bloco={b} label={b.config?.label ?? metricById[b.metricId]?.label ?? b.metricId} onEdit={() => abrirEditarBloco(b)} onDuplicate={() => duplicarBloco(b)} onDelete={() => excluirBloco(b)} />
                    ))}
                    {folhaAtual.blocos.length === 0 && <p className="text-xs text-muted-foreground py-2">Folha vazia. Adicione blocos do catálogo.</p>}
                  </div>
                </SortableContext>
              </DndContext>
            </Card>
          )}
        </div>

        {/* Preview ao vivo */}
        <Card className="p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold text-muted-foreground">Preview ao vivo</span>
            <Button size="icon-sm" variant="ghost" onClick={() => setPreviewKey((k) => k + 1)} title="Atualizar preview"><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="relative w-full rounded-lg overflow-hidden border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
            <iframe key={previewKey} src={`/tv/${painel.slug}`} className="absolute inset-0 w-full h-full" title="preview" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 px-1">Reflete o que está salvo. Após editar, clique em atualizar.</p>
        </Card>
      </div>

      {/* Modal de bloco */}
      <Dialog open={blocoModal.open} onOpenChange={(o) => setBlocoModal({ open: o, editId: o ? blocoModal.editId : undefined })}>
        <DialogContent>
          <DialogHeaderIcon icon={LayoutGrid} color={accent} title={blocoModal.editId ? 'Editar bloco' : 'Adicionar bloco'} description="Escolha a métrica do catálogo e como exibir." />
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Métrica</label>
              <select className={inputCls} value={blocoForm.metricId} onChange={(e) => { const m = metricById[e.target.value]; setBlocoForm((f) => ({ ...f, metricId: e.target.value, visual: m?.visuals?.includes(f.visual) ? f.visual : (m?.visuals?.[0] ?? 'kpi') })) }}>
                {['comercial', 'helpdesk'].map((mod) => (
                  <optgroup key={mod} label={mod === 'comercial' ? 'Comercial' : 'Helpdesk / TI'}>
                    {catalogo.filter((m) => m.modulo === mod).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Visual</label>
                <select className={inputCls} value={blocoForm.visual} onChange={(e) => setBlocoForm((f) => ({ ...f, visual: e.target.value }))}>
                  {(metricSel?.visuals ?? ['kpi']).map((v: string) => <option key={v} value={v}>{VISUAL_LABEL[v] ?? v}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Largura (de 12)</label>
                <input type="number" min={1} max={12} className={inputCls} value={blocoForm.colSpan} onChange={(e) => setBlocoForm((f) => ({ ...f, colSpan: Math.min(12, Math.max(1, Number(e.target.value) || 6)) }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Rótulo (opcional)</label>
              <input className={inputCls} placeholder={metricSel?.label ?? ''} value={blocoForm.label} onChange={(e) => setBlocoForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlocoModal({ open: false })}>Cancelar</Button>
            <Button onClick={salvarBloco} style={{ backgroundColor: accent }} className="text-white">{blocoModal.editId ? 'Salvar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableFolha({ folha, active, onSelect, onRename, onDelete }: { folha: any; active: boolean; onSelect: () => void; onRename: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folha.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 ${active ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20' : 'border-border'}`}>
      <button className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground" {...attributes} {...listeners} title="Arrastar"><GripVertical className="h-4 w-4" /></button>
      <button className="text-sm flex-1 truncate text-left" onClick={onSelect}>{folha.titulo}</button>
      <Badge variant="secondary" className="text-[10px]">{folha.blocos.length} blocos</Badge>
      <button onClick={onRename} className="p-1 text-muted-foreground hover:text-foreground" title="Renomear"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-red-500" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )
}

function SortableBloco({ bloco, label, onEdit, onDuplicate, onDelete }: { bloco: any; label: string; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bloco.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-2">
      <button className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground" {...attributes} {...listeners} title="Arrastar"><GripVertical className="h-4 w-4" /></button>
      <Badge variant="secondary" className="text-[10px] shrink-0">{VISUAL_LABEL[bloco.visual] ?? bloco.visual}</Badge>
      <span className="text-sm flex-1 truncate">{label}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">{bloco.config?.colSpan ?? 6}/12</span>
      <button onClick={onEdit} className="p-1 text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onDuplicate} className="p-1 text-muted-foreground hover:text-foreground" title="Duplicar"><Copy className="h-3.5 w-3.5" /></button>
      <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-red-500" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )
}
