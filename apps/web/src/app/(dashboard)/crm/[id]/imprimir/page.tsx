'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { Button } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'
import { resolveAssetUrl } from '@/lib/api-url'

/**
 * Ficha impressa de uma oportunidade do CRM.
 *
 * Espelha a impressão do orçamento (`/orcamentos/[id]/imprimir`): mesmo papel,
 * mesma marca d'água, mesma toolbar de tela e as mesmas regras de
 * `@media print`. O que muda é o conteúdo — e a NATUREZA do documento: a
 * proposta é escrita para o cliente ler; esta ficha é interna, e por isso traz
 * anotações e histórico, que numa proposta não teriam lugar.
 */

interface Tag { tag: { id: string; nome: string; cor: string | null } }
interface Mensagem { id: string; mensagem: string; createdAt: string; user?: { name: string } | null }
interface Arquivo { id: string; fileName: string; fileSize: number | null; createdAt: string }
interface Evento {
  id: string
  tipo: string
  descricao: string | null
  de: string | null
  para: string | null
  createdAt: string
  user?: { name: string } | null
}
interface Tarefa {
  id: string
  titulo: string
  prazo: string | null
  horaPrazo: string | null
  concluida: boolean
  concluidaEm: string | null
  prioridade: string | null
}

interface Oportunidade {
  id: string
  numero: number | null
  titulo: string
  descricao: string | null
  valor: number | string | null
  clienteId: string | null
  previsaoFechamento: string | null
  motivoPerda: string | null
  origem: string | null
  cpfCnpj: string | null
  razaoSocial: string | null
  nomeFantasia: string | null
  cnaeCodigo: string | null
  cnaeDescricao: string | null
  contatoNome: string | null
  contatoCargo: string | null
  contatoTelefone: string | null
  contatoEmail: string | null
  score: number | null
  temperatura: string | null
  campanhaNome?: string | null
  createdAt: string
  etapa: { id: string; nome: string; cor: string | null; probabilidade: number | null; ehGanho: boolean; ehPerda: boolean } | null
  responsavel: { id: string; name: string } | null
  tags: Tag[]
  mensagens: Mensagem[]
  arquivos: Arquivo[]
  eventos: Evento[]
}

interface Cliente {
  razaoSocial: string
  documento: string | null
  tipoDocumento: string | null
  email: string | null
  telefone: string | null
}

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

function formatCurrency(v: number | string | null | undefined): string {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDocumento(doc: string | null | undefined, tipo?: string | null): string {
  if (!doc) return ''
  const d = doc.toUpperCase().replace(/[^0-9A-Z]/g, '') // preserva letras (CNPJ alfanumérico)
  if (tipo === 'CPF' || d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
  return doc
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(d: string): string {
  const dt = new Date(d)
  return `${dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    + ` às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** HTML do RichEditor sem conteúdo real (o TipTap salva `<p></p>` para vazio). */
function htmlVazio(html: string | null | undefined): boolean {
  return (html || '').replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/g, '').length === 0
}

export default function ImprimirOportunidadePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id as string

  const [op, setOp] = useState<Oportunidade | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const { empresa: empresaAtiva } = useEmpresaAtiva()

  useEffect(() => {
    (async () => {
      try {
        const data = await (trpc.crm as any).getById.query({ id }) as Oportunidade
        setOp(data)

        // Duas buscas que o `crm.getById` NÃO faz, e das quais a ficha precisa:
        //  - as tarefas são AgendaTarefa vinculadas à oportunidade, de outro módulo;
        //  - o cliente é um id solto (sem relation Prisma), então não vem no include.
        // Nenhuma das duas pode derrubar a impressão: falhando, a seção se vira
        // com o que a própria oportunidade guarda.
        const [t, c] = await Promise.all([
          (trpc.agenda.tarefa as any).list.query({ oportunidadeId: id }).catch(() => []),
          data.clienteId
            ? (trpc.cliente as any).getById.query({ id: data.clienteId }).catch(() => null)
            : Promise.resolve(null),
        ])
        setTarefas((t as Tarefa[]) || [])
        setCliente((c as Cliente) || null)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  // Nomeia o arquivo no "Salvar como PDF" do navegador, na mesma forma da
  // proposta: identificador + quem + documento.
  useEffect(() => {
    if (!op) return
    const numero = op.numero != null ? `#${String(op.numero).padStart(4, '0')}` : ''
    const quem = (cliente?.razaoSocial || op.razaoSocial || op.titulo || 'Oportunidade').toUpperCase()
    const docLimpo = (cliente?.documento || op.cpfCnpj || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    const docFinal = docLimpo.length >= 6 ? `${docLimpo.slice(-6, -2)}-${docLimpo.slice(-2)}` : ''
    const anterior = document.title
    document.title = ['OPORTUNIDADE', numero, '-', quem, docFinal ? `- ${docFinal}` : '']
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    return () => { document.title = anterior }
  }, [op, cliente])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!op) {
    return <div className="p-8 text-center text-muted-foreground">Oportunidade não encontrada</div>
  }

  const empresaNome = empresaAtiva?.nomeFantasia ?? empresaAtiva?.razaoSocial ?? 'Empresa'
  const empresaLogoUrl = resolveAssetUrl(empresaAtiva?.logoUrl ?? null) || null

  // O cliente vinculado vence o texto livre do lead: quando a oportunidade já
  // virou cadastro, é o cadastro que está certo.
  const quemNome = cliente?.razaoSocial || op.razaoSocial || '—'
  const quemDoc = formatDocumento(cliente?.documento || op.cpfCnpj, cliente?.tipoDocumento) || '—'
  const quemEmail = cliente?.email || op.contatoEmail || null
  const quemTelefone = cliente?.telefone || op.contatoTelefone || null

  const temContato = !!(op.contatoNome || op.contatoCargo || op.contatoTelefone || op.contatoEmail)
  const valor = Number(op.valor ?? 0)
  const numeroLabel = op.numero != null ? `#${String(op.numero).padStart(4, '0')}` : '—'

  const tarefasAbertas = tarefas.filter(t => !t.concluida)
  const tarefasFeitas = tarefas.filter(t => t.concluida)

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
        .quote-doc .top-accent {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: ${MODULE_COLOR};
          z-index: 2;
        }
        .quote-doc .quote-content { position: relative; z-index: 1; }
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
        .quote-doc .accent-bar {
          display: inline-block;
          width: 36px; height: 3px;
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
        .quote-doc .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px 32px;
        }
        .quote-doc .info-grid .full { grid-column: 1 / -1; }

        /* Valor da oportunidade — o equivalente ao total da proposta. */
        .quote-doc .valor-box {
          margin-top: 16px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding-top: 12px;
          border-top: 1.5px solid #1a1a1a;
        }
        .quote-doc .valor-box .lbl {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 700;
        }
        .quote-doc .valor-box .val {
          font-size: 22px;
          font-weight: 700;
          color: ${MODULE_COLOR};
          letter-spacing: -0.01em;
          font-variant-numeric: tabular-nums;
        }

        /* Etiquetas (tags do CRM) — cor vem do cadastro de cada tag. */
        .quote-doc .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .quote-doc .chip {
          font-size: 10.5px;
          font-weight: 600;
          border-radius: 99px;
          padding: 2px 9px;
          border: 1px solid #e5e7eb;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Tabelas (tarefas, arquivos) */
        .quote-doc .items { width: 100%; border-collapse: collapse; margin-top: 8px; }
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
          padding: 10px 8px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 12.5px;
          vertical-align: top;
        }
        .quote-doc .items tbody tr:last-child td { border-bottom: 1.5px solid #1a1a1a; }
        .quote-doc .items td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .quote-doc .items td.meta {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6b7280;
          font-weight: 600;
        }
        .quote-doc .feito { color: #9ca3af; text-decoration: line-through; }

        /* Anotações: cada uma é um bloco com autor e data. */
        .quote-doc .nota {
          padding: 10px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .quote-doc .nota:last-child { border-bottom: none; }
        .quote-doc .nota-meta {
          font-size: 10px;
          color: #6b7280;
          margin-bottom: 4px;
          font-weight: 600;
        }

        /* Histórico: lista densa, data à esquerda. */
        .quote-doc .linha-hist {
          display: flex;
          gap: 12px;
          padding: 5px 0;
          border-bottom: 1px dotted #e5e7eb;
          font-size: 11.5px;
        }
        .quote-doc .linha-hist:last-child { border-bottom: none; }
        .quote-doc .linha-hist .quando {
          flex: none;
          width: 118px;
          color: #6b7280;
          font-variant-numeric: tabular-nums;
        }
        .quote-doc .linha-hist .quem { color: #9ca3af; }

        /* Conteúdo vindo do RichEditor (descrição e anotações). */
        .quote-doc .descricao-content { font-size: 13px; line-height: 1.6; color: #1a1a1a; }
        .quote-doc .descricao-content p { margin: 0 0 8px; }
        .quote-doc .descricao-content p:last-child { margin-bottom: 0; }
        .quote-doc .descricao-content p:empty { min-height: 1.6em; }
        .quote-doc .descricao-content ul, .quote-doc .descricao-content ol { margin: 8px 0; padding-left: 24px; }
        .quote-doc .descricao-content ul { list-style: disc; }
        .quote-doc .descricao-content ol { list-style: decimal; }
        .quote-doc .descricao-content li { margin: 2px 0; }
        .quote-doc .descricao-content li > p { margin: 0; }
        .quote-doc .descricao-content strong { font-weight: 700; }
        .quote-doc .descricao-content em { font-style: italic; }
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
        .quote-doc .descricao-content mark {
          padding: 0 1px;
          border-radius: 2px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        /* Tabela (#HLP0404) — o texto da proposta passou a poder conter tabela.
           Sem estas regras ela sai sem grade, com as células coladas. */
        .quote-doc .descricao-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          font-size: 12px;
        }
        .quote-doc .descricao-content th,
        .quote-doc .descricao-content td {
          border: 1px solid #d1d5db;
          padding: 6px 8px;
          vertical-align: top;
          text-align: left;
        }
        .quote-doc .descricao-content th {
          background: #f3f4f6;
          font-weight: 600;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .quote-doc .descricao-content th > p,
        .quote-doc .descricao-content td > p { margin: 0; }
        .quote-doc .descricao-vazia { font-style: italic; color: #9ca3af; font-size: 13px; }

        /* Carimbo de desfecho (ganha / perdida) — espelha o aceite da proposta. */
        .quote-doc .selo {
          margin-top: 24px;
          padding: 14px 16px;
          border-radius: 6px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .quote-doc .selo-titulo {
          margin: 0 0 3px;
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .quote-doc .selo-texto { margin: 0; font-size: 11.5px; line-height: 1.5; }
        .quote-doc .selo.ganho { border: 1px solid #a7f3d0; border-left: 3px solid #10b981; background: #f0fdf4; }
        .quote-doc .selo.ganho .selo-titulo { color: #065f46; }
        .quote-doc .selo.ganho .selo-texto { color: #047857; }
        .quote-doc .selo.perda { border: 1px solid #fecaca; border-left: 3px solid #ef4444; background: #fef2f2; }
        .quote-doc .selo.perda .selo-titulo { color: #991b1b; }
        .quote-doc .selo.perda .selo-texto { color: #b91c1c; }

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
            padding: 0 0 56px 0 !important;
            box-shadow: none !important;
            background: white !important;
          }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }

          .quote-doc .doc-number,
          .quote-doc .accent-bar,
          .quote-doc .valor-box .val,
          .quote-doc .chip,
          .quote-doc .selo,
          .quote-doc .watermark {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* position:fixed dentro de @media print = repete em cada página. */
          .quote-doc .watermark { position: fixed !important; }
          .quote-doc .top-accent { display: none !important; }
          .quote-doc .footer {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 !important;
            padding-top: 8px !important;
            background: white !important;
          }

          /* Quebras seguras: nada de linha, nota ou bloco cortado ao meio. */
          .quote-doc .descricao-content p,
          .quote-doc .descricao-content li,
          .quote-doc .descricao-content blockquote {
            break-inside: avoid;
            page-break-inside: avoid;
            orphans: 3;
            widows: 3;
          }
          .quote-doc .descricao-content tr,
          .quote-doc .items tr,
          .quote-doc .nota,
          .quote-doc .linha-hist,
          .quote-doc .info-grid,
          .quote-doc .valor-box,
          .quote-doc .selo {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .quote-doc .section-title {
            break-after: avoid;
            page-break-after: avoid;
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

      {/* Toolbar — visível apenas em tela. "Voltar" usa o deep-link ?op=<id>,
          que é como o CRM abre o detalhe: não existe rota própria da
          oportunidade, ela vive num Sheet dentro do kanban. */}
      <div className="no-print flex items-center gap-2 max-w-[880px] mx-auto px-4 pt-4">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push(`/crm?op=${id}`)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button size="sm" className="text-white gap-1.5 ml-auto" style={{ backgroundColor: MODULE_COLOR }} onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {/* DOCUMENTO */}
      <div className="quote-doc">
        <div className="top-accent" aria-hidden />
        <div
          className="watermark"
          aria-hidden
          style={{ backgroundImage: `url("${resolveAssetUrl(empresaAtiva?.marcaDaguaUrl) || '/marca-dagua.png'}")` }}
        />

        <div className="quote-content">

          {/* HEADER */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              {empresaLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={empresaLogoUrl} alt={empresaNome} style={{ maxHeight: 56, maxWidth: 220, objectFit: 'contain' }} />
              ) : (
                <h2 style={{ fontSize: 18, letterSpacing: '-0.01em' }}>{empresaNome}</h2>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="accent-bar" />
              <p className="label" style={{ marginBottom: 4 }}>Oportunidade</p>
              <p className="doc-number num-mono">{numeroLabel}</p>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                Criada em <strong style={{ color: '#1a1a1a' }}>{formatDate(op.createdAt)}</strong>
              </p>
              {op.previsaoFechamento && (
                <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  Previsão <strong style={{ color: '#1a1a1a' }}>{formatDate(op.previsaoFechamento)}</strong>
                </p>
              )}
            </div>
          </div>

          {/* DADOS DA OPORTUNIDADE */}
          <div style={{ marginBottom: 32 }}>
            <div className="section-title">Dados da Oportunidade</div>
            <div className="info-grid">
              <div className="full">
                <p className="label">Título</p>
                <p className="value">{op.titulo}</p>
              </div>
              <div>
                <p className="label">Etapa</p>
                <p className="value">
                  {op.etapa?.nome || '—'}
                  {op.etapa?.probabilidade != null && (
                    <span style={{ color: '#6b7280', fontWeight: 400 }}> · {op.etapa.probabilidade}% de chance</span>
                  )}
                </p>
              </div>
              <div>
                <p className="label">Responsável</p>
                <p className="value">{op.responsavel?.name || '—'}</p>
              </div>
              <div>
                <p className="label">Origem</p>
                <p className="value">{op.campanhaNome || op.origem || '—'}</p>
              </div>
              <div>
                <p className="label">Temperatura</p>
                <p className="value">
                  {op.temperatura || '—'}
                  {op.score != null && <span style={{ color: '#6b7280', fontWeight: 400 }}> · score {op.score}</span>}
                </p>
              </div>
              {op.tags.length > 0 && (
                <div className="full">
                  <p className="label" style={{ marginBottom: 6 }}>Etiquetas</p>
                  <div className="chips">
                    {op.tags.map(t => (
                      <span
                        key={t.tag.id}
                        className="chip"
                        style={t.tag.cor ? { borderColor: t.tag.cor, color: t.tag.cor } : undefined}
                      >
                        {t.tag.nome}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="valor-box">
              <span className="lbl">Valor</span>
              <span className="val">{valor > 0 ? formatCurrency(valor) : 'A definir'}</span>
            </div>
          </div>

          {/* CLIENTE / LEAD */}
          <div style={{ marginBottom: 32 }}>
            <div className="section-title">{cliente ? 'Cliente' : 'Lead'}</div>
            <div className="info-grid">
              <div>
                <p className="label">Razão Social</p>
                <p className="value">{quemNome}</p>
              </div>
              <div>
                <p className="label">CPF / CNPJ</p>
                <p className="value num-mono">{quemDoc}</p>
              </div>
              {op.nomeFantasia && (
                <div>
                  <p className="label">Nome Fantasia</p>
                  <p className="value">{op.nomeFantasia}</p>
                </div>
              )}
              {(op.cnaeCodigo || op.cnaeDescricao) && (
                <div>
                  <p className="label">CNAE</p>
                  <p className="value">
                    {op.cnaeCodigo && <span className="num-mono">{op.cnaeCodigo} </span>}
                    {op.cnaeDescricao}
                  </p>
                </div>
              )}
              {quemEmail && (
                <div>
                  <p className="label">E-mail</p>
                  <p className="value">{quemEmail}</p>
                </div>
              )}
              {quemTelefone && (
                <div>
                  <p className="label">Telefone</p>
                  <p className="value num-mono">{quemTelefone}</p>
                </div>
              )}
            </div>
          </div>

          {/* CONTATO — só quando a oportunidade guarda um interlocutor próprio. */}
          {temContato && (
            <div style={{ marginBottom: 32 }}>
              <div className="section-title">Contato</div>
              <div className="info-grid">
                <div>
                  <p className="label">Nome</p>
                  <p className="value">{op.contatoNome || '—'}</p>
                </div>
                <div>
                  <p className="label">Cargo</p>
                  <p className="value">{op.contatoCargo || '—'}</p>
                </div>
                <div>
                  <p className="label">Telefone</p>
                  <p className="value num-mono">{op.contatoTelefone || '—'}</p>
                </div>
                <div>
                  <p className="label">E-mail</p>
                  <p className="value">{op.contatoEmail || '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* DESCRIÇÃO */}
          <div style={{ marginBottom: 32 }}>
            <div className="section-title">Descrição</div>
            {htmlVazio(op.descricao) ? (
              <p className="descricao-vazia">Oportunidade sem descrição</p>
            ) : (
              <div className="descricao-content" dangerouslySetInnerHTML={{ __html: op.descricao || '' }} />
            )}
          </div>

          {/* TAREFAS */}
          <div style={{ marginBottom: 32 }}>
            <div className="section-title">Tarefas</div>
            {tarefas.length === 0 ? (
              <p className="descricao-vazia">Nenhuma tarefa vinculada.</p>
            ) : (
              <table className="items">
                <thead>
                  <tr>
                    <th>Tarefa</th>
                    <th style={{ width: 90 }}>Prioridade</th>
                    <th style={{ width: 110 }}>Prazo</th>
                    <th style={{ width: 90 }}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Abertas primeiro: numa ficha impressa, o que falta fazer
                      importa mais do que o que já foi feito. */}
                  {[...tarefasAbertas, ...tarefasFeitas].map(t => (
                    <tr key={t.id}>
                      <td className={t.concluida ? 'feito' : undefined}>{t.titulo}</td>
                      <td className="meta">{t.prioridade || 'NORMAL'}</td>
                      <td className="num-mono">
                        {formatDate(t.prazo)}
                        {t.horaPrazo ? ` ${t.horaPrazo}` : ''}
                      </td>
                      <td className="meta">{t.concluida ? 'Concluída' : 'Aberta'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ANOTAÇÕES */}
          <div style={{ marginBottom: 32 }}>
            <div className="section-title">Anotações</div>
            {op.mensagens.length === 0 ? (
              <p className="descricao-vazia">Nenhuma anotação registrada.</p>
            ) : (
              op.mensagens.map(m => (
                <div className="nota" key={m.id}>
                  <p className="nota-meta">
                    {m.user?.name || 'Sistema'} · {formatDateTime(m.createdAt)}
                  </p>
                  {/* A anotação virou HTML no #HLP0218 — renderiza como a descrição. */}
                  <div className="descricao-content" dangerouslySetInnerHTML={{ __html: m.mensagem || '' }} />
                </div>
              ))
            )}
          </div>

          {/* ARQUIVOS — os nomes, não os anexos em si. */}
          {op.arquivos.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div className="section-title">Arquivos</div>
              <table className="items">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th className="right" style={{ width: 110 }}>Enviado em</th>
                  </tr>
                </thead>
                <tbody>
                  {op.arquivos.map(a => (
                    <tr key={a.id}>
                      <td>{a.fileName}</td>
                      <td className="right num-mono">{formatDate(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* HISTÓRICO */}
          <div style={{ marginBottom: 8 }}>
            <div className="section-title">Histórico</div>
            {op.eventos.length === 0 ? (
              <p className="descricao-vazia">Sem movimentações registradas.</p>
            ) : (
              <>
                {op.eventos.map(e => (
                  <div className="linha-hist" key={e.id}>
                    <span className="quando">{formatDateTime(e.createdAt)}</span>
                    <span style={{ flex: 1 }}>
                      {e.descricao || e.tipo}
                      {e.de && e.para && (
                        <span style={{ color: '#6b7280' }}> ({e.de} → {e.para})</span>
                      )}
                    </span>
                    <span className="quem">{e.user?.name || 'Sistema'}</span>
                  </div>
                ))}
                {/* O backend corta em 50. Dizer isso evita que a ficha passe por
                    completa quando não está. */}
                {op.eventos.length >= 50 && (
                  <p style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 8, fontStyle: 'italic' }}>
                    Exibindo as 50 movimentações mais recentes.
                  </p>
                )}
              </>
            )}
          </div>

          {/* DESFECHO — carimbo, quando a etapa é de ganho ou perda. */}
          {op.etapa?.ehGanho && (
            <div className="selo ganho">
              <p className="selo-titulo">Oportunidade ganha</p>
              <p className="selo-texto">
                Está na etapa <strong>{op.etapa.nome}</strong>
                {valor > 0 ? `, no valor de ${formatCurrency(valor)}` : ''}.
              </p>
            </div>
          )}
          {op.etapa?.ehPerda && (
            <div className="selo perda">
              <p className="selo-titulo">Oportunidade perdida</p>
              <p className="selo-texto">
                Está na etapa <strong>{op.etapa.nome}</strong>
                {op.motivoPerda ? `. Motivo: ${op.motivoPerda}` : '.'}
              </p>
            </div>
          )}

          {/* FOOTER */}
          <div className="footer">
            <span>{empresaNome} · Documento interno</span>
            <span>Oportunidade {numeroLabel} · {formatDate(op.createdAt)}</span>
          </div>

        </div>
      </div>
    </>
  )
}
