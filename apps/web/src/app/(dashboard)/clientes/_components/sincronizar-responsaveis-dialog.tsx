'use client'

import { useState } from 'react'
import {
  Loader2, X, Users, Check, AlertTriangle, UserCog,
} from 'lucide-react'
import {
  Button, Card, Badge, Input, Label,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Resultado {
  stats: {
    clientesProcessados: number
    clientesSemDados: number
    areasAtualizadas: number
    areasSemMatch: number
    areasNaoContratadas: number
  }
  pendencias: Array<{
    clienteId: string
    clienteNome: string
    area: string
    respDominante: string
    ocorrencias: number
    motivo: string
  }>
}

export function SincronizarResponsaveisDialog({ open, onOpenChange, onAfterRun }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAfterRun: () => void
}) {
  const [mesesHistorico, setMesesHistorico] = useState<number>(12)
  const [running, setRunning] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  async function executar() {
    setRunning(true)
    setResultado(null)
    try {
      const res = await (trpc as any).cliente.sincronizarResponsaveis.mutate({ mesesHistorico })
      setResultado(res as Resultado)
      onAfterRun()
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao sincronizar responsáveis.')
    } finally { setRunning(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[840px] max-h-[90vh] flex flex-col">
        <DialogHeaderIcon icon={UserCog} color="orange">
          <DialogTitle>Sincronizar Responsáveis com Acessórias</DialogTitle>
          <DialogDescription className="text-xs">
            Lê as deliveries do Acessórias do último período e atualiza o responsável de cada área contratada
            do cliente (Fiscal · Trabalhista · Contábil · Legalização) com base no responsável dominante
            por departamento.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="flex-1 overflow-auto space-y-4">
          {!resultado && !running && (
            <Card className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Período (meses de histórico)</Label>
                <Input
                  type="number" min={1} max={60}
                  value={mesesHistorico}
                  onChange={(e) => setMesesHistorico(Math.max(1, Math.min(60, Number(e.target.value) || 12)))}
                  className="h-9 text-sm w-32 tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground">
                  Padrão 12 meses. Quanto maior, mais dados — mas pode considerar responsáveis que mudaram recentemente.
                </p>
              </div>
              <div className="rounded border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                <p className="font-semibold mb-1">Como funciona:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Para cada cliente vinculado ao Acessórias, busca as deliveries do período</li>
                  <li>Agrupa por departamento Acessórias (Fiscal/Trabalhista/Pessoal/Contábil)</li>
                  <li>Identifica o responsável dominante (mais frequente) de cada departamento</li>
                  <li>Mapeia o nome para um usuário do OneClick (match por nome canônico)</li>
                  <li>Atualiza <code>ClienteAreaContratada.responsavelId</code> da área correspondente</li>
                </ul>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Requer sync prévio das deliveries</strong> com responsáveis. Se você sincronizou
                    deliveries antes desta versão, refaça a sincronização (Configurações → Acessórias) pra
                    capturar os campos novos (RespPrazo, DptoNome).
                  </div>
                </div>
              </div>
            </Card>
          )}

          {running && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
              <p className="text-sm text-muted-foreground">Processando clientes...</p>
            </div>
          )}

          {resultado && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Card className="p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">Clientes processados</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.clientesProcessados}</div>
                </Card>
                <Card className="p-3 border-l-2 border-emerald-200">
                  <div className="text-[10px] uppercase text-emerald-700">Áreas atualizadas</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.areasAtualizadas}</div>
                </Card>
                <Card className="p-3 border-l-2 border-amber-200">
                  <div className="text-[10px] uppercase text-amber-700">Sem match no User</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.areasSemMatch}</div>
                </Card>
                <Card className="p-3 border-l-2 border-red-200">
                  <div className="text-[10px] uppercase text-red-700">Área não contratada</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.areasNaoContratadas}</div>
                </Card>
                <Card className="p-3 border-l-2 border-slate-200">
                  <div className="text-[10px] uppercase text-slate-700">Sem dados Acessórias</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.clientesSemDados}</div>
                </Card>
              </div>

              {resultado.pendencias.length > 0 && (
                <Card>
                  <div className="px-4 py-2 border-b text-xs font-semibold text-muted-foreground">
                    Pendências ({resultado.pendencias.length}) — requerem ação manual
                  </div>
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-auto whitespace-nowrap">Cliente</TableHead>
                        <TableHead className="hidden sm:table-cell w-[110px] whitespace-nowrap">Área</TableHead>
                        <TableHead className="hidden md:table-cell w-[180px] whitespace-nowrap">Responsável Acessórias</TableHead>
                        <TableHead className="hidden lg:table-cell w-[60px] text-center whitespace-nowrap">Ocorr.</TableHead>
                        <TableHead className="w-auto whitespace-nowrap">Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resultado.pendencias.slice(0, 50).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="truncate text-xs font-medium" title={p.clienteNome}>
                            {p.clienteNome}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell whitespace-nowrap">
                            <Badge variant="outline" className="h-5 text-[10px]">{p.area}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell truncate text-xs" title={p.respDominante}>
                            {p.respDominante}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-center text-xs tabular-nums text-muted-foreground">
                            {p.ocorrencias}
                          </TableCell>
                          <TableCell className="truncate text-[11px] text-muted-foreground italic" title={p.motivo}>
                            {p.motivo}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {resultado.pendencias.length > 50 && (
                    <div className="px-4 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground">
                      Mostrando primeiras 50 de {resultado.pendencias.length} pendências.
                    </div>
                  )}
                </Card>
              )}

              {resultado.stats.areasAtualizadas > 0 && resultado.pendencias.length === 0 && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
                  <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-900">
                    <strong>{resultado.stats.areasAtualizadas} áreas atualizadas.</strong> Todos os responsáveis foram
                    sincronizados sem pendências.
                  </p>
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {!running && !resultado && (
            <Button onClick={executar} style={{ backgroundColor: '#f97316', color: 'white' }}>
              <Users className="h-4 w-4" />Sincronizar agora
            </Button>
          )}
          {resultado && (
            <Button onClick={() => setResultado(null)} variant="outline">
              <UserCog className="h-4 w-4" />Rodar de novo
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            <X className="h-4 w-4" />Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
