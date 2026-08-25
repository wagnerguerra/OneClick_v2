'use client'

import { useState } from 'react'
import { ClipboardList, Loader2, Check, CalendarPlus, TriangleAlert } from 'lucide-react'
import {
  Button, Input, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/**
 * Correção das pendências de cadastro sem sair do relatório.
 *
 * As duas pendências que travam os números têm conserto de um campo só: falta
 * a data de admissão (sem ela o prazo legal só sai aproximado) ou falta o
 * primeiro período lançado (sem ele o colaborador não aparece em relatório
 * nenhum). Mandar o usuário até o cadastro de usuários para digitar uma data
 * era o caminho longo — aqui ele resolve na linha.
 *
 * O período sugerido vem calculado do backend (`periodoAquisitivoSugerido`):
 * a regra do aquisitivo é uma só, e não vale reescrevê-la na tela.
 */

export interface PendenciaAdmissao {
  colaboradorId: string | null
  nome: string
  area: string | null
}

export interface PendenciaPeriodo {
  colaboradorId: string | null
  nome: string
  area: string | null
  admissao: string | null
  sugestao: { periodoInicial: number; periodoFinal: number } | null
}

type Aba = 'admissao' | 'periodo'

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export function PendenciasModal({ aberto, abaInicial, semAdmissao, semPeriodo, onFechar, onAtualizado }: {
  aberto: boolean
  abaInicial: Aba
  semAdmissao: PendenciaAdmissao[]
  semPeriodo: PendenciaPeriodo[]
  onFechar: () => void
  /** Recarrega o painel — as listas chegam por prop, então a fonte é uma só. */
  onAtualizado: () => void
}) {
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [datas, setDatas] = useState<Record<string, string>>({})
  const [anos, setAnos] = useState<Record<string, { ini: string; fim: string; dias: string }>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [lote, setLote] = useState(false)

  const anoAtual = new Date().getFullYear()

  function camposPeriodo(p: PendenciaPeriodo) {
    const id = p.colaboradorId ?? p.nome
    return anos[id] ?? {
      ini: String(p.sugestao?.periodoInicial ?? anoAtual - 1),
      fim: String(p.sugestao?.periodoFinal ?? anoAtual),
      dias: '30',
    }
  }

  function setCampoPeriodo(id: string, patch: Partial<{ ini: string; fim: string; dias: string }>, base: { ini: string; fim: string; dias: string }) {
    setAnos((prev) => ({ ...prev, [id]: { ...base, ...patch } }))
  }

  async function salvarAdmissao(p: PendenciaAdmissao) {
    if (!p.colaboradorId) return
    const valor = datas[p.colaboradorId]
    if (!valor) { alerts.error('Informe a data', 'Preencha a data de admissão antes de salvar.'); return }
    setSalvando(p.colaboradorId)
    try {
      await (trpc as any).controleFerias.definirAdmissao.mutate({ colaboradorId: p.colaboradorId, dataAdmissao: valor })
      alerts.success('Admissão registrada', `${p.nome}: ${dataBR(valor)}.`)
      onAtualizado()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(null) }
  }

  async function lancarPeriodo(p: PendenciaPeriodo) {
    if (!p.colaboradorId) return
    const id = p.colaboradorId
    const c = camposPeriodo(p)
    if (Number(c.fim) < Number(c.ini)) { alerts.error('Anos invertidos', 'O ano final não pode ser menor que o inicial.'); return }
    setSalvando(id)
    try {
      await (trpc as any).controleFerias.criar.mutate({
        colaboradorId: id,
        periodoInicial: Number(c.ini),
        periodoFinal: Number(c.fim),
        dias: Number(c.dias) || 30,
        saldoAnterior: 0,
        descricao: 'PERÍODO AQUISITIVO',
      })
      alerts.success('Período lançado', `${p.nome}: ${c.ini}/${c.fim}.`)
      onAtualizado()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(null) }
  }

  /** Lança de uma vez só quem tem sugestão — quem está sem admissão fica de fora. */
  async function lancarTodosSugeridos() {
    const alvos = semPeriodo.filter((p) => p.colaboradorId && p.sugestao)
    if (!alvos.length) return
    const ok = await alerts.confirm({
      title: `Lançar ${alvos.length} período(s) aquisitivo(s)?`,
      text: 'Um período de 30 dias para cada colaborador, com os anos sugeridos pela data de admissão.',
      icon: 'question', confirmText: 'Lançar',
    })
    if (!ok) return
    setLote(true)
    let criados = 0
    for (const p of alvos) {
      const c = camposPeriodo(p)
      try {
        await (trpc as any).controleFerias.criar.mutate({
          colaboradorId: p.colaboradorId,
          periodoInicial: Number(c.ini),
          periodoFinal: Number(c.fim),
          dias: Number(c.dias) || 30,
          saldoAnterior: 0,
          descricao: 'PERÍODO AQUISITIVO',
        })
        criados++
      } catch { /* segue com os demais; o que falhar continua na lista */ }
    }
    setLote(false)
    alerts.success('Períodos lançados', `${criados} de ${alvos.length} criados.`)
    onAtualizado()
  }

  const semSugestao = semPeriodo.filter((p) => !p.sugestao).length

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !salvando && !lote) onFechar() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeaderIcon icon={ClipboardList} color="amber">
          <DialogTitle>Pendências de cadastro</DialogTitle>
          <DialogDescription>Resolva aqui mesmo — o relatório recalcula a cada correção.</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-3">
          <div className="flex flex-wrap gap-1.5 border-b border-border">
            {([
              { id: 'admissao' as const, label: `Sem data de admissão (${semAdmissao.length})` },
              { id: 'periodo' as const, label: `Sem período lançado (${semPeriodo.length})` },
            ]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAba(t.id)}
                className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  aba === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Data de admissão ── */}
          {aba === 'admissao' && (
            semAdmissao.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma pendência. Todos os ativos têm data de admissão.</p>
            ) : (
              <div className="nice-scrollbar max-h-[380px] overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Colaborador</th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Área</th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Data de admissão</th>
                      <th className="w-[90px] px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {semAdmissao.map((p) => {
                      const id = p.colaboradorId ?? p.nome
                      return (
                        <tr key={id} className="border-b border-border/50">
                          <td className="px-3 py-1.5 font-medium">{p.nome}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{p.area ?? '—'}</td>
                          <td className="px-3 py-1.5">
                            <Input
                              type="date"
                              value={datas[id] ?? ''}
                              onChange={(e) => setDatas((prev) => ({ ...prev, [id]: e.target.value }))}
                              className="h-8 w-[150px] text-xs"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Button
                              variant="success" size="xs" className="gap-1"
                              disabled={salvando === id || !datas[id]}
                              onClick={() => salvarAdmissao(p)}
                            >
                              {salvando === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Salvar
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Período aquisitivo ── */}
          {aba === 'periodo' && (
            semPeriodo.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma pendência. Todos os ativos têm período lançado.</p>
            ) : (
              <div className="space-y-2">
                {semSugestao > 0 && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                    {semSugestao} colaborador(es) estão sem data de admissão, então os anos não puderam ser sugeridos — confira antes de lançar (ou preencha a admissão na outra aba).
                  </p>
                )}
                <div className="nice-scrollbar max-h-[360px] overflow-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Colaborador</th>
                        <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Admissão</th>
                        <th className="px-3 py-2 text-center font-semibold uppercase tracking-wider">Ano inicial</th>
                        <th className="px-3 py-2 text-center font-semibold uppercase tracking-wider">Ano final</th>
                        <th className="px-3 py-2 text-center font-semibold uppercase tracking-wider">Dias</th>
                        <th className="w-[100px] px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {semPeriodo.map((p) => {
                        const id = p.colaboradorId ?? p.nome
                        const c = camposPeriodo(p)
                        return (
                          <tr key={id} className="border-b border-border/50">
                            <td className="px-3 py-1.5">
                              <span className="font-medium">{p.nome}</span>
                              {p.area && <span className="ml-1.5 text-muted-foreground">· {p.area}</span>}
                            </td>
                            <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                              {p.admissao ? dataBR(p.admissao) : <Badge variant="outline" className="text-[9px]">sem admissão</Badge>}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <Input type="number" value={c.ini} onChange={(e) => setCampoPeriodo(id, { ini: e.target.value }, c)} className="h-8 w-[80px] text-center text-xs" />
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <Input type="number" value={c.fim} onChange={(e) => setCampoPeriodo(id, { fim: e.target.value }, c)} className="h-8 w-[80px] text-center text-xs" />
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <Input type="number" value={c.dias} onChange={(e) => setCampoPeriodo(id, { dias: e.target.value }, c)} className="h-8 w-[64px] text-center text-xs" min="0" max="60" />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <Button
                                variant="success" size="xs" className="gap-1"
                                disabled={salvando === id || lote}
                                onClick={() => lancarPeriodo(p)}
                              >
                                {salvando === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                                Lançar
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </DialogBody>

        <DialogFooter>
          {aba === 'periodo' && semPeriodo.some((p) => p.sugestao) && (
            <Button variant="outline" size="sm" className="mr-auto gap-1.5" disabled={lote || !!salvando} onClick={lancarTodosSugeridos}>
              {lote ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Lançar todos os sugeridos ({semPeriodo.filter((p) => p.sugestao).length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onFechar} disabled={!!salvando || lote}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
