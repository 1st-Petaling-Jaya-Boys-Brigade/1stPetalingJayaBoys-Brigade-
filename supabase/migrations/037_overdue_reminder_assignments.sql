BEGIN;

CREATE FUNCTION public.rpc_overdue_reminder_assignments()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH config AS (
    SELECT (SELECT value::jsonb FROM public.bb_config WHERE key = 'bb_project_statuses') AS statuses,
      to_char(statement_timestamp() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') AS today
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'assignee_ic', task.data->>'assignee_ic',
    'assignee_email', task.data->>'assignee_email',
    'assignee_name', coalesce(nullif(task.data->>'assignee_name', ''), task.data->>'assignee')
  )), '[]'::jsonb)
  FROM public.bb_tasks t
  CROSS JOIN config
  CROSS JOIN LATERAL (SELECT to_jsonb(t) AS data, left(t.due_date::text, 10) AS due_day) task
  WHERE t.due_date IS NOT NULL
    AND task.due_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND pg_input_is_valid(task.due_day, 'date')
    AND task.due_day < config.today
    AND nullif(task.data->>'id', '') IS NOT NULL
    AND left(task.data->>'id', 5) <> 'temp_'
    AND NOT public.task_status_is_complete(task.data, config.statuses);
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_overdue_reminder_assignments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_overdue_reminder_assignments() TO service_role;

COMMIT;
