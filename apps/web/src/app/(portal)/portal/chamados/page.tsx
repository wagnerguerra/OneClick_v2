'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronRight, Heart, LifeBuoy, Lightbulb, Loader2, MessageSquareWarning, Plus, Search, Send, Wrench } from 'lucide-react'
import {
  Button, Checkbox, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle,
  Input, Label, Textarea, cn,
} from '@saas/ui'

import { trpc } from '@/lib/trpc'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { usePortal } from '../../_lib/contexto'
import { PortalPageHeader } from '../../_components/portal-page-header'

/**
 * Atendimento — o cliente pede serviços e registra reclamações, sugestões e
 * elogios, e acompanha a conversa com a equipe.
 *
 * As abas vêm de `atendimento.permissoes` (o servidor confere cada ação de
 * novo; isto aqui só evita oferecer o que a pessoa não pode fazer). Pedido de
 * serviço vira um orçamento no kanban da equipe; o resto cai nas telas de
 * Reclamações, Sugestões e Elogios da Qualidade.
 */
type Tipo = 'SERVICO' | 'RECLAMACAO' | 'SUGESTAO' | 'ELOGIO'

interface Permissoes { SERVICO: boolean; RECLAMACAO: boolean; SUGESTAO: boolean; ELOGIO: boolean; veTudo: boolean }
interface Item { id: string; tipo: Tipo; codigo: string; titulo: string; situacao: string; aberto: boolean; criadoEm: string; autorNome: string | null }
interface Mensagem { id: string; texto: string; doCliente: boolean; autorNome: string | null; criadoEm: string }
interface Detalhe {
  id: string; tipo: Tipo; codigo: string; titulo: string; situacao: string; aberto: boolean; criadoEm: string
  descricao: string | null; respostas: Array<{ titulo: string; texto: string }>; mensagens: Mensagem[]
}
interface Servico { id: string; nome: string; descricao: string | null }

/** Contrato das rotas usadas aqui — mudança de formato quebra a compilação, não a tela. */
interface ApiAtendimento {
  permissoes: { query(i: { clienteId: string }): Promise<Permissoes> }
  servicos: { query(i: { clienteId: string }): Promise<Servico[]> }
  solicitar: { mutate(i: { clienteId: string; servicoIds: string[]; descricao: string }): Promise<{ id: string; codigo: string }> }
  registrar: { mutate(i: { clienteId: string; tipo: Exclude<Tipo, 'SERVICO'>; titulo?: string | null; descricao: string; dataOcorrido?: string | null }): Promise<{ id: string; codigo: string }> }
  listar: { query(i: { clienteId: string; tipo: Tipo }): Promise<Item[]> }
  detalhe: { query(i: { clienteId: string; tipo: Tipo; id: string }): Promise<Detalhe> }
  responder: { mutate(i: { clienteId: string; tipo: Tipo; id: string; texto: string }): Promise<{ ok: boolean }> }
}
const api = () => (trpc.portal as unknown as { atendimento: ApiAtendimento }).atendimento

const ABAS: Array<{ tipo: Tipo; rotulo: string; novo: string; icone: typeof Wrench; cor: 'emerald' | 'rose' | 'amber' | 'sky'; vazio: string }> = [
  { tipo: 'SERVICO', rotulo: 'Solicitar serviço', novo: 'Nova solicitação', icone: Wrench, cor: 'sky', vazio: 'Peça um serviço ao escritório — a equipe analisa e responde por aqui.' },
  { tipo: 'RECLAMACAO', rotulo: 'Reclamações', novo: 'Nova reclamação', icone: MessageSquareWarning, cor: 'rose', vazio: 'Algo não saiu como esperado? Conte para a gente — toda reclamação recebe retorno.' },
  { tipo: 'SUGESTAO', rotulo: 'Sugestões', novo: 'Nova sugestão', icone: Lightbulb, cor: 'amber', vazio: 'Tem uma ideia para melhorarmos o atendimento? Queremos ouvir.' },
  { tipo: 'ELOGIO', rotulo: 'Elogios', novo: 'Novo elogio', icone: Heart, cor: 'emerald', vazio: 'Ficou satisfeito com alguém da equipe? Deixe o seu elogio.' },
]

/** Tom da situação, no padrão de chips do portal. */
function tomSituacao(situacao: string, aberto: boolean): string {
  if (!aberto) return 'bg-slate-100 text-slate-600 dark:bg-[#16233a] dark:text-slate-300'
  if (/proposta|respondida|analisada/i.test(situacao)) return 'bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]'
  if (/aprovada|execução|tratamento/i.test(situacao)) return 'bg-[#e9f6ee] text-[#1f9254] dark:bg-[#122019] dark:text-[#6fcf97]'
  return 'bg-[#fdf0e6] text-[#c2510f] dark:bg-[#2a1a10] dark:text-[#e09a6a]'
}
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function PortalAtendimentoPage() {
  const { clienteId, vinculo } = usePortal()
  const liberado = !!vinculo?.modulos.includes('chamados')
  const [perm, setPerm] = useState<Permissoes | null>(null)
  const [aba, setAba] = useState<Tipo | null>(null)
  const [itens, setItens] = useState<Item[] | null | undefined>(undefined)
  const [novoAberto, setNovoAberto] = useState(false)
  const [abrirId, setAbrirId] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId || !liberado) return
    api().permissoes.query({ clienteId }).then(p => {
      setPerm(p)
      setAba(a => a && p[a] ? a : (ABAS.find(x => p[x.tipo])?.tipo ?? null))
    }).catch(() => setPerm(null))
  }, [clienteId, liberado])

  const carregar = useCallback(() => {
    if (!clienteId || !aba) return
    setItens(undefined)
    api().listar.query({ clienteId, tipo: aba }).then(setItens).catch(() => setItens(null))
  }, [clienteId, aba])
  useEffect(() => { carregar() }, [carregar])

  const abas = useMemo(() => ABAS.filter(a => perm?.[a.tipo]), [perm])
  const atual = ABAS.find(a => a.tipo === aba)

  return (
    <>
      <PortalPageHeader
        titulo="Atendimento"
        subtitulo="Solicite serviços e fale com o escritório: reclamações, sugestões e elogios."
        acoes={atual ? (
          <Button size="sm" className="gap-1.5" onClick={() => setNovoAberto(true)}>
            <Plus className="h-4 w-4" />{atual.novo}
          </Button>
        ) : undefined}
      />
      {!vinculo ? null : !liberado || (perm && abas.length === 0) ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#e6ebf2] bg-white px-6 py-14 text-center dark:border-[#1b2739] dark:bg-[#0e1726]">
          <LifeBuoy className="h-9 w-9 text-slate-400" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Atendimento não disponível</p>
          <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
            O acesso a esta área é liberado pelo escritório. Se você precisa dele, fale com o administrador da sua empresa.
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white shadow-sm dark:border-[#1b2739] dark:bg-[#0e1726]">
          {/* Abas — rolam na horizontal no celular em vez de quebrar. */}
          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-[#eef2f7] px-3 pt-3 dark:border-[#1b2739]">
            {abas.map(a => (
              <button key={a.tipo} type="button" onClick={() => setAba(a.tipo)}
                className={cn('flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors',
                  aba === a.tipo ? 'border-[#1a6dff] text-[#1a6dff] dark:text-[#7db0ff]' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')}>
                <a.icone className="h-4 w-4" />{a.rotulo}
              </button>
            ))}
          </div>
          {itens === undefined ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : itens === null ? (
            <p className="px-5 py-10 text-center text-[12.5px] text-slate-500">Não foi possível carregar agora. Tente de novo em instantes.</p>
          ) : itens.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
              {atual && <atual.icone className="h-8 w-8 text-slate-300 dark:text-slate-600" />}
              <p className="max-w-sm text-[13px] text-slate-500 dark:text-slate-400">{atual?.vazio}</p>
              {atual && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNovoAberto(true)}><Plus className="h-4 w-4" />{atual.novo}</Button>}
            </div>
          ) : (
            <ul className="divide-y divide-[#eef2f7] dark:divide-[#1b2739]">
              {itens.map(i => (
                <li key={i.id}>
                  <button type="button" onClick={() => setAbrirId(i.id)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#f7faff] dark:hover:bg-[#16233a]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{i.titulo}</p>
                      <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{i.codigo}</span> · {dataCurta(i.criadoEm)}
                        {perm?.veTudo && i.autorNome ? ` · ${i.autorNome}` : ''}
                      </p>
                    </div>
                    <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', tomSituacao(i.situacao, i.aberto))}>{i.situacao}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {atual && clienteId && (
        <NovoDialog key={`${atual.tipo}-${novoAberto}`} aberto={novoAberto} aba={atual} clienteId={clienteId}
          onClose={() => setNovoAberto(false)} onCriado={() => { setNovoAberto(false); carregar() }} />
      )}
      {aba && clienteId && (
        <DetalheDialog id={abrirId} tipo={aba} clienteId={clienteId} onClose={() => { setAbrirId(null); carregar() }} />
      )}
    </>
  )
}

// ── Novo ────────────────────────────────────────────────────────────────────

function NovoDialog({ aberto, aba, clienteId, onClose, onCriado }: {
  aberto: boolean; aba: typeof ABAS[number]; clienteId: string; onClose: () => void; onCriado: () => void
}) {
  const ehServico = aba.tipo === 'SERVICO'
  const [servicos, setServicos] = useState<Servico[] | null>(null)
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<string[]>([])
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataOcorrido, setDataOcorrido] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)

  useEffect(() => {
    if (aberto && ehServico) api().servicos.query({ clienteId }).then(setServicos).catch(() => setServicos([]))
  }, [aberto, ehServico, clienteId])

  const filtrados = (servicos ?? []).filter(s => !busca.trim() || s.nome.toLowerCase().includes(busca.trim().toLowerCase()))

  async function enviar() {
    setEnviando(true); setErro(null)
    try {
      const r = ehServico
        ? await api().solicitar.mutate({ clienteId, servicoIds: marcados, descricao })
        : await api().registrar.mutate({ clienteId, tipo: aba.tipo as Exclude<Tipo, 'SERVICO'>, titulo: titulo || null, descricao, dataOcorrido: dataOcorrido || null })
      setFeito(r.codigo)
    } catch (e) { setErro((e as Error).message) } finally { setEnviando(false) }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !enviando) (feito ? onCriado : onClose)() }}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={aba.icone} color={aba.cor}>
          <DialogTitle>{aba.novo}</DialogTitle>
          <DialogDescription>{ehServico ? 'Escolha os serviços e conte o que você precisa.' : 'O escritório recebe na hora e responde por aqui.'}</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {feito ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-[#1f9254]" />
              <p className="text-sm font-semibold">Recebido! Protocolo <span className="font-mono">{feito}</span></p>
              <p className="max-w-sm text-xs text-muted-foreground">Você acompanha a situação e conversa com a equipe aqui mesmo, na lista.</p>
            </div>
          ) : (<>
            {ehServico && (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Serviços <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço..." className="h-9 pl-8 text-sm" />
                </div>
                <div className="nice-scrollbar max-h-48 overflow-y-auto rounded-lg border border-border">
                  {servicos === null ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    : filtrados.length === 0 ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum serviço encontrado — descreva o que precisa abaixo.</p>
                    : filtrados.map(s => (
                      <label key={s.id} className="flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/40">
                        <Checkbox className="mt-0.5" checked={marcados.includes(s.id)}
                          onCheckedChange={v => setMarcados(m => v === true ? [...m, s.id] : m.filter(x => x !== s.id))} />
                        <span className="min-w-0 text-[13px]">{s.nome.trim()}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
            {!ehServico && (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Assunto <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={150} className="h-9 text-sm" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">{ehServico ? 'O que você precisa?' : aba.tipo === 'ELOGIO' ? 'Seu elogio' : aba.tipo === 'SUGESTAO' ? 'Sua sugestão' : 'O que aconteceu?'}</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={5} maxLength={5000} className="nice-scrollbar text-sm" />
            </div>
            {aba.tipo === 'RECLAMACAO' && (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Quando aconteceu? <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input type="date" value={dataOcorrido} onChange={e => setDataOcorrido(e.target.value)} className="h-9 w-44 text-sm" />
              </div>
            )}
            {erro && <p className="text-xs font-medium text-destructive">{erro}</p>}
          </>)}
        </DialogBody>
        <DialogFooter>
          {feito ? <Button size="sm" onClick={onCriado}>Fechar</Button> : (<>
            <Button size="sm" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
            <Button size="sm" className="gap-1.5" onClick={enviar} disabled={enviando || descricao.trim().length < 10}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar
            </Button>
          </>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Detalhe + conversa ──────────────────────────────────────────────────────

function DetalheDialog({ id, tipo, clienteId, onClose }: { id: string | null; tipo: Tipo; clienteId: string; onClose: () => void }) {
  const [d, setD] = useState<Detalhe | null | undefined>(undefined)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const aba = ABAS.find(a => a.tipo === tipo)!

  const carregar = useCallback(() => {
    if (!id) return
    api().detalhe.query({ clienteId, tipo, id }).then(setD).catch(() => setD(null))
  }, [id, clienteId, tipo])
  useEffect(() => { setD(undefined); setTexto(''); carregar() }, [carregar])

  async function responder() {
    if (!id || !texto.trim()) return
    setEnviando(true)
    try { await api().responder.mutate({ clienteId, tipo, id, texto: texto.trim() }); setTexto(''); carregar() }
    catch (e) { window.alert((e as Error).message) } finally { setEnviando(false) }
  }

  return (
    <Dialog open={!!id} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeaderIcon icon={aba.icone} color={aba.cor}>
          <DialogTitle className="truncate">{d?.titulo ?? 'Carregando...'}</DialogTitle>
          <DialogDescription>{d ? <><span className="font-mono">{d.codigo}</span> · aberto em {dataCurta(d.criadoEm)} · {d.situacao}</> : ' '}</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="nice-scrollbar max-h-[65vh] space-y-4 overflow-y-auto">
          {d === undefined ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            : d === null ? <p className="py-8 text-center text-sm text-muted-foreground">Não foi possível abrir este atendimento.</p>
            : (<>
              {d.descricao && <p className="whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-[13px]">{d.descricao}</p>}
              {d.respostas.map((r, k) => (
                <div key={k} className="rounded-lg border border-[#cfe0ff] bg-[#f4f8ff] px-3 py-2 dark:border-[#1b2739] dark:bg-[#16233a]">
                  <p className="mb-0.5 text-[11px] font-semibold text-[#1a6dff] dark:text-[#7db0ff]">{r.titulo}</p>
                  <p className="whitespace-pre-wrap text-[13px]">{r.texto}</p>
                </div>
              ))}
              <div className="space-y-2">
                <p className="text-[12px] font-semibold text-muted-foreground">Conversa</p>
                {d.mensagens.length === 0 && <p className="text-[12px] italic text-muted-foreground">Nenhuma mensagem ainda. A equipe responde por aqui.</p>}
                {d.mensagens.map(m => (
                  <div key={m.id} className={cn('flex', m.doCliente ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-[13px]',
                      m.doCliente ? 'rounded-br-sm bg-[#1a6dff] text-white' : 'rounded-bl-sm bg-muted/60 text-foreground')}>
                      <p className="whitespace-pre-wrap">{m.texto}</p>
                      <p className={cn('mt-0.5 text-[10.5px]', m.doCliente ? 'text-white/75' : 'text-muted-foreground')}>
                        {m.autorNome ?? (m.doCliente ? 'Você' : 'Equipe')} · {dataHora(m.criadoEm)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>)}
        </DialogBody>
        {d && (
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
            {d.aberto ? (
              <div className="flex items-end gap-2">
                <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={5000} placeholder="Escreva para a equipe..." className="nice-scrollbar flex-1 text-sm" />
                <Button size="sm" className="gap-1.5" onClick={responder} disabled={enviando || !texto.trim()}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar
                </Button>
              </div>
            ) : <p className="text-center text-xs text-muted-foreground">Atendimento encerrado. Se precisar, abra um novo.</p>}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
