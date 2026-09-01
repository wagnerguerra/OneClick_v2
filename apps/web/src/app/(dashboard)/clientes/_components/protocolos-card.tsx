'use client'

/**
 * Protocolos do cliente — comprovante dos documentos que ele entregou.
 *
 * Port da aba "Protocolos" do v1 (`cad_cli_pro`). O card anterior falava de
 * protocolo em ÓRGÃO PÚBLICO (órgão, nº, resultado): um esqueleto que nunca
 * recebeu uma linha em produção, com campos que ninguém preenchia.
 *
 * As regras vêm do `tab-prt.asp`: receber, editar e excluir só existem enquanto
 * o protocolo está a receber; depois de recebido resta imprimir, porque aí ele
 * é um papel assinado. Editar mexe só nos documentos — nº e data ficam como
 * foram impressos.
 *
 * O nº é POR CLIENTE e sai impresso no comprovante, então a numeração continua
 * a do v1: quem tinha 72 protocolos recebe o 73.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileInput, Plus, Loader2, Trash2, Check, Clock, ChevronDown,
  Printer, Pencil, Inbox, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Button, Card, Input, Badge, cn, RichEditor, RichContent } from '@saas/ui'
import { MioloColapsavel } from './card-colapsavel'
import { ProtocoloPrintModal } from './protocolo-print-modal'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useClientesPerms } from './use-clientes-perms'

interface Protocolo {
  id: string
  numero: number
  data: string
  documentos: string | null
  recebido: boolean
  recebidoEm: string | null
  usuarioNomeResolvido: string | null
  legacyId: number | null
}

/** Quantos por página. Cliente antigo chega a 72 protocolos — a lista inteira
 *  empurrava o resto da ficha para muito abaixo da dobra. */
const POR_PAGINA = 8

const dataBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/** Hoje em `yyyy-mm-dd`, para o campo `date` já abrir preenchido. */
const hojeISO = () => new Date().toISOString().slice(0, 10)

export function ProtocolosCard({ clienteId }: { clienteId: string }) {
  const [cardAberto, setCardAberto] = useState(true)
  const { canManageProtocolos } = useClientesPerms()

  const [items, setItems] = useState<Protocolo[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)
  const [imprimindo, setImprimindo] = useState<string | null>(null)

  const [novo, setNovo] = useState(false)
  const [fData, setFData] = useState(hojeISO())
  const [fDocs, setFDocs] = useState('')
  /** Protocolo em edição — no v1 só os documentos mudam. */
  const [editando, setEditando] = useState<string | null>(null)
  const [eDocs, setEDocs] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    try { setItems(await (trpc.cliente as never as {
      listProtocolos: { query: (i: { clienteId: string }) => Promise<Protocolo[]> }
    }).listProtocolos.query({ clienteId })) }
    catch { /* silencioso: o card não pode derrubar a ficha */ }
    finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { carregar() }, [carregar])

  const totalPaginas = Math.max(1, Math.ceil(items.length / POR_PAGINA))
  // Excluir o último item de uma página deixaria a paginação num vazio.
  useEffect(() => { if (pagina > totalPaginas) setPagina(totalPaginas) }, [pagina, totalPaginas])
  const visiveis = useMemo(
    () => items.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
    [items, pagina],
  )

  async function incluir() {
    if (!fData) { alerts.error('Falta a data', 'Informe a data do protocolo.'); return }
    setSalvando(true)
    try {
      await (trpc.cliente as never as {
        addProtocolo: { mutate: (i: unknown) => Promise<{ numero: number }> }
      }).addProtocolo.mutate({ clienteId, data: fData, documentos: fDocs || null })
      setNovo(false); setFDocs(''); setFData(hojeISO()); setPagina(1)
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  /**
   * Receber é de mão única, como no v1: a partir daí o protocolo está assinado
   * e sai do alcance de editar e excluir. Daí a confirmação.
   */
  async function receber(p: Protocolo) {
    const ok = await alerts.confirm({
      title: `Marcar o protocolo nº ${p.numero} como recebido?`,
      text: 'Depois de recebido ele não pode mais ser editado nem excluído — só impresso.',
      icon: 'question', confirmText: 'Receber',
    })
    if (!ok) return
    try {
      await (trpc.cliente as never as {
        updateProtocolo: { mutate: (i: unknown) => Promise<unknown> }
      }).updateProtocolo.mutate({ id: p.id, recebido: true })
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function salvarEdicao(p: Protocolo) {
    setSalvando(true)
    try {
      await (trpc.cliente as never as {
        updateProtocolo: { mutate: (i: unknown) => Promise<unknown> }
      }).updateProtocolo.mutate({ id: p.id, documentos: eDocs || null })
      setEditando(null)
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function excluir(p: Protocolo) {
    const ok = await alerts.confirm({
      title: `Excluir o protocolo nº ${p.numero}?`,
      text: 'Ele sai da ficha, mas o registro é preservado no banco.',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.cliente as never as {
        removeProtocolo: { mutate: (i: { id: string }) => Promise<unknown> }
      }).removeProtocolo.mutate({ id: p.id })
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const pendentes = items.filter(i => !i.recebido).length

  return (
    <Card className="overflow-hidden">
      {/* O "Adicionar" fica no cabeçalho, ao lado do título. Não pode ser um
          botão DENTRO do botão que abre o card (HTML inválido), então quem
          alterna é o bloco do título e o Adicionar vive fora dele. */}
      <div className="flex items-center gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => setCardAberto(v => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <FileInput className="h-4 w-4 shrink-0" style={{ color: 'var(--mod-cadastros, #10b981)' }} />
          <span className="text-[13px] font-semibold text-foreground">Protocolos</span>
          {items.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">{items.length}</Badge>
          )}
          {pendentes > 0 && (
            <Badge variant="outline" className="h-4 shrink-0 gap-1 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
              <Clock className="h-3 w-3" />{pendentes} a receber
            </Badge>
          )}
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !cardAberto && '-rotate-90')} />
        </button>

        {canManageProtocolos && (
          <Button type="button"
            variant="success" size="sm" className="shrink-0"
            onClick={() => { setCardAberto(true); setNovo(true) }}
          >
            <Plus className="h-4 w-4" />Adicionar
          </Button>
        )}
      </div>

      <MioloColapsavel aberto={cardAberto}>
        <div className="border-t border-border px-5 pb-4 pt-4">
          {novo && (
            <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-[13px] font-semibold">Data</label>
                  <Input type="date" value={fData} onChange={e => setFData(e.target.value)} className="mt-1.5 h-9 w-[160px] text-sm" />
                </div>
                <p className="pb-2 text-[11px] text-muted-foreground">O nº sai do próximo livre deste cliente.</p>
              </div>
              <div>
                <label className="text-[13px] font-semibold">Documentos entregues</label>
                <div className="mt-1.5">
                  <RichEditor value={fDocs} onChange={setFDocs} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setNovo(false)}>Cancelar</Button>
                <Button type="button" variant="success" size="sm" onClick={incluir} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Nenhum protocolo registrado.</p>
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {visiveis.map(p => (
                  <div key={p.id} className="py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{p.numero}</span>
                      {p.recebido ? (
                        <Badge variant="outline" className="h-5 shrink-0 gap-1 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                          <Check className="h-3 w-3" />Recebido
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-5 shrink-0 gap-1 border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                          <Clock className="h-3 w-3" />A receber
                        </Badge>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {p.usuarioNomeResolvido ?? '—'}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{dataBR(p.data)}</span>
                      {p.documentos && (
                        <button
                          type="button"
                          onClick={() => setAberto(a => (a === p.id ? null : p.id))}
                          className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {aberto === p.id ? 'ocultar' : 'documentos'}
                        </button>
                      )}
                      {/* Ordem e disponibilidade como no v1. */}
                      <div className="flex shrink-0 gap-1">
                        {canManageProtocolos && !p.recebido && (
                          <>
                            <Button type="button" variant="soft-success" size="icon-sm" onClick={() => receber(p)} title="Receber">
                              <Inbox className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button"
                              variant="soft-info" size="icon-sm" title="Editar os documentos"
                              onClick={() => { setEditando(p.id); setEDocs(p.documentos ?? ''); setAberto(null) }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setImprimindo(p.id)} title="Imprimir">
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        {canManageProtocolos && !p.recebido && (
                          <Button type="button" variant="soft-destructive" size="icon-sm" onClick={() => excluir(p)} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {editando === p.id ? (
                      <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/20 p-3">
                        <label className="text-[13px] font-semibold">Documentos entregues</label>
                        <RichEditor value={eDocs} onChange={setEDocs} />
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
                          <Button type="button" variant="success" size="sm" onClick={() => salvarEdicao(p)} disabled={salvando}>
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                          </Button>
                        </div>
                      </div>
                    ) : aberto === p.id && p.documentos ? (
                      <div className="mt-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
                        <RichContent html={p.documentos} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {totalPaginas > 1 && (
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, items.length)} de {items.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button type="button"
                      variant="outline" size="icon-xs" disabled={pagina === 1}
                      onClick={() => setPagina(p => p - 1)} title="Anterior"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-1 text-[11px] tabular-nums text-muted-foreground">{pagina} / {totalPaginas}</span>
                    <Button type="button"
                      variant="outline" size="icon-xs" disabled={pagina === totalPaginas}
                      onClick={() => setPagina(p => p + 1)} title="Próxima"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </MioloColapsavel>

      <ProtocoloPrintModal protocoloId={imprimindo} onClose={() => setImprimindo(null)} />
    </Card>
  )
}
