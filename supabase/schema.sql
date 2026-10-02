-- Pregar: tabela única de sincronização. Cada linha é um item (pregação, ilustração, pedido de oração, plano de leitura, data própria).
-- NÃO aplicado ainda: será executado no projeto "pregar" quando ele existir.

create table if not exists public.items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('sermon', 'ilus', 'pray', 'plan', 'cdate')),
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at bigint      not null,                 -- carimbo do aparelho (ms): vale o mais novo
  server_ts  timestamptz not null default now(),   -- carimbo do servidor: usado para "o que mudou desde a última vez"
  primary key (user_id, kind, id),
  check (deleted or data is not null)
);

create index if not exists items_user_server_ts on public.items (user_id, server_ts, kind, id);

-- Cada pessoa só enxerga e altera as próprias linhas.
alter table public.items enable row level security;
revoke all on public.items from anon;

create policy "items: ler as proprias"      on public.items for select to authenticated using      ((select auth.uid()) = user_id);
create policy "items: criar as proprias"    on public.items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "items: alterar as proprias"  on public.items for update to authenticated using      ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "items: apagar as proprias"   on public.items for delete to authenticated using      ((select auth.uid()) = user_id);

-- "Vale o mais novo" também no servidor: uma gravação mais ANTIGA que a existente é ignorada; as demais carimbam server_ts.
create or replace function public.items_lww() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_ts := now();
  return new;
end;
$$;

drop trigger if exists items_lww on public.items;
create trigger items_lww before insert or update on public.items
  for each row execute function public.items_lww();
