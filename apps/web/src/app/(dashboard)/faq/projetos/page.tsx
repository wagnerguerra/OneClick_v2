'use client'

import {
  FolderKanban, Plus, ListChecks, LayoutGrid, List, MessageSquare, Paperclip,
  Info, Lightbulb, AlertTriangle, Flag, Calendar, Tag, Shield, ArrowRight,
  Move, Filter, Pencil, Trash2,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'
const FAQ_COLOR = '#22d3ee'

export default function FaqProjetosPage() {
  return (
    <ArticleShell
      modulo="Projetos"
      moduloColor={MODULO_COLOR}
      icon={FolderKanban}
      titulo="Projetos: gestão de desenvolvimento da TI"
      descricao="Como cadastrar projetos, acompanhar tarefas em lista ou Kanban, registrar andamentos e anexar arquivos."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Projeto" texto="Iniciativa de desenvolvimento agrupadora (ex: 'Módulo Fiscal v2', 'Integração SERPRO'). Tem nome, descrição, cor, status, datas e responsável." />
          <DefRow termo="Tarefa" texto="Unidade de trabalho dentro do projeto. Tem título, descrição, status, prioridade, prazo, estimativa (em pontos) e responsável." />
          <DefRow termo="Status (canônico, não-editável)" texto="Backlog → A Fazer → Em Andamento → Em Revisão → Concluído (Cancelado é o caminho lateral). Mesmo padrão usado por Linear/GitHub Projects." />
          <DefRow termo="Prioridade" texto="Urgente · Alta · Média · Baixa. Cada uma com cor própria (vermelho/laranja/azul/cinza) pra varrer o board visualmente." />
          <DefRow termo="Estimativa" texto="Pontos de esforço (1, 2, 3, 5, 8…). Opcional — útil pra planejamento de capacidade." />
          <DefRow termo="Atividade" texto="Timeline cronológica da tarefa. Inclui comentários humanos e mudanças automáticas (status, prioridade, prazo)." />
        </div>
        <Callout tipo="info">
          A primeira versão é deliberadamente <strong>simples</strong> (modelo Linear). Sem Epic/Story
          ou Sprint — adicionamos depois se a complexidade do time crescer.
        </Callout>
      </Section>

      <h2 className="text-base font-bold pt-2">Trabalhando com projetos</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Plus} titulo="Criar um projeto" rota="/projetos → Novo projeto">
        <p>Na tela inicial de Projetos:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Clique em <strong>Novo projeto</strong> (canto superior direito)</li>
          <li>Informe <strong>nome</strong> (obrigatório) e descrição</li>
          <li>Escolha uma <strong>cor</strong> — vai virar a borda lateral do card e o tema da página de detalhe</li>
          <li>Defina <strong>status</strong> (Ativo é o padrão) e uma <strong>data de previsão</strong> opcional</li>
          <li>Clique em <strong>Criar projeto</strong></li>
        </ul>
        <Callout tipo="dica">
          A cor escolhida fica visível no kanban, no header da página de detalhe e na lista de projetos.
          Use cores distintas pra projetos paralelos — facilita identificar rapidamente.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={FolderKanban} titulo="Filtrar e organizar" rota="/projetos">
        <p>A lista de projetos suporta:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Busca textual</strong> — pesquisa em nome e descrição</li>
          <li><strong>Filtro de status</strong> — Todos / Ativos / Concluídos / Arquivados</li>
          <li><strong>Grid de cards</strong> — clique no card pra abrir o detalhe</li>
          <li><strong>Menu ⋮</strong> em cada card — Editar, Arquivar ou Excluir</li>
        </ul>
      </Step>

      <h2 className="text-base font-bold pt-2">Gerenciando tarefas</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Plus} titulo="Criar uma tarefa" rota="/projetos/[id] → Nova tarefa">
        <p>Dentro do detalhe do projeto:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Clique em <strong>Nova tarefa</strong> no header</li>
          <li>Informe <strong>título</strong> (obrigatório) e descrição (markdown simples)</li>
          <li>Escolha status inicial (Backlog é o padrão) e prioridade</li>
          <li>Defina <strong>prazo</strong> e <strong>estimativa em pontos</strong> (opcional)</li>
          <li>Clique em <strong>Criar tarefa</strong></li>
        </ul>
        <Callout tipo="info">
          Você também pode <strong>anexar arquivos</strong> direto no momento da criação — vá pra aba
          <strong> Anexos</strong> dentro do modal, arraste ou cole arquivos, e eles serão salvos
          junto com a tarefa.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Pencil} titulo="Editar uma tarefa">
        <p>Para abrir o painel de edição de uma tarefa:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Na lista</strong>: clique em qualquer lugar da linha</li>
          <li><strong>No kanban</strong>: clique no card</li>
          <li>O modal abre com 3 abas: <strong>Detalhes</strong>, <strong>Atividade</strong> e <strong>Anexos</strong></li>
        </ul>
        <Callout tipo="dica">
          Mudanças em status, prioridade, prazo ou responsável geram <strong>eventos automáticos</strong>
          na timeline de Atividade — não precisa registrar manualmente.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Visualizações: Lista e Kanban</h2>

      <Step n={5} cor={MODULO_COLOR} icon={List} titulo="Modo Lista" rota="/projetos/[id]">
        <p>A visualização padrão é em <strong>tabela</strong>, com colunas:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Tarefa</strong> — título e snippet da descrição</li>
          <li><strong>Status</strong> — badge colorida (Backlog/A Fazer/Em Andamento/...)</li>
          <li><strong>Prioridade</strong> — bandeira colorida (Urgente vermelho, Alta laranja, ...)</li>
          <li><strong>Prazo</strong> — data formatada (DD/MM/YYYY)</li>
          <li><strong>Estimativa</strong> — pontos atribuídos</li>
          <li><strong>Ações</strong> — dropdown ⋮ com Editar/Excluir</li>
        </ul>
        <p className="mt-2">
          Acima da tabela, há <strong>5 pills de status clicáveis</strong> (Backlog, A Fazer, ...)
          que mostram a contagem por coluna. Clique em uma pill pra filtrar — clique de novo pra remover.
        </p>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={LayoutGrid} titulo="Modo Kanban">
        <p>Alterne pra Kanban clicando no ícone <strong>quadrado</strong> ao lado do filtro de busca.</p>
        <p className="mt-2">Como funciona:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>6 colunas fixas</strong> (Backlog, A Fazer, Em Andamento, Em Revisão, Concluído, Cancelado)</li>
          <li>Cada coluna mostra o total de tarefas e usa a cor do status</li>
          <li><strong>Arraste e solte</strong> cards entre colunas pra mudar o status</li>
          <li>Arraste <strong>dentro da mesma coluna</strong> pra reordenar</li>
          <li>A preferência (Lista ou Kanban) é salva no navegador — fica memorizada</li>
        </ul>
        <Callout tipo="info">
          Mover um card pra "Concluído" preenche automaticamente <strong>data de conclusão</strong>
          e grava um evento na timeline. Mover de volta pra outro status zera a data.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Atividade e anexos</h2>

      <Step n={7} cor={MODULO_COLOR} icon={MessageSquare} titulo="Registrar andamentos">
        <p>Abra a tarefa e vá pra aba <strong>Atividade</strong>:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Composer no topo</strong> (sticky): digite o andamento e clique em <strong>Registrar</strong></li>
          <li>Comentários aparecem na timeline com ícone destacado e fundo cinza</li>
          <li>Eventos automáticos (mudança de status, prioridade etc) aparecem inline com badges
            <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">antes → depois</code>
          </li>
          <li>Ordem cronológica decrescente (mais novo primeiro)</li>
        </ul>
      </Step>

      <Step n={8} cor={MODULO_COLOR} icon={Paperclip} titulo="Anexar arquivos">
        <p>Na aba <strong>Anexos</strong>:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Arraste e solte</strong> arquivos na dropzone</li>
          <li>Ou <strong>clique</strong> pra escolher do disco</li>
          <li>Ou <strong>cole</strong> com Ctrl+V (útil pra prints da tela)</li>
          <li>Upload acontece em background — você vê barra de progresso</li>
          <li>Após salvar a tarefa, os anexos persistem em S3 e ficam acessíveis pra <strong>download</strong></li>
        </ul>
        <Callout tipo="aviso">
          Limites: <strong>20 MB por arquivo</strong>, <strong>10 arquivos por upload</strong>.
          Extensões executáveis (<code>.exe</code>, <code>.bat</code>, <code>.msi</code>, etc) são
          bloqueadas por segurança.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Permissões e controle</h2>

      <Section icon={Shield} titulo="Quem pode fazer o quê" cor={FAQ_COLOR}>
        <p className="text-sm">
          O módulo Projetos faz parte do bloco <strong>TI</strong> nas permissões de usuário.
          O acesso é controlado em três níveis:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm mt-2">
          <li><strong>Ver (canRead)</strong> — listar projetos e tarefas</li>
          <li><strong>Editar (canWrite)</strong> — criar/editar/mover/arquivar projetos e tarefas</li>
          <li><strong>Excluir (canDelete)</strong> — apagar projetos e tarefas (irreversível)</li>
        </ul>
        <Callout tipo="dica">
          Atribua permissões em <strong>/usuarios/[id]/editar → aba Permissões → bloco TI → Projetos</strong>.
          Por padrão, usuários sem permissão veem a mensagem <em>"Sem permissão"</em> nos menus de ação.
        </Callout>
      </Section>

      <h2 className="text-base font-bold pt-2">Dicas e boas práticas</h2>

      <Section icon={Lightbulb} titulo="Tirando o máximo do módulo" cor={FAQ_COLOR}>
        <ul className="list-disc list-inside space-y-2 text-sm">
          <li>
            <strong>Comece pelo Backlog.</strong> Cadastre tudo que você lembra como "ideia" em Backlog.
            Depois mova pra "A Fazer" só o que está priorizado pra próxima semana.
          </li>
          <li>
            <strong>Use prioridades com critério.</strong> Se tudo é Urgente, nada é Urgente.
            Reserve Urgente pra incidentes em produção; Alta pra entregas com prazo curto;
            Média/Baixa pro resto.
          </li>
          <li>
            <strong>Em Revisão é seu code review.</strong> Antes de marcar como Concluído, passe
            por "Em Revisão" — disciplina simples pra evitar "concluído porém com bug".
          </li>
          <li>
            <strong>Estimativa é guia, não promessa.</strong> Use pontos relativos (1=trivial, 8=grande)
            só pra perceber se a tarefa vai estourar a semana, não pra cobrar precisão.
          </li>
          <li>
            <strong>Comentário curto, frequente.</strong> Anote bloqueios e decisões na timeline —
            daqui a 3 semanas você vai lembrar o porquê de ter mudado de abordagem.
          </li>
        </ul>
      </Section>

      <Section icon={AlertTriangle} titulo="O que ainda não tem (planejado)" cor={FAQ_COLOR}>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li><strong>Subtarefas</strong> — campo <code>parentId</code> já existe no modelo, falta só UI</li>
          <li><strong>Tags / etiquetas</strong> — backend pronto, falta UI pra criar e atribuir</li>
          <li><strong>Sprint/Cycle</strong> — agrupamento temporal (não previsto pra MVP)</li>
          <li><strong>Assignee múltiplo</strong> — hoje uma tarefa tem um responsável só</li>
          <li><strong>Dependências entre tarefas</strong> — tipo "bloqueia/é bloqueada por"</li>
          <li><strong>Relatórios e burndown</strong> — métricas por sprint/responsável</li>
        </ul>
        <Callout tipo="info">
          O módulo é deliberadamente enxuto. Cada adição passa pelo crivo: <strong>resolve uma dor real
          do time interno de TI?</strong> Se sim, entra no roadmap.
        </Callout>
      </Section>
    </ArticleShell>
  )
}
