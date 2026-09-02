'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  GitCompareArrows, Loader2, ExternalLink, ShieldCheck, ArrowRight,
  CheckCircle2, AlertTriangle, Building2, RefreshCw,
} from 'lucide-react'
import { Button, Card, Badge, Checkbox, Input, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { AbasAcessorias } from '../_components/abas-acessorias'
import { TEXT } from '@/lib/color-styles'

const MODULE_COLOR = 'var(--mod-administrativo, #0ea5e9)'

interface Divergencia {
  campo: string
  label: string
  nosso: string | null
  deles: string | null
  apenasCompleta: boolean
}
interface ClienteDivergente {
  clienteId: string
  code: number
  razaoSocial: string
  documento: string
  idAcessorias: number | null
  divergencias: Divergencia[]
  honorarioAcessorias: number | null
}
interface Relatorio {
  clientes: ClienteDivergente[]
  somenteNoAcessorias: Array<{ id: number; documento: string; razaoSocial: string; status: string }>
  somenteNoOneClick: Array<{ clienteId: string; code: number; razaoSocial: string; idAcessorias: number }>
  totais: {
    empresasAcessorias: number
    clientesComparados: number
    clientesComDivergencia: number
    divergencias: number
  }
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** Chave de seleção: um campo de um cliente. */
const chave = (clienteId: string, campo: string) => `${clienteId}::${campo}`

export default function DivergenciasPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, loading: permsLoading } = useUserPermissions()
  const pode = isMaster || isEmpresaMaster

  const [rel, setRel] = useState<Relatorio | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!permsLoading && !pode) router.replace('/acessorias')
  }, [permsLoading, pode, router])

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    setSel(new Set())
    ;(trpc.acessorias as any).divergencias.query()
      .then((d: Relatorio) => setRel(d))
      .catch((e: Error) => { setErro(e.message); setRel(null) })
      .finally(() => setLoading(false))
  }, [])

  if (permsLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!pode) return null

  function alternar(clienteId: string, campo: string) {
    setSel((prev) => {
      const n = new Set(prev)
      const k = chave(clienteId, campo)
      if (n.has(k)) n.delete(k); else n.add(k)
      return n
    })
  }

  function marcarTodosDoCliente(c: ClienteDivergente, marcar: boolean) {
    setSel((prev) => {
      const n = new Set(prev)
      for (const d of c.divergencias) {
        const k = chave(c.clienteId, d.campo)
        if (marcar) n.add(k); else n.delete(k)
      }
      return n
    })
  }

  async function aplicar() {
    if (!rel || sel.size === 0) return
    const itens = rel.clientes
      .map((c) => ({
        clienteId: c.clienteId,
        campos: c.divergencias.map((d) => d.campo).filter((campo) => sel.has(chave(c.clienteId, campo))),
      }))
      .filter((i) => i.campos.length > 0)

    const ok = await alerts.confirm({
      title: `Aplicar ${sel.size} alteração(ões)?`,
      text: `${itens.length} cliente(s) serão atualizados com os dados do Acessórias. Fica registrado no histórico de cada um.`,
      icon: 'warning',
      confirmText: 'Aplicar',
    })
    if (!ok) return

    setAplicando(true)
    try {
      const res = await (trpc.acessorias as any).aplicarDivergencias.mutate({ itens })
      await alerts.success('Aplicado', `${res.aplicados} cliente(s) atualizados.`)
      carregar()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setAplicando(false) }
  }

  const q = busca.trim().toLowerCase()
  const clientes = (rel?.clientes ?? []).filter((c) =>
    !q || c.razaoSocial.toLowerCase().includes(q) || c.documento.includes(q.replace(/\D/g, '')),
  )

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {sel.size > 0 && (
            <Button variant="success" size="sm" disabled={aplicando} onClick={aplicar}>
              {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aplicar ({sel.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {rel ? 'Recarregar' : 'Comparar agora'}
          </Button>
          <BackButton href="/" label="Voltar" />
      </>}>
        <h1 className="truncate">Divergências com o Acessórias</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Administrativo</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Acessórias</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Divergências com o Acessórias</span>
        </p>
      </PageHeaderBar>

      <AbasAcessorias />

      <Card className="border-sky-200 bg-sky-50/60 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/20">
        <div className="flex gap-3">
          <ShieldCheck className={cn('mt-0.5 h-4 w-4 shrink-0', TEXT.sky)} />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Comparar não altera nada — só o botão Aplicar grava.</p>
            <p className="text-muted-foreground">
              Os dois lados podem estar certos: o Acessórias costuma refletir a Receita, e o nosso cadastro
              às vezes guarda o nome pelo qual o cliente é conhecido. Escolha campo a campo o que deve vir de lá.
            </p>
            <p className="text-muted-foreground">
              Quando o Acessórias não tem o dado, não aparece divergência — <strong className="text-foreground">nunca
              sugerimos apagar informação nossa</strong>.
            </p>
          </div>
        </div>
      </Card>

      {!rel && !loading && !erro && (
        <Card className="p-10 text-center">
          <GitCompareArrows className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-20" />
          <p className="text-sm text-muted-foreground">
            A comparação lê a carteira inteira no Acessórias e leva alguns segundos.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={carregar}>
            <RefreshCw className="h-4 w-4" />Comparar agora
          </Button>
        </Card>
      )}

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Consultando o Acessórias página por página...
        </Card>
      )}

      {erro && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{erro}</Card>
      )}

      {rel && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-2xl font-bold tabular-nums">{rel.totais.empresasAcessorias}</p>
              <p className="text-xs text-muted-foreground">empresas no Acessórias</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold tabular-nums">{rel.totais.clientesComparados}</p>
              <p className="text-xs text-muted-foreground">clientes comparados</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-500">{rel.totais.clientesComDivergencia}</p>
              <p className="text-xs text-muted-foreground">com divergência</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold tabular-nums">{rel.totais.divergencias}</p>
              <p className="text-xs text-muted-foreground">campos divergentes</p>
            </Card>
          </div>

          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou CNPJ..." className="h-9 max-w-sm text-sm" />

          {clientes.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma divergência encontrada.
            </Card>
          ) : (
            <div className="space-y-3">
              {clientes.map((c) => {
                const todosMarcados = c.divergencias.every((d) => sel.has(chave(c.clienteId, d.campo)))
                return (
                  <Card key={c.clienteId} className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                      <Checkbox checked={todosMarcados}
                        onCheckedChange={(v) => marcarTodosDoCliente(c, !!v)} />
                      <Link href={`/clientes/${c.clienteId}`} target="_blank"
                        className="inline-flex items-center gap-1 truncate text-sm font-medium hover:underline">
                        #{c.code} — {c.razaoSocial}
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </Link>
                      <span className="font-mono text-[11px] text-muted-foreground">{masks.cpfCnpj(c.documento)}</span>
                      <Badge variant="outline" className="text-[10px]">{c.divergencias.length} campo(s)</Badge>
                      {c.honorarioAcessorias != null && (
                        <Badge variant="secondary" className="ml-auto text-[10px]" title="Honorário informado no Acessórias (informativo)">
                          honorário lá: {brl(c.honorarioAcessorias)}
                        </Badge>
                      )}
                    </div>

                    <div className="divide-y divide-border/60">
                      {c.divergencias.map((d) => (
                        <label key={d.campo}
                          className="flex cursor-pointer flex-col gap-2 px-4 py-2.5 hover:bg-muted/20 sm:flex-row sm:items-center">
                          <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
                            <Checkbox checked={sel.has(chave(c.clienteId, d.campo))}
                              onCheckedChange={() => alternar(c.clienteId, d.campo)} />
                            <span className="text-[13px] font-medium">{d.label}</span>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
                            <span className={cn('truncate', d.nosso ? '' : 'italic text-muted-foreground')}>
                              {d.nosso ?? 'vazio'}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium" style={{ color: MODULE_COLOR }}>{d.deles}</span>
                            {d.apenasCompleta && (
                              <Badge variant="outline" className="text-[9px]">só completa</Badge>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {rel.somenteNoAcessorias.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-[13px] font-semibold">
                  Só no Acessórias — {rel.somenteNoAcessorias.length} empresa(s) sem cliente aqui
                </h4>
              </div>
              <div className="max-h-64 divide-y divide-border/60 overflow-y-auto nice-scrollbar rounded-lg border border-border">
                {rel.somenteNoAcessorias.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span className="font-mono text-muted-foreground">{masks.cpfCnpj(e.documento)}</span>
                    <span className="min-w-0 flex-1 truncate">{e.razaoSocial}</span>
                    <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {rel.somenteNoOneClick.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className={cn('h-4 w-4', TEXT.amber)} />
                <h4 className="text-[13px] font-semibold">
                  Vinculados aqui, ausentes lá — {rel.somenteNoOneClick.length} cliente(s)
                </h4>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Têm código do Acessórias gravado, mas a empresa não apareceu na listagem de lá — pode ter sido
                removida ou o vínculo está apontando para outro registro.
              </p>
              <div className="max-h-64 divide-y divide-border/60 overflow-y-auto nice-scrollbar rounded-lg border border-border">
                {rel.somenteNoOneClick.map((c) => (
                  <div key={c.clienteId} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <Link href={`/clientes/${c.clienteId}`} target="_blank" className="min-w-0 flex-1 truncate hover:underline">
                      #{c.code} — {c.razaoSocial}
                    </Link>
                    <Badge variant="outline" className="text-[10px]">Acessórias #{c.idAcessorias}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
