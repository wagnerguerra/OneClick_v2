'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  User as UserIcon, Pencil, Shield, MapPin, Building2,
  ClipboardList, Globe, Mail, Phone, Briefcase, Calendar, DollarSign,
  CheckCircle2, XCircle, Loader2, FileText, Clock,
} from 'lucide-react'
import { USER_ROLE_LABELS, MODULE_GROUPS, MODULE_LABELS } from '@saas/types'
import {
  Button,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { STRONG } from '@/lib/color-styles'
import { PageHeaderBar } from '@/components/page-header-bar'
import { SectionCard } from '@/components/section-card'
import { trpc } from '@/lib/trpc'
import { numeroParaMoeda } from '@/lib/masks'
import { useTabLabel } from '@/hooks/use-tab-label'
import { resolveAssetUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // emerald (Cadastros)

interface UserProfile {
  id: string
  name: string
  email: string
  telefone?: string | null
  role: string
  profile: string
  isMaster: boolean
  isActive: boolean
  image?: string | null
  /** Imagem de fundo escolhida pela pessoa em /perfil. */
  coverImage?: string | null
  empresaId?: string | null
  areaId?: string | null
  cargoId?: string | null
  salario?: number | string | null
  dataAdmissao?: string | null
  idOneClick?: string | null
  incluirFerias: boolean
  createdAt: string
  empresa?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null
  area?: { id: string; name: string } | null
  cargo?: { id: string; name: string } | null
  permissions?: Array<{ moduleSlug: string; canRead: boolean; canWrite: boolean; canDelete: boolean }>
}

interface SessionRow {
  id: string
  createdAt: string
  ipAddress: string | null
  userAgent: string | null
  expiresAt: string
}

interface ClienteVinculado {
  clienteId: string
  razaoSocial: string
  documento: string
  areaNome: string
  role: string
  encerrado: boolean
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function browserFromUA(ua: string | null) {
  if (!ua) return '—'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/OPR\//.test(ua)) return 'Opera'
  return 'Outro'
}

export default function UserProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [clientes, setClientes] = useState<ClienteVinculado[]>([])
  /** Aba aberta — mesma tira do detalhe do cliente. */
  const [activeTab, setActiveTab] = useState<'detalhes' | 'permissoes' | 'clientes' | 'acessos'>('detalhes')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useTabLabel(user ? `Usuário: ${user.name}` : null)

  useEffect(() => {
    if (!params.id) return
    setLoading(true)
    Promise.all([
      trpc.user.getById.query({ id: params.id }),
      (trpc.user as any).getLoginHistory.query({ userId: params.id, limit: 15 }).catch(() => []),
      (trpc.user as any).getAssignedClients.query({ userId: params.id }).catch(() => []),
    ])
      .then(([u, sess, cls]) => {
        setUser(u as UserProfile)
        setSessions(sess as SessionRow[])
        setClientes(cls as ClienteVinculado[])
      })
      .catch(() => setError('Usuário não encontrado'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !user) {
    return <div className="py-20 text-center text-muted-foreground">{error ?? 'Usuário não encontrado'}</div>
  }

  const ultimoLogin = sessions[0]?.createdAt
  // Permissões agrupadas por categoria
  const permsByModule = new Map(user.permissions?.map(p => [p.moduleSlug, p]) ?? [])
  /** Quantos módulos o usuário enxerga — o número do hero. */
  const modulosLiberados = user.permissions?.filter(p => p.canRead).length ?? 0

  return (
    <div className="space-y-6 pb-12">
      {/* Barra da página — mesma de /orcamentos/[id]: título, trilha e ações */}
      <PageHeaderBar
        actions={<>
          <Button
            size="sm"
            style={{ backgroundColor: MODULE_COLOR }}
            className="gap-1.5 text-white"
            onClick={() => router.push(`/usuarios/${params.id}/editar`)}
          >
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <BackButton href="/usuarios" />
        </>}
      >
        <h1 className="truncate">{user.name}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Cadastros</span>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/usuarios" className="transition-colors hover:text-foreground">Usuários</Link>
          <span className="text-muted-foreground/50">›</span>
          <span className="truncate">{user.name}</span>
        </p>
      </PageHeaderBar>

      {/* ── Hero (mesmo do orçamento): capa, identidade e números ── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative overflow-hidden">
          {/* Capa: a imagem de fundo do perfil da pessoa. Sem ela, o gradiente
              do módulo — mesma regra do detalhe do cliente e do orçamento. */}
          {user.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveAssetUrl(user.coverImage)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR} 0%, var(--color-primary) 100%)` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />
          <div className="relative z-10 px-5 pb-5 pt-24 text-white sm:px-6 sm:pt-28">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-lg ring-4 ring-white/50">
                  <UserAvatar user={{ name: user.name, image: user.image ?? null }} className="h-full w-full rounded-2xl text-2xl" bg="bg-sky-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xl font-bold tracking-tight text-white drop-shadow">{user.name}</p>
                    {/* Estado e vínculos como chip de vidro, na mesma linha — padrão do orçamento */}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                      {user.isMaster ? <><Shield className="h-3 w-3" /> Master</> : (USER_ROLE_LABELS[user.role as keyof typeof USER_ROLE_LABELS] ?? user.role)}
                    </span>
                    {user.area?.name && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                        <MapPin className="h-3 w-3" /> {user.area.name}
                      </span>
                    )}
                    {user.cargo?.name && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                        <Briefcase className="h-3 w-3" /> {user.cargo.name}
                      </span>
                    )}
                    {!user.isActive && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-rose-200 ring-1 ring-white/25 backdrop-blur">
                        <XCircle className="h-3 w-3" /> Inativo
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85">
                    <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{user.email}</span>
                    {user.telefone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{user.telefone}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />Último acesso: {ultimoLogin ? formatDateTime(ultimoLogin) : 'nunca'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Números do usuário, como os totais do orçamento */}
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{user.isMaster ? '—' : modulosLiberados}</p>
                  <p className="text-xs text-white/75">Módulos</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{clientes.length}</p>
                  <p className="text-xs text-white/75">Clientes</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{sessions.length}</p>
                  <p className="text-xs text-white/75">Acessos</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tira de abas na base do hero — igual ao detalhe do cliente.
            São botões simples: o CSS global de [role="tablist"] impõe borda
            inferior e raio 0, e brigaria com o formato de pílula. */}
        <div className="border-t border-border px-3">
          <div className="nice-scrollbar flex gap-1.5 overflow-x-auto py-2">
            {([
              { value: 'detalhes', icon: UserIcon, label: 'Detalhes' },
              { value: 'permissoes', icon: Shield, label: 'Permissões', badge: user.isMaster ? undefined : modulosLiberados },
              { value: 'clientes', icon: FileText, label: 'Clientes', badge: clientes.length },
              { value: 'acessos', icon: Globe, label: 'Acessos', badge: sessions.length },
            ] as Array<{ value: typeof activeTab; icon: typeof UserIcon; label: string; badge?: number }>).map(t => {
              const Icone = t.icon
              const ativa = activeTab === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setActiveTab(t.value)}
                  aria-current={ativa ? 'page' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                    ativa ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icone className="h-4 w-4 shrink-0" />
                  {t.label}
                  {t.badge !== undefined && t.badge > 0 && (
                    <span className={cn('rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums',
                      ativa ? 'bg-white/20' : 'bg-muted text-muted-foreground')}>{t.badge}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Conteúdo: aba ativa à esquerda, identidade fixa à direita — igual ao cliente */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Coluna principal: o conteúdo da aba escolhida */}
        <div className="min-w-0 space-y-6">
          {activeTab === 'detalhes' && (
            <SectionCard title="Detalhes" description="Vínculo funcional do usuário." icon={<UserIcon />}>
              <div className="space-y-3">
                <ProfileField icon={<Briefcase className="h-3.5 w-3.5" />} label="Cargo" value={user.cargo?.name} />
                <ProfileField icon={<Building2 className="h-3.5 w-3.5" />} label="Empresa" value={user.empresa?.razaoSocial} />
                <ProfileField icon={<MapPin className="h-3.5 w-3.5" />} label="Área" value={user.area?.name} />
                <ProfileField icon={<Calendar className="h-3.5 w-3.5" />} label="Admissão" value={formatDate(user.dataAdmissao)} />
                <ProfileField
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  label="Salário Bruto"
                  value={user.salario != null ? `R$ ${numeroParaMoeda(Number(user.salario))}` : null}
                />
                <ProfileField icon={<ClipboardList className="h-3.5 w-3.5" />} label="ID OneClick" value={user.idOneClick} />
              </div>
            </SectionCard>
          )}
          {activeTab === 'permissoes' && (
            <SectionCard
              title="Permissões"
              description="Módulos que este usuário enxerga."
              icon={<Shield />}
              actions={
                <Button
                  variant="outline"
                  size="xs"
                  className="gap-1"
                  onClick={() => router.push(`/usuarios/${params.id}/editar`)}
                >
                  <Pencil className="h-3 w-3" /> Editar
                </Button>
              }
            >
                {user.isMaster ? (
                  <div className="text-center py-6">
                    <Shield className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Usuário MASTER</p>
                    <p className="text-xs text-muted-foreground mt-1">Acesso total a todos os módulos do sistema.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(MODULE_GROUPS).map(([groupName, slugs]) => {
                      const moduleList = (slugs as readonly string[]).filter(slug => permsByModule.has(slug))
                      if (moduleList.length === 0) return null
                      return (
                        <div key={groupName}>
                          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{groupName}</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                            {moduleList.map(slug => {
                              const p = permsByModule.get(slug)!
                              return (
                                <div key={slug} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border border-border/50 bg-card">
                                  <span className="text-xs font-medium truncate">{MODULE_LABELS[slug] ?? slug}</span>
                                  <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
                                    <PermFlag active={p.canRead} label="Ler" />
                                    <PermFlag active={p.canWrite} label="Escrever" />
                                    <PermFlag active={p.canDelete} label="Excluir" />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {(user.permissions?.length ?? 0) === 0 && (
                      <div className="text-center py-6 text-xs text-muted-foreground">
                        Este usuário não possui permissões configuradas.
                      </div>
                    )}
                  </div>
                )}
            </SectionCard>
          )}
          {activeTab === 'clientes' && (
            <SectionCard
              title="Clientes Vinculados"
              description={clientes.length > 0 ? `${clientes.length} cliente(s) sob responsabilidade.` : 'Nenhum cliente sob responsabilidade.'}
              icon={<FileText />}
              bodyClassName="p-0"
            >
                {clientes.length === 0 ? (
                  <div className="px-5 py-6 text-center text-xs text-muted-foreground">
                    Nenhum cliente vinculado ao usuário
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[110px]">Documento</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="w-[120px]">Área</TableHead>
                        <TableHead className="w-[110px]">Vínculo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientes.map((c, idx) => (
                        <TableRow key={`${c.clienteId}-${c.areaNome}-${idx}`} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs whitespace-nowrap">{c.documento}</TableCell>
                          <TableCell className="text-sm">
                            <button
                              type="button"
                              className="hover:underline text-left"
                              style={{ color: MODULE_COLOR }}
                              onClick={() => router.push(`/clientes/${c.clienteId}`)}
                            >
                              {c.razaoSocial}
                            </button>
                          </TableCell>
                          <TableCell className="text-xs">{c.areaNome}</TableCell>
                          <TableCell>
                            <span className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                              c.role === 'Responsável'
                                ? STRONG.emerald
                                : STRONG.sky,
                            )}>
                              {c.role}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
            </SectionCard>
          )}
          {activeTab === 'acessos' && (
            <SectionCard
              title="Histórico de Acessos"
              description={`${sessions.length} sessão(ões) registradas.`}
              icon={<Globe />}
              bodyClassName="p-0"
            >
              <div>
                {sessions.length === 0 ? (
                  <div className="px-5 py-6 text-center text-xs text-muted-foreground">Nenhum acesso registrado</div>
                ) : (
                  <div className="divide-y divide-border/40 max-h-[360px] overflow-y-auto nice-scrollbar">
                    {sessions.map(s => (
                      <div key={s.id} className="px-5 py-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{formatDateTime(s.createdAt)}</span>
                          <span className="text-[10px] text-muted-foreground">{browserFromUA(s.userAgent)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          IP: <span className="font-mono">{s.ipAddress || '—'}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Lateral fixa: situação do usuário, visível em qualquer aba — no
            detalhe do cliente essa coluna guarda avisos e resumo, não dados
            repetidos da aba aberta. */}
        <div className="space-y-6">
          <SectionCard title="Situação" description="Estado da conta e último acesso." icon={<Shield />}>
            <div className="space-y-3">
              <ProfileField icon={<Shield className="h-3.5 w-3.5" />} label="Perfil" value={user.isMaster ? 'Master' : (USER_ROLE_LABELS[user.role as keyof typeof USER_ROLE_LABELS] ?? user.role)} />
              <ProfileField icon={user.isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} label="Conta" value={user.isActive ? 'Ativa' : 'Inativa'} />
              <ProfileField icon={<Clock className="h-3.5 w-3.5" />} label="Último acesso" value={ultimoLogin ? formatDateTime(ultimoLogin) : 'Nunca acessou'} />
              <ProfileField icon={<Calendar className="h-3.5 w-3.5" />} label="Cadastrado em" value={formatDate(user.createdAt)} />
            </div>
          </SectionCard>

          {user.isMaster && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="flex items-center gap-1.5 font-semibold"><Shield className="h-3.5 w-3.5" />Usuário MASTER</p>
              <p className="mt-1">Enxerga todos os módulos e ignora as permissões individuais.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  const has = !!value && value !== '—'
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('text-sm', has ? 'font-medium' : 'text-muted-foreground italic')}>{has ? value : '—'}</p>
      </div>
    </div>
  )
}

function PermFlag({ active, label }: { active: boolean; label: string }) {
  return (
    <span title={`${label}: ${active ? 'Sim' : 'Não'}`}>
      {active ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground/30" />
      )}
    </span>
  )
}
