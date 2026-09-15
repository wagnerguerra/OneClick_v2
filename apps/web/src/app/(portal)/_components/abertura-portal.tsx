'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FolderOpen, Sparkles } from 'lucide-react'

import type { VinculoPortal } from '../_lib/contexto'

/**
 * Abertura da home do portal, sobre a abertura do LuminAux (starter-builder):
 * céu azul desfocado atrás de tudo, título com a segunda linha sendo
 * digitada, uma "janela de terminal" à direita e, logo abaixo, o card de
 * números com pontos flutuando.
 *
 * A regra que vale para as duas peças: só dado real. No modelo o terminal
 * mostra um comando de exemplo e os números são do produto; aqui a janela lê
 * a empresa, o acesso, os módulos, as pendências e as obrigações do mês — e o
 * que não pôde ser consultado diz isso, em vez de mostrar zero.
 */

export interface ResumoObrigacoes {
  total: number
  entregues: number
  emAndamento: number
  atrasadas: number
  dispensadas: number
}

/** `undefined` = ainda consultando · `null` = não deu para consultar agora. */
export type Consulta<T> = T | null | undefined

const ROTULO_NIVEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  OPERACIONAL: 'Operacional',
  CONSULTA: 'Consulta',
}

const ROTULO_MODULO: Record<string, string> = {
  documentos: 'Documentos',
  obrigacoes: 'Obrigações',
  certidoes: 'Certidões',
  certificado: 'Certificado digital',
  notas: 'Notas fiscais',
  chamados: 'Atendimento',
}

/** A segunda linha do título, trocando como no "Ship your next …" do modelo. */
const FRASES = ['no lugar certo.', 'sempre à mão.', 'sem e-mail no meio.'] as const

function semMovimento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Digita e apaga as frases em ciclo. Sem movimento, fica na primeira — que é
 * a frase completa do título, então nada se perde.
 */
function useDigitacao(frases: readonly string[]): string {
  const [texto, setTexto] = useState(frases[0] ?? '')
  useEffect(() => {
    if (semMovimento() || frases.length < 2) return
    let indice = 0
    let pos = (frases[0] ?? '').length
    let apagando = true
    let timer: ReturnType<typeof setTimeout>
    const passo = () => {
      const alvo = frases[indice] ?? ''
      if (apagando) {
        if (pos > 0) {
          pos -= 1
          setTexto(alvo.slice(0, pos))
          timer = setTimeout(passo, 35)
        } else {
          apagando = false
          indice = (indice + 1) % frases.length
          timer = setTimeout(passo, 280)
        }
      } else if (pos < alvo.length) {
        pos += 1
        setTexto(alvo.slice(0, pos))
        timer = setTimeout(passo, 70)
      } else {
        apagando = true
        timer = setTimeout(passo, 2600)
      }
    }
    timer = setTimeout(passo, 2600)
    return () => clearTimeout(timer)
  }, [frases])
  return texto
}

/** Conta de 0 até o valor, como os números do modelo. Sem movimento, mostra direto. */
function useContagem(alvo: number | null): number {
  const [valor, setValor] = useState(0)
  useEffect(() => {
    if (alvo == null) return
    if (semMovimento()) { setValor(alvo); return }
    let quadro = 0
    const inicio = performance.now()
    const duracao = 900
    const tique = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / duracao)
      setValor(Math.round(alvo * (1 - Math.pow(1 - p, 3))))
      if (p < 1) quadro = requestAnimationFrame(tique)
    }
    quadro = requestAnimationFrame(tique)
    return () => cancelAnimationFrame(quadro)
  }, [alvo])
  return valor
}

function textoPendencias(v: Consulta<number>): string {
  if (v === undefined) return 'consultando…'
  if (v === null) return 'indisponível agora'
  if (v === 0) return 'nenhuma em aberto'
  return `${v} aguardando envio`
}

function textoObrigacoes(v: Consulta<ResumoObrigacoes>): string {
  if (v === undefined) return 'consultando…'
  if (v === null) return 'indisponível agora'
  if (v.total === 0) return 'nenhuma neste mês'
  const partes = [`${v.entregues} entregue(s)`, `${v.emAndamento} em andamento`]
  if (v.atrasadas > 0) partes.push(`${v.atrasadas} atrasada(s)`)
  return partes.join(' · ')
}

interface Props {
  vinculo: VinculoPortal | null
  pendencias: Consulta<number>
  obrigacoes: Consulta<ResumoObrigacoes>
}

type Linha = { tipo: 'comando' | 'saida' | 'ok'; texto: string }

export function AberturaPortal({ vinculo, pendencias, obrigacoes }: Props) {
  const segundaLinha = useDigitacao(FRASES)
  const liberados = new Set(vinculo?.modulos ?? [])
  const areas = vinculo?.areas.length ?? 0
  const nivel = ROTULO_NIVEL[vinculo?.nivel ?? ''] ?? '—'
  const modulos = (vinculo?.modulos ?? []).map(m => ROTULO_MODULO[m]).filter((m): m is string => !!m)

  const linhas: Linha[] = [
    { tipo: 'comando', texto: 'empresa' },
    { tipo: 'saida', texto: vinculo?.razaoSocial ?? 'Sua empresa' },
    { tipo: 'saida', texto: `acesso ${nivel} · ${areas > 0 ? `${areas} área(s) contratada(s)` : 'sem área liberada'}` },
    { tipo: 'comando', texto: 'modulos' },
    { tipo: 'saida', texto: modulos.length > 0 ? modulos.join(' · ') : 'nenhum liberado ainda' },
    ...(liberados.has('documentos')
      ? [{ tipo: 'comando', texto: 'pendencias' } as Linha, { tipo: 'saida', texto: textoPendencias(pendencias) } as Linha]
      : []),
    ...(liberados.has('obrigacoes')
      ? [{ tipo: 'comando', texto: 'obrigacoes --mes' } as Linha, { tipo: 'saida', texto: textoObrigacoes(obrigacoes) } as Linha]
      : []),
    { tipo: 'ok', texto: 'tudo pronto para você' },
  ]

  return (
    <section className="relative -mx-5 -mt-8 overflow-hidden px-5 pb-20 pt-10 sm:-mx-7 sm:px-7 sm:pt-14">
      {/* ── Céu ─────────────────────────────────────────────────────────
          Manchas azuis desfocadas atrás de tudo e a curva clara de fecho, na
          cor do fundo da página, como no modelo. Decorativo. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-10 h-[440px] w-[620px] rounded-full bg-[#1a6dff]/20 blur-3xl dark:bg-[#1a6dff]/15" />
        <div className="absolute -top-32 left-[35%] h-[380px] w-[560px] rounded-full bg-[#62a6ff]/25 blur-3xl dark:bg-[#1a6dff]/10" />
        <div className="absolute -right-32 top-6 h-[420px] w-[520px] rounded-full bg-[#9fc5ff]/30 blur-3xl dark:bg-[#12408a]/25" />
        <svg
          className="absolute inset-x-0 bottom-0 h-14 w-full text-[#f6f8fb] dark:text-[#0b1220]"
          viewBox="0 0 1440 56"
          preserveAspectRatio="none"
        >
          <path d="M0,56 L0,38 C360,2 1080,2 1440,38 L1440,56 Z" fill="currentColor" />
        </svg>
      </div>

      {/* O céu sangra até as bordas; o conteúdo fica no mesmo container
          centralizado do resto da home, como no modelo. */}
      <div className="relative mx-auto grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-12">
        {/* ── Texto ─────────────────────────────────────────────────── */}
        <div className="flex flex-col items-start gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dbe8ff] px-3 py-1 text-[11px] font-semibold text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]">
            <Sparkles className="h-3 w-3" />
            Portal do cliente
          </span>

          <h1
            aria-label="Seus documentos, no lugar certo."
            className="max-w-3xl text-[36px] font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-[48px] dark:text-slate-100"
          >
            <span aria-hidden="true">Seus documentos,</span>
            <br />
            {/* A altura da linha fica reservada: apagar a frase não pode fazer
                o resto da abertura pular. */}
            <span aria-hidden="true" className="inline-block min-h-[1.08em] text-[#1a6dff]">
              {segundaLinha}
              <span className="portal-cursor ml-0.5 inline-block h-[0.85em] w-[3px] translate-y-[0.08em] rounded-full bg-[#1a6dff]/70" />
            </span>
          </h1>

          <p className="max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            Guias, relatórios, pendências e o andamento da sua contabilidade, num lugar só —
            publicados pelo escritório e com registro de tudo o que você envia.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <Link
              href="/portal/documentos"
              className="inline-flex items-center gap-2 rounded-lg bg-[#1a6dff] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-sm shadow-[#1a6dff]/30 transition-colors hover:bg-[#0b4fd0]"
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
        </div>

        {/* ── Janela ─────────────────────────────────────────────────
            Escura nos dois temas, como o terminal do modelo. As linhas entram
            em sequência; o `aria-live` fica de fora de propósito — os números
            chegam depois e anunciar cada troca seria ruído. */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl shadow-[#1a6dff]/20">
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="min-w-0 flex-1 truncate pr-10 text-center font-mono text-[11.5px] text-slate-400">
              ~/portal-do-cliente — {vinculo?.escritorio?.nome ?? 'escritório'}
            </span>
          </div>
          <div className="space-y-1.5 px-5 py-5 font-mono text-[12.5px] leading-relaxed">
            {linhas.map((l, i) => (
              <p
                key={`${i}-${l.tipo}`}
                className="portal-linha break-words"
                style={{ animationDelay: `${120 + i * 220}ms` }}
              >
                {l.tipo === 'comando' && (
                  <>
                    <span className="text-[#28c840]">$</span>{' '}
                    <span className="font-semibold text-slate-100">{l.texto}</span>
                  </>
                )}
                {l.tipo === 'saida' && (
                  <>
                    <span className="text-slate-500">→</span>{' '}
                    <span className="text-slate-300">{l.texto}</span>
                  </>
                )}
                {l.tipo === 'ok' && (
                  <span className="text-[#28c840]">
                    ✓ {l.texto}
                    <span className="portal-cursor ml-1.5 inline-block h-3.5 w-2 translate-y-0.5 bg-[#28c840]" />
                  </span>
                )}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Posições fixas dos pontos: sorteio a cada render faria a tela piscar. */
const PONTOS = [
  { top: '14%', left: '9%', tamanho: 4, atraso: 0 },
  { top: '10%', left: '38%', tamanho: 3, atraso: 2.4 },
  { top: '24%', left: '86%', tamanho: 5, atraso: 1.2 },
  { top: '46%', left: '22%', tamanho: 3, atraso: 3.6 },
  { top: '58%', left: '64%', tamanho: 4, atraso: 0.8 },
  { top: '72%', left: '6%', tamanho: 5, atraso: 2 },
  { top: '82%', left: '48%', tamanho: 3, atraso: 4.2 },
  { top: '66%', left: '93%', tamanho: 4, atraso: 1.6 },
]

const COLUNAS: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
}

function Numero({ valor, rotulo, nota }: { valor: Consulta<number>; rotulo: string; nota?: string }) {
  const contado = useContagem(valor ?? null)
  return (
    <div className="flex flex-col-reverse items-center gap-2 text-center">
      <dt className="text-[13px] text-slate-500 dark:text-slate-400">
        {rotulo}
        {nota && <span className="block text-[11.5px] text-slate-400 dark:text-slate-500">{nota}</span>}
      </dt>
      <dd className="text-[40px] font-bold leading-none tracking-tight text-[#1a6dff] tabular-nums dark:text-[#7db0ff]">
        {valor == null ? '—' : contado}
      </dd>
    </div>
  )
}

export function EmNumeros({ vinculo, pendencias, obrigacoes }: Props) {
  const liberados = new Set(vinculo?.modulos ?? [])
  const itens: Array<{ rotulo: string; valor: Consulta<number>; nota?: string }> = [
    { rotulo: 'Módulos liberados', valor: vinculo ? vinculo.modulos.length : undefined },
    { rotulo: 'Áreas contratadas', valor: vinculo ? vinculo.areas.length : undefined },
    ...(liberados.has('documentos') ? [{ rotulo: 'Pendências em aberto', valor: pendencias }] : []),
    ...(liberados.has('obrigacoes')
      ? [{
          rotulo: 'Obrigações entregues no mês',
          valor: obrigacoes === undefined ? undefined : obrigacoes === null ? null : obrigacoes.entregues,
          nota: obrigacoes ? `de ${obrigacoes.total}` : undefined,
        }]
      : []),
  ]

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white/70 px-6 py-10 dark:border-[#1b2739] dark:bg-[#0e1726]/70">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {PONTOS.map((p, i) => (
          <span
            key={i}
            className="portal-ponto absolute rounded-full bg-[#1a6dff]/40 dark:bg-[#7db0ff]/40"
            style={{ top: p.top, left: p.left, width: p.tamanho, height: p.tamanho, animationDelay: `${p.atraso}s` }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center gap-3 text-center">
        <p className="flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a6dff]">
          <span aria-hidden="true" className="h-px w-6 bg-[#1a6dff]/50" />
          Em números
        </p>
        <h2 className="max-w-2xl text-[26px] font-bold leading-tight tracking-tight text-balance text-slate-900 sm:text-[30px] dark:text-slate-100">
          Sua empresa no portal
        </h2>
        <p className="max-w-xl text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-400">
          O que o escritório liberou para você e o que está andando agora.
        </p>
      </div>

      <dl className={`relative mt-8 grid grid-cols-2 gap-y-8 ${COLUNAS[itens.length] ?? 'lg:grid-cols-4'}`}>
        {itens.map(it => <Numero key={it.rotulo} {...it} />)}
      </dl>
    </section>
  )
}
