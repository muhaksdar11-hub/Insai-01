import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getProviderRegistry } from '@/lib/market-data/provider-registry';
import { getMcpRegistry } from '@/lib/mcp/registry';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getQueueManager } from '@/lib/redis/queue';
import * as crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  const reqId = crypto.randomUUID();
  try {
    const healthData = getProviderRegistry().getAllHealth();
    const mcpData = getMcpRegistry().getAllStatus();
    
    const priceProviders = healthData.filter(h => h.category === 'price');
    const healthyPriceProviders = priceProviders.filter(h => h.healthStatus === 'ONLINE');
    
    let marketDataStatus = 'unavailable';
    if (healthyPriceProviders.length > 1) {
        marketDataStatus = 'hybrid_active';
    } else if (healthyPriceProviders.length === 1) {
        marketDataStatus = healthyPriceProviders[0].providerName;
    } else {
        marketDataStatus = priceProviders[0]?.healthStatus || 'unavailable';
    }
    
    const aiStatus = healthData.find(h => h.category === 'ai')?.healthStatus || 'unavailable';
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        marketData: marketDataStatus,
        aiValidation: aiStatus,
        database: getSupabaseClient().isConnected() ? 'connected' : 'not configured',
        mcp: mcpData.some(m => m.status === 'ONLINE') ? 'active' : 'not configured',
        queue: getQueueManager().isConnected() ? 'active' : 'unavailable'
      },
      error: null,
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };

    return NextResponse.json(response);
  } catch (err: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR', message: err.message },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

