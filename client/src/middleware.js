import { NextResponse } from 'next/server';

const PUBLIC_PATHS = new Set([
  '/',
  '/docs',
  '/login',
  '/register',
  '/forgot-password',
  '/opt',
  '/reset-password',
]);

const matchesPath = (pathname, path) => pathname === path || pathname.startsWith(`${path}/`);

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const isAuthenticated = request.cookies.get('ridgeway_auth')?.value === '1';
  if (!isAuthenticated) return NextResponse.redirect(new URL('/login', request.url));

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
