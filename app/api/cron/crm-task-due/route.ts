import { NextResponse } from 'next/server';
import { adminClient } from '../../../../lib/whatsapp-server';
import { executeCrmWorkflow } from '../../../../lib/crm-workflows';

export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || '';
  const auth = request.headers.get('authorization') || '';
  return Boolean(secret) && auth === 'Bearer ' + secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = adminClient();
  const now = new Date().toISOString();
  const { data: tasks, error: taskError } = await db.from('crm_tasks')
    .select('id,workspace_id,lead_id,title,due_at,status')
    .eq('status', 'open')
    .not('due_at', 'is', null)
    .lte('due_at', now)
    .order('due_at', { ascending: true })
    .limit(500);

  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });

  let inspected = 0;
  let triggered = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of tasks || []) {
    inspected += 1;
    if (!task.lead_id) { skipped += 1; continue; }

    const { data: lead, error: leadError } = await db.from('crm_leads')
      .select('*')
      .eq('id', task.lead_id)
      .eq('workspace_id', task.workspace_id)
      .maybeSingle();

    if (leadError || !lead) { skipped += 1; continue; }

    const { data: workflows, error: workflowError } = await db.from('crm_workflows')
      .select('*')
      .eq('workspace_id', task.workspace_id)
      .eq('active', true)
      .eq('trigger_type', 'task_due');

    if (workflowError) { failed += 1; continue; }

    for (const workflow of workflows || []) {
      // Insert the execution record before performing any actions. The partial
      // unique index on (workflow_id, entity_id) for crm_task rows makes this an
      // atomic claim, so parallel cron invocations cannot both send messages or
      // create duplicate follow-up tasks for the same task/workflow pair.
      const { data: claim, error: claimError } = await db.from('crm_workflow_runs').insert({
        workflow_id: workflow.id,
        workspace_id: task.workspace_id,
        entity_type: 'crm_task',
        entity_id: task.id,
        status: 'queued',
        result: {
          trigger: 'task_due',
          task_id: task.id,
          due_at: task.due_at,
          claim_status: 'claimed',
        },
      }).select('id').single();

      if (claimError || !claim) {
        if (claimError?.code === '23505') {
          // Another invocation already reserved or completed this pair.
          skipped += 1;
        } else {
          failed += 1;
        }
        continue;
      }

      const runStartedAt = new Date().toISOString();
      try {
        const result = await executeCrmWorkflow(db, workflow, task.workspace_id, lead);
        const { error: runError } = await db.from('crm_workflow_runs').update({
          status: result.status,
          result: {
            trigger: 'task_due',
            task_id: task.id,
            due_at: task.due_at,
            claim_status: 'completed',
            started_at: runStartedAt,
            actions: result.results,
          },
          completed_at: new Date().toISOString(),
        }).eq('id', claim.id).eq('workspace_id', task.workspace_id);

        if (runError) {
          // Keep the claim row in place even if finalization fails; do not replay
          // external actions merely because the history update could not be saved.
          failed += 1;
          continue;
        }
        if (result.status === 'failed') failed += 1;
        else triggered += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'CRM task-due workflow failed.';
        await db.from('crm_workflow_runs').update({
          status: 'failed',
          result: {
            trigger: 'task_due',
            task_id: task.id,
            due_at: task.due_at,
            claim_status: 'failed',
            started_at: runStartedAt,
            error: message,
          },
          completed_at: new Date().toISOString(),
        }).eq('id', claim.id).eq('workspace_id', task.workspace_id);
        failed += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed_at: now,
    inspected,
    triggered,
    skipped,
    failed,
  });
}
