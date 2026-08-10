'use client'

import { useState } from 'react'
import { ExternalLink, X, Loader2, Search as SearchIcon } from 'lucide-react'
import { Button, Input, Label, Checkbox } from '@saas/ui'
import { alerts } from '@/lib/alerts'
import { mensagemErro } from '@/lib/errors'
import { trpc } from '@/lib/trpc'

/**
 * "Verificar no ERP (SCI)" — consulta o movimento do cliente no Firebird e,
 * de quebra, GRAVA os snapshots (o `buscarMetricasSci` do backend persiste o
 * retorno). É por aqui que a gestão de contratos ganha período importado.
 *
 * Compartilhado entre a aba Comercial do cliente e a coluna Situação do painel
 * de gestão: nos dois lugares o gesto é o mesmo — escolher o período e trazer
 * do ERP —, e manter duas telas para isso só criaria divergência.
 */
export interface VerificarErpModalProps {
  clienteId: string
  open: boolean
  onOpenChange: (aberto: boolean) => void
  /** Linha de contexto sob o título (ex.: CNPJ · razão social). */
  subtitulo?: string
  /** Chamado após uma consulta bem-sucedida — os snapshots já foram gravados. */
  onSincronizado?: () => void
}

const INDICADORES = [
  { key: 'lancamentos', label: 'Lancamentos' },
  { key: 'nf_entrada', label: 'NF Entrada' },
  { key: 'nf_saida', label: 'NF Saida' },
  { key: 'nf_prestado', label: 'NF Prestado' },
  { key: 'nf_tomado', label: 'NF Tomado' },
  { key: 'faturamento', label: 'Faturamento' },
  { key: 'vidas', label: 'Funcionarios' },
] as const

/** Padrão: últimos 3 meses completos — o mês corrente ainda está em aberto. */
function periodoPadrao() {
  const ini = new Date(); ini.setMonth(ini.getMonth() - 3)
  const fim = new Date(); fim.setDate(0)
  return { datai: ini.toISOString().slice(0, 10), dataf: fim.toISOString().slice(0, 10) }
}

export function VerificarErpModal({ clienteId, open, onOpenChange, subtitulo, onSincronizado }: VerificarErpModalProps) {
  const padrao = periodoPadrao()
  const [datai, setDatai] = useState(padrao.datai)
  const [dataf, setDataf] = useState(padrao.dataf)
  const [selecionados, setSelecionados] = useState<string[]>(INDICADORES.map(i => i.key))
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null)

  function alternar(ind: string) {
    setSelecionados(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind])
  }

  async function consultar() {
    if (!clienteId || selecionados.length === 0) return
    setLoading(true)
    setResultado(null)
    try {
      const r = await trpc.cliente.buscarMetricasSci.query({ clienteId, datai, dataf, indicadores: selecionados })
      setResultado(r as Record<string, unknown>)
      // O backend já gravou os snapshots junto com a consulta; avisa quem abriu
      // para que a lista reflita o período novo sem precisar de F5.
      onSincronizado?.()
    } catch (e) {
      alerts.error('Erro SCI', mensagemErro(e, 'Nao foi possivel consultar o ERP.'))
    } finally { setLoading(false) }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => !loading && onOpenChange(false)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col modal-content" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-muted-foreground" /> Verificar no ERP (SCI)
              </h4>
              {subtitulo && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitulo}</p>}
            </div>
            <button type="button" onClick={() => !loading && onOpenChange(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          {/* Filtros */}
          <div className="px-5 py-3 border-b border-border shrink-0">
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-4 space-y-1.5">
                <Label>Data Inicial</Label>
                <Input type="date" value={datai} onChange={(e) => setDatai(e.target.value)} />
              </div>
              <div className="col-span-4 space-y-1.5">
                <Label>Data Final</Label>
                <Input type="date" value={dataf} onChange={(e) => setDataf(e.target.value)} />
              </div>
              <div className="col-span-4">
                <Button type="button" size="sm" onClick={consultar} disabled={loading || selecionados.length === 0}
                  className="w-full" style={{ backgroundColor: 'var(--mod-cadastros, #10b981)', color: '#fff' }}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />}
                  {loading ? 'Consultando...' : 'Consultar'}
                </Button>
              </div>
              <div className="col-span-12">
                <div className="flex flex-wrap gap-2">
                  {INDICADORES.map((ind) => (
                    <label key={ind.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox checked={selecionados.includes(ind.key)} onCheckedChange={() => alternar(ind.key)} />
                      {ind.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Resultado */}
          <div className="nice-scrollbar flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
                <p className="text-sm text-muted-foreground">Consultando SCI Firebird...</p>
              </div>
            ) : !resultado ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ExternalLink className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Selecione o periodo e clique em Consultar.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  Periodo: {(resultado.periodo as Record<string, string>)?.datai} a {(resultado.periodo as Record<string, string>)?.dataf}
                  {' | '}CNPJ: {resultado.cnpj as string}
                  {' · '}os períodos consultados ficam salvos e alimentam o farol.
                </div>
                {selecionados.map((ind) => {
                  const rows = resultado[ind] as Array<Record<string, unknown>> | undefined
                  if (!rows || rows.length === 0) return (
                    <div key={ind} className="text-xs text-muted-foreground">
                      <strong className="text-foreground">{ind.replace(/_/g, ' ')}</strong>: Sem dados no periodo
                    </div>
                  )
                  const total = rows.reduce((s, r) => s + (Number(r.movimentacao) || 0), 0)
                  const media = rows.length > 0 ? total / rows.length : 0
                  const fmt = (v: number) => ind === 'faturamento'
                    ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : Math.round(v).toLocaleString('pt-BR')
                  return (
                    <div key={ind}>
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="text-xs font-semibold text-foreground capitalize">{ind.replace(/_/g, ' ')}</h5>
                        <div className="text-[10px] text-muted-foreground">
                          Total: <strong>{fmt(total)}</strong>&nbsp;|&nbsp;Media: <strong>{fmt(media)}</strong>
                        </div>
                      </div>
                      <div className="nice-scrollbar overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border/40">
                              <th className="text-left py-1 pr-3 font-semibold text-muted-foreground">Mes/Ano</th>
                              <th className="text-right py-1 font-semibold text-muted-foreground">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={i} className="border-b border-border/20">
                                <td className="py-1 pr-3">{String(r.mes).padStart(2, '0')}/{String(r.ano)}</td>
                                <td className="py-1 text-right font-mono">{fmt(Number(r.movimentacao || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex justify-end shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </div>
      </div>
    </>
  )
}
