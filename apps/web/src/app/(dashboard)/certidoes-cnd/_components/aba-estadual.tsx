'use client'

import { useCallback } from 'react'
import { MapPin, Shield, CheckCircle2, XCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SituacaoBadge, STATUS_COR } from '../_lib/ui'
import { carregarClientesMensais, documentosMensais } from '../_lib/api'
import { normalizarLote } from './dialogs'
import { AbaCertidao, type LinhaCertidao } from './aba-certidao'

interface Linha extends LinhaCertidao { uf: string; temPdf: boolean }

/** CND Estadual — SEFAZ ES. */
export function AbaEstadual({ refreshKey }: { refreshKey: number }) {
  const listar = useCallback((p: { page: number; limit: number; search?: string }) =>
    trpc.cnd.estadual.list.query({ page: p.page, limit: p.limit, search: p.search }) as Promise<{ data: Linha[]; total: number }>, [])
  const totais = useCallback(() => trpc.cnd.estadual.totalizadores.query() as Promise<Record<string, number>>, [])

  return (
    <AbaCertidao<Linha>
      nome="CND Estadual" icon={MapPin} refreshKey={refreshKey} vazio="Nenhuma certidão estadual consultada"
      listar={listar} totais={totais}
      // O endpoint estadual não filtra por situação: os indicadores só informam.
      indicadoresFiltram={false}
      indicadores={t => [
        { key: '', label: 'Total', count: t.total ?? 0, cor: STATUS_COR.modulo, icon: Shield },
        { key: 'emitidas', label: 'Emitidas', count: t.emitidas ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
        { key: 'nao_emitidas', label: 'Não emitidas', count: t.naoEmitidas ?? 0, cor: STATUS_COR.red, icon: XCircle },
      ]}
      situacao={r => <SituacaoBadge sucesso={r.sucesso} tipo={r.sucesso ? 'Emitida' : null} title={r.mensagem || undefined} />}
      colunas={[
        { header: 'Mensagem', className: 'hidden lg:table-cell max-w-[280px] truncate text-muted-foreground', cell: r => <span title={r.mensagem || ''}>{r.mensagem || '—'}</span> },
      ]}
      carregarClientes={carregarClientesMensais}
      consultar={async ({ documento, clienteId }) => trpc.cnd.estadual.consultar.mutate({ documento, clienteId }) as Promise<{ sucesso: boolean; mensagem: string }>}
      lote={{
        descricao: 'Consultar a CND Estadual (SEFAZ ES) de todos os clientes mensais ativos? Cada consulta leva ~20-30s (captcha + SEFAZ).',
        iniciar: async forcarNova => { await trpc.cnd.estadual.consultarLote.mutate({ documentos: await documentosMensais(), forcarNova }) },
        progresso: async () => normalizarLote(await trpc.cnd.estadual.loteProgress.query() as Record<string, unknown>),
        rotulos: { ok: 'Emitidas', nok: 'Não emitidas' },
        permiteForcar: true,
      }}
      podeVerPdf={r => r.temPdf}
      pdf={{
        titulo: 'CND Estadual — SEFAZ ES',
        obter: async r => await trpc.cnd.estadual.getPdf.query({ id: r.id }) as string | null,
        arquivo: r => `cnd-estadual-es-${r.documento}.pdf`,
      }}
      excluir={id => trpc.cnd.estadual.delete.mutate({ id })}
      excluirLote={ids => trpc.cnd.estadual.deleteLote.mutate({ ids })}
    />
  )
}
