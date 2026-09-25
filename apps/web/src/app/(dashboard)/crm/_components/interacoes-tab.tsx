'use client'

import { useState } from 'react'
import {
  Edit2, Loader2, Mail, MapPin, MessageCircle, MoreHorizontal, MoreVertical, Phone, Send, Trash2, Users,
  type LucideIcon,
} from 'lucide-react'
import {
  Button, Input, RichContent, RichEditor,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  cn,
} from '@saas/ui'
import { BADGE, PILL, SURFACE, TEXT, type ColorName } from '@/lib/color-styles'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/**
 * Aba "Interações" do card do CRM — cada CONTATO feito com o lead.
 *
 * Diferente das Anotações (qualquer observação sobre o card), a interação
 * responde: quando falamos com eles, por qual canal, com quem, e o que saiu
 * disso. O resumo no topo ("5 contatos · último há 3 dias") é o que o
 * vendedor quer saber antes de ligar de novo.
 */

export type TipoInteracao = 'LIGACAO' | 'WHATSAPP' | 'EMAIL' | 'REUNIAO' | 'VISITA' | 'OUTRO'
export type ResultadoInteracao = 'EM_ANDAMENTO' | 'QUALIFICADO' | 'SEM_RESPOSTA' | 'DESQUALIFICADO'

/**
 * O que o contato decidiu sobre o lead. Alimenta a Qualificação do /comercial:
 * Ligação + Qualificado conta em "Qualif. por ligação", e assim por diante —
 * valendo o último resultado do lead no período.
 */
const RESULTADOS: Array<{ valor: ResultadoInteracao; rotulo: string; cor: ColorName }> = [
  { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento', cor: 'slate' },
  { valor: 'QUALIFICADO', rotulo: 'Qualificado', cor: 'emerald' },
  { valor: 'SEM_RESPOSTA', rotulo: 'Sem resposta', cor: 'amber' },
  { valor: 'DESQUALIFICADO', rotulo: 'Desqualificado', cor: 'rose' },
]
const resultadoInfo = (r: string | null | undefined) => RESULTADOS.find(x => x.valor === r) ?? RESULTADOS[0]!

export interface InteracaoCrm {
  id: string
  tipo: TipoInteracao
  dataHora: string
  contato: string | null
  resumo: string
  resultado?: ResultadoInteracao | null
  createdAt: string
  user?: { id: string; name: string } | null
}

interface InfoTipo { tipo: TipoInteracao; rotulo: string; icone: LucideIcon; cor: ColorName }
const OUTRO: InfoTipo = { tipo: 'OUTRO', rotulo: 'Outro', icone: MoreHorizontal, cor: 'slate' }
const TIPOS: InfoTipo[] = [
  { tipo: 'LIGACAO', rotulo: 'Ligação', icone: Phone, cor: 'sky' },
  { tipo: 'WHATSAPP', rotulo: 'WhatsApp', icone: MessageCircle, cor: 'emerald' },
  { tipo: 'EMAIL', rotulo: 'E-mail', icone: Mail, cor: 'violet' },
  { tipo: 'REUNIAO', rotulo: 'Reunião', icone: Users, cor: 'amber' },
  { tipo: 'VISITA', rotulo: 'Visita', icone: MapPin, cor: 'rose' },
  OUTRO,
]
const tipoInfo = (t: string) => TIPOS.find(x => x.tipo === t) ?? OUTRO

/** Valor de `<input type="datetime-local">` no fuso de quem está vendo. */
function paraInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function textoPuro(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function haQuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

interface ValoresInteracao { tipo: TipoInteracao; resultado: ResultadoInteracao; dataHora: string; contato: string; resumo: string }

function FormInteracao({ inicial, editando, salvando, moduleColor, onSalvar, onCancelar }: {
  inicial: ValoresInteracao
  editando: boolean
  salvando: boolean
  moduleColor: string
  onSalvar: (v: ValoresInteracao) => Promise<boolean>
  onCancelar?: () => void
}) {
  const [v, setV] = useState<ValoresInteracao>(inicial)
  const set = <K extends keyof ValoresInteracao>(k: K, valor: ValoresInteracao[K]) => setV(atual => ({ ...atual, [k]: valor }))
  const vazio = !textoPuro(v.resumo) || !v.dataHora

  const salvar = async () => {
    if (vazio || salvando) return
    const ok = await onSalvar(v)
    // Depois de registrar, o próximo contato provavelmente é com a mesma
    // pessoa e pelo mesmo canal: mantém os dois e renova a data.
    if (ok && !editando) setV(atual => ({ ...atual, resumo: '', resultado: 'EM_ANDAMENTO', dataHora: paraInputLocal(new Date()) }))
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map(t => (
          <button
            key={t.tipo}
            type="button"
            onClick={() => set('tipo', t.tipo)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              v.tipo === t.tipo ? cn(PILL[t.cor], 'border-transparent') : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <t.icone className="h-3.5 w-3.5" />{t.rotulo}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-[13px] font-semibold">Resultado</label>
        <div className="flex flex-wrap gap-1.5">
          {RESULTADOS.map(r => (
            <button
              key={r.valor}
              type="button"
              onClick={() => set('resultado', r.valor)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                v.resultado === r.valor ? cn(PILL[r.cor], 'border-transparent') : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
              )}
            >
              {r.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="space-y-1.5 sm:col-span-5">
          <label className="text-[13px] font-semibold">Quando</label>
          <Input type="datetime-local" className="h-9 text-sm" value={v.dataHora} onChange={e => set('dataHora', e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-7">
          <label className="text-[13px] font-semibold">Com quem</label>
          <Input className="h-9 text-sm" placeholder="Nome de quem atendeu" value={v.contato} onChange={e => set('contato', e.target.value)} />
        </div>
      </div>

      <RichEditor
        placeholder="O que foi conversado e o que ficou combinado…"
        value={v.resumo}
        onChange={x => set('resumo', x)}
        toolbar="basico"
        minHeight={80}
        maxHeight={200}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); return true }
          return false
        }}
      />

      <div className="flex justify-end gap-2">
        {onCancelar && <Button size="sm" variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>}
        <Button size="sm" style={{ backgroundColor: moduleColor }} className="text-white" onClick={salvar} disabled={salvando || vazio}>
          {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          {editando ? 'Salvar interação' : 'Registrar interação'}
        </Button>
      </div>
    </div>
  )
}

export function InteracoesTab({ oportunidadeId, interacoes, contatoPadrao, moduleColor, onChanged }: {
  oportunidadeId: string
  interacoes: InteracaoCrm[]
  /** Contato do card — sugestão para o "Com quem". */
  contatoPadrao?: string | null
  moduleColor: string
  /** Recarrega o card (a lista vem no getById). */
  onChanged: () => Promise<void> | void
}) {
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  const payload = (v: ValoresInteracao) => ({
    tipo: v.tipo,
    resultado: v.resultado,
    dataHora: new Date(v.dataHora).toISOString(),
    contato: v.contato.trim() || null,
    resumo: v.resumo,
  })

  const salvar = async (v: ValoresInteracao, id?: string) => {
    setSalvando(true)
    try {
      if (id) await (trpc.crm as any).interacoes.update.mutate({ id, ...payload(v) })
      else await (trpc.crm as any).interacoes.create.mutate({ oportunidadeId, ...payload(v) })
      setEditandoId(null)
      await onChanged()
      return true
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      return false
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (i: InteracaoCrm) => {
    const ok = await alerts.confirm({ title: 'Excluir interação?', text: `${tipoInfo(i.tipo).rotulo} de ${new Date(i.dataHora).toLocaleString('pt-BR')} será removida.`, confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.crm as any).interacoes.delete.mutate({ id: i.id })
      await onChanged()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const ultima = interacoes[0]

  return (
    <div className="space-y-3">
      <FormInteracao
        inicial={{ tipo: 'LIGACAO', resultado: 'EM_ANDAMENTO', dataHora: paraInputLocal(new Date()), contato: contatoPadrao ?? '', resumo: '' }}
        editando={false}
        salvando={salvando && !editandoId}
        moduleColor={moduleColor}
        onSalvar={v => salvar(v)}
      />

      {ultima && (
        <p className="text-[11px] text-muted-foreground">
          {interacoes.length === 1 ? '1 contato registrado' : `${interacoes.length} contatos registrados`}
          {' · '}último {haQuanto(ultima.dataHora)} ({tipoInfo(ultima.tipo).rotulo.toLowerCase()})
        </p>
      )}

      {interacoes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma interação registrada</p>
      ) : (
        <div className="space-y-3">
          {interacoes.map(i => {
            if (editandoId === i.id) {
              return (
                <FormInteracao
                  key={i.id}
                  inicial={{ tipo: i.tipo, resultado: i.resultado ?? 'EM_ANDAMENTO', dataHora: paraInputLocal(new Date(i.dataHora)), contato: i.contato ?? '', resumo: i.resumo }}
                  editando
                  salvando={salvando}
                  moduleColor={moduleColor}
                  onSalvar={v => salvar(v, i.id)}
                  onCancelar={() => setEditandoId(null)}
                />
              )
            }
            const t = tipoInfo(i.tipo)
            const r = resultadoInfo(i.resultado)
            return (
              <div key={i.id} className="rounded-md bg-muted/40 p-3">
                <div className="flex items-start gap-2.5">
                  <span className={cn('h-7 w-7 shrink-0 rounded-full flex items-center justify-center', SURFACE[t.cor])}>
                    <t.icone className={cn('h-3.5 w-3.5', TEXT[t.cor])} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">
                        {t.rotulo}{i.contato ? ` com ${i.contato}` : ''}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{new Date(i.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" title="Ações">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditandoId(i.id)}><Edit2 className="h-3.5 w-3.5 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => excluir(i)} className={TEXT.rose}><Trash2 className="h-3.5 w-3.5 mr-2" />Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      {r.valor !== 'EM_ANDAMENTO' && (
                        <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-medium', BADGE[r.cor])}>{r.rotulo}</span>
                      )}
                      <p className="text-[10px] text-muted-foreground">Registrado por {i.user?.name || 'Sistema'}</p>
                    </div>
                    <RichContent className="text-sm" html={i.resumo} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
