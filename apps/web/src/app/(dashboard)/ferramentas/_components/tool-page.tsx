'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  UploadCloud, Download, Loader2, RefreshCw, Trash2, FileText,
  X, CheckCircle2, AlertCircle, ArrowRight, Sparkles,
} from 'lucide-react'
import {
  Button, Card, Badge, cn,
  Tabs, TabsTrigger, SlidingTabsList,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { PageHeader } from '@/components/page-header'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  submitToolJob, getToolJobStatus, toolJobDownloadUrl,
  type ToolJobStatus, type ToolJobView, type ToolFilePart,
} from '@/lib/ferramentas-api'
import type { ToolUiConfig, ToolInput } from '../_config/tools'
import { FERRAMENTAS_COLOR } from '../_config/catalog'

const POLL_MS = 1500
const GLASS = 'border border-border/50 bg-card/70 backdrop-blur-xl shadow-xl shadow-black/[0.04] dark:shadow-black/20'
// Acento das ações (botões, dropzone, checkbox, progresso) = cor do BLOCO
// (Fiscal/Contábil), via colorOf(area). Sem cor fixa.
// Padrão do design-system para SlidingTabsList sobre a capa do PageHeader:
// container translúcido (segmented control) + triggers com !relative !z-10 (texto
// acima do indicador deslizante) e só cor de texto no ativo.
const TAB_LIST = 'min-w-max !shadow-sm !border !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit'
const TAB_TRIGGER = '!relative !z-10 !rounded-full !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-[var(--tab-accent)]'

const STATUS_LABEL: Record<ToolJobStatus, string> = {
  queued: 'Na fila', running: 'Processando', done: 'Concluído', failed: 'Falhou', not_found: 'Não encontrado',
}

function colorOf(_area: ToolUiConfig['area']) {
  // Identidade roxa das Ferramentas (combina com a box do menu), igual em todos os blocos.
  return FERRAMENTAS_COLOR
}
function accentOf(color: string) {
  return { background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 78%, #000))` } as const
}
function formatBytes(n: number): string {
  if (!n) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(n) / Math.log(k))
  return `${(n / Math.pow(k, i)).toFixed(i ? 1 : 0)} ${units[i]}`
}

function StatusBadge({ status }: { status: ToolJobStatus }) {
  const tone =
    status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
      : status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
      : status === 'running' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400'
      : 'bg-muted text-muted-foreground'
  const dot =
    status === 'done' ? 'bg-emerald-500'
      : status === 'failed' ? 'bg-rose-500'
      : status === 'running' ? 'bg-sky-500 animate-pulse'
      : 'bg-muted-foreground/50'
  return (
    <Badge className={cn('gap-1.5 font-medium border-0', tone)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function ToolPage({ config }: { config: ToolUiConfig }) {
  const [tab, setTab] = useState<'converter' | 'historico'>('converter')
  const blockColor = colorOf(config.area)
  const Icon = config.icon

  return (
    <div className="space-y-6">
      <PageHeader
        color={blockColor}
        icon={Icon}
        title={config.title}
        subtitle={config.subtitle}
        breadcrumb={
          <>
            <span className="text-muted-foreground/70">{config.area === 'contabil' ? 'Contábil' : 'Fiscal'}</span>
            <ArrowRight className="h-3 w-3" />
            <span>Ferramentas</span>
          </>
        }
      >
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <SlidingTabsList activeValue={tab} className={TAB_LIST} style={{ '--tab-accent': blockColor } as CSSProperties}>
            <TabsTrigger value="converter" className={TAB_TRIGGER}>Converter</TabsTrigger>
            <TabsTrigger value="historico" className={TAB_TRIGGER}>Histórico</TabsTrigger>
          </SlidingTabsList>
        </Tabs>
      </PageHeader>

      <div className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute -top-16 left-[10%] -z-10 h-72 w-2/3 rounded-full blur-3xl opacity-25"
          style={{ background: `radial-gradient(closest-side, ${blockColor}, transparent)` }} />
        <div aria-hidden className="pointer-events-none absolute top-24 right-[5%] -z-10 h-56 w-1/3 rounded-full blur-3xl opacity-20"
          style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${blockColor} 70%, #22d3ee), transparent)` }} />

        {tab === 'converter'
          ? <ConverterTab config={config} color={blockColor} blockColor={blockColor} onDone={() => setTab('historico')} />
          : <HistoricoTab config={config} color={blockColor} />}
      </div>
    </div>
  )
}

function Dropzone({ input, color, files, onPick, disabled }: {
  input: ToolInput
  color: string
  files: File[]
  onPick: (list: FileList | null) => void
  disabled?: boolean
}) {
  const [dragOver, setDragOver] = useState(false)
  const accent = accentOf(color)
  return (
    <div className="space-y-2">
      {/* mostra o label só quando há mais de uma entrada — controlado pelo pai via input.label */}
      <div
        onDragEnter={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!disabled) onPick(e.dataTransfer.files) }}
        className={cn(
          'group relative grid place-items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300',
          dragOver ? 'scale-[1.01]' : '',
        )}
        style={{
          // Pontilhado em azul claro pra destacar; Azul Royal cheio ao arrastar.
          borderColor: dragOver ? color : `color-mix(in srgb, ${color} 55%, transparent)`,
          backgroundColor: dragOver ? `color-mix(in srgb, ${color} 9%, transparent)` : undefined,
        }}
      >
        <div
          className={cn('mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300',
            dragOver ? 'scale-110 -translate-y-1' : 'group-hover:-translate-y-1')}
          style={{ ...accent, boxShadow: `0 12px 30px -8px color-mix(in srgb, ${color} 55%, transparent)` }}
        >
          <UploadCloud className="h-7 w-7" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Arraste {input.multiple ? 'os arquivos' : 'o arquivo'} aqui
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          ou{' '}
          <label className="cursor-pointer font-semibold underline decoration-dotted underline-offset-4" style={{ color }}>
            clique para selecionar
            <input type="file" accept={input.accept} multiple={input.multiple} aria-label={input.label}
              className="hidden" disabled={disabled} onChange={(e) => onPick(e.target.files)} />
          </label>
        </p>
        {input.hint && <p className="mt-3 text-xs text-muted-foreground/80">{input.hint}</p>}
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 px-3 py-2 backdrop-blur">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConverterTab({ config, color, blockColor, onDone }: { config: ToolUiConfig; color: string; blockColor: string; onDone: () => void }) {
  const [filesByField, setFilesByField] = useState<Record<string, File[]>>({})
  const [extraFields, setExtraFields] = useState<Record<string, string>>({})
  const [extrasBlocked, setExtrasBlocked] = useState(false)
  const [job, setJob] = useState<ToolJobView | null>(null)
  const [busy, setBusy] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accent = accentOf(color)
  const blockAccent = accentOf(blockColor)
  const Extras = config.Extras

  const stopPoll = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = null
  }, [])
  useEffect(() => () => stopPoll(), [stopPoll])

  const poll = useCallback(async (id: string) => {
    try {
      const status = await getToolJobStatus(config.tool, id)
      setJob(status)
      if (status.status === 'done' || status.status === 'failed' || status.status === 'not_found') {
        stopPoll()
        if (status.status === 'failed') alerts.error('Falha no processamento', status.errorMessage ?? '')
        return
      }
      pollRef.current = setTimeout(() => void poll(id), POLL_MS)
    } catch (e) {
      stopPoll()
      alerts.error('Erro ao consultar status', (e as Error).message)
    }
  }, [config.tool, stopPoll])

  function pickFor(input: ToolInput, list: FileList | null) {
    if (!list?.length) return
    const incoming = Array.from(list)
    setFilesByField((prev) => ({ ...prev, [input.field]: input.multiple ? [...(prev[input.field] ?? []), ...incoming] : [incoming[0]!] }))
    setJob(null)
  }

  const ready = config.inputs.filter((inp) => !inp.optional).every((inp) => (filesByField[inp.field]?.length ?? 0) > 0) && !extrasBlocked
  const processing = job != null && (job.status === 'queued' || job.status === 'running')

  async function handleUpload() {
    if (!ready) return
    setBusy(true)
    setJob(null)
    try {
      const parts: ToolFilePart[] = config.inputs.map((inp) => ({ field: inp.field, files: filesByField[inp.field] ?? [] }))
      const created = await submitToolJob(config.tool, parts, extraFields)
      setJob({ id: created.id, tool: config.tool, status: created.status })
      void poll(created.id)
    } catch (e) {
      alerts.error('Falha no envio', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr] items-start">
      <Card className={cn('overflow-hidden rounded-2xl p-0', GLASS)}>
        <div className="p-6 sm:p-7 space-y-5">
          {config.inputs.map((inp) => (
            <div key={inp.field} className="space-y-2">
              {config.inputs.length > 1 && (
                <p className="text-[13px] font-semibold text-foreground">{inp.label}</p>
              )}
              <Dropzone input={inp} color={color} files={filesByField[inp.field] ?? []} onPick={(l) => pickFor(inp, l)} disabled={processing} />
            </div>
          ))}

          {Extras && <Extras files={filesByField} color={color} onFields={setExtraFields} onBlock={setExtrasBlocked} />}

          <Button
            onClick={handleUpload}
            disabled={!ready || busy || processing}
            className="h-11 w-full gap-2 rounded-xl text-[15px] font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 disabled:translate-y-0"
            style={{ ...accent, boxShadow: `0 10px 26px -10px color-mix(in srgb, ${color} 60%, transparent)` }}
          >
            {busy || processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {processing ? 'Processando…' : (config.submitLabel ?? 'Converter para XLSX')}
          </Button>

          {job && (
            <div className={cn('rounded-xl border p-4 space-y-3 transition-colors',
              job.status === 'done' ? 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                : job.status === 'failed' ? 'border-rose-200/70 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20'
                : 'border-border/60 bg-background/50 backdrop-blur')}>
              <div className="flex items-center justify-between">
                <StatusBadge status={job.status} />
                {typeof job.progress === 'number' && processing && (
                  <span className="text-xs font-semibold text-muted-foreground">{job.progress}%</span>
                )}
              </div>
              {processing && (
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${job.progress ?? 8}%`, ...accent }} />
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                </div>
              )}
              {job.status === 'done' && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Planilha pronta!
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <a href={toolJobDownloadUrl(config.tool, job.id)}>
                      <Button size="sm" className="gap-1.5 rounded-lg text-white" style={accent}>
                        <Download className="h-4 w-4" /> Baixar planilha
                      </Button>
                    </a>
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={onDone}>Histórico</Button>
                  </div>
                </div>
              )}
              {job.status === 'failed' && (
                <p className="flex items-start gap-1.5 text-sm text-rose-700 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {job.errorMessage || 'Não foi possível processar o arquivo.'}
                </p>
              )}
            </div>
          )}
        </div>
        <style>{`@keyframes shimmer{100%{transform:translateX(100%)}}`}</style>
      </Card>

      <Card className={cn('rounded-2xl p-6', GLASS)}>
        <div className="flex items-center gap-2 pb-4">
          <Sparkles className="h-4 w-4" style={{ color: blockColor }} />
          <span className="text-sm font-semibold">Como funciona</span>
        </div>
        <ol className="space-y-4">
          {config.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-md" style={blockAccent}>
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">{s.t}</p>
                <p className="text-xs text-muted-foreground">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        {config.note && (
          <div className="mt-5 rounded-xl border border-border/50 bg-background/50 px-3.5 py-3 text-xs text-muted-foreground backdrop-blur">
            {config.note}
          </div>
        )}
      </Card>
    </div>
  )
}

function HistoricoTab({ config, color }: { config: ToolUiConfig; color: string }) {
  const [jobs, setJobs] = useState<ToolJobView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.ferramentas.list as { query: (i: unknown) => Promise<{ data: ToolJobView[] }> }).query({
        page: 1, limit: 20, sortDir: 'desc', tool: config.tool,
      })
      setJobs(res.data)
    } catch (e) {
      alerts.error('Erro ao carregar histórico', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [config.tool])

  useEffect(() => { void load() }, [load])

  async function handleDelete(id: string) {
    const ok = await alerts.confirmDelete('este job')
    if (!ok) return
    try {
      await (trpc.ferramentas.remove as { mutate: (i: unknown) => Promise<unknown> }).mutate({ id })
      void load()
    } catch (e) {
      alerts.error('Erro ao excluir', (e as Error).message)
    }
  }

  return (
    <Card className={cn('relative overflow-hidden rounded-2xl p-0', GLASS)}>
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-2">
          <config.icon className="h-4 w-4" style={{ color }} />
          <span className="text-sm font-semibold">{config.title}</span>
          {jobs.length > 0 && <Badge className="ml-1 border-0 bg-muted text-muted-foreground">{jobs.length}</Badge>}
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[64px]">#</TableHead>
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead>Arquivo</TableHead>
            <TableHead className="w-[170px]">Criado em</TableHead>
            <TableHead className="w-[110px] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!jobs.length ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                  <config.icon className="h-7 w-7" style={{ color }} />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma conversão ainda</p>
                <p className="text-xs text-muted-foreground">Os arquivos convertidos aparecem aqui.</p>
              </TableCell>
            </TableRow>
          ) : (
            jobs.map((j) => (
              <TableRow key={j.id} className="whitespace-nowrap hover:bg-muted/40">
                <TableCell className="font-mono text-xs text-muted-foreground">{j.code ?? '—'}</TableCell>
                <TableCell><StatusBadge status={j.status} /></TableCell>
                <TableCell className="text-sm">
                  <span className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="block max-w-[280px] truncate">{j.fileNameOut ?? j.fileNameIn ?? '—'}</span>
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {j.createdAt ? new Date(j.createdAt).toLocaleString('pt-BR') : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {j.status === 'done' && (
                      <a href={toolJobDownloadUrl(config.tool, j.id)}>
                        <Button size="icon-sm" variant="ghost" title="Baixar"><Download className="h-4 w-4" /></Button>
                      </a>
                    )}
                    <Button size="icon-sm" variant="ghost" className="text-destructive" title="Excluir" onClick={() => void handleDelete(j.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  )
}
