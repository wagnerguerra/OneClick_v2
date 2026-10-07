'use client'

/**
 * Fluxo da CADEIA de serviços (07/10/2026) — do início ao fim, com os
 * encadeamentos, perguntas e blocos. Saiu da aba "Fluxo" do detalhe do serviço
 * (que agora mostra só o fluxo do PRÓPRIO serviço: etapas, sub-etapas e
 * passos) porque confundia os usuários. Abre pelo ⋮ do /servicos, só nos
 * serviços que são início de cadeia. Mesmo editor de antes, com edição.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Loader2, Zap } from 'lucide-react'
import { Button, Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { PageHeaderBar } from '@/components/page-header-bar'
import { BackButton } from '@/components/ui/back-button'
import { FluxoEditor, type FluxoNode, type FluxoEdge } from '../_components/fluxo-editor'
import { FluxoAssistant } from '../_components/fluxo-assistant'

type ApiServico = {
  getFluxo: { query(i: { id: string }): Promise<{ nodes: FluxoNode[]; edges: FluxoEdge[] }> }
  listServicos: { query(): Promise<Array<{ id: string; nome: string }>> }
}

export default function CadeiaDoServicoPage() {
  const { id } = useParams() as { id: string }
  const api = useMemo(() => trpc.servico as unknown as ApiServico, [])
  const [fluxo, setFluxo] = useState<{ nodes: FluxoNode[]; edges: FluxoEdge[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [servicos, setServicos] = useState<Array<{ id: string; nome: string }>>([])
  const [assistOpen, setAssistOpen] = useState(false)

  const carregar = useCallback(async () => {
    try { setFluxo(await api.getFluxo.query({ id })); setErro(null) }
    catch (e) { setErro((e as Error).message) }
  }, [api, id])

  useEffect(() => {
    void carregar()
    api.listServicos.query().then(l => setServicos(l.map(s => ({ id: s.id, nome: s.nome })))).catch(() => setServicos([]))
    // Hand-off do wizard de cadastro: ?assistente=fluxo abre o assistente já aqui.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('assistente') === 'fluxo') {
      setAssistOpen(true)
      window.history.replaceState(null, '', `/servicos/${id}/cadeia`)
    }
  }, [api, carregar, id])

  const nome = fluxo?.nodes.find(n => n.id === id)?.nome ?? ''

  return (
    <div className="space-y-4 pb-6">
      <PageHeaderBar className="mb-0 sm:mb-0" actions={<>
        <Button size="sm" onClick={() => setAssistOpen(true)} className="gap-1.5">
          <Zap className="h-4 w-4" /> Montar com assistente
        </Button>
        <BackButton href={`/servicos/${id}`} title="Voltar para o serviço" />
      </>}>
        <h1 className="truncate">Fluxo da cadeia{nome ? ` — ${nome}` : ''}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/servicos" className="transition-colors hover:text-foreground">Serviços</Link>
          <span className="text-muted-foreground/50">›</span>
          <Link href={`/servicos/${id}`} className="truncate transition-colors hover:text-foreground">{nome || 'Serviço'}</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Cadeia</span>
        </p>
      </PageHeaderBar>

      <p className="text-[11px] text-muted-foreground">
        A sequência completa de serviços a partir deste: o que vem depois, as perguntas que decidem o caminho e os blocos de cada ramo.
      </p>

      <Card>
        <CardContent className="p-4">
          {erro ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Não foi possível carregar a cadeia: {erro}</p>
          ) : !fluxo ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando fluxo...
            </div>
          ) : (
            <FluxoEditor
              key={versao}
              rootId={id}
              nodes={fluxo.nodes}
              edges={fluxo.edges}
              onChanged={async () => { await carregar(); setVersao(v => v + 1) }}
            />
          )}
        </CardContent>
      </Card>

      <FluxoAssistant
        open={assistOpen}
        onOpenChange={setAssistOpen}
        servicoId={id}
        servicoNome={nome}
        servicos={servicos}
        onApplied={async () => { await carregar(); setVersao(v => v + 1) }}
      />
    </div>
  )
}
