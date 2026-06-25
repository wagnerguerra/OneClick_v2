// ============================================================
// Geração do "novo formato" SCI.
//
// Cada lançamento vira uma linha com 10 campos separados por vírgula:
//   <1>,<2>,<3>,<4>,<5>,<VAZIO>,<6>,<7>,<VAZIO>,<8>
//   <1> nº da linha (5 dígitos, inicia 00001)
//   <2> data AAAAMMDD
//   <3> débito → conta corrente; crédito → conta de contrapartida
//   <4> débito → conta de contrapartida; crédito → conta corrente
//   <5> valor sem sinal, separador decimal "."
//   <6> histórico
//   <7> "DCTO<nº NF>" se houver NF, senão vazio
//   <8> CNPJ/CPF só dígitos, senão vazio
//
// Arquivo final: encoding ANSI (latin1) + quebra de linha Windows (CRLF) —
// aplicados na entrega (controller), aqui produzimos a string.
//
// Confirmado em importação real (com a gestora do contábil): campos de texto
// vazios = vazio puro (",,"), valor sempre com 2 casas, e o mapeamento de
// contas/direção (DÉBITO↔RECEB, CRÉDITO↔PGTO) está correto.
//
// Como os campos NÃO são escapados (separador = vírgula), qualquer vírgula ou
// quebra de linha em campo de texto (histórico/contas) desalinharia a linha →
// `sanitizeCampo` remove esses caracteres antes de montar a linha.
// ============================================================

export type Direcao = 'DEBITO' | 'CREDITO'

/**
 * Higieniza um campo de texto que vai para a linha SCI: remove vírgulas e
 * quebras de linha (que quebrariam o layout de campos separados por vírgula) e
 * colapsa espaços. Rede de segurança no servidor — vale também para valores que
 * vêm do arquivo de origem (participante, nº NF), fora do controle do front.
 */
export function sanitizeCampo(s: string): string {
  return s.replace(/[\r\n,]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface SciLancamento {
  numero: number          // 1-based, ordem no arquivo
  yyyymmdd: string
  direcao: Direcao
  contaCorrente: string
  contaContrapartida: string
  valor: number           // pode vir com sinal; o SCI usa sempre sem sinal
  participante?: string
  numeroNf?: string
  documento?: string       // CNPJ/CPF (qualquer formatação; é normalizado)
  historicoFixo?: string
}

/** Monta o campo <6> (histórico). */
export function buildHistorico(l: Pick<SciLancamento, 'direcao' | 'numeroNf' | 'participante' | 'historicoFixo'>): string {
  if (l.historicoFixo && l.historicoFixo.trim()) return l.historicoFixo.trim()
  const ref = l.direcao === 'DEBITO' ? 'RECEB' : 'PGTO'
  const nf = l.numeroNf && l.numeroNf.trim() ? ` NF Nº ${l.numeroNf.trim()}` : ''
  const participante = (l.participante ?? '').trim().toUpperCase()
  const parte = participante ? ` - ${participante}` : '' // participante opcional → omitido se ausente
  return `VR REF ${ref}${nf}${parte}`
}

/** Valor do campo <5>: sem sinal, ponto decimal, 2 casas. */
export function formatValorSci(valor: number): string {
  return Math.abs(valor).toFixed(2)
}

const onlyDigits = (s: string | undefined): string => String(s ?? '').replace(/\D/g, '')

/** Constrói a linha SCI (10 campos) de um lançamento. */
export function buildSciLine(l: SciLancamento): string {
  const numero = String(l.numero).padStart(5, '0')
  const c3 = l.direcao === 'DEBITO' ? l.contaCorrente : l.contaContrapartida
  const c4 = l.direcao === 'DEBITO' ? l.contaContrapartida : l.contaCorrente
  const valor = formatValorSci(l.valor)
  const historico = sanitizeCampo(buildHistorico(l))
  const nfTrim = l.numeroNf?.trim()
  const dcto = nfTrim ? `DCTO${sanitizeCampo(nfTrim)}` : ''
  const doc = onlyDigits(l.documento)
  // Contas também passam pelo saneamento (vírgula numa conta quebraria a linha).
  return [numero, l.yyyymmdd, sanitizeCampo(c3), sanitizeCampo(c4), valor, '', historico, dcto, '', doc].join(',')
}

/** Junta as linhas no conteúdo final do arquivo (CRLF; latin1 aplicado na entrega). */
export function buildSciFile(lines: string[]): string {
  return lines.join('\r\n')
}
