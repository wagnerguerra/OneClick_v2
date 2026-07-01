'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Search, Loader2, CheckCircle2, XCircle, Building2, Download, ExternalLink, Clock, Landmark, Briefcase } from 'lucide-react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Button, Input, cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'

type Fonte = 'nfe' | 'nfse'
const FONTES: { k: Fonte; label: string; icon: typeof Landmark; requestedField: string; statusField: string }[] = [
  { k: 'nfe', label: 'NFe SEFAZ', icon: Landmark, requestedField: 'nfeDistSyncRequestedAt', statusField: 'nfeDistSyncStatus' },
  { k: 'nfse', label: 'NFS-e Nacional', icon: Briefcase, requestedField: 'nfseDistSyncRequestedAt', statusField: 'nfseDistSyncStatus' },
]

interface EnabledCliente {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  ultimoNsu: string | null
  syncStatus: string | null
  syncRequestedAt: string | null
  syncedAt: string | null
}
interface Progresso { etapa: string; mensagem: string; atual: number; total: number; pct: number }

// Router (nfeDist/nfseDist) tipado no formato que o modal usa — ambos têm as mesmas procedures.
interface DistRouter {
  listEnabled: { query: () => Promise<EnabledCliente[]> }
  solicitarSync: { mutate: (i: { clienteId: string }) => Promise<void> }
  getProgressoAtual: { query: (i: { clienteId: string }) => Promise<Progresso | null> }
  status: { query: (i: { clienteId: string }) => Promise<Record<string, unknown> | null> }
}
function routerDe(fonte: Fonte): DistRouter {
  return (fonte === 'nfe' ? trpc.nfeDist : trpc.nfseDist) as unknown as DistRouter
}

function fmtCnpj(doc: string): string {
  const d = doc.replace(/\D/g, '')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

/**
 * Busca sob demanda de notas de UM cliente, escolhendo a fonte: NFe (SEFAZ
 * Distribuição DFe) ou NFS-e (Portal Nacional). Dispara `solicitarSync` da fonte
 * escolhida e acompanha o progresso por polling. O scheduler processa em ~20s.
 */
export function BuscarNotasModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [fonte, setFonte] = useState<Fonte>('nfe')
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

  const fonteAtual = FONTES.find((f) => f.k === fonte)!
  const pararPoll = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }, [])

  const carregar = useCallback(async (f: Fonte) => {
    setLoading(true); setSel(null)
    try {
      const r = await routerDe(f).listEnabled.query()
      setClientes(r)
    } catch (e) { setClientes([]); alerts.error('Erro', (e as Error).message) }
    finally { setLoading(false) }
  }, [])

  // Ao abrir OU trocar de fonte: volta ao seletor e recarrega a lista da fonte.
  useEffect(() => {
    if (!open) { pararPoll(); return }
    pararPoll(); setBusca(''); setFase('select'); setProgresso(null); setResultado(null); vistoNaFila.current = false
    void carregar(fonte)
    return () => pararPoll()
  }, [open, fonte, carregar, pararPoll])

  const iniciarPoll = useCallback((clienteId: string, f: Fonte) => {
    iniciadoEm.current = Date.now()
    const def = FONTES.find((x) => x.k === f)!
    const nd = routerDe(f)
    const tick = async () => {
      try {
        const [prog, st] = await Promise.all([
          nd.getProgressoAtual.query({ clienteId }),
          nd.status.query({ clienteId }),
        ])
        setProgresso(prog)
        const requestedAt = st?.[def.requestedField] as string | null | undefined
        if (requestedAt) vistoNaFila.current = true
        const terminou = vistoNaFila.current && !requestedAt
        const estourou = Date.now() - iniciadoEm.current > 4 * 60_000
        if (terminou || estourou) {
          pararPoll()
          setFase('done')
          const stt = (st?.[def.statusField] as string | null) ?? ''
          setResultado(estourou
            ? { mensagem: 'A busca demorou mais que o esperado — verifique a galeria em instantes.', ok: true }
            : { mensagem: stt === 'erro' ? 'A consulta retornou erro.' : 'Busca concluída. As notas novas já estão na galeria.', ok: stt !== 'erro' })
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
      await routerDe(fonte).solicitarSync.mutate({ clienteId: sel.id })
      iniciarPoll(sel.id, fonte)
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
          <DialogTitle>Buscar notas sob demanda</DialogTitle>
          <DialogDescription>Consulta {fonte === 'nfe' ? 'a SEFAZ (NFe Distribuição)' : 'o Portal Nacional (NFS-e)'} de um cliente.</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="min-h-[320px] space-y-3">
          {/* Seletor de fonte — igual ao agendamento (NFe SEFAZ / NFS-e Nacional) */}
          <div className="flex items-center gap-1 border-b border-border">
            {FONTES.map((f) => {
              const active = fonte === f.k
              return (
                <button
                  key={f.k}
                  type="button"
                  disabled={fase === 'processando'}
                  onClick={() => setFonte(f.k)}
                  className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors disabled:opacity-50',
                    active ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  <f.icon className="h-3.5 w-3.5" /> {f.label}
                </button>
              )
            })}
          </div>

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
                    {clientes.length === 0 ? `Nenhum cliente com ${fonteAtual.label} habilitada. Habilite no cadastro do cliente (aba Fiscal).` : 'Nenhum cliente bate com a busca.'}
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
                      <span className="block text-[11px] text-muted-foreground font-mono">{fmtCnpj(c.documento)} · último NSU {c.ultimoNsu ?? '0'}</span>
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
              <Button variant="outline" onClick={() => { setFase('select'); setSel(null); setResultado(null); setProgresso(null) }}>Buscar outro</Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
