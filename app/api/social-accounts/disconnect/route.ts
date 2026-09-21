import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body.accountId === 'string' ? body.accountId : '';
  if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 });

  const { data: account, error: findError } = await supabase
    .from('social_accounts')
    .select('id,platform,name')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 400 });
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  if (account.platform === 'google_business') {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Supabase service configuration is missing.' }, { status: 500 });
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: connectionError } = await admin.from('google_business_connections').delete().eq('social_account_id', accountId);
    if (connectionError) return NextResponse.json({ error: connectionError.message }, { status: 400 });
  }

  const { error } = await supabase
    .from('social_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, account });
}
