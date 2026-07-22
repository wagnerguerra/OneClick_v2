/**
 * mensagemErro — normaliza um erro de chamada à API numa mensagem exibível.
 *
 * Trata especialmente o caso em que a resposta NÃO veio em JSON: quando o
 * backend cai, reinicia ou estoura o tempo de resposta, o proxy reverso devolve
 * "Internal Server Error" (ou uma página HTML) em texto puro. O cliente tRPC/
 * fetch tenta fazer JSON.parse disso e reporta algo como
 * "Unexpected token 'I', "Internal S"... is not valid JSON" — inútil para quem
 * usa o sistema. Nesses casos devolvemos uma mensagem orientativa.
 *
 * Para qualquer outro erro, repassa a mensagem original (que já vem tratada do
 * backend, ex.: "Service Manager não está conectado..."). Sem mensagem, usa o
 * fallback informado.
 */
export function mensagemErro(e: unknown, fallback = 'Ocorreu um erro inesperado. Tente novamente.'): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (!msg) return fallback
  // Resposta não-JSON: proxy 500/502/504 em texto, página HTML de erro, etc.
  if (/is not valid JSON|Unexpected token|Unexpected end of (JSON|input)|<!DOCTYPE|<html/i.test(msg)) {
    return 'O servidor não respondeu corretamente — pode estar fora do ar ou ter excedido o tempo de resposta. Tente novamente em instantes.'
  }
  return msg
}
