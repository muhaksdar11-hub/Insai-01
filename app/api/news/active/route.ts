import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getMarketDataService } from '@/lib/market-data/market-data-service';

export const dynamic = "force-dynamic";

export async function GET() {
  let active_events: any[] = [];
  let success = false;
  let error = null;

  let providerStatus: any = undefined;

  try {
    const result = await getMarketDataService().getLatestNews();
    active_events = result;
    if ((result as any).status) {
      providerStatus = {
        status: (result as any).status,
        available: (result as any).available,
        reason: (result as any).reason
      };
    }
    success = true;
  } catch (err: any) {
    error = { code: 'FETCH_ERROR', message: err.message };
  }

  const response: ApiResponse<any> = {
    success,
    data: {
      active_events,
      ...providerStatus
    },
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
