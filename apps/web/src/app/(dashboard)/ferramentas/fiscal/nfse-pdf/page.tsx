'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  FileText, FolderOpen, FileUp, Loader2, Download, FileSpreadsheet,
  CheckCircle2, AlertTriangle, Sparkles, ArrowRight,
} from 'lucide-react'
import { Button, Card, Badge, cn, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@saas/ui'
import { PageHeader } from '@/components/page-header'
import { alerts } from '@/lib/alerts'
import { generateDanfseZip, type GenResult } from './_lib/generateZip'
import { downloadRetencaoPdf, downloadRetencaoReport } from './_lib/retencaoReport'
import { fmtBRL } from './_lib/format'
import { colorForArea } from '../../_config/catalog'

const BLOCK_COLOR = colorForArea('fiscal') // cor do bloco Fiscal, fallback Ferramentas
const ACTION = BLOCK_COLOR
const GLASS = 'border border-border/50 bg-card/70 backdrop-blur-xl shadow-xl shadow-black/[0.04] dark:shadow-black/20'
const accent = { background: `linear-gradient(135deg, ${ACTION}, color-mix(in srgb, ${ACTION} 78%, #000))` } as const
// webkitdirectory: faz o <input> abrir como seletor de PASTA (Chrome/Edge).
const DIR_ATTRS = { webkitdirectory: '', directory: '' } as Record<string, string>

function onlyXml(list: FileList | File[] | null): File[] {
  return Array.from(list ?? []).filter((f) => f.name.toLowerCase().endsWith('.xml'))
}

export default function NfsePdfPage() {
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<GenResult | null>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const pick = useCallback((list: FileList | File[] | null) => {
    const xml = onlyXml(list)
    if (!xml.length) { alerts.warning('Sem XMLs', 'Selecione uma pasta (ou arquivos) com XMLs de NFS-e.'); return }
    setFiles(xml)
    setResult(null)
  }, [])

  async function handleGenerate() {
    if (!files.length) return
    setGenerating(true)
    setResult(null)
    setProgress({ done: 0, total: files.length })
    try {
      const r = await generateDanfseZip(files, (done, total) => setProgress({ done, total }))
      setResult(r)
      if (r.geradosNfse + r.geradosEvento === 0) {
        alerts.warning('Nada gerado', 'Nenhum XML de NFS-e válido foi encontrado.')
      }
    } catch (e) {
      alerts.error('Falha ao gerar', (e as Error).message)
    } finally {
      setGenerating(false)
      setProgress(null)
    }
  }

  async function baixarRetencao(formato: 'pdf' | 'xlsx') {
    if (!result?.retencoes.length) return
    try {
      if (formato === 'pdf') await downloadRetencaoPdf(result.retencoes)
      else await downloadRetencaoReport(result.retencoes)
    } catch (e) {
      alerts.error('Falha no relatório', (e as Error).message)
    }
  }

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const retencoes = result?.retencoes ?? []
  const totalRet = useMemo(() => retencoes.reduce((a, r) => a + (r.totalFederais || 0) + (r.issqnRetido || 0), 0), [retencoes])

  return (
    <div className="space-y-6">
      <PageHeader
        color={BLOCK_COLOR}
        icon={FileText}
        title="NFS-e → PDF (DANFSe)"
        subtitle="Gera o DANFSe (PDF) de cada NFS-e a partir dos XMLs — tudo no navegador."
        breadcrumb={<><span className="text-muted-foreground/70">Fiscal</span><ArrowRight className="h-3 w-3" /><span>Ferramentas</span></>}
      />

      <div className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute -top-16 left-[10%] -z-10 h-72 w-2/3 rounded-full blur-3xl opacity-25"
          style={{ background: `radial-gradient(closest-side, ${ACTION}, transparent)` }} />

        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr] items-start">
          <Card className={cn('overflow-hidden rounded-2xl p-0', GLASS)}>
            <div className="p-6 sm:p-7 space-y-5">
              {/* Seletor */}
              <div
                onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files) }}
                className={cn('group grid place-items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300', dragOver ? 'scale-[1.01]' : '')}
                style={{
                  borderColor: dragOver ? ACTION : `color-mix(in srgb, ${ACTION} 55%, transparent)`,
                  backgroundColor: dragOver ? `color-mix(in srgb, ${ACTION} 9%, transparent)` : undefined,
                }}
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:-translate-y-1"
                  style={{ ...accent, boxShadow: `0 12px 30px -8px color-mix(in srgb, ${ACTION} 55%, transparent)` }}>
                  <FolderOpen className="h-7 w-7" />
                </div>
                <p className="text-sm font-semibold text-foreground">Selecione a pasta com os XMLs de NFS-e</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => dirInput.current?.click()}>
                    <FolderOpen className="h-4 w-4" /> Escolher pasta
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => fileInput.current?.click()}>
                    <FileUp className="h-4 w-4" /> Escolher arquivos
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground/80">XMLs de NFS-e (padrão nacional). Eventos viram PDF de evento.</p>
                <input ref={dirInput} type="file" accept=".xml" multiple aria-label="Pasta de XMLs" className="hidden" {...DIR_ATTRS} onChange={(e) => pick(e.target.files)} />
                <input ref={fileInput} type="file" accept=".xml" multiple aria-label="Arquivos XML" className="hidden" onChange={(e) => pick(e.target.files)} />
              </div>

              {files.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="flex-1 text-sm font-medium">{files.length} XML{files.length > 1 ? 's' : ''} selecionado{files.length > 1 ? 's' : ''}</p>
                  {!generating && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => { setFiles([]); setResult(null) }}>Limpar</Button>}
                </div>
              )}

              <Button onClick={handleGenerate} disabled={!files.length || generating}
                className="h-11 w-full gap-2 rounded-xl text-[15px] font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 disabled:translate-y-0"
                style={{ ...accent, boxShadow: `0 10px 26px -10px color-mix(in srgb, ${ACTION} 60%, transparent)` }}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? `Gerando… ${pct}%` : 'Gerar DANFSe (.zip)'}
              </Button>

              {generating && progress && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, ...accent }} />
                </div>
              )}

              {result && (
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {result.geradosNfse} DANFSe{result.geradosEvento > 0 ? ` + ${result.geradosEvento} evento(s)` : ''} gerado(s)
                  </p>
                  {result.ignorados.length > 0 && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="inline h-3.5 w-3.5" /> {result.ignorados.length} ignorado(s)
                      </summary>
                      <ul className="mt-1 space-y-0.5 pl-4">
                        {result.ignorados.slice(0, 20).map((g, i) => <li key={i}>• {g.arquivo}: {g.motivo}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
            <style>{`@keyframes shimmer{100%{transform:translateX(100%)}}`}</style>
          </Card>

          <Card className={cn('rounded-2xl p-6', GLASS)}>
            <div className="flex items-center gap-2 pb-4">
              <Sparkles className="h-4 w-4" style={{ color: BLOCK_COLOR }} />
              <span className="text-sm font-semibold">Como funciona</span>
            </div>
            <ol className="space-y-4">
              {[
                { t: 'Escolha a pasta', d: 'XMLs de NFS-e (padrão nacional).' },
                { t: 'Geramos os PDFs', d: 'Um DANFSe por nota, fiel à NT-008, com QR.' },
                { t: 'Baixe o .zip', d: 'Todos os PDFs juntos + relatório de retenções.' },
              ].map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-md" style={{ background: `linear-gradient(135deg, ${BLOCK_COLOR}, color-mix(in srgb, ${BLOCK_COLOR} 78%, #000))` }}>{i + 1}</span>
                  <div><p className="text-sm font-semibold leading-tight">{s.t}</p><p className="text-xs text-muted-foreground">{s.d}</p></div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-xl border border-border/50 bg-background/50 px-3.5 py-3 text-xs text-muted-foreground backdrop-blur">
              Tudo roda no seu navegador — os XMLs não são enviados a nenhum servidor.
            </div>
          </Card>
        </div>

        {/* Painel de retenções */}
        {result && (
          <Card className={cn('mt-5 overflow-hidden rounded-2xl p-0', GLASS)}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" style={{ color: ACTION }} />
                <span className="text-sm font-semibold">Retenções</span>
                {retencoes.length > 0 && <Badge className="ml-1 border-0 bg-muted text-muted-foreground">{retencoes.length}</Badge>}
              </div>
              {retencoes.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Total retido: <b className="text-foreground">{fmtBRL(totalRet)}</b></span>
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => void baixarRetencao('xlsx')}><FileSpreadsheet className="h-4 w-4" /> XLSX</Button>
                  <Button size="sm" className="gap-1.5 rounded-lg text-white" style={accent} onClick={() => void baixarRetencao('pdf')}><Download className="h-4 w-4" /> PDF</Button>
                </div>
              )}
            </div>
            {retencoes.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma nota com retenção.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[90px]">Nº</TableHead>
                    <TableHead>Prestador</TableHead>
                    <TableHead>Tomador</TableHead>
                    <TableHead className="text-right">V. Serviço</TableHead>
                    <TableHead className="text-right">Federais</TableHead>
                    <TableHead className="text-right">V. Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retencoes.map((r, i) => (
                    <TableRow key={i} className="hover:bg-muted/40">
                      <TableCell className="font-mono text-xs">{r.numero || '—'}</TableCell>
                      <TableCell className="text-sm"><span className="block max-w-[220px] truncate">{r.prestadorNome || '—'}</span></TableCell>
                      <TableCell className="text-sm"><span className="block max-w-[220px] truncate">{r.tomadorNome || '—'}</span></TableCell>
                      <TableCell className="text-right text-sm">{fmtBRL(r.vServ)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtBRL(r.totalFederais)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmtBRL(r.vLiq)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
