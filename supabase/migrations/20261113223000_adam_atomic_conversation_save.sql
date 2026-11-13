-- Atomic conversation writes with owner checks for both conversation and message IDs.
-- The function runs as SECURITY INVOKER: the server's service_role client has
-- the required table privileges and bypasses RLS. Public API roles cannot call it.
create or replace function public.adam_save_conversation(
  p_user_id text,
  p_conversation jsonb,
  p_messages jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_conversation_id text;
  v_created_at timestamptz;
  v_updated_at timestamptz;
  v_expected_count integer;
  v_unique_count integer;
  v_affected_count integer;
begin
  if p_user_id is null or pg_catalog.length(p_user_id) = 0 or pg_catalog.length(p_user_id) > 256 then
    raise exception using errcode = '22023', message = 'INVALID_USER_ID';
  end if;

  if p_conversation is null or pg_catalog.jsonb_typeof(p_conversation) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_CONVERSATION';
  end if;

  v_conversation_id := pg_catalog.btrim(p_conversation->>'id');
  if v_conversation_id is null or v_conversation_id = '' or pg_catalog.length(v_conversation_id) > 128 then
    raise exception using errcode = '22023', message = 'INVALID_CONVERSATION_ID';
  end if;

  if p_messages is null or pg_catalog.jsonb_typeof(p_messages) <> 'array'
     or pg_catalog.jsonb_array_length(p_messages) > 100 then
    raise exception using errcode = '22023', message = 'INVALID_CONVERSATION_MESSAGES';
  end if;

  select pg_catalog.count(*)::integer, pg_catalog.count(distinct m.id)::integer
    into v_expected_count, v_unique_count
  from pg_catalog.jsonb_to_recordset(p_messages) as m(id text);

  if v_expected_count <> v_unique_count then
    raise exception using errcode = '22023', message = 'DUPLICATE_MESSAGE_ID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_messages) as m(
      id text, role text, content text, created_at timestamptz
    )
    where m.id is null or m.id = '' or pg_catalog.length(m.id) > 128
       or m.role not in ('user', 'assistant', 'system')
       or m.content is null or pg_catalog.length(m.content) > 100000
       or m.created_at is null
  ) then
    raise exception using errcode = '22023', message = 'INVALID_MESSAGE_PAYLOAD';
  end if;

  -- Serialize writes for the same conversation. The per-ID advisory lock
  -- prevents two simultaneous first writes from racing ownership creation.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_conversation_id, 0)
  );

  if exists (
    select 1
    from public.adam_conversations c
    where c.id::text = v_conversation_id
      and c.user_id::text <> p_user_id
  ) then
    raise exception using errcode = '42501', message = 'CONVERSATION_OWNERSHIP_MISMATCH';
  end if;

  -- Message IDs are globally unique. An existing ID may only be updated
  -- when both its owner and parent conversation match the current request.
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_messages) as incoming(id text)
    join public.adam_messages existing on existing.id::text = incoming.id
    where existing.user_id::text <> p_user_id
       or existing.conversation_id::text <> v_conversation_id
  ) then
    raise exception using errcode = '42501', message = 'MESSAGE_OWNERSHIP_MISMATCH';
  end if;

  v_created_at := coalesce(nullif(p_conversation->>'created_at', '')::timestamptz, pg_catalog.now());
  v_updated_at := coalesce(nullif(p_conversation->>'updated_at', '')::timestamptz, pg_catalog.now());

  insert into public.adam_conversations as current_conversation
    (id, user_id, title, created_at, updated_at)
  values (
    v_conversation_id,
    p_user_id,
    pg_catalog.left(coalesce(nullif(p_conversation->>'title', ''), 'New conversation'), 120),
    v_created_at,
    v_updated_at
  )
  on conflict (id) do update
    set title = excluded.title,
        updated_at = excluded.updated_at
    where current_conversation.user_id::text = p_user_id;

  get diagnostics v_affected_count = row_count;
  if v_affected_count = 0 then
    raise exception using errcode = '42501', message = 'CONVERSATION_OWNERSHIP_MISMATCH';
  end if;

  if v_expected_count > 0 then
    insert into public.adam_messages as current_message
      (id, conversation_id, user_id, role, content, metadata, created_at)
    select
      m.id,
      v_conversation_id,
      p_user_id,
      m.role,
      m.content,
      coalesce(m.metadata, '{}'::jsonb),
      m.created_at
    from pg_catalog.jsonb_to_recordset(p_messages) as m(
      id text, role text, content text, metadata jsonb, created_at timestamptz
    )
    on conflict (id) do update
      set role = excluded.role,
          content = excluded.content,
          metadata = excluded.metadata,
          created_at = excluded.created_at
      where current_message.user_id::text = p_user_id
        and current_message.conversation_id::text = v_conversation_id;

    get diagnostics v_affected_count = row_count;
    if v_affected_count <> v_expected_count then
      raise exception using errcode = '42501', message = 'MESSAGE_OWNERSHIP_MISMATCH';
    end if;
  end if;
end;
$function$;

revoke all on function public.adam_save_conversation(text, jsonb, jsonb) from public;
revoke all on function public.adam_save_conversation(text, jsonb, jsonb) from anon, authenticated;
grant execute on function public.adam_save_conversation(text, jsonb, jsonb) to service_role;
