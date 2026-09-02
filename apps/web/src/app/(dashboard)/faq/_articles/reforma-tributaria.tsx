'use client'

import {
  Calculator, Info, Users, RefreshCw, Settings2, LayoutGrid, TrendingUp,
  LayoutDashboard, Sigma, Database, Share2, ShieldAlert, HelpCircle,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import {
  Section, Step, Callout, QuickLink, DefRow, Figura, FiguraCampo, CasoPratico,
} from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-fiscal, #0369a1)'
const FAQ_COLOR = '#0891b2'

/** Celula de tabela das figuras — mantem o mesmo tamanho em todas. */
const td = 'px-2 py-1 text-[11px] whitespace-nowrap'
const th = 'px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap'

export default function FaqReformaTributariaPage() {
  return (
    <ArticleShell
      modulo="Reforma Tributária"
      moduloColor={MODULO_COLOR}
      icon={Calculator}
      titulo="Reforma Tributária: simulador de IBS/CBS por cliente"
      descricao="Mostrar ao cliente, com os números dele, quanto a mudança do sistema antigo para o IVA Dual pesa no bolso — e em que ano cada etapa acontece."
    >
      {/* ═══════════════ O QUE É ═══════════════ */}
      <Section icon={Info} titulo="O que é este módulo" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <p className="leading-relaxed text-foreground/80">
            É um <strong>simulador de conversa</strong>. Você escolhe um cliente, o sistema puxa o
            faturamento e as despesas dele do balancete contábil, e a tela mostra o que a Reforma
            Tributária faz com a carga tributária daquela empresa — hoje, e ano a ano até 2033.
          </p>
          <p className="leading-relaxed text-foreground/80">
            O propósito é <strong>ordem de grandeza com dado real</strong>. Em vez de explicar a
            reforma no abstrato, você abre a tela na frente do cliente e mostra o número dele.
          </p>
        </div>

        <Callout tipo="aviso">
          <p>
            <strong>Não é um parecer fiscal.</strong> O simulador usa alíquotas de referência que
            ainda não foram fixadas em lei e não trata regimes específicos, cesta básica,
            <em> split payment</em> nem cashback. Serve para dimensionar e provocar a conversa — a
            decisão do cliente precisa de análise dedicada.
          </p>
        </Callout>
      </Section>

      {/* ═══════════════ GLOSSÁRIO ═══════════════ */}
      <Section icon={HelpCircle} titulo="O vocabulário da tela" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="IVA Dual" texto="O modelo que substitui cinco tributos por dois. &quot;Dual&quot; porque a arrecadação é dividida entre União (CBS) e estados/municípios (IBS)." />
          <DefRow termo="CBS" texto="Contribuição sobre Bens e Serviços — federal. Substitui PIS e COFINS." />
          <DefRow termo="IBS" texto="Imposto sobre Bens e Serviços — estadual e municipal. Substitui ICMS e ISS." />
          <DefRow termo="Alíquota nominal" texto="O percentual cheio que incide sobre a receita, antes de descontar crédito." />
          <DefRow termo="Alíquota efetiva" texto="O que a empresa realmente desembolsa depois do crédito. É o número que importa na comparação — e o que mais muda entre os regimes." />
          <DefRow termo="Crédito" texto="Imposto pago na compra que volta como abatimento na venda. No IVA o crédito é amplo: quase toda despesa da atividade gera crédito. No sistema antigo é restrito, e no Simples não existe." />
          <DefRow termo="Despesas creditáveis" texto="A soma das contas do balancete que geram crédito. É o segundo número mais importante da simulação, depois do faturamento." />
          <DefRow termo="Balancete" texto="O relatório contábil mensal do cliente, importado do SCI. É a fonte de tudo que a tela mostra." />
        </div>
      </Section>

      {/* ═══════════════ A TELA ═══════════════ */}
      <h2 className="text-base font-bold pt-2">Como a tela é organizada</h2>

      <p className="text-sm leading-relaxed text-foreground/80">
        A navegação fica na coluna da esquerda e tem cinco paradas. As duas primeiras montam a
        simulação, as duas seguintes mostram o resultado, e a última é uma calculadora avulsa.
      </p>

      <Figura
        rota="/reforma-tributaria"
        legenda="A coluna de navegação. Você trabalha de cima para baixo: configura, compara, olha a transição e fecha na Visão Geral — que é a página que vai para o cliente."
      >
        <div className="w-[220px] space-y-0.5">
          {[
            { i: Settings2, l: 'Configurar', ativa: true, g: null },
            { i: LayoutGrid, l: 'Comparar Regimes', ativa: false, g: 'Análise' },
            { i: TrendingUp, l: 'Transição 2026–2033', ativa: false, g: null },
            { i: LayoutDashboard, l: 'Visão Geral', ativa: false, g: 'Resultado' },
            { i: Sigma, l: 'Calculadora IBS/CBS', ativa: false, g: 'Calculadora' },
          ].map(({ i: Icone, l, ativa, g }) => (
            <div key={l}>
              {g && (
                <p className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g}
                </p>
              )}
              <div
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${
                  ativa ? 'font-semibold text-slate-900' : 'text-foreground/70'
                }`}
                style={ativa ? { background: '#22d3ee' } : undefined}
              >
                <Icone className="h-3.5 w-3.5 shrink-0" />
                {l}
              </div>
            </div>
          ))}
        </div>
      </Figura>

      {/* ═══════════════ PASSO A PASSO ═══════════════ */}
      <h2 className="text-base font-bold pt-2">Passo a passo</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Users} titulo="Escolha o cliente" rota="seletor no topo">
        <p>
          O seletor fica no topo da tela e ocupa metade da linha. Ele busca <strong>no servidor</strong>,
          conforme você digita, entre os clientes <strong>ativos e mensais</strong> da empresa em
          que você está — não é um filtro sobre uma lista curta carregada antes.
        </p>
        <p>
          Assim que você escolhe, a tela inteira se recarrega com os números daquele cliente, e o
          card ao lado resume o que o sistema encontrou.
        </p>

        <Figura
          rota="/reforma-tributaria — topo"
          legenda="Esquerda: o seletor com busca. Direita: o resumo do que foi carregado. O rótulo da origem é o detalhe que mais importa — ele diz se o faturamento veio do balancete ou de uma estimativa."
        >
          <div className="flex min-w-[520px] gap-3">
            <div className="flex-1 rounded-md border p-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Cliente</p>
              <div className="mt-1 flex items-center justify-between rounded border bg-muted/30 px-2 py-1.5">
                <span className="text-[11px] font-medium">INDÚSTRIA EXEMPLO LTDA</span>
                <span className="text-[10px] text-muted-foreground">▾</span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">00.000.000/0001-00</p>
            </div>
            <div className="flex-1 rounded-md border p-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <FiguraCampo label="Regime" valor="Lucro Real" />
                <FiguraCampo label="Atividade" valor="Indústria" />
                <FiguraCampo label="Faturamento/mês" valor="R$ 1.000.000,00" destaque />
                <FiguraCampo label="Origem" valor="Balancete" cor="#059669" />
              </div>
            </div>
          </div>
        </Figura>

        <Callout tipo="info">
          Só aparecem clientes <strong>ativos com serviço mensal</strong>. Se o cliente que você
          procura não aparece, o problema costuma estar no cadastro dele — e não na busca.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={RefreshCw} titulo="Confira até quando o balancete está sincronizado" rota="botão ao lado do título">
        <p>
          A simulação vale o que vale o balancete por trás dela. O botão de atualização abre um
          painel que responde três coisas: <strong>até que mês</strong> os dados chegaram,
          <strong> quantos meses</strong> existem na janela e <strong>quais meses faltam</strong>.
        </p>

        <Figura
          rota="Atualizar balancete"
          legenda="&quot;Sincronizado até&quot; é o mês mais recente já importado. As etiquetas de lacuna mostram os meses que faltam dentro da janela de 12 meses — buracos no meio distorcem a média mensal."
        >
          <div className="w-[400px] space-y-2.5">
            <div className="flex gap-2.5">
              <div className="flex-1 rounded-md border p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sincronizado até</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">08/2026</p>
                <p className="text-[10px] text-muted-foreground">desde 09/2025</p>
              </div>
              <div className="flex-1 rounded-md border p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Meses na janela</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">10 / 12</p>
                <p className="text-[10px] text-muted-foreground">1.482 linhas</p>
              </div>
            </div>
            <div className="rounded-md border border-l-4 border-l-amber-400 bg-amber-50 p-2 dark:bg-amber-950/30">
              <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">Meses faltando</p>
              <div className="mt-1 flex gap-1">
                {['11/2025', '03/2026'].map(m => (
                  <span key={m} className="rounded border px-1.5 py-0.5 text-[10px] tabular-nums">{m}</span>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <span className="rounded-md px-3 py-1.5 text-[11px] font-medium text-white" style={{ background: MODULO_COLOR }}>
                Importar do SCI
              </span>
            </div>
          </div>
        </Figura>

        <Callout tipo="aviso">
          A importação é executada pelo <strong>Service Manager</strong>, no computador que enxerga
          o banco do SCI. Se ele estiver fechado, o sistema avisa que não há ninguém para atender o
          pedido — abra o Service Manager e tente de novo.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Settings2} titulo="Revise os parâmetros" rota="Configurar">
        <p>
          Quatro campos definem a simulação. Os dois primeiros vêm do cadastro, os dois últimos do
          balancete — e todos podem ser ajustados na mão para testar cenários.
        </p>
        <ul className="ml-2 list-inside list-disc space-y-1">
          <li><strong>Regime</strong> — Lucro Real, Lucro Presumido ou Simples Nacional</li>
          <li><strong>Atividade</strong> — Indústria, Comércio ou Serviços</li>
          <li><strong>Faturamento mensal</strong> — média dos últimos 12 meses, com máscara em reais</li>
          <li><strong>Despesas mensais creditáveis</strong> — clicável, abre a composição</li>
        </ul>

        <Callout tipo="dica">
          Mexer nos campos <strong>não altera nada no cadastro do cliente</strong>. A simulação é
          descartável: fechou a tela, acabou. Use isso à vontade para responder &quot;e se o
          faturamento dobrar?&quot; na frente do cliente.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Database} titulo="Abra a composição das despesas creditáveis" rota="clique no valor">
        <p>
          Este é o passo que dá credibilidade à conversa. O valor de despesas creditáveis não é
          chute: é a soma de contas do balancete, e clicar nele mostra <strong>conta por conta</strong> de
          onde o número saiu.
        </p>

        <Figura
          rota="Composição das despesas creditáveis"
          legenda="Cada linha é uma conta do balancete do cliente. A linha marcada como (redutora) aparece negativa de propósito — estornos e devoluções abatem a base, não somam."
        >
          <table className="w-full min-w-[430px]">
            <thead>
              <tr className="border-b">
                <th className={`${th} text-left`}>Conta</th>
                <th className={`${th} text-left`}>Descrição</th>
                <th className={`${th} text-right`}>Valor mensal</th>
              </tr>
            </thead>
            <tbody>
              {[
                { conta: '04.1.1.01.001', desc: 'Custo das Mercadorias Vendidas', valor: 'R$ 390.000,00', red: false },
                { conta: '04.1.1.02.001', desc: 'Custos com Importação', valor: 'R$ 51.000,00', red: false },
                { conta: '04.2.1.08.003', desc: 'Energia elétrica', valor: 'R$ 31.000,00', red: false },
                { conta: '04.1.4.01.001', desc: 'Material Aplicado', valor: 'R$ 24.000,00', red: false },
                { conta: '04.1.1.01.042', desc: 'Estorno de Crédito', valor: '-R$ 13.000,00', red: true },
              ].map(({ conta, desc, valor, red }) => (
                <tr key={conta} className="border-b border-border/50">
                  <td className={`${td} font-mono text-muted-foreground`}>{conta}</td>
                  <td className={td}>
                    {desc}
                    {red && <span className="ml-1.5 text-[9px] text-muted-foreground">(redutora)</span>}
                  </td>
                  <td className={`${td} text-right font-medium ${red ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    {valor}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} className={`${td} font-semibold`}>Total mensal</td>
                <td className={`${td} text-right text-[12px] font-bold`}>R$ 483.000,00</td>
              </tr>
            </tbody>
          </table>
        </Figura>

        <p>O sistema classifica cada conta em três grupos, e só o primeiro entra na base:</p>
        <ul className="ml-2 list-inside list-disc space-y-1">
          <li><strong>Creditável</strong> — custo, insumo, energia, frete, aluguel, licença de software</li>
          <li><strong>Não creditável</strong> — folha, encargos, provisões trabalhistas, tributos sobre o lucro</li>
          <li><strong>Revisar</strong> — despesa operacional que depende de análise (o caso clássico é comissão: paga a PJ gera crédito, a pessoa física não)</li>
        </ul>

        <Callout tipo="dica">
          Discorda de uma classificação? Ela pode ser <strong>reclassificada manualmente</strong>, e
          o ajuste fica salvo para aquele cliente. A linha passa a mostrar &quot;Reclassificado
          manualmente pelo usuário&quot; no lugar do motivo automático.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={LayoutGrid} titulo="Compare os regimes" rota="Comparar Regimes">
        <p>
          Coloca lado a lado a carga mensal em cada regime do sistema antigo e no IVA Dual. A
          coluna que interessa é a <strong>alíquota efetiva</strong> — o desembolso real depois do
          crédito.
        </p>

        <Figura
          rota="Comparar Regimes"
          legenda="Números fictícios. O padrão que costuma aparecer: quem tem muita despesa creditável tende a melhorar no IVA; quem quase não tem crédito — serviço com folha pesada — tende a piorar."
        >
          <table className="w-full min-w-[440px]">
            <thead>
              <tr className="border-b">
                <th className={`${th} text-left`}>Regime</th>
                <th className={`${th} text-right`}>Nominal</th>
                <th className={`${th} text-right`}>Crédito</th>
                <th className={`${th} text-right`}>Efetivo</th>
                <th className={`${th} text-right`}>Alíq. efetiva</th>
              </tr>
            </thead>
            <tbody>
              {[
                { r: 'Lucro Real', n: 'R$ 272.500', c: 'R$ 44.700', e: 'R$ 227.800', a: '22,78%', destaque: false },
                { r: 'Lucro Presumido', n: 'R$ 312.500', c: 'R$ 11.100', e: 'R$ 301.400', a: '30,14%', destaque: false },
                { r: 'Simples Nacional', n: 'R$ 121.100', c: '—', e: 'R$ 121.100', a: '12,11%', destaque: false },
                { r: 'IVA Dual (CBS+IBS)', n: 'R$ 280.000', c: 'R$ 135.200', e: 'R$ 144.800', a: '14,48%', destaque: true },
              ].map(({ r, n, c, e, a, destaque }) => (
                <tr key={r} className={`border-b border-border/50 ${destaque ? 'bg-muted/40' : ''}`}>
                  <td className={`${td} ${destaque ? 'font-semibold' : ''}`}>{r}</td>
                  <td className={`${td} text-right tabular-nums`}>{n}</td>
                  <td className={`${td} text-right tabular-nums`}>{c}</td>
                  <td className={`${td} text-right tabular-nums`}>{e}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Figura>

        <Callout tipo="info">
          As alíquotas de referência do IVA são <strong>CBS 9,3% + IBS 18,7% = 28%</strong>, o teto
          indicado pelo governo. Como a alíquota final ainda não foi fixada em lei — a estimativa
          oficial varia de 26,5% a 28% — os dois campos são editáveis na tela.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={TrendingUp} titulo="Mostre a transição ano a ano" rota="Transição 2026–2033">
        <p>
          A reforma não vira uma chave: ela acontece em etapas ao longo de oito anos. Esta é a
          seção que mais tranquiliza o cliente, porque mostra que a mudança é gradual e em que ano
          cada coisa acontece.
        </p>

        <Figura
          rota="Transição 2026–2033"
          legenda="A tabela na tela traz os oito anos; aqui estão os marcos. O ano que costuma assustar é 2027, quando a CBS entra cheia e o PIS/COFINS sai."
        >
          <table className="w-full min-w-[460px]">
            <thead>
              <tr className="border-b">
                <th className={`${th} text-left`}>Ano</th>
                <th className={`${th} text-right`}>Sistema antigo</th>
                <th className={`${th} text-right`}>CBS</th>
                <th className={`${th} text-right`}>IBS</th>
                <th className={`${th} text-left`}>O que muda</th>
              </tr>
            </thead>
            <tbody>
              {[
                { ano: '2026', antigo: 'integral', cbs: '0,9%', ibs: '0,1%', nota: 'Fase-teste, compensável' },
                { ano: '2027', antigo: 'só ICMS/ISS', cbs: 'cheia', ibs: '—', nota: 'PIS/COFINS extintos, IPI zerado' },
                { ano: '2029', antigo: '90%', cbs: 'cheia', ibs: '1/10', nota: 'IBS começa a substituir ICMS/ISS' },
                { ano: '2032', antigo: '60%', cbs: 'cheia', ibs: '4/10', nota: 'Último ano de convivência' },
                { ano: '2033', antigo: '—', cbs: 'cheia', ibs: 'cheia', nota: 'Sistema antigo extinto' },
              ].map(({ ano, antigo, cbs, ibs, nota }) => (
                <tr key={ano} className="border-b border-border/50">
                  <td className={`${td} font-semibold tabular-nums`}>{ano}</td>
                  <td className={`${td} text-right`}>{antigo}</td>
                  <td className={`${td} text-right`}>{cbs}</td>
                  <td className={`${td} text-right`}>{ibs}</td>
                  <td className={`${td} text-muted-foreground`}>{nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Figura>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={Share2} titulo="Feche na Visão Geral e mande para o cliente" rota="Visão Geral">
        <p>
          A Visão Geral junta tudo em uma página só, com o nome e o CNPJ do cliente no topo. É a
          parte que sai do sistema, por dois caminhos:
        </p>
        <ul className="ml-2 list-inside list-disc space-y-1">
          <li>
            <strong>Baixar resultados em PDF</strong> — abre a caixa de impressão do navegador.
            Escolha &quot;Salvar como PDF&quot; para gerar o arquivo.
          </li>
          <li>
            <strong>Compartilhar no WhatsApp</strong> — abre o WhatsApp com o resumo já escrito em
            texto, <strong>sem número de destino</strong>: você escolhe o contato na hora de enviar.
          </li>
        </ul>
        <Callout tipo="dica">
          O PDF sai da própria tela, então o que você ajustou na simulação é o que vai no
          documento. Confira os parâmetros antes de gerar.
        </Callout>
      </Step>

      <Step n={8} cor={MODULO_COLOR} icon={Sigma} titulo="Use a calculadora para uma operação avulsa" rota="Calculadora IBS/CBS">
        <p>
          Independente do cliente selecionado. Você informa o valor da operação, quanto dela gera
          crédito e uma eventual redução de alíquota, e ela devolve o débito de CBS e IBS, o
          crédito, quanto sobra a recolher e o total da nota com o imposto destacado.
        </p>
        <Callout tipo="info">
          Serve para a pergunta pontual do dia a dia — &quot;quanto de IBS/CBS essa venda de
          R$ 50 mil gera?&quot; — sem precisar montar a simulação inteira.
        </Callout>
      </Step>

      {/* ═══════════════ DE ONDE VÊM OS NÚMEROS ═══════════════ */}
      <h2 className="text-base font-bold pt-2">De onde vêm os números</h2>

      <Section icon={Database} titulo="A origem do faturamento" cor={FAQ_COLOR}>
        <p className="text-sm leading-relaxed text-foreground/80">
          O card de resumo sempre mostra a <strong>origem</strong> do faturamento, e ela muda a
          confiança que você pode ter no resultado:
        </p>
        <div className="mt-2 space-y-2 text-sm">
          <DefRow termo="Balancete" texto="Média mensal dos últimos 12 meses do balancete importado do SCI. É a melhor origem — número contábil, do cliente." />
          <DefRow termo="Contrato" texto="Faturamento registrado no gestor de contratos. Usado quando não há balancete importado." />
          <DefRow termo="Premissa" texto="Estimativa por porte ou segmento. É o pior caso: serve para não deixar a tela vazia, mas não leve para o cliente sem avisar." />
        </div>
        <Callout tipo="dica">
          Origem &quot;Premissa&quot; é o sinal de que falta importar o balancete. Volte ao passo 2
          antes de gerar qualquer PDF.
        </Callout>
      </Section>

      <Section icon={ShieldAlert} titulo="Duas regras que evitam número inflado" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <CasoPratico
            titulo="Só contas analíticas entram na conta"
            descricao={(
              <>
                O balancete traz o plano de contas inteiro, em todos os níveis: a conta totalizadora
                <span className="mx-1 font-mono text-[11px]">04.1.1</span> e as filhas que a compõem
                aparecem lado a lado. Somar as duas contaria o mesmo dinheiro duas vezes. O sistema
                considera apenas as contas <strong>analíticas</strong> — as pontas da árvore, onde o
                lançamento realmente acontece.
              </>
            )}
          />
          <CasoPratico
            titulo="Contas redutoras abatem, não somam"
            descricao={(
              <>
                Estornos, devoluções e deduções chegam do SCI ora com sinal negativo, ora positivo
                com o nome marcado —
                <span className="mx-1 font-mono text-[11px]">(-) ICMS sobre Compras</span>,
                <span className="ml-1 font-mono text-[11px]">Estorno de Crédito</span>. O sistema
                normaliza os dois casos e as trata sempre como redução da base. Por isso elas
                aparecem <strong>negativas</strong> na composição: é o comportamento correto, não
                erro de dado.
              </>
            )}
          />
        </div>
      </Section>

      {/* ═══════════════ LIMITES ═══════════════ */}
      <Section icon={ShieldAlert} titulo="O que o simulador não faz" cor={FAQ_COLOR}>
        <ul className="ml-2 list-inside list-disc space-y-1.5 text-sm text-foreground/80">
          <li>Não considera <strong>regimes específicos e diferenciados</strong> (saúde, educação, transporte, imóveis) nem cesta básica com alíquota zero.</li>
          <li>Não trata <strong>split payment</strong>, cashback para baixa renda nem Imposto Seletivo.</li>
          <li>O crédito do <strong>sistema antigo é aproximado</strong>: no Lucro Real as despesas creditam PIS/COFINS; no Presumido, que é cumulativo, quase não há crédito; no Simples não há nenhum.</li>
          <li>Não grava nada no cadastro do cliente — nenhuma simulação fica salva.</li>
        </ul>
        <Callout tipo="aviso">
          Use o resultado para <strong>abrir a conversa</strong> e priorizar quais clientes merecem
          um estudo dedicado. Nunca como peça técnica de defesa ou base para planejamento tributário
          formal.
        </Callout>
      </Section>

      {/* ═══════════════ FAQ ═══════════════ */}
      <Section icon={HelpCircle} titulo="Perguntas frequentes" cor={FAQ_COLOR}>
        <div className="space-y-3 text-sm">
          {[
            {
              q: 'O cliente não aparece na busca. Por quê?',
              r: 'A lista traz apenas clientes ativos com serviço mensal, da empresa em que você está. Confira o cadastro do cliente e a empresa selecionada no topo do sistema.',
            },
            {
              q: 'O faturamento veio zerado ou muito diferente do que eu esperava.',
              r: 'Olhe a origem no card de resumo. Se for "Premissa", falta importar o balancete. Se for "Balancete", abra o painel de sincronização e veja se há meses faltando na janela de 12 meses.',
            },
            {
              q: 'Posso mudar as alíquotas de CBS e IBS?',
              r: 'Sim, os dois campos são editáveis. A alíquota final ainda não foi fixada em lei, então vale simular tanto o teto de 28% quanto a estimativa menor de 26,5%.',
            },
            {
              q: 'Uma conta está classificada errada. Como corrijo?',
              r: 'Reclassifique manualmente na composição das despesas creditáveis. O ajuste fica salvo para aquele cliente e passa a valer nas próximas simulações.',
            },
            {
              q: 'Por que uma linha da composição aparece com valor negativo?',
              r: 'É uma conta redutora — estorno, devolução ou dedução. Ela abate a base de crédito, então o negativo está correto. A linha vem marcada com "(redutora)".',
            },
            {
              q: 'A simulação altera alguma coisa no cliente?',
              r: 'Não. Tudo é descartável, exceto duas coisas que ficam salvas: a reclassificação manual de contas e o balancete importado do SCI.',
            },
          ].map(({ q, r }) => (
            <div key={q} className="rounded-md border p-3">
              <p className="mb-1 text-sm font-semibold">{q}</p>
              <p className="text-[12px] leading-relaxed text-foreground/70">{r}</p>
            </div>
          ))}
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Atalhos</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <QuickLink href="/reforma-tributaria" label="Abrir o simulador" cor={MODULO_COLOR} />
        <QuickLink href="/clientes" label="Cadastro de clientes" cor={MODULO_COLOR} />
        <QuickLink href="/faq/bi-faturamento" label="FAQ: BI de Faturamento" cor={FAQ_COLOR} />
        <QuickLink href="/faq/bi-categorias-balancete" label="FAQ: Categorias de Balancete" cor={FAQ_COLOR} />
      </div>
    </ArticleShell>
  )
}
