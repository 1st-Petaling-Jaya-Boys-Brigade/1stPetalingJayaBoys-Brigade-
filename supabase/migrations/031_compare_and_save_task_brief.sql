-- Compare the edited field without placing rich text in a GET request or weakening task RLS.
create or replace function public.rpc_save_task_brief_field(
  p_task_id text,
  p_field text,
  p_expected text,
  p_value text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  task_id public.bb_tasks.id%type := p_task_id;
  saved public.bb_tasks%rowtype;
  metadata_field text;
begin
  if p_field is null or p_field not in ('title', 'description') then
    raise exception 'Unsupported task brief field' using errcode = '22023';
  end if;
  if p_field = 'title' then
    if coalesce(btrim(p_value), '') = '' then
      raise exception 'Task title is required' using errcode = '22023';
    end if;
    update public.bb_tasks set title = p_value
    where id = task_id and title is not distinct from p_expected returning * into saved;
  else
    select key into metadata_field from jsonb_object_keys(
      case when jsonb_typeof(p_metadata) = 'object' then p_metadata else '{}'::jsonb end
    ) as keys(key) where key in ('estimate', 'project_name') order by key limit 1;
    if exists (
      select 1 from pg_attribute
      where attrelid = 'public.bb_tasks'::regclass and attname = metadata_field and not attisdropped
    ) then
      execute format(
        'update public.bb_tasks set description = $1, %I = $2 where id = $3 and description is not distinct from $4 returning *',
        metadata_field
      ) into saved using p_value, p_metadata->>metadata_field, task_id, p_expected;
    else
      update public.bb_tasks set description = p_value
      where id = task_id and description is not distinct from p_expected returning * into saved;
    end if;
  end if;

  if saved.id is not null then
    return jsonb_build_object('saved', true, 'task', to_jsonb(saved));
  end if;
  select * into saved from public.bb_tasks where id = task_id;
  return jsonb_build_object('saved', false, 'task', case when found then to_jsonb(saved) end);
end;
$$;

revoke all on function public.rpc_save_task_brief_field(text, text, text, text, jsonb) from public;
grant execute on function public.rpc_save_task_brief_field(text, text, text, text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
