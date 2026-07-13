'use client'

/**
 * FluxoAssistant — assistente guiado que monta o fluxo de um serviço por
 * perguntas simples, em vez do editor DAG bloco-a-bloco.
 *
 * Três blocos de perguntas (checklist → decisões → próximos serviços) constroem
 * um FlowPlan em memória; ao confirmar, chama `servico.aplicarFlowPlan`, que
 * materializa etapas/passos + sub-serviços FLUXO + encadeamentos de uma vez.
 * O editor DAG avançado continua disponível para ajustes finos.
 *
 * O roteamento de um bloco PERGUNTA é por `rotulo` da aresta: cada opção vira
 * uma aresta `pergunta → destino` rotulada com o texto da opção (o runtime
 * dispara só o sucessor cujo rótulo casa com a resposta escolhida).
 */

import { useState } from 'react'
import {
  Wand2, ListChecks, GitBranch, ArrowRight, Plus, Trash2, X, HelpCircle, CheckCircle2,
  Sparkles, Loader2, ChevronDown,
} from 'lucide-react'
import type { FlowPlan } from '@saas/types'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
  Input, Label, Button, Checkbox,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { WizardShell, type WizardStep } from '@/components/ui/wizard-shell'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

const STEPS: WizardStep[] = [
  { key: 'checklist', title: 'Checklist', optional: true },
  { key: 'decisoes',  title: 'Decisões',  optional: true },
  { key: 'proximos',  title: 'Próximos',  optional: true },
  { key: 'revisar',   title: 'Revisar' },
]

// ── Modelos de rascunho (estado local) ──────────────────────────────
interface PassoDraft { nome: string }
interface EtapaDraft { nome: string; passos: PassoDraft[] }

type DestinoTipo = 'novo' | 'existente' | 'fim'
interface OpcaoDraft { texto: string; destinoTipo: DestinoTipo; destinoNome: string; destinoServicoId: string }
interface PerguntaDraft { texto: string; multi: boolean; opcoes: OpcaoDraft[] }

interface ProximoDraft { servicoId: string; obrigatorio: boolean }

export interface FluxoAssistantProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  servicoId: string
  servicoNome: string
  /** Serviços existentes (id/nome) — destinos de decisão e próximos serviços. */
  servicos: Array<{ id: string; nome: string }>
  /** Chamado após aplicar com sucesso — o pai deve refazer os fetches. */
  onApplied: () => void
}

export function FluxoAssistant({ open, onOpenChange, servicoId, servicoNome, servicos, onApplied }: FluxoAssistantProps) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [etapas, setEtapas] = useState<EtapaDraft[]>([])
  const [perguntas, setPerguntas] = useState<PerguntaDraft[]>([])
  const [proximos, setProximos] = useState<ProximoDraft[]>([])

  // Geração por IA (preenche o rascunho para o humano revisar)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiDesc, setAiDesc] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const currentKey = STEPS[step]?.key ?? 'checklist'
  const isLast = step >= STEPS.length - 1

  function reset() {
    setStep(0); setSaving(false)
    setEtapas([]); setPerguntas([]); setProximos([])
    setAiOpen(false); setAiDesc(''); setAiLoading(false)
  }

  async function gerarComIA() {
    if (aiDesc.trim().length < 10) {
      alerts.warning('Descreva melhor', 'Conte em uma ou duas frases o que o serviço faz.')
      return
    }
    setAiLoading(true)
    try {
      const r = await (trpc.servico as any).gerarFluxoIA.mutate({ descricao: aiDesc.trim(), nomeServico: servicoNome })
      setEtapas((r.etapas ?? []).map((e: { nome: string; passos: string[] }) => ({
        nome: e.nome, passos: (e.passos ?? []).map(n => ({ nome: n })),
      })))
      setPerguntas((r.perguntas ?? []).map((q: { texto: string; multi: boolean; opcoes: Array<{ texto: string; destino: string; destinoNome?: string }> }) => ({
        texto: q.texto,
        multi: !!q.multi,
        opcoes: (q.opcoes ?? []).map(o => ({
          texto: o.texto,
          destinoTipo: (o.destino === 'fim' ? 'fim' : 'novo') as DestinoTipo,
          destinoNome: o.destinoNome ?? '',
          destinoServicoId: '',
        })),
      })))
      setStep(0)
      setAiOpen(false)
      await alerts.success('Rascunho pronto', 'Revise as etapas e decisões e ajuste o que precisar.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setAiLoading(false)
    }
  }
  function handleOpenChange(o: boolean) {
    if (!o && !saving) reset()
    onOpenChange(o)
  }

  // ── Checklist ──
  const addEtapa = () => setEtapas(p => [...p, { nome: '', passos: [] }])
  const rmEtapa = (i: number) => setEtapas(p => p.filter((_, x) => x !== i))
  const setEtapaNome = (i: number, nome: string) => setEtapas(p => p.map((e, x) => x === i ? { ...e, nome } : e))
  const addPasso = (i: number) => setEtapas(p => p.map((e, x) => x === i ? { ...e, passos: [...e.passos, { nome: '' }] } : e))
  const rmPasso = (i: number, j: number) => setEtapas(p => p.map((e, x) => x === i ? { ...e, passos: e.passos.filter((_, y) => y !== j) } : e))
  const setPassoNome = (i: number, j: number, nome: string) => setEtapas(p => p.map((e, x) => x === i ? { ...e, passos: e.passos.map((s, y) => y === j ? { nome } : s) } : e))

  // ── Decisões (perguntas) ──
  const addPergunta = () => setPerguntas(p => [...p, { texto: '', multi: false, opcoes: [{ texto: '', destinoTipo: 'novo', destinoNome: '', destinoServicoId: '' }, { texto: '', destinoTipo: 'novo', destinoNome: '', destinoServicoId: '' }] }])
  const rmPergunta = (i: number) => setPerguntas(p => p.filter((_, x) => x !== i))
  const patchPergunta = (i: number, patch: Partial<PerguntaDraft>) => setPerguntas(p => p.map((q, x) => x === i ? { ...q, ...patch } : q))
  const addOpcao = (i: number) => setPerguntas(p => p.map((q, x) => x === i ? { ...q, opcoes: [...q.opcoes, { texto: '', destinoTipo: 'novo', destinoNome: '', destinoServicoId: '' }] } : q))
  const rmOpcao = (i: number, j: number) => setPerguntas(p => p.map((q, x) => x === i ? { ...q, opcoes: q.opcoes.filter((_, y) => y !== j) } : q))
  const patchOpcao = (i: number, j: number, patch: Partial<OpcaoDraft>) => setPerguntas(p => p.map((q, x) => x === i ? { ...q, opcoes: q.opcoes.map((o, y) => y === j ? { ...o, ...patch } : o) } : q))

  // ── Próximos serviços ──
  const addProximo = () => setProximos(p => [...p, { servicoId: '', obrigatorio: true }])
  const rmProximo = (i: number) => setProximos(p => p.filter((_, x) => x !== i))
  const patchProximo = (i: number, patch: Partial<ProximoDraft>) => setProximos(p => p.map((x, y) => y === i ? { ...x, ...patch } : x))

  // ── Monta o FlowPlan a partir dos rascunhos ──
  function buildPlan(): FlowPlan {
    const plan: FlowPlan = { etapas: [], blocos: [], arestas: [] }
    let tid = 0
    const nt = () => `t${tid++}`

    etapas.forEach((et, i) => {
      if (!et.nome.trim()) return
      plan.etapas!.push({
        tempId: nt(),
        nome: et.nome.trim(),
        ordem: i,
        passos: et.passos.filter(p => p.nome.trim()).map((p, j) => ({ nome: p.nome.trim(), ordem: j })),
      })
    })

    perguntas.forEach(pg => {
      const opcoes = pg.opcoes.filter(o => o.texto.trim())
      if (!pg.texto.trim() || opcoes.length === 0) return
      const pTemp = nt()
      plan.blocos!.push({
        tempId: pTemp,
        tipo: 'PERGUNTA',
        nome: pg.texto.trim().slice(0, 120),
        perguntaTexto: pg.texto.trim(),
        perguntaOpcoes: opcoes.map(o => o.texto.trim()),
        perguntaMulti: pg.multi,
      })
      plan.arestas!.push({ origem: 'ROOT', destino: pTemp, iniciaAuto: true })
      opcoes.forEach(o => {
        const rot = o.texto.trim()
        if (o.destinoTipo === 'novo' && o.destinoNome.trim()) {
          const dTemp = nt()
          plan.blocos!.push({ tempId: dTemp, tipo: 'ATIVIDADE', nome: o.destinoNome.trim() })
          plan.arestas!.push({ origem: pTemp, destino: dTemp, rotulo: rot })
        } else if (o.destinoTipo === 'existente' && o.destinoServicoId) {
          plan.arestas!.push({ origem: pTemp, destino: o.destinoServicoId, rotulo: rot })
        }
        // 'fim' → nenhuma aresta (o caminho termina aqui)
      })
    })

    proximos.forEach(px => {
      if (!px.servicoId) return
      plan.arestas!.push({ origem: 'ROOT', destino: px.servicoId, iniciaAuto: true, obrigatorio: px.obrigatorio })
    })

    return plan
  }

  const plan = buildPlan()
  const totalEtapas = plan.etapas?.length ?? 0
  const totalBlocos = plan.blocos?.length ?? 0
  const totalArestas = plan.arestas?.length ?? 0
  const nada = totalEtapas === 0 && totalBlocos === 0 && totalArestas === 0

  async function aplicar() {
    if (nada) { alerts.warning('Nada a aplicar', 'Adicione ao menos uma etapa, decisão ou próximo serviço.'); return }
    setSaving(true)
    try {
      await (trpc.servico as any).aplicarFlowPlan.mutate({ servicoId, plan })
      await alerts.success('Fluxo montado', 'As etapas e o fluxo foram criados no serviço.')
      handleOpenChange(false)
      onApplied()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function onNext() {
    if (isLast) { void aplicar(); return }
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }
  function onBack() { setStep(s => Math.max(0, s - 1)) }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[88vh] p-0 overflow-hidden flex flex-col">
        <DialogHeaderIcon icon={Wand2} color="emerald" className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle>Montar fluxo com assistente</DialogTitle>
          <DialogDescription className="truncate">Serviço: {servicoNome}</DialogDescription>
        </DialogHeaderIcon>

        <div className="px-6 py-5 overflow-y-auto">
          {/* Gerar com IA — preenche o rascunho; o humano revisa antes de aplicar */}
          <div className="mb-4 rounded-md border border-violet-300/50 bg-violet-50/40 dark:bg-violet-950/20">
            <button
              type="button"
              onClick={() => setAiOpen(o => !o)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span className="text-[13px] font-semibold">Gerar com IA</span>
              <span className="text-[11px] text-muted-foreground">descreva o serviço e a IA monta um rascunho</span>
              <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
            </button>
            {aiOpen && (
              <div className="space-y-2 px-3 pb-3">
                <textarea
                  value={aiDesc}
                  onChange={e => setAiDesc(e.target.value)}
                  placeholder="Ex: Abertura de empresa: consultar viabilidade, definir regime tributário (Simples, Presumido ou Real), registrar na Junta, emitir alvará e inscrições…"
                  rows={3}
                  className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">A IA sugere; você revisa e ajusta antes de criar.</p>
                  <Button variant="outline" size="sm" onClick={gerarComIA} disabled={aiLoading} className="gap-1.5">
                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Gerar rascunho
                  </Button>
                </div>
              </div>
            )}
          </div>

          <WizardShell
            steps={STEPS}
            current={step}
            color={MODULE_COLOR}
            onNavigate={setStep}
            onBack={onBack}
            onNext={onNext}
            nextLabel={isLast ? 'Criar fluxo' : undefined}
            nextDisabled={isLast && nada}
            loading={saving}
          >
            {/* ── Checklist ── */}
            {currentKey === 'checklist' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-[13px] font-semibold">Este serviço tem um checklist de etapas?</Label>
                </div>
                <p className="text-xs text-muted-foreground">Cada etapa agrupa passos que o operador marca durante a execução. Opcional.</p>
                <div className="space-y-3">
                  {etapas.map((et, i) => (
                    <div key={i} className="rounded-md border border-border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input value={et.nome} onChange={e => setEtapaNome(i, e.target.value)} placeholder={`Etapa ${i + 1} (ex: Documentação)`} className="h-9 text-sm font-medium" />
                        <Button variant="ghost" size="icon-sm" onClick={() => rmEtapa(i)} title="Remover etapa"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                      <div className="space-y-1.5 pl-3 border-l-2 border-border/60">
                        {et.passos.map((p, j) => (
                          <div key={j} className="flex items-center gap-2">
                            <Input value={p.nome} onChange={e => setPassoNome(i, j, e.target.value)} placeholder={`Passo ${j + 1}`} className="h-8 text-sm" />
                            <Button variant="ghost" size="icon-sm" onClick={() => rmPasso(i, j)} title="Remover passo"><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => addPasso(i)} className="h-7 gap-1 text-xs text-muted-foreground"><Plus className="h-3.5 w-3.5" />Passo</Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addEtapa} className="gap-1.5"><Plus className="h-4 w-4" />Adicionar etapa</Button>
                </div>
              </div>
            )}

            {/* ── Decisões (perguntas) ── */}
            {currentKey === 'decisoes' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-[13px] font-semibold">Precisa perguntar algo ao operador para decidir o caminho?</Label>
                </div>
                <p className="text-xs text-muted-foreground">Cada opção pode seguir para um novo serviço, um serviço existente, ou encerrar. Opcional.</p>
                <div className="space-y-3">
                  {perguntas.map((pg, i) => (
                    <div key={i} className="rounded-md border border-border p-3 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <Input value={pg.texto} onChange={e => patchPergunta(i, { texto: e.target.value })} placeholder="Pergunta (ex: Qual o regime tributário?)" className="h-9 text-sm font-medium" />
                        <Button variant="ghost" size="icon-sm" onClick={() => rmPergunta(i)} title="Remover pergunta"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox checked={pg.multi} onCheckedChange={v => patchPergunta(i, { multi: !!v })} />
                        Permite marcar várias opções (dispara vários caminhos)
                      </label>
                      <div className="space-y-2 pl-3 border-l-2 border-amber-300/60">
                        {pg.opcoes.map((o, j) => (
                          <div key={j} className="space-y-1.5 rounded-md bg-muted/30 p-2">
                            <div className="flex items-center gap-2">
                              <Input value={o.texto} onChange={e => patchOpcao(i, j, { texto: e.target.value })} placeholder={`Opção ${j + 1} (ex: Simples Nacional)`} className="h-8 text-sm" />
                              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <Select value={o.destinoTipo} onValueChange={v => patchOpcao(i, j, { destinoTipo: v as DestinoTipo })}>
                                <SelectTrigger className="h-8 w-[130px] text-xs shrink-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="novo">Novo serviço</SelectItem>
                                  <SelectItem value="existente">Serviço existente</SelectItem>
                                  <SelectItem value="fim">Encerrar</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button variant="ghost" size="icon-sm" onClick={() => rmOpcao(i, j)} title="Remover opção"><X className="h-3.5 w-3.5" /></Button>
                            </div>
                            {o.destinoTipo === 'novo' && (
                              <Input value={o.destinoNome} onChange={e => patchOpcao(i, j, { destinoNome: e.target.value })} placeholder="Nome do novo serviço deste caminho" className="h-8 text-sm" />
                            )}
                            {o.destinoTipo === 'existente' && (
                              <Select value={o.destinoServicoId || '__none__'} onValueChange={v => patchOpcao(i, j, { destinoServicoId: v === '__none__' ? '' : v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione o serviço" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— Selecione —</SelectItem>
                                  {servicos.filter(s => s.id !== servicoId).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => addOpcao(i)} className="h-7 gap-1 text-xs text-muted-foreground"><Plus className="h-3.5 w-3.5" />Opção</Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addPergunta} className="gap-1.5"><Plus className="h-4 w-4" />Adicionar pergunta</Button>
                </div>
              </div>
            )}

            {/* ── Próximos serviços ── */}
            {currentKey === 'proximos' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-[13px] font-semibold">Ao concluir, dispara outros serviços automaticamente?</Label>
                </div>
                <p className="text-xs text-muted-foreground">Encadeia serviços já existentes na sequência deste. Opcional.</p>
                <div className="space-y-2">
                  {proximos.map((px, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2">
                      <Select value={px.servicoId || '__none__'} onValueChange={v => patchProximo(i, { servicoId: v === '__none__' ? '' : v })}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o serviço" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Selecione —</SelectItem>
                          {servicos.filter(s => s.id !== servicoId).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <Checkbox checked={px.obrigatorio} onCheckedChange={v => patchProximo(i, { obrigatorio: !!v })} />
                        Obrigatório
                      </label>
                      <Button variant="ghost" size="icon-sm" onClick={() => rmProximo(i)} title="Remover"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addProximo} className="gap-1.5"><Plus className="h-4 w-4" />Adicionar próximo serviço</Button>
                </div>
              </div>
            )}

            {/* ── Revisar ── */}
            {currentKey === 'revisar' && (
              <div className="space-y-3">
                <Label className="text-[13px] font-semibold">Resumo do que será criado</Label>
                {nada ? (
                  <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    Nada configurado ainda. Volte e adicione etapas, decisões ou próximos serviços.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span><strong>{totalEtapas}</strong> etapa(s) de checklist</span></div>
                    <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span><strong>{totalBlocos}</strong> bloco(s) de fluxo (perguntas + destinos novos)</span></div>
                    <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span><strong>{totalArestas}</strong> ligação(ões) entre blocos/serviços</span></div>
                    <p className="pt-2 text-xs text-muted-foreground">
                      Isto é adicionado ao serviço atual. Depois você pode refinar tudo no editor de Fluxo e nas Etapas.
                    </p>
                  </div>
                )}
              </div>
            )}
          </WizardShell>
        </div>
      </DialogContent>
    </Dialog>
  )
}
