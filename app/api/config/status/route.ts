import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getEnv } from '@/lib/utils/env';
import { getMcpManager } from '@/lib/mcp/mcp-manager';
import { getMcpRegistry } from '@/lib/mcp/registry';
import { healthCheckEngine } from '@/lib/observability/health-check';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  await getMcpManager().revalidate();
  const health = await healthCheckEngine.runHealthChecks();
  const mcpStatus = getMcpRegistry().getAllStatus();

  const getMcpServiceStatus = (envKey: string, mcpName: string) => {
    if (!getEnv(envKey)) return 'not configured';
    const mcp = mcpStatus.find(m => m.name === mcpName);
    if (mcp && mcp.status === 'ONLINE') return 'configured';
    if (mcp && (mcp.status === 'UNAVAILABLE' || mcp.status === 'OFFLINE' || mcp.status === 'RATE LIMITED')) return 'error';
    if (mcp && mcp.status === 'NOT CONFIGURED') return 'not configured';
    return 'configured';
  };
  
  const getHealthServiceStatus = (envKey: string, healthName: string) => {
    if (!getEnv(envKey)) return 'not configured';
    const srv = health.services.find((s: any) => s.serviceName === healthName);
    if (srv && srv.status === 'ONLINE') return 'configured';
    if (srv && (srv.status === 'UNAVAILABLE' || srv.status === 'OFFLINE' || srv.status === 'RATE LIMITED')) return 'error';
    return 'configured';
  };

  const response: ApiResponse<any> = {
    success: true,
    data: {
      env: {
        gemini_api_key: getHealthServiceStatus('GEMINI_API_KEY', 'GeminiAI'),
        twelvedata_api_key: getMcpServiceStatus('TWELVEDATA_API_KEY', 'TwelveData'),
        polygon_api_key: getEnv('POLYGON_API_KEY') ? 'configured' : 'not configured',
        news_api_key: getMcpServiceStatus('NEWS_API_KEY', 'NewsAPI'),
        twitter_bearer_token: getMcpServiceStatus('TWITTER_BEARER_TOKEN', 'Twitter Bearer'),
        telegram_bot_token: getHealthServiceStatus('TELEGRAM_BOT_TOKEN', 'TelegramBot'),
        telegram_chat_id: getEnv('TELEGRAM_CHAT_ID') ? 'configured' : 'not configured',
        next_public_supabase_url: getHealthServiceStatus('NEXT_PUBLIC_SUPABASE_URL', 'Supabase'),
        supabase_service_role_key: getHealthServiceStatus('SUPABASE_SERVICE_ROLE_KEY', 'Supabase'),
        app_url: getEnv('APP_URL') ? 'configured' : 'not configured',
        redis_url: getEnv('REDIS_URL') ? 'configured' : 'not configured',
        python_engine_url: getHealthServiceStatus('PYTHON_ENGINE_URL', 'PythonEngine'),
      },
      lastChecked: new Date().toISOString()
    },
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
    error: null
  };

  return NextResponse.json(response);
}
