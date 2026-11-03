-- Server-only marker so the unlock notification for a letter is sent once.
-- Not granted to authenticated (letters uses column-level SELECT grants), so
-- only the service role (the cron route) reads or writes it.
alter table public.letters add column if not exists unlock_notified_at timestamptz;

create index if not exists letters_unlock_pending_idx
  on public.letters (unlock_date)
  where unlock_notified_at is null;
