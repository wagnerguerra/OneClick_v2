'use client'

import {
  Receipt, Info, Plus, Repeat, ExternalLink, FileText, Power, PowerOff,
  Calendar, Filter, Settings, AlertTriangle, ListChecks, Layers,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)'
const FAQ_COLOR = '#0891b2'

export default function FaqObrigacoesPage() {
  return (
    <ArticleShell
      modulo="Obrigações"
      moduloColor={MODULO_COLOR}
      icon={Receipt}
      titulo="Obrigações Acessórias: catálogo, vencimentos e fontes oficiais"
      descricao="O módulo /obrigacoes é o catálogo global das obrigações fiscais, trabalhistas e contábeis que sua contabilidade entrega aos clientes — cada uma com regra de recorrência, vencimento previsto e link para fonte legal + documentação oficial."
    >
      <Section icon={Info} titulo="Conceitos" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Obrigação acessória" texto="Declaração, demonstrativo ou guia que a contabilidade entrega periodicamente para o Fisco, conselho ou cliente (ex.: DAS, DCTFWeb, eSocial, ECD)." />
          <DefRow termo="Catálogo global" texto="Os 28 templates que vêm seedados são compartilhados entre todos os tenants. empresaId=null no banco. Quem cria via formulário também entra no catálogo global por padrão." />
          <DefRow termo="Categoria" texto="Fiscal, Trabalhista ou Contábil. Define a cor do badge na listagem e ajuda a agrupar visualmente." />
          <DefRow termo="Recorrência" texto="Regra de disparo automático: frequência (mensal/trimestral/anual...), ancoragem (dia do mês, n-ésimo dia útil ou dias após competência) e offset de competência." />
          <DefRow termo="Próximo vencimento" texto="Data calculada em runtime pelo RecorrenciaScheduler com base na regra. O semáforo vermelho aparece quando atrasado, âmbar quando faltam ≤7 dias." />
          <DefRow termo="Fonte oficial" texto="URL pública onde o vencimento/regra foi confirmado (site Receita, portal SEFAZ, lei no Planalto). Usado como prova de auditoria e facilita revisão anual." />
          <DefRow termo="Documentação" texto="URL pública do manual/FAQ/guia oficial. Vinculada para consulta rápida do operador (ex.: Perguntas frequentes do Simples Nacional)." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Como usar</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Filter} titulo="Filtrar o catálogo" rota="/obrigacoes">
        <p>
          A barra superior tem 4 filtros independentes:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Categoria</strong>: Fiscal · Trabalhista · Contábil</li>
          <li><strong>Frequência</strong>: Mensal · Trimestral · Semestral · Anual (e Diária/Semanal, raras)</li>
          <li><strong>Ativas/Inativas</strong>: por padrão mostra todas, mas dá pra ocultar as desativadas</li>
          <li><strong>Busca livre</strong>: procura no nome e na descrição (case-insensitive)</li>
        </ul>
        <Callout tipo="info">
          Cada filtro aplicado conta no contador ao lado do ícone <Filter className="inline h-3.5 w-3.5" />. Ao chegar em zero resultados, dá pra remover filtros um a um.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Calendar} titulo="Acompanhar vencimentos">
        <p>A coluna <strong>Próximo vencimento</strong> mostra a data calculada em runtime, com cor indicando urgência:</p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><span className="text-red-600 font-medium">Vermelho</span> — atrasada (data já passou)</li>
          <li><span className="text-amber-700 font-medium">Âmbar</span> — faltam 7 dias ou menos</li>
          <li><span className="text-muted-foreground">Cinza</span> — prazo confortável</li>
        </ul>
        <Callout tipo="info">
          O cálculo é determinístico — usa o mesmo motor que o cron diário de 06:00 (<code>RecorrenciaScheduler</code>). Se você ajusta a regra, a próxima data atualiza imediatamente ao recarregar a página.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={ExternalLink} titulo="Consultar fonte oficial e documentação">
        <p>Cada obrigação tem dois links opcionais:</p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Fonte oficial</strong> — onde o vencimento foi confirmado (ícone <ExternalLink className="inline h-3.5 w-3.5" /> direto na linha)</li>
          <li><strong>Documentação</strong> — manual, FAQ ou guia (acessível pelo menu <strong>⋮</strong>)</li>
        </ul>
        <Callout tipo="dica">
          <strong>Por que existem dois?</strong> A <em>fonte</em> serve pra auditoria (provar de onde tiramos a data) e a <em>documentação</em> serve pra operação (resolver dúvidas na hora). Em geral fonte é a lei/IN e documentação é o manual ou FAQ.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Plus} titulo="Cadastrar nova obrigação" rota="/obrigacoes/new">
        <p>O botão <strong>Nova obrigação</strong> abre um formulário enxuto:</p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Nome</strong> e <strong>categoria</strong> (Fiscal/Trabalhista/Contábil)</li>
          <li><strong>Descrição</strong> com base legal e particularidades</li>
          <li><strong>Fonte</strong> e <strong>Documentação</strong> (URLs opcionais)</li>
          <li><strong>Recorrência inicial</strong> — frequência + ancoragem + valor + offset</li>
        </ul>
        <Callout tipo="info">
          Após criar, você é redirecionado para <code>/servicos/[id]</code>, onde estão os ajustes finos: SLA por etapa, fluxo (DAG), regras de notificação, recorrência personalizada (dias específicos do mês, meses do ano), etc.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={PowerOff} titulo="Desativar e reativar">
        <p>
          O menu <strong>⋮</strong> de cada linha tem <strong>Desativar</strong> (ou <strong>Reativar</strong>). Obrigações desativadas:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li>Aparecem em cinza (opacity reduzida) na listagem</li>
          <li><strong>Não são</strong> mais executadas automaticamente pelo cron — o scheduler ignora <code>ativo=false</code></li>
          <li>São preservadas no histórico, mas saem da rotação até serem reativadas</li>
        </ul>
        <Callout tipo="aviso">
          Desativar é diferente de excluir. Como obrigações têm execuções vinculadas (histórico contábil), a opção de excluir não está exposta na UI — desativar é o caminho correto para "tirar de circulação".
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
          Obrigações acessórias são serviços recorrentes — têm SLA, etapas, passos, fluxo de execução, regras de notificação. Em vez de duplicar tudo isso numa tabela <code>Obrigacao</code> à parte, o módulo reusa <code>Servico</code> com a flag <code>ehObrigacaoAcessoria=true</code>.
        </p>
        <p className="text-sm">
          Resultado: <strong>todo o motor de execução, fluxograma e notificações que existe para Serviços vale automaticamente para Obrigações</strong> — sem código duplicado.
        </p>
      </Section>

      <h2 className="text-base font-bold pt-2">Dicas e armadilhas</h2>

      <Callout tipo="dica">
        <p className="font-semibold mb-1">🔍 Antes de criar uma obrigação nova, busque no catálogo</p>
        <p>As 28 já seedadas cobrem a maior parte do Brasil fiscal/trabalhista. Use a busca livre — pode ser que ela já exista com nome ligeiramente diferente.</p>
      </Callout>

      <Callout tipo="aviso">
        <p className="font-semibold mb-1">⚠️ Cliente sem contrato não recebe execução</p>
        <p>O scheduler só cria execução para clientes com contrato <strong>VIGENTE</strong> ou <strong>ASSINADO</strong> que tenha esse serviço vinculado em <code>ContratoServico</code>. Se uma obrigação parece "não disparar", verifique primeiro o contrato.</p>
      </Callout>

      <Callout tipo="info">
        <Info className="inline-block h-3.5 w-3.5 mr-1" />
        <strong>Fonte sempre que possível.</strong> Antes de salvar uma obrigação nova, busque a fonte oficial. Mesmo que pareça evidente (DAS = dia 20), em revisão futura o link na mão evita perda de tempo.
      </Callout>

      <Callout tipo="info">
        <strong>O semáforo é só visual.</strong> Vermelho/âmbar/cinza muda só a cor — não bloqueia nada. A criação automática da execução ainda acontece no horário do cron mesmo que a regra esteja "atrasada".
      </Callout>
    </ArticleShell>
  )
}
