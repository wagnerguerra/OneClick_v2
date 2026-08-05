-- Cancelamento e sinal de vida da sincronização do Acessórias.
--
-- Sem isso, uma sincronização iniciada só terminava sozinha: não havia como
-- pará-la, e uma que morresse junto com o processo (publicação, reinício)
-- ficava marcada como "rodando" para sempre, bloqueando a próxima.
--
-- Idempotente: pode rodar de novo sem efeito.

ALTER TABLE acessorias_sync_logs
  ADD COLUMN IF NOT EXISTS cancel_pedido_em TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS heartbeat_em     TIMESTAMP(3);
