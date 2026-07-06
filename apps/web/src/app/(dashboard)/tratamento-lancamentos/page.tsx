'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, Upload, Download, Loader2, AlertTriangle, CheckCircle2, Pencil, Image as ImageIcon, Settings2, FileCog, type LucideIcon,
} from 'lucide-react'
import {
  Button, Card, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { DetectedRowsStatus } from './_components/detected-rows-status'
import { fileToBase64 } from '@/lib/file'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { useUserPermissions } from '@/hooks/use-user-permissions'

interface ModelOption { id: string; nome: string; code: number }
// Tipo do retorno de `convert` inferido do tRPC — nomeado p/ uso na UI, sem
// duplicar nem castar o shape do backend (mudanças no backend propagam aqui).
type ConvertResult = Awaited<ReturnType<typeof trpc.tratamentoLancamentos.convert.mutate>>

const PENDENCIA_LABELS: Record<string, string> = {
  DC_NAO_MAPEADO: 'Débito/Crédito não mapeado',
  CONTA_NAO_MAPEADA: 'Conta de contrapartida não mapeada',
  CONTA_CORRENTE_NAO_MAPEADA: 'Conta corrente não mapeada',
  CAMPO_VAZIO: 'Campo vazio',
  DATA_INVALIDA: 'Data inválida',
  VALOR_INVALIDO: 'Valor não numérico',
}
const MAX_PENDENCIAS_VISIVEIS = 200
const ACCEPT = ['.xlsx', '.xls', '.csv', '.pdf']
const extOk = (name: string) => ACCEPT.some((e) => name.toLowerCase().endsWith(e))

export default function TratamentoLancamentosPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

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
  // base64 lido na seleção do arquivo — reaproveitado na geração e ao criar modelo.
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [detectedRows, setDetectedRows] = useState<number | null>(null)
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
    setResult(null); setDetectedRows(null)
    setReading(true)
    try {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      setFile(new File([bytes], filename))
      setFileBase64(base64)
      const res = await trpc.tratamentoLancamentos.preview.mutate({ fileBase64: base64, filename })
      setDetectedRows(res.totalRows)
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
    setFile(f); setResult(null); setDetectedRows(null); setFileBase64(null)
    setReading(true)
    try {
      const base64 = await fileToBase64(f)
      const res = await trpc.tratamentoLancamentos.preview.mutate({ fileBase64: base64, filename: f.name })
      setFileBase64(base64)
      setDetectedRows(res.totalRows)
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

  async function handleExport() {
    if (!file || !modelId || !fileBase64) return
    setConverting(true)
    setResult(null)
    try {
      const res = await trpc.tratamentoLancamentos.convert.mutate({ modelId, fileBase64, filename: file.name })
      setResult(res)
      if (res.fileBase64) {
        download(res.fileBase64, res.fileName)
        await alerts.success('Arquivo gerado', `${res.totalLancamentos} lançamentos convertidos para o SCI.`)
      }
    } catch {
      alerts.error('Falha ao gerar o arquivo', 'Não foi possível ler o arquivo ou aplicar o modelo. Verifique o arquivo e tente novamente.')
    } finally {
      setConverting(false)
    }
  }

  const pend = result?.pendencias ?? []
  const pendPorTipo = pend.reduce<Record<string, number>>((a, p) => { a[p.tipo] = (a[p.tipo] ?? 0) + 1; return a }, {})

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
              <Button variant="success" size="sm" onClick={handleExport} disabled={!file || !modelId || converting}>
                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Gerar arquivo
              </Button>
            </div>
          </StepBlock>
          </div>
        </Card>

        {/* Resultado: sucesso */}
        {result && result.fileBase64 && (
          <Card className="p-5 border-emerald-300 dark:border-emerald-900/50">
            <div className="flex items-center gap-3 lg:mx-20 xl:mx-40 2xl:mx-60">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Arquivo de importação gerado</p>
                <p className="text-xs text-muted-foreground">{result.totalLancamentos} lançamentos · o download iniciou automaticamente.</p>
              </div>
              <Button variant="success" size="sm" className="shrink-0" onClick={() => download(result.fileBase64!, result.fileName)}>
                <Download className="h-4 w-4" /> Baixar
              </Button>
            </div>
          </Card>
        )}

        {/* Resultado: pendências */}
        {result && !result.fileBase64 && pend.length > 0 && (
          <Card ref={pendenciasRef} className="p-5 border-rose-300 dark:border-rose-900/50 scroll-mt-[110px]">
            <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Não foi possível gerar o arquivo</p>
                <p className="text-xs text-muted-foreground">
                  {pend.length} pendência{pend.length > 1 ? 's' : ''} em {result.totalLancamentos} lançamentos
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(pendPorTipo).map(([tipo, n]) => (
                <Badge key={tipo} variant="secondary" className="text-[11px]">{PENDENCIA_LABELS[tipo] ?? tipo}: {n}</Badge>
              ))}
            </div>

            <div className="rounded-[2px] border border-border/60 overflow-hidden">
              <div className="max-h-[420px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[70px]">Linha</TableHead>
                      <TableHead className="w-[200px]">Campo</TableHead>
                      <TableHead className="w-[200px]">Valor</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pend.slice(0, MAX_PENDENCIAS_VISIVEIS).map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.linha || '—'}</TableCell>
                        <TableCell className="text-xs">{p.campo}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={p.valor}>{p.valor || '—'}</TableCell>
                        <TableCell className="text-xs">{p.mensagem}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            {pend.length > MAX_PENDENCIAS_VISIVEIS && (
              <p className="text-[11px] text-muted-foreground">Mostrando as primeiras {MAX_PENDENCIAS_VISIVEIS} de {pend.length} pendências.</p>
            )}

            <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center">
              {canManage && (
                <Button variant="soft-info" size="sm" className="shrink-0" onClick={() => goEditModel(modelId)}>
                  <Pencil className="h-4 w-4" /> Editar modelo
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                As pendências podem vir do <strong>modelo</strong> (mapeamentos faltando) ou do <strong>próprio arquivo</strong>
                {' '}(campos em branco, datas ou valores inválidos).
                {canManage
                  ? ' Corrija o que for necessário e gere novamente.'
                  : ' Ajuste o arquivo, ou solicite a quem gerencia os modelos a correção do mapeamento.'}
              </span>
            </div>
            </div>
          </Card>
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
