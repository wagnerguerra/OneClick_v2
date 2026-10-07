'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Button, Label, cn, Checkbox,
} from '@saas/ui'
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { getCamposExportacao, DEFAULT_CAMPOS_EXPORTACAO } from './relatorio-coluna-lib'

export type FormatoExportacao = 'xlsx' | 'csv' | 'pdf'

const FORMATOS: Array<{ v: FormatoExportacao; t: string; Icon: typeof FileText }> = [
  { v: 'xlsx', t: 'Excel (.xlsx)', Icon: FileSpreadsheet },
  { v: 'csv', t: 'CSV', Icon: FileText },
  { v: 'pdf', t: 'PDF', Icon: FileDown },
]

interface Props {
  open: boolean
  onClose: () => void
  /** Quantos orçamentos o filtro atual devolve (só informativo). */
  total?: number
  /** URL de download com os filtros da tela + formato e campos escolhidos. */
  montarUrl: (formato: FormatoExportacao, campos: string[]) => string
}

/**
 * Exportação da lista de orçamentos (#HLP0265) com os filtros aplicados na
 * tela — vale para a lista e para o quadro. Os campos se escolhem como no
 * "Relatório da coluna", com o Status a mais (marcado por padrão), porque a
 * exportação atravessa etapas.
 */
export function ExportarOrcamentosModal({ open, onClose, total, montarUrl }: Props) {
  const CAMPOS = getCamposExportacao()
  const [campos, setCampos] = useState<Set<string>>(new Set(DEFAULT_CAMPOS_EXPORTACAO))
  const [formato, setFormato] = useState<FormatoExportacao>('xlsx')

  useEffect(() => {
    if (!open) return
    setCampos(new Set(DEFAULT_CAMPOS_EXPORTACAO))
    setFormato('xlsx')
  }, [open])

  const camposSelecionados = CAMPOS.filter(c => campos.has(c.key))

  function toggleCampo(key: string) {
    setCampos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Download por navegação (Content-Disposition no servidor) — imune ao
  // bloqueio de download disparado por JS.
  function exportar() {
    const a = document.createElement('a')
    a.href = montarUrl(formato, camposSelecionados.map(c => c.key))
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh]">
        <DialogHeaderIcon icon={FileDown} color="emerald">
          <DialogTitle>Exportar orçamentos</DialogTitle>
          <DialogDescription>
            Exporta os orçamentos com os filtros aplicados na tela
            {total != null ? ` — ${total} orçamento${total === 1 ? '' : 's'}` : ''}. Escolha o formato e os campos.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Formato</Label>
            <div className="flex flex-wrap gap-1.5">
              {FORMATOS.map(({ v, t, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFormato(v)}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    formato === v ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted/50')}
                >
                  <Icon className="h-3.5 w-3.5" /> {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Campos da exportação</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded-lg border border-border bg-muted/20 p-3">
              {CAMPOS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <Checkbox checked={campos.has(c.key)} onCheckedChange={() => toggleCampo(c.key)} />
                  <span className="truncate">{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="success" size="sm" className="gap-1.5" onClick={exportar} disabled={camposSelecionados.length === 0}>
            <FileDown className="h-4 w-4" />
            Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
