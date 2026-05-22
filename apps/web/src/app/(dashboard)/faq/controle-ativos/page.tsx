'use client'

import {
  Database, Info, Plus, ShieldCheck, Wrench, Paperclip, QrCode, Printer,
  ClipboardCheck, BarChart3, History, AlertTriangle, FileText, Coins,
  Lightbulb, Tag, UserCog,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-ti, #0ea5e9)' // sky — TI
const FAQ_COLOR = '#0369a1'

export default function FaqControleAtivosPage() {
  return (
    <ArticleShell
      modulo="Gestão de Ativos"
      moduloColor={MODULO_COLOR}
      icon={Database}
      titulo="Gestão de Ativos: cadastro, atribuição, manutenção e inventário"
      descricao="Como cadastrar ativos de TI/mobiliário, atribuir a colaboradores, registrar manutenções, gerar termo de responsabilidade e fazer inventário com QR code."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Ativo" texto="Item patrimonial cadastrado individualmente — um notebook, monitor, cadeira, licença de software, certificado em token, etc. Cada um tem tag única e histórico próprio." />
          <DefRow termo="Tag" texto="Etiqueta única do ativo (ex: AT-0001). Gerada automaticamente no cadastro e usada na impressão do QR Code da etiqueta física." />
          <DefRow termo="Tipo / Categoria" texto="Tipo agrupa por natureza (Hardware, Software, Rede, Mobiliário); Categoria detalha (Notebook, Monitor, Cadeira, Licença Office). A categoria define a vida útil contábil." />
          <DefRow termo="Status" texto="Em uso, Em manutenção, Em estoque, Emprestado, Descartado ou Perdido. Define como o ativo aparece em listagens e KPIs." />
          <DefRow termo="Responsável / Área / Cliente" texto="Atribuição atual do ativo: pode ir pra um colaborador (uso interno), pra uma área (compartilhado) ou ser emprestado a um cliente." />
          <DefRow termo="Depreciação linha reta" texto="Cálculo automático do valor depreciado: valor × (1 − meses de uso / vida útil da categoria). Aparece nos KPIs e na listagem." />
          <DefRow termo="TCO (Total Cost of Ownership)" texto="Custo total acumulado: valor de aquisição + soma de todas as manutenções (mão de obra + peças)." />
          <DefRow termo="Movimentação" texto="Log imutável de toda mudança relevante (transferência, status, empréstimo, manutenção, baixa). Aparece na aba Histórico do ativo." />
          <DefRow termo="Inventário" texto="Confirmação física periódica de que o ativo existe e está no local registrado. Recomendado a cada 6 meses." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Cadastro e gestão dos ativos</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Plus} titulo="Cadastrar um ativo novo" rota="/ativos → + Novo ativo">
        <p>
          O modal pede o mínimo necessário pra cadastrar rapidamente — depois você pode editar todos os
          detalhes (garantia, fornecedor, nota fiscal, observações) na página do ativo.
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Nome</strong> — descrição curta (ex: &quot;Notebook Dell Latitude — TI&quot;)</li>
          <li><strong>Tipo + Categoria</strong> — escolha primeiro o tipo (Hardware) e depois a categoria específica (Notebook)</li>
          <li><strong>Fabricante / Modelo / Nº de série</strong> — opcionais mas recomendados pra rastreabilidade</li>
          <li><strong>Valor de aquisição</strong> — base pra cálculo de depreciação</li>
        </ul>
        <Callout tipo="dica">
          A <strong>tag</strong> é gerada automaticamente no formato <code>AT-0001</code>, <code>AT-0002</code>...
          Você pode renomear na página do ativo se sua empresa já usa um padrão (TI-001, MOBILE-042, etc).
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Tag} titulo="Editar dados completos" rota="/ativos/[id]">
        <p>
          A página do ativo tem 6 abas:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Identificação</strong> — nome, tipo, categoria, fabricante, modelo, serial, patrimônio contábil, localização, descrição</li>
          <li><strong>Aquisição &amp; Garantia</strong> — fornecedor, NF, data de aquisição, valor, garantia início/fim</li>
          <li><strong>Atribuição</strong> — status atual e quem usa (responsável, área ou cliente em caso de empréstimo)</li>
          <li><strong>Manutenções</strong> — histórico de reparos, preventivas, upgrades + custos</li>
          <li><strong>Anexos</strong> — NF, contrato, fotos, manual</li>
          <li><strong>Tickets</strong> — chamados de Helpdesk vinculados ao ativo</li>
          <li><strong>Histórico</strong> — timeline imutável de todas as movimentações</li>
        </ul>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={UserCog} titulo="Atribuir responsável e movimentação automática">
        <p>
          Ao alterar <strong>responsável</strong>, <strong>área</strong>, <strong>cliente</strong> ou <strong>status</strong> na aba
          Atribuição e salvar, o sistema <strong>registra automaticamente</strong> uma entrada no histórico:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Mudança de responsável/área → <strong>TRANSFERÊNCIA</strong></li>
          <li>Cliente preenchido → <strong>EMPRÉSTIMO</strong> (status sugerido: EMPRESTADO)</li>
          <li>Cliente removido → <strong>DEVOLUÇÃO</strong></li>
          <li>Status mudou pra DESCARTADO/PERDIDO → <strong>BAIXA</strong></li>
          <li>Outras mudanças de status → <strong>STATUS_CHANGE</strong></li>
        </ul>
        <Callout tipo="dica">
          O log captura o estado <em>antes</em> e <em>depois</em> com quem fez a alteração, formando uma trilha de auditoria completa.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Manutenções e ciclo de vida</h2>

      <Step n={4} cor={MODULO_COLOR} icon={Wrench} titulo="Registrar manutenção" rota="/ativos/[id] → Manutenções">
        <p>Para cada manutenção, registre:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Tipo</strong>: Preventiva (revisão programada), Corretiva (algo quebrou) ou Upgrade (melhoria)</li>
          <li><strong>Descrição</strong> do serviço executado</li>
          <li><strong>Custos</strong>: mão de obra + peças (soma automaticamente no TCO)</li>
          <li><strong>Datas</strong>: início e conclusão</li>
          <li><strong>Próxima preventiva</strong>: data sugerida pra próxima revisão (futuro: vai pra agenda)</li>
          <li><strong>Fornecedor</strong>: terceiro que executou o serviço (mostra em /fornecedores → ativos atendidos)</li>
        </ul>
        <Callout tipo="dica">
          O <strong>TCO</strong> no topo do detalhe soma o valor de aquisição + todas as manutenções registradas.
          Útil pra decidir: vale a pena consertar de novo ou comprar novo?
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={ShieldCheck} titulo="Alertas de garantia">
        <p>
          Quando o ativo tem <strong>garantia fim</strong> preenchida, o sistema mostra alertas:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Badge âmbar &quot;Garantia vencendo&quot;</strong> — quando faltam menos de 30 dias</li>
          <li><strong>Badge vermelho &quot;Sem garantia&quot;</strong> — quando já passou da data</li>
          <li><strong>KPI no topo de /ativos</strong> — contador de ativos com garantia vencendo</li>
        </ul>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Coins} titulo="Depreciação linha reta">
        <p>
          O valor depreciado aparece automaticamente quando o ativo tem:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Valor de aquisição preenchido</li>
          <li>Data de aquisição preenchida</li>
          <li>Categoria com <code>depreciacaoMeses</code> definido (notebook=60m, mouse=24m, mobiliário=120m, etc.)</li>
        </ul>
        <p>
          Fórmula: <code>valor × (1 − meses_uso / vida_util)</code>. Após o fim da vida útil, valor depreciado vira R$ 0,00.
        </p>
      </Step>

      <h2 className="text-base font-bold pt-2">Documentos e auditoria</h2>

      <Step n={7} cor={MODULO_COLOR} icon={Paperclip} titulo="Anexos" rota="/ativos/[id] → Anexos">
        <p>
          Cada ativo aceita arquivos com tipos pré-classificados:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Nota Fiscal</strong> — comprovante de aquisição</li>
          <li><strong>Contrato</strong> — termo de garantia, contrato de manutenção</li>
          <li><strong>Foto</strong> — registro visual no recebimento e em manutenções</li>
          <li><strong>Manual</strong> — documentação técnica</li>
          <li><strong>Outro</strong> — qualquer outro documento</li>
        </ul>
        <p>Limite de <strong>20MB</strong> por arquivo. Aceita imagem, PDF, ZIP, DOC, XLS, etc.</p>
      </Step>

      <Step n={8} cor={MODULO_COLOR} icon={QrCode} titulo="Etiqueta com QR Code" rota="/ativos/[id] → Etiqueta">
        <p>
          Cada ativo pode ter uma <strong>etiqueta impressa</strong> com:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Tag e nome do ativo</li>
          <li>Fabricante/modelo</li>
          <li>QR Code que abre a página do ativo (escaneie com o celular)</li>
        </ul>
        <p>
          Pra imprimir várias etiquetas de uma vez: marque os ativos na lista e clique em <strong>&quot;Imprimir etiquetas&quot;</strong> — sai uma folha A4 com 12 etiquetas (grid 3×4).
        </p>
      </Step>

      <Step n={9} cor={MODULO_COLOR} icon={FileText} titulo="Termo de responsabilidade" rota="/ativos/[id] → Termo">
        <p>
          Ao entregar um ativo a um colaborador, gere o <strong>Termo de Responsabilidade</strong>:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Identificação completa do ativo (tag, NF, valor, garantia, serial)</li>
          <li>Identificação do responsável (nome, e-mail, área)</li>
          <li>Cláusulas legais de uso, devolução e responsabilização</li>
          <li>Campo de assinatura do colaborador e da empresa</li>
        </ul>
        <p>
          Imprima, colete a assinatura e <strong>faça upload do termo assinado</strong> em
          /ativos/[id] → Anexos (tipo &quot;Contrato&quot;).
        </p>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação e relatórios</h2>

      <Step n={10} cor={MODULO_COLOR} icon={ClipboardCheck} titulo="Inventário em massa" rota="/ativos">
        <p>
          Periodicamente (semestralmente é o padrão), confirme presencialmente os ativos:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Filtre na lista pelos ativos que quer inventariar (por área, responsável, etc.)</li>
          <li>Marque os checkboxes dos ativos confirmados (cabeçalho marca todos da página)</li>
          <li>Clique em <strong>&quot;Marcar inventariados&quot;</strong> — o sistema registra a data atual em todos</li>
        </ul>
        <Callout tipo="alerta">
          O KPI <strong>&quot;Sem inventário 6m&quot;</strong> conta ativos não inventariados nos últimos 6 meses — alvo
          das próximas auditorias.
        </Callout>
      </Step>

      <Step n={11} cor={MODULO_COLOR} icon={BarChart3} titulo="Dashboard e KPIs" rota="/ativos">
        <p>
          O topo da lista mostra 7 indicadores em tempo real:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Total</strong> — ativos ativos (não baixados)</li>
          <li><strong>Valor patrimonial</strong> — soma dos valores de aquisição</li>
          <li><strong>Em uso</strong> — status ATIVO</li>
          <li><strong>Em manutenção</strong> — status MANUTENCAO</li>
          <li><strong>Em estoque</strong> — disponíveis pra atribuir</li>
          <li><strong>Garantia ≤ 30d</strong> — alerta de garantia vencendo</li>
          <li><strong>Sem inventário 6m</strong> — atrasados na auditoria física</li>
        </ul>
      </Step>

      <Step n={12} cor={MODULO_COLOR} icon={History} titulo="Histórico imutável">
        <p>
          A aba <strong>Histórico</strong> mostra a timeline completa de movimentações do ativo,
          com diff antes/depois e quem fez cada alteração. <strong>Não é possível editar nem excluir</strong> entradas
          do histórico — é um registro de auditoria.
        </p>
      </Step>

      <h2 className="text-base font-bold pt-2">Integrações</h2>

      <Section icon={Lightbulb} titulo="Helpdesk e Colaboradores" cor={FAQ_COLOR}>
        <ul className="list-disc list-inside space-y-1 text-sm ml-2">
          <li>
            <strong>Tickets de Helpdesk</strong> podem ser <strong>vinculados a um ativo</strong> (campo opcional no ticket).
            No detalhe do ativo, a aba <strong>Tickets</strong> lista todos os chamados relacionados — ideal pra histórico de defeitos.
          </li>
          <li>
            No <strong>detalhe do Colaborador</strong>, é possível listar todos os ativos atribuídos (endpoint <code>listByResponsavel</code> disponível;
            a aba ainda será adicionada na UI do colaborador).
          </li>
        </ul>
      </Section>

      <Section icon={AlertTriangle} titulo="Boas práticas" cor={FAQ_COLOR}>
        <ul className="list-disc list-inside space-y-1.5 text-sm ml-2">
          <li>
            <strong>Etiquete fisicamente</strong> todo ativo logo após cadastrar — imprima o QR Code e cole no equipamento. Facilita inventário com celular.
          </li>
          <li>
            <strong>Preencha valor + data de aquisição</strong> em todos os ativos — sem esses dados, depreciação e KPI de valor patrimonial não funcionam.
          </li>
          <li>
            <strong>Use a categoria correta</strong>: ela define a vida útil contábil pra depreciação. Se faltar uma categoria, peça pro admin criar.
          </li>
          <li>
            Ao trocar de funcionário: <strong>edite o responsável</strong> no ativo. Não delete o registro antigo — o histórico mantém quem usou antes.
          </li>
          <li>
            <strong>Inventário semestral</strong>: separe meia hora por área e marque todos com o checkbox. É 100x mais rápido que conferir um por um.
          </li>
          <li>
            <strong>Registre toda manutenção</strong>, mesmo a interna sem custo — fica como prova de manutenção preventiva pra garantia.
          </li>
          <li>
            Ao <strong>baixar um ativo</strong>: troque o status pra DESCARTADO/PERDIDO antes de excluir. Assim o histórico fica completo.
          </li>
        </ul>
      </Section>
    </ArticleShell>
  )
}
