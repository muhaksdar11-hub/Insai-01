export const dynamic = "force-dynamic";
import { getEnv } from "@/lib/utils/env";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import jwt from 'jsonwebtoken';

export async function POST(req: Request) {
  try {
    const JWT_SECRET = getEnv("JWT_SECRET");
    const validUser = getEnv("ADMIN_USER");
    const validPass = getEnv("ADMIN_PASS");

    if (!JWT_SECRET || !validUser || !validPass) {
      return NextResponse.json({
        success: false,
        error: { message: 'Authentication is not configured securely on the server.' }
      }, { status: 500 });
    }

    const { username, password } = await req.json();

    if (username === validUser && password === validPass) {
      const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
      
      const response: ApiResponse<{ token: string }> = {
        success: true,
        data: { token },
        error: null,
        meta: {
          request_id: crypto.randomUUID(),
          timestamp: new Date().toISOString()
        }
      };

      const res = NextResponse.json(response);
      res.cookies.set('auth_token', token, {
        httpOnly: true,
        secure: getEnv("NODE_ENV") === 'production',
        sameSite: 'strict',
        maxAge: 86400 // 1 day
      });

      return res;
    } else {
      return NextResponse.json({
        success: false,
        error: { message: 'Invalid credentials' }
      }, { status: 401 });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: { message: 'Invalid request' }
    }, { status: 400 });
  }
}
