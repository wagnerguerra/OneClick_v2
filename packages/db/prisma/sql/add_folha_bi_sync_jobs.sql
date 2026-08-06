-- Fila de sincronização da folha (tela → Service Manager).
--
-- A API roda na VPS e o SCI (Firebird) só existe na LAN do escritório. O pedido
-- feito na tela fica registrado aqui e o Service Manager, que roda dentro da LAN,
-- busca o que está PENDENTE, consulta o SCI e devolve pelo upload de sempre.
--
-- Idempotente: pode rodar em qualquer deploy sem efeito colateral.

CREATE TABLE IF NOT EXISTS folha_bi_sync_jobs (
  id                 TEXT PRIMARY KEY,
  empresa_id         TEXT,
  cliente_id         TEXT        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  id_sci             TEXT        NOT NULL,
  ref                INTEGER     NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'PENDENTE',
  solicitado_por_id  TEXT,
  iniciado_em        TIMESTAMP(3),
  concluido_em       TIMESTAMP(3),
  heartbeat_em       TIMESTAMP(3),
  total_linhas       INTEGER,
  erro               TEXT,
  log                TEXT,
  criado_em          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS folha_bi_sync_jobs_status_criado_em_idx
  ON folha_bi_sync_jobs (status, criado_em);
CREATE INDEX IF NOT EXISTS folha_bi_sync_jobs_cliente_id_ref_idx
  ON folha_bi_sync_jobs (cliente_id, ref);
