'use client'

import { useUserPermissions } from '@/hooks/use-user-permissions'

/**
 * Permissões do módulo clientes (write/delete + sub-permissões por aba/ação).
 * Espelha o gateamento do backend em `apps/api/src/cliente/cliente.router.ts`.
 * master/empresa-master sempre podem tudo.
 */
export function useClientesPerms() {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const isAdmin = isMaster || isEmpresaMaster
  const perm = permissions.find((p) => p.moduleSlug === 'clientes')
  const canWrite = isAdmin || !!perm?.canWrite
  const canDelete = isAdmin || !!perm?.canDelete

  const sub = (k: string) => isAdmin || perm?.subPermissions?.[k] === true

  const canManageActivitiesBenefits = sub('manage_activities_benefits')
  const canManageFiles = sub('manage_files')
  const canEditDetails = sub('edit_details')             // dados básicos, contatos, históricos, ocorrências, imports de cadastro
  const canManageServices = sub('manage_services')       // serviços contratados / parâmetros / copiar estrutura
  const canManageResponsible = sub('manage_responsible') // responsáveis pelas áreas
  const canManageContracts = sub('manage_contracts')     // parâmetros de contrato
  const canManageCommercial = sub('manage_commercial')   // aba comercial
  const canEditTaxation = sub('edit_taxation')           // tributação
  const canManageFiscal = sub('manage_fiscal')           // fiscal: CNAEs, DTE, SCI, BI
  const canManageRegistration = sub('manage_registration') // legalização: acessos, vencimentos, andamentos, protocolos, obrigações, inscrições, sócios
  const canManageClientUsers = sub('manage_client_users') // aba usuários do cliente
  const canRenegotiation = sub('renegotiation')          // situação renegociação

  // Edição de observações de certificado: módulo gestao-certificados (writeProcedure no backend)
  const certPerm = permissions.find((p) => p.moduleSlug === 'gestao-certificados')
  const canEditCertificados = isAdmin || !!certPerm?.canWrite
  const canDownloadCert = isAdmin || certPerm?.subPermissions?.['download_arquivo'] === true

  return {
    isAdmin, canWrite, canDelete,
    canManageActivitiesBenefits, canManageFiles, canEditCertificados, canDownloadCert,
    canEditDetails, canManageServices, canManageResponsible, canManageContracts, canManageCommercial,
    canEditTaxation, canManageFiscal, canManageRegistration, canManageClientUsers, canRenegotiation,
  }
}
