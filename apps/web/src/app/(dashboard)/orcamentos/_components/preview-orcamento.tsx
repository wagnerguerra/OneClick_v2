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

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, cn, Tooltip, TooltipTrigger, TooltipContent } from '@saas/ui'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, Info, Loader2, X } from 'lucide-react'
import { formatDocumento, ehMatrizCnpj } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { classificarArquivo, formatarTamanho } from '@/lib/arquivo-tipo'
import type { ClienteDoc } from '@/components/cliente-identificacao'

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
}

type Detalhe = {
  itens?: Array<{ id: string; descricao: string; tipo: string; valorTotal?: number | null; quantidade?: number | null; valorUnitario?: number | null }>
  arquivos?: Array<{ id: string; fileName: string; fileUrl: string; fileSize?: number | null; mimeType?: string | null; createdAt: string }>
  eventos?: Array<{ createdAt: string; descricao?: string | null }>
  mensagens?: Array<{ createdAt: string }>
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

  useEffect(() => {
    if (orc) {
      if (timer.current) clearTimeout(timer.current)
      setSaindo(false)
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
    setDetalhe(null)
    setCarregando(true)
    ;(trpc.orcamento as any).getById.query({ id: orc.id })
      .then((d: Detalhe) => { if (vivo) setDetalhe(d) })
      .catch(() => { if (vivo) setDetalhe({}) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [orc?.id])

  // Esc fecha; Enter abre o orçamento (fora de campos de texto).
  useEffect(() => {
    if (!orc) return
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'Enter') { e.preventDefault(); onAbrir(orc.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orc, onClose, onAbrir])

  if (!visivel) return null
  const o = visivel
  const valor = Number(o.totalGeral || o.valorTotal || 0)
  const nome = cliente?.nomeFantasia?.trim() || cliente?.razaoSocial || 'Sem cliente'
  const servicoPrincipal = o.itens?.[0]?.descricao?.replace(/<[^>]*>/g, '').trim()
  const doc = cliente?.documento ? formatDocumento(cliente.documento) : ''
  const ehCnpj = cliente?.tipoDocumento ? cliente.tipoDocumento === 'CNPJ' : doc.length > 14
  const matriz = ehCnpj && cliente ? ehMatrizCnpj(cliente.documento, cliente.ehMatriz, cliente.tipoDocumento) : false
  const campoEtapa = ETAPA_DATA[o.status]
  const desdeEtapa = (campoEtapa && (o[campoEtapa] as string | null | undefined)) || o.createdAt

  const bloco = proximoPasso(o, prazo)
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
            {/* Próximo passo */}
            <div
              className="preview-item-in flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-snug"
              style={{ ...atraso(0), backgroundColor: bloco.cor.fundo, borderColor: bloco.cor.borda, color: bloco.cor.texto }}
            >
              <bloco.Icon className="mt-px h-3.5 w-3.5 shrink-0" />
              <p><span className="font-semibold">{bloco.titulo}:</span> {bloco.texto}</p>
            </div>

            {/* Visão geral */}
            <section className="preview-item-in" style={atraso(1)}>
              <h3 className="mb-2 text-[13px] font-semibold">Visão geral</h3>
              <div className="flex items-center gap-4">
                <MedidorPrazo pct={prazo?.restantePct} variant={prazo?.variant ?? 'neutral'} />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{tituloPrazo(prazo)}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {prazo?.tooltip ?? 'Sem prazo ativo nesta etapa.'}
                    {o.responsavel?.name ? ` Responsável: ${o.responsavel.name}.` : ''}
                  </p>
                </div>
              </div>
              <dl className="mt-3 divide-y divide-border/70 text-[12px]">
                <LinhaDado rotulo="Valor do orçamento" valor={valor > 0 ? moeda(valor) : '—'} />
                <LinhaDado rotulo="Etapa atual" valor={statusLabel} />
                <LinhaDado rotulo="Tempo na etapa" valor={`${diasDesde(desdeEtapa)} dia(s)`} />
                <LinhaDado rotulo="Responsável" valor={o.responsavel?.name ?? '—'} />
                <LinhaDado rotulo="Solicitante" valor={o.solicitante?.name ?? '—'} />
                {doc && <LinhaDado rotulo={ehCnpj ? 'CNPJ' : 'CPF'} valor={`${doc}${ehCnpj ? ` · ${matriz ? 'Matriz' : 'Filial'}` : ''}`} />}
              </dl>
            </section>

            {/* Itens */}
            <section className="preview-item-in" style={atraso(2)}>
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
            <section className="preview-item-in" style={atraso(3)}>
              <h3 className="text-[13px] font-semibold">Atividade</h3>
              {carregando && !detalhe ? <Carregando /> : <CalendarioAtividade detalhe={detalhe} criadoEm={o.createdAt} />}
            </section>

            {/* Documentos */}
            <section className="preview-item-in pb-1" style={atraso(4)}>
              <h3 className="mb-2 text-[13px] font-semibold">Documentos</h3>
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
        <footer className="preview-item-in flex items-center justify-between gap-2 px-3 py-2.5" style={{ animationDelay: '300ms' }}>
          <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => onAbrir(o.id)}>Adicionar nota</Button>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={() => onAbrir(o.id)}>Editar</Button>
            <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => onAbrir(o.id)}>
              Abrir orçamento <kbd className="rounded bg-white/15 px-1 text-[10px] font-normal">↵</kbd>
            </Button>
          </div>
        </footer>
      </aside>
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

function tituloPrazo(prazo: PreviewPrazo | null): string {
  switch (prazo?.variant) {
    case 'ok': return 'No prazo!'
    case 'warning': return 'Atenção ao prazo'
    case 'danger': return prazo.label === 'vence hoje' ? 'Vence hoje' : 'Prazo vencido'
    default: return 'Sem prazo ativo'
  }
}

/**
 * Medidor em meio-arco com "tiques" (como no Rounder): o arco colorido sobe de
 * 0 até o prazo restante, e o número conta junto. Gradiente âmbar → verde.
 */
function MedidorPrazo({ pct, variant }: { pct?: number; variant: PreviewPrazo['variant'] }) {
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
  const corNumero = variant === 'danger' ? '#e11d48' : variant === 'warning' ? '#d97706' : variant === 'ok' ? '#0d9488' : '#94a3b8'
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
 * mês atual; abre no mês atual.
 */
const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const chaveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

function CalendarioAtividade({ detalhe, criadoEm }: { detalhe: Detalhe | null; criadoEm: string }) {
  const hoje = new Date()
  const [mes, setMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1))

  // Atividades por dia (chave ano-mês-dia).
  const porDia = useMemo(() => {
    const m = new Map<string, string[]>()
    const add = (iso: string, txt: string) => {
      const k = chaveDia(new Date(iso))
      const l = m.get(k) ?? []
      l.push(txt)
      m.set(k, l)
    }
    for (const e of detalhe?.eventos ?? []) add(e.createdAt, (e.descricao || 'Evento').replace(/<[^>]*>/g, ''))
    for (const msg of detalhe?.mensagens ?? []) add(msg.createdAt, 'Nova mensagem')
    return m
  }, [detalhe])

  const inicioOrc = new Date(criadoEm)
  const primeiroMes = new Date(inicioOrc.getFullYear(), inicioOrc.getMonth(), 1)
  const ultimoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const podeVoltar = mes > primeiroMes
  const podeAvancar = mes < ultimoMes

  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const offset = mes.getDay() // DOM = 0
  const totalMes = Array.from({ length: diasNoMes }, (_, i) => porDia.get(chaveDia(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))?.length ?? 0)
    .reduce((a, b) => a + b, 0)
  const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const nivel = (n: number) => (n === 1 ? 45 : n <= 3 ? 72 : 100)

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {totalMes} {totalMes === 1 ? 'atividade' : 'atividades'} em <span className="capitalize">{nomeMes}</span>
        </p>
        <div className="flex items-center gap-0.5">
          <button type="button" disabled={!podeVoltar} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
            aria-label="Mês anterior" className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={!podeAvancar} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
            aria-label="Próximo mês" className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
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
              <TooltipContent side="top" sideOffset={6} className="tooltip-fade max-w-[260px] text-[11px]">
                <p className="font-semibold">
                  {data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })} · {n} {n === 1 ? 'atividade' : 'atividades'}
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {lista.slice(0, 6).map((t, j) => <li key={j} className="line-clamp-2">• {t}</li>)}
                  {n > 6 && <li className="opacity-70">+ {n - 6} outras</li>}
                </ul>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </>
  )
}

function LinhaDado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
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
