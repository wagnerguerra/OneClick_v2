'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { Button } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'
import { resolveAssetUrl } from '@/lib/api-url'

interface Item {
  id: string
  tipo: string
  descricao: string
  quantidade: number
  valorUnitario: number | string
  descontoPct?: number | string | null
  descontoValor?: number | string | null
}

interface Orcamento {
  id: string
  numero: number
  validadeDias: number
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
  formaPagamento: string | null
  createdAt: string
  itens: Item[]
  cliente: { razaoSocial: string; nomeFantasia: string | null; documento: string | null; tipoDocumento: string | null; email: string | null; telefone: string | null } | null
  empresa: { razaoSocial: string; nomeFantasia: string | null; logoUrl: string | null; cnpj: string | null; telefone: string | null; email: string | null; site: string | null } | null
  solicitante: { name: string } | null
  responsavel: { name: string } | null
}

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

function formatCurrency(v: number | string | null | undefined): string {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDocumento(doc: string | null | undefined, tipo?: string | null): string {
  if (!doc) return ''
  const d = doc.replace(/\D/g, '')
  if (tipo === 'CPF' || d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function calcVencimentoDate(createdAt: string, dias: number): string {
  const d = new Date(createdAt)
  d.setDate(d.getDate() + dias)
  return formatDate(d.toISOString())
}

export default function ImprimirOrcamentoPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id as string

  const [orc, setOrc] = useState<Orcamento | null>(null)
  const [loading, setLoading] = useState(true)
  const { empresa: empresaAtiva } = useEmpresaAtiva()

  useEffect(() => {
    (async () => {
      try {
        const data = await (trpc.orcamento as any).getById.query({ id })
        setOrc(data)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  // Define o titulo do documento — usado pelo browser como nome sugerido
  // ao "Imprimir em PDF" / "Salvar como PDF". Formato:
  //   OneClick Orçamentos - #0000 - CNPJ - RAZAO SOCIAL CLIENTE
  // Caracteres invalidos em filename (/ \ : * ? " < > |) sao removidos pelo
  // browser automaticamente; aqui so substituo barra de CNPJ por traco pra
  // ficar mais legivel.
  useEffect(() => {
    if (!orc) return
    const numero = String(orc.numero).padStart(4, '0')
    const cnpjLimpo = (orc.cliente?.documento || '').replace(/\D/g, '')
    const cnpjFormatado = cnpjLimpo.length === 14
      ? cnpjLimpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3-$4-$5')
      : cnpjLimpo.length === 11
      ? cnpjLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : cnpjLimpo || 'sem-doc'
    const cliente = (orc.cliente?.razaoSocial || 'Cliente').toUpperCase()
    const tituloAnterior = document.title
    document.title = `OneClick Orçamentos - #${numero} - ${cnpjFormatado} - ${cliente}`
    return () => { document.title = tituloAnterior }
  }, [orc])

  const itensServico = useMemo(() => orc?.itens.filter(i => i.tipo === 'SERVICO') || [], [orc])
  const itensTaxa = useMemo(() => orc?.itens.filter(i => i.tipo === 'TAXA') || [], [orc])
  const itensDespesa = useMemo(() => orc?.itens.filter(i => i.tipo === 'DESPESA') || [], [orc])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!orc) {
    return <div className="p-8 text-center text-muted-foreground">Orçamento não encontrado</div>
  }

  const empresaNome = empresaAtiva?.nomeFantasia ?? empresaAtiva?.razaoSocial
    ?? orc.empresa?.nomeFantasia ?? orc.empresa?.razaoSocial ?? 'Empresa'
  const empresaLogoUrl = resolveAssetUrl(empresaAtiva?.logoUrl ?? orc.empresa?.logoUrl ?? null) || null
  const clienteNome = orc.cliente?.razaoSocial || 'Cliente'
  const clienteDoc = formatDocumento(orc.cliente?.documento, orc.cliente?.tipoDocumento) || '—'

  // Totalizadores
  const totalServicos = Number(orc.totalServicos) || 0
  const totalTaxas = Number(orc.totalTaxas) || 0
  const totalDespesas = Number(orc.totalDespesas) || 0
  const descontoPct = Number(orc.descontoPct) || 0
  const descontoValor = Number(orc.descontoValor) || 0
  const descontoCalculado = descontoValor || (descontoPct > 0 ? totalServicos * descontoPct / 100 : 0)
  const totalOrcamento = Number(orc.totalGeral) || (totalServicos - descontoCalculado + totalTaxas + totalDespesas)
  const temDesconto = descontoCalculado > 0

  const todosItens = [
    ...itensServico.map(i => ({ ...i, tipoLabel: 'Serviço' })),
    ...itensTaxa.map(i => ({ ...i, tipoLabel: 'Taxa' })),
    ...itensDespesa.map(i => ({ ...i, tipoLabel: 'Despesa' })),
  ]

  // HTML "Descrição" — strip pra detectar conteudo real (RichEditor as vezes salva <p></p>)
  const descricaoHtml = orc.textoCorpoCliente || ''
  const descricaoVazia = descricaoHtml.replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/g, '').length === 0

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .quote-doc {
          font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #1a1a1a;
          font-size: 13px;
          line-height: 1.5;
          position: relative;
        }
        /* Marca d'agua institucional — imagem de /public/marca-dagua.png
           centralizada na pagina, baixa opacidade. Em tela: position:absolute
           (fica dentro do "papel"). Em impressao: position:fixed (repete em
           cada pagina) com print-color-adjust pra preservar no PDF / impressora
           colorida. */
        .quote-doc .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 80%;
          max-width: 560px;
          aspect-ratio: 1 / 1;
          background-repeat: no-repeat;
          background-position: center;
          background-size: contain;
          opacity: 0.08;
          pointer-events: none;
          z-index: 0;
        }
        /* Variante texto — usada quando nao ha logo (fallback). */
        .quote-doc .watermark-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-18deg);
          font-family: Inter, sans-serif;
          font-size: 92px;
          font-weight: 800;
          color: #1a1a1a;
          opacity: 0.04;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          white-space: nowrap;
          pointer-events: none;
          z-index: 0;
          user-select: none;
        }
        /* Faixa decorativa no topo de cada pagina (acento da identidade visual) */
        .quote-doc .top-accent {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: ${MODULE_COLOR};
          z-index: 2;
        }
        /* Conteudo precisa estar acima da marca d'agua */
        .quote-doc .quote-content {
          position: relative;
          z-index: 1;
        }
        .quote-doc h1, .quote-doc h2, .quote-doc h3, .quote-doc h4 { margin: 0; font-weight: 600; }
        .quote-doc .label {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          font-weight: 600;
        }
        .quote-doc .value { font-size: 13px; color: #1a1a1a; font-weight: 500; margin-top: 2px; }
        .quote-doc .section-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #1a1a1a;
          font-weight: 700;
          padding-bottom: 8px;
          border-bottom: 1px solid #1a1a1a;
          margin-bottom: 16px;
        }
        .quote-doc .accent { color: ${MODULE_COLOR}; }
        .quote-doc .accent-bar {
          display: inline-block;
          width: 36px;
          height: 3px;
          background: ${MODULE_COLOR};
          margin-bottom: 12px;
        }
        .quote-doc .doc-number {
          font-size: 24px;
          font-weight: 700;
          color: ${MODULE_COLOR};
          letter-spacing: -0.02em;
          line-height: 1;
        }
        .quote-doc .num-mono { font-variant-numeric: tabular-nums; }
        /* Items table */
        .quote-doc .items {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        .quote-doc .items thead th {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          font-weight: 600;
          padding: 10px 8px;
          border-bottom: 1.5px solid #1a1a1a;
          text-align: left;
        }
        .quote-doc .items thead th.right { text-align: right; }
        .quote-doc .items tbody td {
          padding: 12px 8px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 13px;
          vertical-align: top;
        }
        .quote-doc .items tbody tr:last-child td { border-bottom: 1.5px solid #1a1a1a; }
        .quote-doc .items td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .quote-doc .items td.tipo {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6b7280;
          font-weight: 600;
          width: 70px;
          padding-top: 14px;
        }
        /* Totalizador box */
        .quote-doc .totals {
          margin-left: auto;
          width: 320px;
          margin-top: 16px;
        }
        .quote-doc .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 13px;
        }
        .quote-doc .totals-row .lbl { color: #6b7280; }
        .quote-doc .totals-row .val { font-variant-numeric: tabular-nums; font-weight: 500; }
        .quote-doc .totals-row.discount .val { color: ${MODULE_COLOR}; }
        .quote-doc .totals-row.grand {
          margin-top: 4px;
          padding: 12px 0 0;
          border-top: 1.5px solid #1a1a1a;
          align-items: baseline;
        }
        .quote-doc .totals-row.grand .lbl {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #1a1a1a;
          font-weight: 700;
        }
        .quote-doc .totals-row.grand .val {
          font-size: 22px;
          font-weight: 700;
          color: ${MODULE_COLOR};
          letter-spacing: -0.01em;
        }
        /* Cliente info grid */
        .quote-doc .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px 32px;
        }
        .quote-doc .info-grid .full { grid-column: 1 / -1; }
        /* Descricao box */
        .quote-doc .descricao-content {
          font-size: 13px;
          line-height: 1.6;
          color: #1a1a1a;
        }
        .quote-doc .descricao-content p { margin: 0 0 8px; }
        .quote-doc .descricao-content p:last-child { margin-bottom: 0; }
        /* Parágrafos vazios (linhas em branco do editor) — o TipTap salva <p></p>,
           que colapsa fora do contenteditable. min-height preserva 1 linha
           (evita escape "\\00a0" que quebra o template literal do <style>). */
        .quote-doc .descricao-content p:empty { min-height: 1.6em; }
        .quote-doc .descricao-content ul, .quote-doc .descricao-content ol { margin: 8px 0; padding-left: 24px; }
        .quote-doc .descricao-content ul { list-style: disc; }
        .quote-doc .descricao-content ol { list-style: decimal; }
        .quote-doc .descricao-content li { margin: 2px 0; }
        .quote-doc .descricao-content li > p { margin: 0; }
        .quote-doc .descricao-content strong { font-weight: 700; }
        .quote-doc .descricao-content em { font-style: italic; }
        /* Títulos: replicam EXATAMENTE as proporções do editor (.rich-editor-root)
           — usam em (relativo aos 13px do doc) pra impressão casar com a tela.
           Mais específico que a regra genérica ".quote-doc h1,h2,h3" (que achata),
           então estas vencem por especificidade. */
        .quote-doc .descricao-content h1 { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; line-height: 1.25; }
        .quote-doc .descricao-content h2 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0 0.3em; line-height: 1.3; }
        .quote-doc .descricao-content h3 { font-size: 1.1em; font-weight: 600; margin: 0.4em 0 0.2em; line-height: 1.3; }
        .quote-doc .descricao-content hr { border: 0; border-top: 1px solid #d1d5db; margin: 0.75rem 0; }
        .quote-doc .descricao-content blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 0.75rem;
          color: #6b7280;
          margin: 0.5rem 0;
        }
        /* Marca-texto (Highlight do TipTap) — preserva o fundo colorido no PDF */
        .quote-doc .descricao-content mark {
          padding: 0 1px;
          border-radius: 2px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .quote-doc .descricao-vazia {
          font-style: italic;
          color: #9ca3af;
          font-size: 13px;
        }
        /* Footer */
        .quote-doc .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 10.5px;
          color: #9ca3af;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        @media print {
          /* Esconde TODO o chrome do dashboard. */
          body * { visibility: hidden !important; }
          .quote-doc, .quote-doc * { visibility: visible !important; }
          .quote-doc {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            /* padding-bottom reserva espaco para o footer fixo nao sobrepor texto */
            padding: 0 0 56px 0 !important;
            box-shadow: none !important;
            background: white !important;
          }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }

          /* Acentos coloridos preservados (nao force B&W). Impressora monocromatica
             ja vira escala de cinza naturalmente. */
          .quote-doc .accent,
          .quote-doc .doc-number,
          .quote-doc .accent-bar,
          .quote-doc .totals-row.grand .val,
          .quote-doc .totals-row.discount .val,
          .quote-doc .watermark,
          .quote-doc .watermark-text {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Marca d'agua: position:fixed pra repetir em todas as paginas
             impressas (Chrome/Firefox interpretam fixed como "renderizar em
             cada pagina" no print). */
          .quote-doc .watermark,
          .quote-doc .watermark-text {
            position: fixed !important;
          }

          /* Faixa de topo eh apenas decoracao de tela — nao imprime. */
          .quote-doc .top-accent {
            display: none !important;
          }

          /* === FOOTER em cada pagina ===
             position: fixed dentro de @media print faz o navegador renderizar
             o elemento em todas as paginas. Combinar com padding-bottom no
             container pra evitar sobreposicao do conteudo. */
          .quote-doc .footer {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 !important;
            padding-top: 8px !important;
            background: white !important;
          }

          /* === QUEBRAS DE PAGINA SEGURAS ===
             - Paragrafos/itens de lista: nao cortar ao meio. orphans/widows
               garantem que pelo menos 3 linhas fiquem juntas no fim/inicio.
             - Linhas da tabela: nunca quebrar entre topo e base de uma linha.
             - Totalizador: bloco indivisivel.
             - Titulos de secao: break-after avoid impede titulo orfao no
               final da pagina (puxa a secao inteira pra proxima). */
          .quote-doc .descricao-content p,
          .quote-doc .descricao-content li,
          .quote-doc .descricao-content blockquote,
          .quote-doc .descricao-content pre {
            break-inside: avoid;
            page-break-inside: avoid;
            orphans: 3;
            widows: 3;
          }
          .quote-doc .items tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .quote-doc .totals {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .quote-doc .section-title {
            break-after: avoid;
            page-break-after: avoid;
          }
          /* Header (logo + meta) e info-grid: nao dividir */
          .quote-doc .info-grid {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          @page { margin: 1.6cm; size: A4; }
        }
        @media screen {
          .quote-doc {
            background: #fff;
            padding: 48px 56px;
            max-width: 880px;
            margin: 24px auto;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.04);
            border-radius: 4px;
          }
        }
      ` }} />

      {/* Toolbar — visivel apenas em tela */}
      <div className="no-print flex items-center gap-2 max-w-[880px] mx-auto px-4 pt-4">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push(`/orcamentos/${id}`)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button size="sm" className="text-white gap-1.5 ml-auto" style={{ backgroundColor: MODULE_COLOR }} onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {/* DOCUMENTO */}
      <div className="quote-doc">
        {/* Faixa de acento no topo de cada pagina (identidade rose) */}
        <div className="top-accent" aria-hidden />

        {/* Marca d'agua institucional: usa a imagem cadastrada na empresa ativa
            (campo marcaDaguaUrl em /empresas → pill "Logomarca"). Fallback para
            o asset estatico /marca-dagua.png caso nenhuma empresa tenha
            configurado. Centralizada, baixa opacidade, atras de todo o conteudo. */}
        <div
          className="watermark"
          aria-hidden
          style={{ backgroundImage: `url("${resolveAssetUrl(empresaAtiva?.marcaDaguaUrl) || '/marca-dagua.png'}")` }}
        />

        {/* Conteudo do documento (z-index acima da marca d'agua) */}
        <div className="quote-content">

        {/* HEADER: logo + meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            {empresaLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={empresaLogoUrl} alt={empresaNome} style={{ maxHeight: 56, maxWidth: 220, objectFit: 'contain' }} />
            ) : (
              <h2 style={{ fontSize: 18, letterSpacing: '-0.01em' }}>{empresaNome}</h2>
            )}
            {orc.empresa?.cnpj && (
              <p style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 6, letterSpacing: '0.02em' }}>
                CNPJ {formatDocumento(orc.empresa.cnpj, 'CNPJ')}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="accent-bar" />
            <p className="label" style={{ marginBottom: 4 }}>Proposta Comercial</p>
            <p className="doc-number num-mono">#{String(orc.numero).padStart(4, '0')}</p>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
              Emitida em <strong style={{ color: '#1a1a1a' }}>{formatDate(orc.createdAt)}</strong>
            </p>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              Válida até <strong style={{ color: '#1a1a1a' }}>{calcVencimentoDate(orc.createdAt, orc.validadeDias)}</strong>
              {' '}<span style={{ color: '#9ca3af' }}>({orc.validadeDias} dias)</span>
            </p>
          </div>
        </div>

        {/* DESTINATÁRIO + DETALHES */}
        <div style={{ marginBottom: 32 }}>
          <div className="section-title">Dados do Orçamento</div>
          <div className="info-grid">
            <div>
              <p className="label">Cliente</p>
              <p className="value">{clienteNome}</p>
            </div>
            <div>
              <p className="label">CPF / CNPJ</p>
              <p className="value num-mono">{clienteDoc}</p>
            </div>
            <div>
              <p className="label">Contato</p>
              <p className="value">{orc.contatos || '—'}</p>
            </div>
            <div>
              <p className="label">Solicitante</p>
              <p className="value">{orc.solicitante?.name || '—'}</p>
            </div>
            <div>
              <p className="label">Forma de Pagamento</p>
              <p className="value">{orc.formaPagamento || `${orc.validadeDias} dias`}</p>
            </div>
            <div>
              <p className="label">Responsável Técnico</p>
              <p className="value">{orc.responsavel?.name || '—'}</p>
            </div>
          </div>
        </div>

        {/* ITENS */}
        <div style={{ marginBottom: 24 }}>
          <div className="section-title">Itens da Proposta</div>
          {todosItens.length === 0 ? (
            <p style={{ fontStyle: 'italic', color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>
              Nenhum item adicionado a este orçamento.
            </p>
          ) : (
            <table className="items">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Tipo</th>
                  <th>Descrição</th>
                  <th className="right" style={{ width: 70 }}>Qtd</th>
                  <th className="right" style={{ width: 110 }}>Valor Unit.</th>
                  <th className="right" style={{ width: 130 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {todosItens.map(item => {
                  const bruto = Number(item.valorUnitario) * Number(item.quantidade)
                  // Desconto por item — só serviço (#HLP0302), limitado ao subtotal.
                  const desc = item.tipo === 'SERVICO'
                    ? Math.min(bruto, Math.max(0, bruto * (Number(item.descontoPct) || 0) / 100 + (Number(item.descontoValor) || 0)))
                    : 0
                  return (
                    <tr key={item.id}>
                      <td className="tipo">{item.tipoLabel}</td>
                      <td>
                        {item.descricao}
                        {desc > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: '#059669' }}>
                            (desconto {Number(item.descontoPct) > 0 ? `${Number(item.descontoPct)}%` : ''}{Number(item.descontoPct) > 0 && Number(item.descontoValor) > 0 ? ' + ' : ''}{Number(item.descontoValor) > 0 ? formatCurrency(Number(item.descontoValor)) : ''})
                          </span>
                        )}
                      </td>
                      <td className="right">{Number(item.quantidade)}</td>
                      <td className="right">{formatCurrency(item.valorUnitario)}</td>
                      <td className="right" style={{ fontWeight: 600 }}>
                        {desc > 0 ? (
                          <>
                            <span style={{ color: '#94a3b8', textDecoration: 'line-through', marginRight: 4 }}>{formatCurrency(bruto)}</span>
                            {formatCurrency(bruto - desc)}
                          </>
                        ) : formatCurrency(bruto)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* TOTALIZADORES */}
          <div className="totals">
            {totalServicos > 0 && (
              <div className="totals-row">
                <span className="lbl">Subtotal Serviços</span>
                <span className="val">{formatCurrency(totalServicos)}</span>
              </div>
            )}
            {temDesconto && (
              <div className="totals-row discount">
                <span className="lbl">
                  Desconto{descontoPct > 0 ? ` (${descontoPct.toFixed(descontoPct % 1 === 0 ? 0 : 1)}%)` : ''}
                </span>
                <span className="val">− {formatCurrency(descontoCalculado)}</span>
              </div>
            )}
            {totalTaxas > 0 && (
              <div className="totals-row">
                <span className="lbl">Total de Taxas</span>
                <span className="val">{formatCurrency(totalTaxas)}</span>
              </div>
            )}
            {totalDespesas > 0 && (
              <div className="totals-row">
                <span className="lbl">Total de Despesas</span>
                <span className="val">{formatCurrency(totalDespesas)}</span>
              </div>
            )}
            <div className="totals-row grand">
              <span className="lbl">Total</span>
              <span className="val">{formatCurrency(totalOrcamento)}</span>
            </div>
          </div>
        </div>

        {/* DESCRIÇÃO */}
        <div style={{ marginTop: 32 }}>
          <div className="section-title">Descrição</div>
          {descricaoVazia ? (
            <p className="descricao-vazia">Orçamento sem detalhes</p>
          ) : (
            <div className="descricao-content" dangerouslySetInnerHTML={{ __html: descricaoHtml }} />
          )}
        </div>

        {/* FOOTER */}
        <div className="footer">
          <span>{empresaNome}{orc.empresa?.site ? ` · ${orc.empresa.site}` : ''}</span>
          <span>Proposta #{String(orc.numero).padStart(4, '0')} · {formatDate(orc.createdAt)}</span>
        </div>

        </div>
        {/* /quote-content */}
      </div>
    </>
  )
}
