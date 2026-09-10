-- ============================================================================
-- Pedido de encerramento no cliente + tabela de gatilhos de fluxo.
--
-- `prisma db push` roda ANTES destes arquivos no deploy, então a tabela e as
-- colunas já vão existir quando isto rodar — os IF NOT EXISTS aqui são para a
-- instalação que aplicar o SQL sem o push (e para rodar duas vezes sem quebrar).
--
-- ATENÇÃO ao seed no fim: `id` e `updated_at` são preenchidos EXPLICITAMENTE.
-- `@default(cuid())` e `@updatedAt` são do Prisma, não do banco — a coluna
-- nasce sem default, e foi exatamente isso que derrubou um deploy em 04/09.
-- ============================================================================

-- ── Estado "encerramento solicitado" ────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS encerramento_solicitado_em  timestamp(3);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS encerramento_solicitado_por text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS encerramento_canal          text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS encerramento_motivo         text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS encerramento_previsto_para  timestamp(3);

-- ── Gatilhos de fluxo ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gatilhos_fluxo (
  id          text PRIMARY KEY,
  evento      text NOT NULL,
  condicao    jsonb,
  servico_id  text NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  confirmar   boolean NOT NULL DEFAULT true,
  ativo       boolean NOT NULL DEFAULT true,
  ordem       integer NOT NULL DEFAULT 0,
  observacao  text,
  empresa_id  text,
  created_at  timestamp(3) NOT NULL DEFAULT now(),
  updated_at  timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gatilhos_fluxo_evento_ativo_idx ON gatilhos_fluxo (evento, ativo);
CREATE INDEX IF NOT EXISTS gatilhos_fluxo_empresa_id_idx   ON gatilhos_fluxo (empresa_id);

-- ── Seed: o primeiro gatilho ────────────────────────────────────────────────
-- Liga o pedido de encerramento ao fluxo de offboarding que JÁ EXISTE e já está
-- encadeado (Offboarding → "Imediata ou em uma data?" → ... → Cliente inativado).
-- Uma linha por empresa que tenha o serviço, casando pelo nome — o id do serviço
-- é diferente em cada instalação.
--
-- `confirmar = true`: a execução nasce em AGUARDANDO_INICIO. Um pedido
-- registrado por engano abriria distrato, convocaria as áreas e falaria com o
-- cliente; alguém confirma antes de a cadeia andar.
INSERT INTO gatilhos_fluxo (id, evento, servico_id, confirmar, ativo, ordem, observacao, empresa_id, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  'encerramento_solicitado',
  s.id,
  true,
  true,
  0,
  'Abre o offboarding quando o comercial registra o pedido de encerramento. Nasce aguardando confirmação.',
  s.empresa_id,
  now(),
  now()
FROM servicos s
WHERE s.nome = 'Offboarding de Cliente'
  AND s.ativo = true
  AND NOT EXISTS (
    SELECT 1 FROM gatilhos_fluxo g
     WHERE g.evento = 'encerramento_solicitado'
       AND g.servico_id = s.id
  );
