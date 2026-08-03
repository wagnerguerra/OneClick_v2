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
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { PERIODOS, intervaloDe, type Periodo } from '../_components/periodos'

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
}

/** As seis medidas do cartão, na ordem em que se lê: pendências antes de entregas. */
const MEDIDAS = [
  { campo: 'pendenteNoPrazo',   label: 'Pendentes no prazo',  cor: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-100 dark:bg-sky-950/40' },
  { campo: 'pendenteAtrasado',  label: 'Pendentes em atraso', cor: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-950/40' },
  { campo: 'pendenteComMulta',  label: 'Pendentes com multa', cor: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-100 dark:bg-rose-950/40' },
  { campo: 'entregueNoPrazo',   label: 'Entregues no prazo',  cor: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-100 dark:bg-sky-950/40' },
  { campo: 'entregueComAtraso', label: 'Entregues com atraso', cor: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-100 dark:bg-violet-950/40' },
  { campo: 'entregueComMulta',  label: 'Entregues com multa', cor: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-100 dark:bg-rose-950/40' },
] as const

const TITULO_ESCOPO: Record<Retorno['escopo'], { titulo: string; nota: string }> = {
  PROPRIO:       { titulo: 'Minhas obrigações',   nota: 'o que está sob a sua responsabilidade' },
  COLABORADORES: { titulo: 'Painel da área',      nota: 'por colaborador' },
  AREAS:         { titulo: 'Painel por área',     nota: 'todas as áreas' },
  GERAL:         { titulo: 'Painel geral',        nota: 'visão da empresa, por área' },
}

const fmtData = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export default function IndicadoresPage() {
  const [dados, setDados] = useState<Retorno | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('mes')

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.acessorias as any).indicadores.query(intervaloDe(periodo))
      .then((d: Retorno) => setDados(d))
      .catch(() => setDados(null))
      .finally(() => setLoading(false))
  }, [periodo])

  useEffect(() => { carregar() }, [carregar])

  const cab = dados ? TITULO_ESCOPO[dados.escopo] : TITULO_ESCOPO.PROPRIO

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
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue placeholder="Prazo" /></SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => <SelectItem key={p.valor} value={p.valor}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar
          </Button>
          <BackButton href="/" label="Voltar" />
        </div>
      </div>

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
            {dados.cartoes.map((c) => <CartaoIndicador key={c.chave} cartao={c} />)}
          </div>

          {dados.escopo === 'PROPRIO' && (
            <ListaPendentes pendentes={dados.pendentes} />
          )}
        </>
      )}
    </div>
  )
}

function CartaoIndicador({ cartao, destaque }: { cartao: Cartao; destaque?: boolean }) {
  const iniciais = cartao.titulo.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return (
    <Card className={cn('overflow-hidden', destaque && 'border-current')} style={destaque ? { borderColor: MODULE_COLOR } : undefined}>
      <div className="flex items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
        {cartao.imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cartao.imagem} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: MODULE_COLOR }}>
            {iniciais || '—'}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold" title={cartao.titulo}>{cartao.titulo}</p>
          {cartao.subtitulo && <p className="truncate text-[11px] text-muted-foreground">{cartao.subtitulo}</p>}
          {/* Sem vínculo, o cartão ainda soma — só não sabemos de quem é. */}
          {cartao.userId === null && cartao.subtitulo !== null && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <Link2Off className="h-3 w-3" />sem usuário vinculado
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/40">
        {MEDIDAS.map((m) => {
          const valor = cartao[m.campo]
          return (
            <div key={m.campo} className="flex items-center justify-between px-4 py-1.5">
              <span className={cn('text-[12px]', m.cor)}>{m.label}</span>
              <span className={cn(
                'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold tabular-nums',
                valor > 0 ? cn(m.bg, m.cor) : 'text-muted-foreground',
              )}>
                {valor}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
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
