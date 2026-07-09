import { NextResponse } from 'next/server';
import { healthCheckEngine, SystemHealth } from '@/lib/observability/health-check';
import { ApiResponse } from '@/types';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await healthCheckEngine.runHealthChecks();
    // Return 200 for everything except UNAVAILABLE/OFFLINE which indicate total failure
    const isHealthy = health.status !== 'UNAVAILABLE' && health.status !== 'OFFLINE';
    const status = isHealthy ? 200 : 503;
    const response: ApiResponse<SystemHealth> = {
      success: isHealthy,
      data: health,
      error: isHealthy ? null : { code: 'HEALTH_CHECK_FAILED', message: 'System or critical dependency is unavailable' },
      meta: {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(response, { status });
  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'HEALTH_CHECK_ERROR', message: error.message || 'Unknown error' },
      meta: {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
