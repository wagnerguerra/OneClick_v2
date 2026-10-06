'use client'

import { useCallback } from 'react'
import { Shield, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SituacaoBadge, STATUS_COR } from '../_lib/ui'
import { carregarClientesMensais, documentosMensais } from '../_lib/api'
import { normalizarLote } from './dialogs'
import { AbaCertidao, type LinhaCertidao } from './aba-certidao'

interface Linha extends LinhaCertidao { tipoCertidao: string | null; situacao: string | null }

/** CGU — Certidão Negativa Correcional (Entes Privados). */
export function AbaCgu({ refreshKey }: { refreshKey: number }) {
  const listar = useCallback((p: { page: number; limit: number; search?: string; filtroStatus?: string }) =>
    trpc.cnd.cgu.list.query(p) as Promise<{ data: Linha[]; total: number }>, [])
  const totais = useCallback(() => trpc.cnd.cgu.totalizadores.query() as Promise<Record<string, number>>, [])

  return (
    <AbaCertidao<Linha>
      nome="CGU" icon={Shield} refreshKey={refreshKey} vazio="Nenhuma certidão CGU consultada"
      listar={listar} totais={totais}
      indicadores={t => [
        { key: '', label: 'Total', count: t.total ?? 0, cor: STATUS_COR.primaria, icon: Shield },
        { key: 'nada_consta', label: 'Nada consta', count: t.nadaConsta ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
        { key: 'consta', label: 'Consta', count: t.consta ?? 0, cor: STATUS_COR.red, icon: XCircle },
        { key: 'nao_emitida', label: 'Não emitidas', count: t.naoEmitidas ?? 0, cor: STATUS_COR.amber, icon: AlertTriangle },
      ]}
      situacao={r => <SituacaoBadge sucesso={r.sucesso} tipo={r.tipoCertidao} title={r.mensagem || undefined} />}
      colunas={[
        { header: 'Mensagem', className: 'hidden lg:table-cell max-w-[280px] truncate text-muted-foreground', cell: r => <span title={r.mensagem || ''}>{r.mensagem || '—'}</span> },
      ]}
      carregarClientes={carregarClientesMensais}
      consultar={async ({ documento, clienteId }) => trpc.cnd.cgu.consultar.mutate({ documento, clienteId }) as Promise<{ sucesso: boolean; mensagem: string }>}
      pollEtapa={async () => (await trpc.cnd.cgu.consultaEtapa.query() as { etapa: string }).etapa}
      lote={{
        descricao: 'Consultar a certidão correcional da CGU de todos os clientes mensais ativos?',
        iniciar: async forcarNova => { await trpc.cnd.cgu.consultarLote.mutate({ documentos: await documentosMensais(), forcarNova }) },
        progresso: async () => normalizarLote(await trpc.cnd.cgu.loteProgress.query() as Record<string, unknown>),
        rotulos: { ok: 'Nada consta', nok: 'Consta/erro' },
        permiteForcar: true,
      }}
      podeVerPdf={r => r.sucesso}
      pdf={{
        titulo: 'CGU — Certidão Negativa Correcional',
        obter: async r => (await trpc.cnd.cgu.getPdf.query({ id: r.id }) as { pdfBase64: string | null }).pdfBase64,
        arquivo: r => `cgu-${r.documento}.pdf`,
      }}
      excluir={id => trpc.cnd.cgu.delete.mutate({ id })}
      excluirLote={ids => trpc.cnd.cgu.deleteLote.mutate({ ids })}
    />
  )
}
