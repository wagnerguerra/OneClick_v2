# Passo a passo — Publicar o OneClick ERP no Google Play Console

Guia campo a campo. Conta: **wagner.guerra@gmail.com**.
Tudo que precisa colar está em `store/playstore/listagem.md` e os arquivos em `store/playstore/`.

> ⚠️ ANTES DE COMEÇAR: faça o **deploy do web** para a página
> `https://app.oneclick.central-rnc.com.br/privacidade` ficar pública (a Play
> valida essa URL). Sem isso, a etapa de Política de Privacidade falha.

Arquivos que você vai usar:
- AAB: `scripts/mobile-dist/OneClick-ERP-1.2.18-19.aab`
- Ícone: `store/playstore/icon-512.png`
- Banner: `store/playstore/feature-graphic-1024x500.png`
- Screenshots: `store/playstore/screenshot-*.png` (5)
- Textos: `store/playstore/listagem.md`

---

## 1. Criar o app
Play Console → **Criar app**.
- Nome do app: **OneClick ERP**
- Idioma padrão: **Português (Brasil) – pt-BR**
- App ou jogo: **App**
- Gratuito ou pago: **Gratuito**
- Declarações: marque **Diretrizes do programa** e **Leis de exportação dos EUA**.
- **Criar app**.

---

## 2. Conteúdo do app (menu lateral → "Política" → "Conteúdo do app")
São os formulários obrigatórios. Faça todos:

### 2.1 Política de Privacidade
- URL: `https://app.oneclick.central-rnc.com.br/privacidade` → **Salvar**.

### 2.2 Acesso ao app (App access)
- Selecione: **Todas ou algumas funcionalidades são restritas**.
- Adicionar instruções → **Adicionar**:
  - Nome: `Login de demonstração`
  - Nome de usuário: `demo.play@central-rnc.com.br`
  - Senha: `OneClickDemo2026`
  - Outras instruções: *"Aplicativo corporativo (B2B). Faça login com as credenciais acima; o menu lateral (ícone ☰) dá acesso aos módulos. Conta de demonstração somente leitura."*
- **Salvar**.

### 2.3 Anúncios (Ads)
- **Não, meu app não contém anúncios** → Salvar.

### 2.4 Classificação de conteúdo (Content rating)
- Iniciar questionário. E-mail: `ti@central-rnc.com.br`.
- Categoria: **Utilitário, produtividade, comunicação ou outro**.
- Responda **Não** para violência, sexo, linguagem, drogas, jogos de azar, conteúdo assustador.
- Interação entre usuários / conteúdo gerado: pode marcar **Sim** (há chamados/suporte interno), mas NÃO é compartilhamento público nem troca de mídia.
- Compartilha localização: **Não**.
- **Salvar** → **Enviar**. (Classificação esperada: Livre / 3+.)

### 2.5 Público-alvo e conteúdo (Target audience)
- Faixas etárias: marque apenas **18 e mais**.
- App atrai crianças? **Não**.
- **Salvar**.

### 2.6 Segurança de dados (Data safety)
Comece o formulário:
- **Coleta/compartilhamento:** Sim, o app coleta dados.
- **Os dados são criptografados em trânsito:** Sim.
- **O usuário pode pedir exclusão dos dados:** Sim (via e-mail).
- Tipos de dados coletados (marque e configure cada um):
  - **Informações pessoais → Nome**: coletado, não compartilhado, finalidade *Funcionalidade do app + Gerenciamento de conta*. Obrigatório.
  - **Informações pessoais → E-mail**: idem.
  - **IDs do dispositivo ou outros (token de notificação)**: coletado, compartilhado com serviço de push (Google/Expo), finalidade *Funcionalidade do app*.
  - **Atividade no app / Registros de diagnóstico (logs de erro)**: coletado, não compartilhado, finalidade *Análises/Funcionalidade*.
- **Não** declarar localização, contatos, fotos, áudio, financeiro, saúde.
- **Salvar** e **Enviar**.

### 2.7 Demais seções (responder rápido)
- **App de notícias:** Não.
- **Apps governamentais:** Não.
- **Recursos financeiros:** Não.
- **Saúde:** Não.

---

## 3. Ficha da loja (menu → "Crescer" → "Presença na loja" → "Ficha principal da loja")
- **Nome do app:** OneClick ERP
- **Descrição breve (80):**
  `Gestão empresarial na palma da mão: agenda, clientes, serviços e suporte.`
- **Descrição completa:** colar o bloco "Descrição completa" da `listagem.md`.
- **Ícone do app:** enviar `icon-512.png`.
- **Gráfico de destaque:** enviar `feature-graphic-1024x500.png`.
- **Capturas de tela de smartphone:** enviar os 5 `screenshot-*.png` (mín. 2).
  *(Tablet 7"/10" são opcionais — pode deixar em branco.)*
- **Categoria do app:** **Empresarial** (ou "Produtividade").
- **Tags:** opcional (ex.: produtividade, ERP, gestão).
- **Detalhes de contato:** e-mail `ti@central-rnc.com.br`; site
  `https://app.oneclick.central-rnc.com.br`.
- **Salvar**.

### 3.1 Configurações da loja
- Categoria do app: **Empresarial**.
- Disponibilidade: **Brasil** (e outros países se quiser).

---

## 4. Criar a versão de TESTE INTERNO (recomendado começar aqui)
Menu → **"Testar e lançar" → "Teste → Teste interno"**.
1. Aba **Testadores** → **Criar lista de e-mails** → adicione os e-mails dos
   testadores (inclua o seu `wagner.guerra@gmail.com`) → Salvar e marque a lista.
2. Aba **Versões** → **Criar nova versão**.
3. **Assinatura de apps do Google Play**: aparecerá a oferta de ativar →
   **Continuar/Aceitar** (o Google passa a gerar a chave; o nosso AAB
   `CN=OneClick ERP` é aceito como **chave de upload**).
4. **App bundles** → **Fazer upload** → selecione
   `OneClick-ERP-1.2.18-19.aab`. Aguarde processar (versão 1.2.18, código 19).
5. **Nome da versão:** `1.2.18 (19)` (preenche sozinho).
6. **Notas da versão** (campo `pt-BR`):
   ```
   <pt-BR>
   - Módulos de Cadastros: Clientes (com abas/pills), Usuários e Serviços
   - Meus Serviços (operacional) com checklist de passos
   - Agenda, Tarefas e Helpdesk
   - Nova abertura com a marca e menu agrupado por blocos
   </pt-BR>
   ```
7. **Próxima** → revise → **Salvar e publicar** (no teste interno costuma ir ao ar
   em minutos, sem revisão demorada).

---

## 5. Liberar o acesso aos testadores
- Na aba **Testadores** do Teste interno, copie o **link de inscrição** ("Copy link").
- Envie o link a cada testador. Ele abre o link → **aceita** participar → baixa o
  app pela Play Store (atualização automática, **sem o aviso do Play Protect**).

---

## 6. (Depois) Promover para PRODUÇÃO
Quando quiser deixar público:
- **Testar e lançar → Produção → Criar nova versão** → pode **reusar a versão**
  do teste interno (Promover versão) → preencher o que faltar → **Enviar para
  revisão**. A revisão de Produção é mais rigorosa e pode levar de horas a alguns
  dias.

---

## Resumo da ordem
1) Deploy do web (privacidade) → 2) Criar app → 3) Conteúdo do app (todos os
formulários) → 4) Ficha da loja → 5) Teste interno (subir AAB + testadores) →
6) Publicar teste interno → 7) Enviar link aos testadores.
