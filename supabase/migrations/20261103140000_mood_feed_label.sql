-- Mood lines in the activity feed name the mood again.
--
-- 20261103120000_english_content.sql kept log_activity() logic identical and
-- only changed words, so its mood line became "shared today's mood" (the old
-- Indonesian line printed the stored key, e.g. "lagi merasa senang hari ini").
-- This migration maps the stored key to the English label the app shows in the
-- mood picker (src/lib/mood.ts MOODS) and backfills existing mood rows through
-- activities.ref_id → mood_checkins.id. Feed lines read "{actor} {summary}",
-- with the actor "You" or the partner's name, so the wording works for both:
-- "You checked in: Happy", "Kezia checked in: Missing you".

create or replace function public.mood_feed_summary(p_mood text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_mood
    when 'senang' then 'checked in: Happy'
    when 'semangat' then 'checked in: Fired up'
    when 'biasa' then 'checked in: Just okay'
    when 'capek' then 'checked in: Tired'
    when 'sedih' then 'checked in: Sad'
    when 'kesal' then 'checked in: Annoyed'
    when 'cemas' then 'checked in: Anxious'
    when 'kangen' then 'checked in: Missing you'
    else 'shared today''s mood'
  end
$$;

create or replace function public.log_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_title text;
begin
  case tg_table_name
    when 'moments' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.created_by, 'moment', new.id,
              format('added the moment "%s"', left(new.title, 60)), '/app/moments/' || new.id);
    when 'moment_comments' then
      select title into v_title from public.moments where id = new.moment_id;
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.profile_id, 'comment', new.moment_id,
              format('commented on the moment "%s"', left(coalesce(v_title, ''), 60)), '/app/moments/' || new.moment_id);
    when 'moment_reactions' then
      if tg_op = 'INSERT' then
        select title into v_title from public.moments where id = new.moment_id;
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.profile_id, 'reaction', new.moment_id,
                format('reacted %s to the moment "%s"', new.emoji, left(coalesce(v_title, ''), 60)), '/app/moments/' || new.moment_id);
      end if;
    when 'mood_checkins' then
      if tg_op = 'INSERT' or new.mood is distinct from old.mood then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.profile_id, 'mood', new.id,
                public.mood_feed_summary(new.mood), '/app/mood');
      end if;
    when 'bucket_items' then
      if tg_op = 'INSERT' then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.created_by, 'bucket_add', new.id,
                format('added "%s" to the bucket list', left(new.title, 60)), '/app/bucket-list');
      elsif new.is_done and not old.is_done then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, auth.uid(), 'bucket_done', new.id,
                format('checked off "%s" on the bucket list', left(new.title, 60)), '/app/bucket-list');
      end if;
    when 'gratitude_notes' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.from_id, 'gratitude', new.id,
              'left a note of thanks in the Toples', '/app/toples');
    when 'letters' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.sender_id, 'letter', new.id,
              'wrote a letter', '/app/letters');
    when 'couple_events' then
      if coalesce(new.event_scope, 'couple') <> 'personal' and new.created_by is not null then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.created_by, 'event', new.id,
                format('added "%s" to the calendar', left(new.title, 60)), '/app/calendar');
      end if;
    when 'couple_transactions' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.created_by, 'saving', new.id,
              case when new.amount >= 0
                then format('saved Rp %s', replace(to_char(new.amount, 'FM999,999,999,990'), ',', '.'))
                else format('took Rp %s out of savings', replace(to_char(abs(new.amount), 'FM999,999,999,990'), ',', '.'))
              end, '/app/finance');
    when 'daily_responses' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.profile_id, 'daily', new.id,
              'answered today''s question', '/app/home');
    else
      null;
  end case;
  return null;
end;
$function$;

-- Existing mood rows (Indonesian or the interim English line) get the named mood.
update public.activities a
set summary = public.mood_feed_summary(m.mood)
from public.mood_checkins m
where a.kind = 'mood' and a.ref_id = m.id
  and a.summary is distinct from public.mood_feed_summary(m.mood);
