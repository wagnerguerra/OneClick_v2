'use client'

import { useState, useEffect } from 'react'
import { FileText, X, Save, Loader2, Search as SearchIcon } from 'lucide-react'
import { Button, Input, Label } from '@saas/ui'
import { masks, numeroParaMoeda, moedaParaNumero } from '@/lib/masks'
import { alerts } from '@/lib/alerts'
import { mensagemErro } from '@/lib/errors'
import { trpc } from '@/lib/trpc'

/**
 * Parâmetros do contrato — metadata (vigência, renovação) + a baseline com que
 * o painel de gestão compara o movimento do ERP.
 *
 * Vive fora do cadastro do cliente porque é aberto de dois lugares: da aba
 * Comercial e da coluna Situação da gestão de contratos. Duas cópias iriam
 * divergir no primeiro campo novo — e o farol leria de uma delas.
 */
export interface ParametrosContratoModalProps {
  clienteId: string
  open: boolean
  onOpenChange: (aberto: boolean) => void
  /** Linha de contexto sob o título (ex.: CNPJ · razão social). */
  subtitulo?: string
  /** Chamado após salvar — quem abriu costuma precisar recarregar a lista. */
  onSaved?: () => void
}

type ParamsState = {
  honorario: number; lancamentos: number; faturamento: number
  nfEntrada: number; nfSaida: number; nfPrestado: number; nfTomado: number; funcionarios: number
  numero: string; tipo: string; dataInicio: string; dataFim: string
  permanente: boolean; diasAlertaRenovacao: string; gestaoIgnorar: boolean
}

const VAZIO: ParamsState = {
  honorario: 0, lancamentos: 0, faturamento: 0, nfEntrada: 0, nfSaida: 0, nfPrestado: 0, nfTomado: 0, funcionarios: 0,
  numero: '', tipo: '', dataInicio: '', dataFim: '', permanente: false, diasAlertaRenovacao: '', gestaoIgnorar: false,
}

export function ParametrosContratoModal({ clienteId, open, onOpenChange, subtitulo, onSaved }: ParametrosContratoModalProps) {
  const [params, setParams] = useState<ParamsState>(VAZIO)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  // Recarrega a cada abertura: o painel pode ter salvo o mesmo cliente por
  // outro caminho enquanto o modal estava fechado.
  useEffect(() => {
    if (!open || !clienteId) return
    let cancelado = false
    setLoading(true)
    setInfo(null)
    setParams(VAZIO)
    trpc.cliente.getContratoParams.query({ clienteId })
      .then((data: unknown) => {
        if (cancelado || !data) return
        const d = data as Record<string, unknown>
        const num = (k: string) => Number(d[k]) || 0
        const dateStr = (k: string) => (d[k] ? String(d[k]).slice(0, 10) : '')
        setParams({
          honorario: num('honorario'), lancamentos: num('lancamentos'), faturamento: num('faturamento'),
          nfEntrada: num('nfEntrada'), nfSaida: num('nfSaida'), nfPrestado: num('nfPrestado'),
          nfTomado: num('nfTomado'), funcionarios: num('funcionarios'),
          numero: d.numero ? String(d.numero) : '',
          tipo: d.tipo ? String(d.tipo) : '',
          dataInicio: dateStr('dataInicio'),
          dataFim: dateStr('dataFim'),
          permanente: !!d.permanente,
          diasAlertaRenovacao: d.diasAlertaRenovacao != null ? String(d.diasAlertaRenovacao) : '',
          gestaoIgnorar: !!d.gestaoIgnorar,
        })
      })
      .catch(() => { /* silencioso: cliente sem parâmetros abre com o formulário vazio */ })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [open, clienteId])

  /** Puxa a média dos últimos meses com movimento do SCI para a baseline. */
  async function obterSugeridos() {
    if (!clienteId) return
    setBuscando(true)
    setInfo(null)
    try {
      const result = await trpc.cliente.getParametrosSugeridos.query({ clienteId }) as {
        parametros: Record<string, number>; periodo: { datai: string; dataf: string }; origem: string
        mesesUsados?: string[]
      }
      setParams(prev => ({
        ...prev,
        lancamentos: result.parametros.lancamentos ?? prev.lancamentos,
        faturamento: result.parametros.faturamento ?? prev.faturamento,
        nfEntrada: result.parametros.nfEntrada ?? prev.nfEntrada,
        nfSaida: result.parametros.nfSaida ?? prev.nfSaida,
        nfPrestado: result.parametros.nfPrestado ?? prev.nfPrestado,
        nfTomado: result.parametros.nfTomado ?? prev.nfTomado,
        funcionarios: result.parametros.funcionarios ?? prev.funcionarios,
      }))
      const meses = result.mesesUsados ?? []
      setInfo(meses.length > 0
        ? `Média dos últimos meses com movimento: ${meses.join(', ')}.`
        : `Sem movimento no período consultado (${result.periodo.datai} a ${result.periodo.dataf}) — parâmetros vieram zerados.`)
    } catch (e) {
      alerts.error('Erro ao obter parametros', mensagemErro(e, 'Nao foi possivel consultar o SCI.'))
    } finally { setBuscando(false) }
  }

  async function salvar() {
    if (!clienteId) return
    setSaving(true)
    try {
      await trpc.cliente.saveContratoParams.mutate({
        clienteId,
        honorario: params.honorario, lancamentos: params.lancamentos, faturamento: params.faturamento,
        nfEntrada: params.nfEntrada, nfSaida: params.nfSaida, nfPrestado: params.nfPrestado,
        nfTomado: params.nfTomado, funcionarios: params.funcionarios,
        numero: params.numero || null,
        tipo: params.tipo || null,
        dataInicio: params.dataInicio || null,
        dataFim: params.dataFim || null,
        permanente: params.permanente,
        diasAlertaRenovacao: params.diasAlertaRenovacao !== '' ? Number(params.diasAlertaRenovacao) : null,
        gestaoIgnorar: params.gestaoIgnorar,
      })
      await alerts.success('Parametros salvos', 'Os parametros do contrato foram atualizados.')
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      alerts.error('Erro', mensagemErro(e, 'Nao foi possivel salvar.'))
    } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => onOpenChange(false)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-lg shadow-xl w-full max-w-lg modal-content" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="min-w-0">
              <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" /> Parametros do Contrato
              </h4>
              {subtitulo && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitulo}</p>}
            </div>
            <button type="button" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          {/* Body */}
          <div className="p-5">
            {loading ? (
              <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
            ) : (
              <div className="nice-scrollbar space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                {/* Contrato (vínculo / vigência / renovação) */}
                <div className="rounded border border-border/60 p-3 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contrato</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Número do contrato</Label>
                      <Input placeholder="Ex.: 2024/001" value={params.numero} onChange={(e) => setParams(p => ({ ...p, numero: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo / modalidade</Label>
                      <Input placeholder="Ex.: Prestação de serviços" value={params.tipo} onChange={(e) => setParams(p => ({ ...p, tipo: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Início da vigência</Label>
                      <Input type="date" value={params.dataInicio} onChange={(e) => setParams(p => ({ ...p, dataInicio: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Fim da vigência</Label>
                      <Input type="date" value={params.dataFim} disabled={params.permanente}
                        onChange={(e) => setParams(p => ({ ...p, dataFim: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Alerta de renovação (dias)</Label>
                      <Input type="number" placeholder="30" value={params.diasAlertaRenovacao} disabled={params.permanente}
                        onChange={(e) => setParams(p => ({ ...p, diasAlertaRenovacao: e.target.value }))} />
                    </div>
                    <div className="flex flex-col justify-end gap-2 pb-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" checked={params.permanente}
                          onChange={(e) => setParams(p => ({ ...p, permanente: e.target.checked, ...(e.target.checked ? { dataFim: '' } : {}) }))} />
                        Contrato permanente (sem prazo)
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" checked={params.gestaoIgnorar}
                          onChange={(e) => setParams(p => ({ ...p, gestaoIgnorar: e.target.checked }))} />
                        Ignorar no painel de gestão
                      </label>
                    </div>
                  </div>
                </div>

                {/* Baseline de parâmetros (comparação com o ERP) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Honorário (R$)</Label>
                    <Input
                      placeholder="0,00"
                      value={numeroParaMoeda(params.honorario)}
                      onChange={(e) => { e.target.value = masks.moeda(e.target.value); setParams(p => ({ ...p, honorario: moedaParaNumero(e.target.value) || 0 })) }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lancamentos</Label>
                    <Input type="number" placeholder="0" value={params.lancamentos || ''} onChange={(e) => setParams(p => ({ ...p, lancamentos: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Faturamento (R$)</Label>
                    <Input
                      placeholder="0,00"
                      value={numeroParaMoeda(params.faturamento)}
                      onChange={(e) => { e.target.value = masks.moeda(e.target.value); setParams(p => ({ ...p, faturamento: moedaParaNumero(e.target.value) || 0 })) }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>NF Entrada</Label>
                    <Input type="number" placeholder="0" value={params.nfEntrada || ''} onChange={(e) => setParams(p => ({ ...p, nfEntrada: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>NF Saida</Label>
                    <Input type="number" placeholder="0" value={params.nfSaida || ''} onChange={(e) => setParams(p => ({ ...p, nfSaida: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>NF Prestado</Label>
                    <Input type="number" placeholder="0" value={params.nfPrestado || ''} onChange={(e) => setParams(p => ({ ...p, nfPrestado: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>NF Tomado</Label>
                    <Input type="number" placeholder="0" value={params.nfTomado || ''} onChange={(e) => setParams(p => ({ ...p, nfTomado: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Funcionarios</Label>
                    <Input type="number" placeholder="0" value={params.funcionarios || ''} onChange={(e) => setParams(p => ({ ...p, funcionarios: Number(e.target.value) || 0 }))} />
                  </div>
                </div>
              </div>
            )}
            {info && (
              <div className="mt-3 rounded bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                {info}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={obterSugeridos} disabled={buscando || loading}>
              {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />}
              {buscando ? 'Consultando SCI...' : 'Obter parametros iniciais'}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button type="button" size="sm" onClick={salvar} disabled={saving || loading}
                style={{ backgroundColor: 'var(--mod-cadastros, #10b981)', color: '#fff' }}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
