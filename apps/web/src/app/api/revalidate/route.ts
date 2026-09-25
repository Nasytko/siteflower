import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * Secured on-demand revalidation for published catalog/storefront content.
 * Requires header `x-revalidate-secret` matching REVALIDATE_SECRET.
 */

const MAX_TAGS = 20;
const MAX_PATHS = 20;
const MAX_TAG_LEN = 64;
const MAX_PATH_LEN = 200;
const MAX_BODY_BYTES = 8_192;
const TAG_PATTERN = /^[a-zA-Z0-9:_-]{1,64}$/;
const PATH_PATTERN = /^\/[a-zA-Z0-9/_-]{0,198}$/;

function safeEqualSecret(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'Revalidation is not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-revalidate-secret');
  if (!provided || !safeEqualSecret(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let body: { tags?: string[]; paths?: string[] } = {};
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    if (text.trim()) {
      body = JSON.parse(text) as { tags?: string[]; paths?: string[] };
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawTags = Array.isArray(body.tags) ? body.tags : ['catalog', 'storefront'];
  const rawPaths = Array.isArray(body.paths) ? body.paths : ['/', '/bukety'];

  if (rawTags.length > MAX_TAGS || rawPaths.length > MAX_PATHS) {
    return NextResponse.json({ error: 'Too many tags or paths' }, { status: 400 });
  }

  const tags: string[] = [];
  for (const tag of rawTags) {
    if (typeof tag !== 'string' || tag.length > MAX_TAG_LEN || !TAG_PATTERN.test(tag)) {
      return NextResponse.json({ error: 'Invalid tag' }, { status: 400 });
    }
    tags.push(tag);
  }

  const paths: string[] = [];
  for (const path of rawPaths) {
    if (
      typeof path !== 'string' ||
      path.length > MAX_PATH_LEN ||
      !PATH_PATTERN.test(path) ||
      path.includes('..') ||
      path.includes('//')
    ) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    paths.push(path);
  }

  for (const tag of tags) {
    revalidateTag(tag, 'max');
  }
  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json(
    { revalidated: true, tags, paths },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
