'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, Upload, Download, Loader2, Image as ImageIcon, Settings2, FileCog, type LucideIcon,
} from 'lucide-react'
import {
  Button, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { DetectedRowsStatus } from './_components/detected-rows-status'
import { DebugViewer } from './_components/debug-viewer'
import { PendenciasPanel } from './_components/pendencias-panel'
import { fileToBase64 } from '@/lib/file'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { useUserPermissions } from '@/hooks/use-user-permissions'

interface ModelOption { id: string; nome: string; code: number }
// Tipo do retorno de `convert` inferido do tRPC — nomeado p/ uso na UI, sem
// duplicar nem castar o shape do backend (mudanças no backend propagam aqui).
type ConvertResult = Awaited<ReturnType<typeof trpc.tratamentoLancamentos.convert.mutate>>
type CellValue = string | number | boolean | null
// Tabela extraída no preview (pós-upload) que o cliente CARREGA: reenviada no
// convert (evita re-extração) e usada pelo painel de pendências.
interface ExtractedTable { headers: string[]; rows: Array<Record<string, CellValue>>; truncated: boolean }

const ACCEPT = ['.xlsx', '.xls', '.csv', '.pdf']
const extOk = (name: string) => ACCEPT.some((e) => name.toLowerCase().endsWith(e))

export default function TratamentoLancamentosPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  // Visualizador de debug escondido: atalho Ctrl/Cmd + Shift + E alterna o painel
  // da tabela extraída (nada exposto no fluxo normal).
  const [debugMode, setDebugMode] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault()
        setDebugMode((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Sub-permissão "gerenciar_modelos": criar/editar/duplicar/excluir Modelos.
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const canManage =
    isMaster || isEmpresaMaster ||
    permissions.find((p) => p.moduleSlug === 'tratamento-lancamentos')?.subPermissions?.['gerenciar_modelos'] === true

  const [models, setModels] = useState<ModelOption[]>([])
  const [modelId, setModelId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [converting, setConverting] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(null)
  // Muda a cada nova conversão → reseta o estado (colapso/aba) do painel via key.
  const [resultSeq, setResultSeq] = useState(0)
  // base64 lido na seleção do arquivo — reaproveitado na geração e ao criar modelo.
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [detectedRows, setDetectedRows] = useState<number | null>(null)
  // Tabela extraída no preview — segurada p/ reenviar no convert e alimentar o painel.
  const [extracted, setExtracted] = useState<ExtractedTable | null>(null)
  // Modelo a pré-selecionar ao voltar do wizard (aplicado quando a lista carrega).
  const pendingModelIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const list = await trpc.tratamentoLancamentos.listForSelect.query()
        if (!active) return
        setModels(list as ModelOption[])
        // Pré-seleciona o modelo recém-criado no wizard, se voltou por esse fluxo.
        const pending = pendingModelIdRef.current
        if (pending && (list as ModelOption[]).some((m) => m.id === pending)) {
          setModelId(pending)
          pendingModelIdRef.current = null
        }
      } catch { /* silencioso */ }
    })()
    return () => { active = false }
  }, [])

  // Reaproveita um arquivo já lido (base64) sem passar pelo input de seleção.
  const restoreFile = useCallback(async (base64: string, filename: string) => {
    setResult(null); setDetectedRows(null); setExtracted(null)
    setReading(true)
    try {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      setFile(new File([bytes], filename))
      setFileBase64(base64)
      const res = await trpc.tratamentoLancamentos.preview.mutate({ fileBase64: base64, filename })
      setDetectedRows(res.totalRows)
      setExtracted({ headers: res.headers, rows: res.rows, truncated: res.truncated })
    } catch {
      // Se o preview falhar, mantém o arquivo restaurado mesmo assim.
    } finally {
      setReading(false)
    }
  }, [])

  // Volta do wizard: consome o payload de retorno (arquivo + modelo criado).
  useEffect(() => {
    let raw: string | null = null
    try { raw = sessionStorage.getItem('tl:retornoFluxo'); if (raw) sessionStorage.removeItem('tl:retornoFluxo') } catch { /* ignore */ }
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as { modelId?: string; fileBase64?: string; filename?: string }
      if (parsed.modelId) pendingModelIdRef.current = parsed.modelId
      if (parsed.fileBase64 && parsed.filename) void restoreFile(parsed.fileBase64, parsed.filename)
    } catch { /* ignore */ }
  }, [restoreFile])

  async function pickFile(f: File | undefined | null) {
    if (!f) return
    if (!extOk(f.name)) { alerts.error('Formato não suportado', 'Envie um arquivo .xlsx, .xls, .csv ou .pdf.'); return }
    setFile(f); setResult(null); setDetectedRows(null); setFileBase64(null); setExtracted(null)
    setReading(true)
    try {
      const base64 = await fileToBase64(f)
      const res = await trpc.tratamentoLancamentos.preview.mutate({ fileBase64: base64, filename: f.name })
      setFileBase64(base64)
      setDetectedRows(res.totalRows)
      setExtracted({ headers: res.headers, rows: res.rows, truncated: res.truncated })
    } catch {
      alerts.error('Falha ao ler o arquivo', 'Não foi possível detectar uma tabela de lançamentos no arquivo.')
      setFile(null)
    } finally {
      setReading(false)
    }
  }

  // Guarda o arquivo enviado (se houver) para o editor reaproveitar.
  function carregaArquivoNoEditor() {
    if (fileBase64 && file) {
      try { sessionStorage.setItem('tl:exemplo', JSON.stringify({ fileBase64, filename: file.name })) } catch { /* ignore */ }
    }
  }
  const FROM = encodeURIComponent('/tratamento-lancamentos')
  function goCreateModel() {
    carregaArquivoNoEditor()
    router.push(`/tratamento-lancamentos/modelos/new?from=${FROM}`)
  }
  function goEditModel(id: string) {
    carregaArquivoNoEditor()
    router.push(`/tratamento-lancamentos/modelos/${id}?from=${FROM}`)
  }

  const download = useCallback((base64: string, fileName: string) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'text/plain;charset=iso-8859-1' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = fileName; a.click()
    URL.revokeObjectURL(url)
  }, [])

  async function handleExport(competenciaAno?: number) {
    if (!file || !modelId || !fileBase64) return
    setConverting(true)
    setResult(null)
    // Reuso da extração: se a tabela do preview está completa (não truncada),
    // manda ela pronta e o backend NÃO re-extrai. Senão, cai no fallback do arquivo.
    const usarTabela = !!extracted && !extracted.truncated
    let res: ConvertResult
    try {
      res = await trpc.tratamentoLancamentos.convert.mutate({
        modelId,
        filename: file.name,
        competenciaAno,
        ...(usarTabela
          ? { table: { headers: extracted!.headers, rows: extracted!.rows } }
          : { fileBase64 }),
      })
    } catch {
      alerts.error('Falha ao gerar o arquivo', 'Não foi possível ler o arquivo ou aplicar o modelo. Verifique o arquivo e tente novamente.')
      setConverting(false)
      return
    }
    setConverting(false)

    // Datas sem ano (ex.: Sicoob): pede o ano de competência e reenvia.
    if (res.needsCompetenciaAno) {
      const ano = await alerts.input({
        title: 'Ano de competência',
        text: 'As datas deste extrato não trazem o ano (ex.: 27/02). Informe o ano de competência para gerar o arquivo.',
        inputLabel: 'Ano (ex.: 2026)',
        inputPlaceholder: '2026',
        confirmText: 'Gerar arquivo',
        required: true,
      })
      if (!ano) return
      const n = Number(ano.trim())
      if (!Number.isInteger(n) || n < 1900 || n > 2200) {
        alerts.error('Ano inválido', 'Informe um ano entre 1900 e 2200.')
        return
      }
      return handleExport(n)
    }

    setResult(res)
    setResultSeq((s) => s + 1)
    if (res.fileBase64) {
      download(res.fileBase64, res.fileName)
      await alerts.success('Arquivo gerado', `${res.totalLancamentos} lançamentos convertidos para o SCI.`)
    }
  }

  const pend = result?.pendencias ?? []

  // Quando a conversão retorna pendências, rola até o início da listagem — em telas
  // menores ela pode nascer fora da área visível.
  const pendenciasRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (result && !result.fileBase64 && (result.pendencias?.length ?? 0) > 0) {
      pendenciasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [result])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="contabil" icon={FileSpreadsheet} />
          <div>
            <h1>Tratamento de Lançamentos</h1>
            <p className="text-sm text-muted-foreground">
              Converta um arquivo de lançamentos e gere o arquivo de importação do SCI em 3 passos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => router.push('/tratamento-lancamentos/modelos')}>
              <Settings2 className="h-4 w-4" /> Gerenciar modelos
            </Button>
          )}
        </div>
      </div>

      {/* Cards full-width; conteúdo centralizado dentro de cada um */}
      <div className="space-y-5">
        <Card className="p-6">
          <div className="divide-y divide-border/60 lg:mx-20 xl:mx-40 2xl:mx-60">
          {/* 1. Arquivo (drag & drop) */}
          <StepBlock num={1} icon={FileSpreadsheet} title="Arquivo de lançamentos" color="#0ea5e9" className="pb-6">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              className="hidden"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]) }}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center cursor-pointer outline-none transition-colors',
                dragOver ? 'bg-muted/40' : 'border-border/60 bg-muted/20 hover:bg-muted/30',
              )}
              style={dragOver ? { borderColor: 'var(--mod-contabil, #a78bfa)' } : undefined}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              {file ? (
                <>
                  <p className="text-sm font-medium text-foreground"><FileSpreadsheet className="inline h-4 w-4 mr-1" />{file.name}</p>
                  <p className="text-xs text-muted-foreground">Clique ou arraste outro arquivo para trocar</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">Arraste o arquivo de lançamentos aqui</p>
                  <p className="text-xs text-muted-foreground">ou clique para selecionar — .xlsx, .xls, .csv, .pdf</p>
                </>
              )}
              <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/60">
                <ImageIcon className="h-3.5 w-3.5" /> Suporte a imagens em breve
              </span>
            </div>
            {reading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo arquivo...
              </p>
            )}
            {!reading && detectedRows !== null && (
              <p className="text-xs">
                <DetectedRowsStatus rows={detectedRows} />
              </p>
            )}
          </StepBlock>

          {/* 2. Modelo */}
          <StepBlock num={2} icon={FileCog} title="Modelo de Tratamento" color="#8b5cf6" className="py-6">
            <Select value={modelId} onValueChange={(v) => { setModelId(v); setResult(null) }} disabled={models.length === 0}>
              <SelectTrigger className="h-9 text-sm bg-card max-w-md"><SelectValue placeholder={models.length === 0 ? 'Nenhum modelo cadastrado' : 'Selecione o modelo'} /></SelectTrigger>
              <SelectContent>
                {models.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex flex-col items-start gap-1.5 text-[11px]">
              {canManage && (
                <button className="text-sm text-primary underline" onClick={goCreateModel}>
                  + Criar novo modelo{file ? ' a partir do arquivo enviado' : ''}
                </button>
              )}
            </div>
          </StepBlock>

          {/* 3. Gerar */}
          <StepBlock num={3} icon={Download} title="Gerar arquivo de importação SCI" color="#10b981" className="pt-6">
            <div>
              <Button variant="success" size="sm" onClick={() => handleExport()} disabled={!file || !modelId || converting}>
                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Gerar arquivo
              </Button>
            </div>
          </StepBlock>
          </div>
        </Card>

        {/* Painel de resultado (colapsável) — sempre após processar. No sucesso,
            é o próprio card de "arquivo gerado" (recolhido); na falha, as abas. */}
        {result && (
          <div ref={pendenciasRef} className="scroll-mt-[110px]">
            <PendenciasPanel
              key={resultSeq}
              pendencias={pend}
              totalLancamentos={result.totalLancamentos}
              headers={extracted?.headers ?? []}
              rows={extracted?.rows ?? []}
              trace={result.trace ?? []}
              traceTotal={result.traceTotal ?? 0}
              okTotal={result.okTotal ?? 0}
              canManage={canManage}
              onEditModel={() => {
                // Abre o editor em "modo revisão": realça pendências de modelo (vermelho)
                // e colunas do modelo ausentes no arquivo enviado (âmbar).
                try { sessionStorage.setItem('tl:revisar', '1') } catch { /* ignore */ }
                goEditModel(modelId)
              }}
              onDownload={result.fileBase64 ? () => download(result.fileBase64!, result.fileName) : undefined}
            />
          </div>
        )}

        {/* Visualizador de debug (escondido — alternado por Ctrl/Cmd+Shift+E) */}
        {debugMode && fileBase64 && file && (
          <DebugViewer
            fileBase64={fileBase64}
            filename={file.name}
            modelId={modelId || undefined}
          />
        )}
        {debugMode && !fileBase64 && (
          <p className="text-[11px] text-muted-foreground text-center">
            Debug ativo — envie um arquivo (passo 1) para ver a tabela extraída. Ctrl/Cmd+Shift+E fecha.
          </p>
        )}
      </div>
    </div>
  )
}

/** Etapa do fluxo: círculo com ícone (cor por etapa, fallback na cor do bloco) + número/título + conteúdo. */
function StepBlock({ num, icon: Icon, title, color, className, children }: { num: number; icon: LucideIcon; title: string; color?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex gap-4', className)}>
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
        style={{ backgroundColor: color ?? 'var(--mod-contabil, #a78bfa)' }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-sm font-semibold text-foreground">{num}. {title}</p>
        {children}
      </div>
    </div>
  )
}
