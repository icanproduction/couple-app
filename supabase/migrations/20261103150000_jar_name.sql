-- "Toples" is now called "Jar" in the app (Eric, 2026-11-03). The feed line for
-- a new appreciation note follows: log_activity() changes only that string
-- (every other branch is identical to 20261103140000_mood_feed_label.sql), and
-- existing feed rows are renamed. The route /app/toples and the
-- gratitude_notes table keep their names.

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
              'left a note of thanks in the Jar', '/app/toples');
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

update public.activities
set summary = 'left a note of thanks in the Jar'
where kind = 'gratitude' and summary = 'left a note of thanks in the Toples';
