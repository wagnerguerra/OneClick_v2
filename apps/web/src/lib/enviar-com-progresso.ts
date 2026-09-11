'use client'

import { getApiUrl } from '@/lib/api-url'

/**
 * Envia um arquivo para `/api/upload` reportando o progresso.
 *
 * `XMLHttpRequest` e não `fetch`, que é o padrão do resto do sistema: o
 * `fetch` não expõe progresso de UPLOAD. Existe `ReadableStream` no corpo da
 * requisição em navegadores recentes, mas exige HTTP/2, `duplex: 'half'` e
 * ainda não é universal — e o que se ganharia seria o mesmo número que o
 * `upload.onprogress` do XHR já entrega em toda parte.
 *
 * `withCredentials` é o equivalente ao `credentials: 'include'`: sem ele o
 * cookie de sessão não vai, e o upload volta 401.
 */
export function enviarComProgresso(
  arquivo: File,
  onProgresso: (pct: number) => void,
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', arquivo)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${getApiUrl()}/api/upload`)
    xhr.withCredentials = true

    xhr.upload.onprogress = e => {
      // `lengthComputable` é falso quando o servidor não anuncia o tamanho.
      // Nesse caso não há porcentagem honesta a mostrar, e inventar uma faria
      // a barra andar sozinha e parar — pior que não andar.
      if (!e.lengthComputable) return
      onProgresso(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Falha ao enviar "${arquivo.name}". Tente de novo.`))
        return
      }
      try {
        resolve(JSON.parse(xhr.responseText) as { url: string })
      } catch {
        reject(new Error('O servidor respondeu de forma inesperada ao envio.'))
      }
    }

    xhr.onerror = () => reject(new Error(`Falha de rede ao enviar "${arquivo.name}".`))
    xhr.onabort = () => reject(new Error('Envio cancelado.'))

    xhr.send(form)
  })
}
