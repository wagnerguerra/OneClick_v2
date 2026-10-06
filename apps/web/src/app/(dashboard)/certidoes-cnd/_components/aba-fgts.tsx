'use client'

import { useCallback } from 'react'
import { DollarSign, Shield, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SituacaoBadge, ValidadeBadge, STATUS_COR } from '../_lib/ui'
import { carregarClientesMensais, documentosMensais } from '../_lib/api'
import { normalizarLote } from './dialogs'
import { AbaCertidao, type LinhaCertidao } from './aba-certidao'

interface Linha extends LinhaCertidao { tipoCertidao: string | null; numeroCertificado: string | null; dataValidade: string | null }

/**
 * Quando a Caixa não entrega o PDF oficial, a rotina grava uma captura da
 * tela do portal (`origemPdf: 'captura_tela'`) — serve de comprovante, mas
 * não é o certificado. A tela avisa nos dois lugares em que o PDF aparece.
 */
const AVISO_CAPTURA = 'O PDF é uma captura da tela do portal da Caixa, não o certificado oficial. Para o documento oficial, emita o CRF no portal.'

/** CRF — Certificado de Regularidade do FGTS (Caixa). */
export function AbaFgts({ refreshKey }: { refreshKey: number }) {
  const listar = useCallback((p: { page: number; limit: number; search?: string; filtroStatus?: string }) =>
    trpc.cnd.fgts.list.query(p) as Promise<{ data: Linha[]; total: number }>, [])
  const totais = useCallback(() => trpc.cnd.fgts.totalizadores.query() as Promise<Record<string, number>>, [])

  return (
    <AbaCertidao<Linha>
      nome="CRF/FGTS" icon={DollarSign} refreshKey={refreshKey} vazio="Nenhum CRF/FGTS consultado"
      listar={listar} totais={totais}
      indicadores={t => [
        { key: '', label: 'Total', count: t.total ?? 0, cor: STATUS_COR.primaria, icon: Shield },
        { key: 'regular', label: 'Regulares', count: t.regulares ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
        { key: 'irregular', label: 'Irregulares', count: t.irregulares ?? 0, cor: STATUS_COR.red, icon: XCircle },
        { key: 'nao_emitida', label: 'Não emitidos', count: t.naoEmitidas ?? 0, cor: STATUS_COR.amber, icon: AlertTriangle },
        { key: 'vigente', label: 'Vigentes', count: t.vigentes ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
        { key: 'vencendo', label: 'Vencendo', count: t.vencendo ?? 0, cor: STATUS_COR.amber, icon: Clock },
        { key: 'vencida', label: 'Vencidos', count: t.vencidas ?? 0, cor: STATUS_COR.red, icon: XCircle },
      ]}
      situacao={r => <SituacaoBadge sucesso={r.sucesso} tipo={r.tipoCertidao} falha="Não emitido" title={r.mensagem || undefined} />}
      colunas={[
        { header: 'Nº certificado', className: 'hidden lg:table-cell font-mono text-muted-foreground whitespace-nowrap', cell: r => r.numeroCertificado || '—' },
        { header: 'Validade', className: 'whitespace-nowrap', cell: r => <ValidadeBadge data={r.dataValidade} /> },
      ]}
      carregarClientes={carregarClientesMensais}
      consultar={async ({ documento, clienteId }) => {
        const r = await trpc.cnd.fgts.consultar.mutate({ documento, clienteId }) as { sucesso: boolean; mensagem: string; origemPdf?: 'oficial' | 'captura_tela' | null }
        return { ...r, aviso: r.origemPdf === 'captura_tela' ? AVISO_CAPTURA : undefined }
      }}
      pollEtapa={async () => (await trpc.cnd.fgts.consultaEtapa.query() as { etapa: string }).etapa}
      lote={{
        descricao: 'Consultar o CRF de todos os clientes mensais ativos?',
        iniciar: async forcarNova => { await trpc.cnd.fgts.consultarLote.mutate({ documentos: await documentosMensais(), forcarNova }) },
        progresso: async () => normalizarLote(await trpc.cnd.fgts.loteProgress.query() as Record<string, unknown>),
        rotulos: { ok: 'Regulares', nok: 'Irregulares' },
        permiteForcar: true,
      }}
      podeVerPdf={r => r.sucesso}
      pdf={{
        titulo: 'CRF — Certificado de Regularidade do FGTS',
        obter: async r => (await trpc.cnd.fgts.getPdf.query({ id: r.id }) as { pdfBase64: string | null }).pdfBase64,
        arquivo: r => `crf-fgts-${r.documento}.pdf`,
        aviso: r => /captura da tela/i.test(r.mensagem || '') ? AVISO_CAPTURA : null,
      }}
      excluir={id => trpc.cnd.fgts.delete.mutate({ id })}
      excluirLote={ids => trpc.cnd.fgts.deleteLote.mutate({ ids })}
    />
  )
}
