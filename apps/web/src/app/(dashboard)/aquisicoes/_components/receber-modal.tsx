'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileCheck2, Loader2, PackageCheck, Paperclip, X } from 'lucide-react'
import {
  Button, Input, Label, Checkbox, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'

/** NF lida do DANFE anexado (compra.lerNfDoAnexo). */
interface NfLida { anexoId: string; leitura: string | null; numero: string | null; valor: number | null; emitente: string | null }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Registrar uma entrega do pedido — o recebimento é POR ITEM (25/09/2026).
 *
 * Quem compra N coisas recebe em datas diferentes, às vezes parte da quantidade
 * de um mesmo item. Aqui se marca o que chegou nesta entrega, quanto de cada
 * um, o dia e a nota. O pedido fica "Recebido parcialmente" até o último item
 * completar. Regras (e o limite de não receber mais do que falta) no backend,
 * em compra/recebimento.ts.
 */

export interface ItemParaReceber {
  id: string
  descricao: string
  unidade: string | null
  quantidade: number
  quantidadeRecebida: number
}

const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export function ReceberModal({ open, compraId, codigo, itens, itemInicial, onClose, onDone }: {
  open: boolean
  compraId: string
  codigo: number
  itens: ItemParaReceber[]
  /** Aberto pela linha de um item: só ele vem marcado. */
  itemInicial?: string | null
  onClose: () => void
  onDone: () => void
}) {
  const pendentes = useMemo(() => itens.filter(i => i.quantidade - i.quantidadeRecebida > 0), [itens])
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [qtd, setQtd] = useState<Record<string, string>>({})
  const [data, setData] = useState(hojeIso())
  const [nf, setNf] = useState('')
  const [nfValor, setNfValor] = useState('')
  // DANFE anexado nesta entrega: vira anexo do pedido e é lido na hora.
  const [danfe, setDanfe] = useState<{ nome: string; lida: NfLida } | null>(null)
  const [lendo, setLendo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!open) return
    const m: Record<string, boolean> = {}
    const q: Record<string, string> = {}
    for (const i of pendentes) {
      m[i.id] = itemInicial ? i.id === itemInicial : true
      q[i.id] = String(i.quantidade - i.quantidadeRecebida)
    }
    setMarcados(m); setQtd(q); setData(hojeIso()); setNf(''); setNfValor(''); setDanfe(null); setObs('')
  }, [open, pendentes, itemInicial])

  const selecionados = pendentes.filter(i => marcados[i.id])
  const problema = selecionados.map(i => {
    const n = Number(qtd[i.id])
    const falta = i.quantidade - i.quantidadeRecebida
    if (!Number.isInteger(n) || n <= 0) return `Quantidade inválida em "${i.descricao}".`
    if (n > falta) return `"${i.descricao}": faltam ${falta}.`
    return null
  }).find(Boolean)

  const todos = pendentes.length > 0 && selecionados.length === pendentes.length

  /**
   * Anexa o DANFE (PDF) e lê número, valor e vendedor para preencher os campos.
   * O arquivo fica nos anexos do pedido mesmo que a leitura falhe.
   */
  async function anexarNf(file: File) {
    setLendo(true)
    try {
      const fd = new FormData(); fd.append('file', file, file.name)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
      const up = await res.json() as { url: string }
      const nomesItens = selecionados.map(i => i.descricao).join(', ')
      const anexo = await (trpc.compra as any).addAnexo.mutate({
        compraId, fileUrl: up.url, fileName: file.name, mimeType: file.type || undefined, tamanho: file.size,
        descricao: `NF do recebimento${nomesItens ? ` — ${nomesItens.slice(0, 120)}` : ''}`,
      }) as { id: string }
      const lida: NfLida = await (trpc.compra as any).lerNfDoAnexo.mutate({ anexoId: anexo.id })
      setDanfe({ nome: file.name, lida })
      if (lida.leitura === 'lido') {
        if (lida.numero) setNf(lida.numero)
        if (lida.valor != null) setNfValor(String(lida.valor))
      }
    } catch (e) {
      alerts.error('Erro ao anexar a NF', (e as Error).message)
    } finally {
      setLendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function registrar() {
    if (!selecionados.length || problema || !data) return
    setSalvando(true)
    try {
      await (trpc.compra as any).receberItens.mutate({
        compraId,
        data,
        nfNumero: nf.trim() || undefined,
        nfValor: nfValor.trim() && Number(nfValor) >= 0 ? Number(nfValor) : undefined,
        anexoId: danfe?.lida.anexoId,
        observacao: obs.trim() || undefined,
        itens: selecionados.map(i => ({ itemId: i.id, quantidade: Number(qtd[i.id]) })),
      })
      alerts.success('Recebimento registrado', `${selecionados.length} item(ns) do pedido #${codigo}.`)
      onDone()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[760px]">
        <DialogHeaderIcon icon={PackageCheck} color="indigo">
          <DialogTitle className="text-[15px]">Registrar recebimento — Pedido #{codigo}</DialogTitle>
          <DialogDescription className="text-[11px]">
            Marque o que chegou nesta entrega e quanto de cada item. O restante continua pendente.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Data do recebimento</Label>
              <Input type="date" className="h-9 text-sm" value={data} max={hojeIso()} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Nota fiscal <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input className="h-9 text-sm" value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Número da NF" />
            </div>
            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Valor da NF (R$)</Label>
              <Input type="number" step="0.01" min={0} className="h-9 text-sm tabular-nums" value={nfValor} onChange={(e) => setNfValor(e.target.value)} placeholder="0,00" />
            </div>

            {/* DANFE: anexar já preenche número e valor */}
            <div className="col-span-12">
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) anexarNf(f) }} />
              {!danfe ? (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={lendo}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-60">
                  {lendo ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Paperclip className="h-4 w-4 shrink-0" />}
                  {lendo ? 'Anexando e lendo a nota…' : 'Anexar a NF desta entrega (PDF do DANFE) — número e valor são preenchidos sozinhos'}
                </button>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 text-[12px]">
                    <p className="truncate font-medium" title={danfe.nome}>{danfe.nome}</p>
                    <p className="text-muted-foreground">
                      {danfe.lida.leitura === 'lido'
                        ? <>NF {danfe.lida.numero}{danfe.lida.valor != null ? ` · ${brl(danfe.lida.valor)}` : ''}{danfe.lida.emitente ? ` · ${danfe.lida.emitente}` : ''} — conferida a partir do PDF.</>
                        : 'Anexada aos arquivos do pedido, mas não deu para ler a nota — preencha o número e o valor.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setDanfe(null)} title="Desvincular desta entrega (o arquivo continua nos anexos)"
                    className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          </div>

          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Todos os itens já foram recebidos.</p>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={todos} onCheckedChange={(v) => setMarcados(Object.fromEntries(pendentes.map(i => [i.id, v === true])))} aria-label="Marcar todos" />
                    </TableHead>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs text-center">Pedido</TableHead>
                    <TableHead className="text-xs text-center">Já recebido</TableHead>
                    <TableHead className="text-xs text-center w-[120px]">Chegou agora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendentes.map((i) => {
                    const falta = i.quantidade - i.quantidadeRecebida
                    return (
                      <TableRow key={i.id} className={cn(!marcados[i.id] && 'opacity-60')}>
                        <TableCell>
                          <Checkbox checked={!!marcados[i.id]} onCheckedChange={(v) => setMarcados(m => ({ ...m, [i.id]: v === true }))} aria-label={`Recebido: ${i.descricao}`} />
                        </TableCell>
                        <TableCell className="text-xs font-medium">{i.descricao}</TableCell>
                        <TableCell className="text-xs text-center tabular-nums">{i.quantidade} {i.unidade ?? ''}</TableCell>
                        <TableCell className="text-xs text-center tabular-nums text-muted-foreground">{i.quantidadeRecebida}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number" min={1} max={falta} step={1}
                            className="h-8 w-[96px] text-sm text-center tabular-nums mx-auto"
                            value={qtd[i.id] ?? ''}
                            disabled={!marcados[i.id]}
                            onChange={(e) => setQtd(q => ({ ...q, [i.id]: e.target.value }))}
                            aria-label={`Quantidade recebida de ${i.descricao}`}
                          />
                          <p className="text-[10px] text-muted-foreground mt-0.5">faltam {falta}</p>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
              placeholder="Avaria, divergência, quem entregou..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          {problema && <p className="text-xs text-destructive">{problema}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button size="sm" onClick={registrar} disabled={salvando || lendo || !selecionados.length || !!problema || !data}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Registrar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
