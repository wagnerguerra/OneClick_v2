// Hook de permissões do usuário — mesma fonte de verdade do sistema web.
//
// Encapsula `trpc.user.getMyPermissions` e expõe um `podeVer(slug)` que espelha
// o helper do AppDrawer: master/empresa-master enxergam tudo; demais precisam de
// `canRead` no módulo. Enquanto carrega ou se a query falhar, é conservador:
//   - `podeVer(null)` sempre true (itens sem permissão exigida);
//   - `podeVer(<slug>)` retorna `false` até as permissões chegarem, evitando
//     "piscar" um módulo restrito antes de confirmar o acesso.

import { trpc } from '@/lib/trpc'

export interface UsePermissionsResult {
  /** true se o usuário pode ver o módulo de `slug` (`null` = sempre visível). */
  podeVer: (slug: string | null) => boolean
  /**
   * true se o usuário tem a sub-permissão `key` no módulo `slug`. Master sempre
   * retorna true. Espelha o `subPermissions` (JSON) por módulo do sistema web.
   */
  temSubPermissao: (slug: string, key: string) => boolean
  /** Master global ou master da empresa. */
  isMaster: boolean
  /** Ainda carregando as permissões. */
  isLoading: boolean
  /** A query de permissões falhou. */
  isError: boolean
}

export function usePermissions(): UsePermissionsResult {
  const { data: perms, isLoading, isError } = trpc.user.getMyPermissions.useQuery()

  const isMaster = Boolean(perms?.isMaster || perms?.isEmpresaMaster)

  function podeVer(slug: string | null): boolean {
    if (slug === null) return true
    if (!perms) return false
    if (perms.isMaster || perms.isEmpresaMaster) return true
    return perms.permissions.some((p) => p.moduleSlug === slug && p.canRead)
  }

  function temSubPermissao(slug: string, key: string): boolean {
    if (!perms) return false
    if (perms.isMaster || perms.isEmpresaMaster) return true
    const mod = perms.permissions.find((p) => p.moduleSlug === slug)
    const subs = (mod?.subPermissions ?? {}) as Record<string, boolean>
    return subs[key] === true
  }

  return { podeVer, temSubPermissao, isMaster, isLoading, isError }
}
