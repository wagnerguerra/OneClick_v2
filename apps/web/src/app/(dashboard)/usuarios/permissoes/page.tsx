'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, Loader2, Search, Users, ChevronDown, ChevronRight, Save, RotateCcw,
  Circle,
} from 'lucide-react'
import { Button, Card, Input, Badge, Checkbox, cn } from '@saas/ui'
import { MODULE_GROUPS, MODULE_LABELS, PLATFORM_ADMIN_MODULES } from '@saas/types'
import { BackButton } from '@/components/ui/back-button'
import { MODULE_ICONS, GROUP_ICONS } from '@/lib/navigation'
import { useModuleColors } from '@/components/theme/module-colors'
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
 */


interface Alvo {
  id: string; name: string; email: string; role: string
  areaId: string | null; areaNome: string | null
  cargoId: string | null; cargoNome: string | null
}
type Nivel = 'canRead' | 'canWrite' | 'canDelete'
const NIVEIS: Array<{ chave: Nivel; curto: string; titulo: string }> = [
  { chave: 'canRead', curto: 'Ver', titulo: 'Visualizar' },
  { chave: 'canWrite', curto: 'Editar', titulo: 'Criar e editar' },
  { chave: 'canDelete', curto: 'Excluir', titulo: 'Excluir' },
]

/** Estado de um nível na seleção: ninguém, parte ou todos. */
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

  const [matriz, setMatriz] = useState<Record<string, { ler: number; escrever: number; excluir: number }>>({})
  const [carregandoMatriz, setCarregandoMatriz] = useState(false)
  // Alterações pendentes: módulo → níveis. Só o que está aqui será gravado.
  const [pendentes, setPendentes] = useState<Record<string, Record<Nivel, boolean>>>({})
  const [salvando, setSalvando] = useState(false)
  const [abertos, setAbertos] = useState<Set<string>>(new Set(Object.keys(MODULE_GROUPS)))
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
        modulos: Array<{ moduleSlug: string; ler: number; escrever: number; excluir: number }>
      }
      const m: Record<string, { ler: number; escrever: number; excluir: number }> = {}
      for (const x of r.modulos) m[x.moduleSlug] = { ler: x.ler, escrever: x.escrever, excluir: x.excluir }
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
  const estado = useCallback((slug: string, nivel: Nivel): Tri => {
    const pend = pendentes[slug]
    if (pend) return pend[nivel] ? 'todos' : 'nenhum'
    const m = matriz[slug]
    if (!m || ids.length === 0) return 'nenhum'
    const n = nivel === 'canRead' ? m.ler : nivel === 'canWrite' ? m.escrever : m.excluir
    return n === 0 ? 'nenhum' : n === ids.length ? 'todos' : 'parcial'
  }, [pendentes, matriz, ids.length])

  /**
   * Marcar um nível liga os anteriores: não existe "editar sem ver". Deixar as
   * três caixas soltas produziria permissão que o backend ignora e a tela
   * mostraria como concedida.
   */
  const alternarModulo = (slug: string, nivel: Nivel) => {
    setPendentes(p => {
      const atualTri = estado(slug, nivel)
      const ligar = atualTri !== 'todos'
      const base: Record<Nivel, boolean> = p[slug] ?? {
        canRead: estado(slug, 'canRead') !== 'nenhum',
        canWrite: estado(slug, 'canWrite') !== 'nenhum',
        canDelete: estado(slug, 'canDelete') !== 'nenhum',
      }
      const novo = { ...base, [nivel]: ligar }
      if (ligar) {
        if (nivel === 'canDelete') { novo.canWrite = true; novo.canRead = true }
        if (nivel === 'canWrite') novo.canRead = true
      } else {
        if (nivel === 'canRead') { novo.canWrite = false; novo.canDelete = false }
        if (nivel === 'canWrite') novo.canDelete = false
      }
      return { ...p, [slug]: novo }
    })
  }

  /** Marca/desmarca um bloco inteiro no nível escolhido. */
  const alternarBloco = (bloco: string, nivel: Nivel, ligar: boolean) => {
    const mods = (MODULE_GROUPS as Record<string, readonly string[]>)[bloco] ?? []
    setPendentes(p => {
      const out = { ...p }
      for (const slug of mods) {
        if ((PLATFORM_ADMIN_MODULES as readonly string[]).includes(slug)) continue
        const base: Record<Nivel, boolean> = out[slug] ?? {
          canRead: estado(slug, 'canRead') !== 'nenhum',
          canWrite: estado(slug, 'canWrite') !== 'nenhum',
          canDelete: estado(slug, 'canDelete') !== 'nenhum',
        }
        const novo = { ...base, [nivel]: ligar }
        if (ligar) {
          if (nivel === 'canDelete') { novo.canWrite = true; novo.canRead = true }
          if (nivel === 'canWrite') novo.canRead = true
        } else {
          if (nivel === 'canRead') { novo.canWrite = false; novo.canDelete = false }
          if (nivel === 'canWrite') novo.canDelete = false
        }
        out[slug] = novo
      }
      return out
    })
  }

  const qtdPendentes = Object.keys(pendentes).length

  const aplicar = async () => {
    if (ids.length === 0 || qtdPendentes === 0) return
    const alteracoes = Object.entries(pendentes).map(([moduleSlug, n]) => ({ moduleSlug, ...n }))
    const liberados = alteracoes.filter(a => a.canRead).length
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
        usuarios: number; concedidos: number; revogados: number; ajustados: number
      }
      await alerts.success(
        'Permissões aplicadas',
        `${r.usuarios} usuário(s) alterado(s) · ${r.concedidos} concedida(s), ${r.ajustados} ajustada(s), ${r.revogados} removida(s).`,
      )
      setPendentes({})
      await carregarMatriz()
    } catch (e) {
      alerts.error('Não foi possível aplicar', (e as Error).message)
    } finally { setSalvando(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1>Permissões em massa</h1>
            <p className="text-sm text-muted-foreground">Libere blocos e módulos para vários usuários de uma vez</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
        </div>
      </div>

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
            <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground">
              <option value="">Todas as áreas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground">
              <option value="">Todos os cargos</option>
              {cargos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
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
                      {(() => { const I = GROUP_ICONS[bloco]; return I ? <I className="h-4 w-4" style={{ color: corDe(bloco) }} /> : null })()}
                      {bloco}
                      <span className="font-normal text-muted-foreground">({lista.length})</span>
                    </button>
                    <div className="ml-auto flex gap-1">
                      {NIVEIS.map(n => (
                        <button key={n.chave} onClick={() => alternarBloco(bloco, n.chave, true)}
                          title={`${n.titulo} em todo o bloco ${bloco}`}
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">
                          + {n.curto}
                        </button>
                      ))}
                      <button onClick={() => alternarBloco(bloco, 'canRead', false)}
                        title={`Retirar o bloco ${bloco} inteiro`}
                        className="rounded border border-border px-1.5 py-0.5 text-[10px] text-rose-500 hover:bg-muted">
                        − tudo
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
                              {pendentes[slug] && (
                                <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                                  alterado
                                </span>
                              )}
                            </td>
                            {NIVEIS.map(n => {
                              const tri = estado(slug, n.chave)
                              return (
                                <td key={n.chave} className="w-24 px-2 py-1.5 text-center">
                                  <button onClick={() => alternarModulo(slug, n.chave)} disabled={ids.length === 0}
                                    title={n.titulo}
                                    className={cn(
                                      'w-full rounded-md border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40',
                                      tri === 'todos' && 'border-transparent text-white',
                                      tri === 'parcial' && 'border-dashed border-amber-500 text-amber-600 dark:text-amber-400',
                                      tri === 'nenhum' && 'border-border text-muted-foreground hover:bg-muted/60',
                                    )}
                                    style={tri === 'todos' ? { backgroundColor: MODULE_COLOR } : undefined}>
                                    {tri === 'parcial' ? 'parte' : n.curto}
                                  </button>
                                </td>
                              )
                            })}
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
