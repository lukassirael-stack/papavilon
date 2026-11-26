-- Předpremiéra: vybraným týmům se první svíčka otevře hned (přepínač u týmu ve správě).
alter table public.omg_tymy add column if not exists predpremiera boolean not null default false;
comment on column public.omg_tymy.predpremiera is 'Předpremiéra: týmu je první svíčka otevřená hned, ostatní svíčky v obvyklý den.';
