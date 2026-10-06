import { trpc } from '@/lib/trpc'
import type { CertidaoPortal } from '../_components/painel-inicio'

/** Rotas do portal usadas pelas telas de certidões (o cliente tRPC do portal é tipado à mão). */
export interface PortalCertidoesApi {
  certidoes: {
    lista: { query(i: { clienteId: string }): Promise<CertidaoPortal[]> }
    pdf: { query(i: { clienteId: string; tipo: string; id: string }): Promise<{ pdfBase64: string | null }> }
  }
}

export const apiCertidoes = () => trpc.portal as unknown as PortalCertidoesApi

/**
 * Baixa o PDF de uma certidão do cliente. Usado pelo quadro da página inicial
 * e pela página "Certidões e Alvarás" — um caminho só para os dois.
 */
export async function baixarCertidao(clienteId: string, c: CertidaoPortal): Promise<void> {
  const r = await apiCertidoes().certidoes.pdf.query({ clienteId, tipo: c.tipo, id: c.id }).catch(() => null)
  if (!r?.pdfBase64) {
    window.alert('Não foi possível baixar este documento agora. Tente de novo em instantes.')
    return
  }
  const bytes = Uint8Array.from(atob(r.pdfBase64), ch => ch.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${c.label.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
