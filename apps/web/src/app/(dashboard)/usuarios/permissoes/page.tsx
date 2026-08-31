'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, Search, Users, ChevronDown, ChevronRight, Save, RotateCcw,
  Circle, Wrench, type LucideIcon,
} from 'lucide-react'
import {
  Button, Card, Input, Badge, Checkbox, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { MODULE_GROUPS, MODULE_LABELS, PLATFORM_ADMIN_MODULES } from '@saas/types'
import { BackButton } from '@/components/ui/back-button'
import { MODULE_ICONS, GROUP_ICONS } from '@/lib/navigation'
import { useModuleColors } from '@/components/theme/module-colors'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

/**
 * Bloco → slug da cor, os mesmos da barra lateral. Sem isto a tela seria uma
 * lista cinza de 90 linhas: a cor é o que deixa achar "o bloco Fiscal" sem ler.
 */
const COR_DO_BLOCO: Record<string, string> = {
  'Cadastros': 'cadastros', 'Comercial': 'comercial', 'Administrativo': 'administrativo',
  'Legalização': 'legalizacao', 'Trabalhista': 'trabalhista', 'Fiscal': 'fiscal',
  'Contábil': 'contabil', 'TI': 'ti', 'Ferramentas': 'ferramentas',
  'Qualidade': 'qualidade', 'Configurações': 'configuracoes',
}

/**
 * Os ícones saem de `MODULE_ICONS`/`GROUP_ICONS`, que a navegação já exporta
 * exatamente para isto. Montar um mapa próprio aqui garantiria divergência:
 * módulo novo entraria no menu com um ícone e apareceria nesta tela com outro
 * — ou sem nenhum.
 *
 * Ferramentas é a exceção: na barra lateral ela não é um bloco, e sim um item
 * solto na régua da esquerda — então não está em `GROUP_ICONS`. O ícone aqui é
 * o mesmo de lá, a chave inglesa.
 */
const ICONE_EXTRA_DO_BLOCO: Record<string, LucideIcon> = { 'Ferramentas': Wrench }
const iconeDoBloco = (bloco: string): LucideIcon | undefined =>
  GROUP_ICONS[bloco] ?? ICONE_EXTRA_DO_BLOCO[bloco]


interface Alvo {
  id: string; name: string; email: string; role: string
  areaId: string | null; areaNome: string | null
  cargoId: string | null; cargoNome: string | null
}
/**
 * Acesso é um estado só: tem ou não tem — o mesmo interruptor do cadastro
 * individual. Ver/editar/excluir não descrevem este sistema; o que gradua o
 * acesso são as SUB-PERMISSÕES de cada módulo, específicas demais para uma ação
 * em massa (elas continuam no cadastro individual, e esta tela não as toca).
 */
type Tri = 'nenhum' | 'parcial' | 'todos'

/**
 * Aplicação de permissões em massa.
 *
 * A tela existe porque o caminho de antes era abrir usuário por usuário: 40
 * pessoas têm exatamente o mesmo acesso, então um módulo novo custava 40 vezes
 * a mesma edição.
 *
 * O princípio que a torna segura: **só o que você tocar muda**. Marcar "Fiscal"
 * para um grupo não mexe no resto do acesso dessas pessoas — sem isso, liberar
 * um módulo apagaria todos os outros de quem foi selecionado.
 */
export default function PermissoesEmMassaPage() {
  const [alvos, setAlvos] = useState<Alvo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [filtroArea, setFiltroArea] = useState('')
  const [filtroCargo, setFiltroCargo] = useState('')

  const [matriz, setMatriz] = useState<Record<string, number>>({})   // slug → quantos têm acesso
  const [carregandoMatriz, setCarregandoMatriz] = useState(false)
  // Alterações pendentes: módulo → conceder/retirar. Só o que está aqui é gravado.
  const [pendentes, setPendentes] = useState<Record<string, boolean>>({})
  const [salvando, setSalvando] = useState(false)
  // Nasce colapsado: onze blocos abertos sao ~90 linhas e o alvo fica longe da
  // vista. Abre-se o bloco em que se vai mexer.
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const cores = useModuleColors()
  const corDe = (bloco: string) => cores[COR_DO_BLOCO[bloco] ?? ''] ?? 'var(--muted-foreground)'

  const carregarAlvos = useCallback(async () => {
    setCarregando(true)
    try {
      setAlvos((await (trpc.user as any).alvosPermissao.query()) as Alvo[])
    } catch (e) {
      alerts.error('Não foi possível carregar os usuários', (e as Error).message)
    } finally { setCarregando(false) }
  }, [])
  useEffect(() => { void carregarAlvos() }, [carregarAlvos])

  const ids = useMemo(() => [...selecionados], [selecionados])

  const carregarMatriz = useCallback(async () => {
    if (ids.length === 0) { setMatriz({}); return }
    setCarregandoMatriz(true)
    try {
      const r = await (trpc.user as any).matrizPermissoes.query({ userIds: ids }) as {
        modulos: Array<{ moduleSlug: string; comAcesso: number }>
      }
      const m: Record<string, number> = {}
      for (const x of r.modulos) m[x.moduleSlug] = x.comAcesso
      setMatriz(m)
    } catch { setMatriz({}) } finally { setCarregandoMatriz(false) }
  }, [ids])
  useEffect(() => { void carregarMatriz() }, [carregarMatriz])

  // ── filtros da lista de usuários ──
  const areas = useMemo(() => [...new Set(alvos.map(a => a.areaNome).filter(Boolean))].sort() as string[], [alvos])
  const cargos = useMemo(() => [...new Set(alvos.map(a => a.cargoNome).filter(Boolean))].sort() as string[], [alvos])
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return alvos.filter(a =>
      (!t || a.name.toLowerCase().includes(t) || a.email.toLowerCase().includes(t)) &&
      (!filtroArea || a.areaNome === filtroArea) &&
      (!filtroCargo || a.cargoNome === filtroCargo))
  }, [alvos, busca, filtroArea, filtroCargo])

  const alternarUsuario = (id: string) => setSelecionados(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const marcarVisiveis = () => setSelecionados(s => new Set([...s, ...visiveis.map(v => v.id)]))
  const limparSelecao = () => setSelecionados(new Set())

  // ── estado de cada módulo na seleção ──
  const estado = useCallback((slug: string): Tri => {
    const pend = pendentes[slug]
    if (pend !== undefined) return pend ? 'todos' : 'nenhum'
    const n = matriz[slug] ?? 0
    if (ids.length === 0 || n === 0) return 'nenhum'
    return n === ids.length ? 'todos' : 'parcial'
  }, [pendentes, matriz, ids.length])

  /**
   * Clicar alterna. Partindo de "parte", CONCEDE: quem já tem não perde nada, e
   * o caminho contrário — tirar de todo mundo porque parte tinha — apagaria
   * acesso sem ninguém pedir.
   */
  const alternarModulo = (slug: string) => {
    const atual = estado(slug)
    setPendentes(p => ({ ...p, [slug]: atual !== 'todos' }))
  }

  /** Libera ou retira um bloco inteiro para a seleção. */
  const alternarBloco = (bloco: string, conceder: boolean) => {
    const mods = ((MODULE_GROUPS as Record<string, readonly string[]>)[bloco] ?? [])
      .filter(m => !(PLATFORM_ADMIN_MODULES as readonly string[]).includes(m))
    setPendentes(p => {
      const out = { ...p }
      for (const slug of mods) out[slug] = conceder
      return out
    })
  }

  const qtdPendentes = Object.keys(pendentes).length

  const aplicar = async () => {
    if (ids.length === 0 || qtdPendentes === 0) return
    const alteracoes = Object.entries(pendentes).map(([moduleSlug, conceder]) => ({ moduleSlug, conceder }))
    const liberados = alteracoes.filter(a => a.conceder).length
    const retirados = alteracoes.length - liberados
    const ok = await alerts.confirm({
      title: 'Aplicar permissões?',
      text: `${ids.length} usuário(s) · ${liberados} módulo(s) liberado(s)`
        + `${retirados > 0 ? ` · ${retirados} retirado(s)` : ''}.`
        + ' O restante do acesso dessas pessoas não muda.',
      confirmText: 'Aplicar',
    })
    if (!ok) return
    setSalvando(true)
    try {
      const r = await (trpc.user as any).aplicarPermissoesEmMassa.mutate({ userIds: ids, alteracoes }) as {
        usuarios: number; concedidos: number; retirados: number; jaTinham: number
      }
      await alerts.success(
        'Permissões aplicadas',
        `${r.concedidos} acesso(s) concedido(s) e ${r.retirados} retirado(s), em ${r.usuarios} usuário(s).`
        + (r.jaTinham > 0 ? ` ${r.jaTinham} já tinham — intocados, com as sub-permissões preservadas.` : ''),
      )
      setPendentes({})
      await carregarMatriz()
    } catch (e) {
      alerts.error('Não foi possível aplicar', (e as Error).message)
    } finally { setSalvando(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {qtdPendentes > 0 && (
            <Button size="sm" variant="outline" onClick={() => setPendentes({})}>
              <RotateCcw className="h-3.5 w-3.5" /> Descartar
            </Button>
          )}
          <Button size="sm" variant="success" onClick={aplicar}
            disabled={ids.length === 0 || qtdPendentes === 0 || salvando}>
            {salvando ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aplicando…</> : <><Save className="h-3.5 w-3.5" /> Aplicar</>}
          </Button>
          <BackButton href="/usuarios" label="Voltar" />
      </>}>
        <h1 className="truncate">Permissões em massa</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Cadastros</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Usuários</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Permissões em massa</span>
        </p>
      </PageHeaderBar>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* ── quem recebe ── */}
        <Card className="flex max-h-[calc(100vh-220px)] flex-col p-3">
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            <span className="text-sm font-semibold text-foreground">Quem recebe</span>
            {selecionados.size > 0 && (
              <Badge variant="default" className="ml-auto text-[10px]" style={{ backgroundColor: MODULE_COLOR }}>
                {selecionados.size}
              </Badge>
            )}
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou e-mail"
              className="h-8 pl-7 text-xs" />
          </div>
          {/* Um por linha: lado a lado em 320px o nome do cargo era cortado,
              e cargo longo ("Auxiliar Administrativo Contábil/Fiscal") é a regra
              aqui, não a exceção. */}
          <div className="mb-2 flex flex-col gap-2">
            <Select value={filtroArea || '__all__'} onValueChange={v => setFiltroArea(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Todas as áreas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as áreas</SelectItem>
                {areas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroCargo || '__all__'} onValueChange={v => setFiltroCargo(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Todos os cargos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os cargos</SelectItem>
                {cargos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="mb-2 flex gap-2 text-xs">
            <button onClick={marcarVisiveis} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted/40">
              Selecionar {visiveis.length}
            </button>
            <button onClick={limparSelecao} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted/40">
              Limpar
            </button>
          </div>

          <div className="nice-scrollbar -mx-1 flex-1 overflow-y-auto px-1">
            {carregando ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : visiveis.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Ninguém encontrado.</p>
            ) : visiveis.map(u => (
              <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/40">
                <Checkbox checked={selecionados.has(u.id)} onCheckedChange={() => alternarUsuario(u.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground">{u.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {u.cargoNome || u.areaNome || u.email}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        {/* ── o que liberar ── */}
        <Card className="flex max-h-[calc(100vh-220px)] flex-col p-0">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">Menu do sistema</span>
            {carregandoMatriz && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <button onClick={() => setAbertos(a => a.size === 0 ? new Set(Object.keys(MODULE_GROUPS)) : new Set())}
              className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">
              {abertos.size === 0 ? 'Expandir tudo' : 'Recolher tudo'}
            </button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {ids.length === 0
                ? 'Selecione quem recebe para ver o que já está liberado'
                : qtdPendentes > 0
                  ? `${qtdPendentes} módulo(s) alterado(s) — nada foi gravado ainda`
                  : 'Marque o que deseja liberar'}
            </span>
          </div>

          <div className="nice-scrollbar flex-1 overflow-y-auto">
            {Object.entries(MODULE_GROUPS).map(([bloco, mods]) => {
              const lista = (mods as readonly string[]).filter(m => !(PLATFORM_ADMIN_MODULES as readonly string[]).includes(m))
              if (lista.length === 0) return null
              const aberto = abertos.has(bloco)
              return (
                <div key={bloco} className="border-b border-border/60 last:border-0">
                  <div className="flex items-center gap-2 border-l-[3px] bg-muted/30 px-4 py-2"
                    style={{ borderLeftColor: corDe(bloco) }}>
                    <button onClick={() => setAbertos(s => { const n = new Set(s); n.has(bloco) ? n.delete(bloco) : n.add(bloco); return n })}
                      className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                      {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {(() => { const I = iconeDoBloco(bloco); return I ? <I className="h-4 w-4" style={{ color: corDe(bloco) }} /> : null })()}
                      {bloco}
                      <span className="font-normal text-muted-foreground">({lista.length})</span>
                    </button>
                    <div className="ml-auto flex gap-1">
                      <button onClick={() => alternarBloco(bloco, true)} disabled={ids.length === 0}
                        title={`Liberar o bloco ${bloco} inteiro`}
                        className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-40">
                        Liberar tudo
                      </button>
                      <button onClick={() => alternarBloco(bloco, false)} disabled={ids.length === 0}
                        title={`Retirar o bloco ${bloco} inteiro`}
                        className={cn('rounded border border-border px-2 py-0.5 text-[10px] hover:bg-muted disabled:opacity-40', TEXT.rose)}>
                        Retirar tudo
                      </button>
                    </div>
                  </div>

                  {aberto && (
                    <table className="w-full text-[13px]">
                      <tbody>
                        {lista.map(slug => (
                          <tr key={slug} className="border-t border-border/40 hover:bg-muted/20">
                            <td className="px-4 py-1.5 text-foreground">
                              <span className="inline-flex items-center gap-2">
                                {(() => {
                                  const I = MODULE_ICONS[slug] ?? Circle
                                  return <I className="h-3.5 w-3.5 shrink-0" style={{ color: corDe(bloco) }} />
                                })()}
                                {MODULE_LABELS[slug] ?? slug}
                              </span>
                              {/* `!== undefined` e nao `pendentes[slug]`: retirar grava `false`,
                                  e a checagem por verdadeiro esconderia justo a mudanca destrutiva. */}
                              {pendentes[slug] !== undefined && (
                                <span className={cn(
                                  'ml-2 rounded px-1.5 py-0.5 text-[10px]',
                                  pendentes[slug]
                                    ? cn('bg-emerald-500/15', TEXT.emerald)
                                    : cn('bg-rose-500/15', TEXT.rose),
                                )}>
                                  {pendentes[slug] ? 'liberar' : 'retirar'}
                                </span>
                              )}
                            </td>
                            <td className="w-40 px-3 py-1.5 text-right">
                              {(() => {
                                const tri = estado(slug)
                                const n = matriz[slug] ?? 0
                                return (
                                  <span className="inline-flex items-center gap-2">
                                    {tri === 'parcial' && (
                                      <span className={cn('text-[10px]', TEXT.amber)}>{n} de {ids.length}</span>
                                    )}
                                    <button type="button" onClick={() => alternarModulo(slug)} disabled={ids.length === 0}
                                      title={tri === 'todos' ? 'Retirar acesso' : 'Liberar acesso'}
                                      className={cn(
                                        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40',
                                        tri === 'nenhum' && 'bg-muted-foreground/20',
                                        tri === 'parcial' && 'bg-amber-500/50',
                                      )}
                                      style={tri === 'todos' ? { backgroundColor: corDe(bloco) } : undefined}>
                                      <span className={cn(
                                        'pointer-events-none mt-0.5 inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                                        tri === 'todos' ? 'ml-0.5 translate-x-4' : tri === 'parcial' ? 'translate-x-2' : 'translate-x-0.5',
                                      )} />
                                    </button>
                                  </span>
                                )
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
