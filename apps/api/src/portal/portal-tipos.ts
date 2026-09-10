/**
 * Contratos do Portal do Cliente que ATRAVESSAM a fronteira para o front.
 *
 * Arquivo sem nenhum import de propósito. O front tipa o cliente tRPC a partir
 * do `AppRouter`, e por tabela acaba lendo todo módulo que o router referencia.
 * Quando um desses módulos importa algo que só existe no servidor —
 * `better-auth/crypto`, por exemplo, que não resolve a partir de `apps/web` —
 * o tipo de retorno degrada e a rota inteira some do `AppRouter`, com um erro
 * de compilação que aponta para o lugar errado.
 *
 * Tipo compartilhado mora aqui. Implementação, ao lado.
 */

export interface ConviteValido {
  nome: string
  email: string
  cliente: string
  /** Já existe senha definida? Muda o texto da tela: convite × novo acesso. */
  primeiroAcesso: boolean
}
