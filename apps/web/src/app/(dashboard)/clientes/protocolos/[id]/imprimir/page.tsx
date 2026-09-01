'use client'

/**
 * Comprovante de protocolo, para impressão.
 *
 * Fiel ao `modal-protocol-print.asp` do v1, que é o papel que o cliente assina:
 * logotipo, data por extenso à direita, razão social do cliente, "REF.:
 * Protocolo nº N" à direita, a lista de documentos e o bloco de recebimento com
 * as três linhas (data, nome, assinatura). O rodapé traz o endereço.
 *
 * Duas coisas que o v1 chumbava no código e aqui vêm do cadastro da empresa: a
 * assinatura ("Central Contábil LTDA.") e o endereço do rodapé. Mudar de sala
 * exigia editar o ASP.
 *
 * A folha abre a caixa de impressão sozinha, como o `onLoad="self.print()"` do
 * v1 — mas só depois de o conteúdo chegar, senão imprime a página em branco.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Printer, ArrowLeft } from 'lucide-react'
import { Button, RichContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'

interface Protocolo {
  id: string
  numero: number
  data: string
  documentos: string | null
  recebido: boolean
  usuarioNomeResolvido: string | null
  cliente: { razaoSocial: string; nomeFantasia: string | null; documento: string | null }
}

/** "1 de Setembro de 2026" — o mesmo formato por extenso que o v1 imprimia. */
function porExtenso(iso: string): string {
  const d = new Date(iso)
  const texto = d.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default function ImprimirProtocoloPage() {
  const params = useParams<{ id: string }>()
  const { empresa } = useEmpresaAtiva()
  const [p, setP] = useState<Protocolo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    (trpc.cliente as never as { getProtocolo: { query: (i: { id: string }) => Promise<Protocolo> } })
      .getProtocolo.query({ id: params.id })
      .then(setP)
      .catch((e: Error) => setErro(e.message))
  }, [params.id])

  // Só chama a impressão depois que o documento existe na tela.
  useEffect(() => {
    if (!p) return
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [p])

  const endereco = [
    [empresa?.logradouro, empresa?.numero].filter(Boolean).join(', '),
    empresa?.complemento,
    empresa?.bairro,
    [empresa?.cidade, empresa?.uf].filter(Boolean).join('/'),
    empresa?.cep ? `Cep: ${empresa.cep}` : null,
  ].filter(Boolean).join(', ')

  if (erro) return <div className="py-16 text-center text-sm text-muted-foreground">{erro}</div>
  if (!p) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <>
      {/* Barra de controle — some na impressão */}
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />Voltar
        </Button>
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />Imprimir
        </Button>
      </div>

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

        <p className="assinatura">
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

        <div className="rodape">
          <span>{empresa?.razaoSocial ?? ''}</span>
          {endereco && <span>{endereco}</span>}
          {empresa?.telefone && <span>Tel.: {empresa.telefone}</span>}
        </div>
      </div>

      <style jsx global>{`
        .protocolo-doc {
          position: relative;
          max-width: 850px;
          min-height: 26cm;
          margin: 0 auto;
          padding: 0 24px 120px;
          background: var(--color-card);
          color: var(--color-foreground);
          font-size: 15px;
          line-height: 1.6;
        }
        .protocolo-doc .logo { max-height: 90px; object-fit: contain; }
        .protocolo-doc .data { margin-top: 8px; text-align: right; font-size: 17px; }
        .protocolo-doc .cliente { margin-top: 56px; font-size: 20px; font-weight: 700; }
        .protocolo-doc .ref { margin-top: 4px; text-align: right; font-size: 20px; font-weight: 700; }
        .protocolo-doc .abertura { margin-top: 28px; font-size: 17px; }
        .protocolo-doc .documentos { margin-top: 20px; font-size: 17px; }
        .protocolo-doc .documentos .vazio { color: var(--color-muted-foreground); font-style: italic; }
        .protocolo-doc .assinatura { margin-top: 56px; font-size: 17px; }
        .protocolo-doc .recibo { width: 70%; margin: 72px 0 0 auto; }
        .protocolo-doc .recibo td { height: 50px; font-size: 17px; vertical-align: bottom; }
        .protocolo-doc .recibo .rotulo { width: 45%; font-weight: 700; }
        .protocolo-doc .recibo .linha { font-weight: 700; }
        .protocolo-doc .rodape {
          position: absolute;
          bottom: 24px; left: 24px; right: 24px;
          display: flex; flex-direction: column; align-items: center;
          font-size: 12px;
          color: var(--color-muted-foreground);
        }

        @media print {
          /* Só o documento vai para o papel: menu, cabeçalho e barra somem. */
          body * { visibility: hidden; }
          .protocolo-doc, .protocolo-doc * { visibility: visible; }
          .protocolo-doc {
            position: absolute; inset: 0;
            max-width: none; min-height: auto;
            padding: 0 12mm 0;
            background: #fff; color: #000;
            font-size: 12pt;
          }
          .protocolo-doc .rodape { position: fixed; bottom: 8mm; color: #444; }
          @page { size: A4; margin: 12mm 0; }
        }
      `}</style>
    </>
  )
}
