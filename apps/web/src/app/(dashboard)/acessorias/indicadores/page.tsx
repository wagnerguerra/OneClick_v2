'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart3, Loader2, RefreshCw, Users, Link2Off, AlertTriangle, X, Maximize2, Minimize2, ExternalLink,
} from 'lucide-react'
import {
  Button, Card, cn, Switch, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { PERIODOS, filtroDe, rotuloCompetencia, competenciasDisponiveis, type Recorte } from '../_components/periodos'
import { AbasAcessorias } from '../_components/abas-acessorias'
import { BadgeEntrega } from '../_components/badge-entrega'
import {
  PainelLeituraEntrega, linkNoAcessorias, aplicarReclassificacao, VencimentoGuiaCelula,
  VisualizadorGuia, useGuiaAberta, type LinhaEntrega,
} from '../_components/painel-leitura-entrega'
import { BADGE, TEXT } from '@/lib/color-styles'

const MODULE_COLOR = 'var(--mod-administrativo, #0ea5e9)'

/** Preferência de régua, por navegador — mesmo padrão da agenda e da caixa postal. */
const LS_REGUA = 'acessorias-indicadores-regua'

interface Cartao {
  chave: string
  titulo: string
  subtitulo: string | null
  userId: string | null
  imagem: string | null
  pendenteNoPrazo: number
  pendenteAtrasado: number
  pendenteComMulta: number
  entregueNoPrazo: number
  entregueComAtraso: number
  entregueComMulta: number
  entregueNaoLidaComMulta: number
}
interface Pendente {
  id: string
  obrigacao: string
  competencia: string | null
  vencimento: string | null
  atrasada: boolean
  multa: boolean
  dpto: string | null
  clienteId: string
  clienteCode: number
  clienteNome: string
}
interface Retorno {
  escopo: 'PROPRIO' | 'COLABORADORES' | 'AREAS' | 'GERAL'
  cartoes: Cartao[]
  total?: Omit<Cartao, 'chave' | 'titulo' | 'subtitulo' | 'userId' | 'imagem'>
  pendentes: Pendente[]
  semVinculo: boolean
  areaNome: string | null
  ocultosInativos?: number
  cobertura?: { de: string | null; ate: string | null }
  /** Obrigações que o time declarou não acompanhar — explicam a diferença
   *  contra o e-mail semanal do Acessórias, que conta a carteira inteira. */
  foraPorRegra?: { nomes: string[]; ocorrencias: number }
}
type Medida = (typeof MEDIDAS)[number]['campo']

/**
 * As seis medidas, na ordem em que se lê: pendências antes de entregas.
 *
 * O `hex` é o mesmo tom da classe de texto e serve à rosca em volta do avatar —
 * uma cor só por medida, então a fatia do gráfico e o número embaixo dizem
 * visivelmente a mesma coisa.
 */
const MEDIDAS = [
  // "Em aberto e no prazo" é a única das seis que não pede ação: fica em
  // cinza, para o olho ir direto ao que precisa de atenção.
  { campo: 'pendenteNoPrazo',   label: 'Em aberto e no prazo',  ajuda: 'Ainda não entregues, com o prazo legal à frente.',
    cor: TEXT.slate,    bg: 'bg-slate-100 dark:bg-slate-900/30',   hex: '#475569' },
  { campo: 'pendenteAtrasado',  label: 'Em aberto e em atraso', ajuda: 'Ainda não entregues, com o prazo legal já passado.',
    cor: TEXT.amber,    bg: 'bg-amber-100 dark:bg-amber-900/30',   hex: '#d97706' },
  { campo: 'pendenteComMulta',  label: 'Em aberto e passível de multa', ajuda: 'Das que estão em atraso, as que geram multa. É a exposição de hoje.',
    cor: TEXT.rose,      bg: 'bg-rose-100 dark:bg-rose-900/30',     hex: '#e11d48' },
  { campo: 'entregueNoPrazo',   label: 'Entregues no prazo',   ajuda: 'Entregues dentro do prazo legal — inclui quem passou do prazo técnico, que o Acessórias considera em dia.',
    cor: TEXT.emerald, bg: 'bg-emerald-100 dark:bg-emerald-900/30', hex: '#059669' },
  { campo: 'entregueComAtraso', label: 'Entregues com atraso', ajuda: 'Entregues depois do prazo legal, junto ao órgão.',
    cor: TEXT.violet,  bg: 'bg-violet-100 dark:bg-violet-900/30', hex: '#7c3aed' },
  { campo: 'entregueComMulta',  label: 'Entregues com multa',  ajuda: 'Das entregues com atraso, as que geram multa.',
    cor: 'text-rose-700 dark:text-rose-300',      bg: 'bg-rose-100 dark:bg-rose-900/30',     hex: '#be123c' },
  // Recorte das entregues (no prazo ou não): fica FORA da rosca e do total,
  // senão a mesma entrega contaria duas vezes.
  { campo: 'entregueNaoLidaComMulta', label: 'Entregues, não abertas e passíveis de multa',
    ajuda: 'Guias entregues que o cliente ainda não abriu, em obrigação sujeita a multa. Cobre a leitura: se não pagar, a multa vem.',
    cor: TEXT.orange, bg: 'bg-orange-100 dark:bg-orange-900/30', hex: '#ea580c', recorte: true },
] as const

/** As medidas que particionam o período — as que entram na rosca e no total. */
const MEDIDAS_ROSCA = MEDIDAS.filter((m) => !('recorte' in m))

const TITULO_ESCOPO: Record<Retorno['escopo'], { titulo: string; nota: string }> = {
  PROPRIO:       { titulo: 'Minhas obrigações',   nota: 'o que está sob a sua responsabilidade' },
  COLABORADORES: { titulo: 'Painel da área',      nota: 'por colaborador' },
  AREAS:         { titulo: 'Painel por área',     nota: 'todas as áreas' },
  GERAL:         { titulo: 'Painel geral',        nota: 'visão da empresa, por área' },
}

/** Sem acento e em minúsculo — filtrar por "obrigacao" tem de achar "obrigação". */
const semAcento = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** "1 obrigação" / "12 obrigações" — sem o "(ões)" que economiza no lugar errado. */
const plural = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`

const fmtData = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/** Competência no formato do Acessórias: "Jun/2026". */
const fmtComp = (v: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  const m = d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${m.charAt(0).toUpperCase()}${m.slice(1)}/${d.getUTCFullYear()}`
}

export default function IndicadoresPage() {
  const [dados, setDados] = useState<Retorno | null>(null)
  const [loading, setLoading] = useState(true)
  const [recorte, setRecorte] = useState<Recorte>('mes')
  const [detalhe, setDetalhe] = useState<{ cartao: Cartao; medida: Medida } | null>(null)
  /**
   * Contra qual prazo medir. O legal é o do órgão — a exposição do cliente. O
   * técnico é o acordado com ele — o compromisso do escritório. Entre os dois
   * fica a faixa do "Ent. PzTéc": entrega que o órgão aceita e o contrato não.
   */
  const [regua, setRegua] = useState<'legal' | 'tecnico'>('legal')
  // A leitura acontece no efeito, não no estado inicial: no primeiro render o
  // servidor não tem localStorage, e divergir dele quebra a hidratação.
  const [preferenciaLida, setPreferenciaLida] = useState(false)

  useEffect(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(LS_REGUA) : null
    if (v === 'tecnico' || v === 'legal') setRegua(v)
    setPreferenciaLida(true)
  }, [])

  const trocarRegua = (nova: 'legal' | 'tecnico') => {
    setRegua(nova)
    try { window.localStorage.setItem(LS_REGUA, nova) } catch { /* modo privado */ }
  }

  const carregar = useCallback(() => {
    // Espera a preferência para não buscar duas vezes: com a régua padrão e
    // logo em seguida com a escolhida.
    if (!preferenciaLida) return
    setLoading(true)
    ;(trpc.acessorias as any).indicadores.query({ ...filtroDe(recorte), regua })
      .then((d: Retorno) => setDados(d))
      .catch(() => setDados(null))
      .finally(() => setLoading(false))
  }, [recorte, regua, preferenciaLida])

  useEffect(() => { carregar() }, [carregar])

  const cab = dados ? TITULO_ESCOPO[dados.escopo] : TITULO_ESCOPO.PROPRIO

  const tipoGrupo: 'pessoa' | 'area' = dados?.escopo === 'COLABORADORES' ? 'pessoa' : 'area'

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
            title="Prazo legal é o do órgão — o que expõe o cliente. Prazo técnico é o acordado com ele — o compromisso do escritório.">
            <span className={cn('text-xs', regua === 'legal' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              Legal
            </span>
            <Switch checked={regua === 'tecnico'} onCheckedChange={(v) => trocarRegua(v ? 'tecnico' : 'legal')} />
            <span className={cn('text-xs', regua === 'tecnico' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              Técnico
            </span>
          </label>
          {/* Um campo só, com as duas formas de recortar o tempo. Separados,
              dava para combinar recortes que se anulam e receber tela vazia. */}
          <Select value={recorte} onValueChange={(v) => setRecorte(v as Recorte)}>
            <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Recorte" /></SelectTrigger>
            <SelectContent>
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Por vencimento
              </p>
              {PERIODOS.map((p) => <SelectItem key={p.valor} value={p.valor}>{p.label}</SelectItem>)}
              <p className="mt-1 border-t border-border px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Por competência
              </p>
              {competenciasDisponiveis().map((c) => (
                <SelectItem key={c} value={`comp:${c}`}>{rotuloCompetencia(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar
          </Button>
      </>}>
        <h1 className="truncate">Acessórias</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Administrativo</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Acessórias</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Indicadores</span>
          <span
            className="ml-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/70"
            title={`Indicadores das obrigações — ${cab.nota}`}
          >
            {cab.titulo}{dados?.escopo === 'COLABORADORES' && dados.areaNome ? ` · ${dados.areaNome}` : ''}
          </span>
        </p>
      </PageHeaderBar>

      <AbasAcessorias />

      <AvisoCobertura dados={dados} recorte={recorte} />

      {loading && !dados ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : dados?.semVinculo ? (
        <SemVinculo escopo={dados.escopo} />
      ) : !dados || dados.cartoes.length === 0 ? (
        <Vazio />
      ) : (
        <>
          {dados.total && dados.escopo === 'GERAL' && (
            <CartaoIndicador
              cartao={{
                chave: '__total__', titulo: 'Total da empresa',
                subtitulo: plural(dados.cartoes.length, 'área', 'áreas'), userId: null, imagem: null, ...dados.total,
              }}
              destaque
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dados.cartoes.map((c) => (
              <CartaoIndicador
                key={c.chave}
                cartao={c}
                onAbrir={(medida) => setDetalhe({ cartao: c, medida })}
              />
            ))}
          </div>

          {/* O que a regra deixou de fora — sem esta linha o total nao fecha com
              o e-mail semanal do Acessorias e ninguem sabe por que. */}
          {!!dados.foraPorRegra?.nomes?.length && (
            <p className="text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {dados.foraPorRegra.nomes.length === 1 ? '1 obrigação fora do painel' : `${dados.foraPorRegra.nomes.length} obrigações fora do painel`}
              </span>{' '}
              por regra do time: {dados.foraPorRegra.nomes.join(', ')}.
              {dados.foraPorRegra.ocorrencias > 0 && ` São ~${dados.foraPorRegra.ocorrencias} na carteira — por isso o total daqui fica abaixo do e-mail semanal do Acessórias, que conta tudo.`}
            </p>
          )}

          {!!dados.ocultosInativos && (
            <p className="text-[12px] text-muted-foreground">
              {plural(dados.ocultosInativos, 'responsável', 'responsáveis')}{' '}
              fora do painel por não estar{dados.ocultosInativos === 1 ? '' : 'em'} mais ativo{dados.ocultosInativos === 1 ? '' : 's'} no OneClick.
            </p>
          )}

          {dados.escopo === 'PROPRIO' && (
            <ListaPendentes pendentes={dados.pendentes} />
          )}
        </>
      )}

      {detalhe && (
        <DetalheMedidaModal
          cartao={detalhe.cartao}
          medida={detalhe.medida}
          tipo={tipoGrupo}
          recorte={recorte}
          regua={regua}
          onMultaAlterada={carregar}
          onClose={() => setDetalhe(null)}
        />
      )}
    </div>
  )
}

/**
 * Rosca em volta do avatar: cada fatia é uma das seis medidas, na mesma cor do
 * número correspondente.
 *
 * Desenhada com um único círculo SVG e `stroke-dasharray` — um arco por fatia,
 * deslocado pelo que já foi desenhado. Evita trazer uma biblioteca de gráficos
 * para um anel de seis fatias.
 */
function RoscaSituacao({ cartao, tamanho = 96, destaque }: {
  cartao: Cartao; tamanho?: number; destaque?: Medida | null
}) {
  const espessura = 9
  // O raio reserva a espessura MÁXIMA: a fatia em destaque engorda, e sem essa
  // folga ela seria cortada na borda do desenho.
  const espessuraMax = espessura + 6
  const raio = (tamanho - espessuraMax) / 2
  const circunferencia = 2 * Math.PI * raio
  const total = MEDIDAS_ROSCA.reduce((soma, m) => soma + cartao[m.campo], 0)

  let percorrido = 0
  const fatias = total === 0 ? [] : MEDIDAS_ROSCA.flatMap((m) => {
    const valor = cartao[m.campo]
    if (valor === 0) return []
    const comprimento = (valor / total) * circunferencia
    const fatia = {
      campo: m.campo, cor: m.hex, comprimento, deslocamento: -percorrido,
      label: m.label, valor, fracao: valor / total,
    }
    percorrido += comprimento
    return [fatia]
  })

  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90">
        <circle
          cx={tamanho / 2} cy={tamanho / 2} r={raio}
          fill="none" strokeWidth={espessura}
          className="stroke-muted"
        />
        {fatias.map((f) => {
          const ativa = destaque === f.campo
          return (
            <circle
              key={f.campo}
              cx={tamanho / 2} cy={tamanho / 2} r={raio}
              fill="none" stroke={f.cor}
              strokeWidth={ativa ? espessuraMax : espessura}
              strokeDasharray={`${f.comprimento} ${circunferencia - f.comprimento}`}
              strokeDashoffset={f.deslocamento}
              // As demais recuam para a fatia em foco se destacar sem precisar
              // de outra cor — a paleta já está toda ocupada pelas seis medidas.
              opacity={destaque && !ativa ? 0.3 : 1}
              className="transition-all duration-150"
            >
              <title>{`${f.label}: ${f.valor}`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ padding: espessuraMax + 3 }}>
        <Avatar cartao={cartao} />
      </div>
      {/* O percentual da fatia em foco, AO LADO do gráfico: embaixo ele ficava
          coberto pelo nome, que vem depois no fluxo e pinta por cima. É a
          leitura que o tamanho do arco sozinho não entrega. */}
      {destaque && (() => {
        const f = fatias.find((x) => x.campo === destaque)
        if (!f) return null
        return (
          <span
            className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[12px] font-semibold tabular-nums"
            style={{ color: f.cor, backgroundColor: `color-mix(in srgb, ${f.cor} 14%, transparent)` }}
          >
            {Math.round(f.fracao * 100)}%
          </span>
        )
      })()}
    </div>
  )
}

function Avatar({ cartao }: { cartao: Cartao }) {
  const iniciais = cartao.titulo.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  if (cartao.imagem) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cartao.imagem} alt="" className="h-full w-full rounded-full object-cover" />
  }
  return (
    <div className="flex h-full w-full items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: MODULE_COLOR }}>
      {iniciais || '—'}
    </div>
  )
}

/**
 * Avisa quando o período escolhido vai além do que foi sincronizado.
 *
 * A sincronização recorta a API pelo prazo TÉCNICO e o painel filtra pelo
 * LEGAL, então cobrir julho não significa ter tudo que vence em julho. Sem o
 * aviso, um painel meio vazio passa por retrato fiel — foi o que fez uma
 * carteira inteira parecer ter só uma área.
 */
function AvisoCobertura({ dados, recorte }: { dados: Retorno | null; recorte: Recorte }) {
  const ate = dados?.cobertura?.ate
  if (!ate) return null
  const alvo = filtroDe(recorte)
  if (!alvo.ate && !alvo.competencia) return null

  const fimPedido = alvo.competencia
    ? `${alvo.competencia}-28`   // basta cair dentro do mês pedido
    : alvo.ate!
  const fimCoberto = new Date(ate).toISOString().slice(0, 10)
  if (fimPedido <= fimCoberto) return null

  return (
    <div className={cn('rounded-lg border px-4 py-2.5 text-[13px]', BADGE.amber)}>
      A sincronização de entregas cobre até <b>{new Date(ate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</b>,
      e o período escolhido vai além disso. O que aparece abaixo está incompleto — rode a
      sincronização para o período desejado na aba <b>Integração</b>.
    </div>
  )
}

function CartaoIndicador({ cartao, destaque, onAbrir }: {
  cartao: Cartao; destaque?: boolean; onAbrir?: (medida: Medida) => void
}) {
  const total = MEDIDAS_ROSCA.reduce((soma, m) => soma + cartao[m.campo], 0)
  const [emFoco, setEmFoco] = useState<Medida | null>(null)
  return (
    <Card className={cn('overflow-hidden', destaque && 'border-current')} style={destaque ? { borderColor: MODULE_COLOR } : undefined}>
      <div className="flex flex-col items-center gap-2 border-b border-border/60 bg-muted/20 px-4 pb-5 pt-4">
        <RoscaSituacao cartao={cartao} tamanho={destaque ? 76 : 96} destaque={emFoco} />
        <div className="min-w-0 text-center">
          <p className="truncate text-[13px] font-semibold" title={cartao.titulo}>{cartao.titulo}</p>
          {cartao.subtitulo && <p className="truncate text-[11px] text-muted-foreground">{cartao.subtitulo}</p>}
          <p className="text-[11px] text-muted-foreground">{plural(total, 'obrigação', 'obrigações')} no período</p>
        </div>
      </div>
      <div className="divide-y divide-border/40">
        {MEDIDAS.map((m) => {
          const valor = cartao[m.campo]
          const clicavel = valor > 0 && !!onAbrir
          return (
            <button
              key={m.campo}
              type="button"
              disabled={!clicavel}
              onClick={clicavel ? () => onAbrir?.(m.campo) : undefined}
              onMouseEnter={() => valor > 0 && !('recorte' in m) && setEmFoco(m.campo)}
              onMouseLeave={() => setEmFoco(null)}
              onFocus={() => valor > 0 && !('recorte' in m) && setEmFoco(m.campo)}
              onBlur={() => setEmFoco(null)}
              title={clicavel ? `${m.ajuda} Clique para ver a lista.` : m.ajuda}
              className={cn(
                'flex w-full items-center justify-between px-4 py-1.5 text-left transition-colors',
                clicavel ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
              )}
            >
              <span className={cn('text-[12px]', m.cor)}>{m.label}</span>
              <span className={cn(
                'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold tabular-nums',
                valor > 0 ? cn(m.bg, m.cor) : 'text-muted-foreground',
              )}>
                {valor}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/** Campo de filtro de uma coluna — discreto até receber conteúdo. */
function FiltroColuna({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder="filtrar…"
      className={cn(
        'w-full rounded px-1.5 py-0.5 text-[11px] font-normal normal-case tracking-normal',
        'placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1',
      )}
      style={valor ? { borderColor: MODULE_COLOR } : undefined}
    />
  )
}

/** A lista por trás de um número do cartão. */
function DetalheMedidaModal({ cartao, medida, tipo, recorte, regua, onMultaAlterada, onClose }: {
  cartao: Cartao; medida: Medida; tipo: 'pessoa' | 'area'; recorte: Recorte
  regua: 'legal' | 'tecnico'
  /** Recarrega os cartões — chamado ao fechar, se alguma multa mudou. */
  onMultaAlterada: () => void
  onClose: () => void
}) {
  const [linhas, setLinhas] = useState<LinhaEntrega[]>([])
  const [carregando, setCarregando] = useState(true)
  // Filtro por coluna. A lista inteira já está aqui, então filtrar é imediato —
  // não vale ida ao servidor para uma tabela que cabe na memória.
  const [filtros, setFiltros] = useState({ obrigacao: '', cliente: '', responsavel: '', competencia: '' })
  // Painel de leitura: a obrigação clicada abre ao lado, sem fechar a lista.
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [expandido, setExpandido] = useState(false)
  // Flags do backend: quem pode reclassificar e o atalho para o Acessórias.
  const [podeReclassificar, setPodeReclassificar] = useState(false)
  const [urlTemplate, setUrlTemplate] = useState<string | null>(null)
  const [multaAlterada, setMultaAlterada] = useState(false)
  const info = MEDIDAS.find((m) => m.campo === medida)!

  const fechar = () => {
    if (multaAlterada) onMultaAlterada()
    onClose()
  }

  useEffect(() => {
    setCarregando(true)
    ;(trpc.acessorias as any).indicadoresDetalhe
      .query({ ...filtroDe(recorte), regua, grupo: cartao.titulo, tipo, medida })
      .then((d: { linhas: LinhaEntrega[]; podeReclassificarMulta: boolean; urlEntregaTemplate: string | null }) => {
        const ls = d?.linhas || []
        setLinhas(ls)
        setPodeReclassificar(!!d?.podeReclassificarMulta)
        setUrlTemplate(d?.urlEntregaTemplate ?? null)
        // Abre já com a primeira selecionada: o painel nunca começa vazio.
        setSelecionadaId(ls[0]?.id ?? null)
      })
      .catch(() => setLinhas([]))
      .finally(() => setCarregando(false))
  }, [cartao.titulo, medida, tipo, recorte, regua])

  const casa = (valor: string | null, filtro: string) =>
    !filtro.trim() || semAcento(String(valor ?? '')).includes(semAcento(filtro.trim()))

  const visiveis = linhas.filter((l) =>
    casa(l.obrigacao, filtros.obrigacao)
    && casa(`#${l.clienteCode} ${l.clienteNome}`, filtros.cliente)
    && casa(l.responsavel, filtros.responsavel)
    && casa(fmtComp(l.competencia), filtros.competencia))

  // O painel só mostra o que está na lista: se o filtro esconder a selecionada,
  // a seleção passa para a primeira visível. Sem isso o painel ficava com a
  // obrigação de outro cliente enquanto a lista mostrava só a filtrada.
  const selecionada = visiveis.find((l) => l.id === selecionadaId) ?? visiveis[0] ?? null
  // Guia exibida no painel à direita do de leitura (fecha ao trocar de obrigação).
  const [guiaAberta, setGuiaAberta] = useGuiaAberta(selecionada?.id)
  const href = selecionada ? linkNoAcessorias(selecionada, urlTemplate) : null

  const limpar = () => setFiltros({ obrigacao: '', cliente: '', responsavel: '', competencia: '' })
  const filtrando = Object.values(filtros).some((v) => v.trim())

  // Com o painel de leitura ao lado a tabela perde ~400px: no tamanho normal
  // ficam as colunas que identificam a linha e o prazo da régua ativa;
  // expandido, volta tudo.
  const colResponsavel = tipo === 'area' && expandido
  const colCompetencia = expandido
  const colTecnico = expandido || regua === 'tecnico'
  const colLegal = expandido || regua === 'legal'

  return (
    <TooltipProvider delayDuration={200}>
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent
        className={cn(
          'outline-none transition-[max-width,height] duration-200',
          expandido ? 'flex h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col' : 'max-w-6xl',
        )}
        // Por padrão o Radix foca o primeiro botão ao abrir — o Expandir, que
        // vem antes do X — e o Tooltip dele abre com o foco. O foco vai para o
        // próprio diálogo (tabIndex -1): continua preso nele, sem acender nada.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
      >
        {/* Expandir/contrair — ao lado do X do Dialog, no mesmo estilo. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setExpandido((v) => !v)}
              aria-label={expandido ? 'Contrair' : 'Expandir'}
              className="absolute right-11 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md opacity-60 transition-all duration-200 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            >
              {expandido ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{expandido ? 'Contrair' : 'Expandir'}</TooltipContent>
        </Tooltip>
        <DialogHeaderIcon icon={BarChart3} color="sky">
          <DialogTitle>{info.label}</DialogTitle>
          <DialogDescription>
            {cartao.titulo}{cartao.subtitulo ? ` · ${cartao.subtitulo}` : ''}
            {!carregando && (
              <> · {filtrando ? `${visiveis.length} de ${linhas.length}` : plural(linhas.length, 'registro', 'registros')}</>
            )}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className={cn('p-0', expandido && 'min-h-0 flex-1')}>
          <div className={cn('flex flex-col md:flex-row', expandido ? 'h-full' : 'max-h-[65vh]')}>
          <div className="nice-scrollbar min-w-0 flex-1 overflow-y-auto">
          {carregando ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma obrigação aqui.</p>
          ) : (
            <table className="w-full table-fixed border-collapse text-sm">
              {/* Uma linha por registro: a marca de multa saiu de baixo do nome,
                  onde empurrava a linha para duas alturas, e virou coluna
                  própria na frente. */}
              {/* O fundo vai no <th>: <thead> com position:sticky não pinta
                  background de forma confiável, e a translucidez deixava as
                  linhas passarem por trás ao rolar. */}
              <thead className="sticky top-0 z-10 [&_th]:bg-muted">
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-[40px] px-2 py-2 text-center" title="Passível de multa">
                    <span className="sr-only">Passível de multa</span>
                    <AlertTriangle className="mx-auto h-3.5 w-3.5" />
                  </th>
                  <th className="px-3 py-2 text-left">Obrigação</th>
                  <th className="hidden w-[30%] px-3 py-2 text-left md:table-cell">Cliente</th>
                  {/* Só na visão por área: agrupado por pessoa, o responsável já
                      é o próprio cartão e a coluna repetiria o cabeçalho. */}
                  {colResponsavel && (
                    <th className="hidden w-[170px] px-3 py-2 text-left lg:table-cell">Responsável</th>
                  )}
                  {colCompetencia && <th className="hidden w-[100px] px-3 py-2 text-left xl:table-cell">Competência</th>}
                  {/* Os dois prazos lado a lado. O da régua ativa vai em
                      destaque: é ele que classificou a linha, e sem a marca as
                      duas colunas pareceriam igualmente decisivas. */}
                  {colTecnico && (
                    <th className={cn('w-[104px] px-3 py-2 text-left', regua === 'tecnico' && 'text-foreground')}>
                      Prazo técnico
                    </th>
                  )}
                  {colLegal && (
                    <th className={cn('w-[104px] px-3 py-2 text-left', regua === 'legal' && 'text-foreground')}>
                      Prazo legal
                    </th>
                  )}
                  <th className="w-[110px] px-3 py-2 text-left">Venc. guia</th>
                  <th className="hidden w-[112px] px-3 py-2 text-left sm:table-cell">Entrega</th>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5">
                    {filtrando && (
                      <button type="button" onClick={limpar} title="Limpar filtros"
                        className="mx-auto flex text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </th>
                  <th className="px-2 py-1.5">
                    <FiltroColuna valor={filtros.obrigacao} onChange={(v) => setFiltros((f) => ({ ...f, obrigacao: v }))} />
                  </th>
                  <th className="hidden px-2 py-1.5 md:table-cell">
                    <FiltroColuna valor={filtros.cliente} onChange={(v) => setFiltros((f) => ({ ...f, cliente: v }))} />
                  </th>
                  {colResponsavel && (
                    <th className="hidden px-2 py-1.5 lg:table-cell">
                      <FiltroColuna valor={filtros.responsavel} onChange={(v) => setFiltros((f) => ({ ...f, responsavel: v }))} />
                    </th>
                  )}
                  {colCompetencia && (
                    <th className="hidden px-2 py-1.5 xl:table-cell">
                      <FiltroColuna valor={filtros.competencia} onChange={(v) => setFiltros((f) => ({ ...f, competencia: v }))} />
                    </th>
                  )}
                  {colTecnico && <th className="px-2 py-1.5" />}
                  {colLegal && <th className="px-2 py-1.5" />}
                  <th className="px-2 py-1.5" />
                  <th className="hidden px-2 py-1.5 sm:table-cell" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {visiveis.map((l) => {
                  const ativa = l.id === selecionada?.id
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setSelecionadaId(l.id)}
                      aria-selected={ativa}
                      className={cn(
                        'cursor-pointer transition-colors',
                        // Selecionada: fundo suave e filete à esquerda, como item ativo de lista.
                        ativa ? 'bg-muted/60 shadow-[inset_3px_0_0_var(--mod-administrativo,#0ea5e9)]' : 'hover:bg-muted/30',
                      )}
                    >
                      <td className="px-2 py-2 text-center">
                        {l.multa && (
                          <span title="Passível de multa" className="inline-flex">
                            <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-400" />
                          </span>
                        )}
                      </td>
                      <td className="truncate px-3 py-2 font-medium" title={l.obrigacao}>{l.obrigacao}</td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        <Link href={`/clientes/${l.clienteId}`} target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate text-[12px] text-muted-foreground hover:underline">
                          #{l.clienteCode} — {l.clienteNome}
                        </Link>
                      </td>
                      {colResponsavel && (
                        <td className="hidden truncate px-3 py-2 text-[12px] text-muted-foreground lg:table-cell"
                          title={l.responsavel ?? ''}>
                          {l.responsavel || '—'}
                        </td>
                      )}
                      {colCompetencia && (
                        <td className="hidden whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground xl:table-cell">{fmtComp(l.competencia)}</td>
                      )}
                      {colTecnico && (
                        <td className={cn('whitespace-nowrap px-3 py-2 text-[12px] tabular-nums',
                          regua === 'tecnico' ? 'font-medium' : 'text-muted-foreground')}>
                          {fmtData(l.prazo)}
                        </td>
                      )}
                      {colLegal && (
                        <td className={cn('whitespace-nowrap px-3 py-2 text-[12px] tabular-nums',
                          regua === 'legal' ? 'font-medium' : 'text-muted-foreground')}>
                          {fmtData(l.vencimento)}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2 text-[12px]"><VencimentoGuiaCelula linha={l} /></td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-[12px] sm:table-cell">
                        <BadgeEntrega entrega={l.dtEntrega} vencimento={regua === 'tecnico' ? l.prazo : l.vencimento} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          </div>

          {/* Painel de leitura — detalhes da obrigação selecionada */}
          <aside className="nice-scrollbar w-full shrink-0 overflow-y-auto border-t border-border bg-muted/10 md:w-[400px] md:border-l md:border-t-0">
            {selecionada ? (
              <PainelLeituraEntrega
                linha={selecionada}
                mostrarCliente
                podeReclassificar={podeReclassificar}
                onReclassificada={(r) => {
                  setLinhas((ls) => aplicarReclassificacao(ls, r))
                  setMultaAlterada(true)
                }}
                guiaAberta={guiaAberta}
                onVerGuia={(g) => {
                  setGuiaAberta(g)
                  // Três colunas não cabem no tamanho normal: a guia expande o modal.
                  if (g) setExpandido(true)
                }}
              />
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {carregando ? '' : 'Selecione uma obrigação para ver os detalhes.'}
              </p>
            )}
          </aside>

          {/* Guia — só existe enquanto uma está aberta */}
          {guiaAberta && <VisualizadorGuia guia={guiaAberta} onFechar={() => setGuiaAberta(null)} />}
          </div>
        </DialogBody>
        <DialogFooter>
          {href && (
            <Button variant="outline" size="sm" asChild>
              <a href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir no Acessórias
              </a>
            </Button>
          )}
          <Button size="sm" onClick={fechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  )
}

function ListaPendentes({ pendentes }: { pendentes: Pendente[] }) {
  if (pendentes.length === 0) {
    return (
      <Card className="py-12 text-center text-sm text-muted-foreground">
        Nenhuma obrigação em aberto no período.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
        <p className="text-[13px] font-semibold">Obrigações em aberto</p>
        <p className="text-[11px] text-muted-foreground">{pendentes.length} no período · a vencer primeiro</p>
      </div>
      <div className="max-h-[560px] overflow-auto nice-scrollbar">
        <table className="w-full table-fixed border-collapse text-sm">
          {/* O fundo vai no <th>: sticky em <thead> não pinta background de
              forma confiável, e a translucidez deixava as linhas passarem por
              trás ao rolar. */}
              <thead className="sticky top-0 z-10 [&_th]:bg-muted">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left">Obrigação</th>
              <th className="hidden w-[28%] px-3 py-2 text-left md:table-cell">Cliente</th>
              <th className="hidden w-[92px] px-3 py-2 text-left lg:table-cell">Área</th>
              <th className="w-[104px] px-3 py-2 text-left">Prazo legal</th>
              <th className="w-[92px] px-3 py-2 text-left">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {pendentes.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <p className="truncate font-medium" title={p.obrigacao}>{p.obrigacao}</p>
                  <span className="text-[11px] text-muted-foreground md:hidden">#{p.clienteCode} — {p.clienteNome}</span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <Link href={`/clientes/${p.clienteId}`} target="_blank"
                    className="block truncate text-[12px] text-muted-foreground hover:underline">
                    #{p.clienteCode} — {p.clienteNome}
                  </Link>
                </td>
                <td className="hidden truncate px-3 py-2 text-[12px] text-muted-foreground lg:table-cell">{p.dpto || '—'}</td>
                <td className="px-3 py-2 text-[12px] tabular-nums">{fmtData(p.vencimento)}</td>
                <td className="px-3 py-2">
                  <span className={cn('text-[12px]', p.atrasada
                    ? cn('font-semibold', TEXT.rose)
                    : 'text-muted-foreground')}>
                    {p.atrasada ? 'em atraso' : 'no prazo'}
                  </span>
                  {p.multa && <span className={cn('ml-1 text-[10px]', TEXT.rose)}>multa</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/**
 * O painel depende do vínculo entre o nome do Acessórias e o nosso cadastro.
 * Sem ele não há como saber o que é "meu" ou "da minha área" — e mostrar tudo
 * seria pior do que mostrar nada.
 */
function SemVinculo({ escopo }: { escopo: Retorno['escopo'] }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 py-20 text-center text-muted-foreground">
      <Link2Off className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium text-foreground">
        {escopo === 'PROPRIO' ? 'Seu usuário ainda não foi ligado ao Acessórias' : 'A sua área ainda não foi ligada a um departamento do Acessórias'}
      </p>
      <p className="max-w-md text-[13px]">
        Os nomes são escritos de formas diferentes nos dois sistemas, então a ligação é feita
        na aba <b>Integração</b> — quem cuida dela pode rodar a conferência e ajustar o que
        ficou de fora.
      </p>
    </Card>
  )
}

function Vazio() {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 py-20 text-center text-muted-foreground">
      <Users className="h-10 w-10 opacity-20" />
      <p className="text-sm">Nada no período escolhido.</p>
      <p className="text-[13px]">Experimente um recorte maior — ou a sincronização de entregas ainda não rodou.</p>
    </Card>
  )
}
