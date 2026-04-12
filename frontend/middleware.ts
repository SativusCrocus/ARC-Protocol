import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    res.headers.set('X-RateLimit-Limit', '60');
  }
  return res;
}
