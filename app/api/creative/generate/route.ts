import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

async function requireUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await supabase.auth.getUser(token);
  return data.user || null;
}

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI generation is not configured. Add OPENAI_API_KEY in Vercel environment variables.' }, { status: 503 });

  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const body = await req.json();
    const prompt = String(body?.prompt || '').trim();
    const size = String(body?.size || '1024x1024');
    const n = Math.min(Math.max(Number(body?.n) || 1, 1), 2);
    if (!prompt) return NextResponse.json({ error: 'Creative prompt is required.' }, { status: 400 });
    if (!['1024x1024', '1024x1536', '1536x1024'].includes(size)) return NextResponse.json({ error: 'Unsupported image size.' }, { status: 400 });

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, size, n, quality: 'medium' }),
    });
    const data = await r.json();
    if (!r.ok) return NextResponse.json({ error: data?.error?.message || 'Image generation failed.' }, { status: r.status });
    return NextResponse.json({ images: (data.data || []).map((x: { b64_json?: string; url?: string }) => x.b64_json ? `data:image/png;base64,${x.b64_json}` : x.url).filter(Boolean) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Image generation failed.' }, { status: 500 });
  }
}
