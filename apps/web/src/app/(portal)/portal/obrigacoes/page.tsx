'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck, CheckCircle2, Clock, AlertCircle, MinusCircle, Loader2, Info,
} from 'lucide-react'
import { cn } from '@saas/ui'

import { trpc } from '@/lib/trpc'
import { usePortal } from '../../_lib/contexto'
import { PortalPageHeader } from '../../_components/portal-page-header'

/**
 * Obrigações do mês, para o cliente.
 *
 * Responde três perguntas, nessa ordem: o que a minha empresa deve neste mês,
 * quando vence, e já foi entregue? Tudo o que não serve a essas três — SLA,
 * responsável, passos internos — fica do lado do escritório, em
 * `/minhas-obrigacoes`.
 *
 * O atraso aparece, por decisão do escritório: a obrigação é do cliente e a
 * multa cai nele. Esconder seria proteger o escritório com o dinheiro do
 * cliente.
 */

type Situacao = 'ENTREGUE' | 'ATRASADA' | 'EM_ANDAMENTO' | 'DISPENSADA'

interface Obrigacao {
  id: string
  nome: string
  area: string | null
  competencia: string
  prazo: string
  situacao: Situacao
  entregueEm: string | null
  diasDeAtraso: number | null
}

interface Resumo {
  total: number
  entregues: number
  emAndamento: number
  atrasadas: number
  dispensadas: number
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function rotuloCompetencia(c: string): string {
  if (!c || c.length !== 6) return c
  return `${MESES[Number(c.slice(4, 6)) - 1] ?? '?'} de ${c.slice(0, 4)}`
}

function dataCurta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  // UTC no dia: o prazo é um `date` puro no banco, e converter para o fuso
  // local puxaria a data um dia para trás no Brasil.
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Dias entre hoje e o prazo. Negativo = já passou. */
function diasAte(iso: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const d = new Date(iso)
  return Math.round((d.getTime() - hoje.getTime()) / 86_400_000)
}

const ESTILO: Record<Situacao, {
  rotulo: string
  icone: typeof CheckCircle2
  chip: string
  ponto: string
}> = {
  ENTREGUE: {
    rotulo: 'Entregue',
    icone: CheckCircle2,
    chip: 'bg-[#eefaf2] text-[#1c7a45] dark:bg-[#122019] dark:text-[#6fcf97]',
    ponto: 'bg-[#1c7a45]',
  },
  ATRASADA: {
    rotulo: 'Atrasada',
    icone: AlertCircle,
    chip: 'bg-[#fdeaea] text-[#c2262c] dark:bg-[#2a1213] dark:text-[#f08b8f]',
    ponto: 'bg-[#c2262c]',
  },
  EM_ANDAMENTO: {
    rotulo: 'Em andamento',
    icone: Clock,
    chip: 'bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]',
    ponto: 'bg-[#1a6dff]',
  },
  DISPENSADA: {
    rotulo: 'Dispensada',
    icone: MinusCircle,
    chip: 'bg-slate-100 text-slate-500 dark:bg-[#16233a] dark:text-slate-400',
    ponto: 'bg-slate-400',
  },
}

/** A ordem da lista: o que cobra atenção primeiro. */
const PESO: Record<Situacao, number> = {
  ATRASADA: 0, EM_ANDAMENTO: 1, ENTREGUE: 2, DISPENSADA: 3,
}

export default function PortalObrigacoesPage() {
  const { clienteId, vinculo } = usePortal()

  const [competencias, setCompetencias] = useState<string[]>([])
  const [competencia, setCompetencia] = useState<string | null>(null)
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Situacao | 'TODAS'>('TODAS')

  // As competências vêm uma vez; a mais recente abre a tela. Abrir num mês
  // fixo (o corrente) mostraria tela vazia todo início de mês, antes de o
  // escritório gerar as entregas.
  useEffect(() => {
    if (!clienteId) return
    ;(trpc.portal as any).obrigacoes.competencias.query({ clienteId })
      .then((c: string[]) => {
        setCompetencias(c)
        setCompetencia(c[0] ?? null)
        if (c.length === 0) setCarregando(false)
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
        setCarregando(false)
      })
  }, [clienteId])

  const carregar = useCallback(() => {
    if (!clienteId || !competencia) return
    setCarregando(true)
    setErro(null)
    Promise.all([
      (trpc.portal as any).obrigacoes.listar.query({ clienteId, competencia }),
      (trpc.portal as any).obrigacoes.resumo.query({ clienteId, competencia }),
    ])
      .then(([l, r]: [Obrigacao[], Resumo]) => { setObrigacoes(l); setResumo(r) })
      .catch((e: unknown) => {
        setObrigacoes([])
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
      })
      .finally(() => setCarregando(false))
  }, [clienteId, competencia])

  useEffect(() => { carregar() }, [carregar])

  const lista = useMemo(() => {
    const base = filtro === 'TODAS' ? obrigacoes : obrigacoes.filter(o => o.situacao === filtro)
    return [...base].sort((a, b) => {
      const p = PESO[a.situacao] - PESO[b.situacao]
      return p !== 0 ? p : a.prazo.localeCompare(b.prazo)
    })
  }, [obrigacoes, filtro])

  const semArea = !vinculo || vinculo.areas.length === 0

  const contadores: Array<{ chave: Situacao | 'TODAS'; rotulo: string; n: number }> = resumo
    ? [
      { chave: 'TODAS', rotulo: 'Todas', n: resumo.total },
      { chave: 'ATRASADA', rotulo: 'Atrasadas', n: resumo.atrasadas },
      { chave: 'EM_ANDAMENTO', rotulo: 'Em andamento', n: resumo.emAndamento },
      { chave: 'ENTREGUE', rotulo: 'Entregues', n: resumo.entregues },
      { chave: 'DISPENSADA', rotulo: 'Dispensadas', n: resumo.dispensadas },
    ]
    : []

  return (
    <div className="flex flex-col gap-5">
      <PortalPageHeader
        titulo="Obrigações"
        subtitulo="As entregas da sua empresa, com o prazo legal e a situação de cada uma."
        acoes={competencias.length > 0 ? (
          <select
            value={competencia ?? ''}
            onChange={e => setCompetencia(e.target.value)}
            className="h-9 rounded-lg border border-[#dbe7fb] bg-white px-3 text-[13px] font-semibold capitalize text-slate-700 outline-none focus:border-[#1a6dff] dark:border-[#1b2739] dark:bg-[#0e1726] dark:text-slate-300"
          >
            {competencias.map(c => (
              <option key={c} value={c}>{rotuloCompetencia(c)}</option>
            ))}
          </select>
        ) : undefined}
      />

      {semArea && (
        <div className="anim-descer flex items-center gap-2.5 rounded-lg border border-[#dbe7fb] bg-[#f2f7ff] px-4 py-2.5 text-[13px] text-[#0b4fd0] dark:border-[#1b2739] dark:bg-[#16233a] dark:text-[#7db0ff]">
          <Info className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">
            Seu acesso ainda não tem área liberada — fale com o escritório contábil para
            ver as obrigações.
          </p>
        </div>
      )}

      {erro && (
        <div className="anim-descer flex items-center gap-2.5 rounded-lg border border-[#f0c9b4] bg-[#fdf0e6] px-4 py-2.5 text-[13px] text-[#c2510f] dark:border-[#4a2c17] dark:bg-[#2a1a10] dark:text-[#e09a6a]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">{erro}</p>
        </div>
      )}

      {/* Contadores que também filtram: o número que chama atenção é o mesmo
          botão que mostra o que ele conta. */}
      {resumo && resumo.total > 0 && (
        <div className="flex flex-wrap gap-2">
          {contadores.map(c => {
            const ativo = filtro === c.chave
            const vazio = c.n === 0
            return (
              <button
                key={c.chave}
                type="button"
                onClick={() => setFiltro(c.chave)}
                disabled={vazio && c.chave !== 'TODAS'}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors',
                  ativo
                    ? 'border-[#1a6dff] bg-[#eaf1ff] text-[#1a6dff] dark:border-[#1b2739] dark:bg-[#16233a] dark:text-[#7db0ff]'
                    : 'border-[#e6ebf2] bg-white text-slate-600 hover:bg-[#f2f7ff] dark:border-[#1b2739] dark:bg-[#0e1726] dark:text-slate-400 dark:hover:bg-[#16233a]',
                  vazio && c.chave !== 'TODAS' && 'opacity-40',
                )}
              >
                {c.chave !== 'TODAS' && (
                  <span className={cn('h-1.5 w-1.5 rounded-full', ESTILO[c.chave as Situacao].ponto)} />
                )}
                {c.rotulo}
                <span className="tabular-nums opacity-70">{c.n}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[#e6ebf2] bg-white dark:border-[#1b2739] dark:bg-[#0e1726]">
        {carregando && (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#1a6dff]" />
          </div>
        )}

        {!carregando && competencias.length === 0 && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
            <CalendarCheck className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
              Nada por aqui ainda
            </p>
            <p className="max-w-md text-[13px] text-slate-600 dark:text-slate-400">
              Quando o escritório registrar as entregas da sua empresa, o calendário
              aparece aqui — com o prazo de cada uma.
            </p>
          </div>
        )}

        {!carregando && competencias.length > 0 && lista.length === 0 && (
          <div className="flex h-40 items-center justify-center px-6 text-center text-[13px] text-slate-600 dark:text-slate-400">
            Nenhuma obrigação nesta seleção.
          </div>
        )}

        {!carregando && lista.length > 0 && (
          <div key={`${competencia}:${filtro}`} className="anim-entrar divide-y divide-[#eef2f7] dark:divide-[#16233a]">
            {lista.map(o => {
              const e = ESTILO[o.situacao]
              const dias = diasAte(o.prazo)
              return (
                <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', e.chip)}>
                    <e.icone className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">
                      {o.nome}
                    </p>
                    <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                      {o.area ?? 'Sem área'}
                      {' · '}
                      {o.situacao === 'ENTREGUE' && o.entregueEm
                        ? <>entregue em {dataCurta(o.entregueEm)}</>
                        : o.situacao === 'DISPENSADA'
                        ? <>não se aplica a este mês</>
                        : o.situacao === 'ATRASADA'
                        ? <>venceu {dataCurta(o.prazo)}</>
                        : <>vence {dataCurta(o.prazo)}</>}
                      {/* O aviso de "vence em breve" é o que faz a tela servir
                          para agir, e não só para consultar. */}
                      {o.situacao === 'EM_ANDAMENTO' && dias >= 0 && dias <= 5 && (
                        <span className="font-semibold text-[#c2510f] dark:text-[#e09a6a]">
                          {' · '}{dias === 0 ? 'vence hoje' : `faltam ${dias} dia(s)`}
                        </span>
                      )}
                    </p>
                  </div>

                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', e.chip)}>
                    {e.rotulo}
                    {o.situacao === 'ATRASADA' && o.diasDeAtraso !== null && (
                      <> · {o.diasDeAtraso} dia(s)</>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!carregando && obrigacoes.some(o => o.situacao === 'ATRASADA') && (
        <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
          Obrigação atrasada não significa multa automática. Se tiver dúvida sobre alguma
          delas, fale com a sua equipe de atendimento no escritório.
        </p>
      )}
    </div>
  )
}
