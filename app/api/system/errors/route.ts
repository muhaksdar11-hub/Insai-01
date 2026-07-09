import { NextResponse } from 'next/server';
import { errorTracker } from '@/lib/observability/error-tracker';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const recentErrors = errorTracker.getRecentErrors();
    const count24h = errorTracker.getErrorCountInLast24h();
    return NextResponse.json({
        recentErrors,
        count24h
    });
  } catch (error) {
    return NextResponse.json({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
