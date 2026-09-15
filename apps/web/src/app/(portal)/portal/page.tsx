'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FolderOpen, CalendarCheck, LifeBuoy, FileCheck2, ShieldCheck, Receipt,
  ArrowRight, Clock, Upload, Inbox, Download, LayoutGrid,
} from 'lucide-react'

import { trpc } from '@/lib/trpc'
import { usePortal } from '../_lib/contexto'
import {
  AberturaPortal, EmNumeros, type Consulta, type ResumoObrigacoes,
} from '../_components/abertura-portal'

/**
 * Início do Portal do Cliente.
 *
 * Repaginada sobre a gramática do LuminAux (starter-builder), que é a
 * referência visual do portal: céu azul desfocado, título com a segunda linha
 * digitada, janela de terminal, card de números, sobrancelha em caixa alta com
 * traço, cards com chip de ícone e faixa azul de fecho.
 *
 * O miolo segue a seção "Build your starter" do modelo: UM card branco com
 * um passo-a-passo vertical (círculos ligados por uma linha) ao lado do
 * conteúdo. Lá o passo-a-passo fica à esquerda porque é navegação; aqui ele
 * vai à DIREITA e os módulos à esquerda, porque o que a pessoa veio fazer é
 * abrir um módulo — o passo-a-passo explica, não conduz.
 *
 * O que NÃO veio do modelo: a linguagem de landing page. Aquilo ali vende um
 * produto; isto aqui é a casa de quem já é cliente. As mesmas peças, ditas no
 * indicativo — "seus documentos", não "ship your next app".
 *
 * A honestidade sobre o que ainda não existe foi mantida de propósito: cada
 * módulo diz se está no ar ou em breve. Prometer botão que não faz nada é pior
 * do que dizer o que falta.
 */

interface Recurso {
  titulo: string
  descricao: string
  icone: typeof FolderOpen
  /** Fundo do chip do ícone — a linguagem visual da referência. */
  cor: string
  href?: string
  /**
   * Módulo a que este card pertence.
   *
   * Card de módulo que o escritório não liberou some da home — prometer aqui
   * o que o menu esconde e a rota recusa seria anunciar uma porta que não
   * existe. Pendências não tem: ela vive dentro de Documentos.
   */
  modulo?: string
}

const RECURSOS: Recurso[] = [
  {
    titulo: 'Documentos',
    descricao: 'Baixe guias e relatórios, e envie suas notas e extratos — organizados em pastas.',
    icone: FolderOpen, cor: 'bg-[#eaf1ff] text-[#1a6dff]', href: '/portal/documentos', modulo: 'documentos',
  },
  {
    titulo: 'Pendências',
    descricao: 'O que o escritório está esperando de você, com prazo. Resolve ao anexar.',
    // As pendências vivem dentro de Documentos: sem o arquivo ao lado, uma
    // tela só de cobrança não resolve nada.
    icone: Clock, cor: 'bg-[#fdf0e6] text-[#d97b34]', href: '/portal/documentos', modulo: 'documentos',
  },
  {
    titulo: 'Obrigações do mês',
    descricao: 'O calendário das entregas da sua empresa e a situação de cada uma.',
    icone: CalendarCheck, cor: 'bg-[#e9f6ee] text-[#1f9254]', href: '/portal/obrigacoes', modulo: 'obrigacoes',
  },
  {
    titulo: 'Certidões',
    descricao: 'Situação e PDF da última emissão de cada certidão negativa.',
    icone: FileCheck2, cor: 'bg-[#eef0fd] text-[#5b62d6]', modulo: 'certidoes',
  },
  {
    titulo: 'Certificado digital',
    descricao: 'Titular, validade e aviso de vencimento do certificado da empresa.',
    icone: ShieldCheck, cor: 'bg-[#fdeef5] text-[#c2477f]', modulo: 'certificado',
  },
  {
    titulo: 'Notas fiscais',
    descricao: 'As notas capturadas da sua empresa, com XML e DANFE.',
    icone: Receipt, cor: 'bg-[#e8f4f7] text-[#2b7f95]', modulo: 'notas',
  },
  {
    titulo: 'Atendimento',
    descricao: 'Abra um chamado e acompanhe as respostas sem depender do WhatsApp.',
    icone: LifeBuoy, cor: 'bg-[#f2eefd] text-[#7c4dd1]', modulo: 'chamados',
  },
]

/**
 * O passo-a-passo. A numeração não é enfeite: o vaivém de documento É uma
 * sequência, e a ordem diz quem faz o quê.
 */
const PASSOS: Array<{ titulo: string; descricao: string; icone: typeof Upload }> = [
  {
    titulo: 'O escritório publica',
    descricao: 'Guias, relatórios e documentos aparecem aqui assim que ficam prontos.',
    icone: Download,
  },
  {
    titulo: 'Você envia o que falta',
    descricao: 'Arraste o arquivo para a pasta certa. As pendências se resolvem ao anexar.',
    icone: Upload,
  },
  {
    titulo: 'Fica tudo registrado',
    descricao: 'Quem enviou, quando e o quê — sem depender de e-mail nem de WhatsApp.',
    icone: Inbox,
  },
]

/**
 * O pedaço da API do portal que a home lê. Tipado aqui, e não com `any`, para
 * que uma mudança no formato quebre a compilação em vez da tela.
 */
interface PortalApiDaHome {
  solicitacoes: { pendentes: { query(i: { clienteId: string }): Promise<unknown[]> } }
  obrigacoes: { resumo: { query(i: { clienteId: string; competencia: string }): Promise<ResumoObrigacoes> } }
}

/**
 * Competência corrente, AAAAMM. Sem ela o resumo conta o histórico inteiro,
 * e o card diria "no mês" de um número que não é do mês.
 */
function competenciaAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Sobrancelha do modelo: traço, texto em caixa alta espaçado, na cor de
 * destaque. É o que separa uma seção da outra sem precisar de linha divisória.
 */
function Sobrancelha({ children, alinhar = 'centro' }: { children: React.ReactNode; alinhar?: 'centro' | 'inicio' }) {
  return (
    <p className={`flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a6dff] ${alinhar === 'centro' ? 'justify-center' : ''}`}>
      <span aria-hidden="true" className="h-px w-6 bg-[#1a6dff]/50" />
      {children}
    </p>
  )
}

export default function PortalInicioPage() {
  const { clienteId, vinculo } = usePortal()

  /**
   * Só os cards de módulos liberados.
   *
   * O "em breve" continua existindo para o que está liberado mas ainda não
   * tem tela: são coisas diferentes. Um módulo desligado pelo escritório não
   * deve nem ser mencionado; um ligado sem tela é promessa em construção.
   */
  const liberados = new Set(vinculo?.modulos ?? [])
  const visiveis = RECURSOS.filter(r => !r.modulo || liberados.has(r.modulo))
  const temDocumentos = liberados.has('documentos')
  const temObrigacoes = liberados.has('obrigacoes')

  // Números da abertura. Só consulta o que o escritório liberou: a rota de um
  // módulo desligado responde "não encontrado", e isso não é um número.
  const [pendencias, setPendencias] = useState<Consulta<number>>(undefined)
  const [obrigacoes, setObrigacoes] = useState<Consulta<ResumoObrigacoes>>(undefined)

  useEffect(() => {
    if (!clienteId) return
    let vivo = true
    const api = trpc.portal as unknown as PortalApiDaHome
    setPendencias(undefined)
    setObrigacoes(undefined)
    if (temDocumentos) {
      api.solicitacoes.pendentes.query({ clienteId })
        .then(lista => { if (vivo) setPendencias(lista.length) })
        .catch(() => { if (vivo) setPendencias(null) })
    }
    if (temObrigacoes) {
      api.obrigacoes.resumo.query({ clienteId, competencia: competenciaAtual() })
        .then(r => { if (vivo) setObrigacoes(r) })
        .catch(() => { if (vivo) setObrigacoes(null) })
    }
    return () => { vivo = false }
  }, [clienteId, temDocumentos, temObrigacoes])

  // `gap-10` no celular: 56px entre seções é respiro no desktop e rolagem
  // desperdiçada numa tela de 390px.
  return (
    <div className="flex flex-col gap-10 pb-4 sm:gap-14">
      <AberturaPortal vinculo={vinculo} pendencias={pendencias} obrigacoes={obrigacoes} />

      {/* Container centralizado com bordas laterais, como no modelo: numa tela
          larga, cards esticados de ponta a ponta viram linhas longas demais
          para ler e deixam o conteúdo solto. Só o céu da abertura sangra. */}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 sm:gap-14">
      <EmNumeros vinculo={vinculo} pendencias={pendencias} obrigacoes={obrigacoes} />

      {/* ── Módulos + passo-a-passo ────────────────────────────────────
          Um card só, como o "Build your starter" do modelo: conteúdo de um
          lado, passo-a-passo vertical do outro, separados por uma linha e
          não por dois cards soltos. No celular empilha — módulos primeiro,
          que é o que se veio abrir. */}
      <section id="recursos" className="flex flex-col gap-6 scroll-mt-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <Sobrancelha>O que você encontra aqui</Sobrancelha>
          <h2 className="max-w-2xl text-[26px] font-bold leading-tight tracking-tight text-balance text-slate-900 sm:text-[30px] dark:text-slate-100">
            Tudo o que o escritório compartilha com você
          </h2>
          <p className="max-w-xl text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-400">
            As áreas entram em etapas. Assim que uma for liberada, ela aparece no menu
            do topo — e aqui sem o selo de &ldquo;em breve&rdquo;.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white shadow-sm lg:grid-cols-[minmax(0,1fr)_18rem] dark:border-[#1b2739] dark:bg-[#0e1726]">
          {/* Módulos */}
          <div className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3 border-b border-[#eef2f7] pb-4 dark:border-[#1b2739]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]">
                <LayoutGrid className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Módulos</p>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                  O que o escritório liberou para {vinculo?.razaoSocial ?? 'a sua empresa'}.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {visiveis.map(r => {
                const conteudo = (
                  <>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${r.cor}`}>
                      <r.icone className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{r.titulo}</span>
                        {!r.href && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-[#16233a] dark:text-slate-400">
                            em breve
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                        {r.descricao}
                      </span>
                    </span>
                    {r.href && (
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#1a6dff] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                    )}
                  </>
                )
                const classe = 'flex items-start gap-3 rounded-xl border border-[#e6ebf2] p-3.5 dark:border-[#1b2739]'
                return r.href
                  ? (
                    <Link
                      key={r.titulo}
                      href={r.href}
                      className={`group ${classe} transition-colors hover:border-[#1a6dff]/40 hover:bg-[#f7faff] focus-visible:border-[#1a6dff] focus-visible:outline-none dark:hover:bg-[#16233a]`}
                    >
                      {conteudo}
                    </Link>
                  )
                  : <div key={r.titulo} className={`${classe} opacity-75`}>{conteudo}</div>
              })}
            </div>
          </div>

          {/* Passo-a-passo vertical */}
          <aside className="border-t border-[#eef2f7] bg-[#f8fafd] p-5 sm:p-6 lg:border-l lg:border-t-0 dark:border-[#1b2739] dark:bg-[#0b1220]">
            <Sobrancelha alinhar="inicio">Como funciona</Sobrancelha>
            <p className="mt-2 text-[15px] font-bold leading-snug text-balance text-slate-900 dark:text-slate-100">
              Do envio à entrega, sem caixa de e-mail no meio
            </p>

            <ol className="mt-6 flex flex-col">
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className="relative flex gap-3 pb-6 last:pb-0">
                  {/* A linha liga um círculo ao próximo; o último não tem para onde ir. */}
                  {i < PASSOS.length - 1 && (
                    <span aria-hidden="true" className="absolute bottom-0 left-[17px] top-9 w-px bg-[#dbe7fb] dark:bg-[#1b2739]" />
                  )}
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dbe7fb] bg-white text-[#1a6dff] dark:border-[#1b2739] dark:bg-[#0e1726] dark:text-[#7db0ff]">
                    <p.icone className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#1a6dff]/70 dark:text-[#7db0ff]/70">
                      Passo {i + 1}
                    </p>
                    <p className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{p.titulo}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                      {p.descricao}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      {/* ── Fecho ──────────────────────────────────────────────────────
          A faixa azul com a onda é a assinatura de fecho do modelo. Aqui ela
          tem função: dizer para onde ir enquanto o portal não faz tudo. */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a6dff] to-[#0b4fd0] px-6 py-12 text-center text-white sm:px-10">
        {/* A onda é decorativa e fica atrás do conteúdo; `aria-hidden` para
            não virar ruído em leitor de tela. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-white/[0.07]"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path d="M0,64 C200,110 400,10 600,48 C800,86 1000,26 1200,64 L1200,120 L0,120 Z" fill="currentColor" />
        </svg>

        <div className="relative flex flex-col items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
            <LifeBuoy className="h-3 w-3" />
            Estamos por perto
          </span>
          <h2 className="max-w-2xl text-[24px] font-bold leading-tight tracking-tight text-balance sm:text-[28px]">
            Precisa de algo que ainda não está aqui?
          </h2>
          <p className="max-w-xl text-[13.5px] leading-relaxed text-white/80">
            Enquanto as demais áreas não entram, continue falando com a sua equipe de
            atendimento no escritório pelos canais de sempre.
          </p>
        </div>
      </section>
      </div>
    </div>
  )
}
