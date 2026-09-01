'use client'

/**
 * Estado e atualização do balancete do cliente.
 *
 * O balancete vem do SCI, que é Firebird na rede local — a API na VPS não
 * alcança o banco de origem. Quem faz a ponte é o Service Manager, pelas rotas
 * `/be/api/bi-sync/*`: esta tela pede a importação e acompanha o andamento.
 * Fora da rede do escritório o pedido simplesmente não completa, e o modal diz
 * isso em vez de girar para sempre.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  Button, Dialog, DialogContent, DialogTitle, DialogDescription, Badge, cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Status {
  /** ID SCI do cliente (o PRCODEMP). Null = ainda não descoberto; a importação
   *  busca no SCI pelo CNPJ e grava no cadastro. */
  idSci: string | null
  meses: number
  primeiro: number | null
  ultimo: number | null
  totalLinhas: number
  atualizadoEm: string | null
  lacunas: number[]
}

/** 202612 → "12/2026" */
const refBR = (ref: number | null) =>
  ref ? `${String(ref % 100).padStart(2, '0')}/${Math.floor(ref / 100)}` : '—'

/** Janela de 12 meses que termina no mês passado — o mês corrente ainda não
 *  fechou no ERP, e pedi-lo traz balancete pela metade. */
function janela12m() {
  const hoje = new Date()
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1))
  const ini = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - 11, 1))
  const ref = (d: Date) => d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1)
  return {
    anoInicio: ini.getUTCFullYear(), mesInicio: ini.getUTCMonth() + 1,
    anoFim: fim.getUTCFullYear(), mesFim: fim.getUTCMonth() + 1,
    refInicio: ref(ini), refFim: ref(fim),
  }
}

export function BalanceteModal({ clienteId, clienteNome, aberto, onFechar, onAtualizado }: {
  clienteId: string | null
  clienteNome: string
  aberto: boolean
  onFechar: () => void
  /** Chamado quando a importação termina, para a simulação reler os números. */
  onAtualizado: () => void
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [mensagem, setMensagem] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const carregar = useCallback(async () => {
    if (!clienteId) return
    setCarregando(true)
    try {
      setStatus(await (trpc.reformaTributaria as never as {
        balanceteStatus: { query: (i: { clienteId: string }) => Promise<Status> }
      }).balanceteStatus.query({ clienteId }))
    } catch { setStatus(null) }
    finally { setCarregando(false) }
  }, [clienteId])

  useEffect(() => { if (aberto) void carregar() }, [aberto, carregar])
  useEffect(() => () => pararPolling(), [pararPolling])

  async function importar() {
    if (!clienteId) return
    const p = janela12m()
    pararPolling()
    setImportando(true)
    setProgresso(5)
    setMensagem(`Solicitando balancete de ${refBR(p.refInicio)} a ${refBR(p.refFim)}…`)

    try {
      const resp = await fetch('/be/api/bi-sync/importar', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          anoInicio: p.anoInicio, mesInicio: p.mesInicio,
          anoFim: p.anoFim, mesFim: p.mesFim,
          substituirExistentes: true,
        }),
      })
      if (!resp.ok) {
        // O servidor devolve o motivo em `message`; usá-lo é a diferença entre
        // "erro interno" e "falta o ID SCI no cadastro".
        const corpo = await resp.json().catch(() => null) as { message?: string } | null
        setImportando(false)
        alerts.error(
          'Não foi possível atualizar',
          corpo?.message || `O servidor respondeu ${resp.status}.`,
        )
        return
      }

      const r = await resp.json().catch(() => ({}))
      if (r?.started === false) {
        setImportando(false)
        setMensagem('Já existe uma importação em andamento para este cliente e período.')
        return
      }

      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(
            `/be/api/bi-sync/status/${clienteId}/${p.refInicio}/${p.refFim}`,
            { credentials: 'include' },
          )
          if (!sr.ok) return
          const job = (await sr.json())?.job
          if (!job) return

          setProgresso(Math.max(5, Number(job.progress) || 0))
          setMensagem(job.message || 'Processando balancete…')

          if (job.status === 'done' || job.status === 'error') {
            pararPolling()
            setImportando(false)
            if (job.status === 'done') {
              setProgresso(100)
              await carregar()
              onAtualizado()
              alerts.success('Balancete atualizado', 'A simulação já usa os números novos.')
            } else {
              alerts.error('Erro ao atualizar', job.message || 'O Service Manager retornou erro na importação.')
            }
          }
        } catch { /* rede instável: a próxima volta tenta de novo */ }
      }, 2000)
    } catch (e) {
      // Aqui só cai quando o pedido nem chegou ao servidor — aí sim a hipótese
      // de rede faz sentido. Erro respondido pelo servidor é tratado acima.
      pararPolling()
      setImportando(false)
      alerts.error(
        'Não foi possível pedir a importação',
        'O pedido não chegou ao servidor. O balancete vem do SCI pelo Service Manager, '
        + `que roda na rede do escritório. Detalhe: ${(e as Error).message}`,
      )
    }
  }

  const desatualizado = (() => {
    if (!status?.ultimo) return false
    const p = janela12m()
    return status.ultimo < p.refFim
  })()

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) { pararPolling(); onFechar() } }}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={Database} color="sky">
          <DialogTitle>Balancete do cliente</DialogTitle>
          <DialogDescription>{clienteNome}</DialogDescription>
        </DialogHeaderIcon>

        <div className="space-y-4 px-5 pb-5">
          {carregando ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !status || status.meses === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="font-semibold">Nunca sincronizado</p>
              <p className="mt-0.5 text-xs">
                Sem balancete, o crédito da simulação é estimado por premissa em vez de sair das contas
                contábeis.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sincronizado até
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{refBR(status.ultimo)}</p>
                  <p className="text-[11px] text-muted-foreground">desde {refBR(status.primeiro)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Meses importados
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{status.meses}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {status.totalLinhas.toLocaleString('pt-BR')} linha(s)
                  </p>
                </div>
              </div>

              <div className={cn(
                'flex items-start gap-2 rounded-lg border px-4 py-2.5 text-xs',
                desatualizado
                  ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
              )}>
                {desatualizado
                  ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  {desatualizado
                    ? `Faltam meses até ${refBR(janela12m().refFim)}, o último mês fechado.`
                    : 'Em dia com o último mês fechado.'}
                </span>
              </div>

              {status.lacunas.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  <p className="font-semibold">Meses faltando no meio da série</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {status.lacunas.slice(0, 12).map(l => (
                      <Badge key={l} variant="outline" className="h-4 px-1.5 text-[10px] tabular-nums">{refBR(l)}</Badge>
                    ))}
                    {status.lacunas.length > 12 && <span>+{status.lacunas.length - 12}</span>}
                  </p>
                  <p className="mt-1">Buraco na série faz a média mensal sair menor do que a real.</p>
                </div>
              )}

              {status.atualizadoEm && (
                <p className="text-[11px] text-muted-foreground">
                  Última importação em {new Date(status.atualizadoEm).toLocaleString('pt-BR')}.
                </p>
              )}
            </>
          )}

          {importando && (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-all" style={{ width: `${progresso}%`, background: '#22d3ee' }} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{mensagem}</p>
            </div>
          )}
          {!importando && mensagem && (
            <p className="text-[11px] text-muted-foreground">{mensagem}</p>
          )}

          {status && !status.idSci && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
              <p className="font-semibold">Sem ID SCI no cadastro — será descoberto agora</p>
              <p className="mt-0.5">
                A importação identifica a empresa no Firebird pelo ID SCI. Como o cadastro ainda não tem,
                o sistema pergunta ao próprio SCI pelo CNPJ e guarda a resposta — da próxima vez já parte
                do cadastro.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              Busca os últimos 12 meses fechados no SCI.
            </p>
            <Button type="button" onClick={importar} className="gap-2" disabled={importando || !clienteId}>
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar do SCI
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
