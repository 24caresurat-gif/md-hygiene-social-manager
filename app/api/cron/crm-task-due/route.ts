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
      const { data: existing } = await db.from('crm_workflow_runs')
        .select('id')
        .eq('workflow_id', workflow.id)
        .eq('entity_type', 'crm_task')
        .eq('entity_id', task.id)
        .limit(1)
        .maybeSingle();

      if (existing) { skipped += 1; continue; }

      try {
        const result = await executeCrmWorkflow(db, workflow, task.workspace_id, lead);
        const { error: runError } = await db.from('crm_workflow_runs').insert({
          workflow_id: workflow.id,
          workspace_id: task.workspace_id,
          entity_type: 'crm_task',
          entity_id: task.id,
          status: result.status,
          result: {
            trigger: 'task_due',
            task_id: task.id,
            due_at: task.due_at,
            actions: result.results,
          },
          completed_at: new Date().toISOString(),
        });
        if (runError) { failed += 1; continue; }
        triggered += 1;
      } catch {
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
