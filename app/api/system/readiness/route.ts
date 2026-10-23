import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../lib/workspace-auth';

type ReadinessStatus = 'ready' | 'blocked' | 'manual';
type Check = { id: string; label: string; status: ReadinessStatus; missing: string[]; detail: string };
type FlowStatus = 'needs_data' | 'needs_test' | 'needs_connection' | 'check_needed';
type Flow = { id: string; label: string; status: FlowStatus; count: number | null; detail: string };

function configCheck(id: string, label: string, required: string[], detail: string, configured: Record<string, boolean>): Check {
  const missing = required.filter((name) => !configured[name]);
  return { id, label, status: missing.length ? 'blocked' : 'ready', missing, detail };
}

async function countForWorkspace(db: ReturnType<typeof adminDb>, table: string, workspaceId: string): Promise<number | null> {
  try {
    const { count, error } = await db.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    if (error) return null;
    return Number(count || 0);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const workspaceId = String(new URL(request.url).searchParams.get('workspaceId') || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    const privileged = Boolean(access && (access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase())));
    if (!access?.hasAccess || !privileged) {
      return NextResponse.json({ error: 'Only a Workspace Owner or Admin can view system readiness.' }, { status: 403 });
    }

    // Only return booleans about whether a variable exists. Secret values are never returned.
    const configured: Record<string, boolean> = {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
      META_APP_SECRET: Boolean(process.env.META_APP_SECRET),
      META_APP_ID: Boolean(process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || '1578165993688458'),
      INSTAGRAM_APP_SECRET: Boolean(process.env.INSTAGRAM_APP_SECRET),
      GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
      GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: Boolean(process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID),
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
    };

    const checks: Check[] = [
      configCheck('supabase', 'Supabase backend', ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'], 'Required browser/server database configuration is present. Secret values are never returned.', configured),
      configCheck('ai', 'AI caption and image tools', ['OPENAI_API_KEY'], 'Required for AI generate/edit endpoints. Add it to Vercel Production and redeploy.', configured),
      configCheck('facebook', 'Facebook OAuth', ['META_APP_SECRET'], 'App ID has a built-in fallback. Meta App Review, scopes and a real Page connection still need validation.', configured),
      configCheck('instagram', 'Instagram OAuth', ['INSTAGRAM_APP_SECRET'], 'Real Instagram Business account connection and publish tests remain required.', configured),
      configCheck('google', 'Google Business OAuth', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], 'Required before Google location/review import can run.', configured),
      configCheck('whatsapp', 'WhatsApp Embedded Signup / webhook', ['META_APP_SECRET', 'NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN'], 'Presence is checked only; business onboarding, signed webhook and send/receive tests remain required.', configured),
      configCheck('scheduler', 'Scheduled publishing and CRM tasks', ['CRON_SECRET'], 'Scheduler secret is present if shown configured. Queue a controlled post/task to validate real worker results.', configured),
      { id: 'leaked-password-protection', label: 'Leaked Password Protection', status: 'manual', missing: [], detail: 'Enable manually in Supabase Dashboard → Authentication → Password Security. This cannot be enabled via a Vercel environment variable.' },
    ];

    const [products, orders, cards, tasks, workflows, whatsAppConnections, googleProfiles] = await Promise.all([
      countForWorkspace(db, 'catalog_products', workspaceId),
      countForWorkspace(db, 'catalog_orders', workspaceId),
      countForWorkspace(db, 'digital_cards', workspaceId),
      countForWorkspace(db, 'crm_tasks', workspaceId),
      countForWorkspace(db, 'crm_workflows', workspaceId),
      countForWorkspace(db, 'whatsapp_connections', workspaceId),
      countForWorkspace(db, 'google_business_profiles', workspaceId),
    ]);

    const flows: Flow[] = [
      {
        id: 'catalogue',
        label: 'Catalogue checkout → CRM',
        status: products === null || orders === null ? 'check_needed' : products === 0 ? 'needs_data' : 'needs_test',
        count: products,
        detail: products === 0 ? 'Add a real catalogue product, then test public cart, coupon, checkout and CRM order linking.' : 'Run one controlled storefront order and verify the order and CRM contact/lead/follow-up.',
      },
      {
        id: 'digital-card',
        label: 'Digital Card → CRM',
        status: cards === null ? 'check_needed' : cards === 0 ? 'needs_data' : 'needs_test',
        count: cards,
        detail: cards === 0 ? 'Publish a real business card, then submit its public lead/contact forms to verify CRM linking.' : 'Submit each public form once and verify Contacts, Leads and Follow-ups.',
      },
      {
        id: 'crm',
        label: 'CRM task and workflow automation',
        status: tasks === null || workflows === null ? 'check_needed' : tasks + workflows === 0 ? 'needs_data' : 'needs_test',
        count: tasks === null || workflows === null ? null : tasks + workflows,
        detail: tasks === 0 && workflows === 0 ? 'Create a controlled task/workflow before testing due-task execution and duplicate-claim protection.' : 'Test task completion, workflow actions, execution history and duplicate-claim protection.',
      },
      {
        id: 'whatsapp-live',
        label: 'WhatsApp conversations and bot',
        status: whatsAppConnections === null ? 'check_needed' : whatsAppConnections === 0 ? 'needs_connection' : 'needs_test',
        count: whatsAppConnections,
        detail: whatsAppConnections === 0 ? 'Connect the real WhatsApp Business account from Settings after the provider phase is opened.' : 'Test inbound webhook, template send, reply window, bot and CRM sync.',
      },
      {
        id: 'google-live',
        label: 'Google Business locations and reviews',
        status: googleProfiles === null ? 'check_needed' : googleProfiles === 0 ? 'needs_connection' : 'needs_test',
        count: googleProfiles,
        detail: googleProfiles === 0 ? 'Connect Google Business from Settings after OAuth credentials are configured.' : 'Test location/review import and an authorized reply using a real account.',
      },
    ];

    return NextResponse.json({ checkedAt: new Date().toISOString(), checks, flows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check system readiness.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
