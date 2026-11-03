-- Admin → AI: the owner pastes the OpenRouter API key in the app instead of
-- editing env vars. The key is stored in Supabase Vault (encrypted at rest).
-- Admins can set, replace or remove it and see only its last 4 characters;
-- only the server (service role) can read it back. A key set here wins over
-- the LLM_API_KEY env var, which stays as the fallback.

create table public.llm_settings (
  id           boolean primary key default true check (id),
  model        text check (model is null or model ~ '^[A-Za-z0-9._~:/-]{3,100}$'),
  key_last4    text,
  key_set_at   timestamptz,
  key_set_by   uuid references public.profiles(id) on delete set null,
  tested_at    timestamptz,
  test_ok      boolean,
  test_message text check (test_message is null or char_length(test_message) <= 300),
  updated_at   timestamptz not null default now()
);
insert into public.llm_settings (id) values (true) on conflict (id) do nothing;

alter table public.llm_settings enable row level security;
-- No policies: reads and writes go through the functions below only.
revoke all on public.llm_settings from anon, authenticated;
grant all on public.llm_settings to service_role;

create or replace function public.admin_llm_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.llm_settings;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa melihat pengaturan AI' using errcode = '42501';
  end if;
  select * into s from public.llm_settings where id;
  return jsonb_build_object(
    'key_set', exists (select 1 from vault.secrets where name = 'llm_api_key'),
    'key_last4', s.key_last4,
    'key_set_at', s.key_set_at,
    'model', s.model,
    'tested_at', s.tested_at,
    'test_ok', s.test_ok,
    'test_message', s.test_message
  );
end;
$$;

create or replace function public.admin_set_llm_key(p_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  -- Pasted keys often carry a trailing newline or tab, not just spaces.
  v_key text := btrim(coalesce(p_key, ''), E' \t\r\n');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah pengaturan AI' using errcode = '42501';
  end if;
  -- OpenRouter keys look like sk-or-v1-<hex>; accept any token-like string.
  -- (Length checked separately: Postgres regex repetition counts max out at 255.)
  if char_length(v_key) not between 20 and 300 or v_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'Format key tidak dikenali. Tempel key lengkap dari openrouter.ai/keys.';
  end if;

  select id into v_id from vault.secrets where name = 'llm_api_key';
  if v_id is null then
    perform vault.create_secret(v_key, 'llm_api_key', 'OpenRouter API key for the AI features');
  else
    perform vault.update_secret(v_id, v_key);
  end if;

  update public.llm_settings
  set key_last4 = right(v_key, 4), key_set_at = now(), key_set_by = auth.uid(),
      tested_at = null, test_ok = null, test_message = null, updated_at = now()
  where id;
  return public.admin_llm_status();
end;
$$;

create or replace function public.admin_clear_llm_key()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah pengaturan AI' using errcode = '42501';
  end if;
  delete from vault.secrets where name = 'llm_api_key';
  update public.llm_settings
  set key_last4 = null, key_set_at = null, key_set_by = auth.uid(),
      tested_at = null, test_ok = null, test_message = null, updated_at = now()
  where id;
  return public.admin_llm_status();
end;
$$;

-- Empty/null = the default model (openai/gpt-6-luna, or LLM_MODEL_SYNTHESIS).
create or replace function public.admin_set_llm_model(p_model text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_model text := nullif(btrim(coalesce(p_model, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah pengaturan AI' using errcode = '42501';
  end if;
  if v_model is not null and v_model !~ '^[A-Za-z0-9._~:/-]{3,100}$' then
    raise exception 'ID model tidak valid. Contoh: openai/gpt-6-luna';
  end if;
  update public.llm_settings
  set model = v_model, tested_at = null, test_ok = null, test_message = null, updated_at = now()
  where id;
  return public.admin_llm_status();
end;
$$;

-- Server only: the decrypted key and model the AI routes use.
create or replace function public.llm_runtime_config()
returns table (api_key text, model text)
language sql stable security definer set search_path = public as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'llm_api_key' limit 1),
    (select s.model from public.llm_settings s where s.id)
$$;

-- Server only: result of the "Tes koneksi" button.
create or replace function public.record_llm_test(p_ok boolean, p_message text)
returns void
language sql security definer set search_path = public as $$
  update public.llm_settings
  set tested_at = now(), test_ok = p_ok, test_message = left(p_message, 300)
  where id
$$;

revoke execute on function public.admin_llm_status(), public.admin_set_llm_key(text),
  public.admin_clear_llm_key(), public.admin_set_llm_model(text),
  public.llm_runtime_config(), public.record_llm_test(boolean, text) from public, anon;
grant execute on function public.admin_llm_status(), public.admin_set_llm_key(text),
  public.admin_clear_llm_key(), public.admin_set_llm_model(text) to authenticated;
revoke execute on function public.llm_runtime_config(), public.record_llm_test(boolean, text) from authenticated;
grant execute on function public.llm_runtime_config(), public.record_llm_test(boolean, text) to service_role;
