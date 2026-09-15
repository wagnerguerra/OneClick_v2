/**
 * Quem não pode ter sessão, e por quê.
 *
 * Mora fora do AuthService porque ele puxa `better-auth` (ESM), que o jest não
 * carrega — e esta é justamente a regra que mais precisa de teste.
 *
 * O código volta como mensagem do erro do Better Auth, e as telas de login o
 * traduzem. Só chega a quem acertou a senha: a verificação da credencial vem
 * antes da criação da sessão, então isto não revela quais e-mails existem.
 */
export type MotivoDeRecusa = 'USUARIO_INATIVO' | 'EMPRESA_INATIVA'

export function motivoParaRecusarSessao(
  user: { isActive: boolean; isMaster: boolean; empresa: { isActive: boolean } | null } | null,
): MotivoDeRecusa | null {
  if (!user) return null
  // Inativo é inativo, master ou não: desativar é a forma de tirar o acesso.
  if (!user.isActive) return 'USUARIO_INATIVO'
  // O master global passa pela empresa inativa: é ele quem a religa.
  if (!user.isMaster && user.empresa && !user.empresa.isActive) return 'EMPRESA_INATIVA'
  return null
}
