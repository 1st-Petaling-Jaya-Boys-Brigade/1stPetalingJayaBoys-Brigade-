alter table public.bb_tasks add column if not exists completed_at timestamptz;

create or replace function public.task_status_is_complete(task jsonb, project_statuses jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    lower(trim(task->>'status')) in ('complete', 'completed', 'done')
    or lower(trim(task->>'status')) in (
      lower(last_status->>'id'), lower(last_status->>'label')
    ), false)
  from (
    select (project_statuses->lower(trim(coalesce(
      nullif(trim(task->>'project_name'), ''),
      nullif(trim(task->>'project'), ''),
      substring(task->>'description' from '(?i)\[Project:\s*([^\]|]+)'),
      case lower(task->>'department')
        when 'department_nco' then 'department nco'
        when 'officer' then 'officers'
        else task->>'department'
      end
    ))))->-1 as last_status
  ) project;
$$;

create or replace function public.stamp_task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  project_statuses jsonb;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    new.completed_at := old.completed_at;
    return new;
  end if;

  begin
    select (to_jsonb(value) #>> '{}')::jsonb into project_statuses
    from public.bb_config where key = 'bb_project_statuses';
  exception when invalid_text_representation then
    project_statuses := null;
  end;

  if not public.task_status_is_complete(to_jsonb(new), project_statuses) then
    new.completed_at := null;
  elsif tg_op = 'UPDATE' and public.task_status_is_complete(to_jsonb(old), project_statuses) then
    new.completed_at := old.completed_at;
  else
    new.completed_at := statement_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_task_completion on public.bb_tasks;
create trigger stamp_task_completion
before insert or update on public.bb_tasks
for each row execute function public.stamp_task_completion();

-- Keep the day-by-day send ledger private to the reminder runner.
create table if not exists public.bb_task_reminder_deliveries (
  reminder_day date not null,
  recipient_key text not null,
  claimed_at timestamptz not null default now(),
  primary key (reminder_day, recipient_key)
);

alter table public.bb_task_reminder_deliveries enable row level security;
revoke all on public.bb_task_reminder_deliveries from public, anon, authenticated;
grant select, insert, delete on public.bb_task_reminder_deliveries to service_role;

notify pgrst, 'reload schema';
