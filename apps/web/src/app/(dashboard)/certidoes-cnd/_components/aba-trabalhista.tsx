'use client'

import { useCallback } from 'react'
import { FileText, Shield, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SituacaoBadge, ValidadeBadge, STATUS_COR } from '../_lib/ui'
import { carregarClientesMensais, documentosMensais } from '../_lib/api'
import { normalizarLote } from './dialogs'
import { AbaCertidao, type LinhaCertidao } from './aba-certidao'

interface Linha extends LinhaCertidao { tipoCertidao: string | null; numeroCertidao: string | null; dataValidade: string | null }

/** CNDT — Certidão Negativa de Débitos Trabalhistas (TST). */
export function AbaTrabalhista({ refreshKey }: { refreshKey: number }) {
  const listar = useCallback((p: { page: number; limit: number; search?: string; filtroStatus?: string }) =>
    trpc.cnd.trabalhista.list.query(p) as Promise<{ data: Linha[]; total: number }>, [])
  const totais = useCallback(() => trpc.cnd.trabalhista.totalizadores.query() as Promise<Record<string, number>>, [])

  return (
    <AbaCertidao<Linha>
      nome="CNDT" icon={FileText} refreshKey={refreshKey} vazio="Nenhuma CNDT consultada"
      listar={listar} totais={totais}
      indicadores={t => [
        { key: '', label: 'Total', count: t.total ?? 0, cor: STATUS_COR.modulo, icon: Shield },
        { key: 'negativa', label: 'Negativas', count: t.negativas ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
        { key: 'positiva', label: 'Positivas', count: t.positivas ?? 0, cor: STATUS_COR.amber, icon: AlertTriangle },
        { key: 'nao_emitida', label: 'Não emitidas', count: t.naoEmitidas ?? 0, cor: STATUS_COR.red, icon: XCircle },
        { key: 'vigente', label: 'Vigentes', count: t.vigentes ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
        { key: 'vencendo', label: 'Vencendo', count: t.vencendo ?? 0, cor: STATUS_COR.amber, icon: Clock },
        { key: 'vencida', label: 'Vencidas', count: t.vencidas ?? 0, cor: STATUS_COR.red, icon: XCircle },
      ]}
      situacao={r => <SituacaoBadge sucesso={r.sucesso} tipo={r.tipoCertidao} title={r.mensagem || undefined} />}
      colunas={[
        { header: 'Nº certidão', className: 'hidden lg:table-cell font-mono text-muted-foreground whitespace-nowrap', cell: r => r.numeroCertidao || '—' },
        { header: 'Validade', className: 'whitespace-nowrap', cell: r => <ValidadeBadge data={r.dataValidade} /> },
      ]}
      carregarClientes={carregarClientesMensais}
      consultar={async ({ documento, clienteId }) => trpc.cnd.trabalhista.consultar.mutate({ documento, clienteId }) as Promise<{ sucesso: boolean; mensagem: string }>}
      pollEtapa={async () => (await trpc.cnd.trabalhista.consultaEtapa.query() as { etapa: string }).etapa}
      lote={{
        descricao: 'Consultar a CNDT de todos os clientes mensais ativos? Cada consulta passa por captcha no portal do TST.',
        iniciar: async forcarNova => { await trpc.cnd.trabalhista.consultarLote.mutate({ documentos: await documentosMensais(), forcarNova }) },
        progresso: async () => normalizarLote(await trpc.cnd.trabalhista.loteProgress.query() as Record<string, unknown>),
        rotulos: { ok: 'Emitidas', nok: 'Não emitidas' },
        permiteForcar: true,
      }}
      podeVerPdf={r => r.sucesso}
      pdf={{
        titulo: 'CNDT — Certidão Negativa de Débitos Trabalhistas',
        obter: async r => (await trpc.cnd.trabalhista.getPdf.query({ id: r.id }) as { pdfBase64: string | null }).pdfBase64,
        arquivo: r => `cndt-${r.documento}.pdf`,
      }}
      excluir={id => trpc.cnd.trabalhista.delete.mutate({ id })}
      excluirLote={ids => trpc.cnd.trabalhista.deleteLote.mutate({ ids })}
    />
  )
}
