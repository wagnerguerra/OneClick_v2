/**
 * A trilha de "Recentes" da busca global — armazenamento e recorte.
 *
 * Mora fora do componente porque é regra de permissão, não desenho de tela, e
 * porque assim dá para fixá-la em teste sem montar a paleta inteira.
 *
 * O vazamento que deu origem a este arquivo: Páginas saía de
 * `useNavegacaoPermitida`, mas Recentes vinha direto do `localStorage`, sem
 * passar por permissão nenhuma. Um usuário com acesso só a Gestão de Arquivos
 * abria o Ctrl+K e via Usuários, Clientes e HelpDesk — o rastro de outra sessão
 * no mesmo navegador, ou de uma permissão que ele já teve e perdeu.
 */

export type Recente = { titulo: string; href: string }

/**
 * A chave é POR USUÁRIO, e não uma só do navegador.
 *
 * Com uma chave única o rastro de quem usou o computador antes sobrevivia ao
 * logout — o `localStorage` não sabe de sessão nem de permissão.
 */
export const CHAVE_RECENTES = 'busca-global-recentes'
export const MAX_RECENTES = 6

export function chaveDe(userId: string): string {
  return `${CHAVE_RECENTES}:${userId}`
}

function ler(chave: string): Recente[] {
  try {
    const cru = localStorage.getItem(chave)
    const v: unknown = cru ? JSON.parse(cru) : null
    return Array.isArray(v) ? (v as Recente[]) : []
  } catch {
    // Navegador com storage bloqueado (ou JSON corrompido): a paleta funciona
    // igual, só sem histórico.
    return []
  }
}

/**
 * Sem usuário não há trilha: antes de a sessão resolver, o certo é não oferecer
 * nada, e não oferecer o que estava gravado de antes.
 *
 * A chave antiga é APAGADA, não herdada. Ela é um balde sem dono — o rastro de
 * todo mundo que usou este navegador — e herdá-la é a própria falha que este
 * arquivo existe para fechar: o filtro de permissão barraria a tela que o
 * herdeiro não alcança, mas deixaria passar tudo que os dois alcançam, que é
 * justamente o caso comum entre colegas. O preço de apagar é a lista nascer
 * vazia uma vez; ela se refaz sozinha nas próximas navegações.
 */
export function lerRecentes(userId: string | null): Recente[] {
  try { localStorage.removeItem(CHAVE_RECENTES) } catch { /* storage bloqueado */ }
  if (!userId) return []
  return ler(chaveDe(userId)).slice(0, MAX_RECENTES)
}

export function registrarRecente(userId: string | null, titulo: string, href: string): void {
  if (!userId) return
  try {
    const atual = lerRecentes(userId).filter(r => r.href !== href)
    localStorage.setItem(chaveDe(userId), JSON.stringify([{ titulo, href }, ...atual].slice(0, MAX_RECENTES)))
  } catch { /* idem */ }
}

/**
 * Descarta o recente que este usuário não alcança.
 *
 * A gravação já só registra tela do menu permitido — mas o que está GRAVADO
 * pode ter nascido sob outra permissão, ou sob outro usuário na chave antiga.
 * A permissão de hoje é a que vale, então o corte definitivo é na exibição.
 *
 * Casa por prefixo de rota: `/usuarios/<id>/editar` pertence a `/usuarios`, e a
 * barra no fim evita que `/clientes` libere `/clientes-inativos`.
 */
export function filtrarPermitidos(recentes: Recente[], permitidos: string[]): Recente[] {
  return recentes.filter(r => permitidos.some(h => r.href === h || r.href.startsWith(h + '/')))
}
