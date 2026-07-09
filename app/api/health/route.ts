import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';

export const dynamic = "force-dynamic";

export async function GET() {
  const response: ApiResponse<any> = {
    success: true,
    data: {
      status: 'ok',
      version: '0.1.0'
    },
    error: null,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
