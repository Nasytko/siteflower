import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * Secured on-demand revalidation for published catalog/storefront content.
 * Requires header `x-revalidate-secret` matching REVALIDATE_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'Revalidation is not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-revalidate-secret');
  if (!provided || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { tags?: string[]; paths?: string[] } = {};
  try {
    body = (await request.json()) as { tags?: string[]; paths?: string[] };
  } catch {
    body = {};
  }

  const tags = body.tags?.length ? body.tags : ['catalog', 'storefront'];
  const paths = body.paths ?? ['/', '/bukety'];

  for (const tag of tags) {
    revalidateTag(tag, 'max');
  }
  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: true, tags, paths });
}

