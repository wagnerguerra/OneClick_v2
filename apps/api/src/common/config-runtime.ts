import { prisma } from '@saas/db'

/**
 * Carrega, para o ambiente do processo, as configurações guardadas no banco.
 *
 * Em produção a API roda em contêiner e recebe as variáveis do compose — não
 * existe arquivo `.env` no diretório de deploy. Quem edita uma credencial em
 * /configuracoes precisa que ela sobreviva ao próximo restart, e o único lugar
 * que sobrevive é o banco.
 *
 * Roda antes da aplicação subir, porque há serviço que lê `process.env` na
 * construção. Os que consultam `system_config` direto continuam funcionando
 * igual — esta função só faz o valor chegar também em quem lê o ambiente.
 */

/**
 * Variáveis que o contêiner manda e o banco não pode contradizer.
 *
 * São o endereço da própria infraestrutura: deixar o banco reescrever a URL do
 * banco é circular, e um valor errado salvo pela tela impediria o próximo boot
 * sem deixar caminho de volta pela própria tela.
 */
const SO_DO_AMBIENTE = new Set([
  'DATABASE_URL', 'DIRECT_URL', 'REDIS_URL', 'PORT', 'NODE_ENV',
])

export async function hidratarConfiguracoes(): Promise<number> {
  try {
    const linhas = await prisma.systemConfig.findMany({ select: { key: true, value: true } })
    let aplicadas = 0

    for (const { key, value } of linhas) {
      if (SO_DO_AMBIENTE.has(key) || !value) continue
      process.env[key] = value
      aplicadas++
    }

    return aplicadas
  } catch {
    // Banco indisponível não pode impedir o boot: sem isto a API sobe com o que
    // veio do ambiente, que é o comportamento de antes.
    return 0
  }
}
