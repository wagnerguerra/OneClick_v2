'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ExternalLink, FileText, Loader2, Mail, MailOpen, MailWarning, Phone, Send, Users } from 'lucide-react'
import { cn, Switch, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BADGE, DOT, PILL, TEXT, type ColorName } from '@/lib/color-styles'
import { BadgeEntrega } from './badge-entrega'

/**
 * Painel de leitura de uma entrega do Acessórias — tudo o que a API devolveu,
 * mais a reclassificação de multa. Usado pelo modal do cliente (Entregas e
 * guias) e pelo detalhe dos indicadores: um componente só, para os dois
 * mostrarem exatamente o mesmo.
 */

/** A linha completa de uma entrega, como o backend a monta (`paraLinhasPainel`). */
export interface LinhaEntrega {
  id: string
  entId: string
  clienteId: string
  clienteCode: number
  clienteNome: string
  documento: string
  obrigacao: string
  competencia: string | null
  prazo: string | null
  diasParaPrazo: number | null
  vencimento: string | null
  diasParaVencimento: number | null
  /** Vencimento impresso na guia (lido do PDF). Null = sem guia legível. */
  vencimentoGuia: string | null
  /** 'lido' | 'nao_encontrado' | 'sem_pdf' | 'erro' | null (ainda não lida). */
  vencimentoGuiaStatus: string | null
  dtEntrega: string | null
  dtFinalizacao: string | null
  lidaEm: string | null
  syncedAt: string
  status: string | null
  lida: boolean | null
  guiaLida: string | null
  entregue: boolean
  dispensada: boolean
  multa: boolean
  /** EntMulta original do Acessórias (null = linha anterior a guardarmos). */
  multaAcessorias: boolean | null
  /** O escritório reclassificou a multa desta obrigação para o cliente. */
  multaReclassificada: boolean
  dpto: string | null
  respEntrega: string | null
  respPrazo: string | null
  responsavel: string | null
  responsavelEntregou: boolean
}

/** Resultado da reclassificação — vale para TODAS as ocorrências da obrigação. */
export interface MultaReclassificada {
  obrigacao: string
  multa: boolean
  multaReclassificada: boolean
}

const fmtData = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/** Competência no formato do Acessórias: "Jun/2026". */
const fmtComp = (v: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  const m = d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${m.charAt(0).toUpperCase()}${m.slice(1)}/${d.getUTCFullYear()}`
}

/** Guia que o cliente ainda não abriu numa obrigação sujeita a multa. */
export function naoLidaComMulta(l: LinhaEntrega): boolean {
  return l.lida === false && l.multa
}

/** Link da entrega no Acessórias (quando a integração informa o modelo de URL). */
export function linkNoAcessorias(l: LinhaEntrega, urlTemplate: string | null): string | null {
  return urlTemplate
    ? urlTemplate.replace('{entId}', l.entId).replace('{cnpj}', l.documento.replace(/\D/g, ''))
    : null
}

/**
 * Aplica a reclassificação em todas as linhas da obrigação, de qualquer
 * cliente. Desfeita, cada linha volta ao próprio valor do Acessórias — como o
 * servidor fez.
 */
export function aplicarReclassificacao<T extends LinhaEntrega>(linhas: T[], r: MultaReclassificada): T[] {
  return linhas.map((x) => (x.obrigacao === r.obrigacao
    ? {
        ...x,
        multa: r.multaReclassificada ? r.multa : (x.multaAcessorias ?? r.multa),
        multaReclassificada: r.multaReclassificada,
      }
    : x))
}

/** Dias de hoje até uma data "YYYY-MM-DD" (negativo = já passou). */
function diasAte(v: string): number {
  const [a, m, d] = v.slice(0, 10).split('-').map(Number)
  const alvo = new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
}

const falaDias = (d: number) =>
  d === 0 ? 'vence hoje' : d > 0 ? `vence em ${d} dia${d === 1 ? '' : 's'}` : `venceu há ${-d} dia${d === -1 ? '' : 's'}`

/** Tom do vencimento da guia: vencida (rosa), até 3 dias (âmbar), à frente (azul). */
function corVencimento(d: number): ColorName {
  return d < 0 ? 'rose' : d <= 3 ? 'amber' : 'sky'
}

/** Por que não há vencimento da guia — a tela diz, em vez de um "—" mudo. */
function motivoSemVencimento(status: string | null): string {
  switch (status) {
    case 'nao_encontrado': return 'O anexo não traz vencimento (relatório, declaração ou layout não reconhecido).'
    case 'sem_pdf': return 'O anexo não é um PDF.'
    case 'erro': return 'Não foi possível baixar ou ler a guia.'
    default: return 'Guia ainda não lida — a próxima sincronização lê.'
  }
}

/**
 * Vencimento da guia numa célula de tabela: a data num selo colorido pelo que
 * falta, e a marca "≠" quando difere do prazo legal.
 */
export function VencimentoGuiaCelula({ linha: l }: { linha: LinhaEntrega }) {
  if (!l.vencimentoGuia) {
    return <span className="text-muted-foreground" title={motivoSemVencimento(l.vencimentoGuiaStatus)}>—</span>
  }
  const d = diasAte(l.vencimentoGuia)
  const difere = !!l.vencimento && l.vencimento.slice(0, 10) !== l.vencimentoGuia.slice(0, 10)
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold tabular-nums', PILL[corVencimento(d)])}
      title={`Vencimento impresso na guia · ${falaDias(d)}${difere ? ` · difere do prazo legal (${fmtData(l.vencimento)})` : ''}`}
    >
      {fmtData(l.vencimentoGuia)}
      {difere && <span aria-label="difere do prazo legal">≠</span>}
    </span>
  )
}

/** O vencimento da guia em destaque, no topo do painel de leitura. */
function VencimentoGuiaDestaque({ linha: l }: { linha: LinhaEntrega }) {
  if (!l.vencimentoGuia) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border px-3 py-2.5">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground">Vencimento da guia não identificado</p>
          <p className="text-[11px] text-muted-foreground">
            {motivoSemVencimento(l.vencimentoGuiaStatus)} Vale o prazo legal: {fmtData(l.vencimento)}.
          </p>
        </div>
      </div>
    )
  }
  const d = diasAte(l.vencimentoGuia)
  const cor = corVencimento(d)
  const difere = !!l.vencimento && l.vencimento.slice(0, 10) !== l.vencimentoGuia.slice(0, 10)
  return (
    <div className={cn('rounded-lg border px-3 py-2.5', BADGE[cor])}>
      <div className="flex items-center gap-2.5">
        <CalendarClock className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Vencimento da guia</p>
          <p className="text-[20px] font-bold leading-tight tabular-nums">{fmtData(l.vencimentoGuia)}</p>
        </div>
        <span className="shrink-0 text-[12px] font-semibold">{falaDias(d)}</span>
      </div>
      {difere && (
        <p className="mt-1.5 border-t border-current/20 pt-1.5 text-[11px]">
          Diferente do prazo legal ({fmtData(l.vencimento)}) — vale a data impressa na guia.
        </p>
      )}
      <p className="mt-1 text-[10.5px] opacity-75">Lido do PDF anexado no Acessórias.</p>
    </div>
  )
}

interface GuiaAnexada { id: string; nome: string; url: string }

/**
 * Acesso à guia anexada no Acessórias. O link de lá vale 60 minutos, então é
 * pedido no clique. A aba nova é aberta JÁ no clique (antes da resposta) —
 * aberta depois de um await, o navegador a trataria como pop-up e bloquearia.
 * Mais de um anexo: o painel lista cada um pelo nome real do arquivo.
 */
function GuiaDaEntrega({ linha }: { linha: LinhaEntrega }) {
  const [carregando, setCarregando] = useState(false)
  const [guias, setGuias] = useState<GuiaAnexada[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Outra entrega selecionada: a lista (e os links, que expiram) não vale mais.
  useEffect(() => { setGuias(null); setErro(null) }, [linha.id])

  const abrir = async () => {
    const aba = window.open('about:blank', '_blank')
    setCarregando(true)
    setErro(null)
    try {
      const r: { ok: boolean; guias: GuiaAnexada[]; erro?: string } =
        await (trpc.acessorias as any).guiasDaEntrega.query({ entregaId: linha.id })
      if (!r.ok || r.guias.length === 0) {
        aba?.close()
        setErro(r.ok ? 'Esta entrega não tem guia anexada no Acessórias.' : (r.erro ?? 'Não foi possível buscar a guia.'))
        return
      }
      if (r.guias.length === 1 && aba) {
        aba.location.href = r.guias[0]!.url
      } else {
        aba?.close()
      }
      setGuias(r.guias)
    } catch {
      aba?.close()
      setErro('Não foi possível consultar o Acessórias.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-foreground">Guia</p>
      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
        <button
          type="button"
          onClick={abrir}
          disabled={carregando}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[12px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Abrir guia
        </button>
        {erro && <p className="mt-1.5 text-[11px] text-muted-foreground">{erro}</p>}
        {guias && guias.length > 0 && (
          <ul className="mt-2 space-y-1">
            {guias.map((g) => (
              <li key={g.id}>
                <a href={g.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-[12px] text-foreground hover:underline" title={g.nome}>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{g.nome}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
          Arquivo anexado no Acessórias. Abrir por aqui não conta como leitura do cliente.
        </p>
      </div>
    </div>
  )
}

/** Uma linha "rótulo: valor" do detalhe. Valor ausente aparece como "—". */
function Campo({ label, valor, mono }: { label: string; valor: React.ReactNode; mono?: boolean }) {
  const vazio = valor === null || valor === undefined || valor === ''
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('text-right text-[13px]', mono && 'font-mono text-[12px]', vazio && 'text-muted-foreground')}>
        {vazio ? '—' : valor}
      </span>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-foreground">{titulo}</p>
      <div className="rounded-lg border border-border bg-muted/20 px-3 py-1">{children}</div>
    </div>
  )
}

/**
 * Os campos da entrega (datas, situação, leitura da guia, responsáveis e
 * origem). Mostra os campos crus (Status, EntGuiaLida) ao lado dos derivados,
 * porque é na diferença entre os dois que se descobre o que o Acessórias quis
 * dizer.
 */
export function DetalheEntregaConteudo({ linha: l }: { linha: LinhaEntrega }) {
  const dh = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR') : null)
  const sim = (b: boolean) => (b ? 'Sim' : 'Não')
  return (
    <>
      <Secao titulo="Datas">
        <Campo label="Competência" valor={fmtComp(l.competencia)} />
        <Campo label="Prazo técnico (EntDtPrazo)" valor={fmtData(l.prazo)} />
        <Campo label="Prazo legal (EntDtAtraso)" valor={fmtData(l.vencimento)} />
        <Campo label="Vencimento da guia (PDF)" valor={l.vencimentoGuia ? fmtData(l.vencimentoGuia) : null} />
        <Campo label="Entrega (EntDtEntrega)" valor={<BadgeEntrega entrega={l.dtEntrega} vencimento={l.vencimento} />} />
        <Campo label="Finalização (EntDtFinalizacao)" valor={dh(l.dtFinalizacao)} />
      </Secao>

      <Secao titulo="Situação">
        <Campo label="Status no Acessórias" valor={l.status} mono />
        <Campo label="Entregue" valor={sim(l.entregue)} />
        <Campo label="Dispensada" valor={sim(l.dispensada)} />
        <Campo label="Sujeita a multa (EntMulta)" valor={sim(l.multa)} />
        <Campo
          label="Dias até o prazo legal"
          valor={l.diasParaVencimento === null ? null : `${l.diasParaVencimento}d`}
        />
      </Secao>

      <Secao titulo="Leitura da guia pelo cliente">
        {/* O texto cru importa: vazio significa "não tem guia para abrir",
            que é diferente de "não abriu". */}
        <Campo label="EntGuiaLida (texto original)" valor={l.guiaLida} mono />
        <Campo
          label="Interpretação"
          valor={l.lida === null ? 'Sem guia para abrir' : l.lida ? 'Lida' : 'Não lida'}
        />
        <Campo label="Última atividade (EntLastDH)" valor={dh(l.lidaEm)} />
      </Secao>

      <Secao titulo="Responsáveis e área">
        <Campo label="Área / departamento" valor={l.dpto} />
        <Campo label="Responsável pelo prazo" valor={l.respPrazo} />
        <Campo label="Quem entregou" valor={l.respEntrega} />
      </Secao>

      <Secao titulo="Origem">
        <Campo label="EntID no Acessórias" valor={l.entId} mono />
        <Campo label="Espelhado em" valor={dh(l.syncedAt)} />
      </Secao>

      <p className="text-[11px] text-muted-foreground">
        Estes são todos os campos que a API do Acessórias devolve para uma entrega.
        O log por destinatário do e-mail existe só na tela deles e não é exposto pela API.
      </p>
    </>
  )
}

interface EventoRastreio {
  quando: string | null
  titulo: string
  detalhe?: string | null
  cor: ColorName
  icone: typeof Send
  /** Etapa ainda não aconteceu (ex.: cliente abrir a guia). */
  aguardando?: boolean
}

/**
 * A linha do tempo que dá para montar com o que a API do Acessórias devolve:
 * finalização (quem e quando), a última movimentação e a leitura da guia.
 *
 * O log de envio por destinatário e os comentários NÃO vêm pela API (conferido
 * em 30/09 contra /deliveries com attachments e config) — ficam só na tela do
 * Acessórias, e o rodapé do painel diz isso em vez de fingir completude.
 */
function eventosDoRastreio(l: LinhaEntrega): EventoRastreio[] {
  const ev: EventoRastreio[] = []
  if (!l.entregue) {
    ev.push({
      quando: null,
      titulo: l.dispensada ? 'Dispensada' : 'Aguardando a entrega pelo escritório',
      detalhe: l.dispensada ? l.status : (l.respPrazo ? `Responsável: ${l.respPrazo}` : null),
      cor: l.dispensada ? 'slate' : 'amber',
      icone: Clock,
      aguardando: !l.dispensada,
    })
    return ev
  }

  ev.push({
    quando: l.dtFinalizacao ?? l.dtEntrega,
    titulo: `Entregue${l.respEntrega ? ` por ${l.respEntrega}` : ''}`,
    detalhe: l.status ? `Status: ${l.status}` : null,
    cor: 'emerald',
    icone: CheckCircle2,
  })

  // EntLastDH é "a última alteração" — depois da finalização, costuma ser o
  // envio (agendado) da guia ou a abertura pelo cliente. Só entra se for
  // posterior à finalização, senão repetiria o evento acima.
  const depois = l.lidaEm && (!l.dtFinalizacao || new Date(l.lidaEm) > new Date(l.dtFinalizacao))
  if (l.lida === true) {
    ev.push({
      quando: depois ? l.lidaEm : null,
      titulo: 'Cliente abriu a guia',
      detalhe: l.guiaLida,
      cor: 'emerald',
      icone: MailOpen,
    })
  } else if (l.lida === false) {
    if (depois) {
      ev.push({
        quando: l.lidaEm,
        titulo: 'Última movimentação no Acessórias',
        detalhe: 'Normalmente o envio da guia ao cliente',
        cor: 'sky',
        icone: Send,
      })
    }
    ev.push({
      quando: null,
      titulo: 'Aguardando o cliente abrir a guia',
      detalhe: l.guiaLida,
      cor: l.multa ? 'rose' : 'amber',
      icone: MailWarning,
      aguardando: true,
    })
  }
  return ev
}

function Rastreio({ linha }: { linha: LinhaEntrega }) {
  const eventos = eventosDoRastreio(linha)
  const dh = (v: string) => new Date(v).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-foreground">Rastreio da entrega</p>
      <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
        <ol className="relative space-y-3">
          {eventos.map((e, i) => {
            const Icone = e.icone
            return (
              <li key={i} className="relative flex gap-2.5">
                {/* Trilho entre os marcadores — some no último. */}
                {i < eventos.length - 1 && (
                  <span className="absolute left-[9px] top-5 h-[calc(100%-4px)] w-px bg-border" aria-hidden />
                )}
                <span className={cn(
                  'relative z-[1] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full',
                  e.aguardando ? 'border border-dashed border-border bg-card' : DOT[e.cor],
                )}>
                  <Icone className={cn('h-3 w-3', e.aguardando ? TEXT[e.cor] : 'text-white')} />
                </span>
                <div className="min-w-0 pb-0.5">
                  <p className={cn('text-[12.5px] font-medium leading-tight', e.aguardando && TEXT[e.cor])}>{e.titulo}</p>
                  {e.quando && <p className="text-[11px] tabular-nums text-muted-foreground">{dh(e.quando)}</p>}
                  {e.detalhe && <p className="text-[11px] text-muted-foreground">{e.detalhe}</p>}
                </div>
              </li>
            )
          })}
        </ol>
        <ContatosDoCliente clienteId={linha.clienteId} />
      </div>
    </div>
  )
}

interface Contato { nome: string; email: string | null; celular: string | null }

/**
 * Contatos da empresa no Acessórias, dentro do rastreio. A API não diz quais
 * receberam ESTA guia (cada contato recebe só alguns departamentos, e isso não
 * é exposto) — então o bloco se apresenta como "quem pode ter recebido".
 */
function ContatosDoCliente({ clienteId }: { clienteId: string }) {
  const [estado, setEstado] = useState<{ carregando: boolean; contatos: Contato[]; erro: string | null }>(
    { carregando: true, contatos: [], erro: null },
  )

  useEffect(() => {
    let vivo = true
    setEstado({ carregando: true, contatos: [], erro: null })
    ;(trpc.acessorias as any).contatosDoCliente
      .query({ clienteId })
      .then((r: { ok: boolean; contatos: Contato[]; erro?: string }) => {
        if (vivo) setEstado({ carregando: false, contatos: r.contatos ?? [], erro: r.ok ? null : (r.erro ?? 'Falha ao consultar.') })
      })
      .catch(() => vivo && setEstado({ carregando: false, contatos: [], erro: 'Falha ao consultar o Acessórias.' }))
    return () => { vivo = false }
  }, [clienteId])

  return (
    <div className="mt-3 border-t border-border/60 pt-2.5">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        Contatos do cliente no Acessórias
      </p>
      <p className="mb-1.5 text-[10.5px] leading-snug text-muted-foreground">
        Quem pode ter recebido a guia. O Acessórias não informa pela API quais destes receberam este envio.
      </p>
      {estado.carregando ? (
        <p className="flex items-center gap-1.5 py-1 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />Consultando o Acessórias…
        </p>
      ) : estado.erro ? (
        <p className="py-1 text-[11px] text-muted-foreground">{estado.erro}</p>
      ) : estado.contatos.length === 0 ? (
        <p className="py-1 text-[11px] text-muted-foreground">Nenhum contato cadastrado no Acessórias.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {estado.contatos.map((c, i) => (
            <li key={`${c.nome}-${i}`} className="py-1.5">
              <p className="truncate text-[12px] font-medium" title={c.nome}>{c.nome}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline">
                    <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{c.email}</span>
                  </a>
                )}
                {c.celular && (
                  <a href={`tel:${c.celular.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                    <Phone className="h-3 w-3 shrink-0" />{c.celular}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
        O log de envio por destinatário e os comentários ficam só na tela do Acessórias.
      </p>
    </div>
  )
}

/**
 * O painel lateral inteiro: cabeçalho da obrigação, reclassificação de multa e
 * os campos. `podeReclassificar` vem do backend (flag no payload) — a regra de
 * quem pode mora lá, e o servidor barra de novo na mutation.
 */
export function PainelLeituraEntrega({ linha, podeReclassificar, mostrarCliente, onReclassificada }: {
  linha: LinhaEntrega
  podeReclassificar: boolean
  /** No detalhe dos indicadores a lista mistura clientes — o painel diz qual é. */
  mostrarCliente?: boolean
  onReclassificada: (r: MultaReclassificada) => void
}) {
  const [salvando, setSalvando] = useState(false)

  const reclassificar = async (multa: boolean) => {
    setSalvando(true)
    try {
      const r: MultaReclassificada =
        await (trpc.acessorias as any).reclassificarMulta.mutate({ entregaId: linha.id, multa })
      onReclassificada(r)
      alerts.toast(!r.multaReclassificada
        ? 'Multa volta a seguir o Acessórias em todas as ocorrências'
        : multa ? 'Sujeita a multa em todas as ocorrências' : 'Não sujeita a multa em todas as ocorrências')
    } catch (e) {
      alerts.error((e as Error).message || 'Não foi possível reclassificar a multa.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div key={linha.id} className="space-y-4 p-4" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
        <div>
          <p className="text-[14px] font-semibold leading-snug">{linha.obrigacao}</p>
          {mostrarCliente && (
            <p className="mt-0.5 truncate text-[12px]" title={linha.clienteNome}>
              #{linha.clienteCode} — {linha.clienteNome}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {fmtComp(linha.competencia)}{linha.dpto ? ` · ${linha.dpto}` : ''}
          </p>
          {naoLidaComMulta(linha) && (
            <span className={cn('mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium', BADGE.rose)}>
              <AlertTriangle className="h-3 w-3" />Não lida · sujeita a multa
            </span>
          )}
        </div>

        <VencimentoGuiaDestaque linha={linha} />

        <GuiaDaEntrega linha={linha} />

        {/* Reclassificação da multa — vale para esta obrigação no cliente, em
            todas as competências. */}
        <div>
          <p className="mb-1 text-[13px] font-semibold text-foreground">Multa</p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px]">Sujeita a multa</p>
              <p className="text-[11px] text-muted-foreground">
                {linha.multaReclassificada
                  ? `Reclassificada pelo escritório para todos os clientes${linha.multaAcessorias !== null ? ` · no Acessórias: ${linha.multaAcessorias ? 'Sim' : 'Não'}` : ''}`
                  : 'Conforme o Acessórias'}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span: o Radix não dispara tooltip em controle desabilitado */}
                <span className="inline-flex shrink-0">
                  <Switch
                    checked={linha.multa}
                    disabled={!podeReclassificar || salvando}
                    onCheckedChange={(v: boolean) => reclassificar(v)}
                    aria-label="Sujeita a multa"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                {podeReclassificar
                  ? 'Vale para todas as ocorrências desta obrigação — todos os clientes e competências, inclusive nas próximas sincronizações. Voltar ao valor do Acessórias desfaz para todas.'
                  : 'Só administradores e diretoria podem reclassificar a multa.'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Rastreio linha={linha} />

        <DetalheEntregaConteudo linha={linha} />
      </div>
    </TooltipProvider>
  )
}
