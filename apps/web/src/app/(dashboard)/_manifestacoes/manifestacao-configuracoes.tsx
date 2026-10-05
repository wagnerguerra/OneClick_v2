'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, Loader2, Mail, Plus, Search, Settings2, X } from 'lucide-react'
import { Button, Card, Checkbox, Input, Switch, cn } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { BackButton } from '@/components/ui/back-button'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useAnchoredDropdown } from '@/components/ui/use-anchored-dropdown'
import type { Config } from './tipos'

/**
 * Configurações do módulo (05/10/2026): quem é avisado de cada evento.
 *
 * Acesso pela sub-permissão `configurar` (o servidor barra os demais). Sem
 * ninguém escolhido num evento, ninguém é avisado dele.
 */

type Evento = 'REGISTRADA' | 'EDITADA' | 'RETORNO' | 'ANALISADA' | 'FINALIZADA' | 'MENSAGEM'
interface LinhaCfg { evento: Evento; userIds: string[]; avisarAutor: boolean; sino: boolean; email: boolean }
interface Pessoa { id: string; name: string }

const EVENTOS: Record<Evento, { titulo: string; nota: string; soFluxo?: boolean }> = {
  REGISTRADA: { titulo: 'Registro novo', nota: 'Alguém registrou — pela tela ou pelo portal público.' },
  EDITADA: { titulo: 'Registro editado', nota: 'O relato, o cliente ou os dados de contato foram alterados.' },
  RETORNO: { titulo: 'Retorno ao cliente', nota: 'O primeiro retorno foi dado ao cliente.' },
  ANALISADA: { titulo: 'Análise de procedência', nota: 'A reclamação foi julgada procedente ou não procedente.', soFluxo: true },
  FINALIZADA: { titulo: 'Finalizada', nota: 'A tratativa foi encerrada.' },
  MENSAGEM: { titulo: 'Nova mensagem', nota: 'Nota interna ou mensagem ao interessado.' },
}

export function ManifestacaoConfiguracoes({ config }: { config: Config }) {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find(p => p.moduleSlug === config.slug)?.subPermissions ?? {}) as Record<string, boolean>
  const pode = isMaster || isEmpresaMaster || subs.configurar === true

  const api = (trpc as never as Record<string, any>)[config.router]
  const [linhas, setLinhas] = useState<LinhaCfg[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [sujo, setSujo] = useState(false)
  const [param, setParam] = useState<{ permitirInternas: boolean; podeAlterarInternas: boolean } | null>(null)
  const [salvandoParam, setSalvandoParam] = useState(false)

  useEffect(() => {
    if (!pode && !isMaster) return
    api.parametros.query().then(setParam).catch(() => setParam(null))
  }, [api, pode, isMaster])

  async function alternarInternas(permitir: boolean) {
    setSalvandoParam(true)
    try {
      await api.definirPermiteInterna.mutate({ permitir })
      setParam(p => (p ? { ...p, permitirInternas: permitir } : p))
      alerts.toast(permitir ? 'Registro interno liberado' : 'Registro interno restrito — só reclamações de clientes')
    } catch (e) {
      alerts.error('Não foi possível alterar', (e as Error).message)
    } finally {
      setSalvandoParam(false)
    }
  }

  useEffect(() => {
    if (!pode) { setCarregando(false); return }
    Promise.all([
      api.notificacoesConfig.query(),
      (trpc.user as any).listForSelect.query(),
    ])
      .then(([cfg, us]: [LinhaCfg[], Pessoa[]]) => {
        // Elogio e sugestão não têm análise de procedência.
        setLinhas((cfg ?? []).filter(l => config.temFluxo || !EVENTOS[l.evento]?.soFluxo))
        setPessoas((us ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      })
      .catch((e: Error) => alerts.error('Não foi possível carregar', e.message))
      .finally(() => setCarregando(false))
  }, [api, pode, config.temFluxo])

  const muda = (evento: Evento, patch: Partial<LinhaCfg>) => {
    setLinhas(ls => ls.map(l => (l.evento === evento ? { ...l, ...patch } : l)))
    setSujo(true)
  }

  async function salvar() {
    setSalvando(true)
    try {
      const r: LinhaCfg[] = await api.salvarNotificacoesConfig.mutate(linhas)
      setLinhas((r ?? []).filter(l => config.temFluxo || !EVENTOS[l.evento]?.soFluxo))
      setSujo(false)
      alerts.toast('Configurações salvas')
    } catch (e) {
      alerts.error('Não foi possível salvar', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const nomeDe = useMemo(() => new Map(pessoas.map(p => [p.id, p.name])), [pessoas])

  return (
    <div className="flex flex-col gap-5">
      <PageHeaderBar className="mb-0 sm:mb-0" actions={<>
        {pode && (
          <Button size="sm" className="gap-1.5" onClick={salvar} disabled={salvando || !sujo}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </Button>
        )}
        <BackButton href={`/${config.slug}`} label="Voltar" />
      </>}>
        <h1 className="truncate">Configurações — {config.titulo}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span><span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <Link href={`/${config.slug}`} className="transition-colors hover:text-foreground">{config.titulo}</Link>
          <span className="text-muted-foreground/50">›</span><span>Configurações</span>
        </p>
      </PageHeaderBar>

      {/* Só o master: liberar ou restringir o registro "de dentro de casa". */}
      {param?.podeAlterarInternas && (
        <Card className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Permitir reclamações internas</p>
            <p className="text-[11.5px] text-muted-foreground">
              Desmarcado, o formulário aceita só reclamações de clientes — a opção “De dentro de casa” some e o
              sistema recusa o registro interno. As internas já registradas continuam como estão.
              <span className="ml-1 font-medium">Somente o master altera.</span>
            </p>
          </div>
          <Switch checked={param.permitirInternas} disabled={salvandoParam}
            onCheckedChange={(v: boolean) => alternarInternas(v)} aria-label="Permitir reclamações internas" />
        </Card>
      )}

      {!pode ? (
        <Card className="py-12 text-center text-sm text-muted-foreground">
          Você não tem acesso às configurações deste módulo.
        </Card>
      ) : carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[13px] font-semibold">Quem recebe as notificações</p>
              <p className="text-[11px] text-muted-foreground">
                Para cada evento, escolha quem é avisado e por onde. Evento sem ninguém escolhido não avisa ninguém.
                Quem fez a ação não recebe o aviso do que acabou de fazer.
              </p>
            </div>
          </div>
          <div className="divide-y divide-border/60">
            {linhas.map(l => {
              const ev = EVENTOS[l.evento]
              return (
                <div key={l.evento} className="grid gap-3 px-4 py-4 lg:grid-cols-[260px_1fr_220px]">
                  <div>
                    <p className="text-[13px] font-semibold">{ev.titulo}</p>
                    <p className="text-[11.5px] text-muted-foreground">{ev.nota}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {l.userIds.map(id => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-[12px]">
                          {nomeDe.get(id) ?? 'Usuário inativo'}
                          <button type="button" aria-label="Remover" onClick={() => muda(l.evento, { userIds: l.userIds.filter(x => x !== id) })}
                            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <AdicionarPessoa
                        pessoas={pessoas.filter(p => !l.userIds.includes(p.id))}
                        onAdd={id => muda(l.evento, { userIds: [...l.userIds, id] })}
                      />
                    </div>
                    <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                      <Checkbox checked={l.avisarAutor} onCheckedChange={v => muda(l.evento, { avisarAutor: v === true })} />
                      Avisar também quem registrou <span className="text-[11px]">(nunca numa anônima)</span>
                    </label>
                  </div>
                  <div className="flex items-start gap-4 lg:justify-end">
                    <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                      <Checkbox checked={l.sino} onCheckedChange={v => muda(l.evento, { sino: v === true })} />
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" /> No sistema
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                      <Checkbox checked={l.email} onCheckedChange={v => muda(l.evento, { email: v === true })} />
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" /> E-mail
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

/** Botão "+ Adicionar" com busca de pessoas (dropdown ancorado, fora do overflow). */
function AdicionarPessoa({ pessoas, onAdd }: { pessoas: Pessoa[]; onAdd: (id: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [q, setQ] = useState('')
  const fechar = () => { setAberto(false); setQ('') }
  const { anchorRef, popRef, posRef, reposition } = useAnchoredDropdown(aberto, fechar)
  const sem = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtradas = q.trim() ? pessoas.filter(p => sem(p.name).includes(sem(q.trim()))) : pessoas

  return (
    <div ref={anchorRef} className="relative">
      <button type="button" onClick={() => { if (!aberto) reposition(); setAberto(a => !a) }}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
        <Plus className="h-3 w-3" /> Adicionar pessoa
      </button>
      {aberto && posRef.current && (
        <div ref={popRef} className="fixed z-[9999] w-[280px] overflow-hidden rounded-md border bg-popover shadow-md"
          style={{ top: posRef.current.top, left: posRef.current.left }}>
          <div className="relative border-b p-1.5">
            <Search className="absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar pessoa..." className="h-7 pl-7 text-xs" />
          </div>
          <div className="nice-scrollbar max-h-64 overflow-y-auto py-1">
            {filtradas.length === 0
              ? <p className="px-3 py-3 text-center text-xs text-muted-foreground">Ninguém encontrado</p>
              : filtradas.map(p => (
                <button key={p.id} type="button" onClick={() => { onAdd(p.id); fechar() }}
                  className={cn('w-full truncate px-3 py-1.5 text-left text-[13px] hover:bg-muted')}>
                  {p.name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
