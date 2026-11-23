create or replace function public.task_status_is_complete(task jsonb, project_statuses jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with task_status as (
    select lower(trim(task->>'status')) as status,
      project_statuses->lower(trim(coalesce(
        nullif(trim(task->>'project_name'), ''),
        nullif(trim(task->>'project'), ''),
        substring(task->>'description' from '(?i)\[Project:\s*([^\]|]+)'),
        case lower(task->>'department')
          when 'department_nco' then 'department nco'
          when 'officer' then 'officers'
          else task->>'department'
        end
      ))) as configured
  ), project as (
    select status, regexp_replace(status, '[[:space:]_-]+', '', 'g') as compact_status,
      case when jsonb_typeof(configured) = 'array' then configured else '[]'::jsonb end as statuses
    from task_status
  )
  select coalesce((
    select keys.compact_label in ('complete', 'completed', 'done')
    from jsonb_array_elements(project.statuses) with ordinality as columns(entry, position)
    cross join lateral (
      select lower(trim(coalesce(nullif(entry->>'id', ''), entry->>'key'))) as id,
        lower(trim(entry->>'label')) as label,
        regexp_replace(lower(entry->>'label'), '[[:space:]_-]+', '', 'g') as compact_label
    ) keys
    cross join lateral (
      select case
        when keys.id = project.status then 1
        when keys.label = project.status then 2
        when project.compact_status in (
          regexp_replace(keys.id, '[[:space:]_-]+', '', 'g'), keys.compact_label
        ) then 3
        when project.compact_status in ('complete', 'completed', 'done')
          and keys.compact_label in ('complete', 'completed', 'done') then 4
      end as match_priority
    ) resolution
    where project.status <> '' and resolution.match_priority is not null
    order by resolution.match_priority, columns.position
    limit 1
  ), jsonb_array_length(project.statuses) = 0 and project.compact_status in ('complete', 'completed', 'done'), false)
  from project;
$$;
