'use client'

import {
  Calculator, Info, Users, RefreshCw, Settings2, LayoutGrid, TrendingUp,
  Sigma, Database, Share2, ShieldAlert, HelpCircle,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import {
  Section, Step, Callout, QuickLink, DefRow, Figura, CasoPratico,
} from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-fiscal, #0369a1)'
const FAQ_COLOR = '#0891b2'
const IMG = '/materiais/faq/reforma-tributaria'

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
            <em> split payment</em> nem cashback. A própria tela avisa isso no rodapé da navegação.
            Serve para dimensionar e provocar a conversa — a decisão do cliente precisa de análise
            dedicada.
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
        No topo ficam o seletor de cliente e um resumo do que foi carregado. A navegação fica na
        coluna da esquerda e tem cinco paradas: <strong>Configurar</strong> monta a simulação,
        <strong> Comparar Regimes</strong> e <strong>Transição</strong> analisam,
        <strong> Visão Geral</strong> fecha o resultado e a <strong>Calculadora</strong> é avulsa.
      </p>

      <Figura
        rota="/reforma-tributaria · Configurar"
        src={`${IMG}/configurar.jpg`}
        alt="Tela Configurar do simulador da Reforma Tributária, com o seletor de cliente no topo, a navegação lateral e os campos de regime, atividade, faturamento e despesas creditáveis."
        legenda={(
          <>
            A tela inteira. No topo, o seletor de cliente e o resumo (regime, atividade,
            faturamento e a carga de hoje → nova). No corpo, os dados da empresa e as alíquotas
            editáveis dos dois sistemas. <strong>Nas capturas deste artigo, razão social, CNPJ e
            valores em reais aparecem borrados de propósito</strong> — o FAQ é comum a toda a
            instalação e não pode expor o dado de um cliente.
          </>
        )}
      />

      {/* ═══════════════ PASSO A PASSO ═══════════════ */}
      <h2 className="text-base font-bold pt-2">Passo a passo</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Users} titulo="Escolha o cliente" rota="seletor no topo">
        <p>
          O seletor busca <strong>no servidor</strong>, conforme você digita, entre os clientes
          <strong> ativos e mensais</strong> da empresa em que você está — não é um filtro sobre uma
          lista curta carregada antes. Dá para procurar por nome ou por CNPJ.
        </p>
        <p>
          Assim que você escolhe, a tela inteira se recarrega e o painel ao lado resume o que o
          sistema encontrou: <strong>regime</strong>, <strong>atividade</strong>,
          <strong> faturamento/mês</strong> e a <strong>carga hoje → nova</strong> em alíquota
          efetiva. Esse último par já é a resposta curta da simulação.
        </p>
        <Callout tipo="info">
          Só aparecem clientes <strong>ativos com serviço mensal</strong>. Se o cliente que você
          procura não aparece, o problema costuma estar no cadastro dele — e não na busca.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={RefreshCw} titulo="Confira até quando o balancete está sincronizado" rota="botão Balancete, no topo à direita">
        <p>
          A simulação vale o que vale o balancete por trás dela. O botão <strong>Balancete</strong>,
          no canto superior direito, abre um painel que responde de uma vez: até que mês os dados
          chegaram, quantos meses e quantas linhas foram importados, e se isso está em dia com o
          último mês fechado.
        </p>

        <Figura
          rota="Balancete do cliente"
          src={`${IMG}/balancete.jpg`}
          alt="Painel do balancete mostrando o mês até onde está sincronizado, a quantidade de meses e linhas importadas, o aviso de que está em dia e o botão Atualizar do SCI."
          legenda="Quando falta mês dentro da janela de 12 meses, o painel lista as lacunas em vez do aviso verde — buracos no meio distorcem a média mensal. A linha de baixo diz se o Service Manager está conectado."
        />

        <p>
          <strong>Atualizar do SCI</strong> busca os últimos 12 meses fechados. Quem executa a
          leitura é o <strong>Service Manager</strong>, no computador que enxerga o banco do SCI —
          por isso o painel avisa se ele está conectado. Se estiver fechado, não há quem atenda o
          pedido: abra o Service Manager e tente de novo.
        </p>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Settings2} titulo="Revise os parâmetros" rota="Configurar">
        <p>
          Quatro campos definem a simulação. Regime e atividade vêm do cadastro; faturamento e
          despesas creditáveis vêm do balancete — e todos podem ser ajustados na mão para testar
          cenários.
        </p>
        <ul className="ml-2 list-inside list-disc space-y-1">
          <li><strong>Regime tributário atual</strong> — Lucro Real, Lucro Presumido ou Simples Nacional</li>
          <li><strong>Atividade</strong> — Indústria, Comércio ou Serviços</li>
          <li><strong>Faturamento mensal</strong> — em reais, com a origem declarada logo abaixo do campo</li>
          <li><strong>Despesas mensais creditáveis</strong> — clicável, abre a composição</li>
        </ul>
        <p>
          Mais abaixo ficam as <strong>alíquotas</strong>, editáveis nos dois lados: IVA Dual
          (CBS e IBS, com o total somado) e sistema antigo (PIS, COFINS, ISS ou ICMS/IPI conforme a
          atividade).
        </p>

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
          onde o número saiu, com o código contábil ao lado.
        </p>

        <Figura
          rota="Despesas mensais creditáveis"
          src={`${IMG}/composicao.jpg`}
          alt="Modal com a lista de contas do balancete classificadas como creditáveis, mostrando código, descrição e valor mensal de cada uma."
          legenda="Cada linha é uma conta analítica do balancete. O total é a média mensal dos últimos 12 meses, e o rodapé mostra quantas contas entraram."
        />

        <p>O sistema classifica cada conta em três grupos, e só o primeiro entra na base:</p>
        <ul className="ml-2 list-inside list-disc space-y-1">
          <li><strong>Creditável</strong> — custo, insumo, energia, frete, aluguel, licença de software</li>
          <li><strong>Não creditável</strong> — folha, encargos, provisões trabalhistas, tributos sobre o lucro</li>
          <li><strong>Revisar</strong> — despesa operacional que depende de análise (o caso clássico é comissão: paga a PJ gera crédito, a pessoa física não)</li>
        </ul>

        <Callout tipo="aviso">
          Se uma conta estiver classificada de forma discutível, hoje <strong>não há como corrigir
          pela tela</strong>: o controle de reclassificação existia na versão anterior da página e
          ainda não voltou na atual. O cálculo por trás continua respeitando reclassificações já
          gravadas — se precisar de uma, peça ao time de sistemas.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={LayoutGrid} titulo="Compare os regimes" rota="Comparar Regimes">
        <p>
          Coloca lado a lado a carga mensal em cada regime do sistema antigo e no IVA Dual, com o
          regime atual do cliente destacado. A linha que interessa é a <strong>alíquota
          efetiva</strong> — o desembolso real depois do crédito.
        </p>

        <Figura
          rota="Comparar Regimes"
          src={`${IMG}/comparar-regimes.jpg`}
          alt="Tabela comparando Lucro Real, Lucro Presumido, Simples Nacional e IVA Dual, linha a linha, até a alíquota efetiva de cada um."
          legenda="A tabela desce de PIS/COFINS/ISS até os créditos, o total nominal e o total efetivo. As duas últimas linhas — alíquota nominal e efetiva — são a leitura rápida."
        />

        <Callout tipo="info">
          As alíquotas de referência do IVA são <strong>CBS 9,3% + IBS 18,7% = 28%</strong>, o teto
          indicado pelo governo. Como a alíquota final ainda não foi fixada em lei — a estimativa
          oficial varia de 26,5% a 28% — os dois campos são editáveis em Configurar.
        </Callout>

        <Callout tipo="dica">
          A tela lembra, num aviso abaixo da tabela, que a simulação não deve ser lida só pela
          alíquota final: quem compra do seu cliente pode aproveitar o crédito, e isso muda a
          competitividade do negócio.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={TrendingUp} titulo="Mostre a transição ano a ano" rota="Transição 2026–2033">
        <p>
          A reforma não vira uma chave: acontece em etapas até 2033. Esta é a seção que mais
          tranquiliza o cliente, porque mostra que a mudança é gradual e em que ano cada coisa
          acontece.
        </p>

        <Figura
          rota="Transição 2026–2033"
          src={`${IMG}/transicao.jpg`}
          alt="Tabela ano a ano de 2026 a 2033 com as colunas sistema antigo, IBS, CBS, total a pagar e variação em relação a hoje."
          legenda="A coluna &quot;vs hoje&quot; compara o total de cada ano com a carga atual — é a única que fica visível aqui, e mostra a curva subindo conforme o IBS entra."
        />

        <p>Os marcos que a tabela desenha:</p>
        <ul className="ml-2 list-inside list-disc space-y-1">
          <li><strong>2026</strong> — fase-teste, com CBS a 0,9% e IBS a 0,1%, compensáveis</li>
          <li><strong>2027 e 2028</strong> — PIS/COFINS extintos, IPI zerado, CBS cheia</li>
          <li><strong>2029 a 2032</strong> — o IBS entra em décimos enquanto ICMS/ISS saem na mesma proporção</li>
          <li><strong>2033</strong> — sistema antigo extinto</li>
        </ul>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={Share2} titulo="Feche na Visão Geral e mande para o cliente" rota="Visão Geral">
        <p>
          A Visão Geral junta tudo em uma página só, com o nome, o CNPJ e a cidade do cliente no
          topo, e quatro números grandes: imposto de hoje, pós-reforma, diferença mensal e a
          variação em porcentagem — mais o custo adicional anual estimado.
        </p>

        <Figura
          rota="Visão Geral"
          src={`${IMG}/visao-geral.jpg`}
          alt="Página de resultado com os cartões de imposto hoje, pós-reforma, diferença mensal e variação, os botões de PDF e WhatsApp e os gráficos de comparação."
          legenda="É a página que vai para o cliente. Os dois gráficos comparam o imposto mensal antes e depois, e a alíquota efetiva de cada regime."
        />

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
          Logo abaixo do campo <strong>Faturamento mensal</strong>, a tela declara de onde aquele
          número saiu — e isso muda a confiança que você pode ter no resultado:
        </p>
        <div className="mt-2 space-y-2 text-sm">
          <DefRow termo="Balancete" texto="Média mensal das contas de receita do balancete importado do SCI. É a melhor origem — número contábil, do cliente." />
          <DefRow termo="Contrato" texto="Faturamento registrado no gestor de contratos. Usado quando não há balancete importado." />
          <DefRow termo="Premissa" texto="Estimativa por porte ou segmento. É o pior caso: serve para não deixar a tela vazia, mas não leve para o cliente sem avisar." />
        </div>
        <Callout tipo="dica">
          Se a linha não disser &quot;balancete importado&quot;, volte ao passo 2 antes de gerar
          qualquer PDF.
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
                lançamento realmente acontece. É por isso que a composição mostra só códigos
                completos, do tipo <span className="font-mono text-[11px]">04.1.1.01.001</span>.
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
                normaliza os dois casos e as trata sempre como redução da base. Quando o cliente
                tem uma dessas, ela aparece <strong>negativa</strong> na composição: é o
                comportamento correto, não erro de dado.
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
              r: 'Olhe a linha abaixo do campo Faturamento mensal. Se não disser que veio do balancete importado, falta importar. Se disser, abra o painel Balancete e veja se há meses faltando na janela de 12 meses.',
            },
            {
              q: 'Cliquei em Atualizar do SCI e não aconteceu nada.',
              r: 'A leitura é feita pelo Service Manager, no computador que enxerga o banco do SCI. O próprio painel diz se ele está conectado — se não estiver, abra o Service Manager e repita.',
            },
            {
              q: 'Posso mudar as alíquotas de CBS e IBS?',
              r: 'Sim, os dois campos são editáveis em Configurar. A alíquota final ainda não foi fixada em lei, então vale simular tanto o teto de 28% quanto a estimativa menor de 26,5%.',
            },
            {
              q: 'Uma conta está classificada errada. Como corrijo?',
              r: 'Pela tela, hoje não dá: o controle de reclassificação ficou na versão anterior da página e ainda não voltou. O cálculo respeita reclassificações já gravadas, então peça ao time de sistemas.',
            },
            {
              q: 'Por que uma linha da composição aparece com valor negativo?',
              r: 'É uma conta redutora — estorno, devolução ou dedução. Ela abate a base de crédito, então o negativo está correto.',
            },
            {
              q: 'A simulação altera alguma coisa no cliente?',
              r: 'Não. Tudo que você mexe é descartável. A única coisa que fica gravada é o balancete importado do SCI.',
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
