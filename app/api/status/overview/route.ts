import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getProviderRegistry } from '@/lib/market-data/provider-registry';
import { getMcpRegistry } from '@/lib/mcp/registry';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getQueueManager } from '@/lib/redis/queue';

export const dynamic = "force-dynamic";

export async function GET() {
  const healthData = getProviderRegistry().getAllHealth();
  const mcpData = getMcpRegistry().getAllStatus();
  
  const marketDataStatus = healthData.find(h => h.category === 'price')?.healthStatus || 'unavailable';
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
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
