'use client'

import {
  CircleUser, Search, Download, RefreshCw, Lock,
  Lightbulb, Info, ArrowRight, AlertTriangle, Server, FileSearch,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-fiscal, #0ea5e9)' // sky (Fiscal)
const FAQ_COLOR = '#0891b2'

export default function FaqSituacaoFiscalPage() {
  return (
    <ArticleShell
      modulo="Situação Fiscal"
      moduloColor={MODULO_COLOR}
      icon={CircleUser}
      titulo="Situação Fiscal SERPRO: consulta on-demand"
      descricao="Consultar Relatório de Situação Fiscal (Receita Federal/SERPRO) por cliente para identificar pendências."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Situação Fiscal" texto="Relatório oficial da Receita Federal com débitos, parcelamentos, ações fiscais e divergências do contribuinte." />
          <DefRow termo="API SERPRO" texto="Provedor oficial. Cada consulta consome créditos do contrato SERPRO (não é gratuito)." />
          <DefRow termo="Relatório PDF" texto="Documento gerado pela Receita, com status oficial. Validade do conteúdo: na hora da consulta." />
          <DefRow termo="Cache" texto="Sistema mantém última consulta por 24h para economizar créditos. Forçar nova exige clique explícito." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Operação</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Search} titulo="Consultar por cliente" rota="/situacao-fiscal">
        <p>Existem duas formas de iniciar uma consulta:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Selecionar cliente cadastrado</strong> — escolha em dropdown;
            CNPJ é preenchido automaticamente
          </li>
          <li>
            <strong>Informar CNPJ/CPF avulso</strong> — útil para consultas pontuais
            de prospects ou terceiros
          </li>
        </ul>
        <p>Clique em <strong>Consultar</strong>. O sistema:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Verifica o cache (se houver consulta nos últimos 24h, retorna sem consumir crédito)</li>
          <li>Caso contrário, dispara chamada à API SERPRO usando certificado + credenciais</li>
          <li>Resposta vem com status, débitos e link para PDF da Receita</li>
        </ul>
        <Callout tipo="info">
          Em cliente cadastrado, o resultado fica vinculado ao histórico do cliente —
          permite ver evolução ao longo do tempo.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={RefreshCw} titulo="Forçar nova consulta" rota="botão Consultar novamente">
        <p>
          Se a Receita atualizou (cliente acabou de quitar/parcelar), use{' '}
          <strong>&quot;Consultar novamente&quot;</strong> para ignorar cache.
        </p>
        <Callout tipo="aviso">
          Cada consulta forçada consome 1 crédito SERPRO. Em fechamentos mensais que
          consultam centenas de clientes, isso pode pesar — use cache sempre que possível.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={FileSearch} titulo="Interpretar o relatório">
        <p>O retorno típico contém seções:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Pendências fiscais</strong> — débitos em aberto na Receita ou PGFN
          </li>
          <li>
            <strong>Parcelamentos</strong> — débitos negociados, com situação (em dia / em atraso)
          </li>
          <li>
            <strong>Ações fiscais</strong> — autos de infração, fiscalizações em curso
          </li>
          <li>
            <strong>Divergências</strong> — declarações com inconsistências (ECF não bate com DCTFWeb, etc)
          </li>
          <li>
            <strong>CND</strong> — status das certidões automaticamente
          </li>
        </ul>
        <Callout tipo="dica">
          Esse relatório é mais detalhado do que apenas a CND — mostra <em>por quê</em>{' '}
          o cliente está positivo (qual débito específico). Usado para decidir parcelamento
          vs quitação.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Download} titulo="Baixar o PDF oficial" rota="botão na resposta">
        <p>
          O PDF gerado pela Receita pode ser baixado e arquivado. Útil em:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Auditoria interna (provar que o cliente foi consultado em data X)</li>
          <li>Apresentação ao cliente em reunião</li>
          <li>Anexo em processos administrativos / contestações</li>
        </ul>
        <Callout tipo="aviso">
          O PDF é <strong>cópia</strong> — para o documento oficial assinado digitalmente,
          baixe direto do e-CAC. Para uso interno, o do SERPRO é equivalente.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">SERPRO retorna &quot;Sem créditos&quot;</p>
            <p className="text-foreground/70">
              O contrato esgotou. Acesse o portal SERPRO, recarregue créditos. Em paralelo,
              audite chamadas no <code className="text-[11px]">/configuracoes/certificado</code>{' '}
              — Caixa Postal e DCTFWeb também consomem do mesmo pacote.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Consulta retorna 404 / cliente não encontrado</p>
            <p className="text-foreground/70">
              CNPJ pode estar com tipografia errada ou ainda não ativo na Receita
              (clientes recém-constituídos demoram alguns dias). Confirme no e-CAC se
              a inscrição já está liberada.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Mostra débito que cliente jura ter quitado</p>
            <p className="text-foreground/70">
              Pagamentos podem demorar 2-3 dias úteis para baixar no sistema da Receita.
              Aguarde 5 dias e <strong>force nova consulta</strong>. Se persistir, peça o
              comprovante ao cliente e abra processo no e-CAC.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Vou em licitação amanhã, preciso de evidência</p>
            <p className="text-foreground/70">
              A Situação Fiscal complementa as CNDs federais — junto, formam o pacote
              completo para habilitação. Baixe ambas pelo sistema e arquive com
              data/horário da consulta.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/situacao-fiscal" label="Consultar situação fiscal" cor={MODULO_COLOR} />
          <QuickLink href="/certidoes-cnd" label="CND Federais (complementar)" cor={MODULO_COLOR} />
          <QuickLink href="/caixapostal" label="Caixa Postal e-CAC" cor={MODULO_COLOR} />
          <QuickLink href="/configuracoes/certificado" label="Credenciais SERPRO" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
