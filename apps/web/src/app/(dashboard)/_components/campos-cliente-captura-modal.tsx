'use client'

/**
 * CamposClienteCapturaModal — modal aberto ao concluir um passo da execução
 * quando há campos do Cliente vinculados ao passo. Pré-preenche cada input
 * com o valor atual do cliente. Bloqueia o submit se campos obrigatórios
 * estiverem vazios. Submit retorna um objeto { campoChave: valor } que o
 * checklist envia no togglePasso.
 */

import { useEffect, useState, useMemo } from 'react'
import {
  Button, Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Input, Label, Checkbox, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { Database, Loader2, AlertCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { PARAMETROS_CONTRATO_CAMPOS, type CampoClienteDef } from '@saas/types'

interface CampoPreview {
  id: string
  campoChave: string
  labelOverride: string | null
  obrigatorio: boolean
  /** Quando true, o operador precisa revisar (alterar ou marcar checkbox). */
  exigeEdicao: boolean
  valorAtual: unknown
  /** Opções carregadas dinamicamente do backend (tipos virtuais como AREAS_CONTRATADAS). */
  opcoesDinamicas?: Array<{ value: string; label: string }>
}

interface Props {
  execPassoId: string
  /** Chamado quando o usuário confirma — recebe os valores capturados pra que o
   *  caller dispare o togglePasso com valoresCampos.
   *  `camposRevisados` = chaves de campos exigeEdicao=true cujos checkboxes
   *  "Revisado" foram marcados (bypass da validação de "valor não alterado"). */
  onConfirmar: (valores: Record<string, unknown>, camposRevisados: string[]) => Promise<void>
  onCancelar: () => void
}

export function CamposClienteCapturaModal({ execPassoId, onConfirmar, onCancelar }: Props) {
  const [campos, setCampos] = useState<CampoPreview[]>([])
  const [catalogo, setCatalogo] = useState<CampoClienteDef[]>([])
  const [valores, setValores] = useState<Record<string, unknown>>({})
  /** Set de campoChave marcadas pelo operador como revisadas (bypass da
   *  validação "valor não alterado" em campos com exigeEdicao=true). */
  const [revisados, setRevisados] = useState<Set<string>>(new Set())
  /** Snapshot do valor inicial — usado pra detectar "valor alterado" em campos
   *  exigeEdicao. Quando o operador muda, auto-marca como revisado. */
  const [valoresIniciais, setValoresIniciais] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [preview, cat] = await Promise.all([
          (trpc.servico as any).previewCamposClienteDoPasso.query({ execPassoId }) as Promise<{ campos: CampoPreview[]; cliente: { id: string } | null }>,
          (trpc.servico as any).listCamposClienteCatalogo.query() as Promise<CampoClienteDef[]>,
        ])
        setCampos(preview.campos)
        setCatalogo(cat)
        // Pré-preenche com valores atuais do cliente
        const inicial: Record<string, unknown> = {}
        for (const c of preview.campos) {
          const def = cat.find(d => d.key === c.campoChave)
          if (def?.tipo === 'AREAS_CONTRATADAS') {
            // valorAtual já vem como array de areaIds contratadas (Set inicial)
            inicial[c.campoChave] = Array.isArray(c.valorAtual) ? c.valorAtual : []
          } else if (def?.tipo === 'PARAMETROS_CONTRATO') {
            // Vem como objeto { honorario, faturamento, lancamentos, ... }
            inicial[c.campoChave] = (c.valorAtual && typeof c.valorAtual === 'object' && !Array.isArray(c.valorAtual))
              ? c.valorAtual
              : { honorario: 0, faturamento: 0, lancamentos: 0, nfEntrada: 0, nfSaida: 0, nfPrestado: 0, nfTomado: 0, funcionarios: 0 }
          } else if (def?.tipo === 'PARTICULARIDADES_AREAS') {
            // Vem como array [{ clienteAreaContratadaId, areaNome, texto }]
            inicial[c.campoChave] = Array.isArray(c.valorAtual) ? c.valorAtual : []
          } else if (def?.tipo === 'DATE' && c.valorAtual) {
            // ISO date → YYYY-MM-DD pro input type="date"
            inicial[c.campoChave] = new Date(c.valorAtual as string).toISOString().slice(0, 10)
          } else {
            inicial[c.campoChave] = c.valorAtual ?? ''
          }
        }
        setValores(inicial)
        setValoresIniciais(inicial)
      } catch (e) {
        alerts.error('Erro', (e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [execPassoId])

  const obrigatoriosFaltando = useMemo(() => {
    return campos.filter(c => {
      if (!c.obrigatorio) return false
      const v = valores[c.campoChave]
      if (v == null) return true
      if (Array.isArray(v)) {
        if (v.length === 0) return true
        // Array de objetos com `texto` (particularidades) — exige ao menos 1 não vazio
        if (typeof v[0] === 'object' && v[0] !== null && 'texto' in (v[0] as object)) {
          return !(v as Array<{ texto: string }>).some(x => x.texto && x.texto.trim() !== '')
        }
        return false
      }
      if (typeof v === 'string') return v.trim() === ''
      return false
    })
  }, [campos, valores])

  /** Campos com exigeEdicao=true que NÃO foram revisados (nem o valor foi
   *  alterado, nem o checkbox foi marcado). Bloqueia conclusão. */
  const revisaoFaltando = useMemo(() => {
    return campos.filter(c => {
      if (!c.exigeEdicao) return false
      if (revisados.has(c.campoChave)) return false
      const atual = valoresIniciais[c.campoChave]
      const enviado = valores[c.campoChave]
      // Comparação simples por stringify — cobre string, number, date string, e arrays
      return JSON.stringify(atual) === JSON.stringify(enviado)
    })
  }, [campos, valores, valoresIniciais, revisados])

  async function handleConfirmar() {
    if (obrigatoriosFaltando.length > 0) {
      alerts.error('Campos obrigatórios', 'Preencha todos os campos obrigatórios antes de concluir.')
      return
    }
    if (revisaoFaltando.length > 0) {
      alerts.error('Revisão pendente', 'Altere o valor ou marque "Revisado" nos campos destacados.')
      return
    }
    setSubmitting(true)
    try {
      await onConfirmar(valores, Array.from(revisados))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancelar()}>
      <DialogContent className="sm:max-w-[560px] max-h-[88vh] overflow-y-auto">
        <DialogHeaderIcon icon={Database} color="sky">
          <DialogTitle>Preencher campos do cliente</DialogTitle>
          <DialogDescription>
            Este passo coleta dados do cadastro do cliente. Os valores informados serão salvos automaticamente no Cliente.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : campos.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm italic">
              Nenhum campo vinculado.
            </div>
          ) : (
            campos.map(c => {
              const def = catalogo.find(d => d.key === c.campoChave)
              const label = c.labelOverride ?? def?.label ?? c.campoChave
              const valor = valores[c.campoChave] ?? ''
              const precisaRevisao = c.exigeEdicao && revisaoFaltando.some(r => r.campoChave === c.campoChave)
              return (
                <div
                  key={c.id}
                  className={cn(
                    'space-y-1.5 transition-colors',
                    precisaRevisao && 'rounded-md border-2 border-amber-300 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800 p-2.5',
                  )}
                >
                  <Label className="text-[13px] font-semibold flex items-center gap-2">
                    {label}
                    {c.obrigatorio && <span className="text-rose-500">*</span>}
                    {c.exigeEdicao && (
                      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                        Revisar
                      </span>
                    )}
                  </Label>
                  {def?.tipo === 'AREAS_CONTRATADAS' ? (
                    <AreasContratadasField
                      opcoes={c.opcoesDinamicas ?? []}
                      selected={Array.isArray(valor) ? valor as string[] : []}
                      onChange={(ids) => setValores(v => ({ ...v, [c.campoChave]: ids }))}
                    />
                  ) : def?.tipo === 'PARAMETROS_CONTRATO' ? (
                    <ParametrosContratoField
                      valores={(valor && typeof valor === 'object' && !Array.isArray(valor)) ? valor as Record<string, number> : {}}
                      onChange={(novos) => setValores(v => ({ ...v, [c.campoChave]: novos }))}
                    />
                  ) : def?.tipo === 'PARTICULARIDADES_AREAS' ? (
                    <ParticularidadesAreasField
                      itens={Array.isArray(valor) ? valor as Array<{ clienteAreaContratadaId: string; areaNome: string; texto: string }> : []}
                      onChange={(novos) => setValores(v => ({ ...v, [c.campoChave]: novos }))}
                    />
                  ) : def?.tipo === 'TEXTAREA' ? (
                    <textarea
                      value={String(valor)}
                      onChange={e => setValores(v => ({ ...v, [c.campoChave]: e.target.value }))}
                      rows={3}
                      placeholder={def?.placeholder}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  ) : def?.tipo === 'SELECT' ? (
                    <Select value={String(valor) || undefined} onValueChange={v => setValores(vs => ({ ...vs, [c.campoChave]: v }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(def.options ?? []).map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : def?.tipo === 'BOOL' ? (
                    <Select value={String(valor)} onValueChange={v => setValores(vs => ({ ...vs, [c.campoChave]: v === 'true' }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Sim</SelectItem>
                        <SelectItem value="false">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={def?.tipo === 'DATE' ? 'date' : def?.tipo === 'NUMBER' ? 'number' : def?.tipo === 'EMAIL' ? 'email' : 'text'}
                      value={String(valor)}
                      onChange={e => setValores(v => ({ ...v, [c.campoChave]: e.target.value }))}
                      placeholder={def?.placeholder}
                      className="h-9 text-sm"
                    />
                  )}
                  {/* Checkbox "Revisado" — só renderiza quando exigeEdicao=true. Operador
                      pode marcar pra confirmar o valor atual sem alterar. Auto-marca via
                      revisaoFaltando quando valor é modificado (comparação JSON). */}
                  {c.exigeEdicao && (
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none mt-1">
                      <Checkbox
                        checked={!precisaRevisao}
                        onCheckedChange={(v) => {
                          setRevisados(prev => {
                            const next = new Set(prev)
                            if (v === true) next.add(c.campoChave)
                            else next.delete(c.campoChave)
                            return next
                          })
                        }}
                      />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Revisado / valor confirmado
                      </span>
                    </label>
                  )}
                </div>
              )
            })
          )}
          {obrigatoriosFaltando.length > 0 && (
            <div className="flex items-start gap-1.5 p-2 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[11px] dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Preencha os {obrigatoriosFaltando.length} campo(s) obrigatório(s) antes de concluir.
              </span>
            </div>
          )}
          {revisaoFaltando.length > 0 && (
            <div className="flex items-start gap-1.5 p-2 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[11px] dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                {revisaoFaltando.length} campo(s) com revisão pendente — altere o valor ou marque &quot;Revisado&quot;.
              </span>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleConfirmar} disabled={submitting || loading || obrigatoriosFaltando.length > 0 || revisaoFaltando.length > 0} className="bg-sky-600 hover:bg-sky-700">
            {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Concluir passo e salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Lista de textareas, uma por área contratada do cliente, pra o tipo virtual
 * PARTICULARIDADES_AREAS. Backend já carregou só as áreas com contratado=true
 * (lista vazia se cliente ainda não tem nenhuma).
 */
function ParticularidadesAreasField({ itens, onChange }: {
  itens: Array<{ clienteAreaContratadaId: string; areaNome: string; texto: string }>
  onChange: (novos: Array<{ clienteAreaContratadaId: string; areaNome: string; texto: string }>) => void
}) {
  if (itens.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground italic">
        Cliente ainda não tem áreas contratadas. Marque as áreas no campo &quot;Áreas contratadas&quot; ou no cadastro do cliente primeiro.
      </div>
    )
  }
  function setTexto(idx: number, texto: string) {
    onChange(itens.map((it, i) => i === idx ? { ...it, texto } : it))
  }
  return (
    <div className="space-y-2">
      {itens.map((it, idx) => (
        <div key={it.clienteAreaContratadaId} className="rounded-md border bg-card p-2.5 space-y-1">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {it.areaNome}
          </Label>
          <textarea
            value={it.texto}
            onChange={e => setTexto(idx, e.target.value)}
            placeholder="Particularidades / observações desta área..."
            rows={2}
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[12px] resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      ))}
    </div>
  )
}

/**
 * Grid de inputs para o tipo virtual PARAMETROS_CONTRATO. Mostra os 8 subcampos
 * de `ClienteContratoParam` (honorário, faturamento, lançamentos, NFs, etc) e
 * mantém o objeto sincronizado via `onChange`. Tipo='CURRENCY' formata com R$
 * e duas casas; 'NUMBER' é inteiro.
 */
function ParametrosContratoField({ valores, onChange }: {
  valores: Record<string, number>
  onChange: (novos: Record<string, number>) => void
}) {
  function setCampo(key: string, v: string) {
    const num = v === '' ? 0 : parseFloat(v.replace(',', '.'))
    onChange({ ...valores, [key]: isNaN(num) ? 0 : num })
  }
  return (
    <div className="rounded-md border bg-card p-3 grid grid-cols-2 gap-3">
      {PARAMETROS_CONTRATO_CAMPOS.map(c => {
        const val = valores[c.key] ?? 0
        return (
          <div key={c.key} className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">{c.label}</Label>
            <Input
              type="number"
              step={c.tipo === 'CURRENCY' ? '0.01' : '1'}
              min={0}
              value={val === 0 ? '' : val}
              onChange={e => setCampo(c.key, e.target.value)}
              placeholder={c.tipo === 'CURRENCY' ? '0,00' : '0'}
              className="h-8 text-sm tabular-nums"
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Multi-select de checkboxes para o tipo virtual AREAS_CONTRATADAS.
 * Mostra todas as áreas com `availableForHiring=true` carregadas do backend.
 * Pre-marca as que o cliente já tem `contratado=true`. Toggle individual.
 */
function AreasContratadasField({ opcoes, selected, onChange }: {
  opcoes: Array<{ value: string; label: string }>
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  if (opcoes.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground italic">
        Nenhuma área disponível para contratação. Habilite áreas em Cadastros → Áreas (flag “Disponível para contratação”).
      </div>
    )
  }
  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }
  return (
    <div className="rounded-md border bg-card max-h-[240px] overflow-y-auto p-2 space-y-1">
      {opcoes.map(opt => {
        const checked = selected.includes(opt.value)
        return (
          <label
            key={opt.value}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(opt.value)}
              className="h-3.5 w-3.5 rounded border-input cursor-pointer accent-sky-600"
            />
            <span className="text-[12px] font-medium">{opt.label}</span>
          </label>
        )
      })}
      <div className="pt-1.5 mt-1 border-t flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{selected.length} de {opcoes.length} marcadas</span>
        <button
          type="button"
          onClick={() => onChange(selected.length === opcoes.length ? [] : opcoes.map(o => o.value))}
          className="text-sky-600 hover:text-sky-700 font-medium"
        >
          {selected.length === opcoes.length ? 'Desmarcar todas' : 'Marcar todas'}
        </button>
      </div>
    </div>
  )
}
