import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';

export function validateEnvironment(): void {
    const requiredVars = [
        'GEMINI_API_KEY',
    ];

    const recommendedVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'TWELVEDATA_API_KEY',
        'NEWS_API_KEY',
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_CHAT_ID',
        'REDIS_URL',
        'PYTHON_ENGINE_URL'
    ];

    const missingRequired = requiredVars.filter(v => !getEnv(v));
    const missingRecommended = recommendedVars.filter(v => !getEnv(v));

    if (missingRequired.length > 0) {
        logger.warn(`CRITICAL: Missing required environment variables: ${missingRequired.join(', ')}`);
        logger.warn('System will start in DEGRADED mode.');
    }

    if (missingRecommended.length > 0) {
        logger.warn(`Missing recommended environment variables: ${missingRecommended.join(', ')}`);
        logger.warn('System will start in DEGRADED mode or feature-limited mode if these are not provided.');
    }

    if (missingRequired.length === 0 && missingRecommended.length === 0) {
        logger.info('Environment validation passed.');
    }
}
