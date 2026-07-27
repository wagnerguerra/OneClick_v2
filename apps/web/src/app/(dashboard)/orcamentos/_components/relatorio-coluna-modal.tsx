'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Button, Input, Label, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BarChart3 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { getCampos, DEFAULT_CAMPOS } from './relatorio-coluna-lib'

interface Props {
  open: boolean
  onClose: () => void
  status: string
  statusLabel: string
  moduleColor: string
}

export function RelatorioColunaModal({ open, onClose, status, statusLabel, moduleColor }: Props) {
  const CAMPOS = getCampos(statusLabel)

  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [tipo, setTipo] = useState<'' | 'MENSAL' | 'EXTRA'>('')
  const [areasSel, setAreasSel] = useState<Set<string>>(new Set())
  const [campos, setCampos] = useState<Set<string>>(new Set(DEFAULT_CAMPOS))
  const [areaOptions, setAreaOptions] = useState<Array<{ areaId: string; nome: string }>>([])

  useEffect(() => {
    if (!open) return
    setDataInicio(''); setDataFim(''); setTipo(''); setAreasSel(new Set()); setCampos(new Set(DEFAULT_CAMPOS))
    ;(trpc.orcamento as unknown as { listAreasSelecionaveis: { query: () => Promise<Array<{ areaId: string; nome: string }>> } })
      .listAreasSelecionaveis.query()
      .then(setAreaOptions)
      .catch(() => setAreaOptions([]))
  }, [open])

  const camposSelecionados = CAMPOS.filter(c => campos.has(c.key))

  function toggleCampo(key: string) {
    setCampos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function toggleArea(id: string) {
    setAreasSel(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // "Gerar relatório" abre a página de resultados numa nova aba, levando a
  // configuração via query string (nada sensível — status, datas, ids de área
  // e chaves de campo).
  function gerar() {
    const params = new URLSearchParams()
    params.set('status', status)
    if (dataInicio) params.set('de', dataInicio)
    if (dataFim) params.set('ate', dataFim)
    if (tipo) params.set('tipo', tipo)
    if (areasSel.size > 0) params.set('areas', [...areasSel].join(','))
    params.set('campos', camposSelecionados.map(c => c.key).join(','))
    window.open(`/orcamentos/relatorio-coluna?${params.toString()}`, '_blank')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeaderIcon icon={BarChart3} color="violet">
          <DialogTitle>Relatório — {statusLabel}</DialogTitle>
          <DialogDescription>Consulta apenas os orçamentos desta coluna. Configure os filtros e os campos; o relatório abre em uma nova aba.</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-5">
          {/* Filtros */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Período — de</Label>
              <Input type="date" className="h-9 text-sm" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Período — até</Label>
              <Input type="date" className="h-9 text-sm" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Tipo de serviço</Label>
              <Select value={tipo || '__all__'} onValueChange={v => setTipo(v === '__all__' ? '' : v as 'MENSAL' | 'EXTRA')}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="MENSAL">Mensal</SelectItem>
                  <SelectItem value="EXTRA">Extra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Áreas selecionadas</Label>
              <div className="h-9 flex items-center text-xs text-muted-foreground">{areasSel.size === 0 ? 'Todas' : `${areasSel.size} selecionada(s)`}</div>
            </div>
          </div>

          {/* Área que solicitou (chips) */}
          {areaOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">Área que solicitou</Label>
              <div className="flex flex-wrap gap-1.5">
                {areaOptions.map(a => {
                  const active = areasSel.has(a.areaId)
                  return (
                    <button
                      key={a.areaId}
                      type="button"
                      onClick={() => toggleArea(a.areaId)}
                      className={cn('px-2.5 h-7 rounded-full text-xs font-medium border transition-colors',
                        active ? 'text-white border-transparent' : 'bg-card border-border text-muted-foreground hover:bg-muted/50')}
                      style={active ? { backgroundColor: moduleColor } : undefined}
                    >
                      {a.nome}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Campos a exibir */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Campos do relatório</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded-lg border border-border bg-muted/20 p-3">
              {CAMPOS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded cursor-pointer" style={{ accentColor: moduleColor }}
                    checked={campos.has(c.key)} onChange={() => toggleCampo(c.key)} />
                  <span className="truncate">{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" style={{ backgroundColor: moduleColor }} className="text-white gap-1.5" onClick={gerar} disabled={camposSelecionados.length === 0}>
            <BarChart3 className="h-4 w-4" />
            Gerar relatório
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
