'use client'

import {
  BarChart2, Database, Eye, Table2, PieChart, Settings2,
  Lightbulb, Info, ArrowRight, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-contabil, #8b5cf6)'
const FAQ_COLOR = '#0891b2'

export default function FaqBiFaturamentoPage() {
  return (
    <ArticleShell
      modulo="BI Faturamento"
      moduloColor={MODULO_COLOR}
      icon={BarChart2}
      titulo="BI Faturamento: KPIs, balancete e dashboard financeiro"
      descricao="Importação de balancete do SCI, cálculo de KPIs e visualização em matriz, análise e gerenciamento de contas."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Balancete" texto="Demonstrativo contábil mensal com saldos por conta. Importado do ERP do cliente (SCI Firebird)." />
          <DefRow termo="Categoria" texto="Agrupamento de contas para calcular um KPI (ex: Receita Bruta = soma de contas 3.1.x). Configurável por empresa." />
          <DefRow termo="KPI" texto="Indicador derivado de fórmula sobre categorias (ex: Margem = (Receita - Custo) / Receita)." />
          <DefRow termo="Matriz" texto="Visualização principal — clientes nas linhas, meses nas colunas, valores no cruzamento." />
          <DefRow termo="Linha contábil" texto="Plano de contas por cliente — pode ser sincronizado com o SCI ou cadastrado manualmente." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Setup inicial</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Database} titulo="Garantir cadastro do cliente no SCI" rota="/clientes/[id] → aba Integrações">
        <p>
          Para que um cliente apareça nos relatórios do BI, ele precisa estar:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Cadastrado em <strong>/clientes</strong></li>
          <li>Com <code className="text-[11px]">idSistema</code> SCI preenchido (vincula ao banco Firebird)</li>
          <li>Com situação <strong>MENSAL</strong> ou <strong>EVENTUAL</strong> (inativos não importam)</li>
        </ul>
        <Callout tipo="aviso">
          Sem <code className="text-[11px]">idSistema</code>, a importação automática
          de balancete não funciona — cliente fica fora dos gráficos.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Settings2} titulo="Configurar categorias" rota="/bi-categorias-balancete">
        <p>
          Antes de ver KPIs, é necessário definir agrupamentos de contas em categorias.
          Veja o artigo separado:
        </p>
        <Callout tipo="info">
          Detalhamento em <a className="text-violet-600 hover:underline" href="/faq/bi-categorias-balancete">Categorias de Balancete</a>.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Eye} titulo="Aba Visão Geral" rota="/bi-faturamento → Visão Geral">
        <p>
          Apresenta cards com indicadores agregados do tenant ou de um cliente selecionado:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Faturamento mês atual vs mês anterior (variação %)</li>
          <li>Margem operacional</li>
          <li>Top 5 categorias de receita / custo</li>
          <li>Comparativo com mesmo mês do ano anterior</li>
        </ul>
        <Callout tipo="dica">
          Use o seletor de cliente no topo para alternar entre visão consolidada (todos os
          clientes) e visão individual.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Table2} titulo="Aba Matriz de Resultados" rota="aba Matriz">
        <p>
          Tabela cruzada — <strong>clientes nas linhas, meses nas colunas</strong>, valor por categoria
          escolhida. Útil para:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Comparar faturamento entre clientes ao longo do ano</li>
          <li>Identificar quedas bruscas (cor vermelha quando variação &gt; -10%)</li>
          <li>Exportar para Excel para apresentação a sócios</li>
        </ul>
        <Callout tipo="info">
          Categoria é selecionável (Receita Bruta, Lucro Líquido, Custo Pessoal, etc).
          Cada categoria tem suas próprias regras de cálculo configuradas em /bi-categorias-balancete.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={PieChart} titulo="Aba Análise" rota="aba Análise">
        <p>
          Gráficos de pizza, barras e linhas por cliente:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Composição de receita (% por categoria)</li>
          <li>Evolução mensal (linha temporal)</li>
          <li>Comparativo entre regimes (Simples vs Presumido vs Real)</li>
        </ul>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Settings2} titulo="Aba Gerenciar Contas" rota="aba Gerenciar Contas">
        <p>
          Lista de contas do plano contábil do cliente — útil para diagnosticar:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Contas <strong>não categorizadas</strong> (não estão em nenhum agrupamento — viram &quot;Outros&quot;)</li>
          <li>Contas com saldo zero (sinalizadas em cinza)</li>
          <li>Contas <strong>ignoradas</strong> em KPIs específicos</li>
        </ul>
        <Callout tipo="aviso">
          Contas novas que aparecem no SCI <strong>caem em &quot;Outros&quot;</strong> até serem categorizadas.
          Revise periodicamente para manter os KPIs precisos.
        </Callout>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={RefreshCw} titulo="Forçar reimportação" rota="botão Reimportar">
        <p>
          Após mudanças no balancete (correções, lançamentos extemporâneos), force
          reimportação da competência:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Limpa o cache do BI para o cliente / período selecionado</li>
          <li>Refaz a leitura do banco SCI Firebird</li>
          <li>Recalcula todos os KPIs derivados</li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente não aparece nos gráficos</p>
            <p className="text-foreground/70">
              1. Confira <code className="text-[11px]">idSistema</code> SCI no cadastro do cliente.
              2. Verifique acesso ao SCI (DSN, usuário, charset). 3. Cliente pode ainda
              não ter balancete na competência — confirme no próprio SCI antes.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">KPI mostra valor estranho (negativo, muito grande)</p>
            <p className="text-foreground/70">
              Provavelmente uma conta caiu na categoria errada. Vá em &quot;Gerenciar
              Contas&quot;, identifique a conta com saldo discrepante e revise sua
              categorização em <code className="text-[11px]">/bi-categorias-balancete</code>.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente novo precisa entrar imediatamente</p>
            <p className="text-foreground/70">
              Após cadastrar e vincular ao SCI, dispare <strong>Reimportar</strong>{' '}
              para a competência atual. Não precisa esperar o agendamento mensal.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/bi-faturamento" label="Dashboard BI" cor={MODULO_COLOR} />
          <QuickLink href="/bi-categorias-balancete" label="Configurar categorias" cor={MODULO_COLOR} />
          <QuickLink href="/clientes" label="Vincular ao SCI" cor={MODULO_COLOR} />
          <QuickLink href="/faq/bi-categorias-balancete" label="Como configurar categorias" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
