# Armazenamento dos arquivos do portal — avaliação

Proposta do Wagner (11/09/2026): usar a conta Google Drive `bkpcentralcontabil@gmail.com`
(Plus, 2 TB, paga) como armazenamento **principal** e o disco da VPS como **fallback**,
exibindo as pastas do cliente dentro do portal. A permissão de acesso passa a vir do
nosso cadastro de usuários, não de compartilhar a pasta com o Gmail do cliente.

Este documento registra o que foi medido, o que já existe pronto e a recomendação.

---

## 1. O que a VPS mostra hoje

Medido em 11/09/2026 na VPS de produção:

```
/dev/sda1        96G   61G   36G  63% /

/var/lib/docker/volumes/oneclick_oneclick_uploads/_data   4,2 G   ← os arquivos
/var/backups/oneclick-system                               25 G   ← 7 backups × 3,5 G
/var/lib/docker (imagens 15,8 G · volumes 5,4 G)           26 G
```

À primeira vista os uploads parecem irrelevantes: 4,2 GB em 61 GB. **Não são.**

`/opt/oneclick/scripts/backup-system.sh` copia o volume de uploads inteiro para dentro de
cada backup diário (passo "5) Volume Docker oneclick_uploads"), e a retenção é de 7
(`ls -1t ... | tail -n +8 | xargs rm -f`). Um backup tem 3,5 G comprimido; os uploads têm
4,2 G — ou seja, **o backup é essencialmente os uploads**. O resto (configs, nginx,
crontab, credenciais) é ruído de kilobytes.

Então a conta real é:

> **Cada 1 GB de arquivo de cliente ocupa ~8 GB de disco na VPS** — 1 ao vivo e 7 nos
> backups diários. PDF, XML e imagem já chegam comprimidos, então o `tar.gz` quase não
> reduz.

Recontando: dos 61 GB usados, cerca de **29 GB são os arquivos dos clientes** (4,2 ao
vivo + 25 de backup). Não é quase metade do disco por acaso — é o multiplicador.

**A projeção do Wagner está certa, e é pior do que parece.** Com o portal em uso, se os
uploads saírem de 4,2 GB para 12 GB — nada absurdo: é o que algumas dezenas de clientes
mandando notas e recebendo guias produzem em poucos meses — isso vira ~96 GB de demanda e
o disco de 96 GB acaba. Sem o portal, esse ponto levaria anos; com ele, meses.

---

## 2. O que já está pronto

A integração com o Drive **não é um projeto novo**. Ela já roda em produção:

- `apps/api/src/drive-sync/drive.client.ts` — autentica em dois modos (OAuth de usuário
  ou Service Account) e já implementa `uploadFile`, `getFolderInfo`, `listFilesInFolder` e
  download por stream.
- `docs/INTEGRACAO-GOOGLE-DRIVE.md` — o desenho e o passo a passo de credenciais.
- Na VPS, `GOOGLE_DRIVE_SYNC_ENABLED=true` e o `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` já está
  configurado. O backup do sistema inclusive já preserva `credentials.json` e
  `token.pickle`.

O modo OAuth de usuário é exatamente o caso do `bkpcentralcontabil@gmail.com`: o app age
**como aquela conta**, e portanto enxerga e grava nos 2 TB dela. Service Account não
serviria aqui — SA não tem cota própria no Drive do consumidor.

O que falta é **abstração**, não integração: hoje o upload grava direto em disco
(`DanfeStorage` e afins), sem uma camada que escolha o destino. É esse ponto que precisa
existir antes de qualquer coisa.

S3/Minio nunca foi implementado — existe só um comentário em `danfe.storage.ts`.

---

## 3. A parte da proposta que está certa, e é o ponto alto

> *"o cliente só chega à pasta se tiver permissão, dada por nós dentro do cadastro de
> usuários do cliente"*

Isso é uma melhoria de segurança em cima do processo de hoje, não só de conveniência. No
fluxo atual, compartilhar a pasta com o Gmail do cliente entrega uma permissão que:

- exige que o cliente tenha conta Google (e muitos usam e-mail corporativo que não é);
- **sobrevive ao fim do contrato**, porque revogar depende de alguém lembrar de entrar no
  Drive e remover — não está ligado ao cadastro;
- não deixa rastro nosso: não sabemos quem baixou o quê e quando;
- é repassável — o cliente pode compartilhar adiante sem que a gente veja.

Fazendo o download **passar pela nossa API** (o portal pede, a API confere o vínculo em
`resolverVinculo`, busca o stream no Drive e devolve), a pasta do Drive fica privada da
nossa conta e a permissão vira exatamente o que já construímos na Fase 0: vínculo ativo,
cliente ATIVO, área contratada. Desativou o usuário no cadastro, acabou o acesso no mesmo
segundo. E o recibo de leitura que já existe passa a valer para o Drive também.

Vale registrar a consequência: **o tráfego de download passa a atravessar a VPS**. Isso é
banda, não disco, e é o preço de a permissão ser nossa. Vale pagar.

---

## 4. Os riscos que precisam de decisão

### 4.1 Conta Gmail pessoal para documento fiscal de cliente — o ponto sério

`bkpcentralcontabil@gmail.com` é uma conta **Google One (consumidor)**, não Workspace.
Para backup interno isso nunca importou. Para guardar documento de cliente, importa:

- **Não há DPA.** O Google só oferece contrato de tratamento de dados (e os termos de
  processador que a LGPD pressupõe) em Workspace. Em conta pessoal, o titular do contrato
  é uma pessoa física, sob os Termos de Serviço do consumidor. Guardando folha de
  pagamento e nota fiscal de terceiros ali, o escritório assume sozinho um risco que em
  Workspace seria contratualmente repartido.
- **A conta é de uma pessoa, não da empresa.** Sem console de administração, não há como a
  empresa recuperar o acesso, auditar sessões, forçar MFA ou transferir a propriedade. Se
  a conta for perdida, suspensa ou o dono sair, não há caminho administrativo.
- **Suspensão é unilateral e sem SLA.** Conta de consumidor suspensa por suspeita
  automatizada não tem suporte com prazo. O fallback local cobre a *escrita*; não cobre o
  acervo já lá dentro.
- ~~**O refresh token é frágil.**~~ **Verificado em 11/09/2026 — não se aplica aqui.**
  A regra é real (app em "Testing" no Google Cloud Console tem refresh token de 7 dias),
  mas o nosso já está publicado. Prova: `/opt/oneclick/.env` — onde mora o
  `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` — não é editado desde **13/08** (29 dias), o
  `credentials.json` desde **22/05**, o log da API não tem uma única ocorrência de
  `invalid_grant` ou `unauthorized_client`, e o DriveSync varreu pastas do Drive com
  sucesso minutos antes desta verificação. Um token de 7 dias teria quebrado quatro
  vezes nesse intervalo.

**Recomendação original:** que a conta fosse **Workspace da empresa** (Business
Standard, 2 TB por usuário). O código não muda — é o mesmo OAuth. Muda o contrato, a
titularidade e a capacidade de administrar.

> **Decisão do Wagner, 11/09/2026:** começar com a conta atual mesmo, e migrar para o
> Workspace depois. Risco conhecido e aceito.

Duas consequências práticas dessa escolha, que valem virar regra de implementação:
1. **A conta não pode ficar chumbada em lugar nenhum.** Ela já vem de variável de
   ambiente (`GOOGLE_DRIVE_OAUTH_*`), e tem de continuar assim — nenhum `@gmail.com`
   escrito em código, nenhum ID de pasta fixo. Migrar então vira trocar credencial e
   mover pastas, não reescrever.
2. ~~O status do consent screen precisa ser verificado~~ — **verificado, está
   publicado** (seção 4.1). Não há prazo pendurado no token.

### 4.1-bis Sobre "fazer um cron para renovar o token"

A ideia apareceu como solução para o item acima. Não é necessária — e não funcionaria.

**Não é necessária** porque nada expira hoje (acima). **Não funcionaria** porque há dois
tokens diferentes e o cron não alcança nenhum dos dois:

| | Quem renova | Prazo |
|---|---|---|
| *Access token* | a própria biblioteca `googleapis`, a cada chamada | ~1 h |
| *Refresh token* | **uma pessoa**, na tela de consentimento do Google | não expira (app publicado) |

O access token já se renova sozinho — é o que o `DriveClient` faz em toda chamada, sem
cron nenhum. O refresh token, quando morre, só volta com alguém clicando "Permitir" numa
janela do Google: é o desenho do OAuth, e automatizar isso significaria roteirizar um
navegador com a senha da conta guardada em algum lugar — frágil e pior que o problema.

**O que vale automatizar é a vigilância, não a renovação.** `drive.client.ts` já tem
`resolveOAuthUserEmail()`, que faz uma chamada autenticada barata e devolve o e-mail da
conta. Um job diário chamando isso e alertando quando falhar transforma uma morte
silenciosa — em que o armazenamento principal cai e ninguém percebe até o cliente
reclamar — em um aviso. É pequeno, e é a versão útil da ideia.

### 4.2 Os 2 TB não estão vazios

O nome da conta é `bkp`. Antes de contar com os 2 TB, medir quanto já está ocupado pelo
uso atual (backup + pastas de clientes que já mandam arquivos por lá).

### 4.3 Cotas da API do Drive

O limite é por projeto e por usuário, e é generoso para o nosso volume — mas upload em
lote (uma competência inteira de guias de uma vez) pode encostar nele. A fila resolve:
enfileirar em vez de disparar N uploads paralelos. Já temos BullMQ.

### 4.4 O que "principal" faz com o backup

Se o Drive vira o principal e o arquivo **deixa** de existir na VPS, o volume de uploads
para de crescer — e os 25 GB de backup desinflam junto. Esse é o ganho real, e é grande.

Mas some também a cópia de 7 dias que temos hoje. A lixeira do Drive (30 dias) e o
histórico de versões cobrem exclusão acidental, e não são *nosso* backup. A decisão
consciente é: aceitar isso, ou manter um espelho periódico do Drive em outro lugar. Não
deixar acontecer por omissão.

---

## 5. Limpeza — executada em 11/09/2026

Duas das três providências já foram aplicadas na VPS. Resultado medido:

```
antes:  /dev/sda1  96G  61G usados  36G livres  63%
depois: /dev/sda1  96G  45G usados  51G livres  47%
```

**16 GB devolvidos**, sem reiniciar container: a API respondeu HTTP 200 logo depois, e
`oneclick-api`/`oneclick-web` seguiram com as mesmas 15h de uptime.

### 5.1 Retenção do backup de sistema: 7 → 3 ✅

`/opt/oneclick/scripts/backup-system.sh` teve a rotação trocada por uma variável
`RETENCAO=3`, com o motivo comentado no próprio script. Backup do original em
`backup-system.sh.bak-20260911`; `bash -n` passou.

Os 4 mais antigos foram removidos na hora (05, 06, 07 e 08/09), mantendo 09, 10 e 11 —
`/var/backups/oneclick-system` caiu de **25 G para 11 G**.

O número 3 é uma ponte, não um destino: assim que os arquivos saírem para o Drive, os
uploads deixam de entrar no backup e a retenção pode voltar a subir sem custo. Enquanto
isso, são 3 dias de histórico em vez de 7 — a contrapartida assumida.

> Nota: `/opt/oneclick/scripts/` **não é versionado neste repo**, vive só na VPS. O deploy
> não sobrescreve a alteração, e o próprio backup preserva a pasta em `configs/scripts`.

### 5.2 Imagens Docker ✅

`docker image prune` devolveu **0 B** — não havia imagem dangling. O espaço recuperável
que o `docker system df` apontava estava em imagens **com tag**: 18 builds do CI
(`ghcr.io/wagnerguerra/oneclick-{api,web}:<sha>`) acumuladas em ~2 dias, nenhuma em uso
por container.

`prune -a` resolveria, mas apaga tudo que não está rodando — inclusive a imagem de
rollback. Em vez disso foram removidos os 7 pares mais antigos por `docker rmi`,
preservando dois:

| Tag | Papel |
|---|---|
| `40cd2742…` | **no ar** — mesmo image ID de `oneclick-api:latest` / `oneclick-web:latest` |
| `6b674bae…` | rollback imediato |

Todas continuam no ghcr, então o que foi removido volta com um `pull`.

Vale observar que 18 imagens em 2 dias é a taxa normal de acúmulo do CI. Isso reaparece
sozinho — cabe uma limpeza periódica no mesmo cron, guardando as N últimas.

### 5.3 Mandar o backup para fora da VPS ⏳ pendente

Backup no mesmo disco do que ele protege não sobrevive ao cenário que justifica existir.
Destino decidido em 11/09: **a mesma conta Google**, que o Wagner já usa para backup da
rede. É o uso certo dela.

Antes de ligar, três coisas que a inspeção da VPS levantou.

**1. ~~O dump do banco não é criptografado.~~ ✅ Resolvido em 11/09/2026.**

`backup-db.sh` rodava `pg_dump -Fc` direto para `/var/backups/oneclick/*.dump` — 138 MB
por dia, 7 dias, sem `openssl` em lugar nenhum. Tolerável enquanto o arquivo nunca saía da
VPS; mandado para o Drive, seria o banco inteiro em claro — todos os clientes, todos os
usuários, os hashes de senha — dentro de uma conta Gmail pessoal.

O que mudou (original em `backup-db.sh.bak-20260911`):

- **O dump vai por pipe direto para o `openssl`**, com o mesmo AES-256 do
  `backup-system.sh` e a mesma passphrase. Não é "gerar e depois cifrar": o SQL em claro
  **nunca é gravado em disco**, nem por um instante. O `set -o pipefail` que já existia é
  o que garante que uma falha do `pg_dump` derrube o pipe, em vez de produzir um `.enc`
  bem-formado cifrando um dump truncado.
- **O backup é verificado antes de ser dado como bom.** Backup que não restaura é pior que
  backup nenhum, porque dá falsa confiança. A checagem decifra e roda
  `pg_restore -f /dev/null`, que lê o arquivo **inteiro**. Foi uma escolha deliberada
  sobre o `pg_restore -l`, que parece equivalente e não é: o `-l` lê só o TOC do começo do
  arquivo e daria OK num dump truncado pela metade (e, por sair cedo, ainda fecharia o
  pipe e faria o `openssl` levar SIGPIPE, virando falso negativo com `pipefail`). Custa
  ~3s em 133 MB. Falhou, o arquivo é removido e o script sai com erro.
- **A rotação passou a usar o glob `oneclick-*.dump*`.** Com `*.dump` ela nunca mais
  encontraria os `.dump.enc` e o diretório cresceria para sempre — o tipo de erro que só
  aparece semanas depois, quando o disco enche.
- **Os 8 dumps que já existiam em claro foram cifrados e os originais removidos**, com o
  `mtime` preservado (`touch -r`) para a rotação continuar contando os 7 dias pelas datas
  certas, e com cada `.enc` verificado antes de o `.dump` ser apagado. Não sobrou nenhum
  texto claro em `/var/backups`; os arquivos estão `-rw-------`.

Rodado de ponta a ponta: 20s (18s dump+cifra, 3s verificação). Conferido depois que o
arquivo mais antigo (04/09) decifra, abre e traz `clientes`, `users`, `helpdesk_tickets` e
`cliente_arquivos`. A passphrase errada é rejeitada com
`input file does not appear to be a valid archive`.

Restore está documentado no cabeçalho do próprio script:

```bash
openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 \
  -in oneclick-AAAAMMDD-HHMMSS.dump.enc \
  -pass file:/etc/oneclick/backup.passphrase \
  | docker exec -i n8n-postgres-1 pg_restore -U postgres -d oneclick --clean --if-exists
```

**2. A passphrase só existe na VPS.** `/etc/oneclick/backup.passphrase` (40 bytes, root,
600) não entra em backup nenhum — e está certo assim, guardar a chave dentro do cofre não
serviria de nada. Mas a consequência é que, se a VPS morrer, as cópias no Drive ficam
**indecifráveis** — ou seja, o backup externo falha exatamente no cenário que justifica
existir.

> Isso não é tarefa de código: alguém precisa copiar essa passphrase para um gerenciador
> de senhas ou um papel no cofre, **antes** de o backup externo valer alguma coisa.

**3. A ordem importa, por causa do tamanho.** O backup de sistema tem 3,5 GB/dia, e ~99%
disso são os uploads (seção 1). Subir isso todo dia é 105 GB/mês no Drive, para guardar
sete vezes o mesmo acervo. Mas depois da migração de armazenamento os arquivos já estarão
no Drive e sairão do backup — que encolhe para alguns MB.

Então o caminho barato é o inverso do óbvio:

| Quando | O quê | Estado |
|---|---|---|
| agora | cifrar o dump do banco | ✅ feito |
| agora | passphrase para fora da VPS | ⏳ **ação humana — só o Wagner** |
| agora | subir o dump cifrado (138 MB/dia) para o Drive | ⏳ pendente |
| depois da migração | backup de sistema, já reduzido a MB, para o Drive | ⏳ pendente |

### 5.4 Uma ressalva que ficou maior

`/opt/oneclick/scripts/` **não é versionado em repo nenhum** — vive só na VPS. Isso era
uma inconveniência quando os scripts eram simples; agora que eles carregam a criptografia
e a verificação do backup, é um ponto único de falha com o agravante de que o único lugar
onde eles estão salvos é... o backup que eles mesmos produzem. Vale trazer `backup-db.sh`
e `backup-system.sh` para o repo (sem segredo nenhum dentro, que os dois leem de arquivo)
e deixar a VPS com uma cópia.

---

## 6. Recomendação

**Fazer.** O desenho está certo: Drive como principal, disco como fallback, download
por proxy e permissão vinda do nosso cadastro. A integração já existe e já roda. A medição
confirma que o problema é real e chega antes do que parece.

Estado das duas condições que este documento levantou:

1. ~~Limpar disco antes de migrar~~ — **feito** em 11/09 (seção 5). Os 51 GB livres tiram
   a pressão de prazo: dá para fazer a migração com calma, e não é mais ela que segura o
   portal.
2. ~~Conta Workspace antes de guardar arquivo de cliente~~ — **adiado por decisão do
   Wagner** (seção 4.1). Segue com a conta atual; migra depois. O que isso cobra é
   disciplina na implementação: credencial e pasta sempre por configuração, e o consent
   screen verificado antes de o Drive virar caminho principal.

Ordem sugerida:

| Passo | O quê |
|---|---|
| 1 | Limpeza e retenção (seção 5) — libera disco e para de multiplicar por 8 |
| 2 | Camada de storage: uma interface, duas implementações (local, Drive) — o resto do sistema não sabe onde o arquivo está |
| 3 | Fila de reenvio (outbox): grava local, enfileira, sobe, marca. Falhou, tenta de novo. É o fallback |
| 4 | Download por proxy, com o vínculo conferido antes do stream |
| 5 | Migrar o acervo existente em lote, com o modo duplo ligado (escreve nos dois) até conferir |
| 6 | Pastas do Drive espelhadas na árvore que o portal já tem |

Um detalhe de desenho a decidir no passo 2: **quem é a fonte da verdade da árvore de
pastas.** Hoje `PortalPasta` é nossa e o cliente cria pastas nela. Se as pastas do Drive
aparecerem no portal, ou o Drive vira a fonte (e `PortalPasta` some), ou a nossa árvore
segue mandando e o Drive é só onde os bytes moram (pasta do Drive vira detalhe de
implementação). **A segunda é bem mais simples** e preserva tudo que a Fase 1 já entregou.
Vale decidir antes de escrever código, não durante.
