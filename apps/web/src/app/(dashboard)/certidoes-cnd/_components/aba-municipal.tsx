'use client'

import { useCallback, useState } from 'react'
import { Landmark, Shield, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Button, cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { TEXT } from '@/lib/color-styles'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { MUNICIPIOS, SituacaoBadge, ValidadeBadge, STATUS_COR } from '../_lib/ui'
import { normalizarLote, type ClienteOpcao } from './dialogs'
import { AbaCertidao, type LinhaCertidao } from './aba-certidao'

interface Linha extends LinhaCertidao { municipio: string; tipoCertidao: string | null; dataValidade: string | null }
interface Detalhes { pdfBase64: string | null; debitos: string[] }

/** CND Municipal — Vitória, Vila Velha, Serra e Cariacica. */
export function AbaMunicipal({ refreshKey }: { refreshKey: number }) {
  const [municipio, setMunicipio] = useState<string>('VITÓRIA')
  const [debitos, setDebitos] = useState<{ cliente: string; itens: string[] } | null>(null)
  const nomeMun = MUNICIPIOS.find(m => m.value === municipio)?.label ?? municipio

  const listar = useCallback((p: { page: number; limit: number; search?: string; filtroStatus?: string }) =>
    trpc.cnd.municipal.list.query({ ...p, municipio }) as Promise<{ data: Linha[]; total: number }>, [municipio])
  const totais = useCallback(() => trpc.cnd.municipal.totalizadores.query({ municipio }) as Promise<Record<string, number>>, [municipio])
  const carregarClientes = useCallback(() => trpc.cnd.municipal.clientesMunicipio.query({ municipio }) as Promise<ClienteOpcao[]>, [municipio])

  async function verDebitos(r: Linha) {
    try {
      const det = await trpc.cnd.municipal.getDetalhes.query({ id: r.id }) as Detalhes
      setDebitos({ cliente: r.razaoSocial || r.documento, itens: det.debitos || [] })
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <>
      <AbaCertidao<Linha>
        // Trocar o município remonta a aba: página, seleção e filtro voltam ao início.
        key={municipio}
        nome={`CND Municipal — ${nomeMun}`} icon={Landmark} refreshKey={refreshKey}
        vazio={`Nenhuma certidão municipal consultada em ${nomeMun}`}
        listar={listar} totais={totais}
        filtros={(
          <Select value={municipio} onValueChange={setMunicipio}>
            <SelectTrigger className="h-8 w-[140px] bg-card text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MUNICIPIOS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        indicadores={t => [
          { key: '', label: 'Total', count: t.total ?? 0, cor: STATUS_COR.primaria, icon: Shield },
          { key: 'negativa', label: 'Negativas', count: t.negativas ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
          { key: 'positiva', label: 'Positivas', count: t.positivas ?? 0, cor: STATUS_COR.amber, icon: AlertTriangle },
          { key: 'nao_emitida', label: 'Não emitidas', count: t.naoEmitidas ?? 0, cor: STATUS_COR.red, icon: XCircle },
          { key: 'vigente', label: 'Vigentes', count: t.vigentes ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
          { key: 'vencendo', label: 'Vencendo', count: t.vencendo ?? 0, cor: STATUS_COR.amber, icon: Clock },
          { key: 'vencida', label: 'Vencidas', count: t.vencidas ?? 0, cor: STATUS_COR.red, icon: XCircle },
        ]}
        situacao={r => <SituacaoBadge sucesso={r.sucesso} tipo={r.tipoCertidao} title={r.mensagem || undefined} />}
        colunas={[
          { header: 'Mensagem', className: 'hidden xl:table-cell max-w-[260px] truncate text-muted-foreground', cell: r => <span title={r.mensagem || ''}>{r.mensagem || '—'}</span> },
          { header: 'Validade', className: 'whitespace-nowrap', cell: r => <ValidadeBadge data={r.dataValidade} /> },
        ]}
        carregarClientes={carregarClientes}
        consultar={async ({ documento, clienteId }) => trpc.cnd.municipal.consultar.mutate({ documento, municipio, clienteId }) as Promise<{ sucesso: boolean; mensagem: string }>}
        pollEtapa={async () => (await trpc.cnd.municipal.consultaEtapa.query() as { etapa: string }).etapa}
        lote={{
          descricao: `Consultar a CND Municipal de todos os clientes mensais de ${nomeMun}?`,
          iniciar: async () => { await trpc.cnd.municipal.consultarLote.mutate({ municipio }) },
          progresso: async () => normalizarLote(await trpc.cnd.municipal.loteProgress.query() as Record<string, unknown>),
          rotulos: { ok: 'Emitidas', nok: 'Não emitidas' },
        }}
        podeVerPdf={r => r.sucesso}
        pdf={{
          titulo: `CND Municipal — ${nomeMun}`,
          obter: async r => (await trpc.cnd.municipal.getDetalhes.query({ id: r.id }) as Detalhes).pdfBase64,
          arquivo: r => `cnd-municipal-${r.municipio.toLowerCase().replace(/\s+/g, '-')}-${r.documento}.pdf`,
        }}
        acoesExtras={r => /positiva/i.test(r.tipoCertidao || '') ? (
          <DropdownMenuItem onClick={() => verDebitos(r)} className="gap-2 text-xs"><AlertTriangle className="h-3.5 w-3.5" />Ver débitos</DropdownMenuItem>
        ) : null}
        excluir={id => trpc.cnd.municipal.delete.mutate({ id })}
        excluirLote={ids => trpc.cnd.municipal.deleteLote.mutate({ ids })}
      />

      <Dialog open={!!debitos} onOpenChange={o => { if (!o) setDebitos(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={AlertTriangle} color="amber">
            <DialogTitle>Pendências — {debitos?.cliente}</DialogTitle>
            <DialogDescription>{debitos?.itens.length ?? 0} débito(s) encontrado(s)</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-1">
            {!debitos?.itens.length ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum débito detalhado</p>
            ) : debitos.itens.map((d, i) => (
              <div key={i} className="flex items-start gap-2 rounded border px-3 py-2 text-xs">
                <XCircle className={cn('mt-0.5 h-3 w-3 shrink-0', TEXT.red)} /><span>{d}</span>
              </div>
            ))}
          </DialogBody>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setDebitos(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
