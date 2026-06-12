'use client'

import {
  CalendarDays, Info, Plus, Filter, MapPin, Layers, AlertTriangle, Settings,
} from 'lucide-react'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-configuracoes, #f97316)'
const FAQ_COLOR = 'var(--mod-faq, #0891b2)'

export default function FaqCalendarioFeriadosPage() {
  return (
    <ArticleShell
      modulo="Configurações"
      moduloColor={MODULO_COLOR}
      icon={CalendarDays}
      titulo="Calendário de feriados estaduais e municipais"
      descricao="A pill Calendário em /configuracoes mantém os feriados que não são nacionais — usado tanto pra consulta operacional quanto como base para o futuro ajuste automático de vencimento por UF/cidade."
    >
      <Section icon={Info} titulo="Conceitos" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Feriados nacionais" texto="Os 12 nacionais (9 fixos + Carnaval + Sexta Santa + Corpus Christi) NÃO entram no calendário. Vivem em apps/api/.../feriados-br.ts e são calculados em runtime — adicioná-los na tabela viraria duplicação." />
          <DefRow termo="Tipo NACIONAL" texto="Reservado para casos raros (ex.: lei nova ou tenant que precisa anular um nacional para uma região). Em geral, evite — use o util do código." />
          <DefRow termo="Tipo ESTADUAL" texto="Vale dentro de uma UF inteira. Exige preencher o campo UF." />
          <DefRow termo="Tipo MUNICIPAL" texto="Vale para um município específico. Exige UF + nome da cidade." />
          <DefRow termo="Ponto facultativo" texto="Não é feriado obrigatório — o expediente é opcional. Útil pra registrar datas como Colonização do Solo ES (23/05), que é ponto facultativo estadual mas feriado municipal em Vila Velha." />
          <DefRow termo="Recorrente" texto="Quando marcado, o feriado vale todo ano (data dia/mês importa, ano é referência). Desmarcado = só naquele ano específico (ex.: ponto facultativo de carnaval estendido)." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Como usar</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Settings} titulo="Abrir a pill Calendário" rota="/configuracoes → pill Calendário">
        <p>
          Em <strong>Configurações</strong>, abra a pill <strong>Calendário</strong> na sidebar esquerda. A pill mostra:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Stats no topo: total + contadores por tipo (Nacional, Estadual, Municipal, Ponto facultativo)</li>
          <li>Tabela com filtros (ano, tipo, UF, busca)</li>
          <li>Botão laranja <strong>Novo feriado</strong> à direita do título</li>
        </ul>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Filter} titulo="Filtrar a lista">
        <p>Quatro filtros independentes:</p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Ano</strong>: filtra apenas registros válidos no ano selecionado (recorrentes sempre passam; não-recorrentes só se a data bater)</li>
          <li><strong>Tipo</strong>: Nacional · Estadual · Municipal · Ponto facultativo</li>
          <li><strong>UF</strong>: dropdown das 27 UFs brasileiras</li>
          <li><strong>Busca</strong>: procura no nome, observação e nome da cidade (case-insensitive)</li>
        </ul>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Plus} titulo="Cadastrar novo feriado">
        <p>Clique em <strong>Novo feriado</strong> e preencha:</p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Nome</strong> — ex.: "São João Batista", "Aniversário da Cidade"</li>
          <li><strong>Tipo</strong> — categoriza o registro e habilita os campos UF/cidade conforme aplicável</li>
          <li><strong>Data</strong> — formato dd/mm/aaaa. Quando recorrente, o ano é só referência (próximas ocorrências serão calculadas a partir do dia/mês)</li>
          <li><strong>Repetir todo ano</strong> — marcado = anual; desmarcado = único naquela data</li>
          <li><strong>UF</strong> — obrigatório para Estadual e Municipal</li>
          <li><strong>Município</strong> — obrigatório só para Municipal</li>
          <li><strong>Observação</strong> — base legal, decreto ou nota interna (recomendado pra auditoria futura)</li>
        </ul>
        <Callout tipo="dica">
          Preencha sempre a observação com a lei municipal ou decreto que estabelece o feriado. Quando você ou um colega revisitar o registro daqui a 2 anos, o "porquê" estará explícito.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Layers} titulo="Exclusão em lote">
        <p>
          A tabela tem checkbox no cabeçalho (marca a página inteira) e por linha. Ao selecionar qualquer registro,
          aparece a <strong>barra âmbar</strong> com botões "Limpar" e "Excluir selecionados". A exclusão pede confirmação SweetAlert.
        </p>
      </Step>

      <h2 className="text-base font-bold pt-2">Feriados pré-cadastrados (ES e Grande Vitória)</h2>

      <Section icon={MapPin} titulo="Estaduais ES (1)" cor={FAQ_COLOR}>
        <div className="space-y-1.5 text-sm">
          <p><strong>23/05 — Colonização do Solo Espírito-Santense</strong> (Ponto facultativo estadual conforme Decreto Nº 124-S/2026)</p>
        </div>
      </Section>

      <Section icon={MapPin} titulo="Municipais Grande Vitória (7)" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm">
          <p><strong>Vitória</strong>: 08/09 — Nossa Senhora da Vitória</p>
          <p><strong>Vila Velha</strong>: 23/05 — Colonização do Solo (municipal)</p>
          <p><strong>Cariacica</strong>: 24/06 — São João Batista (Lei 317/1967)</p>
          <p><strong>Serra</strong>: 08/12 — Nossa Senhora da Conceição (Lei 228/1967)</p>
          <p><strong>Guarapari</strong>: 29/06 — São Pedro</p>
          <p><strong>Guarapari</strong>: 19/09 — Emancipação Política</p>
          <p><strong>Guarapari</strong>: 08/12 — Nossa Senhora da Conceição</p>
        </div>
        <Callout tipo="info">
          Vila Velha tem o "aniversário do município" no mesmo 23/05 da Colonização do Solo. Para a esfera estadual o dia é ponto facultativo; em Vila Velha é feriado pleno — por isso há dois registros diferentes no calendário.
        </Callout>
      </Section>

      <h2 className="text-base font-bold pt-2">Integrações</h2>

      <Section icon={AlertTriangle} titulo="Status atual: scheduler ainda não usa estes feriados" cor={FAQ_COLOR}>
        <p className="text-sm">
          A política <code>ajusteVencimento</code> (MANTER/ANTECIPAR/POSTERGAR) na aba <strong>Recorrência</strong> dos serviços
          <strong> hoje considera apenas feriados nacionais</strong> (do util <code>feriados-br.ts</code>). Feriados estaduais e municipais
          deste calendário <em>não</em> entram no cálculo automático ainda.
        </p>
        <Callout tipo="aviso">
          <strong>Fase 2 (futura)</strong>: para que feriados estaduais/municipais virem ajuste automático, vamos precisar associar UF/cidade
          a cada recorrência (ou gerar 1 execução por cliente já considerando a localização dele). A modelagem está pendente —
          a base já está pronta no banco e no helper backend.
        </Callout>
        <p className="text-sm">
          Por enquanto, o calendário cumpre dois papéis:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li>Consulta operacional — saber, manualmente, quando há feriado</li>
          <li>Catálogo de partida — quando a Fase 2 chegar, os dados já estarão prontos</li>
        </ul>
      </Section>

      <Callout tipo="info">
        <strong>Helper backend:</strong> existe <code>feriadoService.getFeriadosDoDia(date, opts)</code> que devolve todos os feriados aplicáveis a uma data específica
        considerando filtros opcionais de UF/cidade/empresa. Será reusado quando a Fase 2 chegar.
      </Callout>
    </ArticleShell>
  )
}
