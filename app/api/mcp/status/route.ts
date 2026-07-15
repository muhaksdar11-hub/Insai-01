import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getMcpRegistry } from '@/lib/mcp/registry';
import { getMcpManager } from '@/lib/mcp/mcp-manager';
import { PythonEngineManager } from '@/lib/mcp/engines/deployment';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getMcpManager().initialize().catch(e => console.error("MCP Init error:", e));
    
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
      data: mcpStatus || [],
      error: null,
      meta: {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
    
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      data: [],
      error: { code: 'INTERNAL_ERROR', message: error.message },
      meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() }
    }, { status: 500 });
  }
}
