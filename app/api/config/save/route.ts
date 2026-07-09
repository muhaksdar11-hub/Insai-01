import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ApiResponse } from '@/types';
import { logger } from '@/lib/utils/logger';

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
  try {
    const data = await req.json();
    logger.info('Config Save: Received request to update configuration');
    const envPath = path.join(process.cwd(), '.env');
    
    let currentEnv = '';
    if (fs.existsSync(envPath)) {
      currentEnv = fs.readFileSync(envPath, 'utf8');
      logger.info('Config Load: Successfully read existing .env file');
    } else {
      logger.info('Config Load: .env file does not exist. Creating a new one.');
    }

    const envLines = currentEnv.split('\n');
    const envMap = new Map<string, string>();

    // Parse current
    for (const line of envLines) {
      if (line.trim() && !line.startsWith('#')) {
        const [key, ...rest] = line.split('=');
        if (key) envMap.set(key.trim(), rest.join('=').trim());
      }
    }

    // Update
    let keysUpdated = 0;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        if (ALLOWED_KEYS.has(key)) {
          // Sanitize value (remove newlines to prevent injection)
          const sanitizedValue = value.replace(/[\n\r]/g, '');
          envMap.set(key, sanitizedValue);
          process.env[key] = sanitizedValue; // Update in current process memory
          logger.info(`Config Validation: Validated and applied update for key: ${key}`);
          keysUpdated++;
        } else {
          logger.warn(`Config Validation: Rejected update for unallowed key: ${key}`);
        }
      }
    }

    // Re-construct
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

    // Add remaining new keys
    for (const [key, value] of envMap.entries()) {
      if (ALLOWED_KEYS.has(key)) {
        newEnvLines.push(`${key}=${value}`);
      }
    }

    try {
      fs.writeFileSync(envPath, newEnvLines.join('\n'));
      logger.info(`Config Save: Successfully wrote ${keysUpdated} keys to .env file`);
    } catch (fsError: any) {
      logger.warn(`Config Save Error: Could not write to .env file (${fsError.message}), but process.env was updated in memory.`);
    }

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Configuration saved. Restart may be required for some services.' },
      error: null,
      meta: {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(response);
  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'SAVE_ERROR', message: error.message },
      meta: {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
