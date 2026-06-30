'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, cn } from '@saas/ui'
import { Loader2, CheckSquare, Square } from 'lucide-react'
import { inspectSped } from '@/lib/ferramentas-api'
import type { ToolExtrasProps } from '../_config/tools'

// Abas exportáveis do SPED (espelha SPED_EXPORT_SHEET_KEYS/LABELS do webapp).
const SHEET_KEYS = ['0150', '0200', 'C100', 'C170', 'C190', 'C500', 'C590', 'D100', 'D190', 'D500', 'D590'] as const
const SHEET_LABELS: Record<string, string> = {
  '0150': '0150 — Participantes',
  '0200': '0200 — Itens (produtos/serviços)',
  C100: 'C100 — Documento fiscal (NF-e 55/65 e equivalentes)',
  C170: 'C170 — Itens do documento fiscal',
  C190: 'C190 — Registro analítico do documento',
  C500: 'C500 — Nota de energia, gás, água e comunicação',
  C590: 'C590 — Registro analítico (C500)',
  D100: 'D100 — Documento de transporte (CT-e e equivalentes)',
  D190: 'D190 — Registro analítico do CT-e',
  D500: 'D500 — Nota de serviço de comunicação e telecomunicação',
  D590: 'D590 — Registro analítico (D500)',
}
const isCore = (reg: string) => (SHEET_KEYS as readonly string[]).includes(reg)

/**
 * Seleção de abas/REGs do SPED. Ao escolher o arquivo, inspeciona os REGs
 * presentes (proxy → webapp) e mostra um checklist (default tudo marcado).
 * Reporta ao formulário os campos `sheets` (+`presentRegs` se houver REG fora
 * dos principais). Degrada para só as abas principais se o inspect falhar.
 */
export function SpedSheetSelector({ files, color, onFields, onBlock }: ToolExtrasProps) {
  const file = files['file']?.[0] ?? null
  const [presentRegs, setPresentRegs] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(SHEET_KEYS))
  const [inspecting, setInspecting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const lastFileRef = useRef<File | null>(null)

  // Inspeciona quando o arquivo muda.
  useEffect(() => {
    if (!file) { setPresentRegs(null); lastFileRef.current = null; return }
    if (file === lastFileRef.current) return
    lastFileRef.current = file
    setSelected(new Set(SHEET_KEYS))
    setNotice(null)
    setInspecting(true)
    inspectSped(file)
      .then((r) => setPresentRegs(r.presentRegs ?? []))
      .catch(() => { setPresentRegs([]); setNotice('Não foi possível listar blocos extras — só as abas principais ficam disponíveis.') })
      .finally(() => setInspecting(false))
  }, [file])

  const extraRegs = useMemo(() => (presentRegs ?? []).filter((r) => !isCore(r)), [presentRegs])
  const listed = useMemo(() => [...SHEET_KEYS, ...extraRegs], [extraRegs])

  // Reporta campos + estado de bloqueio ao formulário pai.
  useEffect(() => {
    if (!file) { onFields({}); onBlock(false); return }
    if (inspecting || presentRegs === null) { onBlock(true); return }
    const ordered = listed.filter((k) => selected.has(k))
    const needsPresent = ordered.some((s) => !isCore(s))
    onFields({ sheets: JSON.stringify(ordered), ...(needsPresent ? { presentRegs: JSON.stringify(presentRegs) } : {}) })
    onBlock(ordered.length === 0)
  }, [file, inspecting, presentRegs, listed, selected, onFields, onBlock])

  if (!file) return null

  function toggle(reg: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(reg)) next.delete(reg)
      else next.add(reg)
      return next
    })
  }
  const allChecked = listed.length > 0 && listed.every((r) => selected.has(r))

  return (
    <div className="rounded-xl border border-border/60 bg-background/50 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-2 pb-3">
        <p className="text-[13px] font-semibold text-foreground">
          Abas da planilha <span className="font-normal text-muted-foreground">(cada opção vira uma aba)</span>
        </p>
        {inspecting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex gap-2 pb-3">
        <Button
          size="sm" variant="outline" className="h-7 gap-1.5 rounded-lg text-xs" disabled={inspecting}
          onClick={() => setSelected(new Set(listed))}
        >
          <CheckSquare className="h-3.5 w-3.5" /> Marcar todos
        </Button>
        <Button
          size="sm" variant="outline" className="h-7 gap-1.5 rounded-lg text-xs" disabled={inspecting}
          onClick={() => setSelected(new Set())}
        >
          <Square className="h-3.5 w-3.5" /> Desmarcar todos
        </Button>
      </div>

      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border/50 bg-card/50 p-1.5">
        {listed.map((reg) => {
          const checked = selected.has(reg)
          return (
            <label
              key={reg}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                checked ? 'hover:bg-muted/60' : 'text-muted-foreground hover:bg-muted/40',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(reg)}
                className="h-4 w-4 rounded border-border accent-current"
                style={{ accentColor: color }}
              />
              <span className="truncate">{SHEET_LABELS[reg] ?? `${reg} — bloco adicional`}</span>
            </label>
          )
        })}
        {!inspecting && listed.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma aba disponível.</p>
        )}
      </div>

      {selected.size === 0 && !inspecting && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Selecione ao menos uma aba para gerar a planilha.</p>
      )}
      {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}
    </div>
  )
}
