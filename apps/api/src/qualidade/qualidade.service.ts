import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Painel da Qualidade — o sucessor do `dsb_iso` do v1: as PENDÊNCIAS do
 * sistema de gestão consolidadas num lugar. Tudo derivado aqui e entregue
 * pronto (padrão de estados derivados) — o front só desenha os faróis.
 *
 * A régua de prazo é a mesma do v1: vencidas (< hoje), vencendo hoje e a
 * vencer (próximos 7 dias).
 */

function hojeUTC(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

@Injectable()
export class QualidadeService {
  async painel(empresaId?: string | null) {
    const emp = empresaId ?? null
    const hoje = hojeUTC()
    const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000)
    const seteDias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000)
    const inicioAno = new Date(Date.UTC(new Date().getFullYear(), 0, 1))

    /** Régua vencidas / hoje / a vencer (7 dias) sobre um filtro de prazo. */
    const regua = (base: Record<string, unknown>, campo: string, count: (w: Record<string, unknown>) => Promise<number>) =>
      Promise.all([
        count({ ...base, [campo]: { lt: hoje } }),
        count({ ...base, [campo]: { gte: hoje, lt: amanha } }),
        count({ ...base, [campo]: { gte: amanha, lte: seteDias } }),
      ]).then(([vencidas, hoje_, aVencer]) => ({ vencidas, hoje: hoje_, aVencer }))

    const [
      ncPorSituacao, ncAcoes, ncEficazAno,
      ctxSemAvaliacao, ctxRiscoAlto, ctxAcoes,
      reuAcoes,
      capAguardandoAval, capAval,
      manifestacoes, recPrazo,
      docsEmAprovacao,
    ] = await Promise.all([
      // ── Não Conformidades ──
      prisma.naoConformidade.groupBy({
        by: ['situacao'],
        where: { empresaId: emp, ativo: true },
        _count: true,
      }),
      regua(
        { concluida: false, nc: { empresaId: emp, ativo: true, situacao: { notIn: ['FINALIZADA', 'CANCELADA'] } } },
        'prazo',
        (w) => prisma.naoConformidadeAcao.count({ where: w as never }),
      ),
      prisma.naoConformidade.groupBy({
        by: ['eficaz'],
        where: { empresaId: emp, ativo: true, avaliadoEm: { gte: inicioAno } },
        _count: true,
      }),

      // ── Análise de Contexto ──
      prisma.analiseContexto.count({ where: { empresaId: emp, ativo: true, avaliadoEm: null } }),
      prisma.analiseContexto.count({ where: { empresaId: emp, ativo: true, avaliadoEm: null, gravidade: { gte: 2 }, probabilidade: { gte: 3 } } })
        .then(async (a) => a + await prisma.analiseContexto.count({ where: { empresaId: emp, ativo: true, avaliadoEm: null, gravidade: 3, probabilidade: 2 } })),
      regua(
        { concluida: false, analise: { empresaId: emp, ativo: true } },
        'prazo',
        (w) => prisma.analiseContextoAcao.count({ where: w as never }),
      ),

      // ── Reuniões (plano de ação) ──
      regua(
        { status: 'PENDENTE', reuniao: { empresaId: emp } },
        'prazo',
        (w) => prisma.reuniaoAcao.count({ where: w as never }),
      ),

      // ── Capacitações (avaliação de eficácia) ──
      prisma.capacitacao.count({
        where: { empresaId: emp, status: { in: ['AUTORIZADA', 'FINALIZADA'] }, avaliadaEm: null },
      }),
      regua(
        { empresaId: emp, status: { notIn: ['CANCELADA', 'AVALIADA'] }, avaliadaEm: null },
        'prazoAvaliacao',
        (w) => prisma.capacitacao.count({ where: w as never }),
      ),

      // ── Manifestações ──
      prisma.manifestacao.groupBy({
        by: ['tipo', 'status'],
        where: { empresaId: emp },
        _count: true,
      }),
      prisma.manifestacao.count({
        where: {
          empresaId: emp, tipo: 'RECLAMACAO',
          status: { in: ['AGUARDANDO_RETORNO', 'AGUARDANDO_ANALISE', 'REGISTRAR_EFICACIA'] },
          prazoRetorno: { lt: hoje },
        },
      }),

      // ── Documentos Internos (revisões em aprovação) ──
      prisma.documentoInternoVersao.count({
        where: { situacao: 'EM_APROVACAO', documento: { empresaId: emp } },
      }),
    ])

    const porSituacao: Record<string, number> = {}
    for (const g of ncPorSituacao) porSituacao[g.situacao] = g._count
    const eficaz = { sim: 0, nao: 0 }
    for (const g of ncEficazAno) {
      if (g.eficaz === true) eficaz.sim = g._count
      if (g.eficaz === false) eficaz.nao = g._count
    }

    const man: Record<string, Record<string, number>> = { ELOGIO: {}, RECLAMACAO: {}, SUGESTAO: {} }
    for (const g of manifestacoes) {
      man[g.tipo] = man[g.tipo] ?? {}
      man[g.tipo]![g.status] = g._count
    }
    const soma = (t: string, sts: string[]) => sts.reduce((acc, s) => acc + (man[t]?.[s] ?? 0), 0)

    return {
      nc: {
        abertas: soma0(porSituacao, ['AGUARDANDO_CAUSA', 'AGUARDANDO_ACOES', 'EM_TRATAMENTO', 'AGUARDANDO_CONCLUSAO']),
        porSituacao,
        acoes: ncAcoes,
        eficazAno: eficaz,
      },
      contexto: {
        semAvaliacao: ctxSemAvaliacao,
        riscoAlto: ctxRiscoAlto,
        acoes: ctxAcoes,
      },
      reunioes: { acoes: reuAcoes },
      capacitacoes: {
        aguardandoAvaliacao: capAguardandoAval,
        avaliacoes: capAval,
      },
      manifestacoes: {
        elogiosNovos: soma('ELOGIO', ['RECEBIDA']),
        sugestoesSemResposta: soma('SUGESTAO', ['RECEBIDA']),
        reclamacoesAbertas: soma('RECLAMACAO', ['AGUARDANDO_RETORNO', 'AGUARDANDO_ANALISE', 'REGISTRAR_EFICACIA']),
        reclamacoesPorStatus: man.RECLAMACAO,
        reclamacoesPrazoVencido: recPrazo,
      },
      documentos: { emAprovacao: docsEmAprovacao },
    }
  }
}

function soma0(mapa: Record<string, number>, chaves: string[]): number {
  return chaves.reduce((acc, k) => acc + (mapa[k] ?? 0), 0)
}
