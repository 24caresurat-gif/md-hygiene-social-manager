import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function authenticatedUser(request: Request): Promise<User> {
  const token = bearerToken(request);
  if (!token) throw new Error('Authentication required.');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');

  const sb = createClient(url, key, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid session.');
  return data.user;
}

export async function workspaceAccess(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
) {
  const [{ data: workspace, error: workspaceError }, { data: profile, error: profileError }, { data: membership, error: membershipError }] =
    await Promise.all([
      db.from('workspaces').select('id,owner_user_id').eq('id', workspaceId).maybeSingle(),
      db.from('profiles').select('role,active').eq('id', userId).maybeSingle(),
      db.from('workplace_members').select('role,active,employee_id').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle(),
    ]);

  if (workspaceError) throw workspaceError;
  if (profileError) throw profileError;
  if (membershipError) throw membershipError;
  if (!workspace) return null;

  const globalAdmin =
    profile?.active !== false &&
    ['admin', 'owner'].includes(String(profile?.role || '').toLowerCase());

  const memberActive = Boolean(membership?.active);
  const isOwner = workspace.owner_user_id === userId;
  const hasAccess = globalAdmin || isOwner || memberActive;
  const role = globalAdmin && !membership ? 'admin' : String(membership?.role || (isOwner ? 'owner' : 'member'));

  return {
    workspace,
    membership,
    globalAdmin,
    isOwner,
    memberActive,
    hasAccess,
    role,
    canManage: hasAccess && (globalAdmin || isOwner || ['owner', 'admin', 'manager'].includes(role.toLowerCase())),
  };
}


/**
 * Shared policy for direct "Publish now" actions.
 * Workspace owners/admins may publish immediately. Managers need both
 * approval review and publishing privileges; other roles use the approval queue.
 */
export async function authorizeImmediatePublishing(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const access = await workspaceAccess(db, userId, workspaceId);
  if (!access?.hasAccess) {
    return { allowed: false, reason: 'You do not have access to this workspace.' };
  }

  const role = String(access.role || '').toLowerCase();
  if (access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(role)) {
    return { allowed: true };
  }

  if (role !== 'manager') {
    return { allowed: false, reason: 'Immediate publishing is limited to workspace owners/admins or managers with approval and publishing permissions.' };
  }

  const { data: permissions, error } = await db
    .from('workspace_member_permissions')
    .select('module,can_approve,can_publish')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .in('module', ['approval', 'publishing']);
  if (error) throw error;

  const canApprove = (permissions || []).some((p: any) => p.module === 'approval' && p.can_approve === true);
  const canPublish = (permissions || []).some((p: any) => p.module === 'publishing' && p.can_publish === true);
  if (!canApprove || !canPublish) {
    return { allowed: false, reason: 'Managers need both approval.can_approve and publishing.can_publish to publish immediately.' };
  }
  return { allowed: true };
}
