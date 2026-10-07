'use client'

import { useEffect, useState } from 'react'
import { GitBranch, HelpCircle, Loader2, Plus, X, AlertTriangle } from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Switch, cn,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BADGE } from '@/lib/color-styles'

/**
 * Perguntas condicionais ("if", 07/10/2026).
 *
 * Um passo pode ser do tipo PERGUNTA (respondido na execução); etapa,
 * sub-etapa ou passo podem ter uma condição "só vale se <pergunta> = <opções>".
 * O servidor valida tudo (pergunta do mesmo serviço, anterior na ordem,
 * opções existentes) — aqui só se oferece o que faz sentido escolher.
 */

export interface Condicao { condicaoPassoId: string | null; condicaoOpcoes: string[] }
export interface PerguntaDisponivel { id: string; texto: string; opcoes: string[]; numero: number }
export interface DadosPergunta { tipo: 'PASSO' | 'PERGUNTA'; perguntaTexto: string | null; perguntaOpcoes: string[]; perguntaMultipla: boolean }

export type AlvoCondicao =
  | { tipo: 'etapa'; id: string; nome: string; condicao: Condicao }
  | { tipo: 'sub'; id: string; nome: string; condicao: Condicao }
  | { tipo: 'passo'; id: string; nome: string; condicao: Condicao; pergunta: DadosPergunta }

/** Texto curto da condição: "se <pergunta> = A ou B". */
export function textoCondicao(c: Condicao, perguntas: Map<string, { texto: string }>): string | null {
  if (!c.condicaoPassoId) return null
  const p = perguntas.get(c.condicaoPassoId)
  return `se ${p?.texto ?? 'pergunta'} = ${c.condicaoOpcoes.join(' ou ')}`
}

/** Selo da condição — clicável quando há como editar. */
export function SeloCondicaoCadastro({ texto, onClick, className, foraDeOrdem }: {
  texto: string; onClick?: () => void; className?: string
  /** A pergunta da condição está DEPOIS deste item: nas execuções novas a condição é ignorada. */
  foraDeOrdem?: boolean
}) {
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      title={foraDeOrdem
        ? `Condição ignorada: a pergunta está DEPOIS deste item, então ainda não foi respondida quando ele chega. Arraste a pergunta para antes do item ou troque a condição. (Só vale ${texto})`
        : `Só vale ${texto}`}
      className={cn('inline-flex max-w-[260px] items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium', foraDeOrdem ? BADGE.amber : BADGE.sky, className)}
    >
      {foraDeOrdem ? <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> : <GitBranch className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">{texto}</span>
    </Comp>
  )
}

export function PerguntaCondicaoDialog({
  alvo, perguntas, onOpenChange, onSalvo,
}: {
  alvo: AlvoCondicao | null
  /** Perguntas que vêm ANTES do alvo na ordem real (as únicas que podem condicioná-lo). */
  perguntas: PerguntaDisponivel[]
  onOpenChange: (v: boolean) => void
  onSalvo: () => void
}) {
  const [tipo, setTipo] = useState<'PASSO' | 'PERGUNTA'>('PASSO')
  const [texto, setTexto] = useState('')
  const [opcoes, setOpcoes] = useState<string[]>([])
  const [novaOpcao, setNovaOpcao] = useState('')
  const [multipla, setMultipla] = useState(false)
  const [condPassoId, setCondPassoId] = useState<string | null>(null)
  const [condOpcoes, setCondOpcoes] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!alvo) return
    if (alvo.tipo === 'passo') {
      setTipo(alvo.pergunta.tipo)
      setTexto(alvo.pergunta.perguntaTexto ?? '')
      // Opções começam VAZIAS numa pergunta nova — nada de "Sim/Não" pronto.
      setOpcoes(alvo.pergunta.perguntaOpcoes)
      setMultipla(alvo.pergunta.perguntaMultipla)
    }
    setNovaOpcao('')
    setCondPassoId(alvo.condicao.condicaoPassoId)
    setCondOpcoes(alvo.condicao.condicaoOpcoes)
  }, [alvo])

  const perguntaEscolhida = perguntas.find(p => p.id === condPassoId) ?? null
  const ehPergunta = alvo?.tipo === 'passo' && tipo === 'PERGUNTA'

  function adicionarOpcao() {
    const v = novaOpcao.trim()
    if (!v) return
    if (opcoes.some(o => o.toLowerCase() === v.toLowerCase())) { setNovaOpcao(''); return }
    setOpcoes(o => [...o, v])
    setNovaOpcao('')
  }

  async function salvar() {
    if (!alvo) return
    if (ehPergunta) {
      if (!texto.trim()) { alerts.error('Pergunta incompleta', 'Escreva o texto da pergunta.'); return }
      if (opcoes.length < 2) { alerts.error('Pergunta incompleta', 'Cadastre pelo menos 2 respostas.'); return }
    }
    if (condPassoId && condOpcoes.length === 0) {
      alerts.error('Condição incompleta', 'Marque ao menos uma resposta, ou escolha "Sempre vale".')
      return
    }
    const condicao = { condicaoPassoId: condPassoId, condicaoOpcoes: condPassoId ? condOpcoes : [] }
    setSalvando(true)
    try {
      const api = trpc.servico as any
      if (alvo.tipo === 'etapa') await api.updateEtapa.mutate({ id: alvo.id, ...condicao })
      else if (alvo.tipo === 'sub') await api.updateSubEtapa.mutate({ id: alvo.id, ...condicao })
      else {
        await api.updatePasso.mutate({
          id: alvo.id,
          data: {
            tipo,
            ...(tipo === 'PERGUNTA' ? { perguntaTexto: texto.trim(), perguntaOpcoes: opcoes, perguntaMultipla: multipla } : {}),
            ...condicao,
          },
        })
      }
      onSalvo()
      onOpenChange(false)
    } catch (e) {
      alerts.error('Não foi possível salvar', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const rotuloAlvo = alvo?.tipo === 'etapa' ? 'etapa' : alvo?.tipo === 'sub' ? 'sub-etapa' : 'passo'

  return (
    <Dialog open={!!alvo} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeaderIcon icon={alvo?.tipo === 'passo' ? HelpCircle : GitBranch} color="violet">
          <DialogTitle>{alvo?.tipo === 'passo' ? 'Pergunta e condição' : `Condição da ${rotuloAlvo}`}</DialogTitle>
          <DialogDescription className="truncate">{alvo?.nome}</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-5">
          {alvo?.tipo === 'passo' && (
            <section className="space-y-3">
              <h4 className="-mx-6 border-b border-border px-6 pb-1.5 text-[13px] font-semibold text-foreground">Tipo do passo</h4>
              <div className="flex gap-2">
                {(['PASSO', 'PERGUNTA'] as const).map(t => (
                  <Button key={t} type="button" size="sm" variant={tipo === t ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setTipo(t)}>
                    {t === 'PASSO' ? 'Passo comum' : 'Pergunta'}
                  </Button>
                ))}
              </div>
              {tipo === 'PERGUNTA' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Quem executa responde a pergunta; etapas, sub-etapas e passos seguintes podem valer só para certas respostas.
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-semibold">Pergunta</Label>
                    <Input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ex.: O cliente tem funcionários?" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-semibold">Respostas possíveis <span className="font-normal text-muted-foreground">(mínimo 2)</span></Label>
                    {opcoes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {opcoes.map(o => (
                          <span key={o} className={cn('inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs', BADGE.violet)}>
                            {o}
                            <button type="button" onClick={() => setOpcoes(cur => cur.filter(x => x !== o))} aria-label={`Remover ${o}`} className="opacity-60 hover:opacity-100">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={novaOpcao}
                        onChange={e => setNovaOpcao(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarOpcao() } }}
                        placeholder="Digite uma resposta e tecle Enter"
                        className="h-9 text-sm"
                      />
                      <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={adicionarOpcao} disabled={!novaOpcao.trim()}>
                        <Plus className="h-3.5 w-3.5" /> Adicionar
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Uma resposta usada em alguma condição não pode ser removida nem renomeada até a condição ser ajustada.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={multipla} onCheckedChange={setMultipla} />
                    Permite marcar mais de uma resposta
                  </label>
                </div>
              )}
            </section>
          )}

          <section className="space-y-3">
            <h4 className="-mx-6 border-b border-border px-6 pb-1.5 text-[13px] font-semibold text-foreground">Condição</h4>
            {perguntas.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma pergunta vem antes desta {rotuloAlvo}. Crie um passo do tipo Pergunta mais acima para poder condicioná-la.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Esta {rotuloAlvo} vale</Label>
                  <select
                    value={condPassoId ?? ''}
                    onChange={e => { setCondPassoId(e.target.value || null); setCondOpcoes([]) }}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Sempre (sem condição)</option>
                    {perguntas.map(p => (
                      <option key={p.id} value={p.id}>Só se “{p.texto}” (passo {p.numero}) for…</option>
                    ))}
                  </select>
                </div>
                {perguntaEscolhida && (
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-semibold">Respostas que fazem valer <span className="font-normal text-muted-foreground">(qualquer uma)</span></Label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {perguntaEscolhida.opcoes.map(o => (
                        <label key={o} className="inline-flex items-center gap-1.5 text-sm">
                          <Checkbox
                            checked={condOpcoes.includes(o)}
                            onCheckedChange={v => setCondOpcoes(cur => (v ? [...cur, o] : cur.filter(x => x !== o)))}
                          />
                          {o}
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Com outra resposta, a {rotuloAlvo} aparece riscada como “Não se aplica” e não conta para concluir.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => { void salvar() }} disabled={salvando} className="gap-1.5">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
