'use client'

import {
  Target, Settings, Plus, Move, FileText, Trophy, XCircle,
  Lightbulb, Info, ArrowRight, MessageSquare, CheckSquare, Tag,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-comercial, #fb7185)'
const FAQ_COLOR = '#0891b2'

export default function FaqCrmPipelinePage() {
  return (
    <ArticleShell
      modulo="CRM"
      moduloColor={MODULO_COLOR}
      icon={Target}
      titulo="CRM: pipeline comercial do lead ao fechamento"
      descricao="Como configurar etapas do funil, criar oportunidades, mover entre etapas, converter em orçamento e fechar ganho/perdido."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Lead" texto="Cliente potencial ainda em qualificação. Marcado com isLead=true. Não vira cliente até ser convertido." />
          <DefRow termo="Oportunidade" texto="Negociação concreta com um cliente/lead, valor estimado e etapa do funil." />
          <DefRow termo="Etapa" texto="Coluna do kanban (Prospecção, Diagnóstico, Proposta, Negociação, Ganho, Perdido). Cada uma tem cor e probabilidade %." />
          <DefRow termo="Atividade" texto="Tarefa associada à oportunidade: ligação, reunião, e-mail. Tem data, status e responsável." />
          <DefRow termo="Origem" texto="De onde veio a oportunidade — indicação, site, evento. Configurável em parâmetros." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Setup (master / gestor)</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Settings} titulo="Configurar etapas do funil" rota="/crm → Configurar etapas">
        <p>
          As etapas formam as colunas do kanban. Configuração padrão funciona para a maioria,
          mas pode ser customizada:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Nome</strong> e <strong>cor</strong> — identidade visual da coluna</li>
          <li><strong>Probabilidade %</strong> — usada para projeção de receita ponderada</li>
          <li><strong>Ordem</strong> — sequência da esquerda para direita no kanban</li>
          <li><strong>Tipo</strong> — Aberta, Ganho ou Perdido (etapas terminais não recebem oportunidades novas via drag)</li>
        </ul>
        <Callout tipo="dica">
          Sugestão de padrão para escritório contábil:
          <ul className="list-disc list-inside mt-1 ml-2">
            <li>Prospecção (10%) → Diagnóstico (25%) → Proposta (50%) → Negociação (75%) → Ganho (100%) → Perdido (0%)</li>
          </ul>
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Tag} titulo="Configurar tags, origens e atividades" rota="/crm/parametros">
        <p>
          Em parâmetros do CRM, defina:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Tags</strong> — etiquetas livres para classificar oportunidades (ex: &quot;Indicação Premium&quot;, &quot;Renovação&quot;)</li>
          <li><strong>Origens</strong> — canais de aquisição (&quot;Indicação cliente&quot;, &quot;Site&quot;, &quot;Evento SESCON&quot;)</li>
          <li><strong>Tipos de atividade</strong> — categorias de tarefas (Ligação, Reunião, Visita, E-mail)</li>
        </ul>
        <Callout tipo="info">
          Tags e origens depois alimentam relatórios — quanto mais granular o cadastro,
          mais útil o BI comercial.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação diária</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Plus} titulo="Criar uma oportunidade" rota="/crm → + Nova oportunidade">
        <p>Campos principais:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Cliente / Lead</strong> — vincula a um cadastro existente ou cria um lead novo</li>
          <li><strong>Valor estimado</strong> — base para projeção de receita</li>
          <li><strong>Etapa inicial</strong> — geralmente a primeira (Prospecção)</li>
          <li><strong>Responsável</strong> — usuário do funil que cuida do negócio</li>
          <li><strong>Origem</strong> e <strong>tags</strong> opcionais</li>
        </ul>
        <Callout tipo="dica">
          Se o contato ainda não é cliente, marque <strong>&quot;Criar como lead&quot;</strong> —
          o registro fica no /clientes com flag <code className="text-[11px]">isLead=true</code>.
          Quando ganhar, converte para cliente real (basta tirar a flag).
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Move} titulo="Mover oportunidades entre etapas" rota="/crm (kanban)">
        <p>
          Visualização padrão é o kanban — colunas por etapa, cards por oportunidade.
          Arraste o card para mover. Atalhos:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Drag-and-drop</strong> — arraste o card para outra coluna</li>
          <li><strong>Click no card</strong> — abre detalhe lateral com timeline e atividades</li>
          <li><strong>Filtros</strong> — responsável, tag, origem, valor mínimo, período de criação</li>
          <li><strong>Tabela</strong> — alternativa ao kanban, com sort e exportação</li>
        </ul>
        <Callout tipo="info">
          Cada movimento entre etapas registra um evento na timeline da oportunidade,
          permitindo auditoria do tempo médio em cada estágio (lead time).
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={MessageSquare} titulo="Registrar atividades e mensagens" rota="oportunidade → aba Atividades">
        <p>Cada oportunidade tem três blocos colaborativos:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <CheckSquare className="inline h-3 w-3" /> <strong>Atividades / tarefas</strong> — &quot;Ligar pra Carlos&quot;, &quot;Enviar proposta v2&quot;, com data e responsável
          </li>
          <li>
            <MessageSquare className="inline h-3 w-3" /> <strong>Mensagens internas</strong> — log de tratativas, decisões, contexto
          </li>
          <li>
            <FileText className="inline h-3 w-3" /> <strong>Arquivos</strong> — anexos (e-mails impressos, PDF de propostas, fotos de reunião)
          </li>
        </ul>
        <Callout tipo="dica">
          Use atividades com <strong>data</strong> — vão para a Agenda do responsável e disparam
          notificações de prazo. Sem data, vira só nota mental.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={FileText} titulo="Converter em orçamento" rota="oportunidade → ⋮ → Gerar orçamento">
        <p>
          Quando a negociação evolui para Proposta, gere um orçamento diretamente da oportunidade.
          O orçamento herda <strong>cliente</strong>, <strong>responsável</strong> e fica vinculado
          via <code className="text-[11px]">oportunidadeId</code>.
        </p>
        <Callout tipo="info">
          A partir daí, o fluxo continua em <strong>/orcamentos</strong> — montar itens,
          enviar ao cliente, aprovação. Quando aprovado, dispara processos automáticos
          (vide <a className="text-rose-600 hover:underline" href="/faq/processos">Fluxo de Processos</a>).
        </Callout>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={Trophy} titulo="Fechar ganho">
        <p>
          Mova o card para a etapa <strong>Ganho</strong>. O sistema:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Marca a oportunidade como vencida</li>
          <li>Se o lead ainda era lead, sugere converter para cliente real</li>
          <li>Calcula tempo de ciclo (criação → ganho) para o BI comercial</li>
        </ul>
      </Step>

      <Step n={8} cor="#f43f5e" icon={XCircle} titulo="Marcar como perdido">
        <p>
          Mova para <strong>Perdido</strong> e informe o <strong>motivo</strong> (preço, timing,
          concorrente, etc) — campo obrigatório, alimenta o relatório de perdas.
        </p>
        <Callout tipo="aviso">
          Não delete oportunidades perdidas — o motivo serve para identificar padrões
          (ex: 40% perdidas por preço sugere revisar tabela de honorários).
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente já existe — não precisa de lead</p>
            <p className="text-foreground/70">
              Ao criar oportunidade, vincule diretamente ao cliente existente em vez de criar lead.
              Útil em renovações, ampliação de escopo, vendas adicionais.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Reabrir uma oportunidade perdida</p>
            <p className="text-foreground/70">
              Mova o card de Perdido para qualquer outra etapa — registra evento de reabertura
              e zera o motivo de perda. Útil quando cliente volta a negociar meses depois.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Vender mesmo serviço para outro contato</p>
            <p className="text-foreground/70">
              Use a opção <strong>Duplicar</strong> no menu de ações da oportunidade —
              cria nova oportunidade com mesmos dados, mas sem timeline (começa do zero).
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/crm" label="Abrir kanban do funil" cor={MODULO_COLOR} />
          <QuickLink href="/crm/parametros" label="Configurar tags e origens" cor={MODULO_COLOR} />
          <QuickLink href="/orcamentos" label="Ver orçamentos vinculados" cor={MODULO_COLOR} />
          <QuickLink href="/comercial-relatorios" label="Relatórios comerciais" cor={MODULO_COLOR} />
        </div>
        <Callout tipo="info">
          Após o orçamento ser aprovado, o pipeline comercial continua no fluxo de
          processos. Veja <a className="text-rose-600 hover:underline" href="/faq/processos">Fluxo de Processos</a>{' '}
          para o lado da execução.
        </Callout>
      </Section>
    </ArticleShell>
  )
}
