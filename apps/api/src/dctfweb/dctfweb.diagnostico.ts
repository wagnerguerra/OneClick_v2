import { prisma } from '@saas/db'

// ============================================================
// Serviço de Diagnóstico Pós-Entrega da DCTFWeb
// ============================================================
// Avalia se houve alteração nas origens (eSocial, Reinf, MIT)
// após a última transmissão da DCTFWeb, marcando necessidade
// de retificação.
// ============================================================

export interface DiagnosticoPosEntrega {
  retificadoraPendente: boolean
  statusPosEntrega: string
  motivoRetificadora: string | null
  alteracoes: string[]
}

const STATUS_POS_ENTREGA = {
  SEM_ALTERACAO: 'sem_alteracao',
  RETIFICADORA_PENDENTE: 'retificadora_pendente',
  REABERTA_NAO_TRANSMITIDA: 'reaberta_nao_transmitida',
  RETIFICADORA_TRANSMITIDA: 'retificadora_transmitida',
} as const

/**
 * Avalia se uma obrigação precisa de retificação com base
 * nas datas de fechamento das origens vs data da última entrega.
 */
export function avaliarPosEntrega(registro: {
  dataUltimaEntrega: Date | string | null
  dataUltimoFechamentoEsocial: Date | string | null
  dataUltimoFechamentoReinf: Date | string | null
  dataUltimaAtualizacaoMit: Date | string | null
  statusDctfweb: string | null
  situacaoApi: number | null // situacao retornada pela API
}): DiagnosticoPosEntrega {
  const entrega = registro.dataUltimaEntrega ? new Date(registro.dataUltimaEntrega) : null

  // Se nunca foi entregue, não há diagnóstico pós-entrega
  if (!entrega) {
    return { retificadoraPendente: false, statusPosEntrega: STATUS_POS_ENTREGA.SEM_ALTERACAO, motivoRetificadora: null, alteracoes: [] }
  }

  const alteracoes: string[] = []

  // Verificar eSocial
  const esocial = registro.dataUltimoFechamentoEsocial ? new Date(registro.dataUltimoFechamentoEsocial) : null
  if (esocial && esocial > entrega) {
    alteracoes.push('Novo fechamento do eSocial após entrega da DCTFWeb')
  }

  // Verificar Reinf
  const reinf = registro.dataUltimoFechamentoReinf ? new Date(registro.dataUltimoFechamentoReinf) : null
  if (reinf && reinf > entrega) {
    alteracoes.push('Novo fechamento da EFD-Reinf após entrega da DCTFWeb')
  }

  // Verificar MIT
  const mit = registro.dataUltimaAtualizacaoMit ? new Date(registro.dataUltimaAtualizacaoMit) : null
  if (mit && mit > entrega) {
    alteracoes.push('Alteração no MIT após entrega da DCTFWeb')
  }

  // Verificar situação da API (reaberta)
  // situacao: 1=Aberta, 2=Em Andamento → indica que foi reaberta
  if (registro.situacaoApi !== null && registro.situacaoApi <= 2) {
    alteracoes.push('DCTFWeb consta como reaberta/retificadora pendente na Receita')
    return {
      retificadoraPendente: true,
      statusPosEntrega: STATUS_POS_ENTREGA.REABERTA_NAO_TRANSMITIDA,
      motivoRetificadora: alteracoes.join('; '),
      alteracoes,
    }
  }

  if (alteracoes.length > 0) {
    return {
      retificadoraPendente: true,
      statusPosEntrega: STATUS_POS_ENTREGA.RETIFICADORA_PENDENTE,
      motivoRetificadora: alteracoes.join('; '),
      alteracoes,
    }
  }

  return {
    retificadoraPendente: false,
    statusPosEntrega: STATUS_POS_ENTREGA.SEM_ALTERACAO,
    motivoRetificadora: null,
    alteracoes: [],
  }
}

/**
 * Aplica o diagnóstico pós-entrega em um registro do banco e
 * registra alterações no log.
 */
export async function aplicarDiagnosticoPosEntrega(
  id: string,
  diagnostico: DiagnosticoPosEntrega,
  documento: string,
  competencia: string,
  clienteId?: string | null,
  userId?: string | null,
) {
  const anterior = await prisma.$queryRawUnsafe<Array<{ retificadora_pendente: boolean; status_pos_entrega: string | null }>>(
    `SELECT retificadora_pendente, status_pos_entrega FROM obrigacoes_dctfweb WHERE id = $1`, id,
  )
  const antRetif = anterior[0]?.retificadora_pendente ?? false
  const antStatus = anterior[0]?.status_pos_entrega ?? 'sem_alteracao'

  // Atualizar registro
  await prisma.$executeRawUnsafe(
    `UPDATE obrigacoes_dctfweb SET
      retificadora_pendente = $2,
      status_pos_entrega = $3,
      motivo_retificadora = $4,
      updated_at = NOW()
     WHERE id = $1`,
    id, diagnostico.retificadoraPendente, diagnostico.statusPosEntrega, diagnostico.motivoRetificadora,
  )

  // Se uma obrigação com retificadora_pendente não pode ser "concluido"
  if (diagnostico.retificadoraPendente) {
    await prisma.$executeRawUnsafe(
      `UPDATE obrigacoes_dctfweb SET
        status_processo = CASE WHEN status_processo = 'concluido' THEN 'aguardando_pagamento' ELSE status_processo END,
        nivel_alerta = CASE WHEN nivel_alerta = 'verde' THEN 'amarelo' ELSE nivel_alerta END
       WHERE id = $1`,
      id,
    )
  }

  // Log de alterações relevantes
  const mudou = antRetif !== diagnostico.retificadoraPendente || antStatus !== diagnostico.statusPosEntrega
  if (mudou) {
    let acao = 'POS_ENTREGA_VERIFICADO'
    if (!antRetif && diagnostico.retificadoraPendente) acao = 'RETIFICADORA_DETECTADA'
    else if (antRetif && !diagnostico.retificadoraPendente) acao = 'POS_ENTREGA_REGULARIZADO'
    if (diagnostico.statusPosEntrega === 'reaberta_nao_transmitida') acao = 'DCTFWEB_REABERTA_API'

    await prisma.$executeRawUnsafe(
      `INSERT INTO log_dctfweb (id, cliente_id, documento, competencia, acao, detalhe, user_id)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
      clienteId || null, documento, competencia, acao,
      diagnostico.motivoRetificadora || `${antStatus} → ${diagnostico.statusPosEntrega}`,
      userId || null,
    )
  }
}

/**
 * Marca uma retificadora como transmitida (regularizada).
 */
export async function marcarRetificadoraTransmitida(
  id: string,
  dataTransmissao: Date,
  documento: string,
  competencia: string,
  clienteId?: string | null,
  userId?: string | null,
) {
  await prisma.$executeRawUnsafe(
    `UPDATE obrigacoes_dctfweb SET
      data_ultima_entrega = $2,
      retificadora_pendente = false,
      status_pos_entrega = 'retificadora_transmitida',
      motivo_retificadora = NULL,
      status_processo = CASE WHEN valor_debito_api > 0 THEN 'aguardando_pagamento' ELSE 'concluido' END,
      updated_at = NOW()
     WHERE id = $1`,
    id, dataTransmissao,
  )

  await prisma.$executeRawUnsafe(
    `INSERT INTO log_dctfweb (id, cliente_id, documento, competencia, acao, detalhe, user_id)
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'RETIFICADORA_TRANSMITIDA', 'Retificadora transmitida e regularizada', $4)`,
    clienteId || null, documento, competencia, userId || null,
  )
}
