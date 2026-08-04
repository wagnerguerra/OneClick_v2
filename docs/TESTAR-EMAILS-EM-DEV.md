# Testar e-mails em desenvolvimento

Como conferir **se o e-mail certo dispara** na ação correspondente e **como ele
fica**, sem que nada saia para a internet.

## Interface

**http://localhost:8025**

Cada e-mail enviado pela aplicação aparece ali na hora: remetente, destinatários,
assunto, o HTML renderizado (aba *HTML*), o texto puro e o código-fonte cru.

## Por que precisou existir

O `EmailService` tenta **Resend** e, sem chave, cai no **SMTP**. Em dev não havia
nenhum dos dois: `RESEND_API_KEY` vazia no `.env`, nada em `system_config`, e
nenhum `SMTP_HOST`. Resultado — o serviço registrava
`[EmailService] Nenhum provider disponível` e **descartava a mensagem em
silêncio**. Não dava para saber nem se o e-mail certo era disparado, nem como
ficava.

Agora o dev aponta para o **Mailpit**, um servidor SMTP local que aceita tudo,
**não entrega nada** e mostra o resultado numa interface web. O caminho exercitado
é o mesmo de produção (`sendMail` → nodemailer → SMTP), então o que aparece ali é
exatamente o que sairia — inclusive o HTML do template.

## Como subir

O serviço está no `docker-compose.yml` junto do Postgres e do Redis:

```bash
docker compose up -d mailpit
```

Sobe com `restart: unless-stopped`, então volta sozinho com o Docker.

## Configuração (já aplicada em `apps/api/.env`)

```
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM="OneClick (dev) <dev@oneclick.local>"
```

⚠️ **Mudança no `.env` exige reiniciar a API** — ela lê as variáveis no boot, e o
watcher só observa `src/`.

## O que dá para verificar

| Pergunta | Onde |
|---|---|
| O e-mail certo disparou nesta ação? | Lista do Mailpit — assunto e destinatários |
| Foi para quem devia? | Campo *To* (o de chamado novo vai para **todos os agentes**) |
| Como está a aparência? | Aba **HTML** |
| O CTA está certo? | O botão muda por contexto: "Avaliar atendimento" (verde) em Aguardando avaliação, "Responder no chamado" em nova mensagem, "Assumir chamado" em ticket novo, "Retomar atendimento" (âmbar) quando o solicitante devolve |
| A mensagem aparece no corpo? | O bloco citado cinza dentro do e-mail |
| O rodapé está honesto? | Deve dizer que é automático e que **não se responde por e-mail** |

## Roteiro sugerido

1. Abra `http://localhost:8025` e deixe numa aba.
2. Crie um chamado → deve chegar **um e-mail para cada agente**, com "Assumir chamado".
3. Responda como agente → o solicitante recebe, **com o texto da mensagem** no corpo.
4. Mova para *Aguardando avaliação* → **um só** e-mail, com CTA verde de avaliar.
   (Se aparecerem dois, o genérico de status voltou — foi suprimido de propósito.)
5. Como solicitante, escreva no chamado em avaliação → o responsável recebe
   "Retomado pelo solicitante"; sem responsável, vai para todos os agentes.

## Segurança

Nada sai para a internet: o Mailpit não faz entrega. Só existe em dev — em
produção valem `RESEND_API_KEY` e o `SMTP_FROM` do `system_config`.

Para esvaziar a caixa, use *Delete all* na interface.
