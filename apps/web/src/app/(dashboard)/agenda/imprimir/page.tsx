'use client'

/**
 * Resumo do dia da agenda, pronto para imprimir.
 *
 * Existe porque a agenda na tela é um calendário — boa para navegar, ruim para
 * levar. Quem começa o dia querendo saber "o que tenho hoje" precisa de uma
 * folha: compromissos em ordem de hora, com quem, onde, e as tarefas que vencem.
 *
 * Página separada, e não um `@media print` na agenda, porque o que se imprime
 * NÃO é o que está na tela: o calendário vira lista, o mês vira um dia, e os
 * eventos ganham os detalhes que a célula da grade não cabe. Esconder metade da
 * tela com CSS daria um papel pior e um código mais difícil de mexer.
 */

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Printer, Loader2, Clock, MapPin, Users, CheckSquare, Link2 } from 'lucide-react'
import { Button } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'
import { resolveAssetUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-administrativo, #38bdf8)'

type Participante = {
  id: string
  nomeAvulso: string | null
  usuario: { id: string; name: string } | null
}

type Evento = {
  id: string
  titulo: string
  descricao: string | null
  data: string
  dataFim: string | null
  horaInicio: string | null
  horaFim: string | null
  diaInteiro: boolean
  local: string | null
  contato: string | null
  link: string | null
  sala: string | null
  particular: boolean
  isTarefa: boolean
  tipo: { nome: string; cor: string }
  criador: { name: string }
  participantes: Participante[]
}

type Tarefa = {
  id: string
  titulo: string
  descricao: string | null
  prazo: string
  horaPrazo: string | null
  concluida: boolean
  prioridade: 'BAIXA' | 'NORMAL' | 'ALTA'
  criador?: { name: string } | null
}

const PRIORIDADE_ROTULO: Record<Tarefa['prioridade'], string> = {
  ALTA: 'Alta', NORMAL: 'Normal', BAIXA: 'Baixa',
}

/** `2026-08-28` → `sexta-feira, 28 de agosto de 2026`. */
function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

function hoje(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Nome de quem participa: usuário do sistema ou convidado digitado à mão. */
function nomeParticipante(p: Participante): string {
  return p.usuario?.name || p.nomeAvulso || 'Sem nome'
}

function ImprimirAgendaConteudo() {
  const router = useRouter()
  const params = useSearchParams()
  const dia = params.get('data') || hoje()

  const { empresa } = useEmpresaAtiva()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    void (async () => {
      const [evs, tfs] = await Promise.all([
        trpc.agenda.listEventos.query({ dataInicio: dia, dataFim: dia })
          .then(r => r as Evento[]).catch(() => [] as Evento[]),
        (trpc.agenda.tarefa as never as {
          list: { query: (i: { dataInicio: string; dataFim: string; apenasAbertas?: boolean }) => Promise<Tarefa[]> }
        }).list.query({ dataInicio: dia, dataFim: dia })
          .catch(() => [] as Tarefa[]),
      ])
      if (cancelado) return
      setEventos(evs)
      setTarefas(tfs)
      setCarregando(false)
    })()
    return () => { cancelado = true }
  }, [dia])

  // Dia inteiro primeiro — não tem hora para ordenar e vale para o dia todo.
  const emOrdem = useMemo(() => [...eventos].sort((a, b) => {
    if (a.diaInteiro !== b.diaInteiro) return a.diaInteiro ? -1 : 1
    return (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '')
  }), [eventos])

  const abertas = tarefas.filter(t => !t.concluida)
  const concluidas = tarefas.filter(t => t.concluida)

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[820px]">
      {/* Barra de ações — some na impressão */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push('/agenda')}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Dia
          <input
            type="date"
            value={dia}
            onChange={e => router.replace(`/agenda/imprimir?data=${e.target.value}`)}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground"
          />
        </label>
        <Button
          size="sm" className="gap-1.5 text-white"
          style={{ backgroundColor: MODULE_COLOR }}
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="dia-doc">
        <div className="cabecalho">
          <div className="identidade">
            {empresa?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveAssetUrl(empresa.logoUrl)} alt="" className="logo" />
            )}
            <div>
              <p className="empresa">{empresa?.nomeFantasia || empresa?.razaoSocial || 'Agenda'}</p>
              <p className="subtitulo">Resumo do dia</p>
            </div>
          </div>
          <div className="data">
            <p className="data-extenso">{dataPorExtenso(dia)}</p>
            <p className="contagem">
              {emOrdem.length} compromisso{emOrdem.length === 1 ? '' : 's'}
              {abertas.length > 0 && ` · ${abertas.length} tarefa${abertas.length === 1 ? '' : 's'} em aberto`}
            </p>
          </div>
        </div>

        <section className="secao">
          <h2>Compromissos</h2>
          {emOrdem.length === 0 ? (
            <p className="vazio">Nenhum compromisso neste dia.</p>
          ) : (
            <ul className="lista">
              {emOrdem.map(ev => (
                <li key={ev.id} className="evento">
                  <div className="hora">
                    {ev.diaInteiro
                      ? <span className="dia-inteiro">Dia inteiro</span>
                      : <>
                          <Clock className="ico" />
                          {ev.horaInicio ?? '—'}
                          {ev.horaFim && <span className="ate">até {ev.horaFim}</span>}
                        </>}
                  </div>
                  <div className="corpo">
                    <p className="titulo">
                      <span className="marca" style={{ backgroundColor: ev.tipo.cor }} />
                      {/* Evento particular de outra pessoa nunca chega aqui — o
                          backend já filtra. O que chega é o particular de quem
                          imprime, e o papel avisa para não deixá-lo na mesa. */}
                      {ev.titulo}
                      {ev.particular && <span className="etiqueta">particular</span>}
                    </p>
                    <p className="meta">
                      {ev.tipo.nome}
                      {(ev.local || ev.sala) && <> · <MapPin className="ico" />{ev.sala || ev.local}</>}
                      {ev.participantes.length > 0 && (
                        <> · <Users className="ico" />{ev.participantes.map(nomeParticipante).join(', ')}</>
                      )}
                    </p>
                    {ev.contato && <p className="meta">Contato: {ev.contato}</p>}
                    {ev.link && <p className="meta"><Link2 className="ico" />{ev.link}</p>}
                    {ev.descricao && <p className="descricao">{ev.descricao}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="secao">
          <h2>Tarefas com prazo hoje</h2>
          {tarefas.length === 0 ? (
            <p className="vazio">Nenhuma tarefa vence hoje.</p>
          ) : (
            <ul className="lista">
              {[...abertas, ...concluidas].map(t => (
                <li key={t.id} className="tarefa">
                  {/* Quadradinho para marcar à caneta: quem imprime o dia
                      costuma riscar o que fez ao longo dele. */}
                  <span className={`caixa${t.concluida ? ' feita' : ''}`}>
                    {t.concluida && <CheckSquare className="ico" />}
                  </span>
                  <div className="corpo">
                    <p className={`titulo${t.concluida ? ' riscado' : ''}`}>
                      {t.titulo}
                      {t.prioridade !== 'NORMAL' && (
                        <span className="etiqueta">{PRIORIDADE_ROTULO[t.prioridade].toLowerCase()}</span>
                      )}
                    </p>
                    <p className="meta">
                      {t.horaPrazo ? `até ${t.horaPrazo}` : 'sem hora definida'}
                      {t.criador?.name && ` · ${t.criador.name}`}
                    </p>
                    {t.descricao && <p className="descricao">{t.descricao}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="rodape">
          <span>{empresa?.razaoSocial ?? ''}</span>
          <span>Impresso em {new Date().toLocaleString('pt-BR')}</span>
        </div>
      </div>

      <style jsx global>{`
        .dia-doc {
          background: #fff;
          color: #111827;
          padding: 32px 36px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          font-size: 12.5px;
          line-height: 1.5;
        }

        .dia-doc .cabecalho {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid ${'#e5e7eb'};
        }
        .dia-doc .identidade { display: flex; align-items: center; gap: 12px; }
        .dia-doc .logo { height: 40px; width: auto; object-fit: contain; }
        .dia-doc .empresa { font-size: 15px; font-weight: 700; margin: 0; }
        .dia-doc .subtitulo { font-size: 11px; color: #6b7280; margin: 2px 0 0; }
        .dia-doc .data { text-align: right; }
        .dia-doc .data-extenso {
          margin: 0; font-size: 14px; font-weight: 600; text-transform: capitalize;
        }
        .dia-doc .contagem { margin: 2px 0 0; font-size: 11px; color: #6b7280; }

        .dia-doc .secao { margin-top: 22px; }
        .dia-doc .secao h2 {
          font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #6b7280;
          margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6;
        }
        .dia-doc .vazio { color: #9ca3af; font-style: italic; margin: 6px 0; }

        .dia-doc .lista { list-style: none; margin: 0; padding: 0; }
        .dia-doc .evento, .dia-doc .tarefa {
          display: flex; gap: 14px;
          padding: 10px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .dia-doc .hora {
          width: 92px; flex-shrink: 0;
          font-weight: 600; font-variant-numeric: tabular-nums;
          display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
        }
        .dia-doc .hora .ate { font-weight: 400; color: #6b7280; font-size: 11px; width: 100%; }
        .dia-doc .dia-inteiro { font-size: 11px; color: #6b7280; font-weight: 600; }

        .dia-doc .corpo { min-width: 0; flex: 1; }
        .dia-doc .titulo {
          margin: 0; font-weight: 600; font-size: 13px;
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        }
        .dia-doc .titulo.riscado { text-decoration: line-through; color: #9ca3af; }
        .dia-doc .marca {
          width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0;
        }
        .dia-doc .etiqueta {
          font-size: 9.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.04em; color: #6b7280;
          border: 1px solid #e5e7eb; border-radius: 999px; padding: 0 6px;
        }
        .dia-doc .meta {
          margin: 3px 0 0; font-size: 11px; color: #6b7280;
          display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        }
        .dia-doc .descricao {
          margin: 5px 0 0; font-size: 11.5px; color: #374151;
          white-space: pre-wrap;
        }
        .dia-doc .ico { width: 11px; height: 11px; flex-shrink: 0; }

        .dia-doc .caixa {
          width: 15px; height: 15px; margin-top: 2px; flex-shrink: 0;
          border: 1.5px solid #9ca3af; border-radius: 3px;
          display: flex; align-items: center; justify-content: center;
        }
        .dia-doc .caixa.feita { border-color: #d1d5db; color: #9ca3af; }

        .dia-doc .rodape {
          margin-top: 26px; padding-top: 14px;
          border-top: 1px solid #e5e7eb;
          font-size: 10px; color: #9ca3af;
          display: flex; justify-content: space-between;
        }

        @media print {
          /* Esconde todo o chrome do dashboard — só o documento imprime. */
          body * { visibility: hidden !important; }
          .dia-doc, .dia-doc * { visibility: visible !important; }
          .no-print { display: none !important; }
          .dia-doc {
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important; max-width: 100% !important;
            margin: 0 !important;
            /* Reserva o rodapé fixo para ele não cobrir a última linha. */
            padding: 0 0 46px 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          body { background: #fff !important; margin: 0 !important; padding: 0 !important; }

          /* A bolinha do tipo é o que distingue reunião de visita à primeira
             vista; sem isto o navegador a imprime branca. */
          .dia-doc .marca {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* position:fixed dentro de @media print repete o elemento em toda página. */
          .dia-doc .rodape {
            position: fixed !important;
            bottom: 0 !important; left: 0 !important; right: 0 !important;
            margin: 0 !important; background: #fff !important;
          }

          /* Compromisso cortado ao meio entre duas folhas é o pior defeito
             possível num papel que se lê correndo. */
          .dia-doc .evento, .dia-doc .tarefa { break-inside: avoid; page-break-inside: avoid; }
          .dia-doc .secao h2 { break-after: avoid; page-break-after: avoid; }
        }
      `}</style>
    </div>
  )
}

export default function ImprimirAgendaPage() {
  // `useSearchParams` exige Suspense no App Router.
  return (
    <Suspense fallback={<div className="py-24 text-center text-muted-foreground">Carregando…</div>}>
      <ImprimirAgendaConteudo />
    </Suspense>
  )
}
