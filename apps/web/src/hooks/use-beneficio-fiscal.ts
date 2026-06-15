import { useUserPermissions } from './use-user-permissions'

/** Permissões do módulo Benefícios Fiscais (bloco Legalização). */
export function useBeneficioFiscalPerms() {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const admin = isMaster || isEmpresaMaster
  const perm = permissions.find((p) => p.moduleSlug === 'beneficios-fiscais')
  return {
    canRead: admin || !!perm?.canRead,
    canWrite: admin || !!perm?.canWrite,
    canManageCatalogo: admin || perm?.subPermissions?.['manage_catalogo'] === true,
    canGerarOrcamento: admin || perm?.subPermissions?.['gerar_orcamento'] === true,
    canDelete: admin || perm?.subPermissions?.['delete_beneficios'] === true,
  }
}
