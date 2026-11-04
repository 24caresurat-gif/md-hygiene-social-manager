import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../lib/workspace-auth';

async function context(request: Request, workspaceId: string) {
  const user = await authenticatedUser(request);
  const db = adminDb();
  const access = await workspaceAccess(db, user.id, workspaceId);
  return { db, access };
}

export async function GET(request: Request) {
  try {
    const workspaceId = String(new URL(request.url).searchParams.get('workspaceId') || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });
    const { db, access } = await context(request, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    const [programs, members, transactions] = await Promise.all([
      db.from('loyalty_programs').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      db.from('loyalty_members').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      db.from('loyalty_transactions').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100)
    ]);
    if (programs.error) throw programs.error;
    if (members.error) throw members.error;
    if (transactions.error) throw transactions.error;
    return NextResponse.json({
      programs: programs.data || [],
      members: members.data || [],
      transactions: transactions.data || [],
      canManage: Boolean(access.canManage)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load loyalty data.';
    return NextResponse.json({ error: message }, { status: /Authentication|session|Invalid session/i.test(message) ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId || '').trim();
    const action = String(body.action || '').trim();
    if (!workspaceId || !action) return NextResponse.json({ error: 'workspaceId and action are required.' }, { status: 400 });
    const { db, access } = await context(request, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    if (!access.canManage) return NextResponse.json({ error: 'Workspace manager permission is required.' }, { status: 403 });

    if (action === 'create_program') {
      const name = String(body.name || '').trim();
      const rewardDescription = String(body.rewardDescription || '').trim();
      const stampsRequired = Number(body.stampsRequired);
      if (!name || !rewardDescription) return NextResponse.json({ error: 'Programme name and reward description are required.' }, { status: 400 });
      if (!Number.isInteger(stampsRequired) || stampsRequired < 1 || stampsRequired > 50) return NextResponse.json({ error: 'Stamps required must be between 1 and 50.' }, { status: 400 });
      const { data, error } = await db.from('loyalty_programs').insert({
        workspace_id: workspaceId,
        name,
        description: body.description ? String(body.description).trim() : null,
        stamps_required: stampsRequired,
        reward_description: rewardDescription,
        is_active: true
      }).select('*').single();
      if (error) throw error;
      return NextResponse.json({ program: data });
    }

    if (action === 'add_member') {
      const programId = String(body.programId || '').trim();
      const customerName = String(body.customerName || '').trim();
      const phone = String(body.phone || '').trim().replace(/[^0-9+]/g, '');
      if (!programId || !customerName || !phone) return NextResponse.json({ error: 'Programme, customer name and phone are required.' }, { status: 400 });
      const { data: program, error: programError } = await db.from('loyalty_programs').select('id,is_active').eq('id', programId).eq('workspace_id', workspaceId).maybeSingle();
      if (programError) throw programError;
      if (!program?.is_active) return NextResponse.json({ error: 'Choose an active loyalty programme.' }, { status: 400 });
      const { data, error } = await db.from('loyalty_members').insert({
        workspace_id: workspaceId, program_id: programId, customer_name: customerName, phone
      }).select('*').single();
      if (error) {
        if (error.code === '23505') return NextResponse.json({ error: 'This phone number is already enrolled in the selected programme.' }, { status: 409 });
        throw error;
      }
      return NextResponse.json({ member: data });
    }

    if (action === 'set_program_active') {
      const programId = String(body.programId || '').trim();
      if (!programId || typeof body.isActive !== 'boolean') return NextResponse.json({ error: 'programId and isActive are required.' }, { status: 400 });
      const { data, error } = await db.from('loyalty_programs').update({ is_active: body.isActive, updated_at: new Date().toISOString() })
        .eq('id', programId).eq('workspace_id', workspaceId).select('*').single();
      if (error) throw error;
      return NextResponse.json({ program: data });
    }

    if (action === 'stamp' || action === 'redeem') {
      const memberId = String(body.memberId || '').trim();
      if (!memberId) return NextResponse.json({ error: 'memberId is required.' }, { status: 400 });
      const rpc = action === 'stamp' ? 'loyalty_apply_stamp' : 'loyalty_redeem_reward';
      const { data, error } = await db.rpc(rpc, {
        p_workspace_id: workspaceId,
        p_member_id: memberId,
        p_note: body.note ? String(body.note).trim().slice(0, 500) : null
      });
      if (error) throw error;
      return NextResponse.json({ result: data });
    }

    return NextResponse.json({ error: 'Unsupported loyalty action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update loyalty data.';
    return NextResponse.json({ error: message }, { status: /Authentication|session|Invalid session/i.test(message) ? 401 : 500 });
  }
}
