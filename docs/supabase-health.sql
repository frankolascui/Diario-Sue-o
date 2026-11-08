-- Excelsior Health (Diario de Sueño) en el Supabase común de Excelsior (hvymuwscxxhsaymfkaup).
-- Misma cuenta que Excelsior RPG (auth.users). Cada usuario solo ve y toca sus filas (RLS).
-- Ejecutar una vez en SQL Editor. Después: Project Settings → Data API → Exposed schemas → añadir «health».

create schema if not exists health;

-- Una fila por noche (fecha = la mañana en que se registra). El registro completo va en «data»
-- para que la app pueda añadir campos sin tocar SQL. «deleted» marca una noche borrada
-- para que el borrado viaje a los otros dispositivos.
create table if not exists health.nights (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha      date not null,
  data       jsonb not null,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, fecha)
);

-- Ajustes del diario (hora de levantarse, horas en la cama, entrenos planeados...).
create table if not exists health.settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at lo pone siempre el servidor: la app pide «lo que cambió desde la última vez» con él.
create or replace function health.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists nights_touch on health.nights;
create trigger nights_touch before insert or update on health.nights
  for each row execute function health.touch_updated_at();
drop trigger if exists settings_touch on health.settings;
create trigger settings_touch before insert or update on health.settings
  for each row execute function health.touch_updated_at();
create index if not exists nights_user_updated on health.nights (user_id, updated_at);

alter table health.nights   enable row level security;
alter table health.settings enable row level security;

drop policy if exists "nights: solo el dueño" on health.nights;
create policy "nights: solo el dueño" on health.nights
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "settings: solo el dueño" on health.settings;
create policy "settings: solo el dueño" on health.settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permisos: solo usuarios con sesión; los invitados (anon) no ven nada.
grant usage on schema health to authenticated;
grant select, insert, update, delete on health.nights, health.settings to authenticated;
revoke all on schema health from anon;

-- Tope de tamaño por fila, para que un fallo del cliente no llene la base (plan gratis = 500 MB).
alter table health.nights   drop constraint if exists nights_data_size;
alter table health.nights   add  constraint nights_data_size   check (pg_column_size(data) < 16384);
alter table health.settings drop constraint if exists settings_data_size;
alter table health.settings add  constraint settings_data_size check (pg_column_size(data) < 8192);
