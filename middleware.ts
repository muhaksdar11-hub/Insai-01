import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Basic in-memory rate limit map (isolate-scoped)
const rateLimit = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;
const MAX_REQUESTS_API = 30; // Stricter for API routes

// Simple cleanup for memory leak prevention
let lastCleanup = Date.now();

export async function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const path = request.nextUrl.pathname;
  
  const now = Date.now();

  if (now - lastCleanup > 60000) {
    for (const [key, value] of rateLimit.entries()) {
      if (now > value.resetTime) {
        rateLimit.delete(key);
      }
    }
    // Hard limit on map size to prevent OOM
    if (rateLimit.size > 10000) {
      rateLimit.clear();
    }
    lastCleanup = now;
  }

  // Rate limiting logic
  const limit = path.startsWith('/api/') ? MAX_REQUESTS_API : MAX_REQUESTS_PER_WINDOW;
  
  const key = `${ip}:${path.startsWith('/api/') ? 'api' : 'web'}`;
  
  const current = rateLimit.get(key) ?? { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  
  if (now > current.resetTime) {
    current.count = 1;
    current.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    current.count++;
  }
  
  rateLimit.set(key, current);
  
  if (current.count > limit) {
    return new NextResponse(
      JSON.stringify({ error: 'Too Many Requests', message: 'Rate limit exceeded.' }),
      { 
        status: 429, 
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((current.resetTime - now) / 1000).toString()
        } 
      }
    );
  }
  
  // Auth check for state modifying and admin API routes
  const isProtectedApi = 
    // Protect sensitive GET endpoints
    (request.method === 'GET' && (
      path.startsWith('/api/admin/') ||
      path.startsWith('/api/system/logs')
    )) ||
    // Protect ALL mutating requests globally, except auth
    (
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && 
      !path.startsWith('/api/auth/')
    );

  // Allow health check to be public
  if (path === '/api/system/health' || path === '/api/mcp/status' || path === '/api/health') {
    // Health and MCP status remain public for monitoring tools
  } else if (isProtectedApi) {
    const authHeader = request.headers.get('authorization');
    const adminKey = process.env.ADMIN_API_KEY;
    const authToken = request.cookies.get('auth_token')?.value;
    
    // If auth is not configured at all, allow access (open mode)
    if (!adminKey && !process.env.JWT_SECRET) {
        return NextResponse.next();
    }
    
    let isAuthenticated = false;

    // Check API Key
    if (adminKey && authHeader === `Bearer ${adminKey}`) {
      isAuthenticated = true;
    }

    // Check JWT Token
    if (!isAuthenticated && authToken && process.env.JWT_SECRET) {
      try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(authToken, secret);
        if (payload && payload.role === 'admin') {
          isAuthenticated = true;
        }
      } catch (err) {
        console.error('JWT verification failed in middleware:', err);
      }
    }

    if (!isAuthenticated) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing authentication' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
