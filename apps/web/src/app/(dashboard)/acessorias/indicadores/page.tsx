'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart3, Loader2, RefreshCw, Users, Link2Off,
} from 'lucide-react'
import {
  Button, Card, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { PERIODOS, filtroDe, rotuloCompetencia, type Recorte } from '../_components/periodos'
import { AbasAcessorias } from '../_components/abas-acessorias'

const MODULE_COLOR = 'var(--mod-administrativo, #0ea5e9)'

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
  competencias?: string[]
}
interface LinhaDetalhe {
  id: string
  obrigacao: string
  competencia: string | null
  prazo: string | null
  vencimento: string | null
  dtEntrega: string | null
  status: string | null
  multa: boolean
  dpto: string | null
  responsavel: string | null
  clienteId: string
  clienteCode: number
  clienteNome: string
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
  { campo: 'pendenteNoPrazo',   label: 'Pendentes no prazo',   ajuda: 'Ainda não entregues, com o vencimento à frente.',
    cor: 'text-sky-600 dark:text-sky-400',        bg: 'bg-sky-100 dark:bg-sky-950/40',       hex: '#0284c7' },
  { campo: 'pendenteAtrasado',  label: 'Pendentes em atraso',  ajuda: 'Ainda não entregues, com o vencimento já passado.',
    cor: 'text-amber-600 dark:text-amber-400',    bg: 'bg-amber-100 dark:bg-amber-950/40',   hex: '#d97706' },
  { campo: 'pendenteComMulta',  label: 'Pendentes com multa',  ajuda: 'Das pendentes em atraso, as que geram multa. É a exposição de hoje.',
    cor: 'text-rose-600 dark:text-rose-400',      bg: 'bg-rose-100 dark:bg-rose-950/40',     hex: '#e11d48' },
  { campo: 'entregueNoPrazo',   label: 'Entregues no prazo',   ajuda: 'Entregues dentro do vencimento — inclui o prazo técnico, que o Acessórias considera em dia.',
    cor: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-950/40', hex: '#059669' },
  { campo: 'entregueComAtraso', label: 'Entregues com atraso', ajuda: 'Entregues depois do vencimento.',
    cor: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-100 dark:bg-violet-950/40', hex: '#7c3aed' },
  { campo: 'entregueComMulta',  label: 'Entregues com multa',  ajuda: 'Das entregues com atraso, as que geram multa.',
    cor: 'text-rose-700 dark:text-rose-300',      bg: 'bg-rose-100 dark:bg-rose-950/40',     hex: '#be123c' },
] as const

const TITULO_ESCOPO: Record<Retorno['escopo'], { titulo: string; nota: string }> = {
  PROPRIO:       { titulo: 'Minhas obrigações',   nota: 'o que está sob a sua responsabilidade' },
  COLABORADORES: { titulo: 'Painel da área',      nota: 'por colaborador' },
  AREAS:         { titulo: 'Painel por área',     nota: 'todas as áreas' },
  GERAL:         { titulo: 'Painel geral',        nota: 'visão da empresa, por área' },
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

export default function IndicadoresPage() {
  const [dados, setDados] = useState<Retorno | null>(null)
  const [loading, setLoading] = useState(true)
  const [recorte, setRecorte] = useState<Recorte>('mes')
  const [detalhe, setDetalhe] = useState<{ cartao: Cartao; medida: Medida } | null>(null)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.acessorias as any).indicadores.query(filtroDe(recorte))
      .then((d: Retorno) => setDados(d))
      .catch(() => setDados(null))
      .finally(() => setLoading(false))
  }, [recorte])

  useEffect(() => { carregar() }, [carregar])

  const cab = dados ? TITULO_ESCOPO[dados.escopo] : TITULO_ESCOPO.PROPRIO

  const tipoGrupo: 'pessoa' | 'area' = dados?.escopo === 'COLABORADORES' ? 'pessoa' : 'area'

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>{cab.titulo}</h1>
            <p className="text-sm text-muted-foreground">
              Indicadores das obrigações — {cab.nota}
              {dados?.escopo === 'COLABORADORES' && dados.areaNome ? ` · ${dados.areaNome}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Um campo só, com as duas formas de recortar o tempo. Separados,
              dava para combinar recortes que se anulam e receber tela vazia. */}
          <Select value={recorte} onValueChange={(v) => setRecorte(v as Recorte)}>
            <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Recorte" /></SelectTrigger>
            <SelectContent>
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Por vencimento
              </p>
              {PERIODOS.map((p) => <SelectItem key={p.valor} value={p.valor}>{p.label}</SelectItem>)}
              {!!dados?.competencias?.length && (
                <>
                  <p className="mt-1 border-t border-border px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Por competência
                  </p>
                  {dados.competencias.map((c) => (
                    <SelectItem key={c} value={`comp:${c}`}>{rotuloCompetencia(c)}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar
          </Button>
          <BackButton href="/" label="Voltar" />
        </div>
      </div>

      <AbasAcessorias />

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
                subtitulo: `${dados.cartoes.length} área(s)`, userId: null, imagem: null, ...dados.total,
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

          {!!dados.ocultosInativos && (
            <p className="text-[12px] text-muted-foreground">
              {dados.ocultosInativos} responsável(is) fora do painel por não estarem mais ativos no OneClick.
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
  const total = MEDIDAS.reduce((soma, m) => soma + cartao[m.campo], 0)

  let percorrido = 0
  const fatias = total === 0 ? [] : MEDIDAS.flatMap((m) => {
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
      {/* No foco, o centro dá o número em percentual — é a leitura que a fatia
          sozinha não entrega. */}
      {destaque && (() => {
        const f = fatias.find((x) => x.campo === destaque)
        if (!f) return null
        return (
          <span className="pointer-events-none absolute inset-x-0 -bottom-1 text-center text-[11px] font-semibold tabular-nums"
            style={{ color: f.cor }}>
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

function CartaoIndicador({ cartao, destaque, onAbrir }: {
  cartao: Cartao; destaque?: boolean; onAbrir?: (medida: Medida) => void
}) {
  const total = MEDIDAS.reduce((soma, m) => soma + cartao[m.campo], 0)
  const [emFoco, setEmFoco] = useState<Medida | null>(null)
  return (
    <Card className={cn('overflow-hidden', destaque && 'border-current')} style={destaque ? { borderColor: MODULE_COLOR } : undefined}>
      <div className="flex flex-col items-center gap-2 border-b border-border/60 bg-muted/20 px-4 pb-5 pt-4">
        <RoscaSituacao cartao={cartao} tamanho={destaque ? 76 : 96} destaque={emFoco} />
        <div className="min-w-0 text-center">
          <p className="truncate text-[13px] font-semibold" title={cartao.titulo}>{cartao.titulo}</p>
          {cartao.subtitulo && <p className="truncate text-[11px] text-muted-foreground">{cartao.subtitulo}</p>}
          <p className="text-[11px] text-muted-foreground">{total} obrigação(ões) no período</p>
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
              onMouseEnter={() => valor > 0 && setEmFoco(m.campo)}
              onMouseLeave={() => setEmFoco(null)}
              onFocus={() => valor > 0 && setEmFoco(m.campo)}
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

/** A lista por trás de um número do cartão. */
function DetalheMedidaModal({ cartao, medida, tipo, recorte, onClose }: {
  cartao: Cartao; medida: Medida; tipo: 'pessoa' | 'area'; recorte: Recorte; onClose: () => void
}) {
  const [linhas, setLinhas] = useState<LinhaDetalhe[]>([])
  const [carregando, setCarregando] = useState(true)
  const info = MEDIDAS.find((m) => m.campo === medida)!

  useEffect(() => {
    setCarregando(true)
    ;(trpc.acessorias as any).indicadoresDetalhe
      .query({ ...filtroDe(recorte), grupo: cartao.titulo, tipo, medida })
      .then((d: LinhaDetalhe[]) => setLinhas(d || []))
      .catch(() => setLinhas([]))
      .finally(() => setCarregando(false))
  }, [cartao.titulo, medida, tipo, recorte])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeaderIcon icon={BarChart3} color="sky">
          <DialogTitle>{info.label}</DialogTitle>
          <DialogDescription>{cartao.titulo}{cartao.subtitulo ? ` · ${cartao.subtitulo}` : ''}</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="max-h-[65vh] overflow-y-auto p-0">
          {carregando ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma obrigação aqui.</p>
          ) : (
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="sticky top-0 bg-muted/40">
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left">Obrigação</th>
                  <th className="hidden w-[28%] px-3 py-2 text-left md:table-cell">Cliente</th>
                  <th className="hidden w-[96px] px-3 py-2 text-left lg:table-cell">Competência</th>
                  <th className="w-[104px] px-3 py-2 text-left">Vencimento</th>
                  <th className="hidden w-[100px] px-3 py-2 text-left sm:table-cell">Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {linhas.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <p className="truncate font-medium" title={l.obrigacao}>{l.obrigacao}</p>
                      <span className="text-[11px] text-muted-foreground md:hidden">#{l.clienteCode} — {l.clienteNome}</span>
                      {l.multa && <span className="ml-1 text-[10px] text-rose-500">multa</span>}
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      <Link href={`/clientes/${l.clienteId}`} target="_blank"
                        className="block truncate text-[12px] text-muted-foreground hover:underline">
                        #{l.clienteCode} — {l.clienteNome}
                      </Link>
                    </td>
                    <td className="hidden px-3 py-2 text-[12px] text-muted-foreground lg:table-cell">{fmtComp(l.competencia)}</td>
                    <td className="px-3 py-2 text-[12px] tabular-nums">{fmtData(l.vencimento)}</td>
                    <td className="hidden px-3 py-2 text-[12px] text-muted-foreground tabular-nums sm:table-cell">{fmtData(l.dtEntrega)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogBody>
        <DialogFooter>
          <Button size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="sticky top-0 bg-muted/40">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left">Obrigação</th>
              <th className="hidden w-[28%] px-3 py-2 text-left md:table-cell">Cliente</th>
              <th className="hidden w-[92px] px-3 py-2 text-left lg:table-cell">Área</th>
              <th className="w-[104px] px-3 py-2 text-left">Vencimento</th>
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
                    ? 'font-semibold text-rose-600 dark:text-rose-400'
                    : 'text-muted-foreground')}>
                    {p.atrasada ? 'em atraso' : 'no prazo'}
                  </span>
                  {p.multa && <span className="ml-1 text-[10px] text-rose-500">multa</span>}
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
