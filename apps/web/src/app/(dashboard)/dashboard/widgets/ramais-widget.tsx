'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Phone, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Input, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { TEXT, SURFACE } from '@/lib/color-styles'
import { UserAvatar } from '@/components/ui/user-avatar'
import { EmptyState } from './empty-state'

interface Ramal {
  id: string
  nomeCompleto: string
  ramal: string | null
  fotoUrl: string | null
  email: string | null
  celular: string | null
  area: { name: string } | null
  cargo: { name: string } | null
}

export function RamaisWidget({ title, expanded, bloco }: { canRead?: boolean; title?: string; expanded?: boolean; bloco?: string } = {}) {
  const titulo = title ?? 'Ramais'
  const [items, setItems] = useState<Ramal[]>([])
  const [totalAtivos, setTotalAtivos] = useState(0)
  const [busca, setBusca] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    ;(trpc.colaborador as any).listRamais.query()
      .then((d: { items: Ramal[]; totalAtivos: number } | Ramal[]) => {
        // Compat: aceita formato novo { items, totalAtivos } ou antigo (array direto)
        if (Array.isArray(d)) {
          setItems(d)
          setTotalAtivos(d.length)
        } else {
          setItems(d?.items ?? [])
          setTotalAtivos(d?.totalAtivos ?? 0)
        }
      })
      .catch((e: Error) => {
        console.error('[RamaisWidget] Erro ao buscar:', e)
        setErro(e.message)
        setItems([])
      })
      .finally(() => setLoaded(true))
  }, [])

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return items
    return items.filter(i =>
      i.nomeCompleto.toLowerCase().includes(q)
      || i.ramal?.toLowerCase().includes(q)
      || i.area?.name.toLowerCase().includes(q)
      || i.cargo?.name.toLowerCase().includes(q),
    )
  }, [items, busca])

  if (!loaded) return <EmptyState color="emerald" Icon={Phone} title={titulo} message="Carregando..." bloco={bloco} />
  if (erro) return <EmptyState color="emerald" Icon={Phone} title={titulo} message={`Erro: ${erro}`} bloco={bloco} />
  if (items.length === 0) {
    const msg = totalAtivos === 0
      ? 'Nenhum colaborador ativo cadastrado'
      : `${totalAtivos} colaborador(es) ativo(s) — nenhum com telefone preenchido`
    return <EmptyState color="emerald" Icon={Phone} title={titulo} message={msg} href="/colaboradores" bloco={bloco} />
  }

  // Modo expandido (modal) — sem Card/header. O DialogHeader do modal já cobre.
  if (expanded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 mb-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">{items.length} colaborador(es)</p>
          <div className="relative w-full max-w-[260px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, cargo, área ou ramal..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto nice-scrollbar -mx-1">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-12">Nenhum resultado</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-1">
              {filtered.map(c => (
                <div
                  key={c.id}
                  className="group relative flex items-center gap-3 rounded-lg border bg-card p-3 hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-800 transition-all"
                >
                  <div className="shrink-0">
                    <UserAvatar
                      user={{ name: c.nomeCompleto, image: c.fotoUrl }}
                      className="h-12 w-12 text-sm ring-2 ring-emerald-200 dark:ring-emerald-900/60"
                      bg="bg-emerald-100 dark:bg-emerald-900/40"
                      fg="text-emerald-700 dark:text-emerald-300"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold leading-tight truncate" title={c.nomeCompleto}>
                      {c.nomeCompleto}
                    </p>
                    {c.cargo?.name && (
                      <p className="text-[11px] text-foreground/70 truncate" title={c.cargo.name}>{c.cargo.name}</p>
                    )}
                    {c.area?.name && (
                      <p className="text-[10px] text-muted-foreground truncate" title={c.area.name}>{c.area.name}</p>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className={cn('text-[10px] hover:underline truncate block', TEXT.emerald)} title={c.email}>{c.email}</a>
                    )}
                  </div>
                  <a
                    href={c.ramal ? `tel:${c.ramal.replace(/\D/g, '')}` : undefined}
                    className="shrink-0 flex flex-col items-center justify-center rounded-md bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 shadow-sm hover:shadow-md transition-all min-w-[64px]"
                    title={c.ramal ? `Ligar para ${c.ramal}` : 'Sem ramal'}
                  >
                    <Phone className="h-3.5 w-3.5 mb-0.5 opacity-90" />
                    <span className="text-base font-mono font-bold tabular-nums leading-none">{c.ramal}</span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Modo compacto (widget no dashboard)
  return (
    <Card className="h-full flex flex-col overflow-hidden @container/widget">
      <CardHeader className="shrink-0 border-b-0 p-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10', TEXT.emerald)}>
              <Phone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold leading-tight truncate">{titulo}</CardTitle>
              <p className="text-xs text-muted-foreground leading-tight truncate">
                {items.length} colaborador(es)
              </p>
            </div>
          </div>
          <div className="relative hidden @[320px]:block max-w-[180px]">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="h-8 rounded-lg pl-7 text-xs"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto nice-scrollbar px-3 pb-3 pt-0">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">Nenhum resultado</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map(c => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors">
                <div className="shrink-0">
                  <UserAvatar
                    user={{ name: c.nomeCompleto, image: c.fotoUrl }}
                    className="h-8 w-8 text-[10px]"
                    bg="bg-emerald-100 dark:bg-emerald-900/40"
                    fg="text-emerald-700 dark:text-emerald-300"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold leading-tight truncate">{c.nomeCompleto}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {[c.cargo?.name, c.area?.name].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <a
                  href={c.ramal ? `tel:${c.ramal.replace(/\D/g, '')}` : undefined}
                  className={cn('shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 border hover:shadow-sm hover:scale-[1.02] transition-all', SURFACE.emerald)}
                  title={c.ramal ? `Ligar para ${c.ramal}` : 'Sem ramal'}
                >
                  <Phone className={cn('h-3 w-3', TEXT.emerald)} />
                  <span className={cn('text-xs font-mono font-bold tabular-nums', TEXT.emerald)}>
                    {c.ramal}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// Link import preservado para extensão futura (perfil do colaborador)
void Link
