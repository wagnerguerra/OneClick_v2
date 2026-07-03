-- ============================================================
-- Limpeza retroativa: cancela serviços/processos ainda ABERTOS cujo orçamento
-- foi ENCERRADO (cancelado). Corrige registros criados antes do cascade
-- automático no changeStatus. Idempotente (após a 1ª execução nada mais casa).
--
-- Execuções e processos já CONCLUÍDOS/CANCELADOS/PULADOS são preservados.
-- ============================================================

-- 1) Execuções de serviço abertas de orçamentos encerrados
UPDATE servico_execucoes se
   SET status = 'CANCELADO', concluido_em = NOW()
  FROM orcamentos o
 WHERE se.orcamento_id = o.id
   AND o.status::text = 'ENCERRADO'
   AND se.status IN ('EM_ANDAMENTO', 'AGUARDANDO_INICIO');

-- 2) Processos abertos dos mesmos orçamentos
UPDATE processos p
   SET status = 'CANCELADO'::"ProcessoStatus",
       cancelado_motivo = COALESCE(p.cancelado_motivo, 'Orçamento encerrado (limpeza retroativa)'),
       concluido_em = NOW()
  FROM orcamentos o
 WHERE p.orcamento_id = o.id
   AND o.status::text = 'ENCERRADO'
   AND p.status::text = 'EM_ANDAMENTO';
