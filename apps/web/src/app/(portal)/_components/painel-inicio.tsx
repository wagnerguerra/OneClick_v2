'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarCheck, CheckCircle2, Clock, FileCheck2, Folder,
  FolderOpen, LayoutGrid, LifeBuoy, Mail, Receipt, ShieldCheck, Upload, Users,
} from 'lucide-react'

/**
 * Blocos da home do Portal do Cliente.
 *
 * A home deixou de ser uma capa (hero, título digitando, terminal, faixa de
 * números) e virou uma MESA DE TRABALHO, no padrão dos portais de cliente
 * contábeis (TaxDome, Canopy, Onvio, Acessórias, Nibo): saudação curta, alerta
 * só quando há risco, o que o cliente precisa fazer primeiro, o andamento do
 * mês, os documentos recentes e, ao lado, com quem falar.
 *
 * Duas regras valem para todos os blocos:
 *  - Só dado real. Enquanto consulta, mostra o esqueleto; se a consulta falha,
 *    diz que falhou — nunca um zero que parece verdade.
 *  - Estado vazio diz o que vai aparecer ali. "Nada aqui" sozinho parece
 *    defeito; "quando o escritório pedir um documento, ele aparece aqui" explica.
 */

/** `undefined` = consultando · `null` = não deu para consultar agora. */
export type Consulta<T> = T | null | undefined

/** Datas chegam como texto ISO ou `Date`, conforme o transformer do cliente tRPC. */
type DataApi = string | Date

export interface Pendencia {
  id: string
  titulo: string
  descricao: string | null
  prazo: DataApi | null
  competencia: string | null
  categoria: string | null
}

export type SituacaoObrigacao = 'ENTREGUE' | 'ATRASADA' | 'EM_ANDAMENTO' | 'DISPENSADA'

export interface Obrigacao {
  id: string
  nome: string
  area: string | null
  competencia: string
  prazo: DataApi
  situacao: SituacaoObrigacao
  entregueEm: DataApi | null
  diasDeAtraso: number | null
}

export interface ResumoObrigacoes {
  total: number
  entregues: number
  emAndamento: number
  atrasadas: number
  dispensadas: number
}

export interface ItemDrive {
  id: string
  nome: string
  isPasta: boolean
  modificadoEm: DataApi | null
  enviadoPor: string | null
  enviadoEm: DataApi | null
}

export interface PastaDrive {
  vinculada: boolean
  nome: string | null
  itens: ItemDrive[]
  motivo?: string
}

export interface PessoaDaEquipe {
  nome: string
  email: string
  imagem: string | null
}

export interface AreaDaEquipe {
  areaId: string
  area: string
  responsavel: PessoaDaEquipe | null
  substituto: PessoaDaEquipe | null
}

// ── Datas ─────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000

/**
 * Dias entre hoje e um PRAZO. O prazo é uma data sem hora gravada à meia-noite
 * UTC: lido no fuso de Brasília ele cairia no dia anterior, e "vence hoje"
 * viraria "venceu ontem". Por isso o prazo é lido em UTC e o hoje, no local.
 */
export function diasAte(prazo: DataApi, hoje: Date): number {
  const p = new Date(prazo)
  const alvo = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate())
  const agora = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - agora) / DIA_MS)
}

function dataDoPrazo(prazo: DataApi): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    .format(new Date(prazo)).replace('.', '')
}

/** Quando algo aconteceu (horário real, no fuso local): "hoje, 14:05", "ontem", "12 set". */
function quando(data: DataApi, hoje: Date | null): string {
  const d = new Date(data)
  if (hoje) {
    const dias = Math.round(
      (Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) -
        Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DIA_MS,
    )
    if (dias === 0) return `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    if (dias === 1) return 'ontem'
  }
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '')
}

// ── Peças ─────────────────────────────────────────────────────────────────

const TOM = {
  vermelho: 'bg-[#fdeceb] text-[#c2362f] dark:bg-[#2a1413] dark:text-[#f08a84]',
  ambar: 'bg-[#fdf0e6] text-[#c2510f] dark:bg-[#2a1a10] dark:text-[#e09a6a]',
  verde: 'bg-[#e9f6ee] text-[#1f9254] dark:bg-[#122019] dark:text-[#6fcf97]',
  azul: 'bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]',
  cinza: 'bg-slate-100 text-slate-500 dark:bg-[#16233a] dark:text-slate-400',
} as const
type Tom = keyof typeof TOM

function Chip({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TOM[tom]}`}>
      {children}
    </span>
  )
}

function Bloco({
  icone: Icone, cor, titulo, subtitulo, acao, children,
}: {
  icone: typeof Clock
  cor: string
  titulo: string
  subtitulo?: string
  acao?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="anim-subir overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white shadow-sm dark:border-[#1b2739] dark:bg-[#0e1726]">
      <header className="flex items-center gap-3 border-b border-[#eef2f7] px-5 py-3.5 dark:border-[#1b2739]">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cor}`}>
          <Icone className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
          {subtitulo && <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">{subtitulo}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  )
}

function VerTudo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-[#1a6dff] hover:underline dark:text-[#7db0ff]"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  )
}

/** Esqueleto enquanto consulta: reserva a altura e não pisca um "vazio" falso. */
function Carregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <ul aria-hidden="true" className="divide-y divide-[#eef2f7] dark:divide-[#1b2739]">
      {Array.from({ length: linhas }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-3.5">
          <span className="h-3 w-2/5 animate-pulse rounded bg-slate-100 dark:bg-[#16233a]" />
          <span className="ml-auto h-3 w-16 animate-pulse rounded bg-slate-100 dark:bg-[#16233a]" />
        </li>
      ))}
    </ul>
  )
}

/** `mensagem` é a do servidor, quando ele disse o que houve; senão, a genérica. */
function Falhou({ mensagem }: { mensagem?: string | null }) {
  return (
    <p className="px-5 py-6 text-center text-[12.5px] text-slate-500 dark:text-slate-400">
      {mensagem || 'Não foi possível carregar agora. Tente de novo em instantes.'}
    </p>
  )
}

function Vazio({
  icone: Icone, titulo, texto, tom = 'neutro',
}: {
  icone: typeof Clock
  titulo: string
  texto: string
  tom?: 'ok' | 'neutro'
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tom === 'ok' ? TOM.verde : TOM.cinza}`}>
        <Icone className="h-5 w-5" />
      </span>
      <p className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{titulo}</p>
      <p className="max-w-sm text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">{texto}</p>
    </div>
  )
}

// ── Saudação ──────────────────────────────────────────────────────────────

/**
 * A faixa de contexto: saudação, data, empresa e acesso. Baixa, sem capa — o
 * que o cliente veio fazer está logo abaixo, e é isso que tem de caber na
 * primeira tela.
 *
 * Hora e data só depois de montar: calculadas no servidor, sairiam no fuso e
 * no instante dele, e o React acusaria diferença na hidratação.
 */
export function Saudacao({
  nome, razaoSocial, nivel, acoes,
}: {
  nome: string | null
  razaoSocial: string
  nivel: string
  acoes?: React.ReactNode
}) {
  const [agora, setAgora] = useState<Date | null>(null)
  useEffect(() => { setAgora(new Date()) }, [])

  const hora = agora?.getHours()
  const saudacao = hora === undefined ? 'Olá' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = nome?.trim().split(/\s+/)[0]
  const data = agora
    ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(agora)
    : ''

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="min-h-[18px] text-[12px] font-medium first-letter:uppercase text-slate-500 dark:text-slate-400">{data}</p>
        <h1 className="mt-0.5 text-[22px] font-bold tracking-tight text-slate-900 sm:text-[24px] dark:text-slate-100">
          {saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}
        </h1>
        <p className="mt-1 truncate text-[13px] text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{razaoSocial}</span>
          {' · '}acesso {nivel}
        </p>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{acoes}</div>}
    </div>
  )
}

export const BOTAO_PRIMARIO =
  'inline-flex items-center gap-2 rounded-lg bg-[#1a6dff] px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-[#1a6dff]/25 transition-colors hover:bg-[#0b4fd0]'
export const BOTAO_SECUNDARIO =
  'inline-flex items-center gap-2 rounded-lg border border-[#dbe7fb] bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-[#f2f7ff] dark:border-[#1b2739] dark:bg-[#0e1726] dark:text-slate-300 dark:hover:bg-[#16233a]'

// ── Alertas ───────────────────────────────────────────────────────────────

export interface Alerta {
  texto: string
  acao: string
  href: string
}

/** Só aparece quando há risco. Uma faixa sempre visível vira paisagem. */
export function Alertas({ itens }: { itens: Alerta[] }) {
  if (itens.length === 0) return null
  return (
    <div
      role="status"
      className="anim-descer flex flex-col gap-2 rounded-xl border border-[#f3c7c3] bg-[#fdeceb] px-4 py-3 dark:border-[#4a2220] dark:bg-[#2a1413]"
    >
      {itens.map((a) => (
        <div key={a.texto} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#9f2a24] dark:text-[#f08a84]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 font-medium">{a.texto}</span>
          <Link href={a.href} className="font-semibold underline-offset-2 hover:underline">{a.acao}</Link>
        </div>
      ))}
    </div>
  )
}

// ── Pendências ────────────────────────────────────────────────────────────

const LIMITE_PENDENCIAS = 5

function chipDoPrazo(prazo: DataApi | null, hoje: Date | null): { tom: Tom; texto: string } {
  if (!prazo) return { tom: 'cinza', texto: 'Sem prazo' }
  if (!hoje) return { tom: 'cinza', texto: `Até ${dataDoPrazo(prazo)}` }
  const d = diasAte(prazo, hoje)
  if (d < 0) return { tom: 'vermelho', texto: `Venceu há ${-d} dia${d === -1 ? '' : 's'}` }
  if (d === 0) return { tom: 'ambar', texto: 'Vence hoje' }
  if (d <= 3) return { tom: 'ambar', texto: `Vence em ${d} dia${d === 1 ? '' : 's'}` }
  return { tom: 'cinza', texto: `Até ${dataDoPrazo(prazo)}` }
}

export function BlocoPendencias({
  pendencias, podeEditar, hoje,
}: {
  pendencias: Consulta<Pendencia[]>
  podeEditar: boolean
  hoje: Date | null
}) {
  const ordenadas = (pendencias ?? []).slice().sort((a, b) => {
    if (!a.prazo) return 1
    if (!b.prazo) return -1
    return new Date(a.prazo).getTime() - new Date(b.prazo).getTime()
  })
  const subtitulo = pendencias === undefined
    ? 'Consultando…'
    : pendencias === null
      ? undefined
      : pendencias.length === 0
        ? 'Nada aguardando você'
        : `${pendencias.length} aguardando envio`

  return (
    <Bloco
      icone={Clock}
      cor={TOM.ambar}
      titulo="Suas pendências"
      subtitulo={subtitulo}
      acao={ordenadas.length > LIMITE_PENDENCIAS ? <VerTudo href="/portal/documentos">Ver todas</VerTudo> : undefined}
    >
      {pendencias === undefined ? <Carregando /> : pendencias === null ? <Falhou /> : pendencias.length === 0 ? (
        <Vazio
          tom="ok"
          icone={CheckCircle2}
          titulo="Tudo em dia"
          texto="Nenhuma pendência com você agora. Quando o escritório pedir um documento, ele aparece aqui."
        />
      ) : (
        <ul className="divide-y divide-[#eef2f7] dark:divide-[#1b2739]">
          {ordenadas.slice(0, LIMITE_PENDENCIAS).map((p) => {
            const chip = chipDoPrazo(p.prazo, hoje)
            return (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{p.titulo}</p>
                  {p.descricao && (
                    <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">{p.descricao}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Chip tom={chip.tom}>{chip.texto}</Chip>
                  {podeEditar && (
                    <Link
                      href="/portal/documentos"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#dbe7fb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1a6dff] transition-colors hover:bg-[#f2f7ff] dark:border-[#1b2739] dark:bg-[#0e1726] dark:text-[#7db0ff] dark:hover:bg-[#16233a]"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Enviar
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Bloco>
  )
}

// ── Obrigações ────────────────────────────────────────────────────────────

const LIMITE_OBRIGACOES = 5

function chipDaObrigacao(o: Obrigacao, hoje: Date | null): { tom: Tom; texto: string } {
  if (o.situacao === 'ATRASADA') {
    return { tom: 'vermelho', texto: o.diasDeAtraso ? `Atrasada · ${o.diasDeAtraso}d` : 'Atrasada' }
  }
  if (o.situacao === 'ENTREGUE') return { tom: 'verde', texto: 'Entregue' }
  if (o.situacao === 'DISPENSADA') return { tom: 'cinza', texto: 'Dispensada' }
  if (hoje) {
    const d = diasAte(o.prazo, hoje)
    if (d === 0) return { tom: 'ambar', texto: 'Vence hoje' }
    if (d > 0 && d <= 3) return { tom: 'ambar', texto: `Vence em ${d}d` }
  }
  return { tom: 'azul', texto: `Até ${dataDoPrazo(o.prazo)}` }
}

export function BlocoObrigacoes({
  lista, resumo, mes, hoje,
}: {
  lista: Consulta<Obrigacao[]>
  resumo: Consulta<ResumoObrigacoes>
  mes: string
  hoje: Date | null
}) {
  const carregando = lista === undefined || resumo === undefined
  const falhou = !carregando && (lista === null || resumo === null)

  const aEntregar = (lista ?? [])
    .filter((o) => o.situacao === 'ATRASADA' || o.situacao === 'EM_ANDAMENTO')
    .sort((a, b) => {
      if (a.situacao !== b.situacao) return a.situacao === 'ATRASADA' ? -1 : 1
      return new Date(a.prazo).getTime() - new Date(b.prazo).getTime()
    })

  const base = resumo ? resumo.total - resumo.dispensadas : 0
  const percentual = resumo && base > 0 ? Math.round((resumo.entregues / base) * 100) : null

  return (
    <Bloco
      icone={CalendarCheck}
      cor={TOM.verde}
      titulo={`Obrigações de ${mes}`}
      subtitulo={resumo ? `${resumo.total} no mês` : carregando ? 'Consultando…' : undefined}
      acao={<VerTudo href="/portal/obrigacoes">Ver calendário</VerTudo>}
    >
      {carregando ? <Carregando /> : falhou || !resumo || !lista ? <Falhou /> : resumo.total === 0 ? (
        <Vazio
          icone={CalendarCheck}
          titulo="Nenhuma obrigação neste mês"
          texto="O calendário da sua empresa aparece aqui assim que o escritório lançar as entregas do mês."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-[#eef2f7] border-b border-[#eef2f7] dark:divide-[#1b2739] dark:border-[#1b2739]">
            {([
              ['Entregues', resumo.entregues, 'text-[#1f9254] dark:text-[#6fcf97]'],
              ['A entregar', resumo.emAndamento, 'text-[#1a6dff] dark:text-[#7db0ff]'],
              ['Atrasadas', resumo.atrasadas, resumo.atrasadas > 0 ? 'text-[#c2362f] dark:text-[#f08a84]' : 'text-slate-400'],
            ] as const).map(([rotulo, n, cor]) => (
              <div key={rotulo} className="px-3 py-3 text-center">
                <p className={`text-[22px] font-bold leading-none tabular-nums ${cor}`}>{n}</p>
                <p className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">{rotulo}</p>
              </div>
            ))}
          </div>

          {percentual !== null && (
            <div className="px-5 pt-3">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#16233a]"
                role="progressbar"
                aria-valuenow={percentual}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Entregas do mês"
              >
                <div className="h-full rounded-full bg-[#1f9254] transition-[width] duration-700" style={{ width: `${percentual}%` }} />
              </div>
              <p className="mt-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">{percentual}% do mês entregue</p>
            </div>
          )}

          {aEntregar.length === 0 ? (
            <Vazio
              tom="ok"
              icone={CheckCircle2}
              titulo="Tudo entregue"
              texto={`Todas as obrigações de ${mes} já foram entregues.`}
            />
          ) : (
            <ul className="mt-2 divide-y divide-[#eef2f7] dark:divide-[#1b2739]">
              {aEntregar.slice(0, LIMITE_OBRIGACOES).map((o) => {
                const chip = chipDaObrigacao(o, hoje)
                return (
                  <li key={o.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{o.nome}</p>
                      <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                        {o.area ?? 'Sem área'} · prazo {dataDoPrazo(o.prazo)}
                      </p>
                    </div>
                    <Chip tom={chip.tom}>{chip.texto}</Chip>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </Bloco>
  )
}

// ── Documentos ────────────────────────────────────────────────────────────

const LIMITE_DOCUMENTOS = 6

function extensao(nome: string): string {
  const partes = nome.split('.')
  return partes.length > 1 ? (partes.pop() ?? '').slice(0, 4).toUpperCase() : 'ARQ'
}

export function BlocoDocumentos({ pasta, hoje, erro }: { pasta: Consulta<PastaDrive>; hoje: Date | null; erro?: string | null }) {
  const recentes = (pasta?.itens ?? [])
    .slice()
    .sort((a, b) => {
      const da = a.enviadoEm ?? a.modificadoEm
      const db = b.enviadoEm ?? b.modificadoEm
      return (db ? new Date(db).getTime() : 0) - (da ? new Date(da).getTime() : 0)
    })
    .slice(0, LIMITE_DOCUMENTOS)

  return (
    <Bloco
      icone={FolderOpen}
      cor={TOM.azul}
      titulo="Documentos recentes"
      subtitulo={pasta?.vinculada ? (pasta.nome ?? 'Pasta da sua empresa') : undefined}
      acao={<VerTudo href="/portal/documentos">Abrir documentos</VerTudo>}
    >
      {pasta === undefined ? <Carregando linhas={4} /> : pasta === null ? <Falhou mensagem={erro} /> : !pasta.vinculada ? (
        <Vazio
          icone={FolderOpen}
          titulo="Documentos indisponíveis"
          texto={pasta.motivo ?? 'O escritório ainda não configurou a pasta de documentos da sua empresa.'}
        />
      ) : recentes.length === 0 ? (
        <Vazio
          icone={FolderOpen}
          titulo="Nenhum documento ainda"
          texto="Quando o escritório publicar um arquivo, ou você enviar um, ele aparece aqui."
        />
      ) : (
        <ul className="divide-y divide-[#eef2f7] dark:divide-[#1b2739]">
          {recentes.map((item) => {
            const data = item.enviadoEm ?? item.modificadoEm
            return (
              <li key={item.id}>
                <Link
                  href="/portal/documentos"
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[#f7faff] dark:hover:bg-[#16233a]"
                >
                  {item.isPasta ? (
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TOM.ambar}`}>
                      <Folder className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9.5px] font-bold ${TOM.azul}`}>
                      {extensao(item.nome)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{item.nome}</p>
                    <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                      {item.isPasta ? 'Pasta' : item.enviadoPor ? `Enviado por ${item.enviadoPor}` : 'Na pasta da empresa'}
                    </p>
                  </div>
                  {data && (
                    <span className="shrink-0 text-[11.5px] text-slate-500 tabular-nums dark:text-slate-400">{quando(data, hoje)}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Bloco>
  )
}

// ── Equipe ────────────────────────────────────────────────────────────────

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1]![0] ?? '' : '')).toUpperCase()
}

export function BlocoEquipe({
  equipe, onEscrever,
}: {
  equipe: Consulta<AreaDaEquipe[]>
  /** Abre o modal de mensagem para a área. Sem ele, o botão não aparece. */
  onEscrever?: (area: AreaDaEquipe) => void
}) {
  return (
    <Bloco icone={Users} cor={TOM.azul} titulo="Sua equipe no escritório" subtitulo="Com quem falar, por área">
      {equipe === undefined ? <Carregando linhas={2} /> : equipe === null ? <Falhou /> : equipe.length === 0 ? (
        <Vazio
          icone={Users}
          titulo="Equipe a definir"
          texto="O escritório ainda não indicou os responsáveis pela sua empresa nas suas áreas."
        />
      ) : (
        <ul className="divide-y divide-[#eef2f7] dark:divide-[#1b2739]">
          {equipe.map((a) => (
            <li key={a.areaId} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1a6dff] to-[#0b4fd0] text-[12px] font-bold text-white">
                {a.responsavel ? iniciais(a.responsavel.nome) : '?'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{a.area}</p>
                <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  {a.responsavel?.nome ?? 'Responsável a definir'}
                </p>
                {a.substituto && (
                  <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">Substituto: {a.substituto.nome}</p>
                )}
              </div>
              {/* O e-mail sai pelo portal, e não por `mailto:`: assim chega mesmo
                  para quem não tem um programa de e-mail configurado, e a
                  mensagem já leva a empresa e a área. Aparece também quando só
                  há substituto — é para ele que o servidor manda nesse caso. */}
              {onEscrever && (a.responsavel || a.substituto) && (
                <button
                  type="button"
                  onClick={() => onEscrever(a)}
                  title="Escrever mensagem"
                  aria-label={`Escrever para ${(a.responsavel ?? a.substituto)!.nome}`}
                  className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-[#f2f7ff] hover:text-[#1a6dff] dark:hover:bg-[#16233a] dark:hover:text-[#7db0ff]"
                >
                  <Mail className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  )
}

// ── Acesso rápido ─────────────────────────────────────────────────────────

interface Recurso {
  titulo: string
  icone: typeof Clock
  cor: string
  href?: string
  /** Módulo do portal. Card de módulo que o escritório não liberou não aparece. */
  modulo: string
}

const RECURSOS: Recurso[] = [
  { titulo: 'Documentos', icone: FolderOpen, cor: TOM.azul, href: '/portal/documentos', modulo: 'documentos' },
  { titulo: 'Obrigações', icone: CalendarCheck, cor: TOM.verde, href: '/portal/obrigacoes', modulo: 'obrigacoes' },
  { titulo: 'Dashboard Financeiro', icone: BarChart3, cor: 'bg-[#e8f6fb] text-[#0b87b5] dark:bg-[#0f2230] dark:text-[#6cc7ea]', href: '/portal/bi', modulo: 'bi' },
  { titulo: 'Certidões', icone: FileCheck2, cor: 'bg-[#eef0fd] text-[#5b62d6] dark:bg-[#1a1d3a] dark:text-[#a3a8f0]', modulo: 'certidoes' },
  { titulo: 'Certificado digital', icone: ShieldCheck, cor: 'bg-[#fdeef5] text-[#c2477f] dark:bg-[#2a1320] dark:text-[#e98ab5]', modulo: 'certificado' },
  { titulo: 'Notas fiscais', icone: Receipt, cor: 'bg-[#e8f4f7] text-[#2b7f95] dark:bg-[#10242a] dark:text-[#7cc4d6]', modulo: 'notas' },
  { titulo: 'Atendimento', icone: LifeBuoy, cor: 'bg-[#f2eefd] text-[#7c4dd1] dark:bg-[#1e1633] dark:text-[#b59af0]', modulo: 'chamados' },
]

export function AcessoRapido({ liberados }: { liberados: Set<string> }) {
  const visiveis = RECURSOS.filter((r) => liberados.has(r.modulo))
  if (visiveis.length === 0) return null
  return (
    <Bloco icone={LayoutGrid} cor={TOM.cinza} titulo="Acesso rápido">
      <ul className="p-2">
        {visiveis.map((r) => {
          const conteudo = (
            <>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${r.cor}`}>
                <r.icone className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200">{r.titulo}</span>
              {r.href
                ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-[#1a6dff]" />
                : <Chip tom="cinza">em breve</Chip>}
            </>
          )
          return (
            <li key={r.modulo}>
              {r.href ? (
                <Link href={r.href} className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-[#f7faff] dark:hover:bg-[#16233a]">
                  {conteudo}
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-xl px-3 py-2 opacity-70">{conteudo}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Bloco>
  )
}

// ── Ajuda ─────────────────────────────────────────────────────────────────

/** O azul com a onda é a assinatura do portal; aqui, pequeno e no fim da coluna. */
export function CartaoAjuda() {
  return (
    <section className="anim-subir relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a6dff] to-[#0b4fd0] p-5 text-white">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-white/[0.08]"
        viewBox="0 0 400 80"
        preserveAspectRatio="none"
      >
        <path d="M0,44 C80,72 160,12 240,36 C300,54 350,30 400,40 L400,80 L0,80 Z" fill="currentColor" />
      </svg>
      <div className="relative">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
          <LifeBuoy className="h-[18px] w-[18px]" />
        </span>
        <p className="mt-3 text-[14px] font-bold">Precisa de algo que não está aqui?</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/80">
          Fale com a sua equipe no escritório pelos canais de sempre. As demais áreas do portal
          entram em etapas.
        </p>
      </div>
    </section>
  )
}
