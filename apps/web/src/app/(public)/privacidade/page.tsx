import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — OneClick ERP',
  description:
    'Política de Privacidade do aplicativo OneClick ERP (Central Soluções Empresariais).',
}

// Página PÚBLICA (sem autenticação) — usada como URL da Política de Privacidade
// exigida pela Google Play Store e alinhada à LGPD. Acessível em /privacidade.
const ATUALIZADO_EM = '20 de junho de 2026'
const EMAIL = 'ti@central-rnc.com.br'

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Aplicativo <strong>OneClick ERP</strong> · Atualizada em {ATUALIZADO_EM}
        </p>
      </header>

      <div className="space-y-6 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_a]:text-sky-600 dark:[&_a]:text-sky-400 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">
        <p>
          Esta Política de Privacidade descreve como o aplicativo <strong>OneClick ERP</strong>{' '}
          (&quot;aplicativo&quot;, &quot;nós&quot;), fornecido por <strong>Central Soluções
          Empresariais</strong>, trata as informações dos seus usuários. O OneClick ERP é um
          sistema corporativo de gestão (ERP/CRM) de uso restrito a colaboradores autorizados da
          empresa e de seus clientes contratantes — não é destinado ao público geral.
        </p>

        <h2>1. Quem somos (controlador)</h2>
        <p>
          O tratamento de dados é realizado por Central Soluções Empresariais, responsável pelo
          OneClick ERP. Para qualquer assunto relativo a privacidade ou à Lei Geral de Proteção de
          Dados (LGPD, Lei 13.709/2018), entre em contato pelo e-mail{' '}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </p>

        <h2>2. Dados que coletamos</h2>
        <p>O aplicativo coleta e processa apenas os dados necessários para o seu funcionamento:</p>
        <ul>
          <li>
            <strong>Dados de conta e identificação:</strong> nome, e-mail e, quando informados,
            telefone, cargo, foto de perfil e dados funcionais. Usados para autenticação e
            identificação do usuário.
          </li>
          <li>
            <strong>Credenciais de acesso:</strong> e-mail e senha (a senha é armazenada de forma
            criptografada) e tokens de sessão para manter você conectado com segurança.
          </li>
          <li>
            <strong>Dados de negócio inseridos no sistema:</strong> informações de gestão criadas
            pelos usuários (clientes, serviços, eventos de agenda, chamados, etc.). Esses dados
            pertencem à empresa contratante; o aplicativo apenas os armazena e exibe.
          </li>
          <li>
            <strong>Notificações push:</strong> um identificador (token) do dispositivo para envio
            de notificações, quando você autoriza.
          </li>
          <li>
            <strong>Dados técnicos e de diagnóstico:</strong> informações mínimas de funcionamento
            (versão do app, modelo do dispositivo, eventuais erros) para garantir estabilidade e
            segurança.
          </li>
        </ul>
        <p>
          O aplicativo <strong>não</strong> coleta sua localização precisa, não acessa contatos,
          fotos ou microfone para fins de marketing e <strong>não exibe anúncios</strong>.
        </p>

        <h2>3. Como usamos os dados</h2>
        <ul>
          <li>Autenticar o acesso e manter a sua sessão segura.</li>
          <li>Fornecer as funcionalidades do sistema (agenda, clientes, serviços, suporte, etc.).</li>
          <li>Enviar notificações operacionais que você autorizar.</li>
          <li>Garantir segurança, prevenir fraudes e corrigir falhas.</li>
        </ul>
        <p>Não vendemos seus dados e não os utilizamos para publicidade.</p>

        <h2>4. Compartilhamento</h2>
        <p>
          Os dados são processados na infraestrutura controlada pela Central Soluções Empresariais.
          Compartilhamos informações apenas com prestadores estritamente necessários à operação,
          tais como:
        </p>
        <ul>
          <li>
            Serviço de entrega de <strong>notificações push</strong> (Google Firebase Cloud
            Messaging / Expo), que recebe apenas o token do dispositivo e o conteúdo da notificação.
          </li>
          <li>
            Provedor de <strong>envio de e-mails</strong> transacionais, quando aplicável.
          </li>
        </ul>
        <p>
          Podemos divulgar dados quando exigido por lei ou ordem de autoridade competente.
        </p>

        <h2>5. Segurança</h2>
        <p>
          Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo comunicação
          criptografada (HTTPS/TLS), armazenamento de senhas com hash, controle de acesso por
          permissões e restrição por empresa. Nenhum sistema é 100% infalível, mas trabalhamos
          continuamente para mitigar riscos.
        </p>

        <h2>6. Retenção e exclusão</h2>
        <p>
          Mantemos os dados enquanto a conta estiver ativa e pelo período necessário para cumprir
          obrigações legais e contratuais. Você pode solicitar acesso, correção ou exclusão dos seus
          dados pessoais pelo e-mail <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. Contas e dados também
          podem ser removidos a pedido da empresa contratante responsável.
        </p>

        <h2>7. Seus direitos (LGPD)</h2>
        <p>
          Você pode, a qualquer momento, solicitar: confirmação da existência de tratamento; acesso
          aos dados; correção de dados incompletos ou desatualizados; anonimização, bloqueio ou
          eliminação de dados desnecessários; portabilidade; e informação sobre compartilhamento.
          Para exercer esses direitos, contate <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </p>

        <h2>8. Público infantil</h2>
        <p>
          O OneClick ERP é uma ferramenta corporativa destinada a maiores de 18 anos e não é
          direcionado a crianças. Não coletamos intencionalmente dados de menores.
        </p>

        <h2>9. Alterações desta política</h2>
        <p>
          Podemos atualizar esta política periodicamente. Mudanças relevantes serão publicadas nesta
          página, com a data de atualização revisada no topo.
        </p>

        <h2>10. Contato</h2>
        <p>
          Dúvidas ou solicitações sobre privacidade e proteção de dados:{' '}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </p>
      </div>

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-400 dark:border-slate-800">
        © {new Date().getFullYear()} Central Soluções Empresariais · OneClick ERP
      </footer>
    </main>
  )
}
