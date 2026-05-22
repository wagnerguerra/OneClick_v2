'use client'

import { useState, useEffect } from 'react'
import { History, Loader2, CircleDot } from 'lucide-react'
import {
  Button,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'

interface Evento {
  id: string
  tipo: string
  descricao: string
  createdAt: string
  autor: { id: string; name: string; image: string | null } | null
}

interface Execucao {
  id: string
  servico: { nome: string; mininome: string | null }
  cliente: { razaoSocial: string } | null
}

interface LogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  execucao: Execucao | null
}

const TIPO_LABELS: Record<string, string> = {
  criado: 'Criado',
  iniciado: 'Iniciado',
  pausado: 'Pausado',
  retomado: 'Retomado',
  passo_concluido: 'Passo concluído',
  passo_reaberto: 'Passo reaberto',
  comentario: 'Comentário',
  anexo: 'Anexo',
  concluido: 'Entregue',
  cancelado: 'Cancelado',
}

const TIPO_CORES: Record<string, string> = {
  criado: 'bg-slate-200 text-slate-700',
  iniciado: 'bg-blue-100 text-blue-700',
  pausado: 'bg-amber-100 text-amber-700',
  retomado: 'bg-blue-100 text-blue-700',
  passo_concluido: 'bg-emerald-100 text-emerald-700',
  passo_reaberto: 'bg-amber-100 text-amber-700',
  comentario: 'bg-indigo-100 text-indigo-700',
  anexo: 'bg-violet-100 text-violet-700',
  concluido: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-red-100 text-red-700',
}

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function LogDialog({ open, onOpenChange, execucao }: LogDialogProps) {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !execucao) return
    setLoading(true)
    trpc.minhasObrigacoes.log
      .query({ execucaoId: execucao.id })
      .then((d) => setEventos(d as unknown as Evento[]))
      .catch(() => setEventos([]))
      .finally(() => setLoading(false))
  }, [open, execucao])

  if (!execucao) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeaderIcon icon={History} color="sky">
          <DialogTitle>Histórico da entrega</DialogTitle>
          <DialogDescription>
            {execucao.servico.mininome ?? execucao.servico.nome}
            {execucao.cliente && <span className="block text-[11px] mt-0.5">{execucao.cliente.razaoSocial}</span>}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-sky-500" />Carregando histórico...
            </div>
          ) : !eventos.length ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Nenhum evento registrado ainda.
            </div>
          ) : (
            <ol className="relative ml-4 border-l border-border/60 space-y-4 pt-1">
              {eventos.map((e) => (
                <li key={e.id} className="ml-4">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-sky-500" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TIPO_CORES[e.tipo] ?? 'bg-slate-100 text-slate-700'}`}>
                      {TIPO_LABELS[e.tipo] ?? e.tipo}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatDateTime(e.createdAt)}
                    </span>
                    {e.autor && (
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                        <CircleDot className="h-2.5 w-2.5" />{e.autor.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">{e.descricao}</p>
                </li>
              ))}
            </ol>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
