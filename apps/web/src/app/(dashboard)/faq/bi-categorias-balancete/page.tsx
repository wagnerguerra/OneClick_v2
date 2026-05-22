'use client'

import {
  Calculator, Plus, FolderTree, Sigma, Eye, Settings,
  Lightbulb, Info, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-contabil, #8b5cf6)'
const FAQ_COLOR = '#0891b2'

export default function FaqBiCategoriasBalancetePage() {
  return (
    <ArticleShell
      modulo="Categorias de Balancete"
      moduloColor={MODULO_COLOR}
      icon={Calculator}
      titulo="Categorias de Balancete: regras de cálculo para KPIs"
      descricao="Como agrupar contas do plano contábil em categorias e definir fórmulas que alimentam os KPIs do BI Faturamento."
    >
      <Section icon={Info} titulo="Por que usar categorias" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Plano de contas" texto="Lista hierárquica de contas contábeis do cliente. Pode ter centenas de itens (3.1.01.001 = Receita de Vendas, 3.1.01.002 = Receita de Serviços, etc)." />
          <DefRow termo="Categoria" texto="Agrupamento lógico de contas — &quot;Receita Bruta&quot; junta todas as 3.1.x. Define o que entra/sai do somatório." />
          <DefRow termo="Operando" texto="Cada conta vinculada a uma categoria. Pode entrar como soma (+) ou subtração (−) dependendo da fórmula." />
          <DefRow termo="KPI" texto="Indicador derivado de fórmula sobre categorias. Ex: Margem = (Receita Bruta − Custo Pessoal − Custo Operacional) ÷ Receita Bruta." />
          <DefRow termo="Conta ignorada" texto="Conta excluída de um KPI específico (ex: receita não-recorrente fora do faturamento principal)." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Configuração</h2>

      <Step n={1} cor={MODULO_COLOR} icon={FolderTree} titulo="Listar categorias atuais" rota="/bi-categorias-balancete">
        <p>
          A página principal mostra as categorias já cadastradas, com indicação de quantas
          contas cada uma agrupa.
        </p>
        <Callout tipo="info">
          Categorias podem ser <strong>globais</strong> (aplicam a todos os clientes) ou
          <strong> por empresa</strong> (alguns escritórios atendem clientes com planos de contas
          muito distintos — vale ter regra específica).
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Plus} titulo="Criar uma categoria" rota="botão + Nova">
        <p>Para cada nova categoria informe:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Nome</strong> — &quot;Receita Bruta&quot;, &quot;Custo Pessoal&quot;, etc</li>
          <li><strong>Tipo</strong> — Receita / Custo / Despesa / Outro (afeta cor e ordenação)</li>
          <li><strong>Cor</strong> — exibida nos gráficos do BI</li>
          <li><strong>Descrição</strong> opcional — texto explicativo para outros usuários</li>
        </ul>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Sigma} titulo="Adicionar contas (operandos)" rota="categoria → + Adicionar">
        <p>Dentro da categoria, vincule cada conta:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Busque pelo <strong>código</strong> (3.1.01) ou <strong>nome</strong> da conta</li>
          <li>Defina sinal: <strong>soma (+)</strong> para receitas, <strong>subtração (−)</strong> para deduções</li>
          <li>Pode adicionar contas em massa (multi-select)</li>
        </ul>
        <Callout tipo="dica">
          Use <strong>operadores curinga</strong> tipo <code className="text-[11px]">3.1.*</code> (todas as contas que começam com 3.1) para
          incluir contas futuras automaticamente — útil quando o plano de contas evolui.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Calculator} titulo="Definir KPIs derivados" rota="aba KPIs">
        <p>
          Após ter categorias, monte <strong>KPIs</strong> com fórmulas:
        </p>
        <div className="rounded-md border bg-muted/30 p-3 text-[11px] font-mono space-y-1">
          <p><strong>Margem Operacional</strong> = (Receita Bruta − Custo Pessoal − Custo Operacional) ÷ Receita Bruta</p>
          <p><strong>Lucro Líquido</strong> = Receita Bruta − Total Custos − Total Despesas − Impostos</p>
          <p><strong>Receita por Cliente</strong> = Receita Bruta ÷ Quantidade de Clientes</p>
        </div>
        <Callout tipo="info">
          Fórmulas são guardadas como expressões nas regras de cálculo. Sempre que um
          balancete novo é importado, o KPI é recalculado.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={Eye} titulo="Validar com balancete real" rota="/bi-faturamento → Matriz">
        <p>
          Depois de configurar, abra o BI Faturamento, escolha um cliente e a categoria
          configurada. Confronte com balancete oficial:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Valor bate com soma manual no Excel?</li>
          <li>Há contas suspeitas que não deveriam estar?</li>
          <li>Sinais corretos (entrou como + quando devia ser −)?</li>
        </ul>
        <Callout tipo="aviso">
          Esse passo é <strong>crítico</strong> — KPIs incorretos enganam decisões.
          Reserve tempo no setup inicial para validar antes de divulgar internamente.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Settings} titulo="Manutenção contínua">
        <p>
          Conforme planos de contas evoluem (clientes mudam regime, agregam novas atividades),
          revise mensalmente:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Aba <strong>&quot;Contas não categorizadas&quot;</strong> em /bi-faturamento → Gerenciar — mostra contas que caíram em &quot;Outros&quot;</li>
          <li>Mover essas contas para a categoria adequada</li>
          <li>Atualizar curingas quando padrões de codificação mudam</li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Receita Bruta divergindo do balancete</p>
            <p className="text-foreground/70">
              Conta nova entrou no SCI e não foi categorizada. Vá em /bi-faturamento →
              Gerenciar Contas, ordene por &quot;Outros&quot; e mova as relevantes.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente quer KPI customizado dele</p>
            <p className="text-foreground/70">
              Crie a categoria escopada à <strong>empresa</strong> daquele cliente — assim
              não impacta os demais. Útil para acordos comerciais específicos.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Conta com sinal trocado</p>
            <p className="text-foreground/70">
              Edite o operando dentro da categoria e troque + por −. KPI será recalculado
              na próxima importação ou ao forçar reimportação no /bi-faturamento.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/bi-categorias-balancete" label="Configurar categorias" cor={MODULO_COLOR} />
          <QuickLink href="/bi-faturamento" label="Ver impacto nos KPIs" cor={MODULO_COLOR} />
          <QuickLink href="/clientes" label="Verificar idSistema SCI" cor={MODULO_COLOR} />
          <QuickLink href="/faq/bi-faturamento" label="Como usar BI Faturamento" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
