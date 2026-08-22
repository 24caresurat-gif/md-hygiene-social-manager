import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'AI generation is not configured. Add OPENAI_API_KEY in Vercel environment variables.' }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const file = form.get('image');
    const prompt = String(form.get('prompt') || '').trim();
    const size = String(form.get('size') || '1024x1024');
    const n = Math.min(Math.max(Number(form.get('n')) || 1, 1), 2);

    if (!(file instanceof File) || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'A valid source image is required.' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Source image must be 20MB or smaller.' }, { status: 413 });
    }
    if (!prompt) return NextResponse.json({ error: 'Creative prompt is required.' }, { status: 400 });
    if (!SIZES.has(size)) return NextResponse.json({ error: 'Unsupported image size.' }, { status: 400 });

    const upstream = new FormData();
    upstream.append('model', 'gpt-image-2');
    upstream.append('image', file, file.name || 'source.png');
    upstream.append('prompt', `${prompt}\nPreserve the recognizable product identity from the source image. Do not invent claims, prices, certifications or contact details. Create a polished commercial social-media creative.`);
    upstream.append('size', size);
    upstream.append('n', String(n));
    upstream.append('quality', 'medium');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data?.error?.message || 'Image editing failed.' }, { status: response.status });
    }

    const images = (data.data || [])
      .map((item: { b64_json?: string; url?: string }) => item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url)
      .filter(Boolean);

    if (!images.length) return NextResponse.json({ error: 'The image provider returned no edited image.' }, { status: 502 });
    return NextResponse.json({ images, size, source: 'edit' });
  } catch (error) {
    console.error('creative edit error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Image editing failed.' }, { status: 500 });
  }
}
