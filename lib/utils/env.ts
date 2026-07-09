import fs from 'fs';
import path from 'path';

let envCache: Record<string, string> = {};
let lastMtime = 0;

export function getEnv(key: string): string | undefined {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const stats = fs.statSync(envPath);
      if (stats.mtimeMs > lastMtime) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.trim() && !line.startsWith('#')) {
            const [k, ...rest] = line.split('=');
            if (k) {
              let val = rest.join('=').trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.substring(1, val.length - 1);
              }
              envCache[k.trim()] = val;
              process.env[k.trim()] = val; // sync to process.env
            }
          }
        }
        lastMtime = stats.mtimeMs;
      }
    }
  } catch (e) {
    // ignore
  }
  
  let val = process.env[key] || envCache[key];
  if (val) {
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
  }
  return val;
}
