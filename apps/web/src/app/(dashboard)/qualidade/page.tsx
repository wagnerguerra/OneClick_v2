'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, Loader2, AlertTriangle, Search, Video, GraduationCap,
  ThumbsUp, MessageSquare, Lightbulb, FileText, ThumbsDown,
} from 'lucide-react'
import { Card, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { NC_SITUACAO_LABEL } from '@saas/types'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Regua { vencidas: number; hoje: number; aVencer: number }
interface Painel {
  nc: { abertas: number; porSituacao: Record<string, number>; acoes: Regua; eficazAno: { sim: number; nao: number } }
  contexto: { semAvaliacao: number; riscoAlto: number; acoes: Regua }
  reunioes: { acoes: Regua }
  capacitacoes: { aguardandoAvaliacao: number; avaliacoes: Regua }
  manifestacoes: {
    elogiosNovos: number
    sugestoesSemResposta: number
    reclamacoesAbertas: number
    reclamacoesPorStatus: Record<string, number>
    reclamacoesPrazoVencido: number
  }
  documentos: { emAprovacao: number }
}

/** Farol vencidas/hoje/a vencer — a régua que o dsb_iso do v1 usava. */
function ReguaPills({ r }: { r: Regua }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={cn('rounded-md px-2 py-1 text-xs font-semibold tabular-nums',
        r.vencidas > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-muted text-muted-foreground')}>
        {r.vencidas} vencidas
      </span>
      <span className={cn('rounded-md px-2 py-1 text-xs font-semibold tabular-nums',
        r.hoje > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
        {r.hoje} hoje
      </span>
      <span className={cn('rounded-md px-2 py-1 text-xs font-semibold tabular-nums',
        r.aVencer > 0 ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' : 'bg-muted text-muted-foreground')}>
        {r.aVencer} em 7 dias
      </span>
    </div>
  )
}

function CardModulo({ href, icon: Icon, titulo, children }: {
  href: string; icon: typeof Search; titulo: string; children: React.ReactNode
}) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <Link href={href} className="flex items-center gap-2 group w-fit">
        <Icon className="h-4 w-4" style={{ color: MODULE_COLOR }} />
        <h4 className="text-sm font-semibold group-hover:underline underline-offset-2">{titulo}</h4>
      </Link>
      {children}
    </Card>
  )
}

const Linha = ({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: 'rose' | 'amber' | 'emerald' }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-muted-foreground">{rotulo}</span>
    <span className={cn('font-semibold tabular-nums',
      destaque === 'rose' && valor > 0 && 'text-rose-600 dark:text-rose-400',
      destaque === 'amber' && valor > 0 && 'text-amber-600 dark:text-amber-400',
      destaque === 'emerald' && valor > 0 && 'text-emerald-600 dark:text-emerald-400')}>{valor}</span>
  </div>
)

/**
 * Painel da Qualidade — o sucessor do dsb_iso do v1: as pendências do SGQ
 * consolidadas. Os números chegam prontos do backend (qualidade.painel);
 * cada card leva ao módulo correspondente.
 */
export default function PainelQualidadePage() {
  const [p, setP] = useState<Painel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(trpc.qualidade as any).painel.query()
      .then(setP)
      .catch(() => setP(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>Painel da Qualidade</h1>
            <p className="text-sm text-muted-foreground">Pendências do sistema de gestão da qualidade, consolidadas por módulo</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !p ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Não foi possível carregar o painel.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {/* ── Não Conformidades ── */}
          <CardModulo href="/nao-conformidades" icon={AlertTriangle} titulo="Não Conformidades">
            <div className="space-y-1.5">
              <Linha rotulo="Abertas" valor={p.nc.abertas} destaque="amber" />
              {Object.entries(p.nc.porSituacao)
                .filter(([s]) => !['FINALIZADA', 'CANCELADA'].includes(s))
                .map(([s, n]) => <Linha key={s} rotulo={NC_SITUACAO_LABEL[s] ?? s} valor={n} />)}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Ações do plano</p>
              <ReguaPills r={p.nc.acoes} />
            </div>
            {(p.nc.eficazAno.sim + p.nc.eficazAno.nao) > 0 && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                Avaliadas no ano:
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"><ThumbsUp className="h-3 w-3" />{p.nc.eficazAno.sim}</span>
                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium"><ThumbsDown className="h-3 w-3" />{p.nc.eficazAno.nao}</span>
              </p>
            )}
          </CardModulo>

          {/* ── Reclamações ── */}
          <CardModulo href="/reclamacoes" icon={MessageSquare} titulo="Reclamações">
            <div className="space-y-1.5">
              <Linha rotulo="Abertas" valor={p.manifestacoes.reclamacoesAbertas} destaque="amber" />
              <Linha rotulo="Prazo de retorno vencido" valor={p.manifestacoes.reclamacoesPrazoVencido} destaque="rose" />
              <Linha rotulo="Aguardando retorno" valor={p.manifestacoes.reclamacoesPorStatus['AGUARDANDO_RETORNO'] ?? 0} />
              <Linha rotulo="Em análise" valor={p.manifestacoes.reclamacoesPorStatus['AGUARDANDO_ANALISE'] ?? 0} />
              <Linha rotulo="Registrar eficácia" valor={p.manifestacoes.reclamacoesPorStatus['REGISTRAR_EFICACIA'] ?? 0} />
            </div>
          </CardModulo>

          {/* ── Análise de Contexto ── */}
          <CardModulo href="/analise-contexto" icon={Search} titulo="Análise de Contexto">
            <div className="space-y-1.5">
              <Linha rotulo="Sem avaliação de eficácia" valor={p.contexto.semAvaliacao} destaque="amber" />
              <Linha rotulo="Risco alto em aberto" valor={p.contexto.riscoAlto} destaque="rose" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Ações do plano</p>
              <ReguaPills r={p.contexto.acoes} />
            </div>
          </CardModulo>

          {/* ── Reuniões ── */}
          <CardModulo href="/reunioes/acoes" icon={Video} titulo="Reuniões — plano de ação">
            <ReguaPills r={p.reunioes.acoes} />
          </CardModulo>

          {/* ── Capacitações ── */}
          <CardModulo href="/capacitacoes" icon={GraduationCap} titulo="Capacitações">
            <div className="space-y-1.5">
              <Linha rotulo="Aguardando avaliação de eficácia" valor={p.capacitacoes.aguardandoAvaliacao} destaque="amber" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Prazos de avaliação</p>
              <ReguaPills r={p.capacitacoes.avaliacoes} />
            </div>
          </CardModulo>

          {/* ── Elogios, Sugestões e Documentos ── */}
          <Card className="p-5 flex flex-col gap-3">
            <div className="space-y-2.5">
              <Link href="/elogios" className="flex items-center justify-between group">
                <span className="flex items-center gap-2 text-xs text-muted-foreground group-hover:text-foreground">
                  <ThumbsUp className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} />Elogios em triagem
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', p.manifestacoes.elogiosNovos > 0 && 'text-amber-600 dark:text-amber-400')}>
                  {p.manifestacoes.elogiosNovos}
                </span>
              </Link>
              <Link href="/sugestoes" className="flex items-center justify-between group">
                <span className="flex items-center gap-2 text-xs text-muted-foreground group-hover:text-foreground">
                  <Lightbulb className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} />Sugestões sem resposta
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', p.manifestacoes.sugestoesSemResposta > 0 && 'text-amber-600 dark:text-amber-400')}>
                  {p.manifestacoes.sugestoesSemResposta}
                </span>
              </Link>
              <Link href="/documentos-internos" className="flex items-center justify-between group">
                <span className="flex items-center gap-2 text-xs text-muted-foreground group-hover:text-foreground">
                  <FileText className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} />Revisões de documento em aprovação
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', p.documentos.emAprovacao > 0 && 'text-amber-600 dark:text-amber-400')}>
                  {p.documentos.emAprovacao}
                </span>
              </Link>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
