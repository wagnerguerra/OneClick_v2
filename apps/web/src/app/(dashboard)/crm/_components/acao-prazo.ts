/**
 * Regras de exibição do prazo das Ações do CRM (puras, testadas em
 * acao-prazo.test.ts).
 *
 * O prazo chega como meia-noite UTC do dia (é assim que a AgendaTarefa grava a
 * data) — por isso os componentes do dia são lidos com getUTC*, e "hoje" é o
 * dia local de quem está vendo.
 */

export type SituacaoPrazo =
  | { tipo: 'concluida' }
  | { tipo: 'atrasada'; dias: number }
  | { tipo: 'hoje' }
  | { tipo: 'proxima'; dias: number }
  | { tipo: 'futura'; dias: number }

/** Até quantos dias antes o prazo já aparece em destaque. */
export const DIAS_PROXIMO = 2

export function dataDoPrazo(prazoIso: string): { ano: number; mes: number; dia: number } {
  const d = new Date(prazoIso)
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate() }
}

export function diasAtePrazo(prazoIso: string, hoje: Date): number {
  const p = dataDoPrazo(prazoIso)
  const alvo = Date.UTC(p.ano, p.mes, p.dia)
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - base) / 86_400_000)
}

export function situacaoDoPrazo(prazoIso: string, concluida: boolean, hoje: Date): SituacaoPrazo {
  if (concluida) return { tipo: 'concluida' }
  const dias = diasAtePrazo(prazoIso, hoje)
  if (dias < 0) return { tipo: 'atrasada', dias: -dias }
  if (dias === 0) return { tipo: 'hoje' }
  if (dias <= DIAS_PROXIMO) return { tipo: 'proxima', dias }
  return { tipo: 'futura', dias }
}

export function formatarPrazo(prazoIso: string): string {
  const p = dataDoPrazo(prazoIso)
  return `${String(p.dia).padStart(2, '0')}/${String(p.mes + 1).padStart(2, '0')}/${p.ano}`
}

/** "AAAA-MM-DD" do dia local — valor de `<input type="date">`. */
export function hojeIso(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
}

/** Minutos antes do prazo oferecidos na tela. Prazo sem hora conta às 09:00. */
export const OPCOES_LEMBRETE: Array<{ minutos: number; rotulo: string }> = [
  { minutos: 0, rotulo: 'No dia do prazo' },
  { minutos: 1440, rotulo: '1 dia antes' },
  { minutos: 2880, rotulo: '2 dias antes' },
  { minutos: 10080, rotulo: '1 semana antes' },
]

export function rotuloLembrete(minutos: number): string {
  const fixo = OPCOES_LEMBRETE.find(o => o.minutos === minutos)
  if (fixo) return fixo.rotulo
  if (minutos < 60) return `${minutos} min antes`
  if (minutos < 1440) return `${Math.round(minutos / 60)} h antes`
  const dias = Math.round(minutos / 1440)
  return dias === 1 ? '1 dia antes' : `${dias} dias antes`
}

/**
 * O aviso escolhido já ficou para trás? O lembrete só dispara no minuto certo,
 * então um aviso "1 dia antes" de algo que vence hoje nunca chega — melhor a
 * tela dizer isso na hora de salvar.
 *
 * `prazo` é "AAAA-MM-DD" e `hora` "HH:MM" (ou vazio = 09:00), no fuso local.
 */
export function lembreteJaPassou(prazo: string, hora: string | null | undefined, minutosAntes: number, agora: Date = new Date()): boolean {
  const [a, m, d] = prazo.split('-').map(Number)
  const [h, min] = (hora || '09:00').split(':').map(Number)
  if (!a || !m || !d) return false
  const momento = new Date(a, m - 1, d, h || 0, min || 0).getTime() - minutosAntes * 60_000
  return momento < agora.getTime()
}
