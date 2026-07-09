import { NextResponse } from 'next/server';
import { logBuffer } from '@/lib/utils/logger';

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
      status: 'success',
      data: logBuffer
  });
}
