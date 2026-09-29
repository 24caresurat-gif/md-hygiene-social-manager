import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';

export class WhatsAppHttpError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new WhatsAppHttpError('Supabase server credentials are not configured.', 500);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireWhatsAppAccess(
  request: Request,
  workspaceId: string,
  action: 'can_view' | 'can_create' | 'can_edit' | 'can_publish' | 'can_manage' = 'can_view'
) {
  if (!workspaceId) throw new WhatsAppHttpError('workspaceId is required.', 400);
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new WhatsAppHttpError('Missing authorization.', 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new WhatsAppHttpError('Supabase configuration is missing.', 500);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: 'Bearer ' + token } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new WhatsAppHttpError('Unauthorized.', 401);

  const user: User = data.user;
  const db = adminClient();
  const { data: workspace, error: workspaceError } = await db.from('workspaces').select('id,owner_user_id').eq('id', workspaceId).maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) throw new WhatsAppHttpError('Workspace not found.', 404);

  const owner = workspace.owner_user_id === user.id;
  const { data: member, error: memberError } = await db.from('workplace_members').select('role,active').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (memberError) throw memberError;
  if (!owner && (!member || !member.active)) throw new WhatsAppHttpError('You do not have access to this workspace.', 403);

  if (!owner && !['admin'].includes(member?.role || '')) {
    const { data: permission, error: permissionError } = await db.from('workspace_member_permissions')
      .select('can_view,can_create,can_edit,can_publish,can_manage')
      .eq('workspace_id', workspaceId).eq('user_id', user.id).eq('module', 'whatsapp').maybeSingle();
    if (permissionError) throw permissionError;
    if (!permission?.[action]) throw new WhatsAppHttpError('WhatsApp access is not enabled for your role in this workspace.', 403);
  }

  return { db, user, workspaceId, role: owner ? 'owner' : member?.role || 'member' };
}

export async function getActiveConnection(db: SupabaseClient, workspaceId: string) {
  const { data, error } = await db.from('whatsapp_connections')
    .select('id,workspace_id,waba_id,phone_number_id,display_phone_number,business_name,access_token,status')
    .eq('workspace_id', workspaceId).eq('status', 'connected')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function graphRequest(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch('https://graph.facebook.com/' + GRAPH_VERSION + '/' + path.replace(/^\//, ''), {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers || {}), Authorization: 'Bearer ' + accessToken },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new WhatsAppHttpError(payload?.error?.message || 'WhatsApp Graph API request failed.', response.status >= 500 ? 502 : 400, payload?.error?.code ? String(payload.error.code) : undefined);
  return payload;
}

export function jsonError(error: unknown) {
  if (error instanceof WhatsAppHttpError) return Response.json({ error: error.message, code: error.code || null }, { status: error.status });
  return Response.json({ error: error instanceof Error ? error.message : 'WhatsApp request failed.' }, { status: 500 });
}
