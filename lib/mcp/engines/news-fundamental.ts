import { NewsEvent } from '@/types';

export class FinancialNewsEngine {
    static evaluate(news: NewsEvent[]) {
        if (!news || news.length === 0) return { status: 'empty', data: null };
        return { status: 'active', data: news };
    }
}

export class NewsSentimentEngine {
    static evaluate(news: NewsEvent[]) {
        if (!news || news.length === 0) return { status: 'empty', data: null, message: 'No news to analyze' };
        
        // Remove simple keyword counting and hardcoded scores.
        // Return raw news data to be evaluated by AI validator or real semantic engine.
        return { 
            status: 'active', 
            data: news,
            message: 'Sentiment evaluation deferred to AI validator'
        };
    }
}

export class MacroEventEngine {
    static evaluate(news: NewsEvent[]) {
        // Retain basic filtering for Macro indicators
        const macroKeywords = ['CPI', 'NFP', 'GDP', 'PMI', 'Retail Sales'];
        const macroNews = news.filter(n => macroKeywords.some(k => n.title.includes(k)));
        if (macroNews.length > 0) {
            return { status: 'active', data: macroNews };
        }
        return { status: 'empty', data: null };
    }
}

export class CentralBankEngine {
    static evaluate(news: NewsEvent[]) {
        const cbKeywords = ['FOMC', 'Powell', 'Fed', 'ECB', 'Lagarde', 'BOJ', 'BOE'];
        const cbNews = news.filter(n => cbKeywords.some(k => n.title.includes(k)));
        if (cbNews.length > 0) {
            return { status: 'active', data: cbNews };
        }
        return { status: 'empty', data: null };
    }
}

export class GeopoliticalRiskEngine {
    static evaluate(news: NewsEvent[]) {
        const geoKeywords = ['War', 'Conflict', 'Missile', 'Sanctions', 'Strike', 'Tension'];
        const geoNews = news.filter(n => geoKeywords.some(k => n.title.includes(k)));
        if (geoNews.length > 0) {
            return { status: 'active', data: geoNews };
        }
        return { status: 'empty', data: null };
    }
}

export class VolatilityNewsEngine {
    static evaluate(news: NewsEvent[]) {
        // High impact news that traditionally causes volatility
        const highImpact = news.filter(n => n.impact === 'high');
        if (highImpact.length > 0) {
            return { status: 'active', data: highImpact };
        }
        return { status: 'empty', data: null };
    }
}

export class NewsImpactSuppressionLayer {
    static evaluate(news: NewsEvent[], currentTime: string) {
        // Suppress trades if high impact news is within 15 minutes
        const highImpact = news.filter(n => n.impact === 'high');
        const now = new Date(currentTime).getTime();
        
        for (const event of highImpact) {
            const eventTime = new Date(event.publishedAt).getTime();
            const diffMin = Math.abs(eventTime - now) / 60000;
            if (diffMin <= 15) {
                return { status: 'suppressed', reason: 'High impact news within 15m window', event };
            }
        }
        return { status: 'clear', data: null };
    }
}
