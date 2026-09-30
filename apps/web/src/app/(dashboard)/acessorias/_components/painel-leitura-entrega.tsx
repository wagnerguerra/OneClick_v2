'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn, Switch, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BADGE } from '@/lib/color-styles'
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

/** Resultado da reclassificação — vale para a obrigação no cliente inteira. */
export interface MultaReclassificada {
  clienteId: string
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

/** Aplica a reclassificação em todas as linhas da mesma obrigação no cliente. */
export function aplicarReclassificacao<T extends LinhaEntrega>(linhas: T[], r: MultaReclassificada): T[] {
  return linhas.map((x) => (x.clienteId === r.clienteId && x.obrigacao === r.obrigacao
    ? { ...x, multa: r.multa, multaReclassificada: r.multaReclassificada }
    : x))
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
      const r: { multa: boolean; multaReclassificada: boolean } =
        await (trpc.acessorias as any).reclassificarMulta.mutate({ entregaId: linha.id, multa })
      onReclassificada({ clienteId: linha.clienteId, obrigacao: linha.obrigacao, ...r })
      alerts.toast(multa ? 'Obrigação marcada como sujeita a multa' : 'Obrigação marcada como não sujeita a multa')
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

        {/* Reclassificação da multa — vale para esta obrigação no cliente, em
            todas as competências. */}
        <div>
          <p className="mb-1 text-[13px] font-semibold text-foreground">Multa</p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px]">Sujeita a multa</p>
              <p className="text-[11px] text-muted-foreground">
                {linha.multaReclassificada
                  ? `Reclassificada pelo escritório${linha.multaAcessorias !== null ? ` · no Acessórias: ${linha.multaAcessorias ? 'Sim' : 'Não'}` : ''}`
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
                  ? 'Vale para esta obrigação deste cliente em todas as competências, inclusive nas próximas sincronizações.'
                  : 'Só administradores e diretoria podem reclassificar a multa.'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <DetalheEntregaConteudo linha={linha} />
      </div>
    </TooltipProvider>
  )
}
