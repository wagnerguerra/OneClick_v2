'use client'

// Painel "Alterações propostas" — ambiente de colaboração do simulador.
//
// O ASSISTENTE anota aqui as mudanças propostas (editando PROPOSED_CHANGES).
// O USUÁRIO marca (multi-seleção) quais devem ser processadas (aplicadas no app
// real, apps/mobile). A seleção é persistida em localStorage e pode ser copiada
// pra comunicar ao assistente. Quando uma alteração é aplicada no app real, o
// assistente muda o status para 'processada'.

import { useEffect, useState } from 'react'
import { Card, CardContent, Badge, Button, cn } from '@saas/ui'
import { ClipboardList, Copy, Check, CheckCircle2 } from 'lucide-react'

export type ChangeStatus = 'proposta' | 'processada'
export type ProposedChange = {
  id: string
  area: string
  titulo: string
  descricao: string
  status: ChangeStatus
}

// ── Registro de alterações (mantido pelo assistente) ─────────────────
export const PROPOSED_CHANGES: ProposedChange[] = [
  {
    id: 'dash-cards-linha',
    area: 'Dashboard',
    titulo: 'Cards (KPIs) em uma única linha',
    descricao:
      'No dashboard, exibir os cards de indicadores (Eventos, Tarefas, Chamados) lado a lado em uma linha, em vez de empilhados verticalmente. Já visível no protótipo.',
    status: 'proposta',
  },
  {
    id: 'dash-card-helpdesk',
    area: 'Dashboard',
    titulo: 'Card de Helpdesk condicionado à permissão',
    descricao:
      'Incluir o card "Chamados abertos" (e o atalho Helpdesk) apenas quando o usuário tem permissão no módulo Helpdesk. Use o toggle "Permissão: Helpdesk" para simular.',
    status: 'proposta',
  },
  {
    id: 'tabs-transicao-animada',
    area: 'Navegação',
    titulo: 'Animação suave na transição entre abas/telas',
    descricao:
      'Aplicar uma transição suave (fade + leve slide) ao trocar de aba/tela no app, em vez da troca instantânea. Já demonstrado no protótipo: navegue entre as telas para ver.',
    status: 'proposta',
  },
  {
    id: 'nova-identidade-visual',
    area: 'Identidade visual',
    titulo: 'Nova identidade visual (azul + coral + amarelo, bottom tab bar)',
    descricao:
      'Aplica a nova paleta (azul vibrante primário, acentos coral e amarelo), barra de navegacao inferior, card hero com anel de progresso e estilo de cards arredondados, conforme referencia aprovada.',
    status: 'proposta',
  },
]

const LS_KEY = 'oneclick.app-mobile.changes.selected'

export function ChangesPanel() {
  const [selected, setSelected] = useState<string[]>([])
  const [copiado, setCopiado] = useState(false)

  // Restaura a seleção salva (sobrevive a reloads).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) setSelected(JSON.parse(raw) as string[])
    } catch {
      /* ignore */
    }
  }, [])

  // Persiste a cada mudança.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(selected))
    } catch {
      /* ignore */
    }
  }, [selected])

  const pendentes = PROPOSED_CHANGES.filter((c) => c.status === 'proposta')
  const selPendentes = selected.filter((id) => pendentes.some((c) => c.id === id))
  const todasMarcadas = pendentes.length > 0 && selPendentes.length === pendentes.length

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function toggleTodas() {
    setSelected(todasMarcadas ? [] : pendentes.map((c) => c.id))
  }
  async function copiarSelecao() {
    const txt = PROPOSED_CHANGES.filter((c) => selPendentes.includes(c.id))
      .map((c) => `- [${c.area}] ${c.titulo}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(`Processar estas alterações:\n${txt}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Cabeçalho do painel */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <ClipboardList className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Alterações propostas</h3>
              <p className="text-[11px] text-muted-foreground">
                Marque as que devo processar (aplicar no app real). Você pode selecionar mais de uma.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleTodas} disabled={pendentes.length === 0}>
              {todasMarcadas ? 'Desmarcar tudo' : 'Selecionar tudo'}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={copiarSelecao} disabled={selPendentes.length === 0}>
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Copiado!' : `Marcar p/ processar (${selPendentes.length})`}
            </Button>
          </div>
        </div>

        {/* Lista de alterações */}
        <div className="space-y-2">
          {PROPOSED_CHANGES.map((ch) => {
            const processada = ch.status === 'processada'
            const marcada = selected.includes(ch.id)
            return (
              <label
                key={ch.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  processada
                    ? 'border-border bg-muted/30 opacity-70'
                    : marcada
                      ? 'border-violet-400/60 bg-violet-500/5 cursor-pointer'
                      : 'border-border hover:bg-muted/40 cursor-pointer',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-violet-600"
                  checked={marcada}
                  disabled={processada}
                  onChange={() => toggle(ch.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="h-5 text-[10px]">{ch.area}</Badge>
                    <span className="text-sm font-semibold text-foreground">{ch.titulo}</span>
                    {processada ? (
                      <Badge className="h-5 text-[10px] gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0">
                        <CheckCircle2 className="h-3 w-3" /> Processada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="h-5 text-[10px] border-amber-400/50 text-amber-600 dark:text-amber-400">
                        Proposta
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{ch.descricao}</p>
                </div>
              </label>
            )
          })}
          {PROPOSED_CHANGES.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma alteração registrada ainda.</p>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
          Depois de marcar, clique em <strong>Marcar p/ processar</strong> (copia a lista) e cole no chat,
          ou apenas diga ao assistente quais marcou. As aplicadas no app real ficam como
          <span className="text-emerald-600 dark:text-emerald-400 font-medium"> Processada</span>.
        </p>
      </CardContent>
    </Card>
  )
}
