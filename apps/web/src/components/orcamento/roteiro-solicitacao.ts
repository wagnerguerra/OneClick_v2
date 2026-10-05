/**
 * Roteiro do Detalhamento ao pedir um orçamento (#HLP0411).
 *
 * O comercial recebia pedidos das áreas sem os dados para compor o orçamento.
 * O campo Detalhamento passa a abrir já com as perguntas (em negrito, cada uma
 * com uma linha em branco para a resposta). É lembrete, não trava — decisão do
 * Wagner (28/09/2026): dá para enviar com itens em branco. Só o roteiro
 * INTACTO conta como vazio, para não chegar ao comercial um pedido só com as
 * perguntas.
 *
 * Usado nos dois caminhos: o balão "Solicitar orçamento" (botão +) e o
 * "Novo Orçamento" do módulo. Editável em Configurações de Orçamentos →
 * Textos padrão (quem tem acesso às configurações); este é o PADRÃO, usado
 * enquanto a empresa não configurou o seu.
 */
export const ROTEIRO_SOLICITACAO_ORCAMENTO = [
  '<p><strong>Nome do serviço:</strong></p><p></p>',
  '<p><strong>Fato gerador</strong> (o que gerou a necessidade deste trabalho):</p><p></p>',
  '<p><strong>Detalhamento do que será feito:</strong></p><p></p>',
  '<p><strong>Média de horas que serão gastas na execução:</strong></p><p></p>',
  '<p><strong>Regime:</strong> hora normal (dentro do expediente) ou extra (fora do expediente)?</p><p></p>',
  '<p><strong>Colaborador responsável pela execução:</strong></p><p></p>',
  '<p><em>Somente se aplicável:</em></p>',
  '<ul><li><p><strong>O cliente terá algum ganho ou vantagem tributária com este trabalho?</strong></p></li>',
  '<li><p><strong>O cliente terá que desembolsar valores para pagamento de obrigações?</strong></p></li></ul><p></p>',
].join('')

/** Texto puro, sem tags nem espaços — para comparar conteúdo. */
function texto(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, '')
}

/**
 * O detalhamento tem conteúdo de verdade? Vazio, ou só o roteiro sem nenhuma
 * resposta, conta como não preenchido. `roteiro` = o que o formulário abriu
 * (o configurado pela empresa, ou o padrão).
 */
export function detalhamentoPreenchido(html: string, roteiro: string = ROTEIRO_SOLICITACAO_ORCAMENTO): boolean {
  const t = texto(html)
  return t.length >= 3 && t !== texto(roteiro)
}

/** Configuração salva → roteiro efetivo. null (nunca configurado) = padrão. */
export function roteiroEfetivo(configurado: string | null | undefined): string {
  return configurado ?? ROTEIRO_SOLICITACAO_ORCAMENTO
}
