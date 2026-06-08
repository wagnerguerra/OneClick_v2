// Dados de exemplo (mock) do simulador do app mobile.
//
// Nada aqui vem de API/backend — é tudo estático e em PT-BR, só pra
// dar realismo às telas recriadas do app Android/iOS. Os tipos locais
// espelham (de forma simplificada) os shapes que o app real consome.

export type AppTela = 'login' | 'dashboard' | 'agenda' | 'tarefas' | 'helpdesk' | 'perfil'

// ── Usuário / empresa logados (mock) ────────────────────────────────
export const MOCK_USER = {
  nome: 'Wagner Guerra',
  email: 'wagner@central-rnc.com.br',
  papel: 'Administrador',
} as const

export const MOCK_EMPRESA = {
  nome: 'Central RNC Contabilidade',
} as const

// ── Agenda ──────────────────────────────────────────────────────────
export interface EventoMock {
  id: string
  titulo: string
  horario: string // "Dia inteiro" ou "09:00 – 10:30"
  local: string | null
  // Cor da borda esquerda do card (espelha resolveTipoCores do app).
  cor: string
}

// Eventos do dia selecionado (faixa de dias é gerada na própria tela).
export const MOCK_EVENTOS: EventoMock[] = [
  { id: 'e1', titulo: 'Reunião de alinhamento fiscal', horario: '09:00 – 10:00', local: 'Sala 2', cor: '#2563eb' },
  { id: 'e2', titulo: 'Entrega DCTFWeb — competência 05', horario: 'Dia inteiro', local: null, cor: '#f0533d' },
  { id: 'e3', titulo: 'Call com cliente Atacadão SP', horario: '14:30 – 15:30', local: 'Google Meet', cor: '#10b981' },
  { id: 'e4', titulo: 'Revisão de orçamentos pendentes', horario: '16:00 – 17:00', local: 'Sala 1', cor: '#a78bfa' },
]

// ── Tarefas ─────────────────────────────────────────────────────────
export type Prioridade = 'BAIXA' | 'NORMAL' | 'ALTA'

export interface TarefaMock {
  id: string
  titulo: string
  prazo: string // por extenso
  concluida: boolean
  prioridade: Prioridade
}

export const MOCK_TAREFAS: TarefaMock[] = [
  { id: 't1', titulo: 'Conferir guias de FGTS do mês', prazo: '8 de junho · 12:00', concluida: false, prioridade: 'ALTA' },
  { id: 't2', titulo: 'Responder e-mail do cliente Holding Vitória', prazo: '8 de junho', concluida: false, prioridade: 'NORMAL' },
  { id: 't3', titulo: 'Atualizar quadro societário — Tech Solutions', prazo: '9 de junho', concluida: false, prioridade: 'NORMAL' },
  { id: 't4', titulo: 'Arquivar certidões vencidas', prazo: '6 de junho', concluida: true, prioridade: 'BAIXA' },
  { id: 't5', titulo: 'Enviar balancete para revisão', prazo: '5 de junho', concluida: true, prioridade: 'NORMAL' },
]

// ── Helpdesk ────────────────────────────────────────────────────────
export type HelpdeskStatusMock = 'ABERTO' | 'EM_ANDAMENTO' | 'AGUARDANDO' | 'CONCLUIDO'

export interface TicketMock {
  id: string
  numero: number
  titulo: string
  status: HelpdeskStatusMock
  prioridade: 'Baixa' | 'Média' | 'Alta'
  prioridadeCor: string
  categoria: string | null
  data: string
}

export const STATUS_LABEL: Record<HelpdeskStatusMock, string> = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO: 'Aguardando',
  CONCLUIDO: 'Concluído',
}

// Classes Tailwind (literais do app — cores de status) por status.
// ABERTO usa azul (nova primária da marca); demais mantêm semântica de status.
export const STATUS_CLASSES: Record<HelpdeskStatusMock, { bg: string; text: string }> = {
  ABERTO: { bg: 'bg-blue-100', text: 'text-blue-700' },
  EM_ANDAMENTO: { bg: 'bg-amber-100', text: 'text-amber-700' },
  AGUARDANDO: { bg: 'bg-violet-100', text: 'text-violet-700' },
  CONCLUIDO: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

export const MOCK_TICKETS: TicketMock[] = [
  { id: 'h1', numero: 1042, titulo: 'Erro ao gerar DANFE de NFe importada', status: 'ABERTO', prioridade: 'Alta', prioridadeCor: '#dc2626', categoria: 'Fiscal', data: '08/06/2026' },
  { id: 'h2', numero: 1039, titulo: 'Solicitar acesso ao módulo de Folha', status: 'EM_ANDAMENTO', prioridade: 'Média', prioridadeCor: '#d97706', categoria: 'Acessos', data: '07/06/2026' },
  { id: 'h3', numero: 1031, titulo: 'Lentidão ao abrir lista de clientes', status: 'AGUARDANDO', prioridade: 'Média', prioridadeCor: '#d97706', categoria: 'Sistema', data: '05/06/2026' },
  { id: 'h4', numero: 1018, titulo: 'Configurar assinatura de e-mail', status: 'CONCLUIDO', prioridade: 'Baixa', prioridadeCor: '#16a34a', categoria: 'Configuração', data: '02/06/2026' },
]
