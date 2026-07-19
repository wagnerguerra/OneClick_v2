import { Inject, Injectable } from '@nestjs/common'
import { initTRPC, TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { AreaService } from '../area/area.service'
import { createAreaRouter } from '../area/area.router'
import { FerramentasService } from '../ferramentas/ferramentas.service'
import { createFerramentasRouter } from '../ferramentas/ferramentas.router'
import { EmpresaService } from '../empresa/empresa.service'
import { createEmpresaRouter } from '../empresa/empresa.router'
import { UserService } from '../user/user.service'
import { createUserRouter } from '../user/user.router'
import { CargoService } from '../cargo/cargo.service'
import { createCargoRouter } from '../cargo/cargo.router'
import { OnboardingService } from '../onboarding/onboarding.service'
import { createOnboardingRouter } from '../onboarding/onboarding.router'
import { AdminService } from '../admin/admin.service'
import { createAdminRouter } from '../admin/admin.router'
import { AdminTenantService } from '../admin-tenant/admin-tenant.service'
import { createAdminTenantRouter } from '../admin-tenant/admin-tenant.router'
import { ClienteService } from '../cliente/cliente.service'
import { ClienteEnriquecimentoService } from '../cliente/cliente-enriquecimento.service'
import { SincronizarResponsaveisService } from '../cliente/sincronizar-responsaveis.service'
import { ImportOneclickService } from '../cliente/import-oneclick.service'
import { LegacyImportService } from '../cliente/legacy-import.service'
import { SciService } from '../cliente/sci.service'
import { ContratoSyncService } from '../cliente/contrato-sync.service'
import { createClienteRouter } from '../cliente/cliente.router'
import { StripeService } from '../stripe/stripe.service'
import { createBillingRouter } from '../stripe/stripe.router'
import { ColaboradorService } from '../colaborador/colaborador.service'
import { createColaboradorRouter } from '../colaborador/colaborador.router'
import { FornecedorService } from '../fornecedor/fornecedor.service'
import { createFornecedorRouter } from '../fornecedor/fornecedor.router'
import { TratamentoLancamentosService } from '../tratamento-lancamentos/tratamento-lancamentos.service'
import { createTratamentoLancamentosRouter } from '../tratamento-lancamentos/tratamento-lancamentos.router'
import { SocioService } from '../socio/socio.service'
import { createSocioRouter } from '../socio/socio.router'
import { CnpjService } from '../cnpj/cnpj.service'
import { SitfisService } from '../sitfis/sitfis.service'
import { createSitfisRouter } from '../sitfis/sitfis.router'
import { CaixaPostalService } from '../caixapostal/caixapostal.service'
import { CaixaPostalSchedulerService } from '../caixapostal/caixapostal.scheduler'
import { createCaixaPostalRouter } from '../caixapostal/caixapostal.router'
import { IntegrationService } from '../cliente/integration.service'
import { CndService } from '../cnd/cnd.service'
import { DctfwebService } from '../dctfweb/dctfweb.service'
import { createDctfwebRouter } from '../dctfweb/dctfweb.router'
import { CndSchedulerService } from '../cnd/cnd.scheduler'
import { CndEstadualService } from '../cnd/cnd-estadual.service'
import { AlvaraBombeirosService } from '../cnd/alvara-bombeiros.service'
import { CndMunicipalService } from '../cnd/cnd-municipal.service'
import { CndtTrabalhistaService } from '../cnd/cndt-trabalhista.service'
import { CrfFgtsService } from '../cnd/crf-fgts.service'
import { CguCertidaoService } from '../cnd/cgu-certidao.service'
import { AlvaraFuncionamentoService } from '../cnd/alvara-funcionamento.service'
import { CompilarCertidoesService } from '../cnd/compilar-certidoes.service'
import { createCndRouter } from '../cnd/cnd.router'
import { BiService } from '../bi/bi.service'
import { createBiRouter, createBiPublicRouter } from '../bi/bi.router'
import { FolhaService } from '../folha/folha.service'
import { createFolhaRouter } from '../folha/folha.router'
import { FolhaBiService } from '../folha-bi/folha-bi.service'
import { createFolhaBiRouter } from '../folha-bi/folha-bi.router'
import { AgendaService } from '../agenda/agenda.service'
import { AgendaGoogleService } from '../agenda/agenda-google.service'
import { createAgendaRouter } from '../agenda/agenda.router'
import { AgendaConfigService } from '../agenda/agenda-config.service'
import { AgendaSalaService } from '../agenda/agenda-sala.service'
import { AgendaDisparoService } from '../agenda/agenda-disparo.service'
import { AgendaLembreteService } from '../agenda/agenda-lembrete.service'
import { AgendaTarefaService } from '../agenda/agenda-tarefa.service'
import { DteService } from '../dte/dte.service'
import { createDteRouter } from '../dte/dte.router'
import { CrmService } from '../crm/crm.service'
import { ImportComercialService } from '../crm/import-comercial.service'
import { createCrmRouter } from '../crm/crm.router'
import { OrcamentoService } from '../orcamento/orcamento.service'
import { createOrcamentoRouter } from '../orcamento/orcamento.router'
import { BeneficioFiscalService } from '../beneficio-fiscal/beneficio-fiscal.service'
import { createBeneficioFiscalRouter } from '../beneficio-fiscal/beneficio-fiscal.router'
import { ReformaTributariaService } from '../reforma-tributaria/reforma-tributaria.service'
import { createReformaTributariaRouter } from '../reforma-tributaria/reforma-tributaria.router'
import { QaService } from '../qa/qa.service'
import { createQaRouter } from '../qa/qa.router'
import { SqlConsoleService } from '../sql-console/sql-console.service'
import { createSqlConsoleRouter } from '../sql-console/sql-console.router'
import { NotaService } from '../nota/nota.service'
import { createNotaRouter } from '../nota/nota.router'
import { WhatsappService } from '../whatsapp/whatsapp.service'
import { WhatsappCloudService } from '../whatsapp/whatsapp-cloud.service'
import { createWhatsappRouter } from '../whatsapp/whatsapp.router'
import { FaqService } from '../faq/faq.service'
import { createFaqRouter } from '../faq/faq.router'
import { ServicoService } from '../servico/servico.service'
import { createServicoRouter } from '../servico/servico.router'
import { ProcessoService } from '../processo/processo.service'
import { createProcessoRouter } from '../processo/processo.router'
import { PesquisaService } from '../pesquisa/pesquisa.service'
import { LeadService } from '../lead/lead.service'
import { createPesquisaRouter } from '../pesquisa/pesquisa.router'
import { createLeadRouter } from '../lead/lead.router'
import { BeneficioService } from '../beneficio/beneficio.service'
import { createBeneficioRouter } from '../beneficio/beneficio.router'
import { ContratoService } from '../contrato/contrato.service'
import { createContratoRouter } from '../contrato/contrato.router'
import { NotificationService } from '../notification/notification.service'
import { createNotificationRouter } from '../notification/notification.router'
import { TabsService } from '../tabs/tabs.service'
import { createTabsRouter } from '../tabs/tabs.router'
import { CertificadoDigitalService } from '../certificado-digital/certificado-digital.service'
import { LegacyImportCertService } from '../certificado-digital/legacy-import-cert.service'
import { BulkImportCertService } from '../certificado-digital/bulk-import-cert.service'
import { createCertificadoDigitalRouter } from '../certificado-digital/certificado-digital.router'
import { DashboardLayoutService } from '../dashboard-layout/dashboard-layout.service'
import { DashboardLayoutEventsService } from '../dashboard-layout/dashboard-layout-events.service'
import { createDashboardLayoutRouter } from '../dashboard-layout/dashboard-layout.router'
import { createPresenceRouter } from '../online-users/presence.router'
import { ChatService } from '../chat/chat.service'
import { createChatRouter } from '../chat/chat.router'
import { PushService } from '../push/push.service'
import { createPushRouter } from '../push/push.router'
import { DashboardCalendarioService } from '../dashboard-calendario/dashboard-calendario.service'
import { createDashboardCalendarioRouter } from '../dashboard-calendario/dashboard-calendario.router'
import { HelpdeskService } from '../helpdesk/helpdesk.service'
import { HelpdeskAiAgentService } from '../helpdesk/helpdesk-ai-agent.service'
import { createHelpdeskRouter } from '../helpdesk/helpdesk.router'
import { PainelTvService } from '../painel-tv/painel-tv.service'
import { createPainelTvRouter } from '../painel-tv/painel-tv.router'
import { AcessoriasService } from '../acessorias/acessorias.service'
import { createAcessoriasRouter } from '../acessorias/acessorias.router'
import { RecorrenciaScheduler } from '../notificacao/recorrencia.scheduler'
import { NotificacaoService } from '../notificacao/notificacao.service'
import { createNotificacaoRouter } from '../notificacao/notificacao.router'
import { ObrigacaoService } from '../obrigacao/obrigacao.service'
import { createObrigacaoRouter } from '../obrigacao/obrigacao.router'
import { FeriadoService } from '../feriado/feriado.service'
import { createFeriadoRouter } from '../feriado/feriado.router'
import { GrupoObrigacaoService } from '../grupo-obrigacao/grupo-obrigacao.service'
import { createGrupoObrigacaoRouter } from '../grupo-obrigacao/grupo-obrigacao.router'
import { ProjetoService } from '../projeto/projeto.service'
import { createProjetoRouter } from '../projeto/projeto.router'
import { MinhasObrigacoesService } from '../minhas-obrigacoes/minhas-obrigacoes.service'
import { AtivoService } from '../ativo/ativo.service'
import { createAtivoRouter } from '../ativo/ativo.router'
import { ClientErrorService } from '../client-error/client-error.service'
import { createClientErrorRouter } from '../client-error/client-error.router'
import { ThemeService } from '../theme/theme.service'
import { createThemeRouter } from '../theme/theme.router'
import { DanfeService } from '../danfe/danfe.service'
import { DanfeLoteService } from '../danfe/danfe-lote.service'
import { createDanfeRouter } from '../danfe/danfe.router'
import { DriveSyncService } from '../drive-sync/drive-sync.service'
import { createDriveSyncRouter } from '../drive-sync/drive-sync.router'
import { NfeDistService } from '../nfe-dist/nfe-dist.service'
import { createNfeDistRouter } from '../nfe-dist/nfe-dist.router'
import { NfseDistService } from '../nfse-dist/nfse-dist.service'
import { createNfseDistRouter } from '../nfse-dist/nfse-dist.router'
import { AgendamentoService } from '../agendamento/agendamento.service'
import { createAgendamentoRouter } from '../agendamento/agendamento.router'
import { GoogleBackupService } from '../google-backup/google-backup.service'
import { createGoogleBackupRouter } from '../google-backup/google-backup.router'
import { SignatureService } from '../signature/signature.service'
import { SignatureTemplateService } from '../signature/signature-template.service'
import { createSignatureRouter } from '../signature/signature.router'
import { createNfseRouter } from '../nfse/nfse.router'
import { createMinhasObrigacoesRouter } from '../minhas-obrigacoes/minhas-obrigacoes.router'
import { AuthService } from '../auth/auth.service'

/**
 * Estado de billing do tenant, calculado no createContext.
 * - ACTIVE: assinatura paga ativa, OU trial vigente não é o foco (acesso liberado),
 *   OU tenant antigo isento (trialEndsAt NULL), OU master global.
 * - TRIAL: período de teste vigente (acesso liberado, mas com aviso/contagem).
 * - TRIAL_EXPIRED: trial acabou sem assinatura → bloqueia features.
 * - SUSPENDED: tenant suspenso manualmente pelo master → bloqueia features.
 */
export type BillingState = 'ACTIVE' | 'TRIAL' | 'TRIAL_EXPIRED' | 'SUSPENDED'

export interface TrpcContext {
  tenantId?: string
  tenantSchema?: string
  userId?: string
  empresaId?: string
  isMaster?: boolean
  isEmpresaMaster?: boolean
  billingState?: BillingState
  trialEndsAt?: Date
}

/**
 * Bloqueia features quando o trial expirou ou o tenant foi suspenso. Chamado no
 * início de TODA permission-procedure (readProcedure/writeProcedure/...), ANTES
 * do bypass de master/empresaMaster — assim o dono do tenant (isEmpresaMaster)
 * também é barrado ao fim do trial. O master GLOBAL nunca cai aqui porque o
 * createContext já devolve billingState='ACTIVE' pra ele.
 * A mensagem é um código legível pelo front (redireciona p/ a tela de planos).
 */
export function assertTenantActive(ctx: TrpcContext) {
  if (ctx.billingState === 'TRIAL_EXPIRED') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'TRIAL_EXPIRED' })
  }
  if (ctx.billingState === 'SUSPENDED') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'SUSPENDED' })
  }
}

interface UserPermissionRow {
  moduleSlug: string
  canRead: boolean
  canWrite: boolean
  canDelete: boolean
  subPermissions: Record<string, boolean> | null
}

// Cache de permissões por userId (TTL 30s — alinhado ao session cache)
const permissionCache = new Map<string, { data: UserPermissionRow[]; expires: number }>()
const PERMISSION_TTL = 30_000

/**
 * Invalida a entrada de cache de um usuário. Chamado quando admin altera as
 * permissões — sem isso, o backend continuaria autorizando/negando com base
 * em permissões antigas por até 30s mesmo após o save.
 */
export function invalidateUserPermissionsCache(userId: string) {
  permissionCache.delete(userId)
}

async function getUserPermissions(userId: string): Promise<UserPermissionRow[]> {
  const cached = permissionCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.data

  const perms = await prisma.userPermission.findMany({
    where: { userId },
    select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true, subPermissions: true },
  }) as UserPermissionRow[]

  permissionCache.set(userId, { data: perms, expires: Date.now() + PERMISSION_TTL })

  // Limpar entradas expiradas periodicamente
  if (permissionCache.size > 200) {
    const now = Date.now()
    for (const [key, val] of permissionCache) {
      if (val.expires < now) permissionCache.delete(key)
    }
  }

  return perms
}

const t = initTRPC.context<TrpcContext>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new Error('Não autorizado')
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

/**
 * Procedure restrita ao MASTER GLOBAL da plataforma (`isMaster`).
 * Diferente das permission-procedures, NÃO libera para `isEmpresaMaster` —
 * usado em módulos de administração global multi-tenant (ex.: gestão de
 * empresas/tenants), que jamais devem ser acessíveis por admins de tenant.
 */
export const masterProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
  }
  if (!ctx.isMaster) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito ao administrador da plataforma' })
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

/**
 * Valida/normaliza um `empresaId` recebido do CLIENTE contra a sessão (F-012).
 * Procedures que aceitam empresaId no input NUNCA devem confiar no valor cru —
 * a "empresa ativa" do cliente pode estar divergente (id antigo no localStorage)
 * ou forjada, permitindo ler/gravar dados de OUTRO tenant.
 *
 * - Não-master: SEMPRE a própria empresa da sessão. Um `inputEmpresaId`
 *   divergente é rejeitado (FORBIDDEN).
 * - Master (admin de plataforma): pode operar sobre a empresa informada
 *   (navegação multi-empresa); cai pra `ctx.empresaId` quando ausente.
 *
 * `scopedEmpresaIdOpt` permite ausência (retorna null); `scopedEmpresaId` exige.
 */
export function scopedEmpresaIdOpt(
  ctx: { isMaster?: boolean; empresaId?: string },
  inputEmpresaId?: string | null,
): string | null {
  if (ctx.isMaster) return inputEmpresaId ?? ctx.empresaId ?? null
  if (inputEmpresaId != null && inputEmpresaId !== ctx.empresaId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Empresa fora do seu acesso.' })
  }
  return ctx.empresaId ?? null
}

export function scopedEmpresaId(
  ctx: { isMaster?: boolean; empresaId?: string },
  inputEmpresaId?: string | null,
): string {
  const id = scopedEmpresaIdOpt(ctx, inputEmpresaId)
  if (!id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Empresa não selecionada' })
  return id
}

// ── Permission-based procedures ─────────────────────────────
// isMaster e isEmpresaMaster sempre têm acesso total.
// Outros usuários precisam da permissão correspondente no módulo.

function createPermissionMiddleware(moduleSlug: string, action: 'canRead' | 'canWrite' | 'canDelete') {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
    }
    assertTenantActive(ctx)

    // Master e EmpresaMaster têm acesso total
    if (ctx.isMaster || ctx.isEmpresaMaster) {
      return next({ ctx: { ...ctx, userId: ctx.userId } })
    }

    const permissions = await getUserPermissions(ctx.userId)
    const modulePerm = permissions.find(p => p.moduleSlug === moduleSlug)

    if (!modulePerm || !modulePerm[action]) {
      const actionLabels = { canRead: 'leitura', canWrite: 'escrita', canDelete: 'exclusão' }
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Sem permissão de ${actionLabels[action]} no módulo "${moduleSlug}"`,
      })
    }

    return next({ ctx: { ...ctx, userId: ctx.userId } })
  })
}

/** Procedure que exige permissão de leitura no módulo */
export function readProcedure(moduleSlug: string) {
  return t.procedure.use(createPermissionMiddleware(moduleSlug, 'canRead'))
}

/** Procedure que exige permissão de escrita no módulo */
export function writeProcedure(moduleSlug: string) {
  return t.procedure.use(createPermissionMiddleware(moduleSlug, 'canWrite'))
}

/** Procedure que exige permissão de exclusão no módulo */
export function deleteProcedure(moduleSlug: string) {
  return t.procedure.use(createPermissionMiddleware(moduleSlug, 'canDelete'))
}

/**
 * Procedure que exige permissão de LEITURA em pelo menos UM dos módulos
 * listados. Útil quando um recurso é "filho lógico" de outro (ex.: sócios
 * vivem dentro do módulo de clientes; quem pode ler clientes deve poder
 * visualizar os sócios deles).
 */
export function readProcedureAnyOf(...moduleSlugs: string[]) {
  return t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
    }
    assertTenantActive(ctx)
    if (ctx.isMaster || ctx.isEmpresaMaster) {
      return next({ ctx: { ...ctx, userId: ctx.userId } })
    }
    const permissions = await getUserPermissions(ctx.userId)
    const ok = moduleSlugs.some(m => permissions.find(p => p.moduleSlug === m && p.canRead))
    if (!ok) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Sem permissão de leitura em nenhum dos módulos: ${moduleSlugs.join(', ')}`,
      })
    }
    return next({ ctx: { ...ctx, userId: ctx.userId } })
  })
}

/**
 * Detecta se uma área pertence ao setor de Legalização — usado pra permitir
 * que usuários desta área editem/removam sócios mesmo sem permissão direta
 * no módulo 'socios' (eles operam pelo módulo 'clientes'). Normaliza acentos
 * e compara por palavras exatas, como o `isAreaTi` do helpdesk.
 */
function isAreaLegalizacao(areaName: string): boolean {
  const normalizado = areaName
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
  const palavras = normalizado.split(/\s+/)
  const tokens = new Set(['legalizacao', 'societario', 'societaria'])
  return palavras.some(p => tokens.has(p))
}

/**
 * Procedure de escrita/exclusão pro módulo de sócios. Permite a ação se:
 *  - master ou empresaMaster, OU
 *  - tem `socios.canWrite/canDelete` direta, OU
 *  - pertence à área Legalização (independente de permissões em outros módulos)
 *
 * A área Legalização é dona desse domínio — qualquer um lotado nela edita/
 * exclui sócios mesmo sem o módulo 'socios' explicitamente habilitado.
 */
function createSocioMiddleware(action: 'canWrite' | 'canDelete') {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
    }
    assertTenantActive(ctx)
    if (ctx.isMaster || ctx.isEmpresaMaster) {
      return next({ ctx: { ...ctx, userId: ctx.userId } })
    }
    const permissions = await getUserPermissions(ctx.userId)
    const socios = permissions.find(p => p.moduleSlug === 'socios')
    if (socios?.[action]) {
      return next({ ctx: { ...ctx, userId: ctx.userId } })
    }
    // Fallback: pertence à área Legalização?
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { area: { select: { name: true } } },
    })
    if (user?.area?.name && isAreaLegalizacao(user.area.name)) {
      return next({ ctx: { ...ctx, userId: ctx.userId } })
    }
    const actionLabels = { canWrite: 'escrita', canDelete: 'exclusão' }
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Sem permissão de ${actionLabels[action]} no módulo "socios"`,
    })
  })
}

export function socioWriteProcedure() {
  return t.procedure.use(createSocioMiddleware('canWrite'))
}
export function socioDeleteProcedure() {
  return t.procedure.use(createSocioMiddleware('canDelete'))
}

// ── Sub-permission middleware ──────────────────────────────
// Verifica se o usuário tem uma sub-permissão específica dentro de um módulo.
// Master/EmpresaMaster sempre passam. Se o usuário não tiver a sub-permissão
// explicitamente definida como false, é tratada como permitida (default: true).

function createSubPermissionMiddleware(moduleSlug: string, subKey: string, label: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
    }
    assertTenantActive(ctx)
    if (ctx.isMaster || ctx.isEmpresaMaster) {
      return next({ ctx: { ...ctx, userId: ctx.userId } })
    }
    const permissions = await getUserPermissions(ctx.userId)
    const modulePerm = permissions.find(p => p.moduleSlug === moduleSlug)
    if (!modulePerm || !modulePerm.canRead) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Sem permissão de leitura no módulo "${moduleSlug}"` })
    }
    const subs = (modulePerm.subPermissions ?? {}) as Record<string, boolean>
    if (subs[subKey] !== true) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Sem permissão para: ${label}` })
    }
    return next({ ctx: { ...ctx, userId: ctx.userId } })
  })
}

/** Procedure que exige permissão de escrita + sub-permissão específica */
export function writeSubProcedure(moduleSlug: string, subKey: string, label: string) {
  return t.procedure
    .use(createPermissionMiddleware(moduleSlug, 'canWrite'))
    .use(createSubPermissionMiddleware(moduleSlug, subKey, label))
}

/** Procedure que exige permissão de leitura + sub-permissão específica */
export function readSubProcedure(moduleSlug: string, subKey: string, label: string) {
  return t.procedure
    .use(createPermissionMiddleware(moduleSlug, 'canRead'))
    .use(createSubPermissionMiddleware(moduleSlug, subKey, label))
}

/**
 * Procedure de leitura que exige QUALQUER UMA das sub-permissões informadas.
 * Útil quando uma permissão mais ampla implica outra (ex.: quem pode
 * "configurar o funil" também pode "acessar o funil"), evitando estados
 * quebrados (ter a de editar mas não a de ver). Master/EmpresaMaster passam.
 */
export function readSubAnyProcedure(moduleSlug: string, subKeys: string[], label: string) {
  return t.procedure.use(createPermissionMiddleware(moduleSlug, 'canRead')).use(
    t.middleware(async ({ ctx, next }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
      }
      assertTenantActive(ctx)
      if (ctx.isMaster || ctx.isEmpresaMaster) {
        return next({ ctx: { ...ctx, userId: ctx.userId } })
      }
      const permissions = await getUserPermissions(ctx.userId)
      const modulePerm = permissions.find(p => p.moduleSlug === moduleSlug)
      const subs = (modulePerm?.subPermissions ?? {}) as Record<string, boolean>
      if (!subKeys.some(k => subs[k] === true)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `Sem permissão para: ${label}` })
      }
      return next({ ctx: { ...ctx, userId: ctx.userId } })
    }),
  )
}

/** Procedure que exige permissão de exclusão + sub-permissão específica */
export function deleteSubProcedure(moduleSlug: string, subKey: string, label: string) {
  return t.procedure
    .use(createPermissionMiddleware(moduleSlug, 'canDelete'))
    .use(createSubPermissionMiddleware(moduleSlug, subKey, label))
}

/**
 * Passa se: master/empresaMaster, OU tem a sub-permissão `subKey` (com canWrite) no
 * módulo `subModule`, OU tem canWrite no módulo alternativo `altModule`. Usado quando
 * uma seção é gerenciada por permissões de DOIS módulos (ex.: "Atividades e Benefícios":
 * atividades[clientes.manage_activities_benefits] & benefícios[beneficios-fiscais.canWrite]),
 * pra quem gerencia um lado também poder gerenciar o outro.
 */
export function writeSubOrModuleWrite(subModule: string, subKey: string, altModule: string, label: string) {
  return t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
    assertTenantActive(ctx)
    if (ctx.isMaster || ctx.isEmpresaMaster) return next({ ctx: { ...ctx, userId: ctx.userId } })
    const permissions = await getUserPermissions(ctx.userId)
    const subMod = permissions.find(p => p.moduleSlug === subModule)
    const subs = (subMod?.subPermissions ?? {}) as Record<string, boolean>
    const okSub = !!subMod?.canWrite && subs[subKey] === true
    const okAlt = !!permissions.find(p => p.moduleSlug === altModule)?.canWrite
    if (!okSub && !okAlt) throw new TRPCError({ code: 'FORBIDDEN', message: `Sem permissão para: ${label}` })
    return next({ ctx: { ...ctx, userId: ctx.userId } })
  })
}

// Tipos de colaborador que lideram o próprio setor — acesso liberado por tipo
// (sem precisar conceder a permissão manualmente). Usado p/ os apontamentos.
const ROLES_LIDER_SETOR = ['GESTOR', 'COORDENADOR', 'DIRETOR']
async function ehLiderDeSetor(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }).catch(() => null)
  return !!u && ROLES_LIDER_SETOR.includes(String(u.role))
}

/** Leitura no módulo OU ser líder de setor (acesso por tipo). */
export function readOrLiderProcedure(moduleSlug: string) {
  return t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
    assertTenantActive(ctx)
    if (ctx.isMaster || ctx.isEmpresaMaster) return next({ ctx: { ...ctx, userId: ctx.userId } })
    if (await ehLiderDeSetor(ctx.userId)) return next({ ctx: { ...ctx, userId: ctx.userId } })
    const perms = await getUserPermissions(ctx.userId)
    const mp = perms.find(p => p.moduleSlug === moduleSlug)
    if (!mp?.canRead) throw new TRPCError({ code: 'FORBIDDEN', message: `Sem permissão de leitura no módulo "${moduleSlug}"` })
    return next({ ctx: { ...ctx, userId: ctx.userId } })
  })
}

/** Escrita + sub-permissão no módulo OU ser líder de setor (acesso por tipo). */
export function writeSubOrLiderProcedure(moduleSlug: string, subKey: string, label: string) {
  return t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
    assertTenantActive(ctx)
    if (ctx.isMaster || ctx.isEmpresaMaster) return next({ ctx: { ...ctx, userId: ctx.userId } })
    if (await ehLiderDeSetor(ctx.userId)) return next({ ctx: { ...ctx, userId: ctx.userId } })
    const perms = await getUserPermissions(ctx.userId)
    const mp = perms.find(p => p.moduleSlug === moduleSlug)
    if (!mp?.canWrite) throw new TRPCError({ code: 'FORBIDDEN', message: `Sem permissão de escrita no módulo "${moduleSlug}"` })
    const subs = (mp.subPermissions ?? {}) as Record<string, boolean>
    if (!subs[subKey]) throw new TRPCError({ code: 'FORBIDDEN', message: `Sem a permissão: ${label}` })
    return next({ ctx: { ...ctx, userId: ctx.userId } })
  })
}

@Injectable()
export class TrpcService {
  public readonly appRouter: ReturnType<typeof this.createRouter>

  constructor(
    @Inject(AreaService) private readonly areaService: AreaService,
    @Inject(EmpresaService) private readonly empresaService: EmpresaService,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(CargoService) private readonly cargoService: CargoService,
    @Inject(OnboardingService) private readonly onboardingService: OnboardingService,
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(AdminTenantService) private readonly adminTenantService: AdminTenantService,
    @Inject(ClienteService) private readonly clienteService: ClienteService,
    @Inject(ImportOneclickService) private readonly importOneclickService: ImportOneclickService,
    @Inject(ClienteEnriquecimentoService) private readonly clienteEnriquecimentoService: ClienteEnriquecimentoService,
    @Inject(SincronizarResponsaveisService) private readonly sincronizarResponsaveisService: SincronizarResponsaveisService,
    @Inject(LegacyImportService) private readonly legacyImportService: LegacyImportService,
    @Inject(SciService) private readonly sciService: SciService,
    @Inject(ContratoSyncService) private readonly contratoSyncService: ContratoSyncService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(ColaboradorService) private readonly colaboradorService: ColaboradorService,
    @Inject(FornecedorService) private readonly fornecedorService: FornecedorService,
    @Inject(TratamentoLancamentosService) private readonly tratamentoLancamentosService: TratamentoLancamentosService,
    @Inject(SocioService) private readonly socioService: SocioService,
    @Inject(CnpjService) private readonly cnpjService: CnpjService,
    @Inject(SitfisService) private readonly sitfisService: SitfisService,
    @Inject(CaixaPostalService) private readonly caixaPostalService: CaixaPostalService,
    @Inject(CaixaPostalSchedulerService) private readonly caixaPostalScheduler: CaixaPostalSchedulerService,
    @Inject(IntegrationService) private readonly integrationService: IntegrationService,
    @Inject(CndService) private readonly cndService: CndService,
    @Inject(CndSchedulerService) private readonly cndScheduler: CndSchedulerService,
    @Inject(CndEstadualService) private readonly cndEstadualService: CndEstadualService,
    @Inject(AlvaraBombeirosService) private readonly alvaraBombeirosService: AlvaraBombeirosService,
    @Inject(CndMunicipalService) private readonly cndMunicipalService: CndMunicipalService,
    @Inject(CndtTrabalhistaService) private readonly cndtTrabalhistaService: CndtTrabalhistaService,
    @Inject(CrfFgtsService) private readonly crfFgtsService: CrfFgtsService,
    @Inject(CguCertidaoService) private readonly cguCertidaoService: CguCertidaoService,
    @Inject(AlvaraFuncionamentoService) private readonly alvaraFuncService: AlvaraFuncionamentoService,
    @Inject(CompilarCertidoesService) private readonly compilarService: CompilarCertidoesService,
    @Inject(DctfwebService) private readonly dctfwebService: DctfwebService,
    @Inject(BiService) private readonly biService: BiService,
    @Inject(FolhaService) private readonly folhaService: FolhaService,
    @Inject(FolhaBiService) private readonly folhaBiService: FolhaBiService,
    @Inject(AgendaService) private readonly agendaService: AgendaService,
    @Inject(AgendaGoogleService) private readonly agendaGoogleService: AgendaGoogleService,
    @Inject(AgendaConfigService) private readonly agendaConfigService: AgendaConfigService,
    @Inject(AgendaSalaService) private readonly agendaSalaService: AgendaSalaService,
    @Inject(AgendaDisparoService) private readonly agendaDisparoService: AgendaDisparoService,
    @Inject(AgendaLembreteService) private readonly agendaLembreteService: AgendaLembreteService,
    @Inject(AgendaTarefaService) private readonly agendaTarefaService: AgendaTarefaService,
    @Inject(ChatService) private readonly chatService: ChatService,
    @Inject(PushService) private readonly pushService: PushService,
    @Inject(DteService) private readonly dteService: DteService,
    @Inject(CrmService) private readonly crmService: CrmService,
    @Inject(ImportComercialService) private readonly importComercialService: ImportComercialService,
    @Inject(OrcamentoService) private readonly orcamentoService: OrcamentoService,
    @Inject(BeneficioFiscalService) private readonly beneficioFiscalService: BeneficioFiscalService,
    @Inject(ReformaTributariaService) private readonly reformaTributariaService: ReformaTributariaService,
    @Inject(QaService) private readonly qaService: QaService,
    @Inject(SqlConsoleService) private readonly sqlConsoleService: SqlConsoleService,
    @Inject(NotaService) private readonly notaService: NotaService,
    @Inject(WhatsappService) private readonly whatsappService: WhatsappService,
    @Inject(WhatsappCloudService) private readonly whatsappCloudService: WhatsappCloudService,
    @Inject(FaqService) private readonly faqService: FaqService,
    @Inject(ServicoService) private readonly servicoService: ServicoService,
    @Inject(ProcessoService) private readonly processoService: ProcessoService,
    @Inject(PesquisaService) private readonly pesquisaService: PesquisaService,
    @Inject(LeadService) private readonly leadService: LeadService,
    @Inject(BeneficioService) private readonly beneficioService: BeneficioService,
    @Inject(ContratoService) private readonly contratoService: ContratoService,
    @Inject(NotificationService) private readonly notificationService: NotificationService,
    @Inject(TabsService) private readonly tabsService: TabsService,
    @Inject(CertificadoDigitalService) private readonly certificadoDigitalService: CertificadoDigitalService,
    @Inject(LegacyImportCertService) private readonly legacyImportCertService: LegacyImportCertService,
    @Inject(BulkImportCertService) private readonly bulkImportCertService: BulkImportCertService,
    @Inject(DashboardLayoutService) private readonly dashboardLayoutService: DashboardLayoutService,
    @Inject(DashboardLayoutEventsService) private readonly dashboardLayoutEventsService: DashboardLayoutEventsService,
    @Inject(DashboardCalendarioService) private readonly dashboardCalendarioService: DashboardCalendarioService,
    @Inject(HelpdeskService) private readonly helpdeskService: HelpdeskService,
    @Inject(HelpdeskAiAgentService) private readonly helpdeskAiAgent: HelpdeskAiAgentService,
    @Inject(PainelTvService) private readonly painelTvService: PainelTvService,
    @Inject(AcessoriasService) private readonly acessoriasService: AcessoriasService,
    @Inject(RecorrenciaScheduler) private readonly recorrenciaScheduler: RecorrenciaScheduler,
    @Inject(NotificacaoService) private readonly notificacaoServiceTrpc: NotificacaoService,
    @Inject(ObrigacaoService) private readonly obrigacaoService: ObrigacaoService,
    @Inject(FeriadoService) private readonly feriadoService: FeriadoService,
    @Inject(GrupoObrigacaoService) private readonly grupoObrigacaoService: GrupoObrigacaoService,
    @Inject(ProjetoService) private readonly projetoService: ProjetoService,
    @Inject(MinhasObrigacoesService) private readonly minhasObrigacoesService: MinhasObrigacoesService,
    @Inject(AtivoService) private readonly ativoService: AtivoService,
    @Inject(ClientErrorService) private readonly clientErrorService: ClientErrorService,
    @Inject(ThemeService) private readonly themeService: ThemeService,
    @Inject(DanfeService) private readonly danfeService: DanfeService,
    @Inject(DanfeLoteService) private readonly danfeLoteService: DanfeLoteService,
    @Inject(DriveSyncService) private readonly driveSyncService: DriveSyncService,
    @Inject(NfeDistService) private readonly nfeDistService: NfeDistService,
    @Inject(NfseDistService) private readonly nfseDistService: NfseDistService,
    @Inject(AgendamentoService) private readonly agendamentoService: AgendamentoService,
    @Inject(GoogleBackupService) private readonly googleBackupService: GoogleBackupService,
    @Inject(SignatureService) private readonly signatureService: SignatureService,
    @Inject(SignatureTemplateService) private readonly signatureTemplateService: SignatureTemplateService,
    @Inject(AuthService) private readonly authServiceForCert: AuthService,
    @Inject(FerramentasService) private readonly ferramentasService: FerramentasService,
  ) {
    this.appRouter = this.createRouter()
  }

  private createRouter() {
    return router({
      health: publicProcedure.query(() => {
        return { status: 'ok', timestamp: new Date().toISOString() }
      }),
      me: protectedProcedure.query(({ ctx }) => {
        return { userId: ctx.userId, tenantId: ctx.tenantId, empresaId: ctx.empresaId, isMaster: ctx.isMaster }
      }),
      area: createAreaRouter(this.areaService),
      ferramentas: createFerramentasRouter(this.ferramentasService),
      empresa: createEmpresaRouter(this.empresaService),
      user: createUserRouter(this.userService),
      cargo: createCargoRouter(this.cargoService),
      ativo: createAtivoRouter(this.ativoService),
      clientError: createClientErrorRouter(this.clientErrorService),
      theme: createThemeRouter(this.themeService),
      danfe: createDanfeRouter(this.danfeService, this.danfeLoteService),
      drive: createDriveSyncRouter(this.driveSyncService),
      nfeDist: createNfeDistRouter(this.nfeDistService),
      nfseDist: createNfseDistRouter(this.nfseDistService),
      agendamento: createAgendamentoRouter(this.agendamentoService),
      googleBackup: createGoogleBackupRouter(this.googleBackupService),
      emailSig: createSignatureRouter(this.signatureService, this.signatureTemplateService),
      nfse: createNfseRouter(this.nfseDistService),
      onboarding: createOnboardingRouter(this.onboardingService),
      admin: createAdminRouter(this.adminService),
      adminTenant: createAdminTenantRouter(this.adminTenantService),
      cliente: createClienteRouter(this.clienteService, this.legacyImportService, this.sciService, this.integrationService, this.importOneclickService, this.cnpjService, this.clienteEnriquecimentoService, this.sincronizarResponsaveisService, this.contratoSyncService),
      billing: createBillingRouter(this.stripeService),
      colaborador: createColaboradorRouter(this.colaboradorService),
      fornecedor: createFornecedorRouter(this.fornecedorService),
      tratamentoLancamentos: createTratamentoLancamentosRouter(this.tratamentoLancamentosService),
      socio: createSocioRouter(this.socioService, this.cnpjService, this.sitfisService),
      sitfis: createSitfisRouter(this.sitfisService, this.cnpjService, this.socioService),
      caixaPostal: createCaixaPostalRouter(this.caixaPostalService, this.caixaPostalScheduler),
      cnd: createCndRouter(this.cndService, this.cndScheduler, this.cndEstadualService, this.alvaraBombeirosService, this.cndMunicipalService, this.cndtTrabalhistaService, this.crfFgtsService, this.cguCertidaoService, this.alvaraFuncService, this.compilarService),
      dctfweb: createDctfwebRouter(this.dctfwebService),
      bi: createBiRouter(this.biService),
      biPublic: createBiPublicRouter(this.biService),
      folha: createFolhaRouter(this.folhaService),
      folhaBi: createFolhaBiRouter(this.folhaBiService),
      agenda: createAgendaRouter(this.agendaService, this.agendaGoogleService, this.agendaConfigService, this.agendaSalaService, this.agendaDisparoService, this.agendaLembreteService, this.agendaTarefaService),
      dte: createDteRouter(this.dteService),
      crm: createCrmRouter(this.crmService, this.importComercialService),
      orcamento: createOrcamentoRouter(this.orcamentoService),
      beneficioFiscal: createBeneficioFiscalRouter(this.beneficioFiscalService),
      reformaTributaria: createReformaTributariaRouter(this.reformaTributariaService),
      qa: createQaRouter(this.qaService),
      sqlConsole: createSqlConsoleRouter(this.sqlConsoleService),
      nota: createNotaRouter(this.notaService),
      whatsapp: createWhatsappRouter(this.whatsappService, this.whatsappCloudService),
      faq: createFaqRouter(this.faqService),
      servico: createServicoRouter(this.servicoService),
      processo: createProcessoRouter(this.processoService),
      pesquisa: createPesquisaRouter(this.pesquisaService),
      lead: createLeadRouter(this.leadService),
      beneficios: createBeneficioRouter(this.beneficioService),
      contrato: createContratoRouter(this.contratoService),
      notification: createNotificationRouter(this.notificationService),
      tabs: createTabsRouter(this.tabsService),
      certificadoDigital: createCertificadoDigitalRouter(this.certificadoDigitalService, this.authServiceForCert, this.legacyImportCertService, this.bulkImportCertService, this.contratoSyncService),
      dashboardLayout: createDashboardLayoutRouter(this.dashboardLayoutService, this.dashboardLayoutEventsService),
      presence: createPresenceRouter(),
      chat: createChatRouter(this.chatService),
      push: createPushRouter(this.pushService),
      dashboardCalendario: createDashboardCalendarioRouter(this.dashboardCalendarioService),
      helpdesk: createHelpdeskRouter(this.helpdeskService, this.helpdeskAiAgent),
      painelTv: createPainelTvRouter(this.painelTvService),
      acessorias: createAcessoriasRouter(this.acessoriasService),
      notificacao: createNotificacaoRouter(this.recorrenciaScheduler, this.notificacaoServiceTrpc),
      obrigacao: createObrigacaoRouter(this.obrigacaoService),
      feriado: createFeriadoRouter(this.feriadoService),
      grupoObrigacao: createGrupoObrigacaoRouter(this.grupoObrigacaoService),
      projetos: createProjetoRouter(this.projetoService),
      minhasObrigacoes: createMinhasObrigacoesRouter(this.minhasObrigacoesService),
    })
  }
}

export type AppRouter = ReturnType<TrpcService['createRouter']>
