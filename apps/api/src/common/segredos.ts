/**
 * Remove credenciais de textos que vão sair do servidor.
 *
 * Gateway devolve a própria credencial dentro da mensagem de erro — o SERPRO,
 * por exemplo, ecoa a Consumer Key no campo `client_id` de um 401. Repassar o
 * corpo cru da resposta para a tela, para o log ou para a tabela de métricas
 * publica a chave em três lugares de uma vez.
 *
 * Cobre duas frentes, porque nenhuma sozinha basta:
 * - o valor que conhecemos (o que está no ambiente), venha em que formato vier;
 * - o formato que reconhecemos (`client_id: ...`, `Bearer ...`), mesmo quando o
 *   valor não é nosso ou foi trocado sem passar por aqui.
 */

/** Variáveis cujo valor nunca pode aparecer numa mensagem. */
const VARIAVEIS_SIGILOSAS = [
  'CONSUMER_KEY', 'CONSUMER_SECRET', 'CERTIFICADO_SENHA', 'CERTIFICADO_PF_SENHA',
  'ACESSORIAS_API_TOKEN', 'ACESSORIAS_PASSWORD',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'GOVBR_CLIENT_SECRET', 'SERPROID_CLIENT_SECRET',
  'BETTER_AUTH_SECRET', 'DAEMON_SECRET',
  'SMTP_PASS', 'S3_SECRET_KEY', 'S3_ACCESS_KEY',
]

/** Campos que carregam credencial, com o valor logo depois. */
const CAMPO_COM_CREDENCIAL =
  /\b(client_id|client_secret|access_token|refresh_token|api[_-]?key|password|senha|token)\b("?\s*[:=]\s*"?)([A-Za-z0-9._~+/=-]{8,})/gi

/** Cabeçalho de autorização em texto. */
const AUTORIZACAO = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi

export function semSegredos(texto: string): string {
  if (!texto) return texto
  let saida = texto

  for (const nome of VARIAVEIS_SIGILOSAS) {
    const valor = process.env[nome]
    // Valor curto demais não é credencial e sairia trocando pedaços legítimos
    // do texto por asteriscos.
    if (valor && valor.length >= 8) saida = saida.split(valor).join('***')
  }

  saida = saida.replace(CAMPO_COM_CREDENCIAL, (_todo, campo, separador) => `${campo}${separador}***`)
  return saida.replace(AUTORIZACAO, (_todo, esquema) => `${esquema} ***`)
}
