/**
 * Perguntas condicionais do checklist ("if", 07/10/2026).
 *
 * Um passo do tipo PERGUNTA é respondido na execução; etapas, sub-etapas e
 * passos podem ter uma condição "só vale se a pergunta X foi respondida com
 * uma destas opções". Aqui ficam as regras puras (sem banco), usadas pelo
 * servico.service na criação da execução e a cada resposta, e pelos testes.
 */

/** Condição de um item no CADASTRO (etapa, sub-etapa ou passo). */
export interface CondicaoTemplate { condicaoPassoId?: string | null; condicaoOpcoes?: string[] | null }

/** Condição EFETIVA gravada no passo da execução (todas precisam valer). */
export interface CondicaoExec { perguntaExecPassoId: string; opcoes: string[] }

export type EstadoCondicao = 'aplica' | 'nao_se_aplica' | 'aguardando'

export interface PassoAvaliavel {
  id: string
  ordem: number
  tipo?: string | null
  perguntaTexto?: string | null
  respostaOpcoes?: string[] | null
  condicoes?: unknown
}

export interface ResultadoCondicao {
  estado: EstadoCondicao
  /** A pergunta que decidiu o estado (para o selo "Não se aplica — <pergunta>: <resposta>"). */
  perguntaId: string | null
}

/** Lê o JSON `condicoes` com tolerância (dado antigo/vazio = sem condição). */
export function lerCondicoes(v: unknown): CondicaoExec[] {
  if (!Array.isArray(v)) return []
  return v.filter((c): c is CondicaoExec =>
    !!c && typeof c === 'object'
    && typeof (c as CondicaoExec).perguntaExecPassoId === 'string'
    && Array.isArray((c as CondicaoExec).opcoes))
}

/**
 * Estado de cada passo da execução, na ordem.
 * - pergunta da condição "não se aplica" → o item também não se aplica (cascata);
 * - pergunta ainda sem resposta → "aguardando" (bloqueado, não riscado);
 * - respondida sem nenhuma das opções da condição → "não se aplica";
 * - várias condições (etapa + sub-etapa + passo): todas precisam valer.
 */
export function avaliarCondicoes(passos: PassoAvaliavel[]): Map<string, ResultadoCondicao> {
  const ordenados = [...passos].sort((a, b) => a.ordem - b.ordem)
  const porId = new Map(ordenados.map(p => [p.id, p]))
  const out = new Map<string, ResultadoCondicao>()
  for (const p of ordenados) {
    let estado: EstadoCondicao = 'aplica'
    let perguntaId: string | null = null
    for (const c of lerCondicoes(p.condicoes)) {
      const pergunta = porId.get(c.perguntaExecPassoId)
      if (!pergunta) continue // pergunta sumiu: a condição deixa de existir
      const estadoPergunta = out.get(pergunta.id)?.estado ?? 'aplica'
      if (estadoPergunta === 'nao_se_aplica') { estado = 'nao_se_aplica'; perguntaId = pergunta.id; break }
      const resposta = pergunta.respostaOpcoes ?? []
      if (estadoPergunta === 'aguardando' || resposta.length === 0) {
        if (estado === 'aplica') { estado = 'aguardando'; perguntaId = pergunta.id }
        continue
      }
      if (!resposta.some(r => c.opcoes.includes(r))) { estado = 'nao_se_aplica'; perguntaId = pergunta.id; break }
    }
    out.set(p.id, { estado, perguntaId })
  }
  return out
}

/**
 * Passos JÁ CONCLUÍDOS que passariam a "não se aplica" se a pergunta recebesse
 * `novaResposta` — o aviso que o usuário confirma antes de trocar a resposta.
 */
export function afetadosPelaTroca<P extends PassoAvaliavel & { concluido?: boolean; passoNome?: string }>(
  passos: P[], perguntaId: string, novaResposta: string[],
): P[] {
  const antes = avaliarCondicoes(passos)
  const depois = avaliarCondicoes(passos.map(p => (p.id === perguntaId ? { ...p, respostaOpcoes: novaResposta } : p)))
  return passos.filter(p => p.concluido
    && antes.get(p.id)?.estado !== 'nao_se_aplica'
    && depois.get(p.id)?.estado === 'nao_se_aplica')
}

// ── Cadastro (template) ──────────────────────────────────────

export interface PassoTemplate extends CondicaoTemplate {
  id: string
  tipo?: string | null
  perguntaOpcoes?: string[] | null
}

/**
 * Condições efetivas de cada passo do template, a partir da sequência REAL
 * (etapas na ordem; dentro, `ordenarPassosDaEtapa`). Uma condição só vale se a
 * pergunta é PERGUNTA, vem ANTES do item e as opções existem nela — condição
 * inválida (pergunta reordenada para depois, opção removida) é descartada, para
 * nunca travar uma execução.
 */
export function condicoesEfetivasDoTemplate(
  sequencia: Array<{ passo: PassoTemplate; etapa: CondicaoTemplate & { id: string }; sub: (CondicaoTemplate & { id: string }) | null }>,
): Map<string, Array<{ perguntaPassoId: string; opcoes: string[] }>> {
  const posicao = new Map(sequencia.map((x, i) => [x.passo.id, i]))
  const porId = new Map(sequencia.map(x => [x.passo.id, x.passo]))
  // Primeiro passo de cada etapa/sub-etapa: a pergunta tem de vir antes dele.
  const inicio = new Map<string, number>()
  sequencia.forEach((x, i) => {
    if (!inicio.has(`e:${x.etapa.id}`)) inicio.set(`e:${x.etapa.id}`, i)
    if (x.sub && !inicio.has(`s:${x.sub.id}`)) inicio.set(`s:${x.sub.id}`, i)
  })
  const valida = (c: CondicaoTemplate, antesDe: number) => {
    if (!c.condicaoPassoId) return null
    const pergunta = porId.get(c.condicaoPassoId)
    const pos = posicao.get(c.condicaoPassoId)
    if (!pergunta || pergunta.tipo !== 'PERGUNTA' || pos === undefined || pos >= antesDe) return null
    const opcoes = (c.condicaoOpcoes ?? []).filter(o => (pergunta.perguntaOpcoes ?? []).includes(o))
    return opcoes.length > 0 ? { perguntaPassoId: c.condicaoPassoId, opcoes } : null
  }
  const out = new Map<string, Array<{ perguntaPassoId: string; opcoes: string[] }>>()
  sequencia.forEach((x, i) => {
    const conds = [
      valida(x.etapa, inicio.get(`e:${x.etapa.id}`) ?? i),
      x.sub ? valida(x.sub, inicio.get(`s:${x.sub.id}`) ?? i) : null,
      valida(x.passo, i),
    ].filter((c): c is { perguntaPassoId: string; opcoes: string[] } => !!c)
    out.set(x.passo.id, conds)
  })
  return out
}
