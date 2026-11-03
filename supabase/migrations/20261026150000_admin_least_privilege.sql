-- Admins keep only what the admin panel uses: profiles (users list), couples
-- and deep_talk_progress (dashboard counts), push_subscriptions (broadcast
-- stats) and Deep Talk content. Couples' private data — answers, letters,
-- money, calendar, pets, games, results — is readable by the couple only.

do $$
declare t text;
begin
  foreach t in array array[
    'ai_daily_questions', 'couple_events', 'couple_pets', 'couple_transactions',
    'daily_responses', 'game_sessions', 'letters', 'miss_you', 'pet_care_roles',
    'savings_entries', 'savings_goals', 'spending_results', 'wedding_budget_items',
    'wishlist_items'
  ] loop
    execute format('drop policy if exists %1$s_admin_select on public.%1$I', t);
  end loop;
end $$;

drop policy if exists assessment_results_select on public.assessment_results;
create policy assessment_results_select on public.assessment_results for select to authenticated
  using (profile_id = auth.uid() or public.is_couple_member(couple_id));

drop policy if exists mbti_results_select on public.mbti_results;
create policy mbti_results_select on public.mbti_results for select to authenticated
  using (profile_id = auth.uid() or public.is_couple_member(couple_id));

drop policy if exists couple_members_select on public.couple_members;
create policy couple_members_select on public.couple_members for select to authenticated
  using (profile_id = auth.uid() or public.is_couple_member(couple_id));
