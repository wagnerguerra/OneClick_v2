'use client'

import { useEffect, useState } from 'react'

/** Converte o base64 devolvido pelo servidor num PDF na memória da aba. */
export function blobPdf(base64: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'application/pdf' })
}

/**
 * Endereços temporários dos PDFs prontos, para o botão de baixar ser um link
 * de verdade (`<a href download>`) em vez de um clique simulado.
 *
 * Baixar chamando `a.click()` no código é, para o Chrome, um download iniciado
 * pela página — e ele barra esse caminho quando o perfil tem restrição de
 * downloads automáticos, com a mensagem "É preciso ter permissão para fazer o
 * download" e nenhum erro do nosso lado. Um link clicado pela própria pessoa é
 * o caminho nativo, e esse o navegador não questiona.
 *
 * O argumento precisa vir direto do estado do componente: montá-lo na hora da
 * chamada criaria um endereço novo a cada repintura.
 */
export function useUrlPdf<T extends { base64: string }>(item: T | null): string | undefined {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!item) { setUrl(undefined); return }
    const criada = URL.createObjectURL(blobPdf(item.base64))
    setUrl(criada)
    return () => URL.revokeObjectURL(criada)
  }, [item])

  return url
}

/** Mesma ideia de {@link useUrlPdf}, para uma lista de arquivos prontos. */
export function useUrlsPdf<T extends { base64: string }>(itens: T[]): string[] {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const criadas = itens.map((i) => URL.createObjectURL(blobPdf(i.base64)))
    setUrls(criadas)
    // Sem o revoke, cada arquivo aberto fica preso na memória da aba até
    // recarregar a página.
    return () => criadas.forEach((u) => URL.revokeObjectURL(u))
  }, [itens])

  return urls
}
