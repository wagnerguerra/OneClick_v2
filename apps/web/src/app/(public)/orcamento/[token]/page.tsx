'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, XCircle, FileText, Loader2, Printer, Calendar, Building2, Phone, Mail, Paperclip, Download, Pencil } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface Item {
  id: string
  tipo: string
  descricao: string
  quantidade: number
  valorUnitario: number | string
}

interface Orcamento {
  id: string
  numero: number
  token: string
  status: string
  validadeDias: number
  formaPagamento: string | null
  contatos: string | null
  observacoes: string | null
  textoCorpoCliente: string | null
  descontoPct: number | string | null
  descontoValor: number | string | null
  totalServicos: number | string
  totalTaxas: number | string
  totalDespesas: number | string
  descontoAplicado: number | string
  totalGeral: number | string
  decisaoTipo: string | null
  decisaoEm: string | null
  decisaoNome: string | null
  decisaoObs: string | null
  createdAt: string
  itens: Item[]
  arquivos?: Array<{ id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null }>
  cliente: { razaoSocial: string; nomeFantasia: string | null; documento: string; tipoDocumento: string; email: string | null } | null
  empresa: { razaoSocial: string; nomeFantasia: string | null; logoUrl: string | null; cnpj: string; telefone: string | null; email: string | null; site: string | null } | null
  config: { textoApresentacao: string }
}

function formatCurrency(v: number | string | null | undefined): string {
  const n = Number(v ?? 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDocumento(doc: string | null | undefined, tipo?: string): string {
  if (!doc) return ''
  const d = doc.replace(/\D/g, '')
  if (tipo === 'CPF' || d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function maskCpf(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d{0,3})(\d{0,3})(\d{0,2})/, (_, a, b, c, d) =>
    [a, b && '.' + b, c && '.' + c, d && '-' + d].filter(Boolean).join('')
  )
}

export default function PublicOrcamentoPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token as string

  const [orc, setOrc] = useState<Orcamento | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Decisao
  const [decisaoModal, setDecisaoModal] = useState<'APROVADO' | 'RECUSADO' | 'REVISAO_SOLICITADA' | null>(null)
  const [modalClosing, setModalClosing] = useState(false)
  const fecharModal = () => { if (enviando) return; setModalClosing(true); setTimeout(() => { setDecisaoModal(null); setModalClosing(false) }, 160) }
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [cnpjFaturamento, setCnpjFaturamento] = useState('')
  const [emailFinanceiro, setEmailFinanceiro] = useState('')
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmacao, setConfirmacao] = useState<{ tipo: string; mensagem: string } | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const data = await (trpc.orcamento as any).getByToken.query({ token })
        if (!data) { setError('Orçamento não encontrado ou link inválido'); return }
        setOrc(data)
      } catch {
        setError('Erro ao carregar o orçamento')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  const itensServico = useMemo(() => orc?.itens.filter(i => i.tipo === 'SERVICO') || [], [orc])
  const itensTaxa = useMemo(() => orc?.itens.filter(i => i.tipo === 'TAXA') || [], [orc])
  const itensDespesa = useMemo(() => orc?.itens.filter(i => i.tipo === 'DESPESA') || [], [orc])

  const handleDecisao = async () => {
    if (!nome.trim()) { alert('Informe seu nome'); return }
    setEnviando(true)
    try {
      await (trpc.orcamento as any).registrarDecisao.mutate({
        token,
        tipo: decisaoModal!,
        nome: nome.trim(),
        cpf: cpf.replace(/\D/g, '') || undefined,
        observacao: observacao.trim() || undefined,
        ...(decisaoModal === 'APROVADO' ? {
          cnpjFaturamento: cnpjFaturamento.replace(/\D/g, '') || undefined,
          emailFinanceiro: emailFinanceiro.trim() || undefined,
        } : {}),
      })
      setConfirmacao({
        tipo: decisaoModal!,
        mensagem: decisaoModal === 'APROVADO'
          ? 'Proposta aprovada com sucesso! Em breve nossa equipe entrará em contato.'
          : decisaoModal === 'REVISAO_SOLICITADA'
          ? 'Sua solicitação de revisão foi enviada. Vamos analisar e retornar em breve.'
          : 'Sua resposta foi registrada. Obrigado pelo retorno.',
      })
      setDecisaoModal(null)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
      </div>
    )
  }

  if (error || !orc) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md text-center bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8">
          <XCircle className="h-12 w-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-2">Nao foi possivel carregar</h2>
          <p className="text-sm text-muted-foreground">{error || 'Link invalido ou expirado'}</p>
        </div>
      </div>
    )
  }

  const empresaNome = orc.empresa?.nomeFantasia || orc.empresa?.razaoSocial || 'Empresa'
  const clienteNome = orc.cliente?.razaoSocial || 'Cliente'
  const decidido = !!orc.decisaoTipo

  // Botões de decisão — reusados no topo e na base da página.
  const acoesCliente = (!decidido && !confirmacao) ? (
    <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 print:hidden">
      <h3 className="font-semibold mb-1">Pronto para responder?</h3>
      <p className="text-sm text-muted-foreground mb-4">Aprove a proposta para iniciarmos o trabalho, solicite uma revisão ou recuse para nos enviar seu retorno.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={() => setDecisaoModal('APROVADO')} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md font-semibold transition-colors">
          <CheckCircle2 className="h-5 w-5" /> Aprovar Proposta
        </button>
        <button onClick={() => setDecisaoModal('REVISAO_SOLICITADA')} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded-md font-semibold border border-amber-200 dark:border-amber-800/60 transition-colors">
          <Pencil className="h-5 w-5" /> Solicitar Revisão
        </button>
        <button onClick={() => setDecisaoModal('RECUSADO')} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md font-semibold border border-slate-200 dark:border-slate-600 transition-colors">
          <XCircle className="h-5 w-5" /> Recusar
        </button>
      </div>
    </section>
  ) : null

  return (
    <div className="print:p-0">
      {/* Header — capa FULL-BLEED (bg de ponta a ponta, sem frame/card).
          Cor base = fundo da imagem (#f4f4f4) p/ casar mesmo se a imagem não carregar. */}
      <header className="relative overflow-hidden bg-[#f4f4f4] dark:bg-slate-900 print:border-b print:border-slate-200">
        <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/materiais/view-bg.jpg)' }} />
        <div className="absolute inset-0 bg-white/15 dark:bg-slate-900/70" />
        <div className="relative flex flex-col items-center text-center py-9 px-6 max-w-5xl mx-auto">
          <button
            onClick={() => window.print()}
            className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 text-sm bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-white dark:hover:bg-slate-800 transition-colors print:hidden"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          {orc.empresa?.logoUrl ? (
            <img src={resolveAssetUrl(orc.empresa.logoUrl)} alt={empresaNome} className="h-16 sm:h-20 w-auto object-contain" />
          ) : (
            <div className="h-16 w-16 rounded-lg flex items-center justify-center text-white text-2xl font-bold" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
              {empresaNome[0]?.toUpperCase()}
            </div>
          )}
          <h1 className="mt-4 text-lg sm:text-2xl font-medium text-slate-700 dark:text-slate-200 tracking-wide">
            Proposta Comercial <span className="font-bold">#{String(orc.numero).padStart(4, '0')}</span>
          </h1>
        </div>
      </header>

      {/* Conteúdo centralizado */}
      <div className="max-w-5xl mx-auto p-4 sm:p-8 print:p-0">

      {/* Ações (topo) — mesmos botões da base */}
      {acoesCliente}

      {/* Confirmacao apos decisao */}
      {(confirmacao || decidido) && (
        <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border-l-4 ${(confirmacao?.tipo || orc.decisaoTipo) === 'APROVADO' ? 'border-emerald-500' : (confirmacao?.tipo || orc.decisaoTipo) === 'REVISAO_SOLICITADA' ? 'border-amber-500' : 'border-rose-500'} print:hidden`}>
          <div className="flex items-start gap-3">
            {(confirmacao?.tipo || orc.decisaoTipo) === 'APROVADO' ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
            ) : (confirmacao?.tipo || orc.decisaoTipo) === 'REVISAO_SOLICITADA' ? (
              <Pencil className="h-6 w-6 text-amber-500 shrink-0" />
            ) : (
              <XCircle className="h-6 w-6 text-rose-500 shrink-0" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold mb-1">
                {(confirmacao?.tipo || orc.decisaoTipo) === 'APROVADO' ? 'Proposta aprovada' : (confirmacao?.tipo || orc.decisaoTipo) === 'REVISAO_SOLICITADA' ? 'Revisão solicitada' : 'Decisão registrada'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {confirmacao?.mensagem || `Resposta registrada por ${orc.decisaoNome} em ${orc.decisaoEm ? formatDate(orc.decisaoEm) : ''}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo em 2 colunas: proposta + itens à esquerda, anexos à direita */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0">
      {/* Apresentacao + Cliente */}
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 print:shadow-none print:rounded-none">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wider">Proposta Comercial</p>
            <h2 className="text-2xl font-bold" style={{ color: MODULE_COLOR }}>#{String(orc.numero).padStart(4, '0')}</h2>
          </div>
          <div className="text-right text-sm">
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Emissao: {formatDate(orc.createdAt)}
            </p>
            <p className="text-muted-foreground mt-1">Validade: <strong>{orc.validadeDias} dias</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1.5">Para</p>
            <p className="font-semibold">{clienteNome}</p>
            {orc.cliente?.documento && (
              <p className="text-sm text-muted-foreground">{orc.cliente.tipoDocumento || 'Doc'}: {formatDocumento(orc.cliente.documento, orc.cliente.tipoDocumento)}</p>
            )}
            {orc.contatos && <p className="text-sm text-muted-foreground mt-1">{orc.contatos}</p>}
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1.5">Contato</p>
            {orc.empresa?.telefone && (
              <p className="text-sm flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {orc.empresa.telefone}</p>
            )}
            {orc.empresa?.email && (
              <p className="text-sm flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {orc.empresa.email}</p>
            )}
            {orc.empresa?.site && (
              <p className="text-sm flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {orc.empresa.site}</p>
            )}
          </div>
        </div>

        {orc.textoCorpoCliente && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div
              className="richtext-render prose prose-sm max-w-none text-slate-700 dark:text-slate-300 max-h-[420px] overflow-y-auto select-text rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-4 print:max-h-none print:overflow-visible print:border-0 print:bg-transparent print:p-0"
              dangerouslySetInnerHTML={{ __html: orc.textoCorpoCliente }}
            />
          </div>
        )}
      </section>

      {/* Itens */}
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden mb-6 print:shadow-none print:rounded-none">
        <ItensTabela titulo="Serviços" itens={itensServico} corBadge="#3b82f6" />
        <ItensTabela titulo="Taxas" itens={itensTaxa} corBadge="#f59e0b" />
        <ItensTabela titulo="Despesas" itens={itensDespesa} corBadge="#ef4444" />

        {/* Totais */}
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
          <div className="ml-auto max-w-md space-y-2 text-sm">
            {Number(orc.totalServicos) > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Serviços</span><span>{formatCurrency(orc.totalServicos)}</span></div>
            )}
            {Number(orc.totalTaxas) > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Taxas</span><span>{formatCurrency(orc.totalTaxas)}</span></div>
            )}
            {Number(orc.totalDespesas) > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Despesas</span><span>{formatCurrency(orc.totalDespesas)}</span></div>
            )}
            {Number(orc.descontoAplicado) > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Desconto {orc.descontoPct ? `(${Number(orc.descontoPct)}%)` : ''}</span>
                <span>- {formatCurrency(orc.descontoAplicado)}</span>
              </div>
            )}
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-lg font-bold">
              <span>Total</span>
              <span style={{ color: MODULE_COLOR }}>{formatCurrency(orc.totalGeral)}</span>
            </div>
            {orc.formaPagamento && (
              <div className="flex justify-between pt-1.5">
                <span className="text-muted-foreground">Forma de pagamento</span>
                <span className="font-semibold">{orc.formaPagamento}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      </div>{/* fim coluna esquerda */}

      {/* Anexos públicos — coluna direita, ao lado dos demais cards */}
      {!!orc.arquivos?.length && (
        <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-6">
        <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 print:shadow-none print:rounded-none print:border print:border-slate-200">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" /> Anexos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {orc.arquivos.map(a => (
              <a
                key={a.id}
                href={resolveAssetUrl(a.fileUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                title={a.fileName}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm truncate flex-1">{a.fileName}</span>
                <Download className="h-4 w-4 shrink-0 text-muted-foreground print:hidden" />
              </a>
            ))}
          </div>
        </section>
        </aside>
      )}
      </div>{/* fim 2 colunas */}

      {/* Ações do cliente (base) */}
      {acoesCliente}

      {/* Footer */}
      <footer className="text-center mt-8 mb-4 text-xs text-muted-foreground">
        <p>{empresaNome} &middot; {new Date().getFullYear()}</p>
      </footer>

      {/* Modal de decisao */}
      {decisaoModal && (
        <div
          onClick={fecharModal}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden"
          style={{ animation: modalClosing ? 'dialog-fade-out 150ms ease-in forwards' : 'dialog-fade-in 200ms ease-out forwards' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 sm:p-7 max-h-[90vh] overflow-y-auto"
            style={{ animation: modalClosing ? 'dialog-zoom-out 200ms cubic-bezier(0.4,0,1,1) forwards' : 'dialog-zoom-in 250ms cubic-bezier(0,0,0.2,1) forwards' }}
          >
            <div className="flex items-center gap-3 mb-4">
              {decisaoModal === 'APROVADO' ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : decisaoModal === 'REVISAO_SOLICITADA' ? (
                <Pencil className="h-6 w-6 text-amber-500" />
              ) : (
                <XCircle className="h-6 w-6 text-rose-500" />
              )}
              <h3 className="text-lg font-semibold">
                {decisaoModal === 'APROVADO' ? 'Aprovar proposta' : decisaoModal === 'REVISAO_SOLICITADA' ? 'Solicitar Revisão da Proposta' : 'Recusar proposta'}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {decisaoModal === 'REVISAO_SOLICITADA'
                ? 'Informe seu nome e aponte abaixo os pontos que gostaria de revisar.'
                : 'Para registrar sua decisao, informe seu nome completo abaixo.'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Seu nome <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                  placeholder="Nome completo"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">CPF (opcional)</label>
                <input
                  type="text"
                  value={cpf}
                  onChange={e => setCpf(maskCpf(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                  placeholder="000.000.000-00"
                />
              </div>
              {/* Faturamento — só na aprovação */}
              {decisaoModal === 'APROVADO' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium block mb-1">CPF / CNPJ para faturamento</label>
                    <input
                      type="text"
                      value={cnpjFaturamento}
                      onChange={e => setCnpjFaturamento(e.target.value.replace(/\D/g, '').slice(0, 14))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                      placeholder="Digite apenas números"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">E-mail do financeiro para faturamento</label>
                    <input
                      type="email"
                      value={emailFinanceiro}
                      onChange={e => setEmailFinanceiro(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                      placeholder="financeiro@empresa.com.br"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1">Observacoes (opcional)</label>
                <textarea
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                  placeholder={decisaoModal === 'APROVADO' ? 'Comentários ou solicitações adicionais...' : decisaoModal === 'REVISAO_SOLICITADA' ? 'Aponte os detalhes que acha pertinente para a revisão da proposta...' : 'Conte-nos por que está recusando...'}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={fecharModal}
                disabled={enviando}
                className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleDecisao}
                disabled={enviando || !nome.trim()}
                className={`px-4 py-2 text-sm text-white rounded-md font-semibold disabled:opacity-50 ${decisaoModal === 'APROVADO' ? 'bg-emerald-500 hover:bg-emerald-600' : decisaoModal === 'REVISAO_SOLICITADA' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-rose-500 hover:bg-rose-600'}`}
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function ItensTabela({ titulo, itens, corBadge }: { titulo: string; itens: Item[]; corBadge: string }) {
  if (itens.length === 0) return null
  return (
    <div className="border-b border-slate-100 dark:border-slate-700 last:border-b-0">
      <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/30 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded text-white" style={{ backgroundColor: corBadge }}>
          {titulo}
        </span>
        <span className="text-xs text-muted-foreground">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
      </div>
      <table className="w-full">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-slate-100 dark:border-slate-700">
            <th className="px-6 py-2 text-left font-medium">Descricao</th>
            <th className="px-6 py-2 text-right font-medium w-[80px]">Qtd</th>
            <th className="px-6 py-2 text-right font-medium w-[140px]">Unitario</th>
            <th className="px-6 py-2 text-right font-medium w-[140px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map(item => {
            const total = Number(item.valorUnitario) * Number(item.quantidade)
            return (
              <tr key={item.id} className="border-b border-slate-50 dark:border-slate-800 last:border-b-0">
                <td className="px-6 py-3 text-sm">{item.descricao}</td>
                <td className="px-6 py-3 text-sm text-right">{Number(item.quantidade)}</td>
                <td className="px-6 py-3 text-sm text-right">{formatCurrency(Number(item.valorUnitario))}</td>
                <td className="px-6 py-3 text-sm text-right font-medium">{formatCurrency(total)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
