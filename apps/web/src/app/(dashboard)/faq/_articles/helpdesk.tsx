'use client'

import {
  Headphones, Mail, MessageSquare, Tag, Clock, CheckCircle2, AlertTriangle,
  Star, Info, Lightbulb, ArrowRight, Eye, LayoutGrid, ShieldCheck, Inbox,
  UserCog, Pause, Lock,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)' // cyan — grupo TI
const FAQ_COLOR = '#0e7490'

export default function FaqHelpdeskPage() {
  return (
    <ArticleShell
      modulo="HelpDesk"
      moduloColor={MODULO_COLOR}
      icon={Headphones}
      titulo="HelpDesk: abertura, atendimento, SLA e CSAT"
      descricao="Como o time da TI recebe e resolve tickets — registro pelo usuário, atribuição, mensagens, prazos automáticos e avaliação obrigatória no fechamento."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Ticket" texto="Um pedido de suporte. Tem número visível (#HLP0001), título, descrição, prioridade, categoria e status." />
          <DefRow termo="Solicitante" texto="Quem abriu o ticket. Pode ser um usuário interno ou um remetente externo (e-mail entrando via Resend Inbound)." />
          <DefRow termo="Responsável (agente)" texto="Membro da TI que assume o atendimento. Aparece no card e recebe as notificações do andamento." />
          <DefRow termo="Categoria" texto="Hierarquia Hardware/Software/Rede/Acesso/E-mail/Sistemas/Segurança/Outros — define SLA padrão e área de roteamento." />
          <DefRow termo="Prioridade" texto="Baixa, Média, Alta, Urgente. Define o SLA de 1ª resposta e de resolução (ajustável em /configuracoes → Helpdesk)." />
          <DefRow termo="SLA" texto="Prazo automático calculado na criação. Pausa quando o status vira Aguardando solicitante/terceiro." />
          <DefRow termo="CSAT" texto="Avaliação 1–5 estrelas obrigatória no fechamento. Sem CSAT, o ticket fica em Resolvido até o solicitante responder ou auto-fechar." />
          <DefRow termo="Nota interna" texto="Mensagem visível só para agentes — não notifica o solicitante. Útil para troubleshooting e handoff entre técnicos." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Fluxo do solicitante</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Headphones} titulo="Abrir um ticket pelo painel" rota="/helpdesk/meus → + Novo Ticket">
        <p>
          Qualquer usuário com acesso ao sistema pode abrir um ticket. O modal pede:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Tipo</strong> — Incidente (algo quebrou), Requisição (novo recurso/acesso), Dúvida ou Melhoria</li>
          <li><strong>Categoria</strong> — escolha hierárquica (Hardware → Notebook, Rede → Wi-Fi, etc.)</li>
          <li><strong>Título</strong> e <strong>Descrição</strong> (rich text — colar prints com Ctrl+V)</li>
          <li><strong>Prioridade</strong> — sugerida pelo sistema com base na categoria; o agente revisa</li>
          <li><strong>Anexos</strong> — drag/drop ou colar imagem direto da área de transferência</li>
        </ul>
        <Callout tipo="dica">
          Quanto mais contexto (passos pra reproduzir, hora em que aconteceu, mensagens de erro
          completas), mais rápido a TI resolve. Prints colados direto na descrição ajudam muito.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Mail} titulo="Abrir por e-mail (clientes externos)" rota="helpdesk@central-rnc.com.br">
        <p>
          Endereço configurado em <code className="text-[11px]">/configuracoes → Helpdesk</code> recebe e-mails
          e converte em tickets automaticamente via Resend Inbound. Como funciona:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>O <strong>assunto</strong> vira título do ticket</li>
          <li>O <strong>corpo HTML</strong> vira descrição</li>
          <li><strong>Anexos do e-mail</strong> são salvos automaticamente</li>
          <li>Se o assunto contém <code className="text-[11px]">#HLP1234</code>, a mensagem é
            anexada ao ticket existente em vez de criar um novo</li>
          <li>Se o remetente <strong>não tem conta</strong> no sistema, fica como solicitante externo
            (e-mail + nome capturados do header)</li>
        </ul>
        <Callout tipo="info">
          <Inbox className="inline h-3 w-3" /> O time da TI vê uma etiqueta especial nos tickets
          vindos por e-mail. Toda resposta pública do agente é enviada de volta ao remetente
          via Resend, mantendo a thread no Outlook/Gmail do cliente.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Eye} titulo="Acompanhar e responder" rota="/helpdesk/meus">
        <p>
          A página <code className="text-[11px]">/helpdesk/meus</code> lista todos os seus tickets — abertos
          e histórico. Clique em qualquer um para ver a conversa, anexar mais arquivos e
          responder às solicitações do agente.
        </p>
        <Callout tipo="aviso">
          Quando o agente coloca o ticket em <strong>Aguardando solicitante</strong>, o
          relógio do SLA pausa. Responda o quanto antes — assim que você comenta, o status
          volta para <strong>Em andamento</strong> automaticamente.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Star} titulo="Avaliar (CSAT) — obrigatório">
        <p>
          Quando o agente marca o ticket como <strong>Resolvido</strong>, o sistema solicita
          sua avaliação:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Nota de <strong>1 a 5 estrelas</strong> (obrigatório)</li>
          <li>Comentário opcional (use pra elogiar ou apontar melhoria)</li>
          <li>Sem avaliar, o ticket auto-fecha em <strong>3 dias úteis</strong> sem registrar nota</li>
        </ul>
        <Callout tipo="dica">
          O CSAT alimenta o dashboard de TI — equipe vê o que está indo bem e onde melhorar.
          Avaliações são privadas (só master/líder TI veem o nome do avaliador).
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Fluxo do agente (TI)</h2>

      <Step n={5} cor={MODULO_COLOR} icon={LayoutGrid} titulo="Painel Kanban" rota="/helpdesk">
        <p>
          A página principal mostra todos os tickets da TI em colunas — <strong>arraste para mudar
          o status</strong> ou clique no card para abrir o detalhe. Colunas:
        </p>
        <ul className="space-y-1.5 ml-2">
          <li><Badge variant="outline" className="text-[10px] h-5 bg-sky-50 border-sky-200 text-sky-700">Novo</Badge> — sem responsável ainda</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-violet-50 border-violet-200 text-violet-700">Em andamento</Badge> — agente atuando</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-200 text-amber-700">Aguardando solicitante</Badge> — SLA pausado</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-200 text-amber-700">Aguardando terceiro</Badge> — fornecedor externo, SLA pausado</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 border-emerald-200 text-emerald-700">Resolvido</Badge> — esperando CSAT do solicitante</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-gray-100 border-gray-300 text-gray-700">Concluído</Badge> — CSAT recebido ou auto-fechado</li>
        </ul>
        <Callout tipo="info">
          Filtros (prioridade, categoria, “meus tickets” / “área TI” / “todos”) acima do board.
          Toggle <strong>Kanban / Lista</strong> no canto direito quando preferir TanStack table.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={UserCog} titulo="Assumir um ticket" rota="card → clicar no avatar do responsável">
        <p>
          Cards novos chegam sem responsável (status <strong>Novo</strong>). Quem da TI tem
          permissão <code className="text-[11px]">atuar_agente</code> pode:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Clicar no avatar (?) → escolher a si mesmo ou outro agente da área TI</li>
          <li>Arrastar pra coluna <strong>Em andamento</strong> (auto-atribui pra você)</li>
          <li>Líder TI / Master pode reatribuir entre qualquer agente da área</li>
        </ul>
        <Callout tipo="info">
          Lista de candidatos é filtrada pela <strong>área da categoria</strong> do ticket — se
          for &quot;Hardware&quot; vinculado à área TI, só agentes da TI aparecem.
        </Callout>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={MessageSquare} titulo="Responder (pública) ou anotar (interna)">
        <p>
          Na tela de detalhe, a thread de mensagens tem dois botões distintos:
        </p>
        <ul className="space-y-1.5 ml-2">
          <li>
            <Badge variant="outline" className="text-[10px] h-5 bg-sky-50 border-sky-200 text-sky-700">Mensagem pública</Badge>{' '}
            — visível ao solicitante. Notifica via sino + e-mail.
          </li>
          <li>
            <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-200 text-amber-700">Nota interna</Badge>{' '}
            — só agentes veem. Útil para registrar diagnóstico, passar contexto ao próximo turno.
          </li>
        </ul>
        <Callout tipo="aviso">
          <Lock className="inline h-3 w-3" /> Não confunda. Nota interna com informação sensível
          (senhas, IPs) <strong>nunca</strong> deve ser convertida em mensagem pública sem revisão.
        </Callout>
      </Step>

      <Step n={8} cor={MODULO_COLOR} icon={Pause} titulo="Pausar SLA aguardando informação">
        <p>
          Quando você precisa de algo do solicitante (login, captura de tela, autorização), mude
          o status para <strong>Aguardando solicitante</strong>. Comportamento:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>O <strong>relógio SLA pausa</strong> imediatamente</li>
          <li>Ao receber mensagem pública do solicitante, status <strong>volta automaticamente para Em andamento</strong></li>
          <li>O tempo total pausado fica no histórico (auditoria de SLA)</li>
        </ul>
      </Step>

      <Step n={9} cor={MODULO_COLOR} icon={CheckCircle2} titulo="Resolver (não &quot;Concluir&quot;)">
        <p>
          Quando você termina o atendimento, marque como <strong>Resolvido</strong> — não
          como Concluído. Isso abre a janela de CSAT para o solicitante.
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Solicitante recebe e-mail pedindo a avaliação</li>
          <li>Após avaliação (ou 3 dias úteis sem resposta), o ticket vira <strong>Concluído</strong> automaticamente</li>
          <li>Se o solicitante responder antes de avaliar (&quot;Não resolveu, continua o problema&quot;), o ticket é <strong>reaberto em Em andamento</strong></li>
        </ul>
        <Callout tipo="dica">
          Antes de resolver, escreva uma <strong>mensagem pública de fechamento</strong> com
          o que foi feito e como replicar caso o problema retorne. Vira KB informal pro próximo
          ticket similar.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">SLA e prioridades</h2>

      <Section icon={Clock} titulo="Tempos padrão (configuráveis)" cor={FAQ_COLOR}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Prioridade</th>
                <th className="text-left px-3 py-2 font-semibold">1ª resposta</th>
                <th className="text-left px-3 py-2 font-semibold">Resolução</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t"><td className="px-3 py-1.5"><strong className="text-rose-700">Urgente</strong></td><td className="px-3 py-1.5">1h</td><td className="px-3 py-1.5">4h</td></tr>
              <tr className="border-t"><td className="px-3 py-1.5"><strong className="text-amber-700">Alta</strong></td><td className="px-3 py-1.5">4h</td><td className="px-3 py-1.5">24h</td></tr>
              <tr className="border-t"><td className="px-3 py-1.5"><strong className="text-sky-700">Média</strong></td><td className="px-3 py-1.5">8h</td><td className="px-3 py-1.5">48h</td></tr>
              <tr className="border-t"><td className="px-3 py-1.5"><strong className="text-emerald-700">Baixa</strong></td><td className="px-3 py-1.5">24h</td><td className="px-3 py-1.5">5 dias úteis</td></tr>
            </tbody>
          </table>
        </div>
        <Callout tipo="info">
          Categoria pode <strong>sobrescrever</strong> o SLA padrão (ex: Segurança usa o SLA dela
          mesmo se prioridade for Média). Configurável em <code className="text-[11px]">/configuracoes → Helpdesk → Categorias</code>.
        </Callout>
      </Section>

      <h2 className="text-base font-bold pt-2">Categorias TI padrão</h2>

      <Section icon={Tag} titulo="Catálogo inicial (seed)" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-md border p-2"><strong>Hardware</strong> — Notebook, Periféricos, Impressora, Monitor, Cabos</div>
          <div className="rounded-md border p-2"><strong>Software</strong> — Instalação, Erro/Travamento, Licença, Office</div>
          <div className="rounded-md border p-2"><strong>Rede</strong> — Sem internet, Wi-Fi, VPN, Compartilhamento</div>
          <div className="rounded-md border p-2"><strong>Acesso</strong> — Reset senha, Solicitação, MFA, Conta nova</div>
          <div className="rounded-md border p-2"><strong>E-mail</strong> — Setup, Quota, Spam, Lista</div>
          <div className="rounded-md border p-2"><strong>Sistemas internos</strong> — ERP/SCI, Ponto, Acesso, Erro</div>
          <div className="rounded-md border p-2"><strong>Segurança</strong> — Phishing, Malware, Vazamento, LGPD</div>
          <div className="rounded-md border p-2"><strong>Outros</strong> — sem encaixe nas demais</div>
        </div>
        <Callout tipo="info">
          Master/admin pode editar o catálogo em <code className="text-[11px]">/configuracoes → Helpdesk → Categorias</code> —
          adicionar subcategorias específicas do seu time, ajustar cores e SLA por categoria.
        </Callout>
      </Section>

      <h2 className="text-base font-bold pt-2">Permissões</h2>

      <Section icon={ShieldCheck} titulo="Quem faz o quê" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Qualquer usuário logado" texto="Abre tickets como solicitante. Vê só os próprios em /helpdesk/meus." />
          <DefRow termo="atuar_agente" texto="Atende tickets — assume, comenta (público/interno), muda status, fecha." />
          <DefRow termo="change_responsavel" texto="Reatribui entre agentes — líder TI e cargos seniores." />
          <DefRow termo="scope_proprios / scope_area / scope_todos" texto="Define o que aparece no kanban: meus tickets, da minha área, ou todos da empresa." />
          <DefRow termo="gerenciar_categorias" texto="Edita o catálogo de categorias e SLA — apenas master/empresa-master por padrão." />
          <DefRow termo="panel_metricas" texto="Acessa a página de métricas TI (CSAT médio, MTTR, % SLA cumprido)." />
        </div>
        <Callout tipo="aviso">
          <AlertTriangle className="inline h-3 w-3" /> A permissão <code className="text-[11px]">helpdesk</code> sem
          <code className="text-[11px]">atuar_agente</code> permite ver tickets (escopo conforme as outras subs)
          mas não atender — útil para gestores que só precisam acompanhar.
        </Callout>
      </Section>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente externo respondendo um ticket</p>
            <p className="text-foreground/70">
              Quando o agente envia mensagem pública via Resend, o cliente recebe e-mail com o
              número <code className="text-[11px]">#HLP1234</code> no assunto. Se ele responder direto pelo
              cliente de e-mail, o inbound parser anexa a resposta ao ticket original — sem
              precisar acessar o sistema.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Reabrir um ticket concluído</p>
            <p className="text-foreground/70">
              Tickets concluídos não podem ser editados — preserve o histórico. Se o problema
              voltar, abra novo ticket referenciando o anterior na descrição. Auto-link
              automático via número (<code className="text-[11px]">#HLP1234</code>) na descrição.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">SLA estourou — e agora?</p>
            <p className="text-foreground/70">
              Notificação dispara para responsável + líder TI + coordenador. O card no kanban
              ganha borda vermelha pulsante. O histórico de SLA estourado fica visível no
              painel de métricas para identificar gargalos.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/helpdesk" label="Painel TI (kanban)" cor={MODULO_COLOR} />
          <QuickLink href="/helpdesk/meus" label="Meus tickets" cor={MODULO_COLOR} />
          <QuickLink href="/helpdesk/metricas" label="Métricas (CSAT, MTTR, SLA)" cor={MODULO_COLOR} />
          <QuickLink href="/configuracoes" label="Configurar categorias e SLA" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
