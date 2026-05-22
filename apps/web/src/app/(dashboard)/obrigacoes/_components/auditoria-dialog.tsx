'use client'

import { Fragment, useState } from 'react'
import {
  Loader2, X, Sparkles, Check, AlertTriangle, Database, TrendingUp,
} from 'lucide-react'
import {
  Button, Card, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

type Ajuste = 'MANTER' | 'ANTECIPAR' | 'POSTERGAR'
type Sugestao = Ajuste | 'INCONCLUSIVO' | 'SEM_DADOS' | 'REGRA_SUSPEITA'

interface LinhaAuditoria {
  obrigacaoId: string
  nome: string
  categoria: string | null
  ajusteAtual: Ajuste
  amostras: number
  relevantes: number
  postergados: number
  antecipados: number
  mantidos: number
  outliersGrandes: number
  regraSuspeita: boolean
  sugestao: Sugestao
  confianca: number
  exemplos: Array<{ competencia: string; teorico: string; oficial: string; deltaDias: number }>
}

const AJUSTE_LABEL: Record<Ajuste, string> = {
  MANTER: 'Manter',
  ANTECIPAR: 'Antecipar',
  POSTERGAR: 'Postergar',
}
const AJUSTE_CORES: Record<Ajuste, string> = {
  MANTER: 'bg-slate-100 text-slate-700 border-slate-200',
  ANTECIPAR: 'bg-amber-50 text-amber-700 border-amber-200',
  POSTERGAR: 'bg-sky-50 text-sky-700 border-sky-200',
}

function MiniBadge({ ajuste }: { ajuste: Ajuste }) {
  return (
    <Badge variant="outline" className={cn('h-5 text-[10px] font-medium border', AJUSTE_CORES[ajuste])}>
      {AJUSTE_LABEL[ajuste]}
    </Badge>
  )
}

export function AuditoriaDialog({
  open,
  onOpenChange,
  onAfterApply,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAfterApply: () => void
}) {
  const [linhas, setLinhas] = useState<LinhaAuditoria[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState<Set<string>>(new Set())

  async function rodar() {
    setLoading(true)
    setErro(null)
    setLinhas([])
    try {
      const res = await (trpc as any).obrigacao.auditar.query({ mesesHistorico: 60 })
      setLinhas(res as LinhaAuditoria[])
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao executar auditoria.')
    } finally { setLoading(false) }
  }

  async function aplicar(linha: LinhaAuditoria) {
    if (linha.sugestao === 'SEM_DADOS' || linha.sugestao === 'INCONCLUSIVO') return
    const sug = linha.sugestao as Ajuste
    const next = new Set(aplicando); next.add(linha.obrigacaoId); setAplicando(next)
    try {
      await (trpc as any).obrigacao.aplicarSugestao.mutate({
        obrigacaoId: linha.obrigacaoId,
        ajuste: sug,
      })
      // Atualiza a linha no estado local
      setLinhas((prev) => prev.map((l) => l.obrigacaoId === linha.obrigacaoId ? { ...l, ajusteAtual: sug } : l))
      onAfterApply()
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao aplicar sugestão.')
    } finally {
      const next2 = new Set(aplicando); next2.delete(linha.obrigacaoId); setAplicando(next2)
    }
  }

  async function aplicarTodas() {
    const aplicaveis = linhas.filter((l) => {
      if (l.sugestao === 'SEM_DADOS' || l.sugestao === 'INCONCLUSIVO') return false
      if (l.sugestao === l.ajusteAtual) return false
      return l.confianca >= 60
    })
    if (aplicaveis.length === 0) {
      alerts.warning('Nada para aplicar', 'Nenhuma sugestão diferente da configuração atual com confiança ≥ 60%.')
      return
    }
    const ok = await alerts.confirm({
      title: `Aplicar ${aplicaveis.length} sugestões?`,
      text: `Todas as obrigações com sugestão diferente da configuração atual e confiança ≥ 60% serão atualizadas.`,
      confirmText: 'Aplicar todas',
      icon: 'warning',
    })
    if (!ok) return
    for (const l of aplicaveis) {
      try {
        await (trpc as any).obrigacao.aplicarSugestao.mutate({
          obrigacaoId: l.obrigacaoId,
          ajuste: l.sugestao as Ajuste,
        })
      } catch { /* segue pra próxima */ }
    }
    await alerts.success('Aplicado', `${aplicaveis.length} obrigações atualizadas.`)
    onAfterApply()
    rodar()
  }

  function toggleExpand(id: string) {
    const next = new Set(expandido)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpandido(next)
  }

  const totalAplicaveis = linhas.filter((l) =>
    (l.sugestao === 'MANTER' || l.sugestao === 'ANTECIPAR' || l.sugestao === 'POSTERGAR')
      && l.sugestao !== l.ajusteAtual && l.confianca >= 60
  ).length
  const totalSemDados = linhas.filter((l) => l.sugestao === 'SEM_DADOS').length
  const totalInconclusivos = linhas.filter((l) => l.sugestao === 'INCONCLUSIVO').length
  const totalSuspeitas = linhas.filter((l) => l.sugestao === 'REGRA_SUSPEITA').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[920px] max-h-[90vh] flex flex-col">
        <DialogHeaderIcon icon={Sparkles} color="orange">
          <DialogTitle>Auditoria de Recorrência com Acessórias</DialogTitle>
          <DialogDescription className="text-xs">
            Compara últimos 5 anos de entregas do Acessórias com a data teórica calculada pela recorrência.
            Identifica o padrão de ajuste (antecipar / postergar / manter) usado pelos órgãos.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="flex-1 overflow-auto space-y-4">
          {/* Status / call-to-action */}
          {linhas.length === 0 && !loading && !erro && (
            <div className="rounded border border-dashed border-border/60 bg-muted/20 p-6 text-center space-y-3">
              <Database className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                A auditoria usa as entregas já sincronizadas do Acessórias. Verifique que a sincronização
                de deliveries está atualizada antes de rodar.
              </p>
              <Button onClick={rodar} style={{ backgroundColor: '#f97316', color: 'white' }}>
                <TrendingUp className="h-4 w-4" />Executar auditoria
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
              <p className="text-sm text-muted-foreground">Analisando últimos 5 anos de entregas...</p>
            </div>
          )}

          {erro && (
            <div className="rounded border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {erro}
              </p>
            </div>
          )}

          {linhas.length > 0 && (
            <>
              {/* Sumário */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Card className="p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">Total auditado</div>
                  <div className="text-xl font-semibold tabular-nums">{linhas.length}</div>
                </Card>
                <Card className="p-3 border-l-2 border-emerald-200">
                  <div className="text-[10px] uppercase text-emerald-700">Aplicáveis</div>
                  <div className="text-xl font-semibold tabular-nums">{totalAplicaveis}</div>
                  <div className="text-[10px] text-muted-foreground">conf ≥ 60%, ≠ atual</div>
                </Card>
                <Card className="p-3 border-l-2 border-red-200">
                  <div className="text-[10px] uppercase text-red-700">Regras suspeitas</div>
                  <div className="text-xl font-semibold tabular-nums">{totalSuspeitas}</div>
                  <div className="text-[10px] text-muted-foreground">delta &gt; 7 dias</div>
                </Card>
                <Card className="p-3 border-l-2 border-amber-200">
                  <div className="text-[10px] uppercase text-amber-700">Inconclusivos</div>
                  <div className="text-xl font-semibold tabular-nums">{totalInconclusivos}</div>
                  <div className="text-[10px] text-muted-foreground">conf &lt; 60%</div>
                </Card>
                <Card className="p-3 border-l-2 border-slate-200">
                  <div className="text-[10px] uppercase text-slate-700">Sem dados</div>
                  <div className="text-xl font-semibold tabular-nums">{totalSemDados}</div>
                  <div className="text-[10px] text-muted-foreground">sem sync Acessórias</div>
                </Card>
              </div>

              {/* Tabela de resultados */}
              <Card>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[22px]" />
                      <TableHead className="w-auto whitespace-nowrap">Obrigação</TableHead>
                      <TableHead className="hidden sm:table-cell w-[90px] text-center whitespace-nowrap">Atual</TableHead>
                      <TableHead className="hidden sm:table-cell w-[100px] text-center whitespace-nowrap">Sugestão</TableHead>
                      <TableHead className="hidden md:table-cell w-[80px] text-center whitespace-nowrap">Confiança</TableHead>
                      <TableHead className="hidden md:table-cell w-[80px] text-center whitespace-nowrap">Amostras</TableHead>
                      <TableHead className="w-[90px] text-right whitespace-nowrap">Aplicar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => {
                      const podeAplicar = l.sugestao !== 'SEM_DADOS' && l.sugestao !== 'INCONCLUSIVO' && l.sugestao !== l.ajusteAtual && l.confianca >= 60
                      const isExp = expandido.has(l.obrigacaoId)
                      const isLoad = aplicando.has(l.obrigacaoId)
                      return (
                        <Fragment key={l.obrigacaoId}>
                          <TableRow className="hover:bg-muted/30">
                            <TableCell className="w-[22px] text-center" onClick={() => l.exemplos.length > 0 && toggleExpand(l.obrigacaoId)}>
                              {l.exemplos.length > 0 && (
                                <button
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                  title={isExp ? 'Recolher exemplos' : 'Ver exemplos'}
                                >
                                  {isExp ? '▾' : '▸'}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="truncate" title={l.nome}>
                              <span className="font-medium text-sm">{l.nome}</span>
                              {l.categoria && (
                                <span className="ml-2 text-[10px] text-muted-foreground">· {l.categoria}</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-center whitespace-nowrap">
                              <MiniBadge ajuste={l.ajusteAtual} />
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-center whitespace-nowrap">
                              {l.sugestao === 'SEM_DADOS' ? (
                                <span className="text-[10px] text-muted-foreground">sem dados</span>
                              ) : l.sugestao === 'INCONCLUSIVO' ? (
                                <span className="text-[10px] text-amber-700">inconclusivo</span>
                              ) : l.sugestao === 'REGRA_SUSPEITA' ? (
                                <Badge variant="outline" className="h-5 text-[10px] bg-red-50 text-red-700 border-red-200" title="Mais da metade das amostras tem delta > 7 dias — regra de recorrência provavelmente está mal cadastrada (offset/valor errado).">
                                  ⚠ regra errada?
                                </Badge>
                              ) : (
                                <MiniBadge ajuste={l.sugestao as Ajuste} />
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-center whitespace-nowrap">
                              {l.relevantes > 0 ? (
                                <span className={cn(
                                  'text-xs tabular-nums font-medium',
                                  l.confianca >= 80 ? 'text-emerald-700' : l.confianca >= 60 ? 'text-amber-700' : 'text-muted-foreground',
                                )}>
                                  {l.confianca}%
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-center text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                              {l.amostras}
                              {l.relevantes > 0 && <span className="text-[9px]"> ({l.relevantes} relev.)</span>}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {podeAplicar ? (
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() => aplicar(l)}
                                  disabled={isLoad}
                                  style={{ backgroundColor: '#10b981' }}
                                >
                                  {isLoad ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  Aplicar
                                </Button>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExp && l.exemplos.length > 0 && (
                            <TableRow className="bg-muted/30">
                              <TableCell />
                              <TableCell colSpan={6} className="text-[11px] py-2">
                                <div className="space-y-1">
                                  <span className="font-semibold text-muted-foreground">Exemplos:</span>
                                  {l.exemplos.map((ex, i) => (
                                    <div key={i} className="flex items-center gap-3 text-muted-foreground tabular-nums">
                                      <span>Comp. <strong className="text-foreground">{ex.competencia}</strong></span>
                                      <span>·</span>
                                      <span>Teórico <strong className="text-foreground">{ex.teorico}</strong></span>
                                      <span>·</span>
                                      <span>Oficial <strong className="text-foreground">{ex.oficial}</strong></span>
                                      <span className={cn(
                                        'ml-auto font-semibold',
                                        ex.deltaDias > 0 ? 'text-sky-700' : ex.deltaDias < 0 ? 'text-amber-700' : 'text-muted-foreground',
                                      )}>
                                        {ex.deltaDias > 0 ? `+${ex.deltaDias}d (postergou)` : ex.deltaDias < 0 ? `${ex.deltaDias}d (antecipou)` : 'sem ajuste'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {linhas.length > 0 && totalAplicaveis > 0 && (
            <Button onClick={aplicarTodas} variant="success" style={{ backgroundColor: '#10b981' }}>
              <Check className="h-4 w-4" />Aplicar todas as {totalAplicaveis} aplicáveis
            </Button>
          )}
          {linhas.length > 0 && (
            <Button variant="outline" onClick={rodar}>
              <TrendingUp className="h-4 w-4" />Rodar de novo
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
