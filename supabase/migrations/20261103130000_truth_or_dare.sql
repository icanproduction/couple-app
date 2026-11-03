-- Truth or Dare (leaf 1.2.1): the cards a couple writes themselves.
--
-- The built-in deck lives in src/components/games/truth-or-dare/deck.ts and a
-- game is played on one phone, so games and scores are never stored. This
-- table only holds custom cards, which mix into the deck with a "From {name}"
-- label. Members read and add cards in their own open couple and delete only
-- their own; outsiders get nothing. Checked by scripts/verify/game-truth-or-dare.mjs.

create table public.truth_or_dare_cards (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('truth', 'dare')),
  heat        text not null check (heat in ('sweet', 'playful', 'brave')),
  body        text not null check (char_length(body) between 1 and 200 and char_length(btrim(body)) >= 1),
  created_at  timestamptz not null default now()
);
create index truth_or_dare_cards_couple_idx on public.truth_or_dare_cards (couple_id, created_at);

-- True when the caller belongs to this couple and nobody has left it
-- (couples.closed_at, see 20261027140000_review_fixes.sql): a closed couple
-- keeps its archive readable but takes no new writes.
create or replace function public.truth_or_dare_in_open_couple(p_couple uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.couple_members m
    join public.couples c on c.id = m.couple_id
    where m.couple_id = p_couple and m.profile_id = auth.uid() and c.closed_at is null
  )
$$;
revoke execute on function public.truth_or_dare_in_open_couple(uuid) from public, anon;
grant execute on function public.truth_or_dare_in_open_couple(uuid) to authenticated, service_role;

-- At most 300 custom cards per couple, so loading the deck stays one small
-- query. The advisory lock makes two phones adding at once count correctly.
-- A caller outside the couple is left to RLS (which refuses the row), so the
-- count of someone else's couple is never revealed.
create or replace function public.truth_or_dare_cards_cap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_couple_member(new.couple_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('truth_or_dare_cards:' || new.couple_id::text, 0));
  if (select count(*) from public.truth_or_dare_cards where couple_id = new.couple_id) >= 300 then
    raise exception 'You already have 300 custom cards. Delete a few to add more.';
  end if;
  return new;
end;
$$;
revoke execute on function public.truth_or_dare_cards_cap() from public, anon, authenticated;

create trigger truth_or_dare_cards_cap
  before insert on public.truth_or_dare_cards
  for each row execute function public.truth_or_dare_cards_cap();

-- Least privilege: read, add (only these columns) and delete. No updates;
-- a card is deleted and written again instead.
revoke all on public.truth_or_dare_cards from anon, authenticated;
grant select, delete on public.truth_or_dare_cards to authenticated;
grant insert (couple_id, created_by, kind, heat, body) on public.truth_or_dare_cards to authenticated;
grant all on public.truth_or_dare_cards to service_role;

alter table public.truth_or_dare_cards enable row level security;

create policy truth_or_dare_cards_select on public.truth_or_dare_cards for select to authenticated
  using (public.is_couple_member(couple_id));
create policy truth_or_dare_cards_insert on public.truth_or_dare_cards for insert to authenticated
  with check (created_by = auth.uid() and public.truth_or_dare_in_open_couple(couple_id));
create policy truth_or_dare_cards_delete on public.truth_or_dare_cards for delete to authenticated
  using (created_by = auth.uid() and public.is_couple_member(couple_id));
