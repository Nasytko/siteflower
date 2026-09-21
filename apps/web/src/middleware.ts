import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/admin/login';
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (!isAdmin) {
    return NextResponse.next();
  }

  const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001';
  const meResponse = await fetch(`${apiUrl}/api/v1/admin/auth/me`, {
    headers: {
      cookie: request.headers.get('cookie') ?? '',
    },
    cache: 'no-store',
  });

  const authenticated = meResponse.ok;

  if (!authenticated && !isLogin) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && isLogin) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
