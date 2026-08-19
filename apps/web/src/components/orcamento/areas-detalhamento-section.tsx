'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Check, ClipboardList, Loader2, Pencil } from 'lucide-react'
import {
  Badge, Button, Input, Label, RichContent, RichEditor, cn,
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { useUserPermissions } from '@/hooks/use-user-permissions'

interface UsuarioRef { id: string; name: string; image: string | null }
export interface OrcamentoAreaRow {
  id: string
  areaId: string
  areaNome: string
  status: string // PENDENTE | DETALHADO | ATRASADO
  prazo: string
  prazoOriginal: string
  prorrogado: boolean
  prorrogadoEm: string | null
  justificativaProrrogacao: string | null
  detalhe: string | null
  valor: number | string | null
  responsavel: UsuarioRef | null
  substituto: UsuarioRef | null
  respondidoPor: UsuarioRef | null
  respondidoEm: string | null
}

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: 'Pendente', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' },
  ATRASADO: { label: 'Atrasado', cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800' },
  DETALHADO: { label: 'Detalhado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' },
}

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const moedaBR = (v: number | string | null) =>
  v == null ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Detalhamento por área — a contraparte visual do workflow `OrcamentoArea`,
 * que até então só existia nas notificações: o líder era cobrado por e-mail
 * ("Detalhe a área X", "Área X em atraso") e caía numa página sem nenhum
 * vestígio da pendência. Aqui ficam o status, o prazo e as ações Detalhar /
 * Prorrogar que o backend já validava.
 *
 * Não confundir com "Áreas envolvidas" (derivadas dos serviços dos itens,
 * #HLP0266): este vínculo é o de NOTIFICAÇÃO, escolhido na criação.
 */
export function AreasDetalhamentoSection({ orcamentoId, accent, onCountChange }: {
  orcamentoId: string
  /** Cor do módulo, para o título da seção. */
  accent: string
  /** Avisa o pai quantas áreas de notificação existem (ajusta o card vizinho). */
  onCountChange?: (n: number) => void
}) {
  const { profile } = useCurrentUserProfile()
  const { isMaster, isEmpresaMaster } = useUserPermissions()

  const [rows, setRows] = useState<OrcamentoAreaRow[]>([])
  const [carregado, setCarregado] = useState(false)

  // Modal Detalhar
  const [detalhando, setDetalhando] = useState<OrcamentoAreaRow | null>(null)
  const [detTexto, setDetTexto] = useState('')
  const [detValor, setDetValor] = useState('')
  const [salvandoDet, setSalvandoDet] = useState(false)

  // Modal Prorrogar
  const [prorrogando, setProrrogando] = useState<OrcamentoAreaRow | null>(null)
  const [proDias, setProDias] = useState('5')
  const [proJust, setProJust] = useState('')
  const [salvandoPro, setSalvandoPro] = useState(false)

  const carregar = useCallback(() => {
    ;(trpc.orcamento as any).listAreasDoOrcamento.query({ orcamentoId })
      .then((r: OrcamentoAreaRow[]) => { setRows(r); onCountChange?.(r.length) })
      .catch(() => { setRows([]); onCountChange?.(0) })
      .finally(() => setCarregado(true))
  }, [orcamentoId, onCountChange])
  useEffect(() => { carregar() }, [carregar])

  if (!carregado || rows.length === 0) return null

  // Espelho do podeGerenciarArea do backend (que revalida de verdade): líder,
  // substituto, membro da área ou master.
  const podeAgir = (r: OrcamentoAreaRow) =>
    isMaster || isEmpresaMaster ||
    (!!profile?.id && (r.responsavel?.id === profile.id || r.substituto?.id === profile.id)) ||
    (!!profile?.area?.id && profile.area.id === r.areaId)

  async function salvarDetalhe() {
    const r = detalhando!
    const semTags = detTexto.replace(/<[^>]*>/g, '').trim()
    if (!semTags) { alerts.error('Falta o detalhamento', 'Descreva a parte da sua área.'); return }
    setSalvandoDet(true)
    try {
      const valor = detValor.trim() === '' ? null : Number(detValor.replace(',', '.'))
      if (valor != null && Number.isNaN(valor)) throw new Error('Valor inválido.')
      await (trpc.orcamento as any).detalharArea.mutate({ id: r.id, detalhe: detTexto, valor })
      alerts.success('Detalhado', `A parte de ${r.areaNome} foi registrada.`)
      setDetalhando(null)
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvandoDet(false) }
  }

  async function salvarProrrogacao() {
    const r = prorrogando!
    const dias = Number(proDias)
    // A justificativa é gravada e exibida como texto puro — tira as tags do editor.
    const justificativa = proJust.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!Number.isInteger(dias) || dias < 1) { alerts.error('Dias inválidos', 'Informe quantos dias a mais são necessários.'); return }
    if (justificativa.length < 3) { alerts.error('Falta a justificativa', 'Explique o motivo da prorrogação.'); return }
    setSalvandoPro(true)
    try {
      await (trpc.orcamento as any).prorrogarArea.mutate({ id: r.id, dias, justificativa })
      alerts.success('Prorrogado', 'O prazo foi estendido. Só é possível prorrogar uma vez.')
      setProrrogando(null)
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvandoPro(false) }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4" style={{ color: accent }} />
        <Label className="text-[13px] font-semibold text-foreground">Detalhamento por área</Label>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        Áreas notificadas na criação do orçamento para detalhar a sua parte. O líder (ou substituto) responde aqui.
      </p>

      <div className="space-y-2">
        {rows.map((r) => {
          const st = STATUS_UI[r.status] ?? { label: r.status, cls: '' }
          return (
            <div key={r.id} className={cn(
              'rounded-md border px-3 py-2.5',
              r.status === 'ATRASADO' ? 'border-rose-200 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/10' : 'border-border bg-muted/20',
            )}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{r.areaNome}</span>
                <Badge variant="outline" className={cn('text-[10px]', st.cls)}>{st.label}</Badge>
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  Prazo: {dataBR(r.prazo)}{r.prorrogado && ' (prorrogado)'}
                </span>
                {r.responsavel && (
                  <span className="text-[11px] text-muted-foreground">
                    Responsável: {r.responsavel.name}{r.substituto ? ` · Substituto: ${r.substituto.name}` : ''}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  {r.status !== 'DETALHADO' && podeAgir(r) && (
                    <>
                      <Button type="button" variant="success" size="xs" onClick={() => {
                        setDetTexto(r.detalhe ?? ''); setDetValor(r.valor != null ? String(r.valor) : ''); setDetalhando(r)
                      }}>
                        <Pencil className="h-3.5 w-3.5" />Detalhar
                      </Button>
                      {!r.prorrogado && (
                        <Button type="button" variant="outline" size="xs" onClick={() => { setProDias('5'); setProJust(''); setProrrogando(r) }}>
                          <CalendarClock className="h-3.5 w-3.5" />Prorrogar
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {r.prorrogado && r.justificativaProrrogacao && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Prorrogação: {r.justificativaProrrogacao}
                </p>
              )}

              {r.status === 'DETALHADO' && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  {r.detalhe && <RichContent className="text-sm [&_p]:my-1" html={r.detalhe} />}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {moedaBR(r.valor) ? <>Valor sugerido: <span className="font-medium">{moedaBR(r.valor)}</span> · </> : null}
                    Respondido por {r.respondidoPor?.name ?? '—'} em {dataBR(r.respondidoEm)}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Modal: detalhar ── */}
      <Dialog open={!!detalhando} onOpenChange={(o) => { if (!salvandoDet && !o) setDetalhando(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Pencil} color="sky">
            <DialogTitle>Detalhar a área {detalhando?.areaNome}</DialogTitle>
            <DialogDescription>
              Descreva o que a sua área precisa fazer neste orçamento — o comercial usa isso para montar a proposta.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <Label className="text-[13px] font-semibold">Detalhamento</Label>
              <div className="mt-1.5">
                <RichEditor value={detTexto} onChange={setDetTexto} placeholder="O que será feito, escopo, observações..." />
              </div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Valor sugerido (opcional)</Label>
              <div className="flex mt-1.5 max-w-[220px]">
                <span className="inline-flex items-center px-2 h-9 border border-r-0 border-input bg-muted text-xs text-muted-foreground rounded-l-md">R$</span>
                <Input type="text" inputMode="decimal" value={detValor} onChange={(e) => setDetValor(e.target.value)}
                  className="h-9 text-sm rounded-l-none" placeholder="0,00" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDetalhando(null)} disabled={salvandoDet}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarDetalhe} disabled={salvandoDet}>
              {salvandoDet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: prorrogar ── */}
      <Dialog open={!!prorrogando} onOpenChange={(o) => { if (!salvandoPro && !o) setProrrogando(null) }}>
        <DialogContent>
          <DialogHeaderIcon icon={CalendarClock} color="amber">
            <DialogTitle>Prorrogar o prazo de {prorrogando?.areaNome}</DialogTitle>
            <DialogDescription>
              O prazo atual é {dataBR(prorrogando?.prazo)}. Cada área só pode ser prorrogada uma vez.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <Label className="text-[13px] font-semibold">Dias a mais</Label>
              <Input type="number" min={1} max={60} value={proDias} onChange={(e) => setProDias(e.target.value)}
                className="h-9 text-sm mt-1.5 w-[120px]" />
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Justificativa</Label>
              <div className="mt-1.5">
                <RichEditor value={proJust} onChange={setProJust} placeholder="Por que o prazo original não é suficiente..." />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setProrrogando(null)} disabled={salvandoPro}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarProrrogacao} disabled={salvandoPro}>
              {salvandoPro ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Prorrogar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
