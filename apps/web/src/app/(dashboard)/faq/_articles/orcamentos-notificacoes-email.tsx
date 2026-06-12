'use client'

import {
  Mail, Send, Bell, Clock, CheckCircle2, XCircle, PlayCircle, Flag,
  MessageSquare, Settings2, Info, Lightbulb, ArrowRight, AlertTriangle, Users,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, DefRow, QuickLink, CasoPratico } from '../_components/article-blocks'

const MODULO_COLOR = '#fb7185' // rosa — módulo comercial/orçamentos
const FAQ_COLOR = '#0891b2'    // ciano — padrão FAQ

export default function FaqOrcamentosNotificacoesEmailPage() {
  return (
    <ArticleShell
      modulo="Orçamentos"
      moduloColor={MODULO_COLOR}
      icon={Mail}
      titulo="Orçamentos: notificações por e-mail e sino"
      descricao="Quem é avisado, por qual canal e em qual passo do orçamento — e o que cada configuração em /orcamentos/configuracoes controla."
    >
      {/* ── Conceitos ── */}
      <Section icon={Info} titulo="Conceitos" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Canal" texto={<>Por onde o aviso chega: <strong>sino</strong> (notificação dentro do sistema, em tempo real) e/ou <strong>e-mail</strong>. As notificações de <em>áreas</em> respeitam os canais marcados na config; as de <em>status</em> são sempre por e-mail.</>} />
          <DefRow termo="E-mail comercial / financeiro" texto="Listas de e-mails (separadas por vírgula) que recebem os avisos internos das mudanças de status. Configuradas na aba Notificações." />
          <DefRow termo="Líder / substituto da área" texto="Quem recebe o pedido para detalhar a parte de uma área no orçamento. O líder vem do cadastro da Área; o substituto é definido na config de Áreas." />
          <DefRow termo="Área comercial" texto="Área escolhida na config para receber os avisos quando uma área deixa de detalhar no prazo (atraso)." />
          <DefRow termo="Prazo de detalhamento" texto="Dias (úteis ou corridos) que cada área tem para detalhar sua parte. Vencido, vira ATRASADO e dispara aviso." />
        </div>
      </Section>

      {/* ── Onde configurar ── */}
      <Section icon={Settings2} titulo="Onde se configura (/orcamentos/configuracoes)" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Aba Notificações" texto={<>E-mails que recebem os avisos internos: <strong>E-mail comercial</strong> e <strong>E-mail financeiro</strong>.</>} />
          <DefRow termo="Aba Prazos" texto="Limites em dias por status (enviar, aprovar, revisar) usados pelo robô diário para apontar orçamentos parados, e a validade da proposta." />
          <DefRow termo="Aba Textos" texto="Texto de apresentação que entra no corpo do e-mail enviado ao cliente." />
          <DefRow termo="Aba Áreas" texto={<>Canais (sino/e-mail) das notificações de área, prazo de detalhamento, áreas habilitadas + substitutos, e o aviso de atraso ao comercial (<strong>Avisar comercial</strong> + <strong>Área comercial</strong>).</>} />
        </div>
        <Callout tipo="dica">
          O campo <strong>“Notificar novos orçamentos para” (e-mail)</strong> dispara um e-mail para os endereços listados <strong>sempre que um orçamento é criado</strong> — tanto pelo balão “Solicitar/Criar Novo” quanto pelo formulário de novo orçamento. (Duplicação NÃO dispara.)
        </Callout>
      </Section>

      {/* ── Fluxo passo-a-passo ── */}
      <h2 className="text-base font-bold pt-2">Fluxo de notificações, passo a passo</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Users} titulo="Solicitação com áreas → avisa quem vai detalhar" rota="/orcamentos">
        <p>Ao solicitar um orçamento marcando áreas envolvidas (balão “Criar Novo” ou vínculo de áreas), cada área vira um item pendente e o sistema avisa:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Quem:</strong> líder + substituto da área. Se a área não tiver nenhum dos dois, cai para a <strong>área comercial</strong>.</li>
          <li><strong>Canal:</strong> sino e/ou e-mail, conforme os canais marcados na aba Áreas.</li>
          <li><strong>Assunto:</strong> “Detalhe a área &lt;nome&gt; no orçamento #&lt;n&gt;” — com o prazo.</li>
        </ul>
        <Callout tipo="info">Cada pessoa é avisada <strong>uma vez</strong> (a data fica registrada). Detalhar a parte muda a área para DETALHADO.</Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Clock} titulo="Área no atraso → avisa o comercial" rota="robô diário 08:00">
        <p>O robô diário marca como <strong>ATRASADO</strong> toda área que passou do prazo sem detalhar e avisa:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Quem:</strong> a área comercial (se “Avisar comercial” estiver ligado); sem comercial definido, cai para o <strong>solicitante</strong> do orçamento.</li>
          <li><strong>Canal:</strong> sino e/ou e-mail (canais da aba Áreas). <strong>Assunto:</strong> “Área &lt;nome&gt; em atraso no orçamento #&lt;n&gt;”.</li>
          <li><strong>Gate:</strong> só dispara se <strong>Avisar comercial</strong> estiver ativo. Avisa <strong>uma vez</strong> por atraso.</li>
        </ul>
        <Callout tipo="aviso">Hoje o aviso de atraso vai para o <strong>comercial/solicitante</strong>, e <strong>não</strong> para o líder/substituto que perdeu o prazo.</Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Send} titulo="Envio ao cliente — A_ENVIAR → ENVIADO" rota="botão Enviar / mudar status">
        <p>Na <strong>primeira</strong> vez que o orçamento vai para ENVIADO, saem dois e-mails:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Ao cliente:</strong> e-mail do cliente + e-mails de contatos do orçamento, com a proposta (resumo, itens, totais) e botão para ver/aprovar pelo link público. Inclui o texto de apresentação configurado.</li>
          <li><strong>Interno:</strong> comercial + financeiro recebem “[Interno] Orçamento #&lt;n&gt; enviado ao cliente”.</li>
        </ul>
        <Callout tipo="info">O botão “Enviar” (envio manual) permite escolher destinatários e mensagem próprios; sem escolher, usa cliente + contatos + comercial.</Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={CheckCircle2} titulo="Aprovação → APROVADO" rota="link público / status">
        <p>Quando o cliente aprova (ou o status muda para APROVADO):</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>E-mail:</strong> comercial + financeiro — “✓ Orçamento #&lt;n&gt; aprovado”.</li>
          <li><strong>Sino:</strong> o sistema cria os serviços/processo a partir dos itens e avisa no sino o <strong>responsável</strong> designado (se for diferente de quem aprovou): “Novo(s) serviço(s) atribuído(s)”.</li>
        </ul>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={XCircle} titulo="Recusa → ENCERRADO" rota="link público / status">
        <p>Se o cliente recusa (ENCERRADO vindo de ENVIADO/NOVO/A_ENVIAR): e-mail para <strong>comercial + financeiro</strong> — “Orçamento #&lt;n&gt; recusado”, sugerindo follow-up.</p>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={PlayCircle} titulo="Liberação → LIBERADO" rota="status">
        <p>Ao liberar para execução: e-mail para <strong>comercial + responsável</strong> do orçamento — “▶ Orçamento #&lt;n&gt; liberado para execução”.</p>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={Flag} titulo="Finalização → FINALIZADO" rota="status">
        <p>Ao finalizar: e-mail para o <strong>comercial</strong> — “✓ Orçamento #&lt;n&gt; finalizado”. A <strong>pesquisa de satisfação</strong> é gerada e enviada ao cliente automaticamente.</p>
      </Step>

      <Step n={8} cor={MODULO_COLOR} icon={Bell} titulo="Orçamento parado → lembrete no sino" rota="robô diário 08:00">
        <p>O robô diário aponta no <strong>sino</strong> os orçamentos parados além do prazo da aba Prazos:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>NOVO/A_ENVIAR além de <code>dias_enviar</code> · ENVIADO além de <code>dias_aprovar</code> · APROVADO além de <code>dias_revisar</code>.</li>
          <li><strong>Quem:</strong> responsável (ou solicitante). <strong>Canal:</strong> só sino (sem e-mail). O aviso é atualizado, não duplicado.</li>
        </ul>
      </Step>

      <Step n={9} cor={MODULO_COLOR} icon={MessageSquare} titulo="Mensagem com menção → avisa os escolhidos" rota="aba Mensagens do orçamento">
        <p>Ao escrever uma mensagem no orçamento e marcar usuários, eles recebem por <strong>e-mail</strong> “Nova mensagem em #&lt;n&gt;” com o conteúdo e link.</p>
      </Step>

      {/* ── Lacunas ── */}
      <Section icon={AlertTriangle} titulo="O que ainda NÃO notifica (revisar)" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <CasoPratico
            titulo="Área concluída não avisa o comercial"
            descricao={<>Quando uma área detalha sua parte (ou quando <strong>todas</strong> as áreas concluem), ninguém é avisado — o comercial precisa acompanhar manualmente.</>}
          />
          <CasoPratico
            titulo="Atraso de área não avisa o responsável da área"
            descricao={<>O aviso de atraso vai só para o comercial/solicitante; o líder/substituto que perdeu o prazo não é cobrado de novo.</>}
          />
          <CasoPratico
            titulo="Lembrete de orçamento parado é só sino"
            descricao={<>O robô diário avisa orçamentos parados apenas no sino — não há e-mail, e não há gate de configuração para ligar/desligar esse aviso.</>}
          />
        </div>
      </Section>

      {/* ── Casos comuns ── */}
      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <CasoPratico
            titulo="Cliente não recebeu a proposta"
            descricao={<>Confira o e-mail no cadastro do cliente e os contatos do orçamento. O e-mail ao cliente só sai na <strong>primeira</strong> ida a ENVIADO; para reenviar, use o botão <strong>Enviar</strong> e informe o destinatário.</>}
          />
          <CasoPratico
            titulo="Comercial/financeiro não recebem nada"
            descricao={<>Os avisos internos dependem das listas <strong>E-mail comercial/financeiro</strong> na aba Notificações. Se estiverem vazias, ninguém recebe.</>}
          />
          <CasoPratico
            titulo="Avisos de área não chegam por e-mail"
            descricao={<>Na aba Áreas, confirme que o canal <strong>e-mail</strong> está marcado e que a área tem líder/substituto (ou uma área comercial definida).</>}
          />
        </div>
      </Section>

      {/* ── Atalhos ── */}
      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/orcamentos/configuracoes" label="Configurações de orçamentos" cor={MODULO_COLOR} />
          <QuickLink href="/orcamentos" label="Ir para Orçamentos" cor={MODULO_COLOR} />
          <QuickLink href="/faq/orcamentos" label="FAQ: do NOVO ao FINALIZADO" cor={MODULO_COLOR} />
          <QuickLink href="/faq/pesquisa-satisfacao" label="FAQ: pesquisa de satisfação" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
