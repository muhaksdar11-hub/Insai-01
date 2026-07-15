import { NextResponse } from 'next/server';
import { healthCheckEngine } from '@/lib/observability/health-check';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'readiness';
  
  if (type === 'liveness') {
     const response: ApiResponse<{ status: string }> = {
       success: true,
       data: { status: 'ok' },
       error: null,
       meta: { request_id: reqId, timestamp: new Date().toISOString() }
     };
     return NextResponse.json(response, { status: 200 });
  }

  // readiness check
  try {
    const health = await healthCheckEngine.runHealthChecks();
    // In Railway, 503 means the container is failing healthcheck and will be restarted.
    // So only return 503 if we are TRULY UNAVAILABLE across critical services.
    const statusCode = (health.status === 'UNAVAILABLE') ? 503 : 200;
    
    const response: ApiResponse<any> = {
      success: statusCode === 200,
      data: {
        status: health.status,
        services: health.services.map(s => ({ name: s.serviceName, status: s.status }))
      },
      error: statusCode === 503 ? { code: 'UNAVAILABLE', message: 'Service unavailable' } : null,
      meta: { request_id: reqId, timestamp: health.timestamp }
    };
    return NextResponse.json(response, { status: statusCode });
  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'HEALTH_CHECK_ERROR', message: error.message },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    // Return 200 even on error to prevent crash loops unless it's a known fatal error, 
    // but typically if we can't run health checks we might be completely broken.
    return NextResponse.json(errorResponse, { status: 503 });
  }
}
