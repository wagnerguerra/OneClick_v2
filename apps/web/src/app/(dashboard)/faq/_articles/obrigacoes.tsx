'use client'

import {
  Receipt, Info, Repeat, ExternalLink, PowerOff,
  Calendar, Settings, AlertTriangle, ListChecks, Layers, Boxes,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)'
const FAQ_COLOR = '#0891b2'

export default function FaqObrigacoesPage() {
  return (
    <ArticleShell
      modulo="Serviços"
      moduloColor={MODULO_COLOR}
      icon={Receipt}
      titulo="Obrigações acessórias: cadastro em Serviços, grupos e recorrência"
      descricao="Obrigações acessórias (DAS, DCTFWeb, eSocial, ECD…) são serviços recorrentes: vivem dentro de Serviços com a marca de obrigação acessória, com regra de recorrência, vencimento previsto e fonte legal. O antigo módulo /obrigacoes foi unificado em /servicos."
    >
      <Callout tipo="info">
        <strong>Mudou de lugar.</strong> A tela dedicada <code>/obrigacoes</code> foi aposentada — obrigações acessórias agora são cadastradas e listadas em <code>/servicos</code> (marcadas com <code>ehObrigacaoAcessoria</code>). O agrupamento saiu dos antigos "Templates de Obrigações" e passou para <code>/servicos/grupos</code> (grupos do tipo <strong>Obrigações acessórias</strong>).
      </Callout>

      <Section icon={Info} titulo="Conceitos" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Obrigação acessória" texto="Declaração, demonstrativo ou guia que a contabilidade entrega periodicamente para o Fisco, conselho ou cliente (ex.: DAS, DCTFWeb, eSocial, ECD). No banco é um Servico com a flag ehObrigacaoAcessoria=true." />
          <DefRow termo="Onde cadastrar" texto="Em /servicos — o mesmo cadastro dos serviços, distinguido pela marca de obrigação acessória. A integração do Acessórias também cria obrigações direto a partir das entregas observadas." />
          <DefRow termo="Grupo de obrigações" texto="Um ServicoGrupo do tipo Obrigações acessórias (em /servicos/grupos). Reúne N obrigações para aplicar em lote num cliente — substitui os antigos Templates de Obrigações." />
          <DefRow termo="Recorrência" texto="Regra de disparo automático: frequência (mensal/trimestral/anual...), ancoragem (dia do mês, n-ésimo dia útil ou dias após competência) e offset de competência." />
          <DefRow termo="Próximo vencimento" texto="Data calculada em runtime pelo RecorrenciaScheduler com base na regra. Aparece no calendário de obrigações do cliente e no disparo diário da agenda." />
          <DefRow termo="Fonte oficial / Documentação" texto="URLs opcionais: a fonte serve pra auditoria (de onde tiramos a data — lei/IN) e a documentação pra operação (manual/FAQ oficial)." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Como usar</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Receipt} titulo="Cadastrar / encontrar a obrigação" rota="/servicos">
        <p>
          Obrigações acessórias ficam em <strong>Serviços</strong>. Ao criar um serviço, marque-o como
          obrigação acessória; ele passa a valer todo o motor de Serviços (SLA, etapas, fluxo, notificações).
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li>Os ajustes finos (SLA por etapa, fluxo/DAG, regras de notificação, recorrência personalizada) ficam em <code>/servicos/[id]</code>.</li>
          <li>A integração do <strong>Acessórias</strong> (Acessórias → Integração → Mapeamento) também cria a obrigação direto a partir de uma entrega observada e já vincula.</li>
        </ul>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Boxes} titulo="Agrupar obrigações" rota="/servicos/grupos">
        <p>
          Em <code>/servicos/grupos</code>, crie um grupo do tipo <strong>Obrigações acessórias</strong>. O
          seletor de itens passa a listar só obrigações acessórias, e o grupo fica disponível para aplicar
          em lote nos clientes.
        </p>
        <Callout tipo="info">
          O tipo do grupo restringe o que entra: <strong>Geral</strong> (qualquer serviço), <strong>Obrigações
          acessórias</strong> (só obrigações) ou <strong>Itens de orçamento</strong> (só serviços disponíveis
          para orçamento).
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={ListChecks} titulo="Aplicar um grupo no cliente" rota="/clientes">
        <p>
          Na ficha do cliente, aba <strong>Obrigações</strong>, use <strong>Aplicar grupo</strong> para
          herdar em lote as obrigações de um grupo (tipo Obrigações acessórias). Cada obrigação vira um
          vínculo <code>ClienteObrigacao</code>.
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Manter obrigações já existentes</strong> (padrão): adiciona só as que faltam; o que o cliente já tem fica intacto.</li>
          <li><strong>Substituir tudo</strong>: remove TODAS as obrigações atuais do cliente (inclusive as manuais) antes de aplicar — pede confirmação.</li>
          <li><strong>Adicionar individual</strong>: vincula uma obrigação avulsa, sem grupo.</li>
        </ul>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Calendar} titulo="Acompanhar vencimentos">
        <p>
          A aba Obrigações do cliente tem a visão <strong>Calendário</strong> (toggle Tabela ↔ Calendário no
          cabeçalho), que expande os próximos vencimentos a partir da recorrência de cada obrigação ativa.
          O disparo diário da agenda também lista os vencimentos do dia (cross-client).
        </p>
        <Callout tipo="info">
          O cálculo é determinístico — usa o mesmo motor do cron (<code>RecorrenciaScheduler</code>). Ajustou a regra, a próxima data atualiza ao recarregar.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={ExternalLink} titulo="Consultar fonte oficial e documentação">
        <p>Cada obrigação tem dois links opcionais (na ficha do serviço):</p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Fonte oficial</strong> — onde o vencimento foi confirmado (lei/IN)</li>
          <li><strong>Documentação</strong> — manual, FAQ ou guia oficial</li>
        </ul>
        <Callout tipo="dica">
          <strong>Por que dois?</strong> A <em>fonte</em> serve pra auditoria (provar de onde tiramos a data) e a <em>documentação</em> pra operação (resolver dúvidas na hora).
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={PowerOff} titulo="Desativar e reativar">
        <p>
          Como qualquer serviço, uma obrigação pode ser desativada em <code>/servicos/[id]</code>. Desativadas:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Não são</strong> mais executadas automaticamente pelo cron — o scheduler ignora <code>ativo=false</code></li>
          <li>São preservadas no histórico, mas saem da rotação até serem reativadas</li>
        </ul>
        <Callout tipo="aviso">
          Desativar é diferente de excluir. Como obrigações têm execuções vinculadas (histórico contábil), o caminho correto para "tirar de circulação" é desativar.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Recorrência avançada</h2>

      <Section icon={Repeat} titulo="Modos de ancoragem disponíveis" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="DIA_DO_MES" texto="Vencimento no dia exato (ex.: dia 20 do mês seguinte). Valor 31 = último dia do mês (clamp automático para fevereiro)." />
          <DefRow termo="DIA_UTIL" texto="N-ésimo dia útil do mês (ex.: 5º dia útil para pagamento de salário). Pula sábados e domingos automaticamente." />
          <DefRow termo="DIAS_APOS_COMPETENCIA" texto="N dias corridos após o fim do mês de competência (ex.: 10 dias após = útil para PIS/COFINS que tem prazo escalonado)." />
        </div>
        <Callout tipo="info">
          O campo <strong>Offset competência</strong> diz quantos meses pra trás está a competência em relação ao vencimento. 1 = competência mês anterior (típico de fiscal mensal). 0 = competência mês corrente (raro). 2 = competência 2 meses atrás (ex.: EFD-Contribuições).
        </Callout>
      </Section>

      <Section icon={Settings} titulo="Modo personalizado (composto)" cor={FAQ_COLOR}>
        <p className="text-sm">
          Para casos onde a regra simples não basta (ex.: 13º salário em 30/nov e 20/dez, ou trimestral em jan/abr/jul/out), use o <strong>modo personalizado</strong> dentro da aba Notificações em <code>/servicos/[id]</code>:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>diasDoMes</strong>: array de dias (ex.: [1, 15] para quinzenal)</li>
          <li><strong>mesesDoAno</strong>: array de meses (ex.: [1, 4, 7, 10] para trimestral em meses-âncora)</li>
        </ul>
        <Callout tipo="dica">
          Quando preenchido, o scheduler ignora frequência/ancoragem/valor e gera 1 disparo por combinação (dia × mês válido). 31 em <code>diasDoMes</code> ainda significa "último dia do mês".
        </Callout>
      </Section>

      <h2 className="text-base font-bold pt-2">Integração com o resto do sistema</h2>

      <Section icon={ListChecks} titulo="Como vira execução no cliente" cor={FAQ_COLOR}>
        <p className="text-sm">
          O cron de 06:00 (<code>RecorrenciaScheduler</code>) varre as obrigações ativas com <code>proximaExecucao ≤ hoje</code>:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li>Identifica os clientes contratantes (contratos VIGENTE ou ASSINADO)</li>
          <li>Para cada cliente, cria 1 <code>ServicoExecucao</code> com prazo, responsável e status iniciais</li>
          <li>Atribui o responsável conforme <code>atribuicaoResponsavel</code> da obrigação — para Acessórias o padrão é <strong>CLIENTE_AREA</strong> (resolve a partir da área contratada pelo cliente)</li>
          <li>Atualiza <code>ultimaExecucao</code> e recalcula <code>proximaExecucao</code></li>
        </ul>
      </Section>

      <Section icon={Layers} titulo="Por que reusa Servico no banco?" cor={FAQ_COLOR}>
        <p className="text-sm">
          Obrigações acessórias são serviços recorrentes — têm SLA, etapas, passos, fluxo de execução, regras de notificação. Em vez de duplicar tudo isso numa tabela <code>Obrigacao</code> à parte, o sistema reusa <code>Servico</code> com a flag <code>ehObrigacaoAcessoria=true</code>.
        </p>
        <p className="text-sm">
          Resultado: <strong>todo o motor de execução, fluxograma e notificações que existe para Serviços vale automaticamente para Obrigações</strong> — sem código duplicado. Foi por isso que a tela separada <code>/obrigacoes</code> pôde ser aposentada.
        </p>
      </Section>

      <h2 className="text-base font-bold pt-2">Dicas e armadilhas</h2>

      <Callout tipo="dica">
        <p className="font-semibold mb-1">🔍 Antes de criar uma obrigação nova, busque em Serviços</p>
        <p>Muitas já existem no cadastro. Use a busca de <code>/servicos</code> — pode ser que a obrigação já exista com nome ligeiramente diferente.</p>
      </Callout>

      <Callout tipo="aviso">
        <p className="font-semibold mb-1">⚠️ Cliente sem contrato não recebe execução</p>
        <p>O scheduler só cria execução para clientes com contrato <strong>VIGENTE</strong> ou <strong>ASSINADO</strong> que tenha esse serviço vinculado em <code>ContratoServico</code>. Se uma obrigação parece "não disparar", verifique primeiro o contrato.</p>
      </Callout>

      <Callout tipo="info">
        <AlertTriangle className="inline-block h-3.5 w-3.5 mr-1" />
        <strong>Aplicar grupo é aditivo por padrão.</strong> O modo "Substituir tudo" remove todas as obrigações atuais do cliente (inclusive as manuais) antes de reaplicar — use com atenção; ele pede confirmação.
      </Callout>
    </ArticleShell>
  )
}
