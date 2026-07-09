import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getMcpRegistry } from '@/lib/mcp/registry';
import { getMcpManager } from '@/lib/mcp/mcp-manager';
import { PythonEngineManager } from '@/lib/mcp/engines/deployment';

export const dynamic = "force-dynamic";

export async function GET() {
  await getMcpManager().initialize();
  
  // Dynamically re-evaluate Python Engine to ensure honest status
  try {
      const result = await PythonEngineManager.evaluate();
      if (result.status === 'active') {
          await getMcpRegistry().reportConnected('Python Engine Manager');
      } else if (result.status === 'offline') {
          await getMcpRegistry().reportOffline('Python Engine Manager', result.message);
      } else {
          await getMcpRegistry().reportError('Python Engine Manager', result.message);
      }
  } catch (e: any) {
      await getMcpRegistry().reportOffline('Python Engine Manager', e.message);
  }

  const mcpStatus = await getMcpRegistry().getAllStatusAsync();

  const response: ApiResponse<any> = {
    success: true,
    data: mcpStatus,
    error: null,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
