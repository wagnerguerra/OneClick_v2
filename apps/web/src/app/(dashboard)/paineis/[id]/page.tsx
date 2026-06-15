'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Monitor, ArrowLeft, Plus, Trash2, Loader2, Save,
  LayoutGrid, RefreshCw, ExternalLink, Pencil, Copy, GripVertical, X,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { Button, Card, Badge } from '@saas/ui'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  const [entidades, setEntidades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFolha, setActiveFolha] = useState<string | null>(null)
  const [meta, setMeta] = useState<any>(null)
  const [savingMeta, setSavingMeta] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)

  // Modal de bloco
  const [blocoModal, setBlocoModal] = useState<{ open: boolean; editId?: string }>({ open: false })
  const customVazio = { entidade: 'clientes', agregacao: 'count', campo: '', groupBy: '', formato: 'number', usarPeriodo: false, filtros: [] as any[] }
  const [blocoForm, setBlocoForm] = useState({ metricId: '', visual: '', label: '', colSpan: 6, rowSpan: 1, size: 'lg', color: '', periodoDias: 0, limite: 0, comparar: false, custom: { ...customVazio } })

  const load = useCallback(async () => {
    try {
      const [p, cat, ents] = await Promise.all([
        (trpc.painelTv as any).getById.query({ id }),
        (trpc.painelTv as any).catalogo.query(),
        (trpc.painelTv as any).entidades.query().catch(() => []),
      ])
      setPainel(p)
      setCatalogo(cat ?? [])
      setEntidades(ents ?? [])
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
    setBlocoForm({ metricId: first?.id ?? '', visual: first?.visuals?.[0] ?? 'kpi', label: '', colSpan: 6, rowSpan: 1, size: 'lg', color: '', periodoDias: 0, limite: 0, comparar: false, custom: { ...customVazio } })
    setBlocoModal({ open: true })
  }
  const abrirEditarBloco = (b: any) => {
    const c = b.config ?? {}
    setBlocoForm({ metricId: b.metricId, visual: b.visual, label: c.label ?? '', colSpan: c.colSpan ?? 6, rowSpan: c.rowSpan ?? 1, size: c.size ?? 'lg', color: c.color ?? '', periodoDias: c.periodoDias ?? 0, limite: c.limite ?? 0, comparar: !!c.comparar, custom: { ...customVazio, ...(c.custom ?? {}) } })
    setBlocoModal({ open: true, editId: b.id })
  }
  const salvarBloco = async () => {
    const isCustom = blocoForm.metricId === '__custom__'
    const cstm = blocoForm.custom
    const grouped = isCustom && !!cstm.groupBy
    // Visual efetivo: custom agrupado -> donut/bar; custom valor -> kpi.
    const visual = isCustom ? (grouped ? (['donut', 'bar'].includes(blocoForm.visual) ? blocoForm.visual : 'donut') : 'kpi') : blocoForm.visual
    const ehKpi = visual === 'kpi'

    const config: any = { colSpan: blocoForm.colSpan }
    if (blocoForm.label.trim()) config.label = blocoForm.label.trim()
    if (blocoForm.rowSpan > 1) config.rowSpan = blocoForm.rowSpan
    if (ehKpi && blocoForm.size && blocoForm.size !== 'lg') config.size = blocoForm.size
    if (blocoForm.color.trim()) config.color = blocoForm.color.trim()
    if (blocoForm.periodoDias > 0) config.periodoDias = blocoForm.periodoDias
    if (blocoForm.limite > 0) config.limite = blocoForm.limite
    const podeComparar = ehKpi && blocoForm.comparar && (isCustom ? cstm.usarPeriodo : !!metricSel?.comparavel)
    if (podeComparar) config.comparar = true

    if (isCustom) {
      if (!cstm.entidade) { alerts.error('Métrica personalizada', 'Escolha a entidade.'); return }
      if (cstm.agregacao !== 'count' && !cstm.campo) { alerts.error('Métrica personalizada', 'Escolha o campo da agregação.'); return }
      config.custom = {
        entidade: cstm.entidade,
        agregacao: cstm.agregacao,
        ...(cstm.agregacao !== 'count' && cstm.campo ? { campo: cstm.campo } : {}),
        ...(cstm.groupBy ? { groupBy: cstm.groupBy } : {}),
        ...(!grouped ? { formato: cstm.formato } : {}),
        usarPeriodo: !!cstm.usarPeriodo,
        filtros: (cstm.filtros ?? []).filter((f: any) => f.campo && f.op),
      }
    }
    try {
      if (blocoModal.editId) {
        await (trpc.painelTv as any).updateBloco.mutate({ id: blocoModal.editId, data: { metricId: blocoForm.metricId, visual, config } })
      } else {
        await (trpc.painelTv as any).createBloco.mutate({ folhaId: activeFolha, metricId: blocoForm.metricId, visual, config })
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
  const isCustom = blocoForm.metricId === '__custom__'
  const customEnt = entidades.find((e) => e.id === blocoForm.custom.entidade)
  const setCustom = (patch: any) => setBlocoForm((f) => ({ ...f, custom: { ...f.custom, ...patch } }))

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
          {/* Folhas + blocos (accordion: clicar na folha expande os blocos dela) */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><LayoutGrid className="h-4 w-4" style={{ color: accent }} /> Folhas e blocos</h3>
              <Button size="sm" variant="outline" onClick={addFolha}><Plus className="h-4 w-4 mr-1" /> Folha</Button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragFolhas}>
              <SortableContext items={painel.folhas.map((f: any) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {painel.folhas.map((f: any) => (
                    <div key={f.id}>
                      <SortableFolha folha={f} expanded={activeFolha === f.id} onToggle={() => setActiveFolha((cur) => cur === f.id ? null : f.id)} onRename={() => renomearFolha(f)} onDelete={() => excluirFolha(f)} />
                      {activeFolha === f.id && (
                        <div className="mt-1.5 mb-2 ml-3 pl-3 border-l-2 space-y-1.5" style={{ borderColor: accent }}>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Blocos desta folha</span>
                            <Button size="sm" variant="outline" onClick={abrirNovoBloco} disabled={!catalogo.length}><Plus className="h-4 w-4 mr-1" /> Bloco</Button>
                          </div>
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragBlocos}>
                            <SortableContext items={f.blocos.map((b: any) => b.id)} strategy={verticalListSortingStrategy}>
                              <div className="space-y-1.5">
                                {f.blocos.map((b: any) => (
                                  <SortableBloco key={b.id} bloco={b} label={b.config?.label ?? metricById[b.metricId]?.label ?? (b.metricId === '__custom__' ? 'Personalizada' : b.metricId)} onEdit={() => abrirEditarBloco(b)} onDuplicate={() => duplicarBloco(b)} onDelete={() => excluirBloco(b)} />
                                ))}
                                {f.blocos.length === 0 && <p className="text-xs text-muted-foreground py-2">Folha vazia. Adicione blocos do catálogo.</p>}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </div>
                      )}
                    </div>
                  ))}
                  {painel.folhas.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhuma folha. Adicione a primeira.</p>}
                </div>
              </SortableContext>
            </DndContext>
          </Card>
        </div>

        {/* Preview ao vivo */}
        <Card className="p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold text-muted-foreground">Preview ao vivo</span>
            <Button size="icon-sm" variant="ghost" onClick={() => setPreviewKey((k) => k + 1)} title="Atualizar preview"><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="relative w-full rounded-lg overflow-hidden border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
            {/* Desmonta o iframe enquanto o modal de bloco está aberto: o iframe
                rotativo dispara eventos de foco que faziam o Radix Dialog fechar
                instantaneamente (abre e some). */}
            {blocoModal.open ? (
              <div className="absolute inset-0 flex items-center justify-center text-white/45 text-sm">Preview pausado durante a edição…</div>
            ) : (
              <iframe key={previewKey} src={`/tv/${painel.slug}`} className="absolute inset-0 w-full h-full" title="preview" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 px-1">Reflete o que está salvo. Após editar, clique em atualizar.</p>
        </Card>
      </div>

      {/* Modal de bloco — overlay próprio (sem Radix Dialog, que não renderizava
          de forma confiável nesta tela). Controlado por blocoModal.open. */}
      {blocoModal.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setBlocoModal({ open: false }) }}>
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <span className="flex h-9 w-9 items-center justify-center rounded-md text-white shrink-0" style={{ background: accent }}><LayoutGrid className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-none">{blocoModal.editId ? 'Editar bloco' : 'Adicionar bloco'}</h3>
                <p className="text-sm text-muted-foreground mt-1">Escolha a métrica do catálogo e como exibir.</p>
              </div>
              <button onClick={() => setBlocoModal({ open: false })} className="ml-auto p-1.5 rounded-md text-muted-foreground hover:bg-muted shrink-0"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Métrica</label>
              <select className={inputCls} value={blocoForm.metricId} onChange={(e) => { const v = e.target.value; const m = metricById[v]; setBlocoForm((f) => ({ ...f, metricId: v, visual: v === '__custom__' ? 'kpi' : (m?.visuals?.includes(f.visual) ? f.visual : (m?.visuals?.[0] ?? 'kpi')) })) }}>
                <optgroup label="✨ Personalizada">
                  <option value="__custom__">Métrica personalizada (montar do zero)</option>
                </optgroup>
                {['comercial', 'helpdesk'].map((mod) => (
                  <optgroup key={mod} label={mod === 'comercial' ? 'Comercial' : 'Helpdesk / TI'}>
                    {catalogo.filter((m) => m.modulo === mod).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {isCustom && (
              <div className="space-y-3 rounded-lg border border-indigo-300/40 bg-indigo-50/40 dark:bg-indigo-950/15 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold">Entidade</label>
                    <select className={inputCls} value={blocoForm.custom.entidade} onChange={(e) => setCustom({ entidade: e.target.value, campo: '', groupBy: '', filtros: [] })}>
                      {entidades.map((en) => <option key={en.id} value={en.id}>{en.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold">Cálculo</label>
                    <select className={inputCls} value={blocoForm.custom.agregacao} onChange={(e) => setCustom({ agregacao: e.target.value })}>
                      <option value="count">Contagem (qtd)</option>
                      <option value="sum">Soma</option>
                      <option value="avg">Média</option>
                      <option value="min">Mínimo</option>
                      <option value="max">Máximo</option>
                    </select>
                  </div>
                </div>
                {blocoForm.custom.agregacao !== 'count' && (
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold">Campo (numérico)</label>
                    <select className={inputCls} value={blocoForm.custom.campo} onChange={(e) => setCustom({ campo: e.target.value })}>
                      <option value="">— escolha —</option>
                      {(customEnt?.campos ?? []).filter((c: any) => c.tipo === 'number').map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold">Agrupar por</label>
                    <select className={inputCls} value={blocoForm.custom.groupBy} onChange={(e) => { const g = e.target.value; setCustom({ groupBy: g }); setBlocoForm((f) => ({ ...f, visual: g ? (['donut', 'bar'].includes(f.visual) ? f.visual : 'donut') : 'kpi' })) }}>
                      <option value="">— nenhum (KPI único) —</option>
                      {(customEnt?.campos ?? []).filter((c: any) => c.tipo !== 'date' && c.tipo !== 'number').map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  {!blocoForm.custom.groupBy && (
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-semibold">Formato</label>
                      <select className={inputCls} value={blocoForm.custom.formato} onChange={(e) => setCustom({ formato: e.target.value })}>
                        <option value="number">Número</option>
                        <option value="currency">Moeda (R$)</option>
                      </select>
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={blocoForm.custom.usarPeriodo} onChange={(e) => setCustom({ usarPeriodo: e.target.checked })} />
                  Filtrar pela data ({(customEnt?.campos ?? []).find((c: any) => c.tipo === 'date')?.label ?? 'data'}) no período do bloco/painel
                </label>
                {/* Filtros */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-semibold">Filtros</label>
                    <Button type="button" size="sm" variant="outline" onClick={() => setCustom({ filtros: [...blocoForm.custom.filtros, { campo: customEnt?.campos?.[0]?.id ?? '', op: 'eq', valor: '' }] })}><Plus className="h-3.5 w-3.5 mr-1" /> Filtro</Button>
                  </div>
                  {blocoForm.custom.filtros.map((flt: any, i: number) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-center">
                      <select className={inputCls} value={flt.campo} onChange={(e) => setCustom({ filtros: blocoForm.custom.filtros.map((x: any, j: number) => j === i ? { ...x, campo: e.target.value } : x) })}>
                        {(customEnt?.campos ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <select className={`${inputCls} w-[5rem]`} value={flt.op} onChange={(e) => setCustom({ filtros: blocoForm.custom.filtros.map((x: any, j: number) => j === i ? { ...x, op: e.target.value } : x) })}>
                        <option value="eq">=</option><option value="ne">≠</option><option value="gt">&gt;</option><option value="lt">&lt;</option><option value="gte">≥</option><option value="lte">≤</option><option value="contains">contém</option>
                      </select>
                      <input className={inputCls} value={flt.valor} placeholder="valor" onChange={(e) => setCustom({ filtros: blocoForm.custom.filtros.map((x: any, j: number) => j === i ? { ...x, valor: e.target.value } : x) })} />
                      <button onClick={() => setCustom({ filtros: blocoForm.custom.filtros.filter((_: any, j: number) => j !== i) })} className="p-1 text-muted-foreground hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Visual</label>
                <select className={inputCls} value={blocoForm.visual} onChange={(e) => setBlocoForm((f) => ({ ...f, visual: e.target.value }))}>
                  {(isCustom ? (blocoForm.custom.groupBy ? ['donut', 'bar'] : ['kpi']) : (metricSel?.visuals ?? ['kpi'])).map((v: string) => <option key={v} value={v}>{VISUAL_LABEL[v] ?? v}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Largura (1–12)</label>
                <input type="number" min={1} max={12} className={inputCls} value={blocoForm.colSpan} onChange={(e) => setBlocoForm((f) => ({ ...f, colSpan: Math.min(12, Math.max(1, Number(e.target.value) || 6)) }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Altura (linhas)</label>
                <input type="number" min={1} max={4} className={inputCls} value={blocoForm.rowSpan} onChange={(e) => setBlocoForm((f) => ({ ...f, rowSpan: Math.min(4, Math.max(1, Number(e.target.value) || 1)) }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {blocoForm.visual === 'kpi' ? (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold">Tamanho da fonte</label>
                  <select className={inputCls} value={blocoForm.size} onChange={(e) => setBlocoForm((f) => ({ ...f, size: e.target.value }))}>
                    <option value="md">Normal</option>
                    <option value="lg">Grande</option>
                    <option value="hero">Gigante</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold">Limite (top-N)</label>
                  <input type="number" min={0} max={50} className={inputCls} value={blocoForm.limite} placeholder="auto" onChange={(e) => setBlocoForm((f) => ({ ...f, limite: Math.max(0, Number(e.target.value) || 0) }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Cor (opcional)</label>
                <div className="flex gap-1.5">
                  <input type="color" value={blocoForm.color || accent} onChange={(e) => setBlocoForm((f) => ({ ...f, color: e.target.value }))} className="h-9 w-10 rounded border border-border bg-transparent cursor-pointer" />
                  <input className={`${inputCls} font-mono`} value={blocoForm.color} placeholder="accent" onChange={(e) => setBlocoForm((f) => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Período (dias)</label>
                <input type="number" min={0} max={365} className={inputCls} value={blocoForm.periodoDias} placeholder="herda" onChange={(e) => setBlocoForm((f) => ({ ...f, periodoDias: Math.max(0, Number(e.target.value) || 0) }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Rótulo (opcional)</label>
              <input className={inputCls} placeholder={metricSel?.label ?? ''} value={blocoForm.label} onChange={(e) => setBlocoForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            {blocoForm.visual === 'kpi' && (isCustom ? blocoForm.custom.usarPeriodo : metricSel?.comparavel) && (
              <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-border bg-muted/30 px-3 py-2">
                <input type="checkbox" checked={blocoForm.comparar} onChange={(e) => setBlocoForm((f) => ({ ...f, comparar: e.target.checked }))} />
                Comparar com o período anterior (mostra variação %)
              </label>
            )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <Button variant="outline" onClick={() => setBlocoModal({ open: false })}>Cancelar</Button>
              <Button onClick={salvarBloco} style={{ backgroundColor: accent }} className="text-white">{blocoModal.editId ? 'Salvar' : 'Adicionar'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableFolha({ folha, expanded, onToggle, onRename, onDelete }: { folha: any; expanded: boolean; onToggle: () => void; onRename: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folha.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 ${expanded ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20' : 'border-border'}`}>
      <button className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground" {...attributes} {...listeners} title="Arrastar"><GripVertical className="h-4 w-4" /></button>
      <button className="flex items-center gap-1.5 text-sm flex-1 truncate text-left" onClick={onToggle} title={expanded ? 'Recolher' : 'Abrir blocos'}>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="truncate">{folha.titulo}</span>
      </button>
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
