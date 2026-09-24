/**
 * O que deu errado ao falar com o Google Drive — e o que dizer a quem lê.
 *
 * ## Por que isto existe
 *
 * Em 25/09/2026 o portal passou dias mostrando "Não foi possível falar com o
 * Google Drive agora." O "agora" dizia que era passageiro, e ninguém agiu. Não
 * era: o Google tinha invalidado o refresh token da conta que o sistema usa
 * (`invalid_grant` — "Token has been expired or revoked."). Nada ia voltar
 * sozinho; alguém precisava reconectar a conta.
 *
 * A mesma frase servia para três situações que pedem reações opostas:
 *
 *  - `autorizacao` — o Google recusou a credencial. Só um administrador
 *    resolve, reautorizando a conta.
 *  - `configuracao` — a credencial nem está configurada, ou está ilegível.
 *    Também é o administrador.
 *  - `transitorio` — rede, limite de requisições, instabilidade do Google.
 *    Esperar e tentar de novo resolve.
 *
 * Vive fora do serviço, sem Nest e sem Prisma, para a classificação ter teste.
 */

export type TipoFalhaDrive = 'autorizacao' | 'configuracao' | 'transitorio'

/**
 * Quem vai ler a mensagem.
 *
 * O escritório pode ouvir o nome do problema — é ele quem tem de agir. O
 * cliente, não: dizer ao cliente que "a credencial do Google expirou" expõe o
 * funcionamento interno e não lhe dá nada para fazer.
 */
export type PublicoDoErro = 'escritorio' | 'portal'

/** Códigos OAuth que significam "a credencial não vale mais", não "tente de novo". */
const CODIGOS_DE_AUTORIZACAO = new Set(['invalid_grant', 'unauthorized_client', 'invalid_client'])

/**
 * Trechos das mensagens que o `DriveClient` lança quando nem chega a montar a
 * credencial. Espelham os `throw new Error(...)` de `drive.client.ts`.
 */
const SINAIS_DE_CONFIGURACAO = [
  'Credenciais Google não configuradas',
  'OAuth: falha ao ler',
  'não contém installed.client_id',
  'Service Account:',
]

/** Classifica uma falha vinda do cliente do Drive (googleapis / gaxios). */
export function classificarFalhaDrive(e: unknown): TipoFalhaDrive {
  const mensagem = e instanceof Error ? e.message : String(e ?? '')

  // O gaxios põe o corpo da resposta do OAuth em `response.data`:
  //   { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }
  const dados = (e as { response?: { data?: { error?: unknown } } } | null)?.response?.data
  const codigo = typeof dados?.error === 'string' ? dados.error : null
  if (codigo && CODIGOS_DE_AUTORIZACAO.has(codigo)) return 'autorizacao'

  // Nem sempre há `response`: na renovação do token, o googleapis lança um
  // Error cujo `message` É o código ("invalid_grant").
  for (const c of CODIGOS_DE_AUTORIZACAO) {
    if (mensagem.includes(c)) return 'autorizacao'
  }
  if (/expired or revoked/i.test(mensagem)) return 'autorizacao'

  if (SINAIS_DE_CONFIGURACAO.some(s => mensagem.includes(s))) return 'configuracao'

  return 'transitorio'
}

export const MENSAGENS_DRIVE: Readonly<Record<PublicoDoErro, Record<TipoFalhaDrive, string>>> = {
  escritorio: {
    autorizacao:
      'A conexão do sistema com o Google Drive expirou e precisa ser refeita pelo administrador. '
      + 'Até lá, os documentos ficam indisponíveis aqui e no portal dos clientes.',
    configuracao:
      'A integração com o Google Drive não está configurada corretamente. '
      + 'Avise o administrador do sistema.',
    transitorio: 'Não foi possível falar com o Google Drive agora. Tente de novo em instantes.',
  },
  portal: {
    // Sem nomear credencial nem Google: o cliente não tem o que fazer com isso,
    // e o que ele precisa saber é que não é culpa dele e a quem recorrer.
    autorizacao:
      'Os documentos estão temporariamente indisponíveis. '
      + 'Se precisar de algum com urgência, fale com o seu escritório contábil.',
    configuracao:
      'Os documentos estão temporariamente indisponíveis. '
      + 'Se precisar de algum com urgência, fale com o seu escritório contábil.',
    transitorio: 'Não foi possível carregar os documentos agora. Tente de novo em instantes.',
  },
}

/** A mensagem certa para a falha e para quem vai ler. */
export function mensagemDaFalhaDrive(e: unknown, publico: PublicoDoErro): string {
  return MENSAGENS_DRIVE[publico][classificarFalhaDrive(e)]
}

/**
 * A falha pede um administrador? Decide o NÍVEL do log: `error` para o que não
 * volta sozinho, `warn` para o passageiro. É o que faz a falha de credencial
 * aparecer no meio dos avisos de rede, em vez de se afogar neles.
 */
export function falhaDriveExigeAdministrador(e: unknown): boolean {
  return classificarFalhaDrive(e) !== 'transitorio'
}
