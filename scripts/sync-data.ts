import { getSupabaseClient } from '../lib/supabase/client';
import { ForexFactoryProvider } from '../lib/market-data/providers/forexfactory';
import { YahooFinanceProvider } from '../lib/market-data/providers/yahoofinance';
import { logger } from '../lib/utils/logger';

async function checkShouldSync(): Promise<boolean> {
    const sb = getSupabaseClient().getClient();
    if (!sb) return false;
    try {
        const strats = await getSupabaseClient().getStrategies();
        if (Array.isArray(strats)) {
            return strats.some(s => s.enabled);
        }
    } catch (e) {
        return false;
    }
    return false;
}

async function syncForexFactory() {
    if (!(await checkShouldSync())) return;
    logger.info('Syncing ForexFactory calendar events...');
    const provider = new ForexFactoryProvider();
    
    try {
        const events = await provider.getCalendarEvents();
        const sb = getSupabaseClient().getClient();
        if (!sb) {
            logger.warn('Supabase not connected. Skipping save.');
            return;
        }

        // Example: Saving to a generic JSONB table or news_events
        for (const event of events) {
            // In a real scenario, you'd have a calendar_events table
            const { error } = await sb.from('news_events').upsert({
                event_key: `ff-${event.id}`,
                title: event.title,
                currency: event.country,
                impact: event.impact,
                provider: provider.name,
                payload_json: event,
                published_at: event.time
            }, { onConflict: 'event_key' });
            
            if (error) {
                logger.error(`Failed to save event ${event.id}: ${error.message}`);
            }
        }
        logger.info(`Synced ${events.length} events from ForexFactory.`);
    } catch (error: any) {
        logger.error(`ForexFactory sync failed: ${error.message}`);
    }
}

async function syncYahooFinance() {
    if (!(await checkShouldSync())) return;
    logger.info('Syncing YahooFinance XAUUSD price...');
    const provider = new YahooFinanceProvider();
    
    try {
        const snapshot = await provider.getLatestPrice('XAUUSD');
        const sb = getSupabaseClient().getClient();
        if (!sb) {
            logger.warn('Supabase not connected. Skipping save.');
            return;
        }

        const { error } = await sb.from('market_snapshots').upsert({
            symbol: 'XAUUSD',
            price: snapshot.price,
            provider: provider.name,
            timestamp: new Date().toISOString()
        });

        if (error) {
            logger.error(`Failed to save YahooFinance price: ${error.message}`);
        } else {
            logger.info(`Saved YahooFinance price: ${snapshot.price}`);
        }
    } catch (error: any) {
        logger.error(`YahooFinance sync failed: ${error.message}`);
    }
}

export async function runSyncJobs() {
    // Run initial sync
    await syncForexFactory();
    await syncYahooFinance();

    // Schedule Yahoo Finance every 1 minute
    setInterval(async () => {
        await syncYahooFinance();
    }, 60 * 1000);

    // Schedule ForexFactory every 1 hour
    setInterval(async () => {
        await syncForexFactory();
    }, 60 * 60 * 1000);
}

// If run directly
if (require.main === module) {
    runSyncJobs();
}
