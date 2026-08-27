'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Wrench, Bug, Megaphone, ArrowRight } from 'lucide-react'
import {
  Button, Card, CardContent, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { TEXT } from '@/lib/color-styles'
import { EmptyState } from './empty-state'

interface Novidade {
  id: string
  titulo: string
  descricao: string | null
  tipo: 'NOVO' | 'MELHORIA' | 'CORRECAO' | string
  moduloSlug: string | null
  publicadoEm: string
}

/** Cada natureza tem cor e ícone próprios — dá para separar de relance. */
const TIPOS: Record<string, {
  label: string
  icon: typeof Sparkles
  cor: string
  fundo: string
  /** Cor do cabeçalho do modal (paleta do DialogHeaderIcon). */
  modal: 'emerald' | 'sky' | 'amber'
}> = {
  NOVO: { label: 'Novo', icon: Sparkles, cor: 'text-emerald-700 dark:text-emerald-400', fundo: 'bg-emerald-100 dark:bg-emerald-900/30', modal: 'emerald' },
  MELHORIA: { label: 'Melhoria', icon: Wrench, cor: 'text-sky-700 dark:text-sky-400', fundo: 'bg-sky-100 dark:bg-sky-900/30', modal: 'sky' },
  CORRECAO: { label: 'Correção', icon: Bug, cor: 'text-amber-700 dark:text-amber-400', fundo: 'bg-amber-100 dark:bg-amber-900/30', modal: 'amber' },
}

/** Data por extenso — no modal cabe a data inteira, ao contrário da lista. */
const dataCompleta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

/** "hoje", "ontem", "há 3 dias" — a data exata importa menos que a recência. */
function quando(iso: string): string {
  const d = new Date(iso)
  const dia = 24 * 60 * 60 * 1000
  const so = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dif = Math.round((so(new Date()) - so(d)) / dia)
  if (dif <= 0) return 'hoje'
  if (dif === 1) return 'ontem'
  if (dif < 7) return `há ${dif} dias`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * Novidades do sistema.
 *
 * O que muda no OneClick sempre existiu — nos relatórios da equipe — mas nunca
 * chegava a quem usa: as pessoas descobriam uma funcionalidade nova por acaso.
 * Aqui chega, já em linguagem de usuário, porque alguém escreveu para ele.
 *
 * Sem `requiresModule` no catálogo: é para todo mundo. A leitura no servidor
 * também não pede o módulo — exigir esconderia a novidade justamente de quem
 * ela informa.
 */
export function NovidadesWidget({ canRead, title, bloco, expanded }: {
  canRead: boolean
  title?: string
  bloco?: string
  expanded?: boolean
}) {
  const titulo = title ?? 'Novidades do sistema'
  const [itens, setItens] = useState<Novidade[] | null>(null)
  /** Novidade aberta no modal — a lista trunca, aqui o texto vem inteiro. */
  const [detalhe, setDetalhe] = useState<Novidade | null>(null)

  useEffect(() => {
    if (!canRead) return
    ;(trpc.relatorioTi as any).novidadesPublicas.query({ limite: expanded ? 50 : 12 })
      .then((r: Novidade[]) => setItens(r ?? []))
      .catch(() => setItens([]))
  }, [canRead, expanded])

  const vazio = { color: 'sky' as const, Icon: Megaphone, title: titulo, bloco, href: '/relatorios-ti' }

  if (!canRead) return <EmptyState {...vazio} message="Sem permissão" />
  if (itens === null) return <EmptyState {...vazio} message="Carregando..." />
  if (itens.length === 0) {
    return <EmptyState {...vazio} message="Nada por aqui ainda" showCheck />
  }

  return (
    <Card className="@container/widget h-full overflow-hidden transition-shadow hover:shadow-md"
     >
      <CardContent className="flex h-full flex-col gap-3 overflow-hidden p-4 @sm:p-5">
        <Link href="/relatorios-ti" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-900/20">
            <Megaphone className={cn('h-4 w-4', TEXT.cyan)} />
          </span>
          <span className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{titulo}</h3>
            <p className="text-xs text-muted-foreground">O que mudou por aqui</p>
          </span>
        </Link>

        <div className="nice-scrollbar -mx-2 min-h-0 flex-1 divide-y divide-border overflow-y-auto overflow-x-hidden px-2">
          {itens.map(n => {
            const t = TIPOS[n.tipo] ?? TIPOS.NOVO!
            const Icone = t.icon
            const corpo = (
              <div className="flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-current/15 ${t.fundo} ${t.cor}`}>
                  <Icone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{n.titulo}</p>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-px text-[11px] font-medium ${t.fundo} ${t.cor}`}>{t.label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {n.descricao ? <>{n.descricao}<span className="px-1">·</span></> : null}{quando(n.publicadoEm)}
                  </p>
                </div>
              </div>
            )
            // O clique abre o detalhe: na lista o texto é cortado em uma linha,
            // e o aviso costuma ter mais a dizer do que cabe ali. O caminho
            // para o módulo continua, agora como botão dentro do modal.
            return (
              <button key={n.id} type="button" onClick={() => setDetalhe(n)} className="block w-full text-left">
                {corpo}
              </button>
            )
          })}
        </div>
      </CardContent>

      {/* Detalhe da novidade */}
      <Dialog open={!!detalhe} onOpenChange={(o) => { if (!o) setDetalhe(null) }}>
        <DialogContent className="max-w-lg">
          {detalhe && (() => {
            const t = TIPOS[detalhe.tipo] ?? TIPOS.NOVO!
            return (
              <>
                <DialogHeaderIcon icon={t.icon} color={t.modal}>
                  <DialogTitle>{detalhe.titulo}</DialogTitle>
                  <DialogDescription>
                    {t.label} · publicado em {dataCompleta(detalhe.publicadoEm)}
                  </DialogDescription>
                </DialogHeaderIcon>
                <DialogBody>
                  {detalhe.descricao
                    ? <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{detalhe.descricao}</p>
                    : <p className="text-sm italic text-muted-foreground">Sem detalhamento — só o título foi publicado.</p>}
                </DialogBody>
                <DialogFooter>
                  {detalhe.moduloSlug && (
                    <Button asChild variant="outline" size="sm" className="mr-auto gap-1.5">
                      <Link href={`/${detalhe.moduloSlug}`} onClick={() => setDetalhe(null)}>
                        Ir para o módulo<ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setDetalhe(null)}>Fechar</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
