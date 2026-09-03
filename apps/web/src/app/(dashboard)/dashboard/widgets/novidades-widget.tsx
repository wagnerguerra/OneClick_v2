'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Wrench, Bug, Megaphone, ArrowRight, Heart } from 'lucide-react'
import {
  Button, Card, CardContent,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { getModuleLabelForHref, getGroupLabelForHref, getGroupHexForHref } from '@/lib/navigation'
import { EmptyState } from './empty-state'

interface Novidade {
  id: string
  titulo: string
  descricao: string | null
  tipo: 'NOVO' | 'MELHORIA' | 'CORRECAO' | string
  moduloSlug: string | null
  publicadoEm: string
  curtidas: number
  euCurti: boolean
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

  /**
   * Curte ou descurte. O estado muda na hora e volta atrás se falhar — um
   * coração que fica aceso sem ter gravado é pior que um erro visível.
   *
   * Atualiza lista E modal juntos: com o detalhe aberto, os dois corações
   * mostram a mesma novidade e não podem discordar.
   */
  async function curtir(n: Novidade) {
    const otimista = { curtidas: n.curtidas + (n.euCurti ? -1 : 1), euCurti: !n.euCurti }
    const aplicar = (v: { curtidas: number; euCurti: boolean }) => {
      setItens(prev => prev?.map(i => i.id === n.id ? { ...i, ...v } : i) ?? prev)
      setDetalhe(prev => prev && prev.id === n.id ? { ...prev, ...v } : prev)
    }
    aplicar(otimista)
    try {
      const r = await (trpc.relatorioTi as any).curtirNovidade.mutate({ novidadeId: n.id })
      aplicar({ curtidas: r.curtidas, euCurti: r.euCurti })   // o servidor manda o número final
    } catch {
      aplicar({ curtidas: n.curtidas, euCurti: n.euCurti })   // desfaz
    }
  }

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
            <Megaphone className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
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
                <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  {/* Curtir: mede se a novidade foi bem recebida. A contagem é
                      visível a todos; uma curtida por pessoa, garantida pelo
                      índice único no banco — não por regra de tela. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => curtir(detalhe)}
                    aria-pressed={detalhe.euCurti}
                    title={detalhe.euCurti ? 'Remover minha curtida' : 'Curtir esta novidade'}
                    className={detalhe.euCurti ? 'gap-1.5 border-rose-300 text-rose-600 dark:border-rose-900 dark:text-rose-400' : 'gap-1.5'}
                  >
                    <Heart className={detalhe.euCurti ? 'h-3.5 w-3.5 fill-current' : 'h-3.5 w-3.5'} />
                    {detalhe.curtidas > 0 ? detalhe.curtidas : 'Curtir'}
                  </Button>
                  {/* Rodapé diz QUAL módulo a novidade toca, não só oferece o
                      caminho. "Melhoria" sem dizer onde obriga a pessoa a abrir
                      o sistema para descobrir se aquilo é da rotina dela. */}
                  {detalhe.moduloSlug && (() => {
                    const rota = `/${detalhe.moduloSlug}`
                    const modulo = getModuleLabelForHref(rota)
                    const bloco = getGroupLabelForHref(rota)
                    if (!modulo) return null
                    return (
                      <span className="mr-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: getGroupHexForHref(rota) }}
                        />
                        <span className="truncate">
                          Afeta o módulo <strong className="font-medium text-foreground">{modulo}</strong>
                          {bloco && <> · {bloco}</>}
                        </span>
                      </span>
                    )
                  })()}
                  {detalhe.moduloSlug && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
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
