/**
 * Retentativa quando a API está fora do ar por instantes (#HLP0412).
 *
 * Todo deploy troca o container da API, e nos ~20 s em que o novo ainda está
 * subindo qualquer chamada falha. Com vários deploys por dia em horário de
 * expediente, isso virou "às vezes o CRM não salva, só salva se eu duplicar a
 * página" — a pessoa via um "Falha ao salvar" genérico e desistia, sendo que
 * bastava clicar de novo alguns segundos depois.
 *
 * Aqui o cliente espera a API voltar e repete o pedido sozinho, com um aviso
 * discreto na tela. Só repete o que a API NÃO processou:
 *  - falha de rede (o fetch nem obteve resposta);
 *  - 502/503/504, ou 5xx sem o JSON do tRPC — é o proxy (ou o rewrite do
 *    Next) respondendo no lugar da API, que não recebeu o pedido.
 * Um erro de verdade da API (validação, permissão, regra de negócio, 500 do
 * tRPC) sempre vem em JSON e passa direto, sem repetir.
 */

/** Esperas entre as tentativas — somam ~45 s, o dobro do boot da API. */
export const ESPERAS_MS = [1000, 2000, 3000, 5000, 7000, 8000, 9000, 10000]

/** A resposta veio do proxy, não da API (o pedido não foi processado)? */
export function respostaDeIndisponibilidade(status: number, contentType: string | null): boolean {
  if (status === 502 || status === 503 || status === 504) return true
  return status >= 500 && !/json/i.test(contentType ?? '')
}

/** Falha de rede: o navegador não obteve resposta nenhuma. */
export function erroDeRede(err: unknown): boolean {
  return err instanceof TypeError && /failed to fetch|network|load failed|fetch failed/i.test(err.message)
}

type Aviso = { mostrar: () => void; esconder: () => void }

/**
 * fetch com retentativa. `aviso` é chamado quando começa a esperar e quando
 * termina (com sucesso ou desistindo). Respeita o `signal` do chamador.
 */
export async function fetchComRetentativa(
  fazer: () => Promise<Response>,
  opts: { signal?: AbortSignal | null; aviso?: Aviso; esperas?: number[]; dormir?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const esperas = opts.esperas ?? ESPERAS_MS
  const dormir = opts.dormir ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  let avisou = false
  try {
    for (let tentativa = 0; ; tentativa++) {
      let res: Response | null = null
      let erro: unknown = null
      try {
        res = await fazer()
      } catch (e) {
        erro = e
      }
      const indisponivel = res
        ? respostaDeIndisponibilidade(res.status, res.headers.get('content-type'))
        : erroDeRede(erro)
      const ultima = tentativa >= esperas.length
      if (!indisponivel || ultima || opts.signal?.aborted) {
        if (res) return res
        throw erro
      }
      if (!avisou) { opts.aviso?.mostrar(); avisou = true }
      await dormir(esperas[tentativa]!)
      if (opts.signal?.aborted) {
        if (res) return res
        throw erro
      }
    }
  } finally {
    if (avisou) opts.aviso?.esconder()
  }
}

/**
 * Aviso na tela enquanto espera a API voltar. DOM puro, fora do React e do
 * SweetAlert: um toast do Swal fecharia um diálogo de confirmação que
 * estivesse aberto, e este aviso pode surgir a partir de qualquer chamada.
 * Contador de referência: várias chamadas esperando = um aviso só.
 */
let esperando = 0
let el: HTMLDivElement | null = null

export const avisoAtualizacao: Aviso = {
  mostrar() {
    if (typeof document === 'undefined') return
    esperando++
    if (el) return
    el = document.createElement('div')
    el.setAttribute('role', 'status')
    el.className = 'fixed bottom-4 left-1/2 z-[2147483647] -translate-x-1/2 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground shadow-lg'
    el.innerHTML = '<span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"></span>'
      + '<span>Sistema em atualização — suas informações estão preservadas. Concluindo assim que voltar…</span>'
    document.body.appendChild(el)
  },
  esconder() {
    if (typeof document === 'undefined') return
    esperando = Math.max(0, esperando - 1)
    if (esperando === 0 && el) { el.remove(); el = null }
  },
}
