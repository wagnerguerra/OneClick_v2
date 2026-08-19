'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Wrench, Bug, Megaphone } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
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
const TIPOS: Record<string, { label: string; icon: typeof Sparkles; cor: string; fundo: string }> = {
  NOVO: { label: 'Novo', icon: Sparkles, cor: 'text-emerald-700 dark:text-emerald-400', fundo: 'bg-emerald-100 dark:bg-emerald-900/30' },
  MELHORIA: { label: 'Melhoria', icon: Wrench, cor: 'text-sky-700 dark:text-sky-400', fundo: 'bg-sky-100 dark:bg-sky-900/30' },
  CORRECAO: { label: 'Correção', icon: Bug, cor: 'text-amber-700 dark:text-amber-400', fundo: 'bg-amber-100 dark:bg-amber-900/30' },
}

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
    <Card className="@container/widget h-full overflow-hidden"
     >
      <CardContent className="flex h-full flex-col gap-2.5 overflow-hidden p-4">
        <Link href="/relatorios-ti" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-900/20">
            <Megaphone className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </span>
          <span className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{titulo}</h3>
            <p className="text-xs text-muted-foreground">O que mudou por aqui</p>
          </span>
        </Link>

        <div className="nice-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {itens.map(n => {
            const t = TIPOS[n.tipo] ?? TIPOS.NOVO!
            const Icone = t.icon
            const corpo = (
              <div className="rounded-lg border border-border/60 px-2.5 py-2 transition-colors hover:bg-muted/30">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.fundo} ${t.cor}`}>
                    <Icone className="h-2.5 w-2.5" />{t.label}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{quando(n.publicadoEm)}</span>
                </div>
                <p className="mt-1 text-[13px] font-medium leading-snug">{n.titulo}</p>
                {n.descricao && (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground line-clamp-2">
                    {n.descricao}
                  </p>
                )}
              </div>
            )
            // Com módulo, a novidade leva até ele — ler "agora dá para dividir
            // PDF" e não saber onde seria meio caminho.
            return n.moduloSlug
              ? <Link key={n.id} href={`/${n.moduloSlug}`} className="block">{corpo}</Link>
              : <div key={n.id}>{corpo}</div>
          })}
        </div>
      </CardContent>
    </Card>
  )
}
