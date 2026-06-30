'use client'

/**
 * Botão "Histórico" do modal de Tipos de Evento — só master/dono do tenant.
 * Lista quem criou/editou/excluiu cada tipo, para o master acompanhar.
 */

import { useState, useCallback } from 'react'
import { History, Loader2, PlusCircle, Pencil, Trash2 } from 'lucide-react'
import {
  Button, Badge, cn,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody,
  Avatar, AvatarImage, AvatarFallback,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

interface Evento {
  id: string
  tipoNome: string
  acao: string
  detalhes: string | null
  createdAt: string
  usuario: { id: string; name: string; image: string | null }
}

const ACAO_META: Record<string, { label: string; icon: typeof PlusCircle; cls: string }> = {
  CRIOU: { label: 'Criou', icon: PlusCircle, cls: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  EDITOU: { label: 'Editou', icon: Pencil, cls: 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  EXCLUIU: { label: 'Excluiu', icon: Trash2, cls: 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
}

export function AgendaTipoHistoricoButton() {
  const { profile } = useCurrentUserProfile()
  const podeVer = !!(profile?.isMaster || profile?.isEmpresaMaster)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [eventos, setEventos] = useState<Evento[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.agenda as any).listTipoEventos.query({})
      setEventos(res as Evento[])
    } catch {
      setEventos([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleOpen(o: boolean) {
    setOpen(o)
    if (o) load()
  }

  if (!podeVer) return null

  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => handleOpen(true)}>
        <History className="h-4 w-4" />
        Histórico
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={History} color="violet">
            <DialogTitle>Histórico de tipos de evento</DialogTitle>
            <DialogDescription>Quem criou, editou ou excluiu cada categoria</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : eventos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {eventos.map((e) => {
                  const meta = ACAO_META[e.acao] ?? ACAO_META.EDITOU!
                  const Icon = meta.icon
                  return (
                    <li key={e.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      <Avatar className="h-8 w-8 shrink-0">
                        {e.usuario.image && <AvatarImage src={e.usuario.image} alt={e.usuario.name} />}
                        <AvatarFallback className="text-[11px]">{iniciais(e.usuario.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-medium text-foreground truncate">{e.usuario.name}</span>
                          <Badge variant="outline" className={cn('shrink-0 gap-1 font-medium', meta.cls)}>
                            <Icon className="h-3 w-3" />{meta.label}
                          </Badge>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          <strong className="text-foreground/80">{e.tipoNome}</strong>
                          {e.detalhes ? ` · ${e.detalhes}` : ''}
                        </div>
                      </div>
                      <time className="shrink-0 text-[11px] text-muted-foreground">{formatDataHora(e.createdAt)}</time>
                    </li>
                  )
                })}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}

function formatDataHora(s: string): string {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
