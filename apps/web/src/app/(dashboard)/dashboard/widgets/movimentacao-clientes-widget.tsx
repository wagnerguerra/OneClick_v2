'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserPlus2, UserMinus2, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { EmptyState } from './empty-state'

interface Item {
  id: string
  code: number
  razaoSocial: string
  data: string | null
  cidade: string | null
  uf: string | null
}
interface Movimentacao { total: number; dias: number; itens: Item[] }

/** "12/08" — no widget o ano só rouba espaço; a janela é de 90 dias. */
const diaMes = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'

/**
 * Entradas ou saídas de clientes na janela recente.
 *
 * Um componente para os dois casos: muda o tipo, o rótulo e a cor. Duplicar o
 * arquivo faria a próxima correção precisar ser feita duas vezes — e uma delas
 * seria esquecida.
 *
 * Mostra o TOTAL e uma amostra dos mais recentes. A lista não finge ser o total:
 * quando há mais do que cabe, o rodapé diz quantos ficaram de fora.
 */
function MovimentacaoWidget({
  tipo, canRead, title, bloco, expanded,
}: {
  tipo: 'entrada' | 'saida'
  canRead: boolean
  title?: string
  bloco?: string
  expanded?: boolean
}) {
  const entrada = tipo === 'entrada'
  const Icon = entrada ? UserPlus2 : UserMinus2
  const cor = entrada ? 'emerald' as const : 'rose' as const
  const titulo = title ?? (entrada ? 'Clientes que entraram' : 'Clientes que saíram')

  const [dados, setDados] = useState<Movimentacao | null>(null)

  useEffect(() => {
    if (!canRead) return
    ;(trpc.cliente as any).movimentacaoRecente
      .query({ tipo, limite: expanded ? 30 : 6 })
      .then((d: Movimentacao) => setDados(d))
      .catch(() => setDados({ total: 0, dias: 90, itens: [] }))
  }, [canRead, tipo, expanded])

  const vazio = { color: cor, Icon, title: titulo, bloco, href: '/clientes' }
  if (!canRead) return <EmptyState {...vazio} message="Sem permissão" />
  if (!dados) return <EmptyState {...vazio} message="Carregando..." />
  if (dados.total === 0) {
    return (
      <EmptyState
        {...vazio}
        message={entrada ? 'Nenhuma entrada em 90 dias' : 'Nenhuma saída em 90 dias'}
        showCheck={!entrada}
      />
    )
  }

  const restantes = dados.total - dados.itens.length

  return (
    <Card className="h-full overflow-hidden transition-shadow hover:shadow-md @container/widget">
      <CardContent className="flex h-full flex-col overflow-hidden p-4 @sm:p-5">
        <Link href="/clientes" className="flex min-w-0 items-center gap-3 transition-opacity hover:opacity-80">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl @sm:h-10 @sm:w-10 ${
            entrada ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'
          }`}>
            <Icon className={`h-4 w-4 @sm:h-5 @sm:w-5 ${entrada ? 'text-emerald-600' : 'text-rose-600'}`} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{titulo}</h3>
            <p className="truncate text-xs text-muted-foreground">
              <strong className={`tabular-nums ${entrada ? 'text-emerald-600' : 'text-rose-600'}`}>{dados.total}</strong>
              {' '}nos últimos {dados.dias} dias
            </p>
          </div>
        </Link>

        <ul className="nice-scrollbar mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {dados.itens.map(c => (
            <li key={c.id}>
              <Link
                href={`/clientes/${c.id}`}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-muted"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${entrada ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-tight text-foreground">{c.razaoSocial}</span>
                  {(c.cidade || c.uf) && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {[c.cidade, c.uf].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{diaMes(c.data)}</span>
              </Link>
            </li>
          ))}
        </ul>

        {restantes > 0 && (
          <Link
            href="/clientes"
            className="mt-2 flex shrink-0 items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            + {restantes} {restantes === 1 ? 'outro' : 'outros'}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

export function ClientesEntraramWidget(props: { canRead: boolean; title?: string; bloco?: string; expanded?: boolean }) {
  return <MovimentacaoWidget tipo="entrada" {...props} />
}

export function ClientesSairamWidget(props: { canRead: boolean; title?: string; bloco?: string; expanded?: boolean }) {
  return <MovimentacaoWidget tipo="saida" {...props} />
}
