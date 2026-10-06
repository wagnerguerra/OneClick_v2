'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2, ShieldCheck } from 'lucide-react'

import { usePortal } from '../../_lib/contexto'
import { PortalPageHeader } from '../../_components/portal-page-header'
import { Chip, Validade, tomDaSituacao, type CertidaoPortal, type Consulta } from '../../_components/painel-inicio'
import { apiCertidoes, baixarCertidao } from '../../_lib/certidoes'

/**
 * Certidões e Alvarás do cliente — a última emissão de cada documento, com
 * situação, validade, data da última consulta e o PDF.
 *
 * Mesma fonte do quadro da página inicial e da aba Legalização interna
 * (certidoes-do-cliente.ts). As rotas passam por `portalModuloProcedure
 * ('certidoes')`: módulo ligado na empresa E `podeVerCertidoes` na pessoa. A
 * checagem aqui é só para não mostrar a casca a quem digitou a URL.
 */
const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function PortalCertidoesPage() {
  const { clienteId, vinculo } = usePortal()
  const liberado = !!vinculo?.modulos.includes('certidoes')
  const [lista, setLista] = useState<Consulta<CertidaoPortal[]>>(undefined)
  const [baixando, setBaixando] = useState<string | null>(null)
  // "Hoje" só no cliente: no servidor sairia no fuso dele.
  const [hoje, setHoje] = useState<Date | null>(null)
  useEffect(() => { setHoje(new Date()) }, [])

  useEffect(() => {
    if (!clienteId || !liberado) return
    let vivo = true
    setLista(undefined)
    apiCertidoes().certidoes.lista.query({ clienteId })
      .then(l => { if (vivo) setLista(l) })
      .catch(() => { if (vivo) setLista(null) })
    return () => { vivo = false }
  }, [clienteId, liberado])

  const baixar = async (c: CertidaoPortal) => {
    if (!clienteId) return
    setBaixando(c.id)
    try { await baixarCertidao(clienteId, c) } finally { setBaixando(null) }
  }

  return (
    <>
      <PortalPageHeader
        titulo="Certidões e Alvarás"
        subtitulo="A última emissão de cada documento da sua empresa, para baixar quando precisar."
      />
      {!vinculo ? null : !liberado ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#e6ebf2] bg-white px-6 py-14 text-center dark:border-[#1b2739] dark:bg-[#0e1726]">
          <ShieldCheck className="h-9 w-9 text-slate-400" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Certidões não disponíveis</p>
          <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
            O acesso às certidões e alvarás é liberado pelo escritório. Se você precisa dele, fale com a sua equipe.
          </p>
        </div>
      ) : (
        <section className="anim-subir overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white shadow-sm dark:border-[#1b2739] dark:bg-[#0e1726]">
          {lista === undefined ? (
            <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : lista === null ? (
            <p className="px-6 py-14 text-center text-[13px] text-slate-500 dark:text-slate-400">Não foi possível carregar agora. Tente de novo em instantes.</p>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <ShieldCheck className="h-9 w-9 text-slate-400" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Nenhuma certidão emitida ainda</p>
              <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Quando o escritório emitir as certidões e alvarás da sua empresa, eles aparecem aqui.
              </p>
            </div>
          ) : (
            <>
              {/* Tabela a partir do tablet; no celular, cartões empilhados. */}
              <div className="hidden overflow-x-auto md:block nice-scrollbar">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#eef2f7] text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:border-[#1b2739] dark:text-slate-400">
                      <th className="px-5 py-3">Documento</th>
                      <th className="px-3 py-3">Situação</th>
                      <th className="px-3 py-3">Validade</th>
                      <th className="px-3 py-3">Última consulta</th>
                      <th className="px-5 py-3 text-right">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f7] dark:divide-[#1b2739]">
                    {lista.map(c => (
                      <tr key={`${c.tipo}:${c.id}`}>
                        <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100">{c.label}</td>
                        <td className="px-3 py-3">{c.situacao ? <Chip tom={tomDaSituacao(c.situacao)}>{c.situacao}</Chip> : '—'}</td>
                        <td className="px-3 py-3">{c.dataValidade ? <Validade data={c.dataValidade} hoje={hoje} /> : <span className="text-[11.5px] text-slate-400">sem validade informada</span>}</td>
                        <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">{quando(c.dataConsulta)}</td>
                        <td className="px-5 py-3 text-right">
                          <BotaoPdf ocupado={baixando === c.id} onClick={() => baixar(c)} rotulo={c.label} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-[#eef2f7] md:hidden dark:divide-[#1b2739]">
                {lista.map(c => (
                  <li key={`${c.tipo}:${c.id}`} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{c.label}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {c.situacao && <Chip tom={tomDaSituacao(c.situacao)}>{c.situacao}</Chip>}
                        <Validade data={c.dataValidade} hoje={hoje} />
                      </div>
                      <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Última consulta: {quando(c.dataConsulta)}</p>
                    </div>
                    <BotaoPdf ocupado={baixando === c.id} onClick={() => baixar(c)} rotulo={c.label} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  )
}

function BotaoPdf({ ocupado, onClick, rotulo }: { ocupado: boolean; onClick: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      aria-label={`Baixar ${rotulo}`}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#e6ebf2] px-2.5 text-[12px] font-semibold text-[#1a6dff] transition-colors hover:bg-[#f7faff] disabled:opacity-60 dark:border-[#1b2739] dark:text-[#7db0ff] dark:hover:bg-[#16233a]"
    >
      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      PDF
    </button>
  )
}
