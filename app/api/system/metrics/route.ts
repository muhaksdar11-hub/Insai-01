import { NextResponse } from 'next/server';
import { metricsEngine } from '@/lib/observability/metrics-engine';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics = metricsEngine.getMetrics();
    return NextResponse.json(metrics);
  } catch (error) {
    return NextResponse.json({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
