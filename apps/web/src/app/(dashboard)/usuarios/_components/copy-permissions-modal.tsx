'use client'

import { useState, useEffect } from 'react'
import { Copy, Loader2, Search, Check } from 'lucide-react'
import {
  Button, Input, Badge,
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription, DialogFooter, DialogClose,
  Checkbox, Avatar, AvatarFallback,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface UserOption {
  id: string
  name: string
  email: string
  role: string
  isMaster: boolean
}

interface CopyPermissionsModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

export function CopyPermissionsModal({ open, onClose, onSuccess }: CopyPermissionsModalProps) {
  const [users, setUsers] = useState<UserOption[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    if (open) {
      setLoadingUsers(true)
      trpc.user.listForSelect.query()
        .then(list => setUsers(list.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, isMaster: false }))))
        .catch(() => {})
        .finally(() => setLoadingUsers(false))
    }
  }, [open])

  const step = !sourceId ? 'source' : 'targets'

  function reset() { setSourceId(null); setTargetIds(new Set()); setSearch(''); setCopying(false) }
  function handleClose() { reset(); onClose() }

  function toggleTarget(id: string) {
    setTargetIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAllTargets() {
    const filtered = filteredUsers.filter(u => u.id !== sourceId && !u.isMaster)
    if (targetIds.size === filtered.length) {
      setTargetIds(new Set())
    } else {
      setTargetIds(new Set(filtered.map(u => u.id)))
    }
  }

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase()
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  const sourceUser = users.find(u => u.id === sourceId)

  async function handleCopy() {
    if (!sourceId || targetIds.size === 0) return
    setCopying(true)
    try {
      const result = await trpc.user.copyPermissions.mutate({
        sourceUserId: sourceId,
        targetUserIds: Array.from(targetIds),
      })
      await alerts.success(
        'Permissões copiadas',
        `${result.permissionsCopied} permissões copiadas para ${result.updated} usuário(s).`,
      )
      handleClose()
      onSuccess()
    } catch (e) {
      alerts.error('Erro', (e as Error).message ?? 'Não foi possível copiar as permissões.')
    } finally { setCopying(false) }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Copy className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <span>Copiar Permissões</span>
              <DialogDescription className="mt-0.5">
                {step === 'source'
                  ? 'Selecione o usuário de origem (copiar de).'
                  : `Selecione os usuários de destino (copiar para). Origem: ${sourceUser?.name}`}
              </DialogDescription>
            </div>
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {/* Busca */}
          <div className="relative mb-3 mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar usuário..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {step === 'source' ? (
            /* Etapa 1: Selecionar origem */
            <div className="space-y-1">
              {filteredUsers.filter(u => !u.isMaster).map(user => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => { setSourceId(user.id); setSearch('') }}
                  className="flex w-full items-center gap-3 rounded-[2px] border border-border/30 p-2.5 text-left transition-all duration-200 hover:bg-primary/[0.04] hover:border-primary/20"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Etapa 2: Selecionar destinos */
            <div className="space-y-1">
              {/* Selecionar todos */}
              <button
                type="button"
                onClick={selectAllTargets}
                className="flex w-full items-center gap-3 rounded-[2px] bg-muted/30 p-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={targetIds.size > 0 && targetIds.size === filteredUsers.filter(u => u.id !== sourceId && !u.isMaster).length}
                />
                Selecionar todos
              </button>

              {filteredUsers.filter(u => u.id !== sourceId && !u.isMaster).map(user => {
                const selected = targetIds.has(user.id)
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleTarget(user.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[2px] border p-2.5 text-left transition-all duration-200',
                      selected
                        ? 'bg-primary/[0.04] border-primary/20'
                        : 'border-border/30 hover:bg-muted/20',
                    )}
                  >
                    <Checkbox checked={selected} />
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">{getInitials(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {step === 'targets' && (
            <>
              <Button
                variant="success"
                size="sm"
                type="button"
                disabled={targetIds.size === 0 || copying}
                onClick={handleCopy}
              >
                {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                {copying ? 'Copiando...' : `Copiar para ${targetIds.size} usuário(s)`}
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={() => { setSourceId(null); setTargetIds(new Set()); setSearch('') }}>
                Trocar origem
              </Button>
            </>
          )}
          <DialogClose asChild>
            <Button variant="outline" size="sm" type="button">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
