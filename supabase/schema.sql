-- Schéma pro odesílání poznámek z telefonu do počítače přes Supabase.
--
-- Spustí se jednou, v Supabase: SQL Editor → New query → vložit → Run.
-- Je psané tak, aby se dalo pustit i podruhé, aniž by to spadlo.
--
-- Co to dělá: založí frontu odeslaných poznámek a úložiště na fotky. Telefon
-- do fronty zapisuje, počítač si z ní čte a označuje, co má staženo. Není to
-- kopie zápisníku - poznámky dál žijí v telefonu, tohle je jen průchoďák.

-- ---------------------------------------------------------------------------
-- Fronta poznámek
-- ---------------------------------------------------------------------------

create table if not exists public.notes_outbox (
  id uuid primary key default gen_random_uuid(),

  -- Kdo poznámku poslal. Vyplní se samo z přihlášení, takže to nejde
  -- podvrhnout z klienta - a RLS níž na tom stojí.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  title text not null default '',
  body text not null default '',
  tags text[] not null default '{}',

  -- Barva poznamky (prouzek v seznamu). Pridano pozdeji, viz ALTER nize.
  tone text not null default 'none',

  -- Cesty do storage bucketu, ne samotné bajty. Fotka v databázi by šla taky,
  -- ale řádek by nabobtnal na megabajty a čtení fronty by se vleklo.
  images text[] not null default '{}',

  -- Časy z poznámky v telefonu. Jsou jiné než `sent_at`: poznámka mohla vzniknout
  -- před týdnem a odejít až teď.
  note_created_at timestamptz,
  note_updated_at timestamptz,

  sent_at timestamptz not null default now(),

  -- Vyplní počítač, když si poznámku stáhne. Dokud je prázdné, čeká ve frontě.
  -- Řádek se schválně nemaže: kdyby se zápis na disk nepovedl, je se k čemu vrátit.
  pulled_at timestamptz
);

-- Počítač se ptá pořád dokola na totéž: "co je moje a ještě nestažené".
-- Bez indexu by to s přibývajícími poznámkami procházelo celou tabulku.
-- Idempotentni doplneni sloupce pro jiz existujici tabulky.
alter table public.notes_outbox add column if not exists tone text not null default 'none';

create index if not exists notes_outbox_pending_idx
  on public.notes_outbox (user_id, sent_at)
  where pulled_at is null;

alter table public.notes_outbox enable row level security;

-- Policy se nedají psát "create or replace", takže se starší verze zahodí.
-- Bez toho by druhé spuštění skriptu skončilo chybou.
drop policy if exists "vlastní poznámky - čtení" on public.notes_outbox;
drop policy if exists "vlastní poznámky - zápis" on public.notes_outbox;
drop policy if exists "vlastní poznámky - úprava" on public.notes_outbox;
drop policy if exists "vlastní poznámky - mazání" on public.notes_outbox;

-- Klíč, se kterým se appka hlásí, je veřejný - je zabalený v APK a přečte si ho
-- kdokoli. Jediné, co data drží u sebe, jsou tyhle policy: bez přihlášení se
-- nedostane nikam a přihlášený vidí jen své vlastní řádky.
create policy "vlastní poznámky - čtení" on public.notes_outbox
  for select to authenticated using (user_id = auth.uid());

create policy "vlastní poznámky - zápis" on public.notes_outbox
  for insert to authenticated with check (user_id = auth.uid());

create policy "vlastní poznámky - úprava" on public.notes_outbox
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "vlastní poznámky - mazání" on public.notes_outbox
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Úložiště fotek
-- ---------------------------------------------------------------------------

-- Neveřejný bucket: fotky z poznámek nemají viset na adrese, kterou lze uhodnout.
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', false)
on conflict (id) do nothing;

drop policy if exists "vlastní fotky - čtení" on storage.objects;
drop policy if exists "vlastní fotky - nahrání" on storage.objects;
drop policy if exists "vlastní fotky - mazání" on storage.objects;

-- Fotky leží v podsložce pojmenované po uživateli (`<uid>/soubor.jpg`), takže
-- se přístup dá omezit porovnáním první části cesty.
create policy "vlastní fotky - čtení" on storage.objects
  for select to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "vlastní fotky - nahrání" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "vlastní fotky - mazání" on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
