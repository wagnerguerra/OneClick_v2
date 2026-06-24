'use client'

/**
 * Botão reutilizável "Quem tem acesso" para qualquer módulo/tela.
 * Mostra dois grupos: acesso total (master/dono do tenant) e usuários com
 * permissão explícita de leitura no módulo (com o nível de cada um).
 *
 * Uso: <ModuloAcessoButton moduleSlug="agenda" />
 */

import { useState } from 'react'
import { Users, Crown, ShieldCheck, Loader2 } from 'lucide-react'
import {
  Button, Badge, cn,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody,
  Avatar, AvatarImage, AvatarFallback,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'

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
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Resultado | null>(null)

  async function handleOpen(o: boolean) {
    setOpen(o)
    if (o && !data) {
      setLoading(true)
      try {
        const res = await (trpc.user as any).comAcessoAoModulo.query({ moduleSlug })
        setData(res as Resultado)
      } catch {
        setData({ acessoTotal: [], comPermissao: [], total: 0 })
      } finally {
        setLoading(false)
      }
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
            <DialogDescription>Usuários que podem acessar esta tela</DialogDescription>
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
                        <div className="flex flex-wrap gap-1">
                          <NivelBadge ativo>Leitura</NivelBadge>
                          {p.canWrite && <NivelBadge>Escrita</NivelBadge>}
                          {p.canDelete && <NivelBadge>Exclusão</NivelBadge>}
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

function NivelBadge({ children, ativo }: { children: React.ReactNode; ativo?: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        ativo
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400',
      )}
    >
      {children}
    </Badge>
  )
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}
