/**
 * Traduz falhas da API da Anthropic numa mensagem para quem usa o sistema.
 *
 * O SDK devolve o corpo cru do erro (`400 {"type":"error",...}`), e era isso que
 * aparecia no alerta do assistente. Aqui identificamos os casos conhecidos —
 * sobretudo falta de créditos — e devolvemos um texto em português, com o que
 * fazer. O texto original continua nos logs de quem chama.
 */
export function mensagemErroIa(e: unknown): string {
  const bruto = e instanceof Error ? e.message : String(e ?? '')
  const status = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : null
  const txt = bruto.toLowerCase()

  if (txt.includes('credit balance') || txt.includes('billing') || txt.includes('purchase credits')) {
    return 'O assistente de IA está sem créditos no momento. Peça ao administrador do sistema para incluir créditos na conta da Anthropic (Plans & Billing) e tente de novo.'
  }
  if (status === 401 || txt.includes('authentication_error') || txt.includes('invalid x-api-key')) {
    return 'A chave de acesso do assistente de IA é inválida ou foi revogada. Avise o administrador do sistema.'
  }
  if (status === 403 || txt.includes('permission_error')) {
    return 'A conta do assistente de IA não tem permissão para esta operação. Avise o administrador do sistema.'
  }
  if (status === 429 || txt.includes('rate_limit')) {
    return 'O assistente de IA recebeu muitos pedidos ao mesmo tempo. Aguarde um minuto e tente de novo.'
  }
  if (status === 529 || txt.includes('overloaded')) {
    return 'O serviço de IA está sobrecarregado agora. Tente de novo em alguns minutos.'
  }
  if (txt.includes('prompt is too long') || txt.includes('too many tokens') || txt.includes('request_too_large')) {
    return 'O conteúdo enviado ao assistente é grande demais. Remova anexos ou encurte a conversa (Limpar) e tente de novo.'
  }
  if ((status !== null && status >= 500) || txt.includes('api_error')) {
    return 'O serviço de IA está instável no momento. Tente de novo em alguns minutos.'
  }
  if (txt.includes('fetch failed') || txt.includes('econnreset') || txt.includes('etimedout') || txt.includes('connection error')) {
    return 'Não foi possível falar com o serviço de IA. Verifique a conexão e tente de novo.'
  }
  return 'O assistente de IA não conseguiu responder agora. Tente de novo; se persistir, avise o administrador do sistema.'
}
