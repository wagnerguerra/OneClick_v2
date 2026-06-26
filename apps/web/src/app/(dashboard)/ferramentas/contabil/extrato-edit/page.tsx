'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  FileSpreadsheet, UploadCloud, Download, Loader2, Link2, Users, ArrowRight, Check, AlertTriangle, GripVertical,
} from 'lucide-react'
import {
  Button, Card, Badge, cn, Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { PageHeader } from '@/components/page-header'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { alerts } from '@/lib/alerts'
import { parseExtratoFile, type ParsedExtrato } from './_lib/parseExtrato'
import { exportExtrato } from './_lib/exportExtrato'
import { parseRegistryFile } from './_lib/parseRegistry'
import { importEntidades, lookupCnpj, fetchCounts, type Counts, type EntidadeTipo } from './_lib/registryApi'
import { detectCodigoColumn, projectRows, cellPreview } from './_lib/columns'
import { FERRAMENTAS_COLOR } from '../../_config/catalog'

const BLOCK_COLOR = FERRAMENTAS_COLOR // identidade roxa das Ferramentas
const ACTION = BLOCK_COLOR
const GLASS = 'border border-border/50 bg-card/70 backdrop-blur-xl shadow-xl shadow-black/[0.04] dark:shadow-black/20'
const accent = { background: `linear-gradient(135deg, ${ACTION}, color-mix(in srgb, ${ACTION} 78%, #000))` } as const
const PREVIEW_ROWS = 50
const tipoLabel = (t: EntidadeTipo) => (t === 'cliente' ? 'Clientes' : 'Fornecedores')

type CnpjInfo = { matched: number; total: number; tipo: EntidadeTipo; label: string }

export default function ExtratoEditPage() {
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedExtrato | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const [linking, setLinking] = useState(false)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [cnpjInfo, setCnpjInfo] = useState<CnpjInfo | null>(null)
  const [cadastroOpen, setCadastroOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const codigoCol = useMemo(() => (parsed ? detectCodigoColumn(parsed.headers) : null), [parsed])

  const linkCnpj = useCallback(async (data: ParsedExtrato) => {
    const info = detectCodigoColumn(data.headers)
    if (!info) return
    setLinking(true)
    try {
      const cnts = await fetchCounts().catch(() => null)
      if (cnts) setCounts(cnts)
      const codigos = Array.from(new Set(data.rows.map((r) => String(r[info.index] ?? '').trim()).filter(Boolean)))
      const matches = codigos.length ? await lookupCnpj(info.tipo, codigos) : {}
      const cnpjIdx = data.headers.indexOf('CNPJ')
      let headers: string[]
      let rows = data.rows
      if (cnpjIdx >= 0) {
        headers = data.headers
        rows = data.rows.map((r) => { const cod = String(r[info.index] ?? '').trim(); const nr = [...r]; nr[cnpjIdx] = matches[cod]?.cnpj ?? ''; return nr })
      } else {
        headers = [...data.headers, 'CNPJ']
        rows = data.rows.map((r) => [...r, matches[String(r[info.index] ?? '').trim()]?.cnpj ?? ''])
      }
      setParsed({ ...data, headers, rows })
      setOrder((o) => (o.includes('CNPJ') ? o : [...o, 'CNPJ']))
      setSelected((s) => new Set(s).add('CNPJ'))
      const matched = codigos.filter((c) => matches[c]?.cnpj).length
      setCnpjInfo({ matched, total: codigos.length, tipo: info.tipo, label: data.headers[info.index] ?? 'Código' })
    } catch (e) {
      console.warn('Vínculo de CNPJ falhou:', (e as Error).message)
    } finally {
      setLinking(false)
    }
  }, [])

  async function pick(list: FileList | File[] | null) {
    const f = Array.from(list ?? [])[0]
    if (!f) return
    if (!/\.(xlsx|xls)$/i.test(f.name)) { alerts.warning('Arquivo inválido', 'Envie a planilha do extrato (.xlsx).'); return }
    setParsing(true)
    setParsed(null)
    setCnpjInfo(null)
    try {
      const r = await parseExtratoFile(f)
      setParsed(r)
      setOrder(r.headers)
      setSelected(new Set(r.recommended.length ? r.recommended : r.headers))
      await linkCnpj(r)
    } catch (e) {
      alerts.error('Falha ao ler a planilha', (e as Error).message)
    } finally {
      setParsing(false)
    }
  }

  function toggle(h: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(h)) next.delete(h); else next.add(h); return next })
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setOrder((o) => arrayMove(o, o.indexOf(String(active.id)), o.indexOf(String(over.id))))
  }

  async function exportar() {
    if (!parsed) return
    const cols = order.filter((h) => selected.has(h))
    if (!cols.length) { alerts.warning('Sem colunas', 'Selecione ao menos uma coluna para exportar.'); return }
    const { headers, rows } = projectRows(parsed.headers, parsed.rows, cols)
    try { await exportExtrato(headers, rows, 'Extrato Bancário - editado.xlsx') }
    catch (e) { alerts.error('Falha ao exportar', (e as Error).message) }
  }

  const previewCols = order.filter((h) => selected.has(h))
  const semCadastro = !!codigoCol && (counts?.[codigoCol.tipo] ?? 0) === 0

  return (
    <div className="space-y-6">
      <PageHeader
        color={BLOCK_COLOR}
        icon={FileSpreadsheet}
        title="Editor de Extrato"
        subtitle="Limpa e formata o extrato bancário (.xlsx), vincula CNPJ por código e exporta."
        breadcrumb={<><span className="text-muted-foreground/70">Contábil</span><ArrowRight className="h-3 w-3" /><span>Ferramentas</span></>}
        actions={
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => setCadastroOpen(true)}>
            <Users className="h-4 w-4" /> Cadastro de clientes
          </Button>
        }
      />

      <div className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute -top-16 left-[10%] -z-10 h-72 w-2/3 rounded-full blur-3xl opacity-25"
          style={{ background: `radial-gradient(closest-side, ${ACTION}, transparent)` }} />

        <Card className={cn('overflow-hidden rounded-2xl p-0', GLASS)}>
          <div className="p-6 sm:p-7 space-y-5">
            {/* Dropzone do EXTRATO */}
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); void pick(e.dataTransfer.files) }}
              className={cn('group grid place-items-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-all duration-300', dragOver ? 'scale-[1.01]' : '')}
              style={{ borderColor: dragOver ? ACTION : `color-mix(in srgb, ${ACTION} 55%, transparent)`, backgroundColor: dragOver ? `color-mix(in srgb, ${ACTION} 9%, transparent)` : undefined }}
            >
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:-translate-y-1 pointer-events-none"
                style={{ ...accent, boxShadow: `0 12px 30px -8px color-mix(in srgb, ${ACTION} 55%, transparent)` }}>
                {parsing ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
              </div>
              <p className="text-sm font-semibold text-foreground pointer-events-none">Arraste a planilha do extrato (.xlsx) aqui</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                ou <button type="button" className="font-semibold underline decoration-dotted underline-offset-4" style={{ color: ACTION }} onClick={() => fileInput.current?.click()}>clique para selecionar</button>
              </p>
              <p className="mt-3 text-xs text-muted-foreground/80 pointer-events-none">Ex.: "Contas Pagas" do SIST · Totvs/Winthor</p>
              <input ref={fileInput} type="file" accept=".xlsx,.xls" aria-label="Extrato bancário" className="hidden" onChange={(e) => void pick(e.target.files)} />
            </div>

            {parsed && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge className="border-0 bg-muted text-muted-foreground">{parsed.rows.length} lançamentos</Badge>
                  {parsed.meta.groupApplied > 0 && <Badge className="border-0 bg-muted text-muted-foreground">Datas explodidas: {parsed.meta.groupApplied}</Badge>}
                  {parsed.meta.totalsRemoved > 0 && <Badge className="border-0 bg-muted text-muted-foreground">Totais removidos: {parsed.meta.totalsRemoved}</Badge>}
                  {parsed.meta.usedFallback && <Badge className="border-0 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">Formato genérico</Badge>}
                </div>

                {codigoCol && (
                  <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm',
                    linking ? 'border-border/60 bg-background/50'
                      : semCadastro ? 'border-amber-200/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20'
                      : 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20')}>
                    {linking ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Vinculando CNPJ por <b>{codigoCol.label ?? cnpjInfo?.label}</b>…</span>
                    ) : semCadastro ? (
                      <>
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-700 dark:text-amber-400">Coluna <b>CNPJ</b> criada por <b>{cnpjInfo?.label}</b>, mas não há {tipoLabel(codigoCol.tipo).toLowerCase()} cadastrados. Envie a planilha de cadastro para preencher.</span>
                        <Button size="sm" className="ml-auto gap-1.5 rounded-lg text-white" style={accent} onClick={() => setCadastroOpen(true)}><Users className="h-4 w-4" /> Enviar planilha de {tipoLabel(codigoCol.tipo).toLowerCase()}</Button>
                      </>
                    ) : (
                      <>
                        <Link2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-700 dark:text-emerald-400"><b>CNPJ vinculado:</b> {cnpjInfo?.matched ?? 0} de {cnpjInfo?.total ?? 0} códigos</span>
                        <Button size="sm" variant="outline" className="ml-auto gap-1.5 rounded-lg" onClick={() => setCadastroOpen(true)}><Users className="h-4 w-4" /> Atualizar cadastro</Button>
                      </>
                    )}
                  </div>
                )}

                {/* Colunas: arraste para reordenar, clique para marcar/desmarcar */}
                <div className="rounded-xl border border-border/60 bg-background/50 p-3 backdrop-blur">
                  <p className="mb-2 text-[13px] font-semibold">Colunas a exportar <span className="font-normal text-muted-foreground">· arraste para reordenar</span></p>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={order} strategy={horizontalListSortingStrategy}>
                      <div className="flex flex-wrap gap-1.5">
                        {order.map((h) => <ColumnChip key={h} id={h} on={selected.has(h)} onToggle={() => toggle(h)} />)}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>

                <div className="flex items-center">
                  <Button className="ml-auto gap-1.5 rounded-lg text-white shadow-lg transition-transform hover:-translate-y-0.5" style={accent} onClick={() => void exportar()}>
                    <Download className="h-4 w-4" /> Exportar .xlsx
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">{previewCols.map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
                        <TableRow key={ri} className="hover:bg-muted/40">
                          {previewCols.map((h) => { const ci = parsed.headers.indexOf(h); return <TableCell key={h} className="whitespace-nowrap text-xs">{cellPreview(r[ci] ?? null)}</TableCell> })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {parsed.rows.length > PREVIEW_ROWS && <p className="px-4 py-2 text-center text-xs text-muted-foreground">Prévia das primeiras {PREVIEW_ROWS} linhas · {parsed.rows.length} no total</p>}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <CadastroModal open={cadastroOpen} onClose={() => setCadastroOpen(false)} tipoSugerido={codigoCol?.tipo} onImported={() => { if (parsed) void linkCnpj(parsed) }} />
    </div>
  )
}

function ColumnChip({ id, on, onToggle }: { id: string; on: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onToggle}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, ...(on ? accent : {}) }}
      className={cn('inline-flex cursor-grab touch-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors active:cursor-grabbing',
        on ? 'border-transparent text-white' : 'border-border bg-card text-muted-foreground hover:bg-muted')}
    >
      <GripVertical className="h-3 w-3 opacity-50" />
      {on && <Check className="h-3 w-3" />}
      {id}
    </button>
  )
}

function CadastroModal({ open, onClose, tipoSugerido, onImported }: {
  open: boolean
  onClose: () => void
  tipoSugerido?: EntidadeTipo
  onImported: () => void
}) {
  const [tipo, setTipo] = useState<EntidadeTipo>(tipoSugerido ?? 'cliente')
  const [counts, setCounts] = useState<Counts | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const refreshCounts = useCallback(async () => {
    try { setCounts(await fetchCounts()) } catch { /* webapp offline */ }
  }, [])

  async function handleFile(list: FileList | File[] | null) {
    const f = Array.from(list ?? [])[0]
    if (!f) return
    setBusy(true)
    try {
      const parsed = await parseRegistryFile(f)
      if (!parsed.rows.length) { alerts.warning('Nada para importar', 'Nenhuma linha com código encontrada.'); return }
      const mismatch = parsed.detectedTipo && parsed.detectedTipo !== tipo
      const ok = await alerts.confirm({
        title: `Importar ${parsed.rows.length} como ${tipoLabel(tipo).toLowerCase()}?`,
        text: mismatch
          ? `⚠️ A planilha parece ser de ${tipoLabel(parsed.detectedTipo!).toLowerCase()}, mas você escolheu ${tipoLabel(tipo).toLowerCase()}. Será importada como ${tipoLabel(tipo).toLowerCase()}.`
          : `Colunas: ${parsed.labels.codigo} / ${parsed.labels.nome} / ${parsed.labels.cnpj}.`,
        confirmText: 'Importar', icon: mismatch ? 'warning' : 'question',
      })
      if (!ok) return
      const r = await importEntidades(tipo, parsed.rows)
      alerts.success('Cadastro importado', `${r.inserted} novos, ${r.updated} atualizados, ${r.ignored} ignorados.`)
      await refreshCounts()
      onImported()
    } catch (e) {
      alerts.error('Falha no cadastro', (e as Error).message)
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else { setTipo(tipoSugerido ?? 'cliente'); void refreshCounts() } }}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={Users} color="violet">
          <DialogTitle>Cadastro de clientes / fornecedores</DialogTitle>
          <DialogDescription>Planilha persistente usada para vincular o CNPJ pelo código no extrato. Suba uma vez; fica salva.</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {/* Seletor explícito do tipo */}
          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Esta planilha é de:</p>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(['cliente', 'fornecedor'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={cn('rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors', tipo === t ? 'text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  style={tipo === t ? accent : undefined}>
                  {tipoLabel(t)}
                </button>
              ))}
            </div>
            {counts && (
              <span className="ml-3 text-xs text-muted-foreground">No banco: {counts.cliente} clientes · {counts.fornecedor} fornecedores</span>
            )}
          </div>

          {/* Dropzone do cadastro (com drag-and-drop) */}
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy) void handleFile(e.dataTransfer.files) }}
            className={cn('grid w-full place-items-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all', dragOver ? 'scale-[1.01]' : '')}
            style={{ borderColor: dragOver ? ACTION : `color-mix(in srgb, ${ACTION} 55%, transparent)`, backgroundColor: dragOver ? `color-mix(in srgb, ${ACTION} 9%, transparent)` : undefined }}
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <UploadCloud className="h-6 w-6" style={{ color: ACTION }} />}
            <p className="mt-2 text-sm font-medium">Arraste a planilha de <b>{tipoLabel(tipo).toLowerCase()}</b> aqui</p>
            <button type="button" className="text-xs font-semibold underline decoration-dotted underline-offset-4" style={{ color: ACTION }} onClick={() => fileInput.current?.click()} disabled={busy}>ou clique para selecionar</button>
            <p className="mt-2 text-xs text-muted-foreground">PCCLIENT / PC_FORNEC (Totvs/Winthor) ou Código/Nome/CNPJ</p>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Planilha de cadastro" className="hidden" onChange={(e) => void handleFile(e.target.files)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
