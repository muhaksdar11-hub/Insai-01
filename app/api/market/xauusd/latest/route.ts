import { NextResponse } from 'next/server';
import { ApiResponse, MarketSnapshot } from '@/types';
import { getMarketDataService } from '@/lib/market-data/market-data-service';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  let data: MarketSnapshot | null = null;
  let success = false;
  let error: { code: string; message: string; } | null = null;

  try {
    data = await getMarketDataService().getLatestPrice('XAUUSD');
    success = true;
  } catch (err: any) {
    error = {
      code: 'PROVIDER_ERROR',
      message: err.message || 'Failed to fetch price'
    };
  }

  const response: ApiResponse<MarketSnapshot | null> = {
    success,
    data,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
