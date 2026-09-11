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
- **O refresh token é frágil.** Em app publicado o token dura, mas em app ainda em
  "Testing" no Google Cloud Console ele **expira em 7 dias**. Vale conferir o status do
  consent screen antes de depender disso no caminho principal.

**Recomendação:** se os arquivos de cliente forem para o Drive, que seja uma conta
**Workspace da empresa** (Business Standard, 2 TB por usuário). O código não muda — é o
mesmo OAuth. Muda o contrato, a titularidade e a capacidade de administrar. Para backup
interno, a conta atual segue ótima.

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

## 5. O que fazer antes, e que é barato

Independentemente da decisão sobre o Drive, três coisas destravam disco agora:

1. **Tirar os uploads do backup diário do sistema, ou reduzir a retenção.** É de longe o
   maior ganho: os uploads são 4,2 G e os backups deles são 25 G. Cair de 7 para 3 cópias
   libera ~14 GB hoje; separar uploads (semanal) de configs (diário) libera mais. Vale
   pensar junto: 7 cópias diárias de um acervo que quase não muda é caro e não protege
   muito mais que 3.
2. **`docker image prune`** — 1,6 GB recuperáveis, imediato e sem risco.
3. **Mandar o backup para fora da VPS.** Backup no mesmo disco do que ele protege não
   sobrevive ao cenário que justifica existir. Mandar para o Drive é uso legítimo da conta
   atual — é literalmente para isso que ela existe.

Só isso devolve algo em torno de 15–20 GB e compra meses de folga, com horas de trabalho
em vez de semanas.

---

## 6. Recomendação

**Fazer, com duas condições e em ordem.**

O desenho está certo: Drive como principal, disco como fallback, download por proxy e
permissão vinda do nosso cadastro. A integração já existe e já roda. A medição confirma
que o problema é real e chega antes do que parece.

As condições:

1. **Os itens da seção 5 primeiro.** São horas, não semanas, e resolvem a urgência. Fazer
   a migração sob pressão de disco é a pior hora para fazê-la.
2. **Conta Workspace da empresa para arquivo de cliente**, não a conta pessoal. A conta
   atual continua sendo a de backup interno. Mesmo código, contrato diferente.

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
