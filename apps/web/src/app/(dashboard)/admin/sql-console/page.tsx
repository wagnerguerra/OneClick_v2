'use client'

/**
 * Console SQL — master-only. Roda SQL cru contra o banco do AMBIENTE atual
 * (em produção = banco de produção). Ferramenta interna de diagnóstico/manutenção.
 * Gate duplo: masterProcedure no backend + guard isMaster aqui.
 */

import { useState, useCallback } from 'react'
import { Database, Play, Loader2, AlertTriangle, TriangleAlert } from 'lucide-react'
import { Button } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MODULE_COLOR = 'var(--mod-ajuda, #0891b2)'

type RunResult =
  | { ok: true; type: 'rows'; columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; ms: number }
  | { ok: true; type: 'command'; rowCount: number; ms: number }
  | { ok: false; error: string; ms: number }

export default function SqlConsolePage() {
  const { profile, loading } = useCurrentUserProfile()
  const [sql, setSql] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  const run = useCallback(async () => {
    if (!sql.trim() || running) return
    setRunning(true)
    setResult(null)
    try {
      const r = await (trpc as any).sqlConsole.run.mutate({ sql })
      setResult(r as RunResult)
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message, ms: 0 })
    } finally {
      setRunning(false)
    }
  }, [sql, running])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }
  // Estritamente master global da plataforma (não empresa-master).
  if (!profile?.isMaster) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-2">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <h2 className="text-lg font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground">O Console SQL é exclusivo do administrador da plataforma.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header inline (padrão de módulo) */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Database className="h-6 w-6" />
          </div>
          <div>
            <h1>Console SQL</h1>
            <p className="text-sm text-muted-foreground">Consultas e manutenção direto no banco do ambiente atual</p>
          </div>
        </div>
        <Button variant="success" size="sm" onClick={run} disabled={running || !sql.trim()}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Executar
        </Button>
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-foreground">
        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <span>Isto executa SQL <strong>real</strong> no banco do ambiente (em produção, no banco de produção). <code>SELECT</code> retorna linhas; <code>UPDATE/DELETE/DO</code> aplicam alterações. Confira antes de rodar.</span>
      </div>

      {/* Editor */}
      <div className="space-y-1.5">
        <textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void run() } }}
          spellCheck={false}
          placeholder={"SELECT * FROM clientes WHERE empresa_id IS NULL LIMIT 50;"}
          className="w-full h-56 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[13px] text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-[11px] text-muted-foreground">Ctrl/Cmd + Enter para executar. Uma instrução por vez (blocos <code>DO $$…$$</code> são suportados).</p>
      </div>

      {/* Resultado */}
      {result && (
        <div className="rounded-md border border-border overflow-hidden">
          {result.ok === false ? (
            <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 px-3 py-2 text-[13px] font-mono whitespace-pre-wrap">
              {result.error}
            </div>
          ) : result.type === 'command' ? (
            <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-2 text-[13px]">
              OK — {result.rowCount} linha(s) afetada(s) · {result.ms} ms
            </div>
          ) : (
            <>
              <div className="bg-muted/40 px-3 py-1.5 text-[12px] text-muted-foreground border-b border-border">
                {result.rowCount} linha(s) · {result.ms} ms
              </div>
              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      {result.columns.map(c => <th key={c} className="text-left font-semibold px-3 py-1.5 border-b border-border whitespace-nowrap">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="odd:bg-muted/20">
                        {result.columns.map(c => (
                          <td key={c} className="px-3 py-1 border-b border-border/60 font-mono whitespace-nowrap max-w-[420px] truncate" title={fmt(row[c])}>
                            {fmt(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {result.rows.length === 0 && (
                      <tr><td colSpan={Math.max(1, result.columns.length)} className="px-3 py-3 text-center text-muted-foreground">Nenhuma linha.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
