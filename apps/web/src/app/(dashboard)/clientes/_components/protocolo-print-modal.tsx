'use client'

/**
 * Comprovante de protocolo — o papel que o cliente assina, num modal.
 *
 * Fiel ao `modal-protocol-print.asp` do v1: logotipo, data por extenso à
 * direita, razão social do cliente, "REF.: Protocolo nº N" à direita, a lista
 * de documentos, o fecho e o canhoto com as três linhas (data, nome,
 * assinatura), e o rodapé com o endereço.
 *
 * A impressão sai por um IFRAME, não pelo `window.print()` da página. Tentar
 * imprimir o modal no lugar exigia desmontar, via `@media print`, o
 * posicionamento fixo e a rolagem interna que o Radix aplica — e o resultado
 * foram três folhas em branco. No iframe o documento é a única coisa que
 * existe: sem app em volta, sem modal, sem variável de tema para resolver.
 */

import { useEffect, useRef, useState } from 'react'
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

/** "Segunda-feira, 31 de agosto de 2026" — o formato por extenso do v1. */
function porExtenso(iso: string): string {
  const t = new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const soDigitos = (v?: string | null) => (v ?? '').replace(/\D/g, '')

/** 29165130 → 29165-130. O cadastro guarda sem máscara; o papel leva com. */
function cep(v?: string | null): string {
  const d = soDigitos(v)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v ?? '')
}

/** 2721048300 → (27) 2104-8300 */
function telefone(v?: string | null): string {
  const d = soDigitos(v)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return v ?? ''
}

/**
 * CSS do papel. Fica como texto porque é ele que vai para dentro do iframe —
 * onde não existem as variáveis de tema do app, então as cores são literais.
 */
const CSS_PAPEL = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .protocolo-doc { max-width: 800px; margin: 0 auto; font-size: 11pt; line-height: 1.5; }
  .protocolo-doc .logo { max-height: 70px; object-fit: contain; }
  .protocolo-doc .data { margin: 6px 0 0; text-align: right; font-size: 11pt; }
  .protocolo-doc .cliente { margin: 34px 0 0; font-size: 13pt; font-weight: 700; }
  .protocolo-doc .ref { margin: 6px 0 0; text-align: right; font-size: 13pt; font-weight: 700; }
  .protocolo-doc .abertura { margin: 26px 0 0; }
  .protocolo-doc .documentos { margin: 16px 0 0; }
  .protocolo-doc .documentos p { margin: 0 0 4px; }
  .protocolo-doc .documentos .vazio { font-style: italic; color: #666; }
  .protocolo-doc .fecho { margin: 46px 0 0; }
  .protocolo-doc .recibo { width: 70%; margin: 54px 0 0 auto; border-collapse: collapse; }
  .protocolo-doc .recibo td { height: 42px; vertical-align: bottom; }
  .protocolo-doc .recibo .rotulo { width: 42%; font-weight: 700; }
  .protocolo-doc .recibo .linha { font-weight: 700; }
  .protocolo-doc .rodape {
    margin: 56px 0 0; padding-top: 8px;
    text-align: center; font-size: 8.5pt; line-height: 1.4; color: #333;
  }
  .protocolo-doc .rodape p { margin: 0; }
`

export function ProtocoloPrintModal({ protocoloId, onClose }: {
  /** null fecha o modal — o card guarda só o id do protocolo escolhido. */
  protocoloId: string | null
  onClose: () => void
}) {
  const { empresa } = useEmpresaAtiva()
  const [p, setP] = useState<Protocolo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const docRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!protocoloId) { setP(null); setErro(null); return }
    setP(null); setErro(null)
    ;(trpc.cliente as never as { getProtocolo: { query: (i: { id: string }) => Promise<Protocolo> } })
      .getProtocolo.query({ id: protocoloId })
      .then(setP)
      .catch((e: Error) => setErro(e.message))
  }, [protocoloId])

  /**
   * Copia o documento para um iframe e imprime de lá. Espera as imagens: o
   * logotipo chega por rede, e imprimir antes dele deixaria um buraco no topo.
   */
  function imprimir() {
    const doc = docRef.current
    if (!doc) return
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(frame)

    const w = frame.contentWindow
    if (!w) { frame.remove(); return }
    w.document.open()
    w.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
      + `<title>Protocolo nº ${p?.numero ?? ''}</title>`
      + `<style>${CSS_PAPEL}@page { size: A4; margin: 14mm 12mm; }</style>`
      + `</head><body>${doc.outerHTML}</body></html>`,
    )
    w.document.close()

    const disparar = () => {
      w.focus()
      w.print()
      // O Chrome imprime de forma síncrona, mas o Firefox não: remover o iframe
      // na hora cancelaria o diálogo dele.
      setTimeout(() => frame.remove(), 1500)
    }
    const imagens = Array.from(w.document.images)
    const pendentes = imagens.filter(i => !i.complete)
    if (pendentes.length === 0) { disparar(); return }
    let faltam = pendentes.length
    const pronta = () => { if (--faltam === 0) disparar() }
    pendentes.forEach(i => { i.addEventListener('load', pronta); i.addEventListener('error', pronta) })
    // Rede lenta não pode travar a impressão para sempre.
    setTimeout(() => { if (faltam > 0) { faltam = 0; disparar() } }, 3000)
  }

  const endereco = [
    [empresa?.logradouro, empresa?.numero].filter(Boolean).join(', '),
    empresa?.complemento,
    empresa?.bairro,
    [empresa?.cidade, empresa?.uf].filter(Boolean).join('/'),
    empresa?.cep ? `Cep: ${cep(empresa.cep)}` : null,
  ].filter(Boolean).join(', ')
  const rodapeLinha2 = [endereco, empresa?.telefone ? `Tel.: ${telefone(empresa.telefone)}` : null]
    .filter(Boolean).join(' - ')

  return (
    <Dialog open={!!protocoloId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[900px]">
        <DialogTitle className="sr-only">
          Comprovante do protocolo{p ? ` nº ${p.numero}` : ''}
        </DialogTitle>

        {/* `pr-14` abre espaço para o × do modal, que fica sobreposto no canto. */}
        <div className="flex items-center justify-between gap-3 border-b border-border py-3 pl-5 pr-14">
          <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">
            {p ? `Protocolo nº ${p.numero} — ${p.cliente.razaoSocial}` : 'Comprovante'}
          </p>
          {/* type="button": o card vive dentro do <form> da ficha do cliente, e
              sem isto o clique salvava o cadastro em vez de imprimir. */}
          <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={imprimir} disabled={!p}>
            <Printer className="h-4 w-4" />Imprimir
          </Button>
        </div>

        <div className="nice-scrollbar overflow-y-auto bg-white px-6 py-6">
          {erro ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{erro}</p>
          ) : !p ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="protocolo-doc" ref={docRef}>
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

              {/* Duas linhas, como no v1: razão social em cima; endereço e
                  telefone juntos embaixo. Tudo do cadastro do tenant — no ASP
                  era texto chumbado, e mudar de sala exigia editar o arquivo. */}
              <div className="rodape">
                <p>{empresa?.razaoSocial ?? ''}</p>
                {rodapeLinha2 && <p>{rodapeLinha2}</p>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Na tela vale o mesmo desenho do papel — o CSS é o mesmo texto, para não
          existirem duas versões do documento que possam divergir. */}
      <style jsx global>{`
        ${CSS_PAPEL}
        .protocolo-doc { color: #000; }
      `}</style>
    </Dialog>
  )
}
