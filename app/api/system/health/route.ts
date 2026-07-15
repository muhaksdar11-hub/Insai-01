import crypto from "crypto";
import { NextResponse } from 'next/server';
import { healthCheckEngine, SystemHealth } from '@/lib/observability/health-check';
import { ApiResponse } from '@/types';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  try {
    const health = await healthCheckEngine.runHealthChecks();
    // Always return 200 and success: true so the frontend can read the detailed
    // service breakdown even if some services are offline.
    const response: ApiResponse<SystemHealth> = {
      success: true,
      data: health,
      error: null,
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'HEALTH_CHECK_ERROR', message: error.message || 'Unknown error' },
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(errorResponse, { status: 503 });
  }
}
