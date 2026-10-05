'use client'

/**
 * Preview do orçamento — painel lateral que abre ao clicar no card do quadro.
 *
 * Inspirado no "deal preview" do Rounder (Dribbble, Uxerflow): o quadro fica
 * sob um véu claro, o painel aparece flutuando à direita e se desenrola de
 * cima para baixo, e o conteúdo entra em cascata — o medidor de prazo sobe
 * até o valor e a grade de atividade se preenche. Fecha com fade (✕, Esc ou
 * clique fora). Enter abre o orçamento completo.
 *
 * O cabeçalho sai do que o card já tem (aparece na hora); o resto vem do
 * `orcamento.getById`, carregado ao abrir.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Label, RichEditor,
  Tooltip, TooltipTrigger, TooltipContent,
} from '@saas/ui'
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Clock, Download, Hourglass,
  ArrowRightLeft, Bell, Circle, FileSignature, Highlighter, Info, Loader2, MessageSquare, Paperclip, Pause, Pencil, Play,
  Plus, RotateCcw, Send, SlidersHorizontal, Sparkles, Target, UserCog, UserRound, Workflow, X,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { mensagemErro } from '@/lib/errors'
import { UserMultiPicker } from '@/components/user-multi-picker'
import { classificarArquivo, formatarTamanho } from '@/lib/arquivo-tipo'
import type { ClienteDoc } from '@/components/cliente-identificacao'
import { SeloExCliente, ehExCliente } from '@/components/selo-ex-cliente'
import { calcularCompletude, NIVEL_COMPLETUDE_LABEL, type Completude, type NivelCompletude } from './completude-orcamento'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

export interface PreviewPrazo {
  label: string
  tooltip: string
  variant: 'ok' | 'warning' | 'danger' | 'neutral'
  /** 0–100: quanto do prazo da etapa ainda resta (ausente sem prazo ativo). */
  restantePct?: number
}

export interface PreviewOrcamentoRow {
  id: string
  numero: number
  status: string
  totalGeral?: number | null
  valorTotal?: number | null
  itens?: Array<{ id: string; descricao: string }>
  solicitante?: { id: string; name: string; image?: string | null } | null
  responsavel?: { id: string; name: string; image?: string | null } | null
  createdAt: string
  dtEnviado?: string | null
  dtAprovado?: string | null
  dtLiberado?: string | null
  dtFinalizado?: string | null
  dtEncerrado?: string | null
  decisaoTipo?: string | null
  /** Card do CRM vinculado (quando o orçamento nasceu de um lead). */
  oportunidadeId?: string | null
  oportunidadeNumero?: number | null
}

type Detalhe = {
  itens?: Array<{ id: string; descricao: string; tipo: string; valorTotal?: number | null; quantidade?: number | null; valorUnitario?: number | null }>
  arquivos?: Array<{ id: string; fileName: string; fileUrl: string; fileSize?: number | null; mimeType?: string | null; createdAt: string }>
  eventos?: Array<{ createdAt: string; descricao?: string | null; tipo?: string | null; usuario?: { name?: string | null } | null }>
  /** Responsáveis pela execução de cada serviço (o quadro da página de detalhe). */
  responsaveis?: Array<{ responsavelNome: string | null; responsavelImage: string | null }>
  mensagens?: Array<{ createdAt: string; mensagem?: string | null; usuario?: { name?: string | null } | null }>
}

/** Cores fixas (inline): em classe, rosa/vermelho sofrem o retint do módulo. */
const COR = {
  vermelho: { fundo: '#fff1f2', borda: '#fecdd3', texto: '#be123c' },
  ambar: { fundo: '#fffbeb', borda: '#fde68a', texto: '#b45309' },
  azul: { fundo: '#f0f9ff', borda: '#bae6fd', texto: '#0369a1' },
  verde: { fundo: '#ecfdf5', borda: '#a7f3d0', texto: '#047857' },
}

const ETAPA_DATA: Record<string, keyof PreviewOrcamentoRow> = {
  ENVIADO: 'dtEnviado', APROVADO: 'dtAprovado', LIBERADO: 'dtLiberado', FINALIZADO: 'dtFinalizado', ENCERRADO: 'dtEncerrado',
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const diasDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
const quandoRel = (iso: string) => {
  const d = diasDesde(iso)
  return d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d}d`
}

export function PreviewOrcamento({
  orc, cliente, prazo, statusLabel, statusCor, onClose, onAbrir,
}: {
  orc: PreviewOrcamentoRow | null
  cliente: ClienteDoc | null
  prazo: PreviewPrazo | null
  statusLabel: string
  statusCor: string
  onClose: () => void
  onAbrir: (id: string) => void
}) {
  // Mantém o último orçamento durante a animação de saída.
  const [visivel, setVisivel] = useState<PreviewOrcamentoRow | null>(orc)
  const [saindo, setSaindo] = useState(false)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [carregando, setCarregando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ações do preview: recarregar o detalhe depois de salvar algo.
  const [recarga, setRecarga] = useState(0)
  const recarregar = useCallback(() => setRecarga(n => n + 1), [])
  const [compondo, setCompondo] = useState(false)
  const [enviandoArquivos, setEnviandoArquivos] = useState<string[]>([])
  const inputArquivo = useRef<HTMLInputElement>(null)
  const ultimoId = useRef<string | null>(null)

  useEffect(() => {
    if (orc) {
      if (timer.current) clearTimeout(timer.current)
      setSaindo(false)
      setCompondo(false)
      setVisivel(orc)
    } else if (visivel) {
      setSaindo(true)
      timer.current = setTimeout(() => { setVisivel(null); setSaindo(false) }, 240)
    }
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [orc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Detalhe completo (itens com valor, arquivos, eventos, mensagens).
  useEffect(() => {
    if (!orc?.id) return
    let vivo = true
    // Outro orçamento: limpa a tela. Recarga do mesmo (após salvar mensagem ou
    // documento): mantém o que está à vista enquanto busca.
    const outro = ultimoId.current !== orc.id
    ultimoId.current = orc.id
    if (outro) setDetalhe(null)
    setCarregando(true)
    ;(trpc.orcamento as any).getById.query({ id: orc.id })
      .then((d: Detalhe) => { if (vivo) setDetalhe(d) })
      .catch(() => { if (vivo && outro) setDetalhe({}) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [orc?.id, recarga])

  // Esc fecha; Enter abre o orçamento (fora de campos de texto).
  useEffect(() => {
    if (!orc) return
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return
      if (e.key === 'Escape') { e.preventDefault(); if (compondo) setCompondo(false); else onClose() }
      else if (e.key === 'Enter') { e.preventDefault(); onAbrir(orc.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orc, onClose, onAbrir, compondo])

  // Envio de documento — mesmo fluxo da página de detalhe: sobe o arquivo em
  // /api/upload e registra no orçamento (orcamento.addArquivo).
  async function enviarArquivos(files: FileList | null) {
    const id = visivel?.id
    if (!files?.length || !id) return
    const lista = Array.from(files)
    setEnviandoArquivos(lista.map(f => f.name))
    const apiUrl = getApiUrl()
    await Promise.all(lista.map(async file => {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: fd, credentials: 'include' })
        if (!res.ok) throw new Error(`Falha no upload (${res.status})`)
        const data = await res.json()
        const fileUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
        await (trpc.orcamento as any).addArquivo.mutate({
          orcamentoId: id, fileName: file.name, fileUrl, fileSize: file.size, mimeType: file.type || undefined,
        })
      } catch (e) {
        alerts.error('Erro', `Falha ao enviar "${file.name}": ${mensagemErro(e)}`)
      } finally {
        setEnviandoArquivos(prev => prev.filter(n => n !== file.name))
      }
    }))
    if (inputArquivo.current) inputArquivo.current.value = ''
    recarregar()
  }

  if (!visivel) return null
  const o = visivel
  const valor = Number(o.totalGeral || o.valorTotal || 0)
  const nome = cliente?.nomeFantasia?.trim() || cliente?.razaoSocial || 'Sem cliente'
  const servicoPrincipal = o.itens?.[0]?.descricao?.replace(/<[^>]*>/g, '').trim()
  const campoEtapa = ETAPA_DATA[o.status]
  const desdeEtapa = (campoEtapa && (o[campoEtapa] as string | null | undefined)) || o.createdAt

  const bloco = proximoPasso(o, prazo)

  // Responsável = quem executa o serviço (como no quadro "Responsáveis pela
  // Execução" da página de detalhe), não o responsável comercial do orçamento.
  const respServico = [...new Set((detalhe?.responsaveis ?? []).map(r => r.responsavelNome).filter((n): n is string => !!n))]

  // Farol de completude (ver completude-orcamento.ts): só depois do detalhe,
  // que traz itens, anexos, mensagens e responsáveis.
  const completude = detalhe
    ? calcularCompletude({
        status: o.status,
        itens: (detalhe.itens ?? []).map(i => ({ tipo: i.tipo, valorTotal: i.valorTotal })),
        valorTotal: valor,
        arquivos: detalhe.arquivos?.length ?? 0,
        mensagens: detalhe.mensagens?.length ?? 0,
        temSolicitante: !!o.solicitante,
        temResponsavelServico: respServico.length > 0,
        prazoVariant: prazo?.variant ?? null,
      })
    : null
  // Delay de cada seção na cascata (ms, depois que o painel desenrolou).
  const atraso = (i: number) => ({ animationDelay: `${260 + i * 70}ms` })

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Orçamento #${o.numero}`}>
      {/* Véu claro sobre o quadro; clique fora fecha */}
      <div
        className={cn('absolute inset-0 bg-background/55 backdrop-blur-[1.5px]', saindo ? 'preview-veu-out' : 'preview-veu-in')}
        onClick={onClose}
      />

      {/* Painel flutuante — termina a 80px da base: o botão + de feedback
          (fixo, 48px a 20px da base, acima de modais) cobria o rodapé. */}
      <aside
        className={cn(
          'absolute bottom-20 right-2 top-2 flex w-[min(460px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl',
          saindo ? 'preview-painel-out' : 'preview-painel-in',
        )}
      >
        {/* Cabeçalho — sai do card, aparece na hora */}
        <header className="flex items-start gap-3 px-5 pb-3 pt-4">
          <LogoGrande cliente={cliente} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold leading-tight">
              {nome}{servicoPrincipal ? <span className="font-semibold"> : {servicoPrincipal}</span> : null}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">#{o.numero}</span>
              {ehExCliente(cliente) && <SeloExCliente />}
              <span className="h-3 w-px bg-border" />
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold" style={{ backgroundColor: `${statusCor}1A`, color: statusCor }}>
                {statusLabel}
              </span>
              {valor > 0 && (
                <span className="rounded-md px-1.5 py-0.5 font-semibold tabular-nums" style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 12%, transparent)`, color: MODULE_COLOR }}>
                  {moeda(valor)}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-1 -mt-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Corpo — cartão branco rolável */}
        <div className="nice-scrollbar mx-2 flex-1 overflow-y-auto rounded-xl border border-border/60 bg-card px-5 py-4">
          <div className="space-y-5">
            {/* Visão geral */}
            <section className="preview-item-in" style={atraso(0)}>
              <h3 className="mb-2 text-[13px] font-semibold">Visão geral</h3>
              <div className="flex items-center gap-4">
                <TooltipGargalo completude={completude}>
                  <span className="cursor-help">
                    <MedidorCompletude pct={completude?.pct} nivel={completude?.nivel ?? null} />
                  </span>
                </TooltipGargalo>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{completude ? NIVEL_COMPLETUDE_LABEL[completude.nivel] : 'Calculando…'}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {!completude ? 'Completude do orçamento: etapas, itens, anexos, mensagens, pessoas e prazo.'
                      : completude.falta.length === 0 ? 'Tudo preenchido e em dia.'
                      : `Falta: ${completude.falta.join(', ')}.`}
                  </p>
                </div>
              </div>
              {/* Próximo passo — dentro da visão geral */}
              <div
                className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-snug"
                style={{ backgroundColor: bloco.cor.fundo, borderColor: bloco.cor.borda, color: bloco.cor.texto }}
              >
                <bloco.Icon className="mt-px h-3.5 w-3.5 shrink-0" />
                <p><span className="font-semibold">{bloco.titulo}:</span> {bloco.texto}</p>
              </div>
              <dl className="mt-2 divide-y divide-border/70 text-[12px]">
                <LinhaDado icone={CircleDollarSign} rotulo="Valor do orçamento" valor={valor > 0 ? moeda(valor) : '—'} />
                <LinhaDado
                  icone={Workflow}
                  rotulo="Etapa atual"
                  valor={
                    <span className="inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${statusCor}1A`, color: statusCor }}>
                      {statusLabel}
                    </span>
                  }
                />
                <LinhaDado icone={Hourglass} rotulo="Tempo na etapa" valor={`${diasDesde(desdeEtapa)} dia(s)`} />
                <LinhaDado icone={UserRound} rotulo="Solicitante" valor={o.solicitante?.name ?? '—'} />
                <LinhaDado
                  icone={UserCog}
                  rotulo="Responsável"
                  valor={carregando && !detalhe ? '…' : respServico.length ? respServico.join(', ') : 'A definir'}
                />
                {o.oportunidadeId && (
                  <LinhaDado
                    icone={Target}
                    rotulo="Card do CRM"
                    valor={
                      <a
                        href={`/crm?op=${o.oportunidadeId}`}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
                        // Fúcsia inline: é a cor do CRM nos cards (e a classe sofreria retint).
                        style={{ backgroundColor: '#c026d31A', color: '#c026d3' }}
                        title="Abrir o card no CRM"
                      >
                        <Target className="h-3 w-3" /> {o.oportunidadeNumero != null ? `#${o.oportunidadeNumero}` : 'Abrir'}
                      </a>
                    }
                  />
                )}
              </dl>
            </section>

            {/* Itens */}
            <section className="preview-item-in" style={atraso(1)}>
              <h3 className="mb-2 text-[13px] font-semibold">Itens</h3>
              {carregando && !detalhe ? <Carregando /> : (
                (detalhe?.itens?.length ?? 0) === 0
                  ? <p className="text-[12px] text-muted-foreground">Nenhum item.</p>
                  : (
                    <ul className="space-y-1.5 text-[12px]">
                      {detalhe!.itens!.map(i => (
                        <li key={i.id} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: i.tipo === 'SERVICO' ? MODULE_COLOR : '#94a3b8' }} />
                          <span className="min-w-0 flex-1 truncate">{i.descricao.replace(/<[^>]*>/g, '')}</span>
                          {Number(i.valorTotal ?? 0) > 0 && <span className="shrink-0 tabular-nums text-muted-foreground">{moeda(Number(i.valorTotal))}</span>}
                        </li>
                      ))}
                    </ul>
                  )
              )}
            </section>

            {/* Atividade */}
            <section className="preview-item-in" style={atraso(2)}>
              <h3 className="text-[13px] font-semibold">Atividade</h3>
              {carregando && !detalhe ? <Carregando /> : <CalendarioAtividade detalhe={detalhe} criadoEm={o.createdAt} />}
            </section>

            {/* Documentos */}
            <section className="preview-item-in pb-1" style={atraso(3)}>
              <h3 className="mb-2 text-[13px] font-semibold">Documentos</h3>
              {enviandoArquivos.length > 0 && (
                <div className="mb-2 space-y-1">
                  {enviandoArquivos.map(n => (
                    <p key={n} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando {n}…
                    </p>
                  ))}
                </div>
              )}
              {carregando && !detalhe ? <Carregando /> : (
                (detalhe?.arquivos?.length ?? 0) === 0
                  ? <p className="text-[12px] text-muted-foreground">Nenhum anexo.</p>
                  : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {detalhe!.arquivos!.map((a, i) => {
                        const t = classificarArquivo(a.fileName, a.mimeType ?? null)
                        const Icone = t.icon
                        return (
                          <a
                            key={a.id}
                            href={resolveAssetUrl(a.fileUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="preview-item-in group flex items-center gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 transition-colors hover:bg-muted/60"
                            style={{ animationDelay: `${560 + i * 50}ms` }}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background">
                              <Icone className={cn('h-4 w-4', t.cor)} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-medium">{a.fileName}</span>
                              <span className="block text-[11px] text-muted-foreground">{formatarTamanho(a.fileSize)} · {quandoRel(a.createdAt)}</span>
                            </span>
                            <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                          </a>
                        )
                      })}
                    </div>
                  )
              )}
            </section>
          </div>
        </div>

        {/* Rodapé de ações */}
        {/* Compositor de mensagem — sobe sobre o corpo, dentro do painel */}
        {compondo && (
          <CompositorMensagem
            orcamentoId={o.id}
            onFechar={() => setCompondo(false)}
            onSalvo={() => { setCompondo(false); recarregar() }}
          />
        )}

        <footer className="preview-item-in flex items-center justify-between gap-2 px-3 py-2.5" style={{ animationDelay: '300ms' }}>
          {/* Um "+" só, abrindo para cima as duas ações */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Adicionar" title="Adicionar">
                {enviandoArquivos.length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={6} className="z-[60] min-w-[190px]">
              <DropdownMenuItem onClick={() => setCompondo(true)}>
                <MessageSquare className="h-3.5 w-3.5" /> Adicionar mensagem
              </DropdownMenuItem>
              <DropdownMenuItem disabled={enviandoArquivos.length > 0} onClick={() => inputArquivo.current?.click()}>
                <Paperclip className="h-3.5 w-3.5" /> Enviar documento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={inputArquivo} type="file" multiple className="hidden" onChange={e => enviarArquivos(e.target.files)} />
          <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => onAbrir(o.id)}>
            Detalhes <kbd className="rounded bg-white/15 px-1 text-[10px] font-normal">↵</kbd>
          </Button>
        </footer>
      </aside>
    </div>
  )
}

/**
 * Nova mensagem direto do preview — os mesmos campos do modal da página de
 * detalhe (texto rico, notificar por e-mail, restringir a visibilidade) e a
 * mesma mutation (orcamento.addMensagem). Notificar/restringir ficam em
 * "Mais opções" para caber no painel.
 */
function CompositorMensagem({ orcamentoId, onFechar, onSalvo }: { orcamentoId: string; onFechar: () => void; onSalvo: () => void }) {
  const [texto, setTexto] = useState('')
  const [notificar, setNotificar] = useState<string[]>([])
  const [restringir, setRestringir] = useState<string[]>([])
  const [opcoes, setOpcoes] = useState(false)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string; email: string | null; image: string | null }>>([])
  const [salvando, setSalvando] = useState(false)
  const vazia = !texto || texto.replace(/<[^>]*>/g, '').trim() === ''

  useEffect(() => {
    let vivo = true
    ;(trpc.orcamento as any).listUsuarios.query()
      .then((d: typeof usuarios) => { if (vivo) setUsuarios(d || []) })
      .catch(() => { /* sem lista, os seletores ficam vazios */ })
    return () => { vivo = false }
  }, [])

  async function salvar() {
    if (vazia) return
    setSalvando(true)
    try {
      await (trpc.orcamento as any).addMensagem.mutate({
        orcamentoId,
        mensagem: texto,
        notificarUsuarios: notificar.length > 0 ? notificar : undefined,
        acessoUsuarios: restringir.length > 0 ? restringir : undefined,
      })
      alerts.toast(notificar.length ? `Mensagem enviada e ${notificar.length} notificado(s)` : 'Mensagem adicionada', { icon: 'success' })
      onSalvo()
    } catch (e) {
      alerts.error('Erro', mensagemErro(e, 'Não foi possível salvar a mensagem.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="preview-item-in mx-2 mt-2 space-y-2.5 rounded-xl border border-border/70 bg-card p-3 shadow-sm" style={{ animationDelay: '0ms' }}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold"><MessageSquare className="h-3.5 w-3.5" /> Nova mensagem</p>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <RichEditor value={texto} onChange={setTexto} placeholder="Escreva aqui o conteúdo da mensagem..." />
      <button type="button" onClick={() => setOpcoes(v => !v)} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <SlidersHorizontal className="h-3 w-3" /> {opcoes ? 'Menos opções' : 'Mais opções'}
        {(notificar.length + restringir.length) > 0 && !opcoes && <span className="rounded bg-muted px-1">{notificar.length + restringir.length}</span>}
      </button>
      {opcoes && (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label className="text-[12px] font-semibold">Notificar por e-mail</Label>
            <UserMultiPicker users={usuarios} value={notificar} onChange={setNotificar} placeholder="Em branco = só grava a mensagem" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] font-semibold">Restringir aos usuários</Label>
            <UserMultiPicker users={usuarios} value={restringir} onChange={setRestringir} placeholder="Em branco = pública para a equipe" />
          </div>
        </div>
      )}
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={salvar} disabled={salvando || vazia}>
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {notificar.length > 0 ? `Enviar e notificar (${notificar.length})` : 'Salvar mensagem'}
        </Button>
      </div>
    </div>
  )
}

function proximoPasso(o: PreviewOrcamentoRow, prazo: PreviewPrazo | null): { titulo: string; texto: string; Icon: typeof Info; cor: typeof COR.azul } {
  const urgente = prazo?.variant === 'danger' ? COR.vermelho : prazo?.variant === 'warning' ? COR.ambar : COR.azul
  const Icone = prazo?.variant === 'danger' || prazo?.variant === 'warning' ? AlertTriangle : Info
  const quando = prazo ? ` (${prazo.label})` : ''
  switch (o.status) {
    case 'NOVO':
    case 'A_ENVIAR':
      return { titulo: 'Próximo passo', texto: `enviar a proposta ao cliente${quando}.`, Icon: Icone, cor: urgente }
    case 'ENVIADO':
      return o.decisaoTipo === 'REVISAO_SOLICITADA'
        ? { titulo: 'Próximo passo', texto: 'o cliente pediu revisão — ajustar e reenviar a proposta.', Icon: AlertTriangle, cor: COR.ambar }
        : { titulo: 'Próximo passo', texto: `aguardar a decisão do cliente${quando}.`, Icon: Icone, cor: urgente }
    case 'APROVADO':
      return { titulo: 'Próximo passo', texto: 'o financeiro liberar o orçamento — os serviços começam na liberação.', Icon: Clock, cor: COR.ambar }
    case 'LIBERADO':
      return { titulo: 'Em execução', texto: 'serviços em andamento; o orçamento finaliza quando o último for concluído.', Icon: CheckCircle2, cor: COR.verde }
    case 'FINALIZADO':
      return { titulo: 'Concluído', texto: 'o ciclo deste orçamento foi finalizado.', Icon: CheckCircle2, cor: COR.verde }
    default:
      return { titulo: 'Encerrado', texto: 'este orçamento saiu do funil.', Icon: Info, cor: COR.azul }
  }
}

/**
 * Medidor em meio-arco com "tiques" (como no Rounder): o arco colorido sobe de
 * 0 até a completude do orçamento, e o número conta junto. Gradiente laranja
 * → amarelo → verde-azulado; o número segue o nível do farol.
 */
function MedidorCompletude({ pct, nivel }: { pct?: number; nivel: NivelCompletude | null }) {
  const alvo = pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct)))
  const [atual, setAtual] = useState(0)
  useEffect(() => {
    let raf = 0
    const inicio = performance.now() + 320 // espera o painel desenrolar
    const dur = 900
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - inicio) / dur))
      const ease = 1 - Math.pow(1 - p, 3)
      setAtual(Math.round(alvo * ease))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [alvo])
  const arco = 'M 10 58 A 48 48 0 0 1 106 58'
  const corNumero = nivel === 'incompleto' ? '#e11d48' : nivel === 'andamento' ? '#d97706' : nivel ? '#0d9488' : '#94a3b8'
  const id = useMemo(() => `m${Math.random().toString(36).slice(2, 8)}`, [])
  return (
    <div className="relative h-[66px] w-[116px] shrink-0">
      <svg viewBox="0 0 116 66" className="h-full w-full">
        <defs>
          <linearGradient id={`${id}g`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <mask id={`${id}m`}>
            <path d={arco} fill="none" stroke="#fff" strokeWidth="16" pathLength={100} strokeDasharray={`${atual} 100`} />
          </mask>
        </defs>
        {/* trilho em tiques */}
        <path d={arco} fill="none" stroke="currentColor" className="text-muted-foreground/20" strokeWidth="12" strokeDasharray="1.6 2.4" />
        {/* preenchimento em tiques, revelado pela máscara */}
        <path d={arco} fill="none" stroke={`url(#${id}g)`} strokeWidth="12" strokeDasharray="1.6 2.4" mask={`url(#${id}m)`} />
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center text-[18px] font-semibold tabular-nums" style={{ color: corNumero }}>
        {pct == null ? '—' : `${atual}%`}
      </span>
    </div>
  )
}

/**
 * Calendário de atividade do orçamento — um mês por vez, em quadradinhos.
 * Cada dia com eventos (linha do tempo) ou mensagens fica azul, mais escuro
 * quanto mais coisa aconteceu; o tooltip lista o que foi. Fins de semana sem
 * atividade ficam mais apagados. Setas navegam da criação do orçamento até o
 * mês atual.
 *
 * Abre no mês da atividade MAIS RECENTE (02/10/2026): abrir sempre no mês
 * atual mostrava "0 atividades" em todo orçamento antigo, e as setas, pequenas
 * no canto, não eram vistas — parecia que só existia o mês corrente. Os meses
 * com atividade viram atalhos logo abaixo.
 */
const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

/** Uma linha da tabela do dia: evento da linha do tempo ou mensagem. */
interface AtividadeDia { em: string; tipo: string; texto: string; autor: string | null }

/**
 * Ícone e cor por tipo de atividade (tipos do OrcamentoEvento + "mensagem").
 * Cores em hex: o tooltip é escuro e elas precisam aparecer sobre ele.
 */
function tipoAtividade(tipo: string): { Icon: typeof Clock; cor: string } {
  switch (tipo) {
    case 'status_change': return { Icon: ArrowRightLeft, cor: '#60a5fa' }
    case 'envio': return { Icon: Send, cor: '#60a5fa' }
    case 'notificacao':
    case 'notificacao_mensagem': return { Icon: Bell, cor: '#fbbf24' }
    case 'created':
    case 'criacao': return { Icon: Sparkles, cor: '#34d399' }
    case 'edicao':
    case 'edicao_data': return { Icon: Pencil, cor: '#cbd5e1' }
    case 'servico_iniciado':
    case 'servicos_concluidos': return { Icon: Play, cor: '#a78bfa' }
    case 'destaque': return { Icon: Highlighter, cor: '#fbbf24' }
    case 'contrato_fechado': return { Icon: FileSignature, cor: '#34d399' }
    case 'reabertura':
    case 'retroacao_aprovacao': return { Icon: RotateCcw, cor: '#fb923c' }
    case 'paralizacao': return { Icon: Pause, cor: '#fbbf24' }
    case 'mensagem': return { Icon: MessageSquare, cor: '#7dd3fc' }
    default: return { Icon: Circle, cor: '#94a3b8' }
  }
}
const chaveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

function CalendarioAtividade({ detalhe, criadoEm }: { detalhe: Detalhe | null; criadoEm: string }) {
  const hoje = new Date()
  const [mes, setMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1))

  // Atividades por dia (chave ano-mês-dia).
  const porDia = useMemo(() => {
    const m = new Map<string, AtividadeDia[]>()
    const add = (a: AtividadeDia) => {
      const k = chaveDia(new Date(a.em))
      const l = m.get(k) ?? []
      l.push(a)
      m.set(k, l)
    }
    for (const e of detalhe?.eventos ?? []) {
      add({ em: e.createdAt, tipo: e.tipo || 'evento', texto: (e.descricao || 'Evento').replace(/<[^>]*>/g, '').trim(), autor: e.usuario?.name ?? null })
    }
    for (const msg of detalhe?.mensagens ?? []) {
      const trecho = (msg.mensagem || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      add({ em: msg.createdAt, tipo: 'mensagem', texto: trecho ? `Mensagem: ${trecho}` : 'Nova mensagem', autor: msg.usuario?.name ?? null })
    }
    // Dentro do dia, em ordem cronológica.
    for (const l of m.values()) l.sort((a, b) => a.em.localeCompare(b.em))
    return m
  }, [detalhe])

  // Meses que têm alguma atividade (1º dia de cada), em ordem.
  const mesesComAtividade = useMemo(() => {
    const vistos = new Map<string, Date>()
    for (const k of porDia.keys()) {
      const [a, m] = k.split('-').map(Number)
      const d = new Date(a ?? 1970, m ?? 0, 1)
      vistos.set(`${d.getFullYear()}-${d.getMonth()}`, d)
    }
    return [...vistos.values()].sort((x, y) => x.getTime() - y.getTime())
  }, [porDia])

  // Abre no mês da última atividade — uma vez por orçamento; depois quem manda
  // é a navegação de quem está olhando.
  const posicionado = useRef(false)
  useEffect(() => {
    if (posicionado.current || !detalhe) return
    const ultima = mesesComAtividade[mesesComAtividade.length - 1]
    if (ultima) setMes(ultima)
    posicionado.current = true
  }, [detalhe, mesesComAtividade])

  const inicioOrc = new Date(criadoEm)
  const criacao = Number.isNaN(inicioOrc.getTime()) ? hoje : inicioOrc
  // O limite é a criação ou a atividade mais antiga, o que vier antes.
  const primeiroMes = new Date(Math.min(
    new Date(criacao.getFullYear(), criacao.getMonth(), 1).getTime(),
    mesesComAtividade[0]?.getTime() ?? Infinity,
  ))
  const ultimoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const podeVoltar = mes > primeiroMes
  const podeAvancar = mes < ultimoMes
  const noMesAtual = mes.getTime() === ultimoMes.getTime()
  const mesCurto = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/')

  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const offset = mes.getDay() // DOM = 0
  const totalMes = Array.from({ length: diasNoMes }, (_, i) => porDia.get(chaveDia(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))?.length ?? 0)
    .reduce((a, b) => a + b, 0)
  const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const nivel = (n: number) => (n === 1 ? 45 : n <= 3 ? 72 : 100)

  return (
    <>
      {/* Navegação: setas com o mês entre elas, e "Hoje" quando fora do atual */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <button type="button" disabled={!podeVoltar} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          aria-label="Mês anterior" title="Mês anterior"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[12.5px] font-semibold capitalize leading-tight">{nomeMes}</p>
          <p className="text-[10.5px] leading-tight text-muted-foreground">{totalMes} {totalMes === 1 ? 'atividade' : 'atividades'}</p>
        </div>
        <button type="button" disabled={!podeAvancar} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
          aria-label="Próximo mês" title="Próximo mês"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronRight className="h-4 w-4" />
        </button>
        {!noMesAtual && (
          <button type="button" onClick={() => setMes(ultimoMes)}
            className="h-7 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Hoje
          </button>
        )}
      </div>
      {/* Atalhos: os meses que têm atividade */}
      {mesesComAtividade.length > 1 && (
        <div className="nice-scrollbar mb-2 flex gap-1 overflow-x-auto pb-0.5">
          {mesesComAtividade.map((m) => {
            const ativo = m.getTime() === mes.getTime()
            return (
              <button key={m.getTime()} type="button" onClick={() => setMes(m)}
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize transition-colors',
                  ativo ? 'border-transparent bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}>
                {mesCurto(m)}
              </button>
            )
          })}
        </div>
      )}
      <div className="grid w-full grid-cols-7 gap-1">
        {SEMANA.map(d => (
          <span key={d} className="pb-0.5 text-center text-[8px] font-semibold tracking-wide text-muted-foreground/70">{d}</span>
        ))}
        {Array.from({ length: offset }, (_, i) => <span key={`v${i}`} />)}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const data = new Date(mes.getFullYear(), mes.getMonth(), i + 1)
          const lista = porDia.get(chaveDia(data)) ?? []
          const n = lista.length
          const fimDeSemana = data.getDay() === 0 || data.getDay() === 6
          const ehHoje = chaveDia(data) === chaveDia(hoje)
          const futuro = data > hoje
          const linha = Math.floor((i + offset) / 7)
          const quadrado = (
            <span
              className={cn(
                'preview-item-in flex h-[26px] w-full items-center justify-center rounded-[4px] text-[10px] font-semibold tabular-nums',
                n === 0 && 'border border-border/70',
                n === 0 && (fimDeSemana || futuro) ? 'text-muted-foreground/40' : n === 0 ? 'text-muted-foreground' : '',
                ehHoje && 'ring-1 ring-foreground/40 ring-offset-1 ring-offset-card',
                n > 0 && 'cursor-help',
              )}
              style={{
                animationDelay: `${420 + linha * 45}ms`,
                ...(n > 0
                  ? { backgroundColor: `color-mix(in srgb, #2563eb ${nivel(n)}%, #dbeafe)`, color: nivel(n) >= 72 ? '#fff' : '#1e3a8a' }
                  : {}),
              }}
            >
              {i + 1}
            </span>
          )
          if (n === 0) return <span key={i}>{quadrado}</span>
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>{quadrado}</TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="tooltip-fade w-[340px] p-0 text-[11px]">
                <p className="px-3 pb-1.5 pt-2.5 font-semibold capitalize">
                  {data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })} · {n} {n === 1 ? 'atividade' : 'atividades'}
                </p>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-y border-background/15 text-left opacity-70">
                      <th className="px-3 py-1 font-medium">Hora</th>
                      <th className="px-1 py-1 font-medium">Evento</th>
                      <th className="px-3 py-1 text-right font-medium">Quem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.slice(0, 8).map((a, j) => {
                      const t = tipoAtividade(a.tipo)
                      return (
                        <tr key={j} className="border-b border-background/10 align-top last:border-0">
                          <td className="whitespace-nowrap px-3 py-1 tabular-nums opacity-80">
                            {new Date(a.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-1 py-1">
                            <span className="flex items-start gap-1.5">
                              <t.Icon className="mt-px h-3 w-3 shrink-0" style={{ color: t.cor }} />
                              <span className="line-clamp-2">{a.texto}</span>
                            </span>
                          </td>
                          <td className="max-w-[90px] truncate px-3 py-1 text-right opacity-80">{a.autor?.split(' ')[0] ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {n > 8 && <p className="px-3 pb-2 pt-1 opacity-70">+ {n - 8} outras atividades</p>}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </>
  )
}

/**
 * Tooltip do medidor: a tabela de onde o orçamento pontua e onde perde. A
 * linha do gargalo (o critério que mais deixou de pontuar) vem destacada.
 */
function TooltipGargalo({ completude, children }: { completude: Completude | null; children: React.ReactElement }) {
  if (!completude) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" align="start" sideOffset={8} className="tooltip-fade w-[300px] p-0 text-[11px]">
        <div className="px-3 pb-1.5 pt-2.5">
          <p className="font-semibold">Completude: {completude.pct}%</p>
          <p className="opacity-75">
            {completude.gargalo
              ? `Gargalo: ${completude.gargalo.rotulo.toLowerCase()} (${completude.gargalo.situacao})`
              : 'Sem gargalo — tudo pontuando.'}
          </p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-background/15 text-left opacity-70">
              <th className="px-3 py-1 font-medium">Critério</th>
              <th className="px-2 py-1 font-medium">Situação</th>
              <th className="px-3 py-1 text-right font-medium">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {completude.criterios.map(c => {
              const ehGargalo = completude.gargalo?.rotulo === c.rotulo
              const cheio = c.pontos >= c.maximo
              return (
                <tr key={c.rotulo} className={cn('border-b border-background/10 last:border-0', ehGargalo && 'bg-background/10')}>
                  <td className="px-3 py-1 font-medium">
                    {ehGargalo && <AlertTriangle className="mr-1 inline h-3 w-3 -translate-y-px text-amber-300" />}
                    {c.rotulo}
                  </td>
                  <td className="px-2 py-1 opacity-80">{c.situacao}</td>
                  <td className={cn('px-3 py-1 text-right tabular-nums', cheio ? 'opacity-60' : 'font-semibold')}>
                    {c.pontos}/{c.maximo}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TooltipContent>
    </Tooltip>
  )
}

function LinhaDado({ icone: Icone, rotulo, valor }: { icone: typeof Clock; rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icone className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        {rotulo}
      </dt>
      <dd className="min-w-0 truncate text-right font-medium">{valor}</dd>
    </div>
  )
}

function LogoGrande({ cliente }: { cliente: ClienteDoc | null }) {
  const [falhou, setFalhou] = useState(false)
  const src = cliente?.logoUrl && !falhou ? resolveAssetUrl(cliente.logoUrl) : ''
  if (src) return <img src={src} alt="" onError={() => setFalhou(true)} className="h-9 w-9 shrink-0 rounded-lg border border-border/60 bg-white object-contain" />
  const inicial = (cliente?.nomeFantasia || cliente?.razaoSocial || '?').trim().charAt(0).toUpperCase()
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[14px] font-bold text-muted-foreground">{inicial}</span>
}

function Carregando() {
  return (
    <div className="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
    </div>
  )
}
