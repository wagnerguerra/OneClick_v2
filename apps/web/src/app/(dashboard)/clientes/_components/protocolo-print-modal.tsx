'use client'

/**
 * Comprovante de protocolo — o papel que o cliente assina, num modal.
 *
 * Fiel ao `modal-protocol-print.asp` do v1: logotipo, data por extenso à
 * direita, razão social do cliente, "REF.: Protocolo nº N" à direita, a lista
 * de documentos e o canhoto com as três linhas (data, nome, assinatura).
 *
 * Duas coisas que o ASP chumbava no código e aqui vêm do cadastro da empresa: a
 * assinatura do fecho e o endereço do rodapé — mudar de sala exigia editar o
 * arquivo.
 *
 * Imprimir de dentro de um modal exige desmontar o modal na hora da impressão:
 * o Radix o deixa `fixed`, com altura máxima e rolagem própria, e sem isso o
 * papel sairia com o pedaço que estava visível na tela. As regras de `@media
 * print` no fim do arquivo devolvem o documento ao fluxo da folha.
 */

import { useEffect, useState } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTitle, RichContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'

interface Protocolo {
  id: string
  numero: number
  data: string
  documentos: string | null
  cliente: { razaoSocial: string; nomeFantasia: string | null; documento: string | null }
}

/** "Terça-feira, 1 de setembro de 2026" — o formato por extenso do v1. */
function porExtenso(iso: string): string {
  const t = new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function ProtocoloPrintModal({ protocoloId, onClose }: {
  /** null fecha o modal — o card guarda só o id do protocolo escolhido. */
  protocoloId: string | null
  onClose: () => void
}) {
  const { empresa } = useEmpresaAtiva()
  const [p, setP] = useState<Protocolo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!protocoloId) { setP(null); setErro(null); return }
    setP(null); setErro(null)
    ;(trpc.cliente as never as { getProtocolo: { query: (i: { id: string }) => Promise<Protocolo> } })
      .getProtocolo.query({ id: protocoloId })
      .then(setP)
      .catch((e: Error) => setErro(e.message))
  }, [protocoloId])

  // Endereço numa linha só, como no rodapé do v1.
  const endereco = [
    [empresa?.logradouro, empresa?.numero].filter(Boolean).join(', '),
    empresa?.complemento,
    empresa?.bairro,
    [empresa?.cidade, empresa?.uf].filter(Boolean).join('/'),
    empresa?.cep ? `Cep: ${empresa.cep}` : null,
  ].filter(Boolean).join(', ')

  return (
    <Dialog open={!!protocoloId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[900px]">
        <DialogTitle className="sr-only">
          Comprovante do protocolo{p ? ` nº ${p.numero}` : ''}
        </DialogTitle>

        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 print:hidden">
          <p className="text-[13px] font-semibold text-foreground">
            {p ? `Protocolo nº ${p.numero} — ${p.cliente.razaoSocial}` : 'Comprovante'}
          </p>
          <Button size="sm" className="gap-1.5" onClick={() => window.print()} disabled={!p}>
            <Printer className="h-4 w-4" />Imprimir
          </Button>
        </div>

        <div className="nice-scrollbar overflow-y-auto px-5 py-6">
          {erro ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{erro}</p>
          ) : !p ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="protocolo-doc">
              {empresa?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveAssetUrl(empresa.logoUrl)} alt="" className="logo" />
              )}

              <p className="data">{porExtenso(p.data)}</p>
              <h2 className="cliente">{p.cliente.razaoSocial}</h2>
              <h2 className="ref">REF.: Protocolo nº {p.numero}</h2>

              <p className="abertura">
                Prezado(a),<br />
                Segue em anexo os documentos relacionados abaixo:
              </p>

              <div className="documentos">
                {p.documentos
                  ? <RichContent html={p.documentos} />
                  : <p className="vazio">— sem documentos relacionados —</p>}
              </div>

              <p className="fecho">
                Atenciosamente,<br />
                {empresa?.razaoSocial ?? ''}
              </p>

              {/* O canhoto: é aqui que o cliente assina o recebimento. */}
              <table className="recibo">
                <tbody>
                  <tr><td className="rotulo">Recebimento:</td><td className="linha">______/______/______</td></tr>
                  <tr><td className="rotulo">Nome Completo:</td><td className="linha">_________________________________________</td></tr>
                  <tr><td className="rotulo">Assinatura:</td><td className="linha">_________________________________________</td></tr>
                </tbody>
              </table>

              {/* Duas linhas, como no v1: a razão social e, embaixo, o endereço
                  com o telefone no fim da mesma linha. */}
              <div className="rodape">
                <p>{empresa?.razaoSocial ?? ''}</p>
                <p>{[endereco, empresa?.telefone ? `Tel.: ${empresa.telefone}` : null].filter(Boolean).join(' - ')}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      <style jsx global>{`
        .protocolo-doc {
          max-width: 800px;
          margin: 0 auto;
          color: var(--color-foreground);
          font-size: 15px;
          line-height: 1.6;
        }
        .protocolo-doc .logo { max-height: 84px; object-fit: contain; }
        .protocolo-doc .data { margin-top: 8px; text-align: right; font-size: 17px; }
        .protocolo-doc .cliente { margin-top: 48px; font-size: 20px; font-weight: 700; }
        .protocolo-doc .ref { margin-top: 4px; text-align: right; font-size: 20px; font-weight: 700; }
        .protocolo-doc .abertura { margin-top: 28px; font-size: 17px; }
        .protocolo-doc .documentos { margin-top: 20px; font-size: 17px; }
        .protocolo-doc .documentos .vazio { color: var(--color-muted-foreground); font-style: italic; }
        .protocolo-doc .fecho { margin-top: 52px; font-size: 17px; }
        .protocolo-doc .recibo { width: 70%; margin: 64px 0 0 auto; }
        .protocolo-doc .recibo td { height: 48px; font-size: 17px; vertical-align: bottom; }
        .protocolo-doc .recibo .rotulo { width: 45%; font-weight: 700; }
        .protocolo-doc .recibo .linha { font-weight: 700; }
        .protocolo-doc .rodape {
          margin-top: 56px;
          padding-top: 10px;
          border-top: 1px solid var(--color-border);
          text-align: center;
          font-size: 12px;
          line-height: 1.45;
          color: var(--color-muted-foreground);
        }

        @media print {
          /* Só o comprovante vai ao papel. */
          body * { visibility: hidden !important; }
          .protocolo-doc, .protocolo-doc * { visibility: visible !important; }
          .dialog-overlay { display: none !important; }

          /* O modal volta ao fluxo: sem ele, a folha sairia com o recorte que
             estava visível na rolagem interna. */
          div:has(> .dialog-content) {
            position: static !important;
            overflow: visible !important;
            padding: 0 !important;
          }
          .dialog-content {
            position: static !important;
            max-width: none !important;
            max-height: none !important;
            overflow: visible !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
          }
          .dialog-content > div { overflow: visible !important; padding: 0 !important; }

          .protocolo-doc {
            max-width: none;
            color: #000;
            font-size: 12pt;
          }
          .protocolo-doc .rodape { border-top-color: #999; color: #444; }
          @page { size: A4; margin: 14mm 12mm; }
        }
      `}</style>
    </Dialog>
  )
}
