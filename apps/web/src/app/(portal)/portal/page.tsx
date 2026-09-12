'use client'

import Link from 'next/link'
import {
  FolderOpen, CalendarCheck, LifeBuoy, FileCheck2, ShieldCheck, Receipt,
  ArrowRight, Clock, Upload, Inbox, Download, Sparkles,
} from 'lucide-react'

import { usePortal } from '../_lib/contexto'

/**
 * Início do Portal do Cliente.
 *
 * Repaginada sobre a gramática do LuminAux (starter-builder), que é a
 * referência visual do portal: sobrancelha em caixa alta com traço, título
 * grande com a segunda linha em cor, cards com chip de ícone, passos numerados
 * com o algarismo fantasma no canto, e faixa azul de fecho.
 *
 * O que NÃO veio do modelo: a linguagem de landing page. Aquilo ali vende um
 * produto; isto aqui é a casa de quem já é cliente. As mesmas peças, ditas no
 * indicativo — "seus documentos", não "ship your next app".
 *
 * A honestidade sobre o que ainda não existe foi mantida de propósito: cada
 * card diz se está no ar ou em breve. Prometer botão que não faz nada é pior
 * do que dizer o que falta.
 */

interface Recurso {
  titulo: string
  descricao: string
  icone: typeof FolderOpen
  /** Fundo do chip do ícone — a linguagem visual da referência. */
  cor: string
  href?: string
}

const RECURSOS: Recurso[] = [
  {
    titulo: 'Documentos',
    descricao: 'Baixe guias e relatórios, e envie suas notas e extratos — organizados em pastas.',
    icone: FolderOpen, cor: 'bg-[#eaf1ff] text-[#1a6dff]', href: '/portal/documentos',
  },
  {
    titulo: 'Pendências',
    descricao: 'O que o escritório está esperando de você, com prazo. Resolve ao anexar.',
    // As pendências vivem dentro de Documentos: sem o arquivo ao lado, uma
    // tela só de cobrança não resolve nada.
    icone: Clock, cor: 'bg-[#fdf0e6] text-[#d97b34]', href: '/portal/documentos',
  },
  {
    titulo: 'Obrigações do mês',
    descricao: 'O calendário das entregas da sua empresa e a situação de cada uma.',
    icone: CalendarCheck, cor: 'bg-[#e9f6ee] text-[#1f9254]',
  },
  {
    titulo: 'Certidões',
    descricao: 'Situação e PDF da última emissão de cada certidão negativa.',
    icone: FileCheck2, cor: 'bg-[#eef0fd] text-[#5b62d6]',
  },
  {
    titulo: 'Certificado digital',
    descricao: 'Titular, validade e aviso de vencimento do certificado da empresa.',
    icone: ShieldCheck, cor: 'bg-[#fdeef5] text-[#c2477f]',
  },
  {
    titulo: 'Notas fiscais',
    descricao: 'As notas capturadas da sua empresa, com XML e DANFE.',
    icone: Receipt, cor: 'bg-[#e8f4f7] text-[#2b7f95]',
  },
  {
    titulo: 'Atendimento',
    descricao: 'Abra um chamado e acompanhe as respostas sem depender do WhatsApp.',
    icone: LifeBuoy, cor: 'bg-[#f2eefd] text-[#7c4dd1]',
  },
]

/** Passos numerados, no formato do "How it works" do modelo. */
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

const ROTULO_NIVEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  OPERACIONAL: 'Operacional',
  CONSULTA: 'Consulta',
}

/**
 * Sobrancelha do modelo: traço, texto em caixa alta espaçado, na cor de
 * destaque. É o que separa uma seção da outra sem precisar de linha divisória.
 */
function Sobrancelha({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a6dff]">
      <span aria-hidden="true" className="h-px w-6 bg-[#1a6dff]/50" />
      {children}
    </p>
  )
}

export default function PortalInicioPage() {
  const { vinculo } = usePortal()
  const semArea = !vinculo || vinculo.areas.length === 0

  return (
    <div className="flex flex-col gap-14 pb-4">
      {/* ── Abertura ───────────────────────────────────────────────────
          O modelo abre com selo, título de duas linhas (a segunda em cor) e
          dois botões. Aqui a segunda linha é a frase que diz o que o portal
          faz, e o nome da empresa vem logo abaixo — é ele que ancora "onde
          eu estou", e como título gigante quebraria mal em razão social
          longa. */}
      <section className="flex flex-col items-start gap-4 pt-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf1ff] px-3 py-1 text-[11px] font-semibold text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]">
          <Sparkles className="h-3 w-3" />
          Portal do cliente
        </span>

        <h1 className="max-w-3xl text-[34px] font-bold leading-[1.1] tracking-tight text-balance text-slate-900 sm:text-[42px] dark:text-slate-100">
          Seus documentos,
          <br />
          <span className="text-[#1a6dff]">no lugar certo.</span>
        </h1>

        <p className="max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {vinculo?.razaoSocial ?? 'Sua empresa'}
          </span>
          {' · '}
          acesso {ROTULO_NIVEL[vinculo?.nivel ?? ''] ?? '—'}
          {semArea
            ? <>, ainda sem área liberada — fale com o escritório.</>
            : <> em {vinculo!.areas.length} área(s) contratada(s).</>}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <Link
            href="/portal/documentos"
            className="inline-flex items-center gap-2 rounded-lg bg-[#1a6dff] px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#0b4fd0]"
          >
            <FolderOpen className="h-4 w-4" />
            Abrir documentos
          </Link>
          <a
            href="#recursos"
            className="inline-flex items-center gap-2 rounded-lg border border-[#dbe7fb] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-slate-700 transition-colors hover:bg-[#f2f7ff] dark:border-[#1b2739] dark:bg-[#0e1726] dark:text-slate-300 dark:hover:bg-[#16233a]"
          >
            O que tem aqui
          </a>
        </div>
      </section>

      {/* ── Como funciona ──────────────────────────────────────────────
          Passos numerados com o algarismo fantasma no canto, como no modelo.
          A numeração não é enfeite: o vaivém de documento É uma sequência, e
          a ordem diz quem faz o quê. */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Sobrancelha>Como funciona</Sobrancelha>
          <h2 className="max-w-2xl text-[26px] font-bold leading-tight tracking-tight text-balance text-slate-900 sm:text-[30px] dark:text-slate-100">
            Do envio à entrega, sem caixa de e-mail no meio
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <div
              key={p.titulo}
              className="relative overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white p-5 dark:border-[#1b2739] dark:bg-[#0e1726]"
            >
              <span
                aria-hidden="true"
                className="absolute right-4 top-2 text-[44px] font-bold leading-none text-[#1a6dff]/10 dark:text-[#7db0ff]/10"
              >
                {i + 1}
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]">
                <p.icone className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[14px] font-bold text-slate-900 dark:text-slate-100">{p.titulo}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                {p.descricao}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recursos ───────────────────────────────────────────────────── */}
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map(r => {
            const conteudo = (
              <>
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${r.cor}`}>
                  <r.icone className="h-5 w-5" />
                </span>
                <span className="mt-3 flex items-center gap-2">
                  <span className="text-[14px] font-bold text-slate-900 dark:text-slate-100">{r.titulo}</span>
                  {!r.href && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-[#16233a] dark:text-slate-400">
                      em breve
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                  {r.descricao}
                </span>
                {r.href && (
                  <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#1a6dff]">
                    Abrir <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </>
            )
            const classe = 'flex flex-col rounded-2xl border border-[#e6ebf2] bg-white p-5 dark:border-[#1b2739] dark:bg-[#0e1726]'
            return r.href
              ? (
                <Link
                  key={r.titulo}
                  href={r.href}
                  className={`${classe} transition-all hover:-translate-y-0.5 hover:border-[#dbe7fb] hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none`}
                >
                  {conteudo}
                </Link>
              )
              : <div key={r.titulo} className={`${classe} opacity-75`}>{conteudo}</div>
          })}
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
  )
}
