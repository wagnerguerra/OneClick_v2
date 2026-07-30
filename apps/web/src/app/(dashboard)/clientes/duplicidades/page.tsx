'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, Loader2, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react'
import { Card, Badge, Checkbox, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { masks } from '@/lib/masks'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

interface Cadastro {
  id: string
  code: number
  razaoSocial: string
  documento: string
  isActive: boolean
  createdAt: string
  idOneclick: string | null
  idAcessorias: string | null
  vinculos: Record<string, number>
  totalVinculos: number
}
interface Grupo {
  documento: string
  cadastros: Cadastro[]
  dadoEmMaisDeUm: boolean
  totalVinculos: number
}
interface Resultado { grupos: Grupo[]; totalGrupos: number; totalExcedentes: number }
interface TipoVinculo { chave: string; label: string }

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

export default function DuplicidadesPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, loading: permsLoading } = useUserPermissions()
  const pode = isMaster || isEmpresaMaster

  const [res, setRes] = useState<Resultado | null>(null)
  const [tipos, setTipos] = useState<TipoVinculo[]>([])
  const [loading, setLoading] = useState(true)
  const [apenasComDado, setApenasComDado] = useState(false)

  useEffect(() => {
    if (!permsLoading && !pode) router.replace('/clientes')
  }, [permsLoading, pode, router])

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.cliente as any).duplicidades.query({ apenasComDado })
      .then((d: Resultado) => setRes(d))
      .catch(() => setRes(null))
      .finally(() => setLoading(false))
  }, [apenasComDado])

  useEffect(() => { if (pode) carregar() }, [pode, carregar])
  useEffect(() => {
    ;(trpc.cliente as any).duplicidadesTipos.query()
      .then((d: TipoVinculo[]) => setTipos(d || [])).catch(() => setTipos([]))
  }, [])

  if (permsLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!pode) return null

  const gruposCriticos = res?.grupos.filter((g) => g.dadoEmMaisDeUm).length ?? 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Copy className="h-6 w-6" />
          </div>
          <div>
            <h1>Cadastros repetidos</h1>
            <p className="text-sm text-muted-foreground">Clientes com o mesmo CNPJ/CPF em mais de um cadastro</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BackButton href="/clientes" label="Voltar" />
        </div>
      </div>

      <Card className="border-sky-200 bg-sky-50/60 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/20">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Este relatório só lê — nada é alterado aqui.</p>
            <p className="text-muted-foreground">
              Quando o mesmo cliente tem dois cadastros, o histórico fica partido: os orçamentos ficam
              pendurados num deles e somem da aba do outro. Os grupos com <strong className="text-foreground">histórico
              dos dois lados</strong> são os que exigem decisão — nos demais, um dos cadastros está vazio.
            </p>
            <p className="text-muted-foreground">
              Clientes <strong className="text-foreground">em constituição</strong> (ainda sem CNPJ) não entram aqui:
              vários deles convivem legitimamente e não são duplicatas.
            </p>
          </div>
        </div>
      </Card>

      {res && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums">{res.totalGrupos}</p>
            <p className="text-xs text-muted-foreground">documentos repetidos</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums">{res.totalExcedentes}</p>
            <p className="text-xs text-muted-foreground">cadastros excedentes</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-500">{gruposCriticos}</p>
            <p className="text-xs text-muted-foreground">com histórico dos dois lados</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums">{res.grupos.reduce((s, g) => s + g.totalVinculos, 0)}</p>
            <p className="text-xs text-muted-foreground">registros vinculados</p>
          </Card>
        </div>
      )}

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={apenasComDado} onCheckedChange={(v) => setApenasComDado(!!v)} />
        Mostrar só os grupos com histórico em mais de um cadastro
      </label>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Analisando a base...
        </div>
      ) : !res?.grupos.length ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum cadastro repetido encontrado.
        </Card>
      ) : (
        <div className="space-y-3">
          {res.grupos.map((g) => (
            <Card key={g.documento} className={cn('overflow-hidden', g.dadoEmMaisDeUm && 'border-amber-300 dark:border-amber-800')}>
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                <span className="font-mono text-sm font-medium">{masks.cpfCnpj(g.documento)}</span>
                <Badge variant="secondary" className="text-[10px]">{g.cadastros.length} cadastros</Badge>
                {g.dadoEmMaisDeUm && (
                  <Badge className="gap-1 bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />histórico dos dois lados
                  </Badge>
                )}
              </div>

              <div className="divide-y divide-border/60">
                {g.cadastros.map((c, idx) => (
                  <div key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/clientes/${c.id}`} target="_blank"
                          className="truncate text-sm font-medium hover:underline">
                          #{c.code} — {c.razaoSocial}
                        </Link>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {idx === 0 && <Badge variant="outline" className="text-[10px]">mais antigo</Badge>}
                        {!c.isActive && <Badge variant="secondary" className="text-[10px]">inativo</Badge>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        criado em {fmtData(c.createdAt)}
                        {c.idOneclick ? ` · OneClick v1 #${c.idOneclick}` : ''}
                        {c.idAcessorias ? ` · Acessórias #${c.idAcessorias}` : ''}
                      </p>

                      {c.totalVinculos > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tipos.filter((t) => (c.vinculos[t.chave] ?? 0) > 0).map((t) => (
                            <span key={t.chave}
                              className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
                              {t.label}: <strong>{c.vinculos[t.chave]}</strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] italic text-muted-foreground">
                          sem histórico vinculado — provavelmente o cadastro a descartar
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold tabular-nums" style={{ color: c.totalVinculos > 0 ? MODULE_COLOR : undefined }}>
                        {c.totalVinculos}
                      </p>
                      <p className="text-[10px] text-muted-foreground">registros</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="pb-2 text-center text-xs text-muted-foreground">
        A mesclagem dos cadastros é a próxima etapa — por enquanto, este relatório serve para decidir qual deles fica.
      </p>
    </div>
  )
}
