'use client'

import {
  Mail, Repeat, Bell, Clock, AlertTriangle, Info, Lightbulb, Send, Settings,
  CheckCircle2, PlayCircle, HelpCircle,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)'
const FAQ_COLOR = '#0891b2'

export default function FaqServicosNotificacoesPage() {
  return (
    <ArticleShell
      modulo="Serviços"
      moduloColor={MODULO_COLOR}
      icon={Mail}
      titulo="Recorrência e notificações automáticas por serviço"
      descricao="Configure o disparo periódico de execuções (mensal, trimestral, anual...) e crie regras de e-mail por evento — atrasada, concluída, prazo próximo, etc."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Recorrência" texto="Regra de disparo automático. Um cron diário (6h) cria execuções para todos os clientes com contrato vigente vinculado ao serviço." />
          <DefRow termo="Regra de notificação" texto="Envia e-mail quando um evento acontece (atrasada, concluída...). Múltiplas regras por serviço, idempotentes (não duplicam)." />
          <DefRow termo="Evento" texto="Gatilho que dispara a notificação: Iniciada, Concluída, Atrasada, Prazo próximo, Pausada, Cancelada, Aguardando resposta." />
          <DefRow termo="Destinatário" texto="Quem recebe o e-mail: Responsável da execução, Gestor do processo, Cliente vinculado, Watchers, ou lista CUSTOM de e-mails." />
          <DefRow termo="Antecedência (Prazo próximo)" texto="Quantas horas antes do prazo o lembrete deve disparar. Padrão: 24h." />
          <DefRow termo="Variáveis" texto="Placeholders substituídos no assunto/corpo do e-mail. Ex: {{servico.nome}}, {{cliente.razaoSocial}}, {{prazo.data}}, {{link.execucao}}." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Como configurar</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Settings} titulo="Abrir a aba Notificações" rota="/servicos/[id] → aba Notificações">
        <p>
          No detalhe do serviço, abra a aba <strong>Notificações</strong>. Você verá dois cards:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Recorrência automática</strong> — disparo periódico do serviço</li>
          <li><strong>Regras de notificação</strong> — e-mails enviados em eventos do ciclo de vida</li>
        </ul>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Repeat} titulo="Configurar recorrência">
        <p>Defina três campos principais:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Frequência</strong>: Diária, Semanal, Mensal, Trimestral, Semestral, Anual</li>
          <li><strong>Ancoragem</strong>: como definir o dia exato — Dia do mês (ex: dia 20), N-ésimo dia útil (ex: 5º dia útil), ou Dias após competência</li>
          <li><strong>Competência (offset)</strong>: 1 = competência mês anterior (típico fiscal). 0 = competência mês corrente</li>
        </ul>
        <Callout tipo="info">
          O scheduler roda às <strong>06:00</strong> todos os dias. Quando encontra uma recorrência com próxima execução vencida, cria uma <code>ServicoExecucao</code> para cada cliente com contrato VIGENTE (ou ASSINADO) vinculado a esse serviço — atribuindo o responsável padrão configurado.
        </Callout>
        <Callout tipo="warning">
          Cliente sem contrato vinculado ao serviço <strong>não recebe</strong> execução. Atualize o contrato em /contratos antes de ativar a recorrência.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Bell} titulo="Criar regra de notificação">
        <p>
          Clique em <strong>+ Nova regra</strong> ou em um dos templates prontos. Cada regra precisa:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Evento</strong> que dispara o e-mail</li>
          <li><strong>Destinatário</strong> (de onde sai o e-mail final)</li>
          <li><strong>Assunto</strong> e <strong>corpo HTML</strong> com variáveis</li>
          <li>Se evento for <strong>Prazo próximo</strong>: <strong>antecedência em horas</strong></li>
        </ul>
        <Callout tipo="info">
          O botão <strong>Enviar teste</strong> manda o e-mail para um endereço de sua escolha com dados fictícios — útil para validar formatação antes de salvar.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Send} titulo="Usar variáveis no template">
        <p>O painel direito do editor lista as variáveis disponíveis. Clique para copiar e cole onde quiser no assunto ou no corpo:</p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-[12px] font-mono">
          <li>{'{{servico.nome}}'} — nome do serviço</li>
          <li>{'{{cliente.razaoSocial}}'} — razão social do cliente</li>
          <li>{'{{cliente.documento}}'} — CNPJ/CPF</li>
          <li>{'{{responsavel.name}}'} — nome do responsável</li>
          <li>{'{{prazo.data}}'} / {'{{prazo.hora}}'} — prazo formatado</li>
          <li>{'{{processo.nome}}'} — nome do processo (se houver)</li>
          <li>{'{{link.execucao}}'} — URL absoluta da execução</li>
        </ul>
      </Step>

      <h2 className="text-base font-bold pt-2">Eventos disponíveis</h2>

      <Section icon={PlayCircle} titulo="Iniciada" cor={FAQ_COLOR}>
        <p className="text-sm">Disparado quando uma execução é criada em status <code>EM_ANDAMENTO</code>. Não inclui sucessores criados em <code>AGUARDANDO_INICIO</code> — apenas quando o gestor iniciar manualmente é que o evento <strong>Iniciada</strong> ocorrerá novamente.</p>
      </Section>

      <Section icon={CheckCircle2} titulo="Concluída" cor={FAQ_COLOR}>
        <p className="text-sm">Disparado uma única vez por execução, quando ela vai para <code>CONCLUIDO</code>. Idempotente — chamadas repetidas (cascata de processo) não duplicam o envio.</p>
      </Section>

      <Section icon={AlertTriangle} titulo="Atrasada" cor={FAQ_COLOR}>
        <p className="text-sm">Disparado pelo scheduler horário (minuto 5) quando detecta execução com <code>prazoLimite &lt; agora</code>, status <code>EM_ANDAMENTO</code> e não pausada. Marca <code>notificadoAtrasoEm</code> para evitar re-envio em horas seguintes.</p>
      </Section>

      <Section icon={Clock} titulo="Prazo próximo" cor={FAQ_COLOR}>
        <p className="text-sm">Disparado pelo scheduler horário (minuto 17). Para cada regra ativa desse tipo, varre execuções com <code>prazoLimite</code> entrando na janela [agora, agora + antecedenciaHoras]. Padrão 24h — útil como lembrete preventivo antes do SLA estourar.</p>
      </Section>

      <Section icon={HelpCircle} titulo="Aguardando resposta" cor={FAQ_COLOR}>
        <p className="text-sm">Disparado quando uma execução de bloco <strong>PERGUNTA</strong> entra em <code>AGUARDANDO_RESPOSTA</code>. Útil para avisar o gestor que há decisão pendente no fluxo.</p>
      </Section>

      <h2 className="text-base font-bold pt-2">Dicas e boas práticas</h2>

      <Callout tipo="info">
        <p className="font-semibold mb-1">🎯 Use templates prontos para começar</p>
        <p>Quando não há regras configuradas, o card oferece templates clicáveis (Atrasada→Responsável, Concluída→Cliente, etc). Eles já vêm com variáveis pré-aplicadas — basta clicar, ajustar e salvar.</p>
      </Callout>

      <Callout tipo="warning">
        <p className="font-semibold mb-1">⚠️ Configure SMTP/Resend antes</p>
        <p>O envio depende de credenciais de e-mail válidas no sistema. Configure em <code>/configuracoes</code> — primeiro tenta Resend (RESEND_API_KEY), fallback para SMTP.</p>
      </Callout>

      <Callout tipo="info">
        <Lightbulb className="inline-block h-3.5 w-3.5 mr-1" />
        <strong>Idempotência:</strong> uma regra dispara no máximo 1 vez por execução por evento. O log <code>ServicoNotificacaoLog</code> com unique <code>(regra, exec, evento)</code> garante isso — retries do engine não duplicam.
      </Callout>

      <Callout tipo="warning">
        <strong>Sem destinatário válido?</strong> Se uma regra do tipo CLIENTE for disparada e o cliente não tem e-mail cadastrado, a regra é silenciosamente ignorada (sem gravar log). Quando o e-mail for adicionado, o envio acontece no próximo disparo.
      </Callout>

      <Callout tipo="info">
        <strong>Múltiplas regras para o mesmo evento</strong>: você pode criar N regras com mesmo evento e destinatários diferentes (ex: "Concluída → Cliente" + "Concluída → Gestor"). Cada uma é independente.
      </Callout>
    </ArticleShell>
  )
}
