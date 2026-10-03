-- Atualização ao vivo (Realtime) da tabela de sincronização. APLICADO em 2026-10-03 (migração pregar_realtime_items).
-- Cada usuário só recebe avisos das PRÓPRIAS linhas (as regras de acesso da tabela valem também para o Realtime).
alter publication supabase_realtime add table public.items;
