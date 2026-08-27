'use client'

/**
 * Varredura do dossiê sobre a base inteira.
 *
 * Abre em simulação: mostra quantos clientes serão consultados, quantos ficam
 * de fora e por quê, e quanto tempo deve levar — antes de qualquer chamada
 * sair para a internet. Só depois disso o botão de rodar aparece.
 *
 * A varredura pode ser interrompida e retomada: o TTL de 60 dias faz quem já
 * foi consultado responder do que está gravado, então recomeçar continua de
 * onde parou.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { FileSearch, Loader2, Play, Square, AlertTriangle } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Input, Label } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

type Simulacao = {
  dryRun: true
  total: number; consultaveis: number; semCnae: number
  alfanumericos: number; invalidos: number
  exemplosAlfanumericos: string[]; exemplosInvalidos: string[]
  estimativaMinutos: number
}
type Progresso = {
  rodando: boolean; total: number; processados: number
  ok: number; erros: number; pulados: number
  clienteAtual: string; ultimoErro: string | null
}

export function DossieBackfillModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [sim, setSim] = useState<Simulacao | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [limite, setLimite] = useState('50')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const simular = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await (trpc.cliente as never as {
        backfillDossie: { mutate: (i: { dryRun: boolean }) => Promise<Simulacao> }
      }).backfillDossie.mutate({ dryRun: true })
      setSim(r)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      onOpenChange(false)
    } finally { setCarregando(false) }
  }, [onOpenChange])

  const lerProgresso = useCallback(async () => {
    try {
      const p = await (trpc.cliente as never as {
        progressoBackfillDossie: { query: () => Promise<Progresso> }
      }).progressoBackfillDossie.query()
      setProgresso(p)
      if (!p.rodando && timer.current) { clearInterval(timer.current); timer.current = null }
    } catch { /* silencioso: o acompanhamento não pode virar ruído */ }
  }, [])

  useEffect(() => {
    if (!open) {
      setSim(null); setProgresso(null)
      if (timer.current) { clearInterval(timer.current); timer.current = null }
      return
    }
    void simular()
    void lerProgresso()
  }, [open, simular, lerProgresso])

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  async function rodar() {
    const n = parseInt(limite, 10)
    const ok = await alerts.confirm({
      title: 'Rodar a varredura?',
      text: `Serão consultados até ${Number.isFinite(n) ? n : 'todos os'} clientes nas fontes públicas. Você pode interromper a qualquer momento.`,
      icon: 'question', confirmText: 'Rodar',
    })
    if (!ok) return
    // Dispara sem esperar: a varredura é longa e o acompanhamento é por sondagem.
    void (trpc.cliente as never as {
      backfillDossie: { mutate: (i: { dryRun: boolean; limite?: number }) => Promise<unknown> }
    }).backfillDossie.mutate({ dryRun: false, ...(Number.isFinite(n) && n > 0 ? { limite: n } : {}) })
      .catch((e: Error) => alerts.error('Erro', e.message))
    setProgresso({ rodando: true, total: 0, processados: 0, ok: 0, erros: 0, pulados: 0, clienteAtual: '', ultimoErro: null })
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => { void lerProgresso() }, 2000)
  }

  async function interromper() {
    await (trpc.cliente as never as {
      cancelarBackfillDossie: { mutate: () => Promise<unknown> }
    }).cancelarBackfillDossie.mutate().catch(() => {})
  }

  const pct = progresso && progresso.total > 0
    ? Math.round((progresso.processados / progresso.total) * 100)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeaderIcon icon={FileSearch} color="violet">
          <DialogTitle>Varredura do dossiê</DialogTitle>
          <DialogDescription>
            Consulta o CNPJ dos clientes ativos nas fontes públicas e preenche o dossiê. Não
            sobrescreve o cadastro: divergências viram sugestão na aba Dossiê de cada cliente.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          {carregando && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo a base…
            </div>
          )}

          {!carregando && sim && !progresso?.rodando && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['A consultar', sim.consultaveis],
                  ['Sem CNAE hoje', sim.semCnae],
                  ['CNPJ alfanumérico', sim.alfanumericos],
                  ['Documento inválido', sim.invalidos],
                ].map(([rotulo, valor]) => (
                  <div key={String(rotulo)} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <p className="text-lg font-semibold text-foreground">{valor as number}</p>
                    <p className="text-[11px] text-muted-foreground">{rotulo as string}</p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Estimativa: cerca de {sim.estimativaMinutos} minuto(s) para a base inteira, no ritmo
                que respeita a cota das fontes gratuitas.
              </p>

              {(sim.alfanumericos > 0 || sim.invalidos > 0) && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    {sim.alfanumericos > 0 && (
                      <p>
                        {sim.alfanumericos} cliente(s) com CNPJ alfanumérico ficam de fora: nenhuma
                        fonte pública aceita esse formato ainda.
                        {sim.exemplosAlfanumericos.length > 0 && <> Ex.: {sim.exemplosAlfanumericos.slice(0, 3).join(', ')}.</>}
                      </p>
                    )}
                    {sim.invalidos > 0 && (
                      <p>
                        {sim.invalidos} com documento fora do formato de CNPJ.
                        {sim.exemplosInvalidos.length > 0 && <> Ex.: {sim.exemplosInvalidos.slice(0, 3).join(', ')}.</>}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Limite desta rodada</Label>
                  <Input
                    value={limite}
                    onChange={(e) => setLimite(e.target.value.replace(/\D/g, ''))}
                    className="h-9 w-32 text-sm"
                    placeholder="todos"
                  />
                </div>
                <p className="pb-2 text-xs text-muted-foreground">
                  Vazio roda a base toda. Comece pequeno e confira o resultado.
                </p>
              </div>
            </>
          )}

          {progresso?.rodando && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-sm text-foreground">
                {progresso.processados} de {progresso.total} · {progresso.ok} ok · {progresso.erros} com erro
              </p>
              {progresso.clienteAtual && (
                <p className="truncate text-xs text-muted-foreground">Consultando: {progresso.clienteAtual}</p>
              )}
              {progresso.ultimoErro && (
                <p className="truncate text-xs text-amber-600">Último erro — {progresso.ultimoErro}</p>
              )}
            </div>
          )}

          {progresso && !progresso.rodando && progresso.processados > 0 && (
            <p className="text-sm text-foreground">
              Rodada encerrada: {progresso.ok} enriquecido(s), {progresso.erros} com erro,
              {' '}{progresso.pulados} fora do alcance da consulta.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          {progresso?.rodando ? (
            <Button variant="soft-destructive" size="sm" className="gap-1.5" onClick={() => void interromper()}>
              <Square className="h-4 w-4" /> Interromper
            </Button>
          ) : (
            <Button variant="success" size="sm" className="gap-1.5" onClick={() => void rodar()} disabled={!sim || sim.consultaveis === 0}>
              <Play className="h-4 w-4" /> Rodar a varredura
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
