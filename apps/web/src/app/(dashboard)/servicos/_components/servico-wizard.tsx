'use client'

/**
 * ServicoWizard — assistente tela-a-tela (opcional) para o cadastro BASE de um
 * serviço. Convive com o modal "Novo Serviço" tradicional; é aberto pelo botão
 * "Assistente" no header de /servicos.
 *
 * Um foco por tela (nome → tipo → área → comercial → descrição → revisar) usando
 * o WizardShell. Ao concluir, cria via `createServico` e navega para o detalhe
 * com `?assistente=fluxo`, onde o assistente de fluxo (Fase 2) pode continuar.
 * A atribuição fina de responsáveis permanece no detalhe do serviço.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, Repeat, Zap, Lock, ShieldCheck, CircleDollarSign, Copy, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
  Input, Label, RichEditor, Button, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { WizardShell, type WizardStep } from '@/components/ui/wizard-shell'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

type PrioridadeVal = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
type TipoKey = 'MENSAL' | 'EXTRA' | 'INTERNO' | 'ACESSORIA'

/** Mapeia a escolha de "tipo de cadastro" para as flags reais do Servico —
 *  espelha exatamente a lógica das pills do modal tradicional. */
const TIPO_MAP: Record<TipoKey, {
  categoriaServico: 'MENSAL' | 'EXTRA'
  ehServicoInterno: boolean
  ehObrigacaoAcessoria: boolean
  disponivelOrcamento: boolean
}> = {
  MENSAL:    { categoriaServico: 'MENSAL', ehServicoInterno: false, ehObrigacaoAcessoria: false, disponivelOrcamento: true },
  EXTRA:     { categoriaServico: 'EXTRA',  ehServicoInterno: false, ehObrigacaoAcessoria: false, disponivelOrcamento: true },
  INTERNO:   { categoriaServico: 'EXTRA',  ehServicoInterno: true,  ehObrigacaoAcessoria: false, disponivelOrcamento: false },
  ACESSORIA: { categoriaServico: 'MENSAL', ehServicoInterno: false, ehObrigacaoAcessoria: true,  disponivelOrcamento: false },
}

const TIPO_OPCOES: Array<{ key: TipoKey; label: string; desc: string; Icon: typeof Repeat; tone: string }> = [
  { key: 'MENSAL',    label: 'Serviço Recorrente',     desc: 'Executado com uma recorrência (mensal, anual…). Entra em contratos.', Icon: Repeat,      tone: 'sky' },
  { key: 'EXTRA',     label: 'Serviço Extraordinário', desc: 'Pontual, sob demanda — cobrança por execução.',                        Icon: Zap,         tone: 'amber' },
  { key: 'INTERNO',   label: 'Serviço Interno',        desc: 'Execução exclusivamente interna. Não entra no catálogo de orçamento.', Icon: Lock,        tone: 'slate' },
  { key: 'ACESSORIA', label: 'Obrigação Acessória',    desc: 'Entrega recorrente obrigatória (declarações, guias…).',                Icon: ShieldCheck, tone: 'rose' },
]

const TONE_CLASSES: Record<string, { border: string; bg: string; hover: string; icon: string }> = {
  sky:   { border: 'border-sky-500',   bg: 'bg-sky-50/60 dark:bg-sky-950/30',     hover: 'hover:border-sky-300',   icon: 'text-sky-600 dark:text-sky-300' },
  amber: { border: 'border-amber-500', bg: 'bg-amber-50/60 dark:bg-amber-950/30', hover: 'hover:border-amber-300', icon: 'text-amber-600 dark:text-amber-300' },
  slate: { border: 'border-slate-500', bg: 'bg-slate-50/60 dark:bg-slate-900/30', hover: 'hover:border-slate-300', icon: 'text-slate-600 dark:text-slate-300' },
  rose:  { border: 'border-rose-500',  bg: 'bg-rose-50/60 dark:bg-rose-950/30',   hover: 'hover:border-rose-300',  icon: 'text-rose-600 dark:text-rose-300' },
}

const PRIORIDADES: Array<{ v: PrioridadeVal; label: string; dot: string }> = [
  { v: 'BAIXA',   label: 'Baixa',   dot: 'bg-slate-400' },
  { v: 'MEDIA',   label: 'Média',   dot: 'bg-emerald-500' },
  { v: 'ALTA',    label: 'Alta',    dot: 'bg-amber-500' },
  { v: 'URGENTE', label: 'Urgente', dot: 'bg-red-500' },
]

const STEPS: WizardStep[] = [
  { key: 'nome',      title: 'Nome' },
  { key: 'tipo',      title: 'Tipo' },
  { key: 'area',      title: 'Área' },
  { key: 'comercial', title: 'Comercial', optional: true },
  { key: 'descricao', title: 'Descrição', optional: true },
  { key: 'revisar',   title: 'Revisar' },
]

function formatBRLFromCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function parseCentsFromInput(s: string): number {
  const digits = s.replace(/\D/g, '')
  return digits ? parseInt(digits, 10) : 0
}

export interface ServicoWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  areas: Array<{ id: string; name: string }>
}

export function ServicoWizard({ open, onOpenChange, areas }: ServicoWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [nome, setNome] = useState('')
  const [tipoKey, setTipoKey] = useState<TipoKey>('EXTRA')
  const [categoria, setCategoria] = useState('') // nome da área
  const [prioridade, setPrioridade] = useState<PrioridadeVal>('MEDIA')
  const [valorCents, setValorCents] = useState(0)
  const [descricao, setDescricao] = useState('')
  const [textoPadrao, setTextoPadrao] = useState('')

  // Modelos (clonar um serviço existente como ponto de partida)
  const [modelos, setModelos] = useState<Array<{ id: string; nome: string }>>([])
  const [modeloId, setModeloId] = useState('')
  const [cloning, setCloning] = useState(false)

  const tipoCfg = TIPO_MAP[tipoKey]
  const isComercial = tipoCfg.disponivelOrcamento

  // Carrega serviços top-level como modelos quando o assistente abre.
  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const r = await (trpc.servico as any).listServicos.query()
        setModelos((r as Array<{ id: string; nome: string }>).map(s => ({ id: s.id, nome: s.nome })))
      } catch { setModelos([]) }
    })()
  }, [open])

  function reset() {
    setStep(0); setSaving(false)
    setNome(''); setTipoKey('EXTRA'); setCategoria(''); setPrioridade('MEDIA')
    setValorCents(0); setDescricao(''); setTextoPadrao('')
    setModeloId(''); setCloning(false)
  }

  async function usarModelo() {
    if (!modeloId) return
    setCloning(true)
    try {
      const novo = await (trpc.servico as any).duplicarServico.mutate({ id: modeloId, novoNome: nome.trim() || undefined })
      await alerts.success('Modelo aplicado', 'Serviço criado a partir do modelo — ajuste o que precisar.')
      handleOpenChange(false)
      router.push(`/servicos/${novo.id}`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setCloning(false)
    }
  }

  function handleOpenChange(o: boolean) {
    if (!o && !saving) reset()
    onOpenChange(o)
  }

  // Passo "Comercial" é pulado quando o serviço não entra no catálogo.
  const visibleSteps = STEPS.filter(s => s.key !== 'comercial' || isComercial)
  const currentKey = visibleSteps[step]?.key ?? 'nome'
  const isLast = step >= visibleSteps.length - 1

  const nextDisabled = currentKey === 'nome' && !nome.trim()

  async function criar() {
    if (!nome.trim()) { alerts.error('Erro', 'Informe o nome do serviço'); return }
    setSaving(true)
    try {
      const created = await (trpc.servico as any).createServico.mutate({
        nome: nome.trim(),
        categoria: categoria || undefined,
        prioridadePadrao: prioridade,
        valorPadrao: isComercial && valorCents ? valorCents / 100 : undefined,
        descricao: descricao || undefined,
        textoPadrao: textoPadrao || undefined,
        categoriaServico: tipoCfg.categoriaServico,
        recorrenteMensal: tipoCfg.categoriaServico === 'MENSAL',
        ehServicoInterno: tipoCfg.ehServicoInterno,
        ehObrigacaoAcessoria: tipoCfg.ehObrigacaoAcessoria,
        disponivelOrcamento: tipoCfg.disponivelOrcamento,
      })
      await alerts.success('Criado', 'Serviço criado. Vamos montar o fluxo?')
      handleOpenChange(false)
      router.push(`/servicos/${created.id}?assistente=fluxo`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function onNext() {
    if (isLast) { void criar(); return }
    setStep(s => Math.min(s + 1, visibleSteps.length - 1))
  }
  function onBack() { setStep(s => Math.max(0, s - 1)) }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[680px] p-0 overflow-hidden">
        <DialogHeaderIcon icon={Wand2} color="emerald" className="px-6 pt-5 pb-3 border-b border-border/40">
          <DialogTitle>Assistente de novo serviço</DialogTitle>
          <DialogDescription>Vamos criar o serviço passo a passo.</DialogDescription>
        </DialogHeaderIcon>

        <div className="px-6 py-5">
          <WizardShell
            steps={visibleSteps}
            current={step}
            color={MODULE_COLOR}
            onNavigate={setStep}
            onBack={onBack}
            onNext={onNext}
            nextLabel={isLast ? 'Criar serviço' : undefined}
            nextDisabled={nextDisabled}
            loading={saving}
          >
            {/* ── Passo: Nome ── */}
            {currentKey === 'nome' && (
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold">Qual o nome do serviço?</Label>
                <Input
                  autoFocus
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && nome.trim()) onNext() }}
                  placeholder="Ex: Abertura de empresa"
                  className="h-10 text-sm"
                />
                <p className="text-xs text-muted-foreground">É como o serviço aparece no catálogo e nas execuções.</p>

                {/* Atalho: começar a partir de um modelo (clona um serviço pronto) */}
                {modelos.length > 0 && (
                  <div className="mt-4 rounded-md border border-dashed border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-[12px] font-semibold">Ou comece a partir de um modelo</Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Clona um serviço pronto (etapas + fluxo) para você ajustar.</p>
                    <div className="flex items-center gap-2">
                      <Select value={modeloId || '__none__'} onValueChange={v => setModeloId(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Selecione —</SelectItem>
                          {modelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={usarModelo} disabled={!modeloId || cloning} className="shrink-0 gap-1.5">
                        {cloning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                        Usar modelo
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Passo: Tipo de cadastro ── */}
            {currentKey === 'tipo' && (
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold">Que tipo de serviço é este?</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TIPO_OPCOES.map(opt => {
                    const active = tipoKey === opt.key
                    const pal = TONE_CLASSES[opt.tone]!
                    const Icon = opt.Icon
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setTipoKey(opt.key)}
                        className={cn(
                          'flex items-center gap-3 rounded-md border-2 p-3 text-left transition-colors',
                          active ? `${pal.border} ${pal.bg}` : `border-border/50 ${pal.hover}`,
                        )}
                      >
                        <Icon className={cn('h-7 w-7 shrink-0', active ? pal.icon : 'text-muted-foreground')} strokeWidth={1.75} />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[12px] font-semibold">{opt.label}</span>
                          <span className="text-[10px] leading-tight text-muted-foreground">{opt.desc}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Passo: Área responsável ── */}
            {currentKey === 'area' && (
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold">Qual a área responsável?</Label>
                <Select value={categoria || '__none__'} onValueChange={v => setCategoria(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Selecione uma área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem área —</SelectItem>
                    {areas.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define quem, por padrão, executa este serviço. A atribuição detalhada (colaboradores específicos) fica no detalhe do serviço.
                </p>
              </div>
            )}

            {/* ── Passo: Comercial (prioridade + valor) ── */}
            {currentKey === 'comercial' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold">Prioridade padrão</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {PRIORIDADES.map(p => (
                      <button
                        key={p.v}
                        type="button"
                        onClick={() => setPrioridade(p.v)}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-md border-2 px-2 py-2 text-[12px] font-medium transition-colors',
                          prioridade === p.v ? 'border-foreground/60 bg-muted/60' : 'border-border/50 hover:bg-muted/40',
                        )}
                      >
                        <span className={cn('h-2 w-2 rounded-full', p.dot)} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold">Valor padrão (opcional)</Label>
                  <div className="relative">
                    <CircleDollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={valorCents ? formatBRLFromCents(valorCents) : ''}
                      onChange={e => setValorCents(parseCentsFromInput(e.target.value))}
                      placeholder="0,00"
                      inputMode="numeric"
                      className="h-10 pl-9 text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Sugerido no catálogo do orçamento. Pode deixar em branco.</p>
                </div>
              </div>
            )}

            {/* ── Passo: Descrição / texto padrão ── */}
            {currentKey === 'descricao' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Descrição curta (opcional)</Label>
                  <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Resumo do que este serviço entrega" className="h-10 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Texto padrão (opcional)</Label>
                  <RichEditor
                    value={textoPadrao}
                    onChange={html => setTextoPadrao(html)}
                    placeholder="Modelo de e-mail / nota / documentação usado nas execuções…"
                    className="min-h-[160px]"
                  />
                </div>
              </div>
            )}

            {/* ── Passo: Revisar ── */}
            {currentKey === 'revisar' && (
              <div className="space-y-3">
                <Label className="text-[13px] font-semibold">Confira antes de criar</Label>
                <dl className="divide-y divide-border/60 rounded-md border border-border">
                  {[
                    ['Nome', nome || '—'],
                    ['Tipo', TIPO_OPCOES.find(o => o.key === tipoKey)?.label ?? '—'],
                    ['Área', categoria || 'Sem área'],
                    ['Prioridade', PRIORIDADES.find(p => p.v === prioridade)?.label ?? '—'],
                    ...(isComercial ? [['Valor padrão', valorCents ? `R$ ${formatBRLFromCents(valorCents)}` : '—'] as [string, string]] : []),
                    ['Descrição', descricao || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 px-3 py-2">
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="text-right text-[13px] font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground">
                  Ao criar, abrimos o serviço com o <strong>assistente de fluxo</strong> para montar etapas, perguntas e próximos serviços.
                </p>
              </div>
            )}
          </WizardShell>
        </div>
      </DialogContent>
    </Dialog>
  )
}
