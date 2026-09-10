'use client'

import Link from 'next/link'
import {
  FolderOpen, CalendarCheck, LifeBuoy, FileCheck2, ShieldCheck, Receipt,
  ArrowRight, Clock,
} from 'lucide-react'

import { usePortal } from '../_lib/contexto'

/**
 * Início do Portal do Cliente.
 *
 * A tela existe hoje para orientar, não para operar: a Fase 0 entregou o acesso
 * (vínculo, escopo por cliente, convite e esta casca); os módulos chegam nas
 * fases seguintes. Prometer botões que não fazem nada seria pior do que dizer
 * o que ainda não está aqui — quem entra precisa saber o que esperar.
 */

interface Recurso {
  titulo: string
  descricao: string
  icone: typeof FolderOpen
  /** Fundo do quadrado do ícone — a linguagem visual da referência. */
  cor: string
  href?: string
  fase: 1 | 2 | 3
}

const RECURSOS: Recurso[] = [
  {
    titulo: 'Documentos',
    descricao: 'Baixe guias e relatórios, e envie suas notas e extratos — organizados por competência.',
    icone: FolderOpen, cor: 'bg-[#eaf1ff] text-[#1a6dff]', fase: 1,
  },
  {
    titulo: 'Pendências',
    descricao: 'O que o escritório está esperando de você, com prazo. Resolve ao anexar.',
    icone: Clock, cor: 'bg-[#fdf0e6] text-[#d97b34]', fase: 1,
  },
  {
    titulo: 'Obrigações do mês',
    descricao: 'O calendário das entregas da sua empresa e a situação de cada uma.',
    icone: CalendarCheck, cor: 'bg-[#e9f6ee] text-[#1f9254]', fase: 1,
  },
  {
    titulo: 'Certidões',
    descricao: 'Situação e PDF da última emissão de cada certidão negativa.',
    icone: FileCheck2, cor: 'bg-[#eef0fd] text-[#5b62d6]', fase: 2,
  },
  {
    titulo: 'Certificado digital',
    descricao: 'Titular, validade e aviso de vencimento do certificado da empresa.',
    icone: ShieldCheck, cor: 'bg-[#fdeef5] text-[#c2477f]', fase: 2,
  },
  {
    titulo: 'Notas fiscais',
    descricao: 'As notas capturadas da sua empresa, com XML e DANFE.',
    icone: Receipt, cor: 'bg-[#e8f4f7] text-[#2b7f95]', fase: 2,
  },
  {
    titulo: 'Atendimento',
    descricao: 'Abra um chamado e acompanhe as respostas sem depender do WhatsApp.',
    icone: LifeBuoy, cor: 'bg-[#f2eefd] text-[#7c4dd1]', fase: 3,
  },
]

const ROTULO_NIVEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  OPERACIONAL: 'Operacional',
  CONSULTA: 'Consulta',
}

export default function PortalInicioPage() {
  const { vinculo } = usePortal()

  return (
    <div className="flex flex-col gap-7">
      {/* Abertura. Diz onde a pessoa está e o que ela pode fazer — nesta
          empresa, com este nível. */}
      <section className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eaf1ff] px-3 py-1 text-[11px] font-semibold text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]">
          Portal do cliente
        </span>
        <h1 className="max-w-2xl text-[26px] font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
          {vinculo?.razaoSocial ?? 'Sua empresa'}
        </h1>
        <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">
          Seu acesso é <strong>{ROTULO_NIVEL[vinculo?.nivel ?? ''] ?? '—'}</strong>
          {vinculo && vinculo.areas.length > 0
            ? <> em {vinculo.areas.length} área(s) contratada(s).</>
            : <>, ainda sem área liberada — fale com o escritório.</>}
        </p>
      </section>

      {/* Estado do projeto. Honesto de propósito: a casca está no ar, o
          conteúdo vem em seguida. */}
      <section className="rounded-2xl border border-[#dbe7fb] bg-white p-6 dark:border-[#1b2739] dark:bg-[#0e1726]">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
          Seu acesso está ativo
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          A partir daqui você vai receber os documentos do escritório e enviar os seus, sem
          e-mail e sem WhatsApp. As áreas abaixo entram em etapas — assim que uma for
          liberada, ela aparece no menu do topo.
        </p>
      </section>

      {/* O que vem, e quando. Cada card é um recurso do plano. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
          O que você vai encontrar aqui
        </h2>
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
            const classe = 'flex flex-col rounded-2xl border border-[#e6ebf2] bg-white p-5 transition-shadow dark:border-[#1b2739] dark:bg-[#0e1726]'
            return r.href
              ? <Link key={r.titulo} href={r.href} className={`${classe} hover:shadow-md`}>{conteudo}</Link>
              : <div key={r.titulo} className={`${classe} opacity-75`}>{conteudo}</div>
          })}
        </div>
      </section>

      {/* Faixa de contato — o LuminAux fecha a página com um bloco azul.
          Aqui ele serve a um propósito: dizer para onde ir enquanto o portal
          não faz tudo. */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a6dff] to-[#0b4fd0] px-7 py-8 text-white">
        <h2 className="text-[19px] font-bold">Precisa de algo que ainda não está aqui?</h2>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-white/80">
          Enquanto as demais áreas não entram, continue falando com a sua equipe de
          atendimento no escritório pelos canais de sempre.
        </p>
      </section>
    </div>
  )
}
