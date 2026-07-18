'use client'

// ============================================================
// Visualizador de DEBUG da tabela extraída (escondido — alternado pelo atalho
// Ctrl/Cmd+Shift+E). Serve para conferir se o PDF/planilha foi TABELADO corretamente e
// como o modelo INTERPRETOU cada linha (de/para, direção, contrapartida) — útil
// tanto para testes internos quanto para um atendimento na máquina do cliente.
// Não faz parte do fluxo normal do usuário.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { Bug, Loader2, RefreshCw } from 'lucide-react'
import {
  Button, Badge,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  cn,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { extractClient } from '../lib/extract-client'

type DebugResult = Awaited<ReturnType<typeof trpc.tratamentoLancamentos.debugExtract.mutate>>
type TraceRow = DebugResult['trace'][number]

// Teto de linhas RENDERIZADAS no DOM (o backend já limita o payload).
const MAX_RENDER = 500

const STATUS_LABEL: Record<TraceRow['status'], string> = {
  ok: 'OK',
  pendencia: 'Pendência',
  'pulada-regra': 'Pulada (regra)',
  'ignorada-zero': 'Ignorada (zero)',
}
const STATUS_CLASS: Record<TraceRow['status'], string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  pendencia: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  'pulada-regra': 'bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  'ignorada-zero': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
}

const cellText = (v: unknown): string => (v === null || v === undefined || v === '' ? '' : String(v))
const dir = (d: TraceRow['direcao']): string => (d === 'DEBITO' ? 'Débito' : d === 'CREDITO' ? 'Crédito' : '—')

interface Props {
  fileBase64: string
  filename: string
  modelId?: string
  competenciaAno?: number
}

export function DebugViewer({ fileBase64, filename, modelId, competenciaAno }: Props) {
  const [data, setData] = useState<DebugResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Extração NO CLIENTE (igual ao fluxo real); a API só aplica o modelo.
      const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0))
      const table = await extractClient(new File([bytes], filename))
      const res = await trpc.tratamentoLancamentos.debugExtract.mutate({
        table: { headers: table.headers, rows: table.rows }, filename, modelId, competenciaAno,
      })
      setData(res)
    } catch (e) {
      setError((e as Error).message || 'Falha ao extrair a tabela.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [fileBase64, filename, modelId, competenciaAno])

  // Carrega automaticamente quando o arquivo/modelo muda (conveniência de teste).
  useEffect(() => { void load() }, [load])

  const trace = data?.trace ?? []
  const puladas = trace.filter((t: TraceRow) => t.status === 'pulada-regra' || t.status === 'ignorada-zero')
  const comModelo = !!data?.modelNome

  return (
    <div className="rounded-lg border border-dashed border-slate-400/60 bg-slate-50/60 dark:bg-slate-900/30 p-4 space-y-3">
      {/* Cabeçalho do painel */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          <Bug className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Visualizador de debug</p>
          <p className="text-[11px] text-muted-foreground truncate">
            Estrutura da tabela lida do arquivo{data ? ` · ${data.totalRows} linha${data.totalRows === 1 ? '' : 's'}` : ''}
            {data?.modelNome ? ` · modelo: ${data.modelNome}` : ' · (sem modelo selecionado)'}
            {data?.truncated ? ` · exibindo as primeiras ${MAX_RENDER}` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar
        </Button>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {data && (
        <Tabs defaultValue="raw">
          <TabsList>
            <TabsTrigger value="raw">Tabela extraída</TabsTrigger>
            <TabsTrigger value="mapped" disabled={!comModelo}>Após de/para</TabsTrigger>
            <TabsTrigger value="pend" disabled={!comModelo}>
              Pendências e puladas{comModelo ? ` (${data.pendencias.length + puladas.length})` : ''}
            </TabsTrigger>
          </TabsList>

          {/* View 1 — tabela crua exatamente como foi tabelada */}
          <TabsContent value="raw">
            <RawTable headers={data.headers} rows={data.rows} />
          </TabsContent>

          {/* View 2 — como o modelo mapeou cada linha (de/para + interpretação) */}
          <TabsContent value="mapped">
            {comModelo ? <MappedTable trace={trace} /> : <Hint />}
          </TabsContent>

          {/* View 3 — pendências e linhas puladas/ignoradas */}
          <TabsContent value="pend">
            {comModelo ? <PendTable trace={trace} pendencias={data.pendencias} /> : <Hint />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function Hint() {
  return <p className="text-xs text-muted-foreground py-4">Selecione um Modelo de Tratamento (passo 2) para ver esta aba.</p>
}

function ScrollFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[2px] border border-border/60 overflow-hidden">
      {/* overflow-auto nativo (mesmo padrão da tabela de pendências): barra
          sempre visível e scroll confiável, ao contrário do ScrollArea/Radix. */}
      <div className="max-h-[460px] overflow-auto">
        {children}
      </div>
    </div>
  )
}

function RawTable({ headers, rows }: { headers: string[]; rows: DebugResult['rows'] }) {
  const shown = rows.slice(0, MAX_RENDER)
  return (
    <ScrollFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[54px] text-right">#</TableHead>
            {headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row: Record<string, unknown>, i: number) => (
            <TableRow key={i}>
              <TableCell className="text-right font-mono text-[11px] text-muted-foreground">{i + 1}</TableCell>
              {headers.map((h) => {
                const v = cellText(row[h])
                return (
                  <TableCell key={h} className={cn('text-xs whitespace-nowrap max-w-[280px] truncate', !v && 'text-muted-foreground/50')} title={v}>
                    {v || '∅'}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollFrame>
  )
}

function MappedTable({ trace }: { trace: TraceRow[] }) {
  const shown = trace.slice(0, MAX_RENDER)
  return (
    <ScrollFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[54px] text-right">Linha</TableHead>
            <TableHead className="text-xs">Data → parsed</TableHead>
            <TableHead className="text-xs">Valor → parsed</TableHead>
            <TableHead className="text-xs">Descrição</TableHead>
            <TableHead className="text-xs">Direção</TableHead>
            <TableHead className="text-xs">Contrapartida</TableHead>
            <TableHead className="text-xs">Conta corrente</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((t) => (
            <TableRow key={t.linha}>
              <TableCell className="text-right font-mono text-[11px] text-muted-foreground">{t.linha}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                {cellText(t.data) || '∅'}<span className="text-muted-foreground"> → {t.dataParsed ?? '—'}</span>
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                {cellText(t.valor) || '∅'}<span className="text-muted-foreground"> → {t.valorParsed ?? '—'}</span>
              </TableCell>
              <TableCell className="text-xs max-w-[260px] truncate" title={cellText(t.descricao)}>{cellText(t.descricao) || '∅'}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{dir(t.direcao)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{t.contaContrapartida ?? '—'}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{t.contaCorrente ?? '—'}</TableCell>
              <TableCell><StatusBadge status={t.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollFrame>
  )
}

function PendTable({ trace, pendencias }: { trace: TraceRow[]; pendencias: DebugResult['pendencias'] }) {
  const problemas = trace.filter((t) => t.status !== 'ok').slice(0, MAX_RENDER)
  // Motivos por linha (pega o 1º) para exibir junto do status.
  const motivoPorLinha = new Map<number, string>()
  for (const p of pendencias) if (!motivoPorLinha.has(p.linha)) motivoPorLinha.set(p.linha, p.mensagem)

  if (problemas.length === 0) {
    return <p className="text-xs text-emerald-600 dark:text-emerald-400 py-4">Nenhuma pendência ou linha pulada — todas as linhas viraram lançamento.</p>
  }
  return (
    <ScrollFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[54px] text-right">Linha</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Descrição</TableHead>
            <TableHead className="text-xs">Motivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {problemas.map((t) => (
            <TableRow key={t.linha}>
              <TableCell className="text-right font-mono text-[11px] text-muted-foreground">{t.linha}</TableCell>
              <TableCell><StatusBadge status={t.status} /></TableCell>
              <TableCell className="text-xs max-w-[260px] truncate" title={cellText(t.descricao)}>{cellText(t.descricao) || '∅'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {t.status === 'pendencia'
                  ? (motivoPorLinha.get(t.linha) ?? t.pendenciaTipos.join(', '))
                  : t.status === 'ignorada-zero' ? 'Valor zero — ignorada' : 'Regra "Pular" na contrapartida'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollFrame>
  )
}

function StatusBadge({ status }: { status: TraceRow['status'] }) {
  return <Badge variant="secondary" className={cn('text-[10px] font-medium', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</Badge>
}
