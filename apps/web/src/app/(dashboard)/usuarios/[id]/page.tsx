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
  Button, Card, CardHeader, CardContent, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
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

function Sep() {
  return <span className="text-muted-foreground/40 select-none">|</span>
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
  const initials = (user.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  // Permissões agrupadas por categoria
  const permsByModule = new Map(user.permissions?.map(p => [p.moduleSlug, p]) ?? [])

  return (
    <div className="space-y-6 pb-12">
      {/* Header — padrao igual aos detalhes do orcamento */}
      <div
        className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(16, 185, 129, 0.06) 60%, rgba(16, 185, 129, 0.02) 100%)',
          borderBottom: '1px solid rgba(16, 185, 129, 0.16)',
        }}
      >
        <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div
                className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden"
                style={{ boxShadow: 'inset 0 0 0 3px rgba(16, 185, 129, 0.35), 0 4px 12px rgba(16, 185, 129, 0.18)' }}
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveAssetUrl(user.image)} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold" style={{ color: MODULE_COLOR }}>{initials}</span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold uppercase">{user.name}</h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-0.5 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {user.email}</span>
                  {user.telefone && (<>
                    <Sep />
                    <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {user.telefone}</span>
                  </>)}
                  <Sep />
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Último login: <strong className="text-foreground">{ultimoLogin ? formatDateTime(ultimoLogin) : 'Nunca'}</strong>
                  </span>
                  <Sep />
                  {user.isMaster ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-xs font-medium uppercase">
                      <Shield className="h-3 w-3" /> Master
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 text-xs font-medium uppercase">
                      {USER_ROLE_LABELS[user.role as keyof typeof USER_ROLE_LABELS] ?? user.role}
                    </span>
                  )}
                  {user.area?.name && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-3 py-1 text-xs font-medium uppercase">
                      <MapPin className="h-3 w-3" /> {user.area.name}
                    </span>
                  )}
                  {!user.isActive && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 px-3 py-1 text-xs font-medium uppercase">
                      Inativo
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                style={{ backgroundColor: MODULE_COLOR }}
                className="text-white gap-1.5"
                onClick={() => router.push(`/usuarios/${params.id}/editar`)}
              >
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <BackButton href="/usuarios" />
            </div>
          </div>
        </div>
      </div>

      {/* Layout 2 colunas — espelha legado cad_users/details.asp */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Coluna esquerda (4/12): Detalhes + Log */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card Detalhes */}
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
              <UserIcon className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h3 className="text-sm font-semibold flex-1">Detalhes</h3>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
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
            </CardContent>
          </Card>

          {/* Card Log de Acessos */}
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
              <Globe className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h3 className="text-sm font-semibold flex-1">Histórico de Acessos</h3>
              <span className="text-[10px] text-muted-foreground">{sessions.length} sessões</span>
            </CardHeader>
            <CardContent className="p-0">
              {sessions.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-muted-foreground">Nenhum acesso registrado</div>
              ) : (
                <div className="divide-y divide-border/40 max-h-[360px] overflow-y-auto">
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
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita (8/12): Permissoes + Clientes */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card Permissões */}
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h3 className="text-sm font-semibold flex-1">Permissões</h3>
              <Button
                variant="outline"
                size="xs"
                className="gap-1"
                onClick={() => router.push(`/usuarios/${params.id}/editar`)}
              >
                <Pencil className="h-3 w-3" /> Editar
              </Button>
            </CardHeader>
            <CardContent className="p-5">
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
                                <div className="flex items-center gap-1 shrink-0">
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
            </CardContent>
          </Card>

          {/* Card Clientes vinculados */}
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center gap-2">
              <FileText className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h3 className="text-sm font-semibold flex-1">Clientes Vinculados</h3>
              {clientes.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{clientes.length}</Badge>
              )}
            </CardHeader>
            <CardContent className="p-0">
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
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
                          )}>
                            {c.role}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
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
