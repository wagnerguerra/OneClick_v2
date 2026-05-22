'use client'

import {
  Workflow, Lightbulb, Settings, FileText, Play, ListChecks,
  Pause, Ban, Network, ArrowRight, Info,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import {
  Section, Step, Callout, CasoPratico, QuickLink, DefRow, FlagRow, CascadeRow,
} from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-processos, #8b5cf6)'
const FAQ_COLOR = '#0891b2'

export default function FaqProcessosPage() {
  return (
    <ArticleShell
      modulo="Fluxo de Processos"
      moduloColor={MODULO_COLOR}
      icon={Workflow}
      titulo="Fluxo de Processos: do orçamento à conclusão"
      descricao="Como configurar serviços encadeados, aprovar orçamentos que disparam processos automáticos e acompanhar a cadeia até o final."
    >
      {/* Glossário */}
      <Section icon={Info} titulo="Glossário rápido" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Serviço (template)" texto="Modelo cadastrado em /servicos com etapas e passos. É o &quot;molde&quot; — não executa nada por si só." />
          <DefRow termo="Execução" texto="Instância de um serviço para um cliente específico. Tem checklist próprio com passos a marcar." />
          <DefRow termo="Encadeamento" texto="Aresta entre dois serviços-template: ao concluir A, dispara a criação de execução de B." />
          <DefRow termo="Processo" texto="Agregador de várias execuções encadeadas. Ex: &quot;Transferência de Contabilidade — ACME LTDA&quot; agrupa Legalização → Onboarding → Capacitação." />
          <DefRow termo="Sucessor" texto="Execução criada automaticamente após o predecessor concluir. Pode ser obrigatório ou opcional." />
        </div>
      </Section>

      {/* Diagrama */}
      <Section icon={Network} titulo="Visão geral do fluxo" cor={FAQ_COLOR}>
        <div className="rounded-lg border bg-muted/30 p-4">
          <pre className="text-[11px] leading-snug font-mono text-foreground/80 overflow-x-auto whitespace-pre">
{`  ┌───────────────────┐
  │  1. CONFIGURAR    │   /servicos
  │  templates +      │   Cadastrar serviços, etapas, passos
  │  encadeamentos    │   e definir "Próximos serviços"
  └─────────┬─────────┘
            │
            ▼
  ┌───────────────────┐
  │  2. ORÇAMENTO     │   /orcamentos
  │  com itens        │   Adicionar itens do tipo SERVIÇO
  │  SERVIÇO          │   apontando para os templates
  └─────────┬─────────┘
            │  (transição APROVADO)
            ▼
  ┌───────────────────┐
  │  3. PROCESSO +    │   automático no backend
  │  EXECUÇÃO RAIZ    │   1 processo por item SERVIÇO
  │  criados          │   responsável é notificado
  └─────────┬─────────┘
            │
            ▼
  ┌───────────────────┐
  │  4. CHECKLIST     │   /meus-servicos
  │  passos sendo     │   Responsável marca passos
  │  concluídos       │   um a um
  └─────────┬─────────┘
            │  (último passo concluído)
            ▼
  ┌───────────────────┐
  │  5. CASCATA       │   automático
  │  • Sucessores     │   • Avalia condicionais
  │  • Orçamento      │   • Cria execuções dos próximos
  │    FINALIZADO     │   • Finaliza o orçamento (raiz)
  └─────────┬─────────┘
            │
            ▼
  ┌───────────────────┐
  │  6. PENDÊNCIAS    │   /processos/[id]
  │  Iniciar / Pular  │   Gestor age sobre sucessores
  │  sucessores       │   AGUARDANDO_INICIO
  └─────────┬─────────┘
            │
            ▼
  ┌───────────────────┐
  │  7. PROCESSO      │   automático quando todas as
  │  CONCLUÍDO        │   execuções atingem estado
  │                   │   terminal (Concluído/Pulado)
  └───────────────────┘`}
          </pre>
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Passo a passo detalhado</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Settings} titulo="Configurar o serviço-template" rota="/servicos">
        <p>
          No menu <strong>Cadastros → Serviços</strong>, crie ou edite um serviço (ex:{' '}
          <em>&quot;Transferência de Contabilidade&quot;</em>). Configure:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Etapas</strong> e <strong>passos</strong> — o checklist da execução</li>
          <li><strong>SLA</strong> — prazo para conclusão (em horas)</li>
          <li><strong>Disponível em orçamentos</strong> — para aparecer no seletor</li>
          <li><strong>Recorrente mensal</strong> — marca serviços recorrentes (entram em contratos)</li>
        </ul>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Network} titulo='Definir os "Próximos serviços" (encadeamento)' rota="/servicos (modal de edição)">
        <p>
          Ainda no modal de edição, role até a seção <strong>Próximos serviços</strong> e
          clique em <strong>+ Adicionar sucessor</strong>. Para cada sucessor configure:
        </p>
        <div className="space-y-2 mt-2">
          <FlagRow label="Obrigatório"
            on="Execução é criada e precisa rodar (não pode ser pulada)"
            off='Execução é criada em "Aguardando início" — gestor pode pular' />
          <FlagRow label="Iniciar automaticamente"
            on="Execução já começa em andamento (SLA conta de imediato)"
            off='Fica em "Aguardando início" até o gestor confirmar' />
          <FlagRow label="Herdar responsável"
            on="Mesmo responsável da execução predecessora"
            off="Sucessor fica sem responsável (gestor atribui)" />
        </div>
        <Callout tipo="dica">
          A combinação <strong>obrigatório=true + auto=true</strong> é o caminho feliz: rodam
          sequencialmente sem interferência. Use <strong>opcional</strong> quando o sucessor
          depende de uma decisão (ex: cliente quer apenas o serviço A, sem o complemento B).
        </Callout>
      </Step>

      <Section icon={Network} titulo="Identificar serviços em cadeia na listagem" cor={FAQ_COLOR}>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Após configurar encadeamentos, a listagem em <code className="text-[11px]">/servicos</code> passa a
          mostrar <strong>badges contextuais</strong> que diferenciam serviços únicos
          dos que fazem parte de uma cadeia de processos.
        </p>
        <div className="space-y-2 mt-3">
          <div className="rounded-md border p-2.5 text-[12px]">
            <p className="font-semibold mb-1">Sem badge — Serviço único</p>
            <p className="text-foreground/70">
              Não tem sucessor nem predecessor. Roda isoladamente quando aprovado num orçamento.
            </p>
          </div>
          <div className="rounded-md border p-2.5 text-[12px]">
            <p className="font-semibold mb-1">
              <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400">
                <Network className="h-2.5 w-2.5 mr-0.5" />Início
              </Badge>{' '}— Raiz da cadeia
            </p>
            <p className="text-foreground/70">
              Tem sucessores mas ninguém aponta para ele. É quem dispara o processo no orçamento APROVADO.
            </p>
          </div>
          <div className="rounded-md border p-2.5 text-[12px]">
            <p className="font-semibold mb-1">
              <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400">
                <Network className="h-2.5 w-2.5 mr-0.5" />Meio
              </Badge>{' '}— Intermediário
            </p>
            <p className="text-foreground/70">
              Tem predecessor + sucessor. É um nó interno da árvore.
            </p>
          </div>
          <div className="rounded-md border p-2.5 text-[12px]">
            <p className="font-semibold mb-1">
              <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400">
                <Network className="h-2.5 w-2.5 mr-0.5" />Final
              </Badge>{' '}— Folha da cadeia
            </p>
            <p className="text-foreground/70">
              Recebe encadeamento mas não dispara mais nada. Quando concluído, o processo
              pode encerrar (se for o último elo pendente).
            </p>
          </div>
        </div>
        <Callout tipo="dica">
          O <strong>filtro &quot;Tipo de serviço&quot;</strong> no topo da lista permite
          isolar rapidamente: serviços únicos, qualquer participante de cadeia, ou
          recortes específicos (raízes, intermediários, folhas). <strong>Hover</strong> em
          cada badge mostra a contagem exata de sucessores/predecessores.
        </Callout>
      </Section>

      <Step n={3} cor={MODULO_COLOR} icon={Lightbulb} titulo="(Opcional) Adicionar uma condicional" rota="/servicos (dialog de sucessor)">
        <p>
          Na criação/edição do sucessor, configure a seção <strong>Condição</strong> para
          que o sistema avalie regras antes de criar a execução. Modos:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Sempre</strong> — cria sucessor sem condição (default)</li>
          <li><strong>Todas as regras (E)</strong> — todas as regras precisam ser verdade</li>
          <li><strong>Pelo menos uma (OU)</strong> — basta uma ser verdade</li>
        </ul>
        <p>Cada regra é composta por: <strong>campo</strong>, <strong>operador</strong>, <strong>valor</strong>.</p>
        <div className="rounded-md border bg-muted/30 p-3 text-[11px] font-mono">
          <p className="font-semibold mb-1.5">Exemplo prático:</p>
          <p>Cliente regime: <span className="text-violet-600">igual a</span> SIMPLES</p>
          <p className="text-muted-foreground italic">→ só cria sucessor se o cliente for do Simples Nacional</p>
        </div>
        <Callout tipo="aviso">
          Se a condição falhar, o sucessor não é criado e um evento{' '}
          <code className="text-[11px]">sucessor_pulado_condicao</code> fica registrado na timeline do processo.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={FileText} titulo="Criar e aprovar o orçamento" rota="/orcamentos">
        <p>
          No módulo <strong>Comercial → Orçamentos</strong>, crie um novo orçamento para o
          cliente. Adicione um <strong>item de tipo SERVIÇO</strong> apontando para o
          template configurado nos passos anteriores.
        </p>
        <p>
          Quando o orçamento é movido para <strong>APROVADO</strong>, o sistema dispara
          automaticamente:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Cria 1 <strong>Processo</strong> agregador por item de serviço</li>
          <li>Cria a <strong>execução-raiz</strong> vinculada ao processo</li>
          <li>Notifica o responsável via sino global (se diferente de quem aprovou)</li>
          <li>Status do orçamento avança para LIBERADO/FINALIZADO conforme o fluxo</li>
        </ul>
        <Callout tipo="info">
          O processo herda do orçamento: <strong>cliente</strong>, <strong>responsável</strong>,
          <strong> empresa</strong>. O nome do processo é gerado como <em>&quot;Nome do serviço — Razão social&quot;</em>.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={ListChecks} titulo="Executar o checklist" rota="/meus-servicos">
        <p>
          O responsável vê a execução em <strong>Administrativo → Meus Serviços</strong>{' '}
          e marca cada passo conforme realiza o trabalho. Detalhes:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Passos obrigatórios pendentes bloqueiam</strong> a conclusão da execução</li>
          <li>
            Passos com <strong>permiteIgnorar</strong> podem ser pulados sem concluir — desbloqueia o próximo
          </li>
          <li>
            Anexos e comentários por passo ficam disponíveis (ícones <Pause className="h-3 w-3 inline" /> ao lado)
          </li>
          <li>Pausa do serviço &quot;congela&quot; o SLA até o gestor retomar</li>
        </ul>
        <Callout tipo="dica">
          Quando todos os passos obrigatórios estão fechados (concluídos ou ignorados),
          o botão <strong>&quot;Concluir execução&quot;</strong> fica disponível para finalizar de
          uma vez sem precisar marcar passo a passo.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Workflow} titulo="Cascata automática ao concluir">
        <p>
          Quando a última etapa da execução é concluída, o backend roda{' '}
          <code className="text-[11px]">finalizarExecucaoComCascata</code> — três ações encadeadas:
        </p>
        <div className="space-y-2 mt-2">
          <CascadeRow ordem="1" titulo="Orçamento → FINALIZADO" cor={MODULO_COLOR}>
            Apenas a <strong>execução-raiz</strong> dispara isso. Sucessores herdam o
            orcamentoId mas não refinalizam.
          </CascadeRow>
          <CascadeRow ordem="2" titulo="Cria sucessores" cor={MODULO_COLOR}>
            Lê os ServicoEncadeamento configurados no passo 2, avalia condicionais (passo 3)
            e cria as próximas execuções com herança correta.
          </CascadeRow>
          <CascadeRow ordem="3" titulo="Recalcula status do processo" cor={MODULO_COLOR}>
            Se todas as execuções da cadeia chegaram em estado terminal
            (CONCLUIDO / PULADO / CANCELADO), o processo vai para <strong>CONCLUIDO</strong>.
          </CascadeRow>
        </div>
        <Callout tipo="info">
          Cada sucessor é criado com status conforme as flags do encadeamento:
          <ul className="list-disc list-inside mt-1 ml-2 space-y-0.5">
            <li>obrigatório + auto → <Badge variant="outline" className="text-[10px] h-4 bg-violet-50 border-violet-200 text-violet-700">EM_ANDAMENTO</Badge> (SLA conta de imediato)</li>
            <li>opcional ou não-auto → <Badge variant="outline" className="text-[10px] h-4 bg-amber-50 border-amber-200 text-amber-700">AGUARDANDO_INICIO</Badge> (gestor age)</li>
          </ul>
        </Callout>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={Play} titulo="Gerenciar pendências" rota="/processos/[id] aba Pendências">
        <p>
          Sucessores em <strong>AGUARDANDO_INICIO</strong> aparecem na aba{' '}
          <strong>Pendências</strong> com dois botões:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Iniciar</strong> — muda para EM_ANDAMENTO,{' '}
            recalcula o <strong>prazoLimite</strong> a partir desse momento (SLA não correu enquanto aguardava)
          </li>
          <li>
            <strong>Pular</strong> — só aparece em <em>sucessores opcionais</em>; muda
            para PULADO com motivo opcional. Pode disparar a finalização da cadeia se for o último elo pendente.
          </li>
        </ul>
        <Callout tipo="aviso">
          Sucessores <strong>obrigatórios</strong> em &quot;Aguardando início&quot;{' '}
          (criados com iniciaAuto=false) não podem ser pulados — precisam ser iniciados.
        </Callout>
      </Step>

      <Step n={8} cor={MODULO_COLOR} icon={ListChecks} titulo="Acompanhar o processo" rota="/processos/[id]">
        <p>A página de detalhe do processo tem 5 abas:</p>
        <ul className="space-y-1.5 ml-2 text-sm">
          <li><strong>Visão geral</strong> — KPIs (em andamento, concluídas, aguardando) + barra de progresso da cadeia</li>
          <li><strong>Fluxo</strong> — diagrama SVG mostrando árvore predecessor → sucessor com status colorido</li>
          <li><strong>Execuções</strong> — cards detalhados de cada execução com mini-progresso</li>
          <li><strong>Pendências</strong> — sucessores aguardando ação</li>
          <li><strong>Timeline</strong> — todos os eventos da cadeia em ordem cronológica</li>
        </ul>
      </Step>

      <Step n={9} cor="#f43f5e" icon={Ban} titulo="Cancelamento (caso necessário)">
        <p>
          Em <strong>/processos/[id]</strong>, o botão <strong>Cancelar processo</strong>{' '}
          (canto superior direito) requer um motivo obrigatório. Comportamento:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Execuções em <strong>EM_ANDAMENTO</strong> e <strong>AGUARDANDO_INICIO</strong> são canceladas em cascata</li>
          <li>Execuções já <strong>CONCLUIDO</strong> ou <strong>PULADO</strong> permanecem como histórico</li>
          <li>Processo vai para CANCELADO; orçamento original não é alterado</li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos práticos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <CasoPratico
            titulo="Transferência de Contabilidade"
            descricao={
              <>
                Cadastre um serviço &quot;Transferência de Contabilidade&quot; com etapas de
                Legalização. No próximo serviço, encadeie um &quot;Onboarding do Cliente&quot;
                (obrigatório, auto). No próximo, &quot;Capacitação inicial&quot; (opcional).
                <br /><br />
                Quando o orçamento for aprovado, o cliente vê a Transferência rodar
                primeiro; ao concluir, Onboarding inicia automaticamente; Capacitação
                fica em pendência para o gestor decidir.
              </>
            }
          />
          <CasoPratico
            titulo="Constituição condicionada ao regime"
            descricao={
              <>
                Em uma cadeia de Constituição, o último sucessor &quot;Inscrição Simples Nacional&quot;
                tem uma condicional: <em>cliente.regime = SIMPLES</em>.
                <br /><br />
                Para clientes do Simples, esse sucessor é criado normalmente. Para Lucro
                Presumido/Real, o sistema pula com evento{' '}
                <code className="text-[11px]">sucessor_pulado_condicao</code> e a cadeia
                finaliza sem ele.
              </>
            }
          />
          <CasoPratico
            titulo="Serviço extra sem encadeamento"
            descricao={
              <>
                Um serviço pontual (ex: &quot;Alteração Contratual&quot;) que não tem sucessores
                ainda assim cria um Processo de 1 execução. Isso uniformiza a UI e
                permite adicionar sucessores no template depois sem reformular execuções existentes.
              </>
            }
          />
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/servicos" label="Configurar templates de serviço" cor={MODULO_COLOR} />
          <QuickLink href="/orcamentos" label="Criar orçamentos" cor={MODULO_COLOR} />
          <QuickLink href="/meus-servicos" label="Executar checklist" cor={MODULO_COLOR} />
          <QuickLink href="/processos" label="Listar processos ativos" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
