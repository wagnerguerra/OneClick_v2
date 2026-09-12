'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Building2, RotateCcw, AlertTriangle } from 'lucide-react'
import {
  Button, Card, Switch, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/**
 * Liberação dos módulos do Portal do Cliente.
 *
 * A unidade é a EMPRESA, não o tenant, e isso merece a explicação que está na
 * própria tela: `Empresa` não tem `tenantId` no schema, e as empresas em
 * operação estão todas sem tenant. Um gate por tenant não alcançaria cliente
 * nenhum hoje — ficaria ligado numa entidade que o portal não consulta.
 */

interface EmpresaOpcao {
  id: string
  nome: string
  clientes: number
  clientesComPortal: number
}

interface ModuloLinha {
  slug: string
  rotulo: string
  descricao: string
  implementado: boolean
  padrao: boolean
  liberado: boolean
  personalizado: boolean
}

export function ModulosDoPortalCard() {
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([])
  const [empresaId, setEmpresaId] = useState<string>('')
  const [modulos, setModulos] = useState<ModuloLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    ;(trpc as any).adminTenant.portalEmpresas.query()
      .then((e: EmpresaOpcao[]) => {
        setEmpresas(e)
        // Abre na empresa que mais usa o portal: é onde ligar ou desligar um
        // módulo tem consequência de verdade.
        const alvo = [...e].sort((a, b) => b.clientesComPortal - a.clientesComPortal)[0]
        setEmpresaId(alvo?.id ?? '')
        if (!alvo) setCarregando(false)
      })
      .catch(() => setCarregando(false))
  }, [])

  const carregar = useCallback(() => {
    if (!empresaId) return
    setCarregando(true)
    ;(trpc as any).adminTenant.portalModulos.query({ empresaId })
      .then((m: ModuloLinha[]) => setModulos(m))
      .catch(() => setModulos([]))
      .finally(() => setCarregando(false))
  }, [empresaId])

  useEffect(() => { carregar() }, [carregar])

  async function alternar(m: ModuloLinha, valor: boolean) {
    setSalvando(m.slug)
    // Otimista: o interruptor precisa responder na hora, e o efeito de uma
    // liberação não é visível nesta tela mesmo.
    setModulos(l => l.map(x => (x.slug === m.slug ? { ...x, liberado: valor, personalizado: true } : x)))
    try {
      await (trpc as any).adminTenant.definirPortalModulo.mutate({
        empresaId, modulo: m.slug, liberado: valor,
      })
    } catch (e) {
      carregar()
      alerts.error('Não foi possível salvar', (e as Error).message)
    } finally { setSalvando(null) }
  }

  async function voltarAoPadrao(m: ModuloLinha) {
    setSalvando(m.slug)
    try {
      await (trpc as any).adminTenant.voltarPortalModuloAoPadrao.mutate({ empresaId, modulo: m.slug })
      carregar()
    } catch (e) {
      alerts.error('Não foi possível restaurar', (e as Error).message)
    } finally { setSalvando(null) }
  }

  const empresa = empresas.find(e => e.id === empresaId)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-foreground">Módulos do Portal do Cliente</h2>
          <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            O que o cliente enxerga ao entrar no portal. Desligar um módulo o esconde do
            menu e faz as rotas dele deixarem de responder — não é só a tela.
          </p>
        </div>

        {empresas.length > 0 && (
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger className="h-9 w-[280px] shrink-0 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {empresas.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome} ({e.clientesComPortal} no portal)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {empresa && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          {empresa.clientes} cliente(s) cadastrados · {empresa.clientesComPortal} com acesso ao portal
        </p>
      )}

      {carregando ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : modulos.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          Nenhuma empresa para configurar.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {modulos.map(m => (
            <div
              key={m.slug}
              className={cn(
                'flex items-start gap-3 rounded-lg border border-border p-3',
                !m.implementado && 'bg-muted/20',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-foreground">
                  {m.rotulo}
                  {!m.implementado && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                      ainda não construído
                    </Badge>
                  )}
                  {m.personalizado && (
                    <span className="text-[10px] font-normal text-muted-foreground">
                      (ajustado nesta empresa)
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  {m.descricao}
                </p>
                {/* Ligar o que não existe produziria item de menu que leva a
                    uma página em branco — pior que a ausência. */}
                {!m.implementado && m.liberado && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Ligado, mas sem tela ainda — o cliente não verá nada.
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {m.personalizado && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => voltarAoPadrao(m)}
                    disabled={salvando !== null}
                    title={`Voltar ao padrão (${m.padrao ? 'liberado' : 'bloqueado'})`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                {salvando === m.slug
                  ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  : (
                    <Switch
                      checked={m.liberado}
                      onCheckedChange={v => alternar(m, v)}
                      aria-label={`Liberar ${m.rotulo}`}
                    />
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        A liberação vale por <strong>empresa</strong>, e não por tenant: o portal é
        escopado por cliente → empresa, e as empresas em operação não têm tenant
        vinculado. Muda no próximo acesso do cliente.
      </p>
    </Card>
  )
}
