import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ApiResponse } from '@/types';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = new Set([
  'TWELVEDATA_API_KEY',
  'NEWS_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'GEMINI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PYTHON_ENGINE_URL',
  'REDIS_URL'
]);

export async function POST(req: Request) {
  const reqId = crypto.randomUUID();
  try {
    const data = await req.json();
    logger.info('Config Save: Received request to update configuration');
    
    const isDev = process.env.NODE_ENV === 'development';
    let keysUpdated = 0;

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && ALLOWED_KEYS.has(key)) {
        const sanitizedValue = value.replace(/[\n\r]/g, '');
        process.env[key] = sanitizedValue; 
        logger.info(`Config Validation: Validated and applied update in memory for key: ${key}`);
        keysUpdated++;
      }
    }

    if (isDev && keysUpdated > 0) {
      const envPath = path.join(process.cwd(), '.env');
      let currentEnv = '';
      if (fs.existsSync(envPath)) {
        currentEnv = fs.readFileSync(envPath, 'utf8');
      }

      const envLines = currentEnv.split('\n');
      const envMap = new Map<string, string>();
      
      for (const line of envLines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...rest] = line.split('=');
          if (key) envMap.set(key.trim(), rest.join('=').trim());
        }
      }

      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string' && ALLOWED_KEYS.has(key)) {
          envMap.set(key, value.replace(/[\n\r]/g, ''));
        }
      }

      const newEnvLines = [];
      for (const line of envLines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key] = line.split('=');
          if (key && envMap.has(key.trim())) {
            newEnvLines.push(`${key.trim()}=${envMap.get(key.trim())}`);
            envMap.delete(key.trim());
          } else {
            newEnvLines.push(line);
          }
        } else {
          newEnvLines.push(line);
        }
      }

      for (const [key, value] of envMap.entries()) {
        if (ALLOWED_KEYS.has(key)) {
          newEnvLines.push(`${key}=${value}`);
        }
      }

      try {
        fs.writeFileSync(envPath, newEnvLines.join('\n'));
        logger.info(`Config Save: Successfully wrote ${keysUpdated} keys to .env file`);
      } catch (fsError: any) {
        logger.warn(`Config Save Error: Could not write to .env file (${fsError.message})`);
      }
    }

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: isDev ? 'Configuration saved to .env and memory.' : 'Configuration updated in memory only for this session. Update environment variables in your hosting provider to persist.' },
      error: null,
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(response);
  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'SAVE_ERROR', message: error.message },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
