-- Mensagens de "plano aprovado" foram gravadas com background:#f8fafc fixo —
-- ilegível no dark mode. Substitui pelo estilo neutro (borda lateral violeta,
-- sem fundo) que herda cores do tema. Idempotente: só altera linhas que
-- ainda têm o estilo antigo.
UPDATE helpdesk_mensagens
SET conteudo = REPLACE(
  conteudo,
  'background:#f8fafc;padding:12px;border-radius:6px;border-left:3px solid #8b5cf6',
  'border-left:3px solid #8b5cf6;padding:6px 0 6px 12px;margin-top:6px'
)
WHERE conteudo LIKE '%background:#f8fafc;padding:12px;border-radius:6px;border-left:3px solid #8b5cf6%';
