'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Search, Loader2, CheckCircle2, XCircle, Building2, Download, ExternalLink, Clock } from 'lucide-react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Button, Input, cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'

interface EnabledCliente {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  nfeDistUltimoNsu: string | null
  nfeDistSyncStatus: string | null
  nfeDistSyncRequestedAt: string | null
  nfeDistSyncedAt: string | null
}
interface Progresso { etapa: string; mensagem: string; atual: number; total: number; pct: number }

function fmtCnpj(doc: string): string {
  const d = doc.replace(/\D/g, '')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

/**
 * Busca sob demanda de notas de UM cliente no Portal Nacional (SEFAZ NFe
 * Distribuição DFe). Dispara `solicitarSync` e acompanha o progresso por polling
 * (`getProgressoAtual` + `status`). O scheduler processa em até ~20s.
 */
export function BuscarNotasModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [clientes, setClientes] = useState<EnabledCliente[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<EnabledCliente | null>(null)
  const [fase, setFase] = useState<'select' | 'processando' | 'done'>('select')
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [resultado, setResultado] = useState<{ mensagem: string; ok: boolean } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vistoNaFila = useRef(false)
  const iniciadoEm = useRef(0)

  const pararPoll = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }, [])

  const resetar = useCallback(() => {
    pararPoll(); setSel(null); setBusca(''); setFase('select'); setProgresso(null); setResultado(null)
    vistoNaFila.current = false
  }, [pararPoll])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.nfeDist as { listEnabled: { query: () => Promise<EnabledCliente[]> } }).listEnabled.query()
      setClientes(r)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (open) { resetar(); void carregar() }
    else pararPoll()
    return () => pararPoll()
  }, [open, carregar, resetar, pararPoll])

  const iniciarPoll = useCallback((clienteId: string) => {
    iniciadoEm.current = Date.now()
    const tick = async () => {
      try {
        const nd = trpc.nfeDist as {
          getProgressoAtual: { query: (i: { clienteId: string }) => Promise<Progresso | null> }
          status: { query: (i: { clienteId: string }) => Promise<{ nfeDistSyncRequestedAt: string | null; nfeDistSyncStatus: string | null; nfeDistUltimoNsu: string | null } | null> }
        }
        const [prog, st] = await Promise.all([
          nd.getProgressoAtual.query({ clienteId }),
          nd.status.query({ clienteId }),
        ])
        setProgresso(prog)
        if (st?.nfeDistSyncRequestedAt) vistoNaFila.current = true
        // Concluído: a flag de solicitação foi limpa (scheduler terminou de processar).
        const terminou = vistoNaFila.current && !st?.nfeDistSyncRequestedAt
        const estourou = Date.now() - iniciadoEm.current > 4 * 60_000
        if (terminou || estourou) {
          pararPoll()
          setFase('done')
          const stt = st?.nfeDistSyncStatus ?? ''
          setResultado(estourou
            ? { mensagem: 'A busca demorou mais que o esperado — verifique a galeria em instantes.', ok: true }
            : { mensagem: stt === 'erro' ? 'A SEFAZ retornou erro nesta consulta.' : 'Busca concluída. As notas novas já estão na galeria.', ok: stt !== 'erro' })
        }
      } catch { /* mantém o poll */ }
    }
    pollRef.current = setInterval(() => { void tick() }, 3000)
    void tick()
  }, [pararPoll])

  const buscar = async () => {
    if (!sel) return
    setFase('processando'); setProgresso(null); vistoNaFila.current = false
    try {
      await (trpc.nfeDist as { solicitarSync: { mutate: (i: { clienteId: string }) => Promise<void> } }).solicitarSync.mutate({ clienteId: sel.id })
      iniciarPoll(sel.id)
    } catch (e) {
      setFase('done')
      setResultado({ mensagem: (e as Error).message, ok: false })
    }
  }

  const filtrados = clientes.filter((c) =>
    !busca || c.razaoSocial.toLowerCase().includes(busca.toLowerCase()) || c.documento.includes(busca.replace(/\D/g, '')))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && fase === 'processando') return; onOpenChange(o) }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeaderIcon icon={Download} color="sky">
          <DialogTitle>Buscar notas no Portal Nacional</DialogTitle>
          <DialogDescription>Consulta a SEFAZ (NFe Distribuição) de um cliente sob demanda.</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="min-h-[280px]">
          {fase === 'select' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar cliente ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 pl-8 text-sm" />
              </div>
              <div className="rounded-lg border border-border divide-y divide-border max-h-[280px] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : filtrados.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">
                    {clientes.length === 0 ? 'Nenhum cliente com NFe Distribuição habilitada. Habilite no cadastro do cliente (aba Fiscal).' : 'Nenhum cliente bate com a busca.'}
                  </p>
                ) : filtrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSel(c)}
                    className={cn('w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-muted/50',
                      sel?.id === c.id && 'bg-sky-50 dark:bg-sky-950/30')}
                  >
                    <span className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0"><Building2 className="h-4 w-4 text-muted-foreground" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{c.razaoSocial}</span>
                      <span className="block text-[11px] text-muted-foreground font-mono">{fmtCnpj(c.documento)} · último NSU {c.nfeDistUltimoNsu ?? '0'}</span>
                    </span>
                    {sel?.id === c.id && <CheckCircle2 className="h-4 w-4 text-sky-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {fase === 'processando' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: MODULE_COLOR }} />
              <div className="text-center">
                <p className="text-sm font-medium">{sel?.razaoSocial}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {progresso ? progresso.mensagem : (
                    <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Na fila — processa em até ~20s…</span>
                  )}
                </p>
              </div>
              {progresso && progresso.pct > 0 && (
                <div className="w-full max-w-[360px]">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, progresso.pct)}%`, background: MODULE_COLOR }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center mt-1.5 tabular-nums">{progresso.pct}%{progresso.total > 0 ? ` · ${progresso.atual}/${progresso.total}` : ''}</p>
                </div>
              )}
            </div>
          )}

          {fase === 'done' && resultado && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              {resultado.ok ? <CheckCircle2 className="h-10 w-10 text-emerald-500" /> : <XCircle className="h-10 w-10 text-rose-500" />}
              <div>
                <p className="text-sm font-medium">{sel?.razaoSocial}</p>
                <p className={cn('text-sm mt-1', resultado.ok ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400')}>{resultado.mensagem}</p>
              </div>
              {resultado.ok && sel && (
                <Link href={`/danfe/galeria?cliente=${sel.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                  Ver notas na galeria <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {fase === 'select' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={buscar} disabled={!sel} className="text-white" style={{ backgroundColor: MODULE_COLOR }}>
                <Download className="h-4 w-4 mr-1.5" /> Buscar notas
              </Button>
            </>
          )}
          {fase === 'processando' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Continuar em segundo plano</Button>
          )}
          {fase === 'done' && (
            <>
              <Button variant="outline" onClick={resetar}>Buscar outro</Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
