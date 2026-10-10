-- Enforce a single task_due execution reservation per workflow/task pair.
-- The cron route inserts a queued run before executing any action, so concurrent
-- invocations cannot both perform the same workflow actions.
CREATE UNIQUE INDEX IF NOT EXISTS crm_workflow_runs_task_due_once_idx
  ON public.crm_workflow_runs (workflow_id, entity_id)
  WHERE entity_type = 'crm_task' AND entity_id IS NOT NULL;
