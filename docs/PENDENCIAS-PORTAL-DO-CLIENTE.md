# Pendências — Portal do Cliente

O que ficou de fora das fases entregues, e por quê. Atualizado em 11/09/2026.

---

## Fase 1 — porta-arquivos

### Mover arquivo entre pastas
**Onde:** `portal-arquivos.service.ts` (cliente) e `portal-escritorio.service.ts` (escritório).

Hoje a pasta de destino se define uma vez — na publicação, pelo escritório, ou no
envio, pelo cliente — e depois não muda. Arquivo no lugar errado só se resolve
apagando e reenviando.

É pequeno: um `update` de `pastaId` com a mesma validação de dono que
`abrirPasta` já faz. O trabalho está na tela, que precisa de seleção e de um
alvo (menu "Mover para…" ou arrastar).

### Renomear pasta
**Onde:** `portal-arquivos.service.ts`.

Criar e apagar existem; renomear não. Cuidado único: reaplicar a checagem de
nome duplicado lado a lado, senão o rename fura a regra que a criação respeita.

### Publicação em lote
**Onde:** `portal-documentos-card.tsx`.

Publicar é um arquivo por vez. Para as guias do mês inteiro isso vira dezenas de
cliques. A lista de arquivos internos já está na tela — falta seleção múltipla e
uma competência/pasta aplicada ao conjunto.

### Cota por cliente
**Onde:** `usuario-externo.guard.ts` libera `POST /api/upload` sem teto por cliente.

O limite hoje é **por arquivo** (do endpoint), não por cliente no total. Notas
fiscais em ZIP enchem bucket rápido. Precisa de: soma por cliente, teto
configurável, e a conversa comercial antes — cota é régua de plano, não só
técnica: decidir se o portal é cortesia do contrato ou item cobrado.

Depende da decisão de armazenamento (abaixo): a cota muda de forma se os
arquivos saírem da VPS.

### Lembrete de prazo das solicitações
**Onde:** não existe. Precisa de scheduler, como os de certidões.

A pendência atrasada aparece marcada na tela do cliente, mas ninguém avisa por
e-mail. Sem o lembrete, o pedido depende de o cliente entrar no portal por conta
própria — que é justamente o hábito que o portal quer criar, e ainda não existe.

---

## Fase 0 — resíduos

### `empresaId` do usuário externo
**Onde:** `cliente-usuario.service.ts`, na criação do usuário.

O usuário externo herda o `empresaId` do escritório. Foi isso que fez o chat
vazar o diretório interno (`/api/admin/online-users` escopa por empresa), e é o
mesmo mecanismo que qualquer outra consulta escopada por empresa usaria.

A `UsuarioExternoGuard` fecha a porta, mas a raiz continua lá. Avaliar deixar o
externo com `empresaId` nulo — mais seguro, e provavelmente quebra menos do que
parece, já que ele não usa nada interno.

### Filtro de categoria do porta-arquivos compara nome com ID
**Onde:** `portal-arquivos.service.ts`, `CATEGORIA_EXIGE_AREA` + `podeNaArea`.

`CATEGORIA_EXIGE_AREA` passa NOMES de área (`'pessoal'`, `'fiscal'`) para o
`podeNaArea`, que compara com `vinculo.areas` — e aquelas são **IDs**. A
comparação nunca casa, então toda categoria da lista fica permanentemente
bloqueada: arquivo com categoria `guias`, `folha`, `notas` ou `contabil` não
aparece para cliente nenhum.

Impacto hoje é zero — o portal lista só o Drive, e o acervo local saiu da
vista do cliente. Mas se ele voltar à tela, o escritório publica a guia e o
cliente não vê.

Conserto: mapear nome → `areaId` na carga, ou trocar as chaves de
`CATEGORIA_EXIGE_AREA` por ids. O módulo de Obrigações já faz o certo (compara
`servico.areaId` com `vinculo.areas`) e serve de referência.

### Inverter a guarda para lista de permissão
**Onde:** `usuario-externo.guard.ts`.

A guarda é lista de NEGAÇÃO com exceções, e cada exceção apareceu quando algo
quebrou: primeiro o tRPC (`/trpc`, não `/api/trpc`), depois a leitura de asset
(`/api/upload`), depois o envio. Três descobertas por falha.

Invertendo — o externo só acessa o que está explicitamente liberado — o
resultado de segurança é o mesmo, mas a falha fica previsível: rota nova nasce
bloqueada em vez de nascer aberta.

---

## Decisão em aberto — armazenamento

Ver `docs/ARMAZENAMENTO-PORTAL.md`.

Resumo: os arquivos do portal moram no volume Docker da VPS, e o backup diário
copia o volume inteiro com retenção de 7 — então **cada 1 GB de arquivo ocupa
~8 GB de disco**. Dos 61 GB usados hoje, ~29 GB são arquivos de cliente. A
proposta em avaliação é Google Drive como principal e disco local como fallback.

---

## Fases seguintes — não iniciadas

Escopo definido no plano; nada implementado.

| Fase | Conteúdo |
|---|---|
| 2 | Certidões, certificado digital (validade, **nunca** a senha nem o PFX), galeria de notas, calendário de obrigações |
| 3 | HelpDesk com escopo do cliente, contrato e honorários, balancete e DRE resumida |
| 4 | Pessoal (admissão, férias, rescisão, horas e faltas), simulador da reforma aberto ao cliente |
