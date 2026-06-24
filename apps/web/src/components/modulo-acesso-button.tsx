'use client'

/**
 * Botão reutilizável "Quem tem acesso" para qualquer módulo/tela.
 * Mostra dois grupos: acesso total (master/dono do tenant) e usuários com
 * permissão explícita de leitura no módulo (com o nível de cada um).
 *
 * Master/empresaMaster podem clicar nos badges de nível para REVOGAR a permissão
 * (Leitura remove o acesso; Escrita também tira Exclusão; Exclusão só ela).
 *
 * Uso: <ModuloAcessoButton moduleSlug="agenda" />
 */

import { useState, useCallback } from 'react'
import { Users, Crown, ShieldCheck, Loader2, X } from 'lucide-react'
import {
  Button, Badge, cn,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody,
  Avatar, AvatarImage, AvatarFallback,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

type Nivel = 'read' | 'write' | 'delete'

interface Pessoa {
  id: string
  name: string
  email: string
  image: string | null
  role: string
  cargo: string | null
  area: string | null
  tipo?: 'MASTER' | 'EMPRESA_MASTER'
  canRead?: boolean
  canWrite?: boolean
  canDelete?: boolean
}

interface Resultado {
  acessoTotal: Pessoa[]
  comPermissao: Pessoa[]
  total: number
}

export function ModuloAcessoButton({
  moduleSlug,
  label = 'Quem tem acesso',
  variant = 'outline',
  size = 'sm',
  className,
}: {
  moduleSlug: string
  label?: string
  variant?: 'outline' | 'ghost' | 'soft'
  size?: 'sm' | 'icon-sm'
  className?: string
}) {
  const { profile } = useCurrentUserProfile()
  const canManage = !!(profile?.isMaster || profile?.isEmpresaMaster)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Resultado | null>(null)
  const [revogando, setRevogando] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.user as any).comAcessoAoModulo.query({ moduleSlug })
      setData(res as Resultado)
    } catch {
      setData({ acessoTotal: [], comPermissao: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }, [moduleSlug])

  function handleOpen(o: boolean) {
    setOpen(o)
    if (o && !data) load()
  }

  async function handleRevogar(p: Pessoa, nivel: Nivel) {
    const labels: Record<Nivel, string> = { read: 'Leitura (remove o acesso)', write: 'Escrita', delete: 'Exclusão' }
    const ok = await alerts.confirm({
      title: 'Revogar permissão',
      text: `Remover "${labels[nivel]}" de ${p.name} nesta tela?`,
      confirmText: 'Revogar',
    })
    if (!ok) return
    setRevogando(`${p.id}:${nivel}`)
    try {
      await (trpc.user as any).revogarAcessoModulo.mutate({ userId: p.id, moduleSlug, nivel })
      alerts.success('Permissão revogada.')
      await load()
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao revogar permissão')
    } finally {
      setRevogando(null)
    }
  }

  return (
    <>
      <Button variant={variant} size={size} className={cn('gap-1.5', className)} onClick={() => handleOpen(true)}>
        <Users className="h-4 w-4" />
        {size !== 'icon-sm' && label}
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeaderIcon icon={Users} color="indigo">
            <DialogTitle>Quem tem acesso</DialogTitle>
            <DialogDescription>
              {canManage ? 'Clique num nível para revogar a permissão' : 'Usuários que podem acessar esta tela'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="max-h-[60vh] space-y-5 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !data || data.total === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum usuário com acesso a esta tela.
              </p>
            ) : (
              <>
                {data.acessoTotal.length > 0 && (
                  <Secao titulo="Acesso total" icon={Crown}>
                    {data.acessoTotal.map((p) => (
                      <LinhaPessoa key={p.id} p={p}>
                        <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          {p.tipo === 'MASTER' ? 'Master' : 'Admin do tenant'}
                        </Badge>
                      </LinhaPessoa>
                    ))}
                  </Secao>
                )}

                {data.comPermissao.length > 0 && (
                  <Secao titulo="Com permissão" icon={ShieldCheck}>
                    {data.comPermissao.map((p) => (
                      <LinhaPessoa key={p.id} p={p}>
                        <div className="flex flex-wrap justify-end gap-1">
                          <NivelBadge ativo canManage={canManage} loading={revogando === `${p.id}:read`} onClick={() => handleRevogar(p, 'read')}>Leitura</NivelBadge>
                          {p.canWrite && <NivelBadge canManage={canManage} loading={revogando === `${p.id}:write`} onClick={() => handleRevogar(p, 'write')}>Escrita</NivelBadge>}
                          {p.canDelete && <NivelBadge canManage={canManage} loading={revogando === `${p.id}:delete`} onClick={() => handleRevogar(p, 'delete')}>Exclusão</NivelBadge>}
                        </div>
                      </LinhaPessoa>
                    ))}
                  </Secao>
                )}
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Secao({ titulo, icon: Icon, children }: { titulo: string; icon: typeof Crown; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {titulo}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function LinhaPessoa({ p, children }: { p: Pessoa; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <Avatar className="h-8 w-8 shrink-0">
        {p.image && <AvatarImage src={p.image} alt={p.name} />}
        <AvatarFallback className="text-[11px]">{iniciais(p.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
        <div className="truncate text-xs text-muted-foreground">{p.cargo || p.area || p.email}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function NivelBadge({
  children, ativo, canManage, loading, onClick,
}: {
  children: React.ReactNode
  ativo?: boolean
  canManage?: boolean
  loading?: boolean
  onClick?: () => void
}) {
  const base = ativo
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400'
  if (!canManage) {
    return <Badge variant="outline" className={cn('font-medium', base)}>{children}</Badge>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title="Clique para revogar"
      className={cn(
        'group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
        base,
        'hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400',
      )}
    >
      {children}
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
    </button>
  )
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}
