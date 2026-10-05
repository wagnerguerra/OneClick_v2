'use client'

import {
  FileSignature, Lightbulb, Send, CheckCircle2, ListChecks, Info,
  ArrowRight, BadgePercent, FileCheck2, FilePlus, RefreshCw, XCircle,
  Network, Settings, BarChart2, Database, ScrollText, Workflow, MessageSquarePlus,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { corDoArtigo } from '../_components/articles-catalog'
import {
  Section, Step, Callout, CasoPratico, QuickLink, DefRow, FlagRow, CascadeRow,
} from '../_components/article-blocks'

const MODULO_COLOR = corDoArtigo('orcamentos')
const FAQ_COLOR = 'var(--color-primary)'

export default function FaqOrcamentosPage() {
  return (
    <ArticleShell
      modulo="Orçamentos"
      moduloColor={MODULO_COLOR}
      icon={FileSignature}
      titulo="Orçamentos: do NOVO ao FINALIZADO"
      descricao="Fluxo completo da proposta comercial — como as áreas pedem orçamento (botão + e roteiro do Detalhamento), criação, itens, envio ao cliente, aprovação pública, execução automática e fechamento com pesquisa NPS."
    >
      {/* ─────────────────────────────────────────────────────────── */}
      {/* Glossário */}
      <Section icon={Info} titulo="Glossário rápido" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Orçamento" texto="Proposta comercial com número sequencial (ex: #00123), cliente, itens e valor total. Cada orçamento passa por 7 status do FSM até ser encerrado." />
          <DefRow termo="Item" texto="Linha do orçamento — pode ser SERVIÇO (vinculado a um template do catálogo), TAXA ou DESPESA. Quantidade × valor unitário compõe o subtotal." />
          <DefRow termo="Catálogo" texto="Tabela de Serviços/Taxas/Despesas pré-cadastrados em /orcamentos/parametros. Pré-preenche itens novos com nome, valor padrão e texto." />
          <DefRow termo="Link público" texto="URL única do orçamento (/orcamento/[token]) que vai no e-mail ao cliente. Não exige login — cliente aprova/recusa direto pelo link." />
          <DefRow termo="Decisão do cliente" texto='Aprovação ou recusa registrada pelo link público — exige Nome + CPF + observação opcional. Move o status pra APROVADO ou ENCERRADO.' />
          <DefRow termo="Processo" texto="Agregador criado automaticamente ao APROVAR. Cada item do tipo SERVIÇO vira 1 processo + execução-raiz vinculada ao template original." />
          <DefRow termo="Reabertura" texto='Volta um orçamento pra status anterior ao atual (exige motivo). Incrementa o contador "reaberturasCount" — visível na timeline.' />
          <DefRow termo="Paralisação" texto="Pausa lógica sem mudar o status. SLAs e contagem de dias atrasados ficam congelados até o gestor retomar." />
          <DefRow termo="Solicitação" texto="Pedido de orçamento feito por uma área ao comercial — pelo botão + (balão Orçamento) ou pelo + Novo Orçamento do módulo. Quem pede fica registrado como solicitante." />
          <DefRow termo="Roteiro do Detalhamento" texto="Perguntas que já vêm no campo Detalhamento ao pedir um orçamento: serviço, fato gerador, o que será feito, horas, regime (normal/extra), quem executa e, se aplicável, ganho tributário e desembolso. É lembrete, não trava." />
          <DefRow termo="Final do CNPJ" texto="Ao lado da razão social, na lista e no kanban, aparece o final do CNPJ (ex.: 0001-91) com o selo Matriz ou Filial — para distinguir unidades da mesma empresa sem abrir o orçamento." />
        </div>
      </Section>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* Visão geral */}
      <Section icon={Network} titulo="Visão geral do FSM" cor={FAQ_COLOR}>
        <p className="text-sm text-foreground/80 mb-3">
          O fluxo é um <strong>forward-only state machine</strong> de 7 status — todas as transições
          são <strong>manuais</strong> via drag-and-drop no kanban ou botões no detalhe. Não há
          transições automáticas baseadas em tempo; o sistema só calcula <em>atrasos</em> contra
          os prazos da configuração.
        </p>
        <div className="rounded-lg border bg-muted/30 p-4">
          <pre className="text-[11px] leading-snug font-mono text-foreground/80 overflow-x-auto whitespace-pre">
{`  ┌─────────┐  ┌───────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐
  │  NOVO   │→ │ A_ENVIAR  │→ │ ENVIADO │→ │ APROVADO │→ │ LIBERADO │→ │ FINALIZADO │
  └────┬────┘  └─────┬─────┘  └────┬────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘
       │             │             │            │             │              │
       │             │             │            │             │              ▼
       │             │             │            │             │       ┌────────────┐
       └─────────────┴─────────────┴────────────┴─────────────┴──────▶│ ENCERRADO  │  (terminal)
                                                                       └────────────┘
                                                                            ▲
                                                              Recusa do cliente
                                                              ou cancelamento manual

  Datas dedicadas gravadas na 1ª transição:
   dtEnviado · dtAprovado · dtLiberado · dtFinalizado · dtCancelado
  Reabrir → status anterior + limpa datas posteriores + incrementa reaberturasCount`}
          </pre>
        </div>
        <Callout tipo="info">
          O kanban em <code className="text-[11px]">/orcamentos</code> tem uma coluna por status.
          Arrastar entre colunas valida via <code className="text-[11px]">isOrcamentoTransitionAllowed</code> —
          movimento pra trás é bloqueado (use <strong>Reabrir</strong> com motivo).
        </Callout>
      </Section>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* Pedido de orçamento pelas áreas (#HLP0411) */}
      <Section icon={MessageSquarePlus} titulo="Como as áreas pedem um orçamento" cor={FAQ_COLOR}>
        <p className="text-sm text-foreground/80 mb-3">
          Qualquer área pode pedir um orçamento ao comercial, por dois caminhos. Os dois criam o
          mesmo orçamento na coluna <Badge variant="outline" className="text-[10px] h-5 mx-1">NOVO</Badge>,
          avisam as áreas marcadas e usam o mesmo <strong>roteiro no Detalhamento</strong>.
        </p>
        <div className="space-y-2 text-sm">
          <DefRow termo="Botão + (recomendado)" texto="Em qualquer tela, no canto inferior direito → Orçamento. Não exige acesso ao módulo, aceita anexos e aceita cliente não cadastrado (digitado o nome, ele entra como prospect). O pedido chega sem responsável, para o comercial assumir." />
          <DefRow termo="+ Novo Orçamento" texto="No módulo Orçamentos. Leva direto à tela do orçamento criado, onde já dá para incluir itens. Anexos entram depois, na tela do orçamento." />
        </div>
        <p className="text-sm text-foreground/80 mt-3 mb-2">
          O campo <strong>Detalhamento</strong> já abre com as perguntas que o comercial precisa para
          compor o preço. Responda na linha em branco abaixo de cada uma:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm text-foreground/80">
          <li><strong>Nome do serviço</strong></li>
          <li><strong>Fato gerador</strong> — o que gerou a necessidade do trabalho</li>
          <li><strong>Detalhamento do que será feito</strong></li>
          <li><strong>Média de horas</strong> para a execução</li>
          <li><strong>Regime</strong> — hora normal (dentro do expediente) ou extra (fora dele)</li>
          <li><strong>Colaborador responsável</strong> pela execução</li>
          <li><em>Se aplicável:</em> ganho ou vantagem tributária do cliente, e desembolso com obrigações</li>
        </ul>
        <Callout tipo="info">
          O roteiro é <strong>lembrete, não trava</strong>: dá para enviar com itens em branco. Só o roteiro
          intocado, sem nenhuma resposta, conta como vazio — pelo botão +, o envio é barrado com o aviso
          &quot;Responda o roteiro do Detalhamento&quot;; no módulo, ele não é gravado. Não sabe uma resposta?
          Escreva &quot;a confirmar&quot; em vez de deixar em branco.
        </Callout>
        <Callout tipo="dica">
          Marque em <strong>Notificar as seguintes áreas</strong> todas as áreas envolvidas (obrigatório):
          o líder de cada uma é avisado para detalhar a parte dela. O que você escreve no Detalhamento vira
          o <strong>Texto Interno</strong> do orçamento — só a equipe vê, nunca o cliente.
        </Callout>
      </Section>

      <h2 className="text-base font-bold pt-2">Passo a passo detalhado</h2>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={1} cor={MODULO_COLOR} icon={FilePlus} titulo="Criar o orçamento (NOVO)" rota="/orcamentos → + Novo Orçamento">
        <p>
          No topo do módulo, clique em <strong>+ Novo Orçamento</strong>. O modal pede:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Cliente</strong> (obrigatório) — busca por razão social/CNPJ; dá para cadastrar um cliente novo na hora pelo próprio campo.</li>
          <li><strong>Contato</strong> e <strong>E-mail do contato</strong> — usados no envio da proposta. O e-mail, se informado, precisa ser válido.</li>
          <li>
            <strong>Campos comerciais</strong> — Forma de pagamento, Tipo (Serviço Mensal/Extra), Responsável pelo serviço,
            Validade e Desconto. Só aparecem para quem tem a permissão de <strong>cadastro completo</strong>; quem não tem cria o
            orçamento e o comercial completa.
          </li>
          <li><strong>Detalhamento</strong> — já vem com o roteiro de perguntas (ver &quot;Como as áreas pedem um orçamento&quot;). Vira o Texto Interno.</li>
          <li><strong>Notificar as seguintes áreas</strong> — obrigatório marcar ao menos uma; o líder de cada área é avisado para detalhar a parte dela.</li>
        </ul>
        <p>
          O <strong>solicitante</strong> é quem criou. Pedidos das áreas costumam chegar pelo <strong>botão +</strong>,
          que cria o orçamento sem responsável para o comercial assumir.
        </p>
        <Callout tipo="dica">
          A <strong>numeração</strong> é sequencial e automática — sistema usa <code className="text-[11px]">max(numeroInicial, último+1)</code>.
          Pra começar de um número específico (ex: continuar série legada do v1), ajustar
          em <strong>/orcamentos/configuracoes → Numeração</strong>.
        </Callout>
        <p className="mt-2">
          Ao salvar, o orçamento cai na coluna <Badge variant="outline" className="text-[10px] h-5 mx-1">NOVO</Badge>{' '}
          do kanban com card mostrando número, cliente, valor total (zerado), responsável e contadores
          de itens/mensagens/arquivos.
        </p>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={2} cor={MODULO_COLOR} icon={ListChecks} titulo="Adicionar itens (SERVIÇO, TAXA, DESPESA)" rota="/orcamentos/[id] → aba Detalhes → Itens">
        <p>
          Cada item tem <strong>tipo</strong>, <strong>descrição</strong>, <strong>quantidade</strong> e <strong>valor unitário</strong>.
          O catálogo (configurado em <code className="text-[11px]">/orcamentos/parametros</code>) pré-preenche nome,
          valor padrão e texto.
        </p>
        <div className="space-y-2 mt-2">
          <FlagRow label="SERVIÇO"
            on="Vinculado a um template em /servicos (catalogoId). Ao APROVAR, cria Processo + execução automática."
            off="Sem vínculo ao catálogo — só compõe o valor, não dispara nada na aprovação." />
          <FlagRow label="TAXA"
            on="Soma em totalTaxas. Boa pra cobrar taxas regulatórias ou administrativas separadas do serviço."
            off="Não há comportamento alternativo — taxa só não vai pra totalServicos." />
          <FlagRow label="DESPESA"
            on="Soma em totalDespesas. Reembolsos ou custos repassados (ex: cartórios, deslocamento)."
            off="Mesmo princípio — só segrega no relatório." />
        </div>
        <Callout tipo="dica">
          Itens com <code className="text-[11px]">catalogoId</code> apontando pra um <strong>Servico</strong> com encadeamento configurado
          é o que faz a mágica: ao APROVAR, cada item vira um <strong>processo</strong> com execução-raiz e
          a cadeia inteira começa a rodar. Sem catalogoId, o item é só um valor numérico no orçamento.
        </Callout>
        <p className="mt-2">
          O sistema calcula 4 totais em tempo real:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><code className="text-[11px]">totalServicos</code> — soma dos itens tipo SERVIÇO</li>
          <li><code className="text-[11px]">totalTaxas</code> — soma dos itens tipo TAXA</li>
          <li><code className="text-[11px]">totalDespesas</code> — soma dos itens tipo DESPESA</li>
          <li><code className="text-[11px]">totalGeral</code> — soma dos três menos o desconto aplicado</li>
        </ul>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={3} cor={MODULO_COLOR} icon={BadgePercent} titulo="Desconto, forma de pagamento e textos">
        <p>
          Antes de enviar pro cliente, ajuste:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Desconto</strong> — <em>geral</em> (aba Itens → card &quot;Desconto e Pagamento&quot;, em % e/ou R$, sobre os
            serviços) <strong>ou</strong> <em>por item</em> (em cada linha de serviço). Nunca os dois: com desconto nos itens,
            o geral fica bloqueado, e vice-versa — os dois juntos somariam e o total deixaria de bater com o que as linhas
            mostram. Taxas e despesas não recebem desconto.
          </li>
          <li>
            <strong>Forma de pagamento</strong> — campo livre (ex: <em>&quot;3x sem juros no boleto&quot;</em>,{' '}
            <em>&quot;Mensalidade R$ 1.500&quot;</em>). Aparece no link público e no PDF.
          </li>
          <li>
            <strong>Texto interno</strong> — observações que <em>não</em> vão pro cliente. É onde fica o Detalhamento
            escrito por quem pediu o orçamento (o roteiro respondido). Útil também pra negociação, justificativa de
            desconto e lembretes pro responsável.
          </li>
          <li>
            <strong>Texto pro cliente</strong> — rich editor que vira a apresentação no link público
            e no PDF. Default vem de <code className="text-[11px]">textoPadrao</code> em /orcamentos/configuracoes.
          </li>
        </ul>
        <Callout tipo="aviso">
          O orçamento <strong>não pode</strong> ir pra ENVIADO sem itens — o backend retorna erro de validação.
          Se quiser enviar uma proposta &quot;em branco&quot; pra negociação, adicione ao menos um item placeholder
          (tipo DESPESA, valor 0, descrição &quot;A definir&quot;).
        </Callout>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={4} cor={MODULO_COLOR} icon={FileCheck2} titulo="Revisão interna — NOVO → A_ENVIAR" rota="kanban: arrastar card | detalhe: botão Avançar">
        <p>
          Mover pra <Badge variant="outline" className="text-[10px] h-5 mx-1">A_ENVIAR</Badge> sinaliza
          que o orçamento <strong>terminou de ser montado</strong> e está aguardando o disparo do e-mail.
          É uma coluna de revisão — bom pra times com aprovação interna antes de mandar pro cliente
          (ex: gerente comercial valida desconto acima de 15%).
        </p>
        <p>
          Nada acontece automaticamente nessa transição: nenhum e-mail é disparado, nenhum processo
          é criado. Só muda o status e grava o evento na timeline.
        </p>
        <Callout tipo="info">
          O prazo da configuração <code className="text-[11px]">diasEnviar</code> (default 7)
          conta a partir da criação. Se o orçamento ficar em NOVO + A_ENVIAR por mais que isso,
          ele aparece como <strong>atrasado</strong> no relatório e no card (badge vermelho no kanban).
        </Callout>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={5} cor={MODULO_COLOR} icon={Send} titulo="Envio por e-mail — A_ENVIAR → ENVIADO" rota="detalhe: botão Enviar">
        <p>
          Clicar em <strong>Enviar</strong> abre o modal com 3 controles:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Destinatários</strong> — multi-input (vírgula/ponto-e-vírgula separa). Pré-preenchido
            com <em>cliente.email</em> + <em>emailsContatos</em> + <em>emailComercial</em> da config.
            Pode editar à vontade.
          </li>
          <li>
            <strong>Mensagem personalizada</strong> (opcional) — rich editor que vai como bloco em
            destaque no e-mail.
          </li>
          <li>
            <strong>Caixa &quot;Enviar e-mail&quot;</strong> — desmarcada, marca o orçamento como ENVIADO
            <em> sem disparar e-mail nenhum</em>. Útil pra registrar envio offline (cliente leu em
            reunião, WhatsApp, impresso).
          </li>
        </ul>
        <Callout tipo="dica">
          Se você apagar <strong>todos</strong> os destinatários e clicar enviar, o sistema entende
          que é um envio offline — muda pro status ENVIADO, grava evento &quot;Orçamento marcado como
          enviado sem e-mail disparado&quot;, mas não chama Resend. Comportamento implementado em #HLP0086.
        </Callout>
        <p className="mt-2">
          O e-mail enviado tem:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Header com logo da empresa (tenant)</li>
          <li>Saudação ao cliente</li>
          <li>Sua mensagem personalizada (quote)</li>
          <li>O texto de apresentação da config (<code className="text-[11px]">textoApresentacao</code>)</li>
          <li>
            <strong>Botão CTA</strong> &quot;Ver Proposta&quot; →{' '}
            <code className="text-[11px]">/orcamento/[token]</code> (link público sem login)
          </li>
          <li>Footer com validade + dados da empresa</li>
        </ul>
        <p>
          Nessa primeira transição grava <code className="text-[11px]">dtEnviado</code> (timestamp imutável).
          Se reabrir e enviar de novo, <code className="text-[11px]">dtEnviado</code> permanece a data
          do primeiro envio.
        </p>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={6} cor={MODULO_COLOR} icon={ScrollText} titulo="Cliente decide no link público — ENVIADO → APROVADO ou ENCERRADO" rota="/orcamento/[token] (rota pública)">
        <p>
          O cliente abre o link sem login e vê:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Cabeçalho com logo da empresa contratada</li>
          <li>Dados do cliente (razão social, CNPJ, e-mail)</li>
          <li>Tabela de itens (tipo, descrição, quantidade, valor)</li>
          <li>Totais com desconto aplicado</li>
          <li>Texto de apresentação</li>
          <li>Validade da proposta (calculada de <code className="text-[11px]">dtEnviado + validadeDias</code>)</li>
          <li>Dois botões: <strong>Aprovar</strong> e <strong>Recusar</strong></li>
        </ul>
        <p className="mt-2">
          Qualquer das duas decisões abre modal pedindo:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Nome completo</strong> (obrigatório) — quem está aprovando/recusando</li>
          <li><strong>CPF</strong> (obrigatório) — pra rastreabilidade</li>
          <li><strong>Observação</strong> (opcional) — comentário do cliente</li>
        </ul>
        <p>
          Ao confirmar, o backend grava:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><code className="text-[11px]">decisaoTipo</code> = <em>APROVADO</em> ou <em>RECUSADO</em></li>
          <li><code className="text-[11px]">decisaoEm</code> = timestamp</li>
          <li><code className="text-[11px]">decisaoNome</code>, <code className="text-[11px]">decisaoCpf</code>, <code className="text-[11px]">decisaoObs</code></li>
          <li>Status muda pra <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">APROVADO</Badge> ou{' '}
            <Badge variant="outline" className="text-[10px] h-5 bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400">ENCERRADO</Badge></li>
          <li>Evento na timeline: <em>&quot;Cliente APROVOU&quot;</em> ou <em>&quot;Cliente RECUSOU&quot;</em></li>
        </ul>
        <Callout tipo="info">
          O link público <strong>não expira por validade</strong> — fica acessível mesmo após o prazo, mas o cliente
          vê um aviso de &quot;Proposta vencida&quot;. Pra invalidar de vez, basta encerrar o orçamento manualmente.
        </Callout>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={7} cor={MODULO_COLOR} icon={Send} titulo="Aprovação avisa o comercial e o financeiro">
        <p>
          Ao APROVAR (seja pelo link público, seja pelo botão interno no detalhe), o sistema envia o e-mail
          de aprovação para o <strong>comercial</strong>, o <strong>financeiro</strong> e a lista de
          &quot;Notificar aprovações de orçamento para&quot; das configurações. O card do CRM vinculado vai para
          a etapa de ganho.
        </p>
        <Callout tipo="info">
          A aprovação <strong>não cria serviço</strong> e <strong>não avisa a área</strong>. O trabalho só
          começa depois que o financeiro libera o orçamento (passo seguinte).
        </Callout>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={8} cor={MODULO_COLOR} icon={Workflow} titulo="Liberação financeira dispara os serviços — APROVADO → LIBERADO" rota="kanban ou detalhe">
        <p>
          A coluna <Badge variant="outline" className="text-[10px] h-5 mx-1">LIBERADO</Badge> é o sinal
          de que o <strong>financeiro</strong> liberou a execução do trabalho. Em fluxos rigorosos
          (que exigem pagamento de entrada antes de começar) essa transição só ocorre quando o
          comprovante chega. Não dá para pular: de APROVADO o orçamento só vai para LIBERADO ou ENCERRADO.
        </p>
        <p>
          Na primeira liberação, o sistema grava <code className="text-[11px]">dtLiberado</code> e executa
          três ações encadeadas:
        </p>
        <div className="space-y-2 mt-2">
          <CascadeRow ordem="1" titulo="Cria 1 Processo por item SERVIÇO com catalogoId" cor={MODULO_COLOR}>
            Cada item do tipo <strong>SERVIÇO</strong> que aponte pra um Servico ativo no catálogo
            vira um Processo agregador (<em>&quot;Nome do serviço — Cliente&quot;</em>). Itens TAXA e DESPESA
            não disparam nada.
          </CascadeRow>
          <CascadeRow ordem="2" titulo="Cria a execução-raiz vinculada ao processo" cor={MODULO_COLOR}>
            A execução nasce em <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400">EM_ANDAMENTO</Badge>{' '}
            com o checklist do template. O responsável segue a regra de atribuição do serviço (ou a
            escolha manual feita no item do orçamento).
          </CascadeRow>
          <CascadeRow ordem="3" titulo="Avisa quem vai executar + grava evento" cor={MODULO_COLOR}>
            Os responsáveis pela execução (e a área, quando o serviço é por setor) recebem o aviso no sino
            e por e-mail. O evento <em>&quot;X processo(s) de serviço iniciado(s) automaticamente&quot;</em>{' '}
            aparece na timeline do orçamento.
          </CascadeRow>
        </div>
        <Callout tipo="aviso">
          Item SERVIÇO <strong>sem catalogoId</strong> não dispara processo — vira só um valor no total.
          Para o serviço nascer na liberação, garanta que o item esteja vinculado a um template (escolha pelo
          dropdown de catálogo no modal de item).
        </Callout>
        <p className="mt-2">
          A partir daqui, o ciclo de vida da execução é responsabilidade do módulo de <strong>Processos</strong> —
          ver <code className="text-[11px]">/faq/processos</code>.
        </p>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={9} cor={MODULO_COLOR} icon={CheckCircle2} titulo="Finalização — LIBERADO → FINALIZADO (dispara NPS)" rota="kanban ou detalhe">
        <p>
          Arrastar o card pra <Badge variant="outline" className="text-[10px] h-5 mx-1">FINALIZADO</Badge>{' '}
          é o gesto de encerramento <em>positivo</em>: a entrega aconteceu e o cliente está satisfeito.
        </p>
        <Callout tipo="info">
          Na maioria das vezes a finalização é <strong>automática</strong>: quem executa conclui o{' '}
          <strong>serviço</strong> em Meus Serviços e, quando o último serviço do orçamento termina, o orçamento
          (já LIBERADO) é finalizado. Orçamentos antigos, cujos serviços nasceram na aprovação, podem estar
          APROVADOS com o selo <strong>Serviço concluído</strong>: ao liberar, o sistema finaliza na hora.
        </Callout>
        <p>
          Nessa primeira transição, o backend executa:
        </p>
        <div className="space-y-2 mt-2">
          <CascadeRow ordem="1" titulo="Grava dtFinalizado" cor={MODULO_COLOR}>
            Timestamp imutável da finalização.
          </CascadeRow>
          <CascadeRow ordem="2" titulo="Dispara Pesquisa de Satisfação (NPS)" cor={MODULO_COLOR}>
            Chama <code className="text-[11px]">pesquisaService.criarParaOrcamento</code> — cria a survey
            vinculada ao orçamento, gera o token único e envia o convite por e-mail ao cliente
            (best-effort: erros são silenciados pra não bloquear a transição).
          </CascadeRow>
        </div>
        <Callout tipo="dica">
          O cliente responde a pesquisa no link público <code className="text-[11px]">/pesquisa/[token]</code> —
          mesma mecânica do link de aprovação. A resposta fica disponível na aba <strong>Pesquisa</strong> do
          detalhe do orçamento. Ver <code className="text-[11px]">/faq/pesquisa-satisfacao</code>.
        </Callout>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Step n={10} cor="#64748b" icon={XCircle} titulo="Encerramento — qualquer status → ENCERRADO (terminal)">
        <p>
          ENCERRADO é o estado terminal. Acontece em <strong>três</strong> situações:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Recusa do cliente</strong> no link público → automático após o cliente
            clicar &quot;Recusar&quot;.
          </li>
          <li>
            <strong>Cancelamento manual</strong> em qualquer status anterior — botão &quot;Encerrar como
            cancelado&quot; no menu do detalhe. Sem motivo obrigatório no fluxo atual.
          </li>
          <li>
            <strong>Expiração lógica</strong> — orçamentos que passaram da validade e o gestor decide
            arquivar manualmente. Não há job automático.
          </li>
        </ul>
        <p>
          Grava <code className="text-[11px]">dtCancelado</code> (na 1ª vez), evento na timeline e
          o card vai pra coluna ENCERRADO (cinza, à direita do kanban).
        </p>
      </Step>

      {/* ─────────────────────────────────────────────────────────── */}
      <Section icon={RefreshCw} titulo="Casos especiais" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <CasoPratico
            titulo="Reabrir orçamento — voltar pra um status anterior"
            descricao={
              <>
                Botão <strong>Reabrir</strong> no menu do detalhe. Abre modal pedindo:
                <br />
                <strong>Status-alvo</strong> (qualquer anterior ao atual) + <strong>motivo</strong> (obrigatório).
                <br /><br />
                <strong>O que acontece:</strong>
                <ul className="list-disc list-inside mt-1 ml-2 space-y-0.5">
                  <li>Status muda pro alvo selecionado</li>
                  <li>Datas dedicadas posteriores ao alvo são <strong>limpas</strong> (ex: reabrir pra ENVIADO limpa dtAprovado, dtLiberado, dtFinalizado)</li>
                  <li>Contador <code className="text-[11px]">reaberturasCount</code> incrementa</li>
                  <li>Evento na timeline: <em>&quot;Reaberto pelo usuário X — motivo: Y&quot;</em></li>
                  <li>Side-effects <strong>não disparam de novo</strong> — se reabrir pra LIBERADO depois de FINALIZADO, novos processos não são criados (porque dtLiberado já existia, então não é &quot;1ª transição&quot;)</li>
                </ul>
              </>
            }
          />
          <CasoPratico
            titulo="Paralisar — pausa lógica sem mudar status"
            descricao={
              <>
                Botão <strong>Paralisar</strong> congela o orçamento no status atual. Os contadores de atraso
                (<code className="text-[11px]">diasEnviar</code>, <code className="text-[11px]">diasAprovar</code>) param de correr enquanto a
                paralisação está ativa. Bom pra orçamentos parados aguardando definição do cliente ou
                documentação externa.
                <br /><br />
                <strong>Retomar</strong> destrava — os contadores voltam a contar do ponto em que pararam, sem
                &quot;recuperar&quot; o tempo perdido.
              </>
            }
          />
          <CasoPratico
            titulo="Duplicar orçamento — começar do zero com a estrutura"
            descricao={
              <>
                Menu (⋮) → <strong>Duplicar</strong>. Cria um novo orçamento em NOVO com os mesmos
                itens, descontos, contatos e textos — mas <strong>sem</strong> as datas, decisões, processos
                criados ou pesquisa. Número novo, token novo, tudo zerado.
                <br /><br />
                Útil pra cliente que pediu &quot;a mesma proposta do mês passado&quot; ou pra criar variações
                (proposta A, B, C) durante negociação.
              </>
            }
          />
          <CasoPratico
            titulo="Recusa pelo cliente vs cancelamento manual — diferenças"
            descricao={
              <>
                Ambos terminam em ENCERRADO, mas o <strong>contexto fica diferente</strong> na auditoria:
                <ul className="list-disc list-inside mt-1 ml-2 space-y-0.5">
                  <li><strong>Recusa do cliente</strong> — grava decisaoTipo=RECUSADO + nome + CPF + obs. Evento &quot;Cliente recusou via link público&quot;.</li>
                  <li><strong>Cancelamento manual</strong> — grava só dtCancelado + evento &quot;Encerrado por user X&quot;. decisaoTipo fica null.</li>
                </ul>
                Use <strong>cancelamento manual</strong> quando você decidiu desistir do negócio (cliente sumiu,
                empresa pivotou, etc.). Use o <strong>link público</strong> só quando o cliente efetivamente
                disse não — vai contar nas estatísticas de NPS e funil.
              </>
            }
          />
        </div>
      </Section>

      {/* ─────────────────────────────────────────────────────────── */}
      <Section icon={Settings} titulo="Configurações" cor={FAQ_COLOR}>
        <p className="text-sm text-foreground/80 mb-2">
          Em <code className="text-[11px]">/orcamentos/configuracoes</code> — escopo por empresa.
        </p>
        <div className="space-y-2 text-sm">
          <DefRow termo="Prazos do workflow"
            texto="diasEnviar (default 7) · diasAprovar (default 15) · diasRevisar (default 7) · validadeDias (default 90). Definem quando o card mostra badge de atraso." />
          <DefRow termo="Numeração"
            texto="numeroInicial (default 1). O próximo orçamento será max(numeroInicial, último+1). Útil pra continuar série de outro sistema." />
          <DefRow termo="E-mails de notificação"
            texto="emailNovo (alerta de novo orçamento) · emailComercial (cópia dos envios) · emailFinanceiro (avisos de APROVADO/LIBERADO)." />
          <DefRow termo="Textos padrão"
            texto="textoPadrao (texto do detalhe, rich editor) · textoApresentacao (vai no corpo do e-mail de envio ao cliente)." />
        </div>
      </Section>

      {/* ─────────────────────────────────────────────────────────── */}
      <Section icon={Database} titulo="Catálogo (parâmetros)" cor={FAQ_COLOR}>
        <p className="text-sm text-foreground/80 mb-2">
          Em <code className="text-[11px]">/orcamentos/parametros</code> — acesso restrito a master/admin.
        </p>
        <p className="text-sm text-foreground/80">
          Cadastra os itens que aparecem no dropdown de seleção ao adicionar item no orçamento.
          Campos: <strong>nome</strong>, <strong>tipo</strong> (SERVIÇO/TAXA/DESPESA), <strong>valor padrão</strong>,
          <strong> texto padrão</strong>, <strong>ativo</strong>, <strong>disponível em orçamento</strong>.
        </p>
        <Callout tipo="dica">
          Catálogo do tipo <strong>SERVIÇO</strong> com <code className="text-[11px]">catalogoId</code> apontando pra
          um Servico do <code className="text-[11px]">/servicos</code> é o que dispara processos automáticos na aprovação.
          Itens <strong>TAXA</strong> e <strong>DESPESA</strong> só compõem valor.
        </Callout>
      </Section>

      {/* ─────────────────────────────────────────────────────────── */}
      <Section icon={BarChart2} titulo="Relatórios" cor={FAQ_COLOR}>
        <p className="text-sm text-foreground/80 mb-2">
          Em <code className="text-[11px]">/orcamentos/relatorios</code> — 5 abas com filtro de período
          (30/90/180/365 dias ou todos):
        </p>
        <div className="space-y-2 text-sm">
          <DefRow termo="Funil de vendas"
            texto="Contagem e valor por status (NOVO → ENCERRADO). Taxa de conversão APROVADO/total." />
          <DefRow termo="Atrasados"
            texto="Cards que passaram dos prazos diasEnviar e diasAprovar. Lista por cliente, responsável e dias de atraso." />
          <DefRow termo="Desempenho"
            texto="Volume de orçamentos criados, aprovados e finalizados por período. Gráfico de barras temporal." />
          <DefRow termo="Tempo de ciclo"
            texto="Média de dias NOVO → APROVADO e APROVADO → FINALIZADO. Quebra por responsável." />
          <DefRow termo="Por área"
            texto="Contagens e valores agrupados pela área do responsável. Útil pra cobranças setoriais." />
        </div>
      </Section>

      {/* ─────────────────────────────────────────────────────────── */}
      <Section icon={ScrollText} titulo="Estrutura da página de detalhe" cor={FAQ_COLOR}>
        <p className="text-sm text-foreground/80 mb-2">
          Em <code className="text-[11px]">/orcamentos/[id]</code> tem 5 abas + ações no topo:
        </p>
        <div className="space-y-2 text-sm">
          <DefRow termo="Detalhes" texto="Cliente, responsável, validade, forma pagto, desconto, textos, itens (CRUD inline), arquivos." />
          <DefRow termo="Timeline" texto="Cronologia visual de eventos + datas das transições (dtEnviado, dtAprovado, dtLiberado, dtFinalizado, dtCancelado)." />
          <DefRow termo="Histórico" texto="Tabela de OrcamentoEvento (tipo, descrição, usuário, data) — versão tabular da timeline." />
          <DefRow termo="Mensagens" texto="Thread de comentários — pode ser restrito (só internos) ou público (visível ao cliente)." />
          <DefRow termo="Pesquisa" texto="Resultado da pesquisa NPS quando o cliente respondeu (após FINALIZADO)." />
        </div>
        <p className="text-sm text-foreground/80 mt-3">
          Ações disponíveis no topo (varia por status): <strong>Imprimir</strong>, <strong>Enviar</strong>,
          <strong> Aprovar/Recusar</strong> (interno), <strong>Duplicar</strong>, <strong>Reabrir</strong>,
          <strong> Paralisar/Retomar</strong>, <strong>Arquivar</strong>, <strong>Encerrar</strong>.
        </p>
      </Section>

      {/* ─────────────────────────────────────────────────────────── */}
      <Section icon={Lightbulb} titulo="Boas práticas" cor={FAQ_COLOR}>
        <ul className="list-disc list-inside space-y-1.5 text-sm ml-2">
          <li>
            <strong>Vincule itens SERVIÇO ao catálogo</strong> sempre que possível — é o que faz a cadeia
            de processos rodar automaticamente na aprovação. Item sem catalogoId é só dinheiro no total.
          </li>
          <li>
            <strong>Use o link público</strong> pra registrar aprovação/recusa do cliente — fica
            decisaoNome/decisaoCpf gravado, é prova auditável. Aprovação interna (botão Aprovar no
            detalhe) é pra exceções (cliente aprovou por telefone, presencial).
          </li>
          <li>
            <strong>Configure os prazos</strong> em /configuracoes pra refletir seu ciclo real — se
            seu mercado aprova em 30 dias e você deixou 15, todos os cards vão aparecer atrasados
            injustamente.
          </li>
          <li>
            <strong>Evite reabrir orçamento finalizado</strong> — em vez disso, duplique. Reabertura
            mexe na auditoria (limpa datas, conta no reaberturasCount); duplicar gera proposta limpa.
          </li>
          <li>
            <strong>Paralise em vez de cancelar</strong> quando o cliente sumiu sem dizer não. Mantém
            o card visível e os contadores de atraso parados; quando voltar, retoma de onde parou.
          </li>
        </ul>
      </Section>

      {/* ─────────────────────────────────────────────────────────── */}
      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/orcamentos" label="Kanban de orçamentos" cor={MODULO_COLOR} />
          <QuickLink href="/orcamentos/configuracoes" label="Configurações (prazos, e-mails, textos)" cor={MODULO_COLOR} />
          <QuickLink href="/orcamentos/parametros" label="Catálogo de serviços/taxas/despesas" cor={MODULO_COLOR} />
          <QuickLink href="/orcamentos/relatorios" label="Relatórios (funil, atrasos, ciclo)" cor={MODULO_COLOR} />
          <QuickLink href="/faq/processos" label="Como o processo criado na aprovação funciona" cor={MODULO_COLOR} />
          <QuickLink href="/faq/pesquisa-satisfacao" label="Pesquisa NPS pós-finalização" cor={MODULO_COLOR} />
          <QuickLink href="/faq/contratos" label="Contratos vinculados ao orçamento aprovado" cor={MODULO_COLOR} />
          <QuickLink href="/faq/servicos-editor" label="Modelar serviços e encadeamentos" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
